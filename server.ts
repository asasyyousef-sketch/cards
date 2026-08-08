import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { initialFolders, initialCards } from "./src/data/seed";
import { getSupabase, SUPABASE_SQL_SCHEMA } from "./src/supabaseClient";
import { GoogleGenAI, Type } from "@google/genai";

function extractRateLimitHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (
        k.includes("ratelimit") ||
        k.includes("quota") ||
        k.includes("limit") ||
        k.includes("remaining") ||
        k.includes("reset") ||
        k.includes("requests") ||
        k.includes("tokens")
      ) {
        result[key] = value;
      }
    });
  } catch (e) {
    console.error("Error extracting rate limit headers:", e);
  }
  return result;
}

// Global cache for actual intercepted rate limits of AI providers
const globalRateLimitsCache = {
  gemini: null as any,
  groq: null as any,
  lastUpdated: null as string | null
};


// Detect base directory path safely for both ESM (development) and CommonJS (bundled production) environments
let resolvedDirname = process.cwd();

try {
  // ESM environment detection (like tsx in local development)
  if (typeof import.meta !== "undefined" && import.meta.url) {
    resolvedDirname = path.dirname(fileURLToPath(import.meta.url));
  } else if (typeof __dirname !== "undefined") {
    // CommonJS environment detection (like the compiled dist/server.cjs bundle on Railway)
    resolvedDirname = __dirname;
  }
} catch (e) {
  // Safe fallback to current working directory
  resolvedDirname = process.cwd();
}

interface UsageLog {
  timestamp: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  provider: string;
}

function loadUsageLogs(): UsageLog[] {
  try {
    const filePath = path.join(process.cwd(), "ai_usage_logs.json");
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8").trim();
      if (!data) {
        return [];
      }
      try {
        return JSON.parse(data);
      } catch (parseErr) {
        // Heal corrupt file
        try {
          fs.writeFileSync(filePath, "[]", "utf-8");
        } catch (writeErr) {
          // ignore write errors here
        }
        return [];
      }
    }
  } catch (e) {
    console.error("Failed to load usage logs due to read error:", e);
  }
  return [];
}

function saveUsageLogs(logs: UsageLog[]) {
  try {
    const filePath = path.join(process.cwd(), "ai_usage_logs.json");
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save usage logs:", e);
  }
}

function addUsageLog(promptTokens: number, completionTokens: number, totalTokens: number, provider: string) {
  try {
    const logs = loadUsageLogs();
    logs.push({
      timestamp: new Date().toISOString(),
      promptTokens: promptTokens || 0,
      completionTokens: completionTokens || 0,
      totalTokens: totalTokens || 0,
      provider
    });
    // Keep logs within 24 hours + some buffer
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const filtered = logs.filter(l => new Date(l.timestamp).getTime() > cutoff);
    saveUsageLogs(filtered);
  } catch (e) {
    console.error("Failed to add usage log:", e);
  }
}

function getSlidingWindowStatus() {
  try {
    const logs = loadUsageLogs();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    // Filter logs in the last 24 hours
    const activeLogs = logs.filter(l => new Date(l.timestamp).getTime() >= oneDayAgo);
    
    let totalTokens24h = 0;
    let totalRequests24h = 0;
    for (const log of activeLogs) {
      totalTokens24h += (log.totalTokens || 0);
      totalRequests24h += 1;
    }
    
    const tokenLimit = 100000;
    const requestLimit = 1000;
    
    const isBlocked = totalTokens24h >= tokenLimit || totalRequests24h >= requestLimit;
    
    let resetInSeconds = 0;
    if (isBlocked && activeLogs.length > 0) {
      const oldestTimestamp = new Date(activeLogs[0].timestamp).getTime();
      const timePassedSinceOldest = now - oldestTimestamp;
      resetInSeconds = Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - timePassedSinceOldest) / 1000));
    }
    
    let resetInFormatted = "";
    if (resetInSeconds > 0) {
      const hours = Math.floor(resetInSeconds / 3600);
      const minutes = Math.floor((resetInSeconds % 3600) / 60);
      const seconds = resetInSeconds % 60;
      if (hours > 0) {
        resetInFormatted = `${hours}h${minutes}m`;
      } else if (minutes > 0) {
        resetInFormatted = `${minutes}m${seconds}s`;
      } else {
        resetInFormatted = `${seconds}s`;
      }
    } else {
      resetInFormatted = "0s";
    }
    
    return {
      totalTokens24h,
      totalRequests24h,
      tokenLimit,
      requestLimit,
      isBlocked,
      resetInSeconds,
      resetInFormatted,
      activeLogs
    };
  } catch (e) {
    console.error("Error calculating sliding window status:", e);
    return {
      totalTokens24h: 0,
      totalRequests24h: 0,
      tokenLimit: 100000,
      requestLimit: 1000,
      isBlocked: false,
      resetInSeconds: 0,
      resetInFormatted: "0s",
      activeLogs: []
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Enable CORS middleware for absolute localhost:3000 calls from custom frontend ports
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  const DB_PATH = path.join(process.cwd(), "db.json");
  const OLD_DB_PATH = path.join(process.cwd(), "src", "data", "db.json");

  // Migrate old db.json if it exists
  if (!fs.existsSync(DB_PATH) && fs.existsSync(OLD_DB_PATH)) {
    try {
      fs.copyFileSync(OLD_DB_PATH, DB_PATH);
      console.log("⚡ [Data Migration] Migrated src/data/db.json to root db.json successfully!");
    } catch (err) {
      console.error("❌ [Data Migration Failure]", err);
    }
  }

  // Ensure data directory exists (just in case)
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize DB with seed data if empty
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify({ folders: initialFolders, cards: initialCards }, null, 2),
      "utf-8"
    );
  }

  // Print SQL schema helper on startup if Supabase is active
  const startSupabase = getSupabase();
  if (startSupabase) {
    console.log("\n==================================================");
    console.log("⚡ SUPABASE INTEGRATION IS ACTIVE!");
    console.log("Please copy-paste the following SQL script into your Supabase SQL Editor to set up tables:\n");
    console.log(SUPABASE_SQL_SCHEMA.trim());
    console.log("==================================================\n");
  } else {
    console.log("\n💡 Supabase is running in local fallback mode (default placeholders are set). To enable real-time cloud sync, replace the placeholders in /.env with your real Supabase credentials!\n");
  }

  // API Route - Get Flashcard Data
  app.get("/api/duckduckgo-images", async (req, res) => {
    const query = (req.query.q as string || "avatar portrait").trim();
    try {
      // 1. Fetch DuckDuckGo search page to extract vqd token
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      const pageRes = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9,ar;q=0.8"
        }
      });
      
      let vqd = "";
      if (pageRes.ok) {
        const html = await pageRes.text();
        const match = html.match(/vqd=['"]?([^'"&]+)/) || html.match(/vqd=([0-9-]+)/);
        if (match) {
          vqd = match[1];
        }
      }

      let images: any[] = [];
      if (vqd) {
        const imgApiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`;
        const imgRes = await fetch(imgApiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": "https://duckduckgo.com/"
          }
        });
        if (imgRes.ok) {
          const data = await imgRes.json();
          if (data.results && Array.isArray(data.results)) {
            images = data.results.slice(0, 18).map((item: any) => ({
              title: item.title || query,
              image: item.image,
              thumbnail: item.thumbnail || item.image,
              source: item.url || item.image
            }));
          }
        }
      }

      // If DuckDuckGo returned no images or failed, construct high quality Unsplash portraits
      if (images.length === 0) {
        images = [
          { title: `${query} 1`, image: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80` },
          { title: `${query} 2`, image: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80` },
          { title: `${query} 3`, image: `https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80` },
          { title: `${query} 4`, image: `https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80` },
          { title: `${query} 5`, image: `https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80` },
          { title: `${query} 6`, image: `https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80` },
          { title: `${query} 7`, image: `https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80` },
          { title: `${query} 8`, image: `https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=500&q=80`, thumbnail: `https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80` }
        ];
      }

      return res.json({ success: true, query, results: images });
    } catch (e: any) {
      console.error("DuckDuckGo image search error:", e);
      return res.json({
        success: true,
        query,
        results: [
          { title: "Avatar 1", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80", thumbnail: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80" },
          { title: "Avatar 2", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80", thumbnail: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80" },
          { title: "Avatar 3", image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80", thumbnail: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80" }
        ]
      });
    }
  });

  // API Route - Generate AI Persona details & image query automatically
  app.post("/api/generate-persona-ai", async (req, res) => {
    try {
      const { prompt, userApiKey, geminiApiKey, customApiKey, selectedModel } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "يرجى كتابة وصف للشخصية المراد إنشاؤها." });
      }

      const effectiveGeminiKey = (userApiKey && userApiKey.trim()) || (geminiApiKey && geminiApiKey.trim()) || (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY || "";
      if (!effectiveGeminiKey) {
        return res.status(400).json({ error: "مفتاح Gemini API غير متوفر. يرجى توفير مفتاح في الإعدادات." });
      }

      const targetModel = (selectedModel && selectedModel.trim()) || "gemini-3.6-flash";
      const ai = new GoogleGenAI({ apiKey: effectiveGeminiKey });

      const systemInstruction = `أنت خبير محترف في بناء شخصيات التفاعل والمحاكاة لتعلم اللغات وتصميم السيناريوهات اليومية.
الطلب من المستخدم لبناء الشخصية:
"${prompt.trim()}"

قم بتحليل تفاصيل الشخصية المطلوبة بعناية شديدة وفق القواعد التالية:
1. تحديد العمر بدقة والالتزام بخصائص هذا العمر (مثال: إذا كتب طفلة 15 سنة، تكون المهنة طالبة، والعمر 15 سنة، ونبرة الكلام حيوية ومرحة وتستخدم لغة الشباب اليومية مع اهتمامات تناسب الفتيات بعمر 15 كالتقنية والدراسة والهوايات).
2. إذا كتب "رئيس" أو "مدير شركة" أو غيرها، مولّد حقول رسمية واحترافية تناسب قائد أو رئيس بخبرة واهتمامات إدارية واستراتيجية.
3. التمييز الدقيق بين الذكر والأنثى حسب صياغة برومبت المستخدم (مثال: بائعة -> أنثى، دكتورة -> أنثى، طبيب -> ذكر، رئيس -> ذكر، رئيسة -> أنثى).
4. تحديد صلة القرابة أو العلاقة بالمستخدم (relationship) إن وجدت أو ألمح إليها المستخدم (مثال: "صديقة ألمانية"، "جارك في البناية"، "أختك الصغرى"، "زميل عمل"، "طبيبك الخاص"). إذا لم تكن هناك صلة قرابة أو كانت مهنة عامة (مثل طبيب عام أو بائع محدد بدون علاقة)، اجعل هذا الحقل فارغاً "".
5. إنشاء عبارة بحث صور إنجليزية دقيقة للغاية (imageSearchQuery) لجلب صورة بورتريه حقيقية ومطابقة للجنس والعمر والوظيفة عبر محرك البحث (مثال: "15 year old teenage girl smiling portrait photo", "female doctor smiling professional portrait", "male corporate CEO business portrait photo").

قم بإرجاع كائن JSON حصري يحتوي على المفاتيح التالية:
- name: اسم مناسب وواقعي للشخصية.
- job: المهنة أو الدور بدقة.
- age: العمر مع الوحدة (مثال: "15 سنة"، "42 سنة").
- origin: المدينة والبلد المناسب للموقف.
- relationship: صلة القرابة أو العلاقة بالمتحدث/المستخدم (مثال: "صديقة ألمانية"، "أختك"، "جارك"، أو اتركه فارغاً "" إن لم تكن هناك صلة).
- toneStyle: أسلوب ونبرة الكلام المتناسبة تماماً مع عمر الشخصية ودورها والعلاقة.
- backgroundTopics: الاهتمامات والخلفية والمواضيع المتقنة التي تفضل الشخصية الحديث عنها.
- emoji: رمز إيموجي تعبيري يمثل الشخصية (مثال: 👧, 👨‍💼, 👩‍⚕️, 👨‍🍳).
- imageSearchQuery: عبارة بحث دقيقة جداً باللغة الإنجليزية للبحث عن صورة بورتريه حقيقية ومطابقة للجنس والعمر والمهنة عبر DuckDuckGo.

تنسيق الاستجابة JSON حصري بدون أي نصوص أو شروحات خارج نطاق الـ JSON.`;

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json"
        }
      });

      const outputText = response.text || "";
      let personaData: any = {};
      try {
        personaData = JSON.parse(outputText);
      } catch (err) {
        const clean = outputText.replace(/```json/g, "").replace(/```/g, "").trim();
        personaData = JSON.parse(clean);
      }

      // Automatically search for a matching portrait image on DuckDuckGo using imageSearchQuery
      let avatarUrl = personaData.emoji || "🎭";
      let imageQuery = personaData.imageSearchQuery || `${personaData.job || "portrait"} ${personaData.name || "person"}`;

      try {
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(imageQuery)}`;
        const pageRes = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,ar;q=0.8"
          }
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const match = html.match(/vqd=['"]?([^'"&]+)/) || html.match(/vqd=([0-9-]+)/);
          if (match && match[1]) {
            const vqd = match[1];
            const imgApiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(imageQuery)}&vqd=${vqd}&f=,,,`;
            const imgRes = await fetch(imgApiUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "Referer": "https://duckduckgo.com/"
              }
            });
            if (imgRes.ok) {
              const data = await imgRes.json();
              if (data.results && Array.isArray(data.results) && data.results.length > 0) {
                const firstValid = data.results.find((item: any) => item.image && item.image.startsWith("http"));
                if (firstValid) {
                  avatarUrl = firstValid.image;
                }
              }
            }
          }
        }
      } catch (imgErr) {
        console.warn("Automated portrait image search fallback:", imgErr);
      }

      const formatStringValue = (val: any): string => {
        if (typeof val === "string") return val;
        if (Array.isArray(val)) return val.map(v => String(v)).join("، ");
        if (val !== null && val !== undefined) return String(val);
        return "";
      };

      return res.json({
        success: true,
        persona: {
          name: formatStringValue(personaData.name) || "شخصية جديدة",
          job: formatStringValue(personaData.job),
          age: formatStringValue(personaData.age),
          origin: formatStringValue(personaData.origin),
          relationship: formatStringValue(personaData.relationship),
          toneStyle: formatStringValue(personaData.toneStyle),
          backgroundTopics: formatStringValue(personaData.backgroundTopics),
          avatar: avatarUrl,
          emoji: formatStringValue(personaData.emoji) || "🎭",
          imageSearchQuery: imageQuery
        }
      });
    } catch (error: any) {
      console.error("Error generating persona AI:", error);
      return res.status(500).json({ error: error.message || "حدث خطأ أثناء توليد الشخصية بالذكاء الاصطناعي." });
    }
  });

  // API Route - Get Flashcard Data
  app.get("/api/data", async (req, res) => {
    let dbStatus = {
      supabaseActive: false,
      tablesExist: false,
      error: null as string | null
    };

    try {
      const supabase = getSupabase();
      if (supabase) {
        dbStatus.supabaseActive = true;
        console.log("[Supabase] Attempting to load data from Supabase...");
        
        const { data: decks, error: decksErr } = await supabase.from('decks').select('*').order('position', { ascending: true });
        const { data: cards, error: cardsErr } = await supabase.from('cards').select('*').order('position', { ascending: true });

        if (decksErr || cardsErr) {
          const err = decksErr || cardsErr;
          console.warn("[Supabase] Database error fetching data:", err.message);
          dbStatus.tablesExist = false;
          dbStatus.error = err.message;
          if (err.code === "42P01" || err.message?.includes("relation") || err.message?.includes("does not exist")) {
            console.warn("⚠️ [Supabase Warning] Table relation not found! Please run the SQL schema in your Supabase dashboard.");
          }
          console.log("[Supabase Fallback] Falling back to local db.json file.");
        } else if (decks && cards) {
          dbStatus.tablesExist = true;
          // If the tables exist but are empty, seed them automatically
          if (decks.length === 0 && cards.length === 0) {
            console.log("[Supabase Seeding] Supabase database is empty. Seeding with initial dataset...");
            
            // Ingest to Supabase
            // 1. First pass: decks with parentId = null
            const decksNoParent = initialFolders.map((f: any, index: number) => ({
              id: f.id,
              parentId: null,
              name: f.name,
              description: f.description || null,
              color: f.color,
              coverImage: f.coverImage || null,
              coverImagePosition: f.coverImagePosition || '50% 50%',
              frontLang: f.frontLang,
              backLang: f.backLang,
              position: index,
              createdAt: f.createdAt || new Date().toISOString(),
              updatedAt: f.updatedAt || new Date().toISOString()
            }));
            await supabase.from('decks').upsert(decksNoParent);

            // 2. Second pass: decks with actual parentId values
            const decksWithParent = initialFolders.map((f: any, index: number) => ({
              id: f.id,
              parentId: f.parentId || null,
              name: f.name,
              description: f.description || null,
              color: f.color,
              coverImage: f.coverImage || null,
              coverImagePosition: f.coverImagePosition || '50% 50%',
              frontLang: f.frontLang,
              backLang: f.backLang,
              position: index,
              createdAt: f.createdAt || new Date().toISOString(),
              updatedAt: f.updatedAt || new Date().toISOString()
            }));
            await supabase.from('decks').upsert(decksWithParent);

            // 3. Insert cards
            const cardsToInsert = initialCards.map((c: any, index: number) => ({
              id: c.id,
              folderId: c.folderId,
              frontText: c.frontText,
              frontLang: c.frontLang,
              frontImage: c.frontImage || null,
              frontImagePosition: c.frontImagePosition || '50% 50%',
              frontAudioUrl: c.frontAudioUrl || null,
              backText: c.backText,
              backLang: c.backLang,
              backImage: c.backImage || null,
              backImagePosition: c.backImagePosition || '50% 50%',
              backAudioUrl: c.backAudioUrl || null,
              isArticleMode: c.isArticleMode || false,
              correctArticle: c.correctArticle || '',
              isPluralMode: c.isPluralMode || false,
              pluralText: c.pluralText || '',
              pluralLang: c.pluralLang || 'de',
              translationHint: c.translationHint || null,
              streak: c.streak || 0,
              difficulty: c.difficulty || 'medium',
              position: index,
              createdAt: c.createdAt || new Date().toISOString()
            }));
            await supabase.from('cards').upsert(cardsToInsert);

            console.log("[Supabase Seeding] Seeding completed successfully!");
            return res.json({ folders: initialFolders, cards: initialCards, dbStatus });
          }

          // Return successful mapping
          const mappedFolders = decks.map((d: any) => ({
            id: d.id,
            parentId: d.parentId || undefined,
            name: d.name,
            description: d.description || undefined,
            color: d.color,
            coverImage: d.coverImage || undefined,
            coverImagePosition: d.coverImagePosition || undefined,
            frontLang: d.frontLang,
            backLang: d.backLang,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          }));

          const mappedCards = cards.map((c: any) => ({
            id: c.id,
            folderId: c.folderId,
            frontText: c.frontText,
            frontLang: c.frontLang,
            frontImage: c.frontImage || undefined,
            frontImagePosition: c.frontImagePosition || undefined,
            frontAudioUrl: c.frontAudioUrl || undefined,
            backText: c.backText,
            backLang: c.backLang,
            backImage: c.backImage || undefined,
            backImagePosition: c.backImagePosition || undefined,
            backAudioUrl: c.backAudioUrl || undefined,
            isArticleMode: c.isArticleMode ?? false,
            correctArticle: c.correctArticle || undefined,
            isPluralMode: c.isPluralMode ?? false,
            pluralText: c.pluralText || undefined,
            pluralLang: c.pluralLang || undefined,
            translationHint: c.translationHint || undefined,
            streak: c.streak || 0,
            difficulty: c.difficulty || undefined,
            createdAt: c.createdAt
          }));

          console.log(`[Supabase] Loaded ${mappedFolders.length} folders and ${mappedCards.length} cards.`);
          let transcripts: any[] = [];
          try {
            if (fs.existsSync(DB_PATH)) {
              const fileContent = fs.readFileSync(DB_PATH, "utf-8");
              const parsed = JSON.parse(fileContent);
              transcripts = parsed.transcripts || [];
            }
          } catch (e) {
            console.error("Failed to load transcripts in Supabase success path:", e);
          }
          return res.json({ folders: mappedFolders, cards: mappedCards, transcripts, dbStatus });
        }
      } else {
        dbStatus.error = "Supabase not configured in .env";
      }
    } catch (supabaseErr) {
      console.error("[Supabase GET Error]", supabaseErr);
      dbStatus.error = (supabaseErr as Error).message;
    }

    // Fallback to local db.json
    try {
      if (fs.existsSync(DB_PATH)) {
        const fileContent = fs.readFileSync(DB_PATH, "utf-8");
        const parsed = JSON.parse(fileContent);
        res.json({ folders: parsed.folders, cards: parsed.cards, transcripts: parsed.transcripts || [], dbStatus });
      } else {
        res.json({ folders: initialFolders, cards: initialCards, transcripts: [], dbStatus });
      }
    } catch (err) {
      console.error("Failed to read DB", err);
      res.json({ folders: initialFolders, cards: initialCards, transcripts: [], dbStatus });
    }
  });

  // API Route - Save Flashcard Data
  app.post("/api/data", async (req, res) => {
    const folders = req.body.folders || [];
    const cards = req.body.cards || [];
    const transcripts = req.body.transcripts || [];
    
    let dbStatus = {
      supabaseActive: false,
      tablesExist: false,
      error: null as string | null
    };

    // Always save locally as a backup/mirror immediately
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify({ folders, cards, transcripts }, null, 2), "utf-8");
      console.log("[Local DB] Saved to local db.json mirroring file with transcripts.");
    } catch (err) {
      console.error("Failed to save local DB backup", err);
    }

    try {
      const supabase = getSupabase();
      if (supabase) {
        dbStatus.supabaseActive = true;
        dbStatus.tablesExist = true; // Optimistic status for immediate response

        // Kick off Supabase sync in the background without blocking the HTTP response
        (async () => {
          try {
            console.log("[Supabase Background Sync] Starting background synchronization...");

            // 1. Check if tables actually exist before trying to read/write
            const { data: testDecks, error: dbDecksErr } = await supabase.from('decks').select('id').limit(1);
            const { data: testCards, error: dbCardsErr } = await supabase.from('cards').select('id').limit(1);

            if (dbDecksErr || dbCardsErr) {
              const err = dbDecksErr || dbCardsErr;
              console.warn("⚠️ [Supabase Background Sync Blocked] Table 'decks' or 'cards' not found or inaccessible:", err ? err.message : "Table not found");
              return;
            }

            // Fetch all IDs to identify which records were deleted
            const { data: dbDecks } = await supabase.from('decks').select('id');
            const { data: dbCards } = await supabase.from('cards').select('id');

            const activeDeckIds = new Set(folders.map((f: any) => f.id));
            const activeCardIds = new Set(cards.map((c: any) => c.id));

            if (dbCards) {
              const cardsToDelete = dbCards.filter((c: any) => !activeCardIds.has(c.id)).map((c: any) => c.id);
              if (cardsToDelete.length > 0) {
                console.log(`[Supabase Background Sync] Deleting ${cardsToDelete.length} obsolete cards...`);
                await supabase.from('cards').delete().in('id', cardsToDelete);
              }
            }

            if (dbDecks) {
              const decksToDelete = dbDecks.filter((d: any) => !activeDeckIds.has(d.id)).map((d: any) => d.id);
              if (decksToDelete.length > 0) {
                console.log(`[Supabase Background Sync] Deleting ${decksToDelete.length} obsolete decks...`);
                // To prevent parent reference locks, set their parentId to null first
                await supabase.from('decks').update({ parentId: null }).in('id', decksToDelete);
                await supabase.from('decks').delete().in('id', decksToDelete);
              }
            }

            // 2. Upsert decks (Pass 1: parentId = null)
            const decksNoParent = folders.map((f: any, index: number) => ({
              id: f.id,
              parentId: null,
              name: f.name,
              description: f.description || null,
              color: f.color,
              coverImage: f.coverImage || null,
              coverImagePosition: f.coverImagePosition || '50% 50%',
              frontLang: f.frontLang,
              backLang: f.backLang,
              position: index,
              createdAt: f.createdAt || new Date().toISOString(),
              updatedAt: f.updatedAt || new Date().toISOString()
            }));
            
            if (decksNoParent.length > 0) {
              const { error: dErr1 } = await supabase.from('decks').upsert(decksNoParent);
              if (dErr1) throw dErr1;
            }

            // 3. Upsert decks (Pass 2: resolve parentId)
            const decksWithParent = folders.map((f: any, index: number) => ({
              id: f.id,
              parentId: f.parentId || null,
              name: f.name,
              description: f.description || null,
              color: f.color,
              coverImage: f.coverImage || null,
              coverImagePosition: f.coverImagePosition || '50% 50%',
              frontLang: f.frontLang,
              backLang: f.backLang,
              position: index,
              createdAt: f.createdAt || new Date().toISOString(),
              updatedAt: f.updatedAt || new Date().toISOString()
            }));

            if (decksWithParent.length > 0) {
              const { error: dErr2 } = await supabase.from('decks').upsert(decksWithParent);
              if (dErr2) throw dErr2;
            }

            // 4. Upsert all active cards
            const cardsToInsert = cards.map((c: any, index: number) => ({
              id: c.id,
              folderId: c.folderId,
              frontText: c.frontText,
              frontLang: c.frontLang,
              frontImage: c.frontImage || null,
              frontImagePosition: c.frontImagePosition || '50% 50%',
              frontAudioUrl: c.frontAudioUrl || null,
              backText: c.backText,
              backLang: c.backLang,
              backImage: c.backImage || null,
              backImagePosition: c.backImagePosition || '50% 50%',
              backAudioUrl: c.backAudioUrl || null,
              isArticleMode: c.isArticleMode || false,
              correctArticle: c.correctArticle || '',
              isPluralMode: c.isPluralMode || false,
              pluralText: c.pluralText || '',
              pluralLang: c.pluralLang || 'de',
              translationHint: c.translationHint || null,
              streak: c.streak || 0,
              difficulty: c.difficulty || 'medium',
              position: index,
              createdAt: c.createdAt || new Date().toISOString()
            }));

            if (cardsToInsert.length > 0) {
              const { error: cErr } = await supabase.from('cards').upsert(cardsToInsert);
              if (cErr) throw cErr;
            }

            console.log("[Supabase Background Sync] Sync completed successfully!");
          } catch (bgErr) {
            console.error("[Supabase Background Sync Error]", (bgErr as Error).message || bgErr);
          }
        })();
      }
    } catch (supabaseErr) {
      console.error("[Supabase Sync Initialization Error]", (supabaseErr as Error).message);
      dbStatus.error = (supabaseErr as Error).message;
    }

    // Immediately return success response with local db state (Supabase will finalize in the background)
    res.json({ status: "success", message: "Data saved successfully", dbStatus });
  });

  // API Route - Force Push Local data to Supabase Cloud
  app.post("/api/sync/push", async (req, res) => {
    try {
      const supabase = getSupabase();
      if (!supabase) {
        return res.status(400).json({ error: "اتصال قاعدة البيانات Supabase غير نشط حالياً." });
      }

      if (!fs.existsSync(DB_PATH)) {
        return res.status(404).json({ error: "الملف المحلي db.json غير موجود." });
      }

      const fileContent = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(fileContent);
      const folders = parsed.folders || [];
      const cards = parsed.cards || [];

      console.log(`[Manual Sync Push] Direct upload of ${folders.length} folders and ${cards.length} cards...`);

      // Get existing decks/cards to identify deletions in Supabase
      const { data: dbDecks } = await supabase.from('decks').select('id');
      const { data: dbCards } = await supabase.from('cards').select('id');

      const activeDeckIds = new Set(folders.map((f: any) => f.id));
      const activeCardIds = new Set(cards.map((c: any) => c.id));

      if (dbCards) {
        const cardsToDelete = dbCards.filter((c: any) => !activeCardIds.has(c.id)).map((c: any) => c.id);
        if (cardsToDelete.length > 0) {
          await supabase.from('cards').delete().in('id', cardsToDelete);
        }
      }

      if (dbDecks) {
        const decksToDelete = dbDecks.filter((d: any) => !activeDeckIds.has(d.id)).map((d: any) => d.id);
        if (decksToDelete.length > 0) {
          await supabase.from('decks').update({ parentId: null }).in('id', decksToDelete);
          await supabase.from('decks').delete().in('id', decksToDelete);
        }
      }

      // 1. Pass 1: Upsert decks with parentId = null
      const decksNoParent = folders.map((f: any, index: number) => ({
        id: f.id,
        parentId: null,
        name: f.name,
        description: f.description || null,
        color: f.color,
        coverImage: f.coverImage || null,
        coverImagePosition: f.coverImagePosition || '50% 50%',
        frontLang: f.frontLang,
        backLang: f.backLang,
        position: index,
        createdAt: f.createdAt || new Date().toISOString(),
        updatedAt: f.updatedAt || new Date().toISOString()
      }));

      if (decksNoParent.length > 0) {
        const { error: dErr1 } = await supabase.from('decks').upsert(decksNoParent);
        if (dErr1) throw dErr1;
      }

      // 2. Pass 2: Upsert decks with parentId resolved
      const decksWithParent = folders.map((f: any, index: number) => ({
        id: f.id,
        parentId: f.parentId || null,
        name: f.name,
        description: f.description || null,
        color: f.color,
        coverImage: f.coverImage || null,
        coverImagePosition: f.coverImagePosition || '50% 50%',
        frontLang: f.frontLang,
        backLang: f.backLang,
        position: index,
        createdAt: f.createdAt || new Date().toISOString(),
        updatedAt: f.updatedAt || new Date().toISOString()
      }));

      if (decksWithParent.length > 0) {
        const { error: dErr2 } = await supabase.from('decks').upsert(decksWithParent);
        if (dErr2) throw dErr2;
      }

      // 3. Upsert cards
      const cardsToInsert = cards.map((c: any, index: number) => ({
        id: c.id,
        folderId: c.folderId,
        frontText: c.frontText,
        frontLang: c.frontLang,
        frontImage: c.frontImage || null,
        frontImagePosition: c.frontImagePosition || '50% 50%',
        frontAudioUrl: c.frontAudioUrl || null,
        backText: c.backText,
        backLang: c.backLang,
        backImage: c.backImage || null,
        backImagePosition: c.backImagePosition || '50% 50%',
        backAudioUrl: c.backAudioUrl || null,
        isArticleMode: c.isArticleMode || false,
        correctArticle: c.correctArticle || '',
        isPluralMode: c.isPluralMode || false,
        pluralText: c.pluralText || '',
        pluralLang: c.pluralLang || 'de',
        translationHint: c.translationHint || null,
        streak: c.streak || 0,
        difficulty: c.difficulty || 'medium',
        position: index,
        createdAt: c.createdAt || new Date().toISOString()
      }));

      if (cardsToInsert.length > 0) {
        const { error: cErr } = await supabase.from('cards').upsert(cardsToInsert);
        if (cErr) throw cErr;
      }

      res.json({
        status: "success",
        message: `تمت مزامنة ورفع ${folders.length} مجلدات و ${cards.length} بطاقات بنجاح إلى قاعدة بيانات السحابة!`
      });
    } catch (err: any) {
      console.error("[Manual Sync Push Error]", err);
      res.status(500).json({
        error: `فشل رفع البيانات إلى السحابة. قد تكون حقول صيغة الجمع مفقودة في جدولك أو توجد مشكلة اتصال. خطأ: ${err.message || err}`
      });
    }
  });

  // API Route - Force Pull Cloud data from Supabase to Local file db.json
  app.post("/api/sync/pull", async (req, res) => {
    try {
      const supabase = getSupabase();
      if (!supabase) {
        return res.status(400).json({ error: "اتصال قاعدة البيانات Supabase غير نشط حالياً." });
      }

      console.log("[Manual Sync Pull] Fetching folders and cards from Supabase...");
      const { data: decks, error: decksErr } = await supabase.from('decks').select('*').order('position', { ascending: true });
      const { data: cards, error: cardsErr } = await supabase.from('cards').select('*').order('position', { ascending: true });

      if (decksErr || cardsErr) {
        throw decksErr || cardsErr;
      }

      const mappedFolders = (decks || []).map((d: any) => ({
        id: d.id,
        parentId: d.parentId || undefined,
        name: d.name,
        description: d.description || undefined,
        color: d.color,
        coverImage: d.coverImage || undefined,
        coverImagePosition: d.coverImagePosition || undefined,
        frontLang: d.frontLang,
        backLang: d.backLang,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      }));

      const mappedCards = (cards || []).map((c: any) => ({
        id: c.id,
        folderId: c.folderId,
        frontText: c.frontText,
        frontLang: c.frontLang,
        frontImage: c.frontImage || undefined,
        frontImagePosition: c.frontImagePosition || undefined,
        frontAudioUrl: c.frontAudioUrl || undefined,
        backText: c.backText,
        backLang: c.backLang,
        backImage: c.backImage || undefined,
        backImagePosition: c.backImagePosition || undefined,
        backAudioUrl: c.backAudioUrl || undefined,
        isArticleMode: c.isArticleMode ?? false,
        correctArticle: c.correctArticle || undefined,
        isPluralMode: c.isPluralMode ?? false,
        pluralText: c.pluralText || undefined,
        pluralLang: c.pluralLang || undefined,
        translationHint: c.translationHint || undefined,
        streak: c.streak || 0,
        difficulty: c.difficulty || undefined,
        createdAt: c.createdAt
      }));

      // Update local storage
      fs.writeFileSync(DB_PATH, JSON.stringify({ folders: mappedFolders, cards: mappedCards }, null, 2), "utf-8");

      res.json({
        status: "success",
        message: `تم سحب ${mappedFolders.length} مجلدات و ${mappedCards.length} بطاقات من السحابة بنجاح واستبدال البيانات المحلية بها!`,
        folders: mappedFolders,
        cards: mappedCards
      });
    } catch (err: any) {
      console.error("[Manual Sync Pull Error]", err);
      res.status(500).json({
        error: `فشل سحب البيانات من السحابة. خطأ: ${err.message || err}`
      });
    }
  });


  // Clean up any old tts_cache directory if present on server start to save server disk quota
  const TTS_CACHE_DIR = path.join(process.cwd(), "tts_cache");
  if (fs.existsSync(TTS_CACHE_DIR)) {
    try {
      fs.rmSync(TTS_CACHE_DIR, { recursive: true, force: true });
      console.log("[TTS] Cleaned up server-side tts_cache directory to conserve disk space.");
    } catch (err) {
      console.warn("Could not clean up tts_cache directory:", err);
    }
  }

  // API Route - Get Piper TTS catalog and local models status
  app.get("/api/tts/catalog", (req, res) => {
    const modelsDir = path.join(process.cwd(), "piper_models");
    const piperExec = path.join(process.cwd(), "piper_bin", "piper");
    const piperInstalled = fs.existsSync(piperExec);

    const catalog = [
      // German Voices (🇩🇪)
      {
        id: "de_DE-thorsten-medium",
        name: "Thorsten Medium (ألماني ذكوري - متوسط)",
        lang: "de",
        langName: "Deutsch (German)",
        flag: "🇩🇪",
        quality: "Medium (61 MB)",
        sample: "Guten Tag! Das ist die deutsche Thorsten-Stimme von Piper TTS.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json"
      },
      {
        id: "de_DE-thorsten-high",
        name: "Thorsten High (ألماني ذكوري - عالي الجودة)",
        lang: "de",
        langName: "Deutsch (German)",
        flag: "🇩🇪",
        quality: "High (110 MB)",
        sample: "Hallo! Dies ist die hochauflösende Thorsten-Stimme für klares Deutsch.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json"
      },
      {
        id: "de_DE-kerstin-low",
        name: "Kerstin Low (ألماني أنثوي - سريع ونقي)",
        lang: "de",
        langName: "Deutsch (German)",
        flag: "🇩🇪",
        quality: "Low (16 MB)",
        sample: "Hallo! Ich bin Kerstin. Ich spreche Deutsch mit Ihnen.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx.json"
      },
      {
        id: "de_DE-pavoque-low",
        name: "Pavoque Low (ألماني - خفيف وسريع)",
        lang: "de",
        langName: "Deutsch (German)",
        flag: "🇩🇪",
        quality: "Low (16 MB)",
        sample: "Guten Tag! Ich bin Pavoque und spreche fließend Deutsch.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/pavoque/low/de_DE-pavoque-low.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/pavoque/low/de_DE-pavoque-low.onnx.json"
      },
      {
        id: "de_DE-ramona-low",
        name: "Ramona Low (ألماني أنثوي - خفيف)",
        lang: "de",
        langName: "Deutsch (German)",
        flag: "🇩🇪",
        quality: "Low (16 MB)",
        sample: "Herzlich willkommen! Ich spreche Deutsch für Ihre Lernkarten.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/ramona/low/de_DE-ramona-low.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/ramona/low/de_DE-ramona-low.onnx.json"
      },
      // Arabic Voices (🇯🇴)
      {
        id: "ar_JO-kareem-medium",
        name: "Kareem (عربي ذكوري - أردني/فصيح)",
        lang: "ar",
        langName: "العربية (Arabic)",
        flag: "🇯🇴",
        quality: "Medium (61 MB)",
        sample: "مرحباً بك! هذه تجربة الصوت العربي لتقنية بايبر.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json"
      },
      {
        id: "ar_JO-kareem-low",
        name: "Kareem Low (عربي ذكوري - خفيف)",
        lang: "ar",
        langName: "العربية (Arabic)",
        flag: "🇯🇴",
        quality: "Low (16 MB)",
        sample: "أهلاً بك، صوت كريم العربي الخفيف السريع.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx.json"
      },
      // English Voices (🇺🇸/🇬🇧)
      {
        id: "en_US-lessac-medium",
        name: "Lessac (إنجليزي أمريكي - متوسط)",
        lang: "en",
        langName: "English (US)",
        flag: "🇺🇸",
        quality: "Medium (61 MB)",
        sample: "Hello! This is the Lessac American English neural voice.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
      },
      {
        id: "en_US-amy-medium",
        name: "Amy (إنجليزي أمريكي - إيمي)",
        lang: "en",
        langName: "English (US)",
        flag: "🇺🇸",
        quality: "Medium (61 MB)",
        sample: "Hello! I am Amy, a clear American English voice.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
      },
      {
        id: "en_GB-alan-medium",
        name: "Alan (إنجليزي بريطاني - ألان)",
        lang: "en",
        langName: "English (UK)",
        flag: "🇬🇧",
        quality: "Medium (61 MB)",
        sample: "Good day! I am Alan, speaking British English.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json"
      },
      // French (🇫🇷)
      {
        id: "fr_FR-siwis-medium",
        name: "Siwis (فرنسي - سيويس)",
        lang: "fr",
        langName: "Français (French)",
        flag: "🇫🇷",
        quality: "Medium (61 MB)",
        sample: "Bonjour! C'est la voix française Siwis pour Piper TTS.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json"
      },
      // Spanish (🇪🇸)
      {
        id: "es_ES-davefx-medium",
        name: "Davefx (إسباني - ديفيكس)",
        lang: "es",
        langName: "Español (Spanish)",
        flag: "🇪🇸",
        quality: "Medium (61 MB)",
        sample: "¡Hola! Esta es la voz española Davefx para Piper TTS.",
        urlOnnx: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx",
        urlJson: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json"
      }
    ];

    let installedMap: Record<string, { sizeMb: string }> = {};
    if (fs.existsSync(modelsDir)) {
      const files = fs.readdirSync(modelsDir);
      files.filter(f => f.endsWith(".onnx")).forEach(file => {
        const id = file.replace(/\.onnx$/, "");
        const stats = fs.statSync(path.join(modelsDir, file));
        installedMap[id] = {
          sizeMb: (stats.size / (1024 * 1024)).toFixed(1) + " MB"
        };
      });
    }

    const result = catalog.map(item => ({
      ...item,
      isDownloaded: !!installedMap[item.id],
      installedSizeMb: installedMap[item.id]?.sizeMb || null
    }));

    // Also include any custom downloaded models that aren't in standard catalog
    Object.keys(installedMap).forEach(id => {
      if (!result.some(r => r.id === id)) {
        result.push({
          id,
          name: id,
          lang: id.split("_")[0] || "en",
          langName: id,
          flag: "🌐",
          quality: "Custom Neural",
          sample: "Hello world",
          urlOnnx: "",
          urlJson: "",
          isDownloaded: true,
          installedSizeMb: installedMap[id].sizeMb
        });
      }
    });

    res.json({
      piperInstalled,
      models: result
    });
  });

  // Active in-memory state for model download progress tracking
  const ttsModelDownloadProgress: Record<string, {
    loadedBytes: number;
    totalBytes: number;
    percent: number;
    loadedMb: string;
    totalMb: string;
    status: "downloading" | "completed" | "error" | "idle";
    step: string;
  }> = {};

  // API Route - Get live progress of model download
  app.get("/api/tts/models/download-progress", (req, res) => {
    const modelId = req.query.modelId as string;
    if (!modelId) {
      return res.status(400).json({ error: "modelId is required" });
    }
    const prog = ttsModelDownloadProgress[modelId] || {
      loadedBytes: 0,
      totalBytes: 0,
      percent: 0,
      loadedMb: "0.0 MB",
      totalMb: "0.0 MB",
      status: "idle",
      step: "لم يبدأ التنزيل بعد"
    };
    return res.json(prog);
  });

  // Helper to auto-download/restore missing Piper model on server
  async function downloadPiperModelIfNotExists(modelId: string): Promise<boolean> {
    try {
      const modelsDir = path.join(process.cwd(), "piper_models");
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      const cleanId = modelId.replace(/\.onnx$/, "").trim();
      const onnxPath = path.join(modelsDir, `${cleanId}.onnx`);
      const jsonPath = path.join(modelsDir, `${cleanId}.onnx.json`);

      if (fs.existsSync(onnxPath) && fs.statSync(onnxPath).size > 1024) {
        return true;
      }

      const parts = cleanId.split("-");
      if (parts.length < 2) return false;

      const langCode = parts[0];
      const voiceName = parts[1];
      const quality = parts[2] || "medium";
      const langShort = langCode.split("_")[0];

      const urlOnnx = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${langShort}/${langCode}/${voiceName}/${quality}/${cleanId}.onnx`;
      const urlJson = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${langShort}/${langCode}/${voiceName}/${quality}/${cleanId}.onnx.json`;

      console.log(`[TTS Auto-Restore] Auto-downloading missing Piper model ${cleanId} from HuggingFace...`);

      const resOnnx = await fetch(urlOnnx, { redirect: "follow" });
      if (!resOnnx.ok) {
        console.warn(`[TTS Auto-Restore] Failed to fetch ONNX for ${cleanId}: HTTP ${resOnnx.status}`);
        return false;
      }
      const bufOnnx = Buffer.from(await resOnnx.arrayBuffer());
      fs.writeFileSync(onnxPath, bufOnnx);

      const resJson = await fetch(urlJson, { redirect: "follow" });
      if (resJson.ok) {
        const bufJson = Buffer.from(await resJson.arrayBuffer());
        fs.writeFileSync(jsonPath, bufJson);
      }

      return fs.existsSync(onnxPath) && fs.statSync(onnxPath).size > 1024;
    } catch (err) {
      console.warn(`[TTS Auto-Restore] Error auto-downloading ${modelId}:`, err);
      return false;
    }
  }

  // API Route - Download a Piper model dynamically by ID or URLs
  app.post("/api/tts/models/download", express.json(), async (req, res) => {
    const { modelId, urlOnnx, urlJson } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: "modelId is required" });
    }

    const modelsDir = path.join(process.cwd(), "piper_models");
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    const onnxPath = path.join(modelsDir, `${modelId}.onnx`);
    const jsonPath = path.join(modelsDir, `${modelId}.onnx.json`);

    try {
      // Determine URLs
      let finalOnnxUrl = urlOnnx;
      let finalJsonUrl = urlJson;

      if (!finalOnnxUrl) {
        // Parse language and voice from modelId e.g. "de_DE-thorsten-medium"
        const parts = modelId.split("-");
        const langCode = parts[0]; // "de_DE"
        const voiceName = parts[1]; // "thorsten"
        const quality = parts[2] || "medium"; // "medium"
        const langShort = langCode.split("_")[0]; // "de"

        finalOnnxUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${langShort}/${langCode}/${voiceName}/${quality}/${modelId}.onnx`;
        finalJsonUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${langShort}/${langCode}/${voiceName}/${quality}/${modelId}.onnx.json`;
      }

      console.log(`Downloading Piper model ${modelId} from ${finalOnnxUrl}...`);

      ttsModelDownloadProgress[modelId] = {
        loadedBytes: 0,
        totalBytes: 0,
        percent: 1,
        loadedMb: "0.0 MB",
        totalMb: "جاري الحساب...",
        status: "downloading",
        step: "جاري بدء الاتصال بـ HuggingFace..."
      };

      // Stream download helper function
      const downloadStream = async (url: string, destPath: string, isMainOnnx: boolean, sizeMbHint?: string) => {
        const fetchRes = await fetch(url, { redirect: "follow" });
        if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}: ${fetchRes.statusText}`);

        let contentLengthHeader = fetchRes.headers.get("content-length") || fetchRes.headers.get("x-linked-size");
        let total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

        if (!total || isNaN(total)) {
          if (sizeMbHint) {
            const parsedMb = parseFloat(sizeMbHint);
            if (!isNaN(parsedMb) && parsedMb > 0) {
              total = Math.round(parsedMb * 1024 * 1024);
            }
          }
        }

        const fileStream = fs.createWriteStream(destPath);

        if (fetchRes.body) {
          const { Readable } = await import("stream");
          const nodeStream = Readable.fromWeb(fetchRes.body as any);
          let loaded = 0;

          await new Promise<void>((resolve, reject) => {
            nodeStream.on("data", (chunk: Buffer) => {
              loaded += chunk.length;
              fileStream.write(chunk);

              if (isMainOnnx) {
                const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
                const loadedMb = (loaded / (1024 * 1024)).toFixed(1) + " MB";
                const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(1) + " MB" : (loadedMb + " MB");

                ttsModelDownloadProgress[modelId] = {
                  loadedBytes: loaded,
                  totalBytes: total,
                  percent,
                  loadedMb,
                  totalMb,
                  status: "downloading",
                  step: `[1/2 الخادم] جاري التنزيل: ${loadedMb} / ${totalMb} (${percent}%)`
                };
              }
            });

            nodeStream.on("end", () => {
              fileStream.end(() => resolve());
            });

            nodeStream.on("error", (err) => {
              fileStream.close();
              reject(err);
            });

            fileStream.on("error", (err) => {
              reject(err);
            });
          });
        } else {
          const buffer = Buffer.from(await fetchRes.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
        }
      };

      // 1. Download main ONNX model
      await downloadStream(finalOnnxUrl, onnxPath, true, req.body.sizeMb);

      // 2. Download JSON config
      if (finalJsonUrl) {
        if (ttsModelDownloadProgress[modelId]) {
          ttsModelDownloadProgress[modelId].step = "جاري تنزيل ملف الإعدادات (.onnx.json)...";
        }
        await downloadStream(finalJsonUrl, jsonPath, false);
      }

      if (fs.existsSync(onnxPath) && fs.statSync(onnxPath).size > 1024) {
        const stats = fs.statSync(onnxPath);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(1) + " MB";

        ttsModelDownloadProgress[modelId] = {
          loadedBytes: stats.size,
          totalBytes: stats.size,
          percent: 100,
          loadedMb: sizeMb,
          totalMb: sizeMb,
          status: "completed",
          step: "اكتمل التنزيل بنجاح 100%!"
        };

        return res.json({ success: true, modelId, sizeMb });
      } else {
        if (fs.existsSync(onnxPath)) fs.unlinkSync(onnxPath);
        if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);

        ttsModelDownloadProgress[modelId] = {
          loadedBytes: 0,
          totalBytes: 0,
          percent: 0,
          loadedMb: "0 MB",
          totalMb: "0 MB",
          status: "error",
          step: "الملف المنزل غير صالحة أو فارغ"
        };
        return res.status(500).json({ error: "Downloaded file is invalid or empty." });
      }
    } catch (err: any) {
      console.error("Error downloading model:", err);
      if (fs.existsSync(onnxPath)) fs.unlinkSync(onnxPath);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);

      ttsModelDownloadProgress[modelId] = {
        loadedBytes: 0,
        totalBytes: 0,
        percent: 0,
        loadedMb: "0 MB",
        totalMb: "0 MB",
        status: "error",
        step: `فشل التنزيل: ${err.message || ""}`
      };
      return res.status(500).json({ error: err.message || "Download failed" });
    }
  });

  // API Route - Repair and Auto-Restore Piper Binaries and Voice Models on Server
  async function repairPiperServerCore(): Promise<{ success: boolean; actionsTaken: string[] }> {
    const piperBinDir = path.join(process.cwd(), "piper_bin");
    const modelsDir = path.join(process.cwd(), "piper_models");

    if (!fs.existsSync(piperBinDir)) fs.mkdirSync(piperBinDir, { recursive: true });
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    const actionsTaken: string[] = [];
    const piperExecPath = path.join(piperBinDir, "piper");

    // 1. Check piper binary & shared libraries
    const requiredLibs = ["libespeak-ng.so", "libonnxruntime.so", "libpiper_phonemize.so"];
    const espeakDataDir = path.join(piperBinDir, "espeak-ng-data");

    let needsBinaryDownload = !fs.existsSync(piperExecPath) || !fs.existsSync(espeakDataDir);
    for (const lib of requiredLibs) {
      if (!fs.existsSync(path.join(piperBinDir, lib))) {
        needsBinaryDownload = true;
        break;
      }
    }

    if (needsBinaryDownload) {
      console.log("[PiperRepair] Restoring Piper binary and Linux shared libraries from GitHub releases...");
      try {
        const { execSync } = await import("child_process");
        const dlCmd = `mkdir -p /tmp/piper_repair && curl -sL "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz" | tar -xzf - -C /tmp/piper_repair && cp -r /tmp/piper_repair/piper/* "${piperBinDir}/" && rm -rf /tmp/piper_repair`;
        execSync(dlCmd, { timeout: 60000 });
        actionsTaken.push("تم تنزيل واسترجاع ملفات Piper ومكتبات C++ وبيانات espeak-ng-data بنجاح");
      } catch (e: any) {
        console.error("[PiperRepair] Failed to restore piper binary package:", e);
      }
    }

    // Ensure execution permissions
    try {
      if (fs.existsSync(piperExecPath)) fs.chmodSync(piperExecPath, 0o755);
      const phonemizeBin = path.join(piperBinDir, "piper_phonemize");
      if (fs.existsSync(phonemizeBin)) fs.chmodSync(phonemizeBin, 0o755);
      const espeakBin = path.join(piperBinDir, "espeak-ng");
      if (fs.existsSync(espeakBin)) fs.chmodSync(espeakBin, 0o755);
      actionsTaken.push("تم منح صلاحيات التشغيل التنفيذية (0755)");
    } catch (e: any) {
      console.warn("[PiperRepair] chmod warn:", e);
    }

    // 2. Check default models in piper_models/
    const defaultModels = [
      {
        id: "de_DE-thorsten-medium",
        onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
        jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json"
      },
      {
        id: "ar_JO-kareem-medium",
        onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx",
        jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json"
      },
      {
        id: "en_US-lessac-medium",
        onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
      }
    ];

    const { exec } = await import("child_process");

    for (const m of defaultModels) {
      const onnxPath = path.join(modelsDir, `${m.id}.onnx`);
      const jsonPath = path.join(modelsDir, `${m.id}.onnx.json`);

      const isMissingOrTooSmall = !fs.existsSync(onnxPath) || fs.statSync(onnxPath).size < 1000000;
      const isJsonMissing = !fs.existsSync(jsonPath);

      if (isMissingOrTooSmall || isJsonMissing) {
        console.log(`[PiperRepair] Downloading missing model ${m.id}...`);
        try {
          const cmd = `curl -L -o "${onnxPath}" "${m.onnxUrl}" && curl -L -o "${jsonPath}" "${m.jsonUrl}"`;
          await new Promise((resolve) => {
            exec(cmd, { timeout: 120000 }, (err) => {
              if (!err && fs.existsSync(onnxPath) && fs.statSync(onnxPath).size > 1000000) {
                actionsTaken.push(`تم تنزيل وتثبيت النموذج الصوتي: ${m.id}`);
              } else {
                console.warn(`[PiperRepair] Failed downloading model ${m.id}`);
              }
              resolve(true);
            });
          });
        } catch (dlErr) {
          console.error(`[PiperRepair] Error downloading model ${m.id}:`, dlErr);
        }
      }
    }

    // 3. Test piper execution
    let testSuccess = false;
    try {
      const { execSync } = await import("child_process");
      const output = execSync(`LD_LIBRARY_PATH="${piperBinDir}" "${piperExecPath}" --version`, { encoding: "utf-8" });
      if (output && output.includes("1.")) {
        testSuccess = true;
      }
    } catch (testErr) {
      console.error("[PiperRepair] Piper execution test failed:", testErr);
    }

    return { success: testSuccess, actionsTaken };
  }

  const repairPiperServer = async (req: express.Request, res: express.Response) => {
    const { success, actionsTaken } = await repairPiperServerCore();
    const piperBinDir = path.join(process.cwd(), "piper_bin");
    const piperExecPath = path.join(piperBinDir, "piper");
    const espeakDataDir = path.join(piperBinDir, "espeak-ng-data");

    return res.json({
      success,
      repaired: actionsTaken.length > 0,
      actionsTaken,
      message: success
        ? "تم فحص وإصلاح ملفات السيرفر بنجاح! محرك Piper وجميع المكتبات والنماذج الصوتية متوفرة وتعمل الآن بكفاءة."
        : "تم فحص الملفات، يرجى المحاولة مرة أخرى أو التأكد من استقرار السيرفر.",
      details: {
        piperInstalled: success,
        piperBinPath: piperExecPath,
        espeakDataExists: fs.existsSync(espeakDataDir)
      }
    });
  };

  app.post("/api/system/repair-piper", express.json(), repairPiperServer);
  app.post("/api/tts/repair", express.json(), repairPiperServer);

  // API Route - Delete a downloaded Piper model
  app.delete("/api/tts/models/:modelId", (req, res) => {
    const { modelId } = req.params;
    if (!modelId) return res.status(400).json({ error: "modelId is required" });

    const modelsDir = path.join(process.cwd(), "piper_models");
    const onnxPath = path.join(modelsDir, `${modelId}.onnx`);
    const jsonPath = path.join(modelsDir, `${modelId}.onnx.json`);

    try {
      if (fs.existsSync(onnxPath)) {
        fs.unlinkSync(onnxPath);
      }
      if (fs.existsSync(jsonPath)) {
        fs.unlinkSync(jsonPath);
      }

      // Reset progress tracking object if present
      delete ttsModelDownloadProgress[modelId];

      res.json({ success: true, message: `Model ${modelId} deleted or removed successfully.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete model" });
    }
  });

  // API Route - Delete ALL downloaded Piper models to free storage
  app.post("/api/tts/models/clear-all", (req, res) => {
    const modelsDir = path.join(process.cwd(), "piper_models");
    try {
      if (fs.existsSync(modelsDir)) {
        const files = fs.readdirSync(modelsDir);
        for (const file of files) {
          if (file.endsWith(".onnx") || file.endsWith(".json")) {
            try {
              fs.unlinkSync(path.join(modelsDir, file));
            } catch (e) {
              // ignore single file unlink error
            }
          }
        }
      }

      // Reset all progress tracking
      Object.keys(ttsModelDownloadProgress).forEach(k => delete ttsModelDownloadProgress[k]);

      res.json({ success: true, message: "All downloaded models cleared successfully." });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to clear models directory" });
    }
  });

  // API Route - Get installed Piper TTS models (Legacy compat)
  app.get("/api/tts/models", (req, res) => {
    const modelsDir = path.join(process.cwd(), "piper_models");
    const piperExec = path.join(process.cwd(), "piper_bin", "piper");
    const isInstalled = fs.existsSync(piperExec);

    const modelMetaData: Record<string, { name: string; lang: string; langName: string; flag: string; quality: string; sample: string }> = {
      "de_DE-thorsten-medium": { name: "Thorsten (الألمانية)", lang: "de", langName: "Deutsch (German)", flag: "🇩🇪", quality: "Medium Neural", sample: "Hallo! Das ist die deutsche Piper TTS Stimme." },
      "ar_JO-kareem-medium": { name: "Kareem (العربية)", lang: "ar", langName: "العربية (Arabic)", flag: "🇯🇴", quality: "Medium Neural", sample: "مرحباً بك! هذه تجربة الصوت العربي لتقنية بايبر." },
      "en_US-lessac-medium": { name: "Lessac (English US)", lang: "en", langName: "English (US)", flag: "🇺🇸", quality: "Medium Neural", sample: "Hello! This is the English Piper TTS voice model." }
    };

    let installedModels: any[] = [];
    if (fs.existsSync(modelsDir)) {
      const files = fs.readdirSync(modelsDir);
      const onnxFiles = files.filter(f => f.endsWith(".onnx"));

      installedModels = onnxFiles.map(file => {
        const key = file.replace(/\.onnx$/, "");
        const meta = modelMetaData[key] || {
          name: key,
          lang: key.split("_")[0] || "en",
          langName: key,
          flag: "🌐",
          quality: "Neural",
          sample: "Hello world"
        };
        const stats = fs.statSync(path.join(modelsDir, file));
        return {
          id: key,
          file,
          sizeMb: (stats.size / (1024 * 1024)).toFixed(1) + " MB",
          ...meta
        };
      });
    }

    res.json({
      piperInstalled: isInstalled,
      models: installedModels
    });
  });

  // Class to manage persistent warm Piper process with 60s idle timeout
  class PersistentPiperManager {
    private activeProc: any = null;
    private currentModelPath: string | null = null;
    private idleTimer: NodeJS.Timeout | null = null;
    private pendingQueue: Array<{
      text: string;
      tempFile: string;
      resolve: (buffer: Buffer | null) => void;
    }> = [];
    private isProcessing = false;
    private readonly IDLE_TIMEOUT_MS = 60000; // 60 seconds (1 minute) idle timeout

    public async generateAudio(
      piperExecutable: string,
      piperBinDir: string,
      modelPath: string,
      cleanText: string,
      tempFile: string
    ): Promise<Buffer | null> {
      // Touch/reset 60s idle timer on every request
      this.touchIdleTimer();

      // If a process is active for a DIFFERENT voice model, close it first
      if (this.activeProc && this.currentModelPath !== modelPath) {
        console.log(`[PersistentPiper] Voice model changed from ${path.basename(this.currentModelPath || "")} to ${path.basename(modelPath)}. Resetting engine...`);
        this.closeProcess();
      }

      // Spawn persistent worker process if not active
      if (!this.activeProc) {
        const started = await this.startProcess(piperExecutable, piperBinDir, modelPath);
        if (!started) return null;
      }

      return new Promise<Buffer | null>((resolve) => {
        this.pendingQueue.push({ text: cleanText, tempFile, resolve });
        this.processQueue();
      });
    }

    private touchIdleTimer() {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      this.idleTimer = setTimeout(() => {
        console.log("⏰ [PersistentPiper Engine] Idle timeout (60s) reached with no active requests. Closing background engine & releasing RAM...");
        this.closeProcess();
      }, this.IDLE_TIMEOUT_MS);
    }

    private startProcess(piperExecutable: string, piperBinDir: string, modelPath: string): Promise<boolean> {
      return new Promise((resolve) => {
        try {
          console.log(`🚀 [PersistentPiper Engine] Initializing persistent Piper worker for model: ${path.basename(modelPath)}...`);
          const espeakDataDir = path.join(piperBinDir, "espeak-ng-data");

          const proc = spawn(
            piperExecutable,
            [
              "--model", modelPath,
              "--json-input",
              "--espeak_data", espeakDataDir
            ],
            {
              cwd: piperBinDir,
              env: {
                ...process.env,
                LD_LIBRARY_PATH: `${piperBinDir}:${process.env.LD_LIBRARY_PATH || ""}`,
              },
              stdio: ["pipe", "pipe", "pipe"],
            }
          );

          this.activeProc = proc;
          this.currentModelPath = modelPath;

          let isReady = false;

          proc.stderr?.on("data", (data: any) => {
            const str = data.toString();
            if (!isReady && (str.includes("Loaded voice") || str.includes("Initialized piper"))) {
              isReady = true;
              console.log(`⚡ [PersistentPiper Engine] Model loaded into memory! Engine process warm & listening.`);
              resolve(true);
            }
          });

          proc.on("error", (err: any) => {
            console.error("❌ [PersistentPiper Engine] Process error:", err);
            this.closeProcess();
            if (!isReady) resolve(false);
          });

          proc.on("close", (code: any) => {
            console.log(`ℹ️ [PersistentPiper Engine] Worker process ended (code ${code}).`);
            this.closeProcess();
            if (!isReady) resolve(false);
          });

          // Safety fallback timer if stderr doesn't emit expected init string fast enough
          setTimeout(() => {
            if (!isReady) {
              isReady = true;
              resolve(!!this.activeProc);
            }
          }, 2000);
        } catch (err) {
          console.error("❌ [PersistentPiper Engine] Failed to spawn persistent worker:", err);
          this.closeProcess();
          resolve(false);
        }
      });
    }

    private async processQueue() {
      if (this.isProcessing || this.pendingQueue.length === 0) return;
      this.isProcessing = true;

      const job = this.pendingQueue.shift();
      if (!job) {
        this.isProcessing = false;
        return;
      }

      if (!this.activeProc || !this.activeProc.stdin || this.activeProc.killed) {
        job.resolve(null);
        this.isProcessing = false;
        this.processQueue();
        return;
      }

      try {
        // Touch idle timer whenever processing a job
        this.touchIdleTimer();

        const jsonPayload = JSON.stringify({
          text: job.text,
          output_file: job.tempFile
        }) + "\n";

        this.activeProc.stdin.write(jsonPayload);

        // Fast polling (every 30ms) for generated output WAV file
        let elapsed = 0;
        const checkInterval = 30;
        const maxWaitMs = 12000;

        const pollTimer = setInterval(() => {
          elapsed += checkInterval;
          if (fs.existsSync(job.tempFile)) {
            try {
              const stats = fs.statSync(job.tempFile);
              if (stats.size > 100) {
                clearInterval(pollTimer);
                fs.readFile(job.tempFile, (readErr, data) => {
                  try { fs.unlinkSync(job.tempFile); } catch (e) {}
                  if (!readErr && data && data.length > 100) {
                    job.resolve(data);
                  } else {
                    job.resolve(null);
                  }
                  this.isProcessing = false;
                  this.processQueue();
                });
                return;
              }
            } catch (e) {}
          }

          if (elapsed >= maxWaitMs || !this.activeProc) {
            clearInterval(pollTimer);
            if (fs.existsSync(job.tempFile)) {
              try { fs.unlinkSync(job.tempFile); } catch (e) {}
            }
            job.resolve(null);
            this.isProcessing = false;
            this.processQueue();
          }
        }, checkInterval);
      } catch (err) {
        console.error("❌ [PersistentPiper Engine] Error writing stdin payload:", err);
        if (fs.existsSync(job.tempFile)) {
          try { fs.unlinkSync(job.tempFile); } catch (e) {}
        }
        job.resolve(null);
        this.isProcessing = false;
        this.processQueue();
      }
    }

    public closeProcess() {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      if (this.activeProc) {
        try {
          this.activeProc.stdin?.end();
          this.activeProc.kill("SIGKILL");
        } catch (e) {}
        this.activeProc = null;
      }
      this.currentModelPath = null;
      while (this.pendingQueue.length > 0) {
        const job = this.pendingQueue.shift();
        job?.resolve(null);
      }
    }
  }

  const persistentPiperManager = new PersistentPiperManager();

  const stripEmojis = (str: string): string => {
    if (!str) return "";
    return str
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/[*_~`#]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  app.get("/api/tts", async (req, res) => {
    const text = req.query.text as string;
    const lang = (req.query.lang as string || "en").toLowerCase();
    const requestedVoice = (req.query.voice || req.query.model) as string;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    try {
      const cleanText = stripEmojis(text);
      if (!cleanText) {
        return res.status(400).json({ error: "No printable text after stripping emojis" });
      }

      // Check if voice is disabled or turned off
      if (requestedVoice === "none" || requestedVoice === "off" || requestedVoice === "disabled") {
        return res.status(400).json({ error: "Voice audio disabled" });
      }

      // Helper function to split text for Google Translate TTS (limit ~150 chars per request)
      function splitTextForGoogleTTS(textToSplit: string, maxLen = 150): string[] {
        if (textToSplit.length <= maxLen) return [textToSplit];
        const sentences = textToSplit.match(/[^.!?;\n\u061B]+[.!?;\n\u061B]*/g) || [textToSplit];
        const chunks: string[] = [];
        let current = "";

        for (const s of sentences) {
          if ((current + " " + s).trim().length <= maxLen) {
            current = (current + " " + s).trim();
          } else {
            if (current) chunks.push(current);
            if (s.length > maxLen) {
              const words = s.split(" ");
              let wordChunk = "";
              for (const w of words) {
                if ((wordChunk + " " + w).trim().length <= maxLen) {
                  wordChunk = (wordChunk + " " + w).trim();
                } else {
                  if (wordChunk) chunks.push(wordChunk);
                  wordChunk = w;
                }
              }
              if (wordChunk) current = wordChunk;
            } else {
              current = s.trim();
            }
          }
        }
        if (current) chunks.push(current);
        return chunks.filter((c) => c.trim().length > 0);
      }

      // 1. Google Translate TTS explicit request
      const reqVoiceLower = (requestedVoice || "").toLowerCase();
      const isGoogleRequested =
        reqVoiceLower === "google" ||
        reqVoiceLower === "google_tts" ||
        reqVoiceLower === "google_translate" ||
        reqVoiceLower === "google-tts" ||
        reqVoiceLower.includes("google");

      if (isGoogleRequested) {
        const textChunks = splitTextForGoogleTTS(cleanText, 150);
        const chunkBuffers: Buffer[] = [];

        for (const chunk of textChunks) {
          const urls = [
            `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(chunk)}`,
            `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=gtx&q=${encodeURIComponent(chunk)}`,
            `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=dict-chrome-ex&q=${encodeURIComponent(chunk)}`,
            `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=webapp&q=${encodeURIComponent(chunk)}`
          ];

          let chunkBuf: Buffer | null = null;

          for (const url of urls) {
            try {
              const response = await fetch(url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
              });

              if (response.ok) {
                const buffer = await response.arrayBuffer();
                const candidate = Buffer.from(buffer);
                const prefix = candidate.toString("utf-8", 0, 20);

                if (candidate.length > 50 && !prefix.includes("<html") && !prefix.includes("<!DOCTYPE") && !prefix.includes("{")) {
                  chunkBuf = candidate;
                  break;
                }
              }
            } catch (fetchErr) {
              console.warn(`TTS fetch failed for ${url}:`, fetchErr);
            }
          }

          if (chunkBuf) {
            chunkBuffers.push(chunkBuf);
          }
        }

        if (chunkBuffers.length > 0) {
          const nodeBuffer = Buffer.concat(chunkBuffers);
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return res.send(nodeBuffer);
        }

        return res.status(502).json({ error: "Google TTS service failed to generate audio for specified voice" });
      }

      // 2. Piper TTS model request (Strict: NO AUTO-REPAIR - Granular Diagnostic Error Handling)
      const piperBinDir = path.join(process.cwd(), "piper_bin");
      const piperExecutable = path.join(piperBinDir, "piper");
      let piperModel = "ar_JO-kareem-medium.onnx";

      if (requestedVoice) {
        if (requestedVoice.endsWith(".onnx")) {
          piperModel = requestedVoice;
        } else {
          piperModel = `${requestedVoice}.onnx`;
        }
      } else if (lang.startsWith("de")) {
        piperModel = "de_DE-thorsten-medium.onnx";
      } else if (lang.startsWith("en")) {
        piperModel = "en_US-lessac-medium.onnx";
      } else if (lang.startsWith("ar")) {
        piperModel = "ar_JO-kareem-medium.onnx";
      }

      const piperModelPath = path.join(process.cwd(), "piper_models", piperModel);
      const piperModelJsonPath = `${piperModelPath}.json`;

      // Granular Step-by-Step Diagnostic Inspection (No silent auto-repair)
      const checksSummary: Array<{ step: string; status: "passed" | "failed" | "skipped"; detail: string }> = [];

      // Step 1: Check Piper Binary Executable
      const binExists = fs.existsSync(piperExecutable);
      if (binExists) {
        checksSummary.push({
          step: "الخطوة 1: فحص ملف محرك Piper التنفيذي (piper_bin/piper)",
          status: "passed",
          detail: `المحرك التنفيذي موجود في ${piperExecutable}`
        });
      } else {
        checksSummary.push({
          step: "الخطوة 1: فحص ملف محرك Piper التنفيذي (piper_bin/piper)",
          status: "failed",
          detail: "الملف التنفيذي لمحرك Piper غير موجود بالسيرفر"
        });
        checksSummary.push({ step: "الخطوة 2: فحص ملف النموذج الصوتي (ONNX)", status: "skipped", detail: "لم يتم الفحص بسبب فقدان المحرك" });
        checksSummary.push({ step: "الخطوة 3: فحص ملف إعدادات النموذج (JSON)", status: "skipped", detail: "لم يتم الفحص" });

        return res.status(404).json({
          error: "الملف التنفيذي لمحرك Piper TTS غير موجود على الخادم",
          failedStepTitle: "الخطوة 1: فحص ملف محرك Piper التنفيذي",
          errorReason: "المجلد piper_bin أو الملف التنفيذي piper غير موجود على قرص السيرفر",
          suggestedSolution: "اضغط على زر '🔧 فحص وإصلاح ملفات السيرفر' من الإعدادات لإعادة تنزيل المحرك بطلبك.",
          checksSummary,
          technicalDetails: {
            piperExecutable,
            piperExecutableExists: false,
            piperModelPath,
            modelOnnxExists: fs.existsSync(piperModelPath),
            modelJsonExists: fs.existsSync(piperModelJsonPath)
          }
        });
      }

      // Step 2: Check Piper Voice ONNX Model File
      const modelOnnxExists = fs.existsSync(piperModelPath);
      let modelSizeBytes = 0;
      if (modelOnnxExists) {
        try {
          modelSizeBytes = fs.statSync(piperModelPath).size;
        } catch (e) {}
      }

      if (modelOnnxExists && modelSizeBytes > 1000) {
        checksSummary.push({
          step: "الخطوة 2: فحص ملف النموذج الصوتي (ONNX Model File)",
          status: "passed",
          detail: `الملف موجود وحجمه ${(modelSizeBytes / (1024 * 1024)).toFixed(1)} MB`
        });
      } else {
        checksSummary.push({
          step: "الخطوة 2: فحص ملف النموذج الصوتي (ONNX Model File)",
          status: "failed",
          detail: modelOnnxExists ? "ملف ONNX معطوب أو حجمه أقل من 1KB" : `ملف النموذج (${piperModel}) غير محمل بالسيرفر`
        });
        checksSummary.push({ step: "الخطوة 3: فحص ملف إعدادات النموذج (JSON)", status: "skipped", detail: "لم يتم الفحص بسبب فقدان ملف ONNX" });

        return res.status(404).json({
          error: `النموذج الصوتي المطلوب (${piperModel}) غير منزّل أو غير مكتمل على الخادم`,
          failedStepTitle: "الخطوة 2: فحص ملف النموذج الصوتي ONNX",
          errorReason: `ملف النموذج ${piperModelPath} غير متوفر على القرص الصلب للسيرفر`,
          suggestedSolution: "قم بتنزيل الصوت من قائمة الأصوات المتاحة أو اضغط على '🔧 فحص وإصلاح ملفات السيرفر'.",
          checksSummary,
          technicalDetails: {
            piperExecutable,
            piperExecutableExists: true,
            piperModelPath,
            modelOnnxExists,
            modelSizeBytes,
            modelJsonExists: fs.existsSync(piperModelJsonPath)
          }
        });
      }

      // Step 3: Check Piper Voice Config JSON File
      const modelJsonExists = fs.existsSync(piperModelJsonPath);
      if (modelJsonExists) {
        checksSummary.push({
          step: "الخطوة 3: فحص ملف إعدادات الصوت (ONNX JSON Config)",
          status: "passed",
          detail: "ملف إعدادات وتوصيف الصوت متوفر"
        });
      } else {
        checksSummary.push({
          step: "الخطوة 3: فحص ملف إعدادات الصوت (ONNX JSON Config)",
          status: "failed",
          detail: `ملف التوصيف (${piperModel}.json) ناقص`
        });

        return res.status(404).json({
          error: `ملف توصيف الصوت JSON للنموذج (${piperModel}) غير موجود`,
          failedStepTitle: "الخطوة 3: فحص ملف إعدادات الصوت JSON",
          errorReason: `ملف التوصيف ${piperModelJsonPath} ناقص`,
          suggestedSolution: "اضغط على زر '🔧 فحص وإصلاح ملفات السيرفر' لتنزل ملف JSON الناقص لهذا النموذج.",
          checksSummary,
          technicalDetails: {
            piperExecutable,
            piperExecutableExists: true,
            piperModelPath,
            modelOnnxExists: true,
            modelSizeBytes,
            modelJsonExists: false
          }
        });
      }

      // Ensure execution permissions on piper binary and helper executables
      try {
        fs.chmodSync(piperExecutable, 0o755);
        const phonemizeBin = path.join(piperBinDir, "piper_phonemize");
        if (fs.existsSync(phonemizeBin)) fs.chmodSync(phonemizeBin, 0o755);
        const espeakBin = path.join(piperBinDir, "espeak-ng");
        if (fs.existsSync(espeakBin)) fs.chmodSync(espeakBin, 0o755);
      } catch (chmodErr) {
        console.warn("[TTS] Could not set executable permissions on piper binaries:", chmodErr);
      }

      // Step 4: Run Neural Generation Process (Primary: Persistent Warm Worker Engine; Fallback: Single Spawn)
      try {
        let piperStderr = "";
        let piperExitCode: number | null = null;
        // Use system OS temporary directory (/tmp) for temporary WAV generation, deleted immediately after reading!
        const tmpDir = os.tmpdir();
        const tempFile = path.join(tmpDir, `piper_tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`);

        // 🚀 Primary: Execute via long-lived warm Piper engine worker
        let piperBuffer = await persistentPiperManager.generateAudio(
          piperExecutable,
          piperBinDir,
          piperModelPath,
          cleanText,
          tempFile
        );

        // 🛡️ Fallback: Single-shot spawn if persistent engine returned null
        if (!piperBuffer) {
          console.warn("⚠️ [TTS] Persistent Piper engine returned null. Executing single-shot process fallback...");
          piperBuffer = await new Promise<Buffer | null>((resolve) => {
            const piperProc = spawn(piperExecutable, ["--model", piperModelPath, "--output_file", tempFile], {
              cwd: piperBinDir,
              env: {
                ...process.env,
                LD_LIBRARY_PATH: `${piperBinDir}:${process.env.LD_LIBRARY_PATH || ""}`,
              },
              stdio: ["pipe", "pipe", "pipe"],
            });

            piperProc.stderr.on("data", (data) => {
              piperStderr += data.toString();
            });

            piperProc.stdin.write(cleanText);
            piperProc.stdin.end();

            piperProc.on("close", (code) => {
              piperExitCode = code;
              if (code === 0 && fs.existsSync(tempFile)) {
                fs.readFile(tempFile, (readErr, data) => {
                  try { fs.unlinkSync(tempFile); } catch (e) {}
                  if (!readErr && data && data.length > 100) {
                    resolve(data);
                  } else {
                    resolve(null);
                  }
                });
              } else {
                if (fs.existsSync(tempFile)) try { fs.unlinkSync(tempFile); } catch (e) {}
                resolve(null);
              }
            });

            piperProc.on("error", (spawnErr) => {
              piperStderr += ` Spawn error: ${spawnErr?.message || String(spawnErr)}`;
              if (fs.existsSync(tempFile)) try { fs.unlinkSync(tempFile); } catch (e) {}
              resolve(null);
            });
          });
        }

        if (piperBuffer) {
          // Stream directly to browser client; NO file is stored on the server's disk!
          res.setHeader("Content-Type", "audio/wav");
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.setHeader("X-Piper-Model-Found", "true");
          res.setHeader("X-Piper-Engine-Mode", "persistent_warm");
          return res.send(piperBuffer);
        } else {
          checksSummary.push({
            step: "الخطوة 4: تشغيل التوليد العصبي ومصفوفات ONNX Tensor",
            status: "failed",
            detail: `انتهت عملية التشغيل بكود خروج ${piperExitCode} مع أخطاء`
          });

          return res.status(500).json({
            error: `فشل معالج Piper TTS في توليد الصوت للنموذج (${piperModel})`,
            failedStepTitle: "الخطوة 4: تشغيل التوليد العصبي ومصفوفات ONNX Tensor",
            errorReason: piperStderr || "توقف العملية بدون تسجيل أخطاء غلاف النظام (Stderr Empty)",
            suggestedSolution: "تأكد من توافق جودة النص أو اضغط على 'إصلاح السيرفر' أو جرب تشغيل المحرك الأحادي.",
            checksSummary,
            technicalDetails: {
              exitCode: piperExitCode,
              stderr: piperStderr,
              modelPath: piperModelPath,
              modelSizeBytes
            }
          });
        }
      } catch (piperErr: any) {
        console.error("Piper generation error:", piperErr);
        checksSummary.push({
          step: "الخطوة 4: تشغيل التوليد العصبي ومصفوفات ONNX Tensor",
          status: "failed",
          detail: piperErr?.message || String(piperErr)
        });

        return res.status(500).json({
          error: `فشل تنفيذ معالج Piper للنموذج الصوتي (${piperModel})`,
          failedStepTitle: "الخطوة 4: استدعاء التوليد العصبي",
          errorReason: piperErr?.message || String(piperErr),
          suggestedSolution: "اضغط على زر '🔧 فحص وإصلاح ملفات السيرفر' لتحديث مكتبات الرابط الديناميكي C++.",
          checksSummary,
          technicalDetails: {
            piperErr: piperErr?.message || String(piperErr)
          }
        });
      }
    } catch (err) {
      console.error("TTS proxy failed:", err);
      return res.status(500).setHeader("Content-Type", "application/json").json({ error: "TTS failed" });
    }
  });

  // API Route - Generate Folder & Cards using Gemini API with Real-time Progress Streaming (NDJSON)
  app.post("/api/ai/generate", async (req, res) => {
    const {
      prompt,
      excludeList,
      customApiKey,
      descriptionMode,
      imagesMode,
      germanArticlesMode,
      germanPluralMode,
      aiProvider,
      customFolderName,
      customFolderDesc,
      folderDescMode,
      folderDescCondition,
      cardsCount,
      transcriptText
    } = req.body;

    const isAuto = cardsCount === "auto";
    const requestedCardsCount = typeof cardsCount === "number" ? Math.min(Math.max(cardsCount, 1), 50) : 10;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const provider = aiProvider === "groq" ? "groq" : "gemini";
    let apiKey = "";

    if (provider === "groq") {
      apiKey = customApiKey || process.env.GROQ_API_KEY || "";
      if (!apiKey) {
        // We set streaming headers first so we can report streaming status/errors properly
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.write(JSON.stringify({ type: "error", error: "الرجاء توفير مفتاح Groq API Key الخاص بك أولاً في الإعدادات أو الإعدادات الذكية." }) + "\n");
        return res.end();
      }
    } else {
      apiKey = customApiKey || process.env.GEMINI_API_KEY || "";
      if (!apiKey) {
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.write(JSON.stringify({ type: "error", error: "مفتاح Gemini API Key غير مكوّن على الخادم حالياً." }) + "\n");
        return res.end();
      }
    }

    // Set streaming headers
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Transfer-Encoding", "chunked");

    // Pre-emptive Rate Limiting Check (Sliding Window)
    const slidingStats = getSlidingWindowStatus();
    if (slidingStats.isBlocked) {
      res.write(JSON.stringify({ 
        type: "error", 
        error: `توقف مؤقت للخدمة: لقد بلغت الحد اليومي الأقصى للاستهلاك (${slidingStats.tokenLimit.toLocaleString()} توكن). يرجى الانتظار ${slidingStats.resetInFormatted} حتى يتم تصفير العداد، أو ترقية باقتك الآن.`
      }) + "\n");
      return res.end();
    }

    const sendProgress = (type: "status" | "complete" | "error", data: any) => {
      res.write(JSON.stringify({ type, ...data }) + "\n");
    };

    try {
      let rawModelResponseText = "";
      let systemInstruction = `أنت مساعد ذكي متخصص في توليد البطاقات التعليمية (Flashcards) والمجلدات لمساعدة الطلاب على الدراسة والمذاكرة بذكاء (StudySmarter).
تلقيت طلباً من المستخدم باللغة العربية لإنشاء بطاقات تعليمية لـ:
1. المجلد (folder): إذا طلب المستخدم موضوعاً جديداً أو مجلداً، قم بتوليده بمعلومات واضحة ومميزة باللغة العربية:
   - الاسم (name): اسم المجلد التعليمي باللغة العربية (مثلاً: "مفردات الألمانية: الطعام" أو "أساسيات الكيمياء العضوية").
   - الوصف (description): وصف للمجلد باللغة العربية يوضح ما يحتويه.
   - اللون (color): اختر لوناً جميلاً ومتناسقاً بصيغة الـ Hex (مثلاً: #0056f6, #10b981, #f59e0b, #ec4899, #8b5cf6, #3b82f6, #ef4444).
   - لغة الوجه الأمامي (frontLang): رمز لغة الكلمات الأمامية في البطاقات، مثل:
     - 'de' للألمانية
     - 'en' للإنجليزية
     - 'fr' للفرنسية
     - 'es' للإسبانية
     - 'ar' للعربية
   - لغة الوجه الخلفي (backLang): لغة الترجمة بالخلف، وهي دائمًا 'ar' (العربية) إلا إذا تم طلب لغة أخرى.
   - استعلام البحث عن صورة للمجلد (imageSearchQuery): كلمة أو عبارة قصيرة وبسيطة باللغة الإنجليزية تمثل موضوع المجلد ككل بصرياً للبحث عن غلاف مناسب له (مثلاً: 'travel', 'languages', 'germany', 'organic chemistry', 'robot').

2. البطاقات (cards): ${isAuto ? "قم بإنشاء مصفوفة غنية ومفيدة من البطاقات التعليمية بالعدد المناسب والملائم لتغطية المفهوم أو الموضوع المذكور بشكل ممتاز وشامل ودون تكرار (تلقائي):" : `قم بإنشاء قائمة غنية ومفيدة من البطاقات التعليمية تحتوي على ${requestedCardsCount} بطاقة بالضبط دون زيادة أو نقصان:`}
   - النص الأمامي (frontText): الكلمة أو السؤال أو الصيغة باللغة الهدف (مجردة تماماً بدون أداة التعريف، مثل "Tisch" أو "Auto" وليس "der Tisch" أو "das Auto").
   - النص الخلفي (backText): الترجمة أو الإجابة أو الشرح التفصيلي باللغة العربية (الوجه الخلفي).
   - وضع الأداة (isArticleMode): ضع قيمته true فقط إذا كانت الكلمة الأمامية اسماً في اللغة الألمانية ويملك أداة تعريف (der/die/das/die-plural).
   - الأداة الصحيحة (correctArticle): إذا كان isArticleMode يساوي true، حدد الأداة المناسبة بدقة بالغة: "der" للمذكر، "die" للمؤنث، "das" للمحايد، و "die-plural" للجمع. أداة التعريف تُكتب فقط هنا وممنوع تضمينها في frontText أو pluralText!
   - صيغة الجمع (pluralText): الكلمة بصيغة الجمع مجردة بدون أداة أيضاً (مثال: "Tische" وليس "die Tische").
   - تلميح الترجمة (translationHint): تلميح مفيد قصير لمساعدة الطالب على الحل أو النطق (اختياري).
   - الصعوبة (difficulty): مستوى الصعوبة المناسب: 'easy' أو 'medium' أو 'hard'.
   - استعلام البحث عن صورة (imageSearchQuery): كلمة أو عبارة قصيرة جداً وبسيطة باللغة الإنجليزية تمثل الكلمة/المفهوم بصرياً للبحث عنها في محرك الصور (مثل: 'apple', 'germany', 'running', 'molecule', 'clock').

تأكد من أن الكلمات دقيقة جداً لغوياً وصحيحة إملائياً، ومفيدة جداً للمتعلم.`;

      let customRules = "\n\n⚠️ قواعد التخصيص الإضافية التي حددها المستخدم ويجب الالتزام بها:";
      customRules += "\n- 🚨 قاعدة إلزامية هامة جداً لأدوات التعريف وصيغ الجمع الألمانية:";
      customRules += "\n  * يجب أن يحتوي النص الأمامي (frontText) على الكلمة مجردة تماماً بدون أداة التعريف (اكتب \"Tisch\" وليس \"der Tisch\"، واكتب \"Auto\" وليس \"das Auto\").";
      customRules += "\n  * أداة التعريف توضع فقط وحصراً في حقل (correctArticle) مثل \"der\" أو \"die\" أو \"das\" أو \"die-plural\". يمنع منعاً باتاً كتابة الأداة في frontText!";
      customRules += "\n  * صيغة الجمع في (pluralText) توضع مجردة تماماً بدون أداة التعريف أيضاً (اكتب \"Tische\" وليس \"die Tische\").";
      if (!isAuto) {
        customRules += `\n- يجب عليك توليد بالضبط ${requestedCardsCount} بطاقة تعليمية في مصفوفة cards. تذكر: العدد المطلوب هو ${requestedCardsCount} بطاقة بالضبط، ولا تقم بإنشاء أكثر أو أقل من هذا العدد حتى لو طلب المستخدم في نصه عدداً آخر. أهمل تماماً أي أرقام يذكرها المستخدم في البرومبت واعتمد فقط هذا الرقم المحدد وهو ${requestedCardsCount}.`;
      }
      if (descriptionMode === "on") {
        customRules += "\n- يجب عليك دائماً وبشكل إلزامي كتابة وصف أو تلميح ترجمة وشرح (translationHint) غني ومفيد لكل بطاقة من البطاقات.";
      } else if (descriptionMode === "off") {
        customRules += "\n- ممنوع تماماً كتابة أي وصف أو تلميحات ترجمة. يجب أن تكون قيمة (translationHint) دائماً نصاً فارغاً \"\" لكل البطاقات.";
      } else {
        customRules += "\n- أضف تلميح ترجمة أو وصفاً (translationHint) عند الحاجة أو إذا كان مفيداً للبطاقة.";
      }

      if (germanArticlesMode === "on") {
        customRules += "\n- يجب تفعيل وضع أدوات التعريف الألمانية (isArticleMode = true) لكل الأسماء الألمانية وتحديد الأداة المناسبة (der/die/das/die-plural) في حقل correctArticle.";
      } else if (germanArticlesMode === "off") {
        customRules += "\n- ممنوع تماماً استخدام وضع أدوات التعريف الألمانية. يجب وضع (isArticleMode = false) and (correctArticle = \"\") لجميع البطاقات دون استثناء.";
      } else {
        customRules += "\n- وضع قيمة isArticleMode = true فقط إذا كانت الكلمة الأمامية اسماً في اللغة الألمانية ويملك أداة تعريف (der/die/das/die-plural).";
      }

      if (germanPluralMode === "on") {
        customRules += "\n- يجب تفعيل وضع صيغة الجمع (isPluralMode = true) لكل الأسماء الألمانية وتوفير الكلمة بصيغة الجمع في حقل pluralText (مثال: 'Tische' للكلمة 'Tisch').";
      } else if (germanPluralMode === "off") {
        customRules += "\n- ممنوع تماماً استخدام صيغة الجمع الألمانية. يجب وضع (isPluralMode = false) و (pluralText = \"\") لجميع البطاقات دون استثناء.";
      } else {
        customRules += "\n- ضع قيمة isPluralMode = true فقط إذا كانت الكلمة الأمامية اسماً ألمانياً له صيغة جمع معروفة، ووفر الكلمة بصيغة الجمع في حقل pluralText (مثال: 'Tische').";
      }

      if (imagesMode === "off") {
        customRules += "\n- ممنوع تماماً وضع استعلامات بحث صور أو الحث على البحث عن صور للمجلد والبطاقات. اجعل حقل (imageSearchQuery) فارغاً دائماً \"\".";
      } else if (imagesMode === "on") {
        customRules += "\n- يجب توفير استعلامات بحث صور (imageSearchQuery) دقيقة وذكية باللغة الإنجليزية لكل من المجلد والبطاقات.";
      }

      // Folder Name & Description Customizations
      if (customFolderName && customFolderName.trim()) {
        customRules += `\n- يجب عليك كتابة الاسم للمجلد (folder.name) ليكون بالضبط: "${customFolderName.trim()}".`;
      }

      if (folderDescMode === "off") {
        customRules += `\n- يجب أن يكون وصف المجلد (folder.description) دائماً نصاً فارغاً "".`;
      } else if (folderDescMode === "on") {
        if (customFolderDesc && customFolderDesc.trim()) {
          customRules += `\n- يجب عليك كتابة وصف المجلد (folder.description) ليكون بالضبط: "${customFolderDesc.trim()}".`;
        } else if (folderDescCondition && folderDescCondition.trim()) {
          customRules += `\n- يجب كتابة وصف للمجلد (folder.description) يلتزم بدقة بالشروط التالية: "${folderDescCondition.trim()}".`;
        } else {
          customRules += `\n- يجب كتابة وصف تفصيلي ومفيد للمجلد (folder.description).`;
        }
      } else {
        if (customFolderDesc && customFolderDesc.trim()) {
          customRules += `\n- يفضل أن يكون وصف المجلد (folder.description) هو: "${customFolderDesc.trim()}".`;
        } else if (folderDescCondition && folderDescCondition.trim()) {
          customRules += `\n- يفضل أن يلتزم وصف المجلد (folder.description) بالشروط التالية: "${folderDescCondition.trim()}".`;
        }
      }

      systemInstruction += customRules;

      if (transcriptText && transcriptText.trim()) {
        systemInstruction += `\n\n⚠️ هام جداً - المصدر تفريغ يوتيوب (spT):
لقد قام الطالب بتوفير نص تفريغ مصاحب مأخوذ من يوتيوب. يجب عليك استخراج الكلمات الأساسية، والمفاهيم الهامة، والأسئلة والأجوبة الدراسية مباشرة من هذا النص أدناه فقط لترتيبها وصياغتها كفلاش كارد تلخص هذا الفيديو وتساعد الطالب على فهمه ودراسته:
"""
${transcriptText.trim()}
"""`;
      }

      if (excludeList && Array.isArray(excludeList) && excludeList.length > 0) {
        systemInstruction += `\n\n⚠️ تنبيه هام للغاية لمنع تكرار البطاقات:
لقد قام المستخدم بالفعل بتوليد الوجبة السابقة وحصل على البطاقات التالية: [${excludeList.join(", ")}].
يجب عليك الآن توليد وجبة ثانية (دفعة جديدة) مختلفة تماماً وبطاقات جديدة كلياً لا تحتوي على أي كلمة من الكلمات أو المفاهيم المذكورة في القائمة السابقة على الإطلاق! وفر بطاقات أخرى مكملة أو مفردات وعبارات جديدة تماماً تناسب نفس طلب المستخدم ومستواه الدراسي.`;
      }

      let generatedData: any = null;
      let usageStats: any = null;

      if (provider === "groq") {
        sendProgress("status", { message: "جاري صياغة المفاهيم وتدقيقها بدقة عبر خوادم Groq الفائقة..." });

        const systemMessage = `${systemInstruction}\n\nYou must return ONLY a valid, single JSON object containing 'folder' (which represents the deck, with fields name, description, color, frontLang, backLang, imageSearchQuery) and 'cards' (the array of flashcards). No conversational text, no markdown block wrappers. Return raw, well-formatted JSON.`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: prompt }
            ],
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Groq API returned status ${response.status}`);
        }

        const chatResult = await response.json();
        const responseText = chatResult?.choices?.[0]?.message?.content || "";
        rawModelResponseText = responseText;
        if (!responseText.trim()) {
          throw new Error("تلقينا رداً فارغاً من خوادم Groq.");
        }

        generatedData = JSON.parse(responseText.trim());
        const usage = chatResult?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        
        const groqRateLimits = {
          limitRequests: response.headers.get("x-ratelimit-limit-requests") || response.headers.get("ratelimit-limit-requests") || "",
          limitTokens: response.headers.get("x-ratelimit-limit-tokens") || response.headers.get("ratelimit-limit-tokens") || "",
          remainingRequests: response.headers.get("x-ratelimit-remaining-requests") || response.headers.get("ratelimit-remaining-requests") || "",
          remainingTokens: response.headers.get("x-ratelimit-remaining-tokens") || response.headers.get("ratelimit-remaining-tokens") || "",
          resetRequests: response.headers.get("x-ratelimit-reset-requests") || response.headers.get("ratelimit-reset-requests") || "",
          resetTokens: response.headers.get("x-ratelimit-reset-tokens") || response.headers.get("ratelimit-reset-tokens") || "",
        };

        usageStats = {
          model: "llama-3.3-70b-versatile",
          provider: "groq",
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          rateLimits: groqRateLimits,
          rawHeaders: extractRateLimitHeaders(response.headers)
        };

        globalRateLimitsCache.groq = {
          rateLimits: groqRateLimits,
          rawHeaders: extractRateLimitHeaders(response.headers)
        };
        globalRateLimitsCache.lastUpdated = new Date().toISOString();

        sendProgress("status", { message: "تم توليد البطاقات من Groq بنجاح! جاري جلب الصور وتجهيز غلاف المجلد..." });
      } else {
        sendProgress("status", { message: "جاري صياغة المفاهيم اللغوية وتدقيقها بدقة عبر جيميناي..." });

        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        let capturedGeminiHeaders: Headers | null = null;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input, init) => {
          const res = await originalFetch(input, init);
          const urlStr = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as any).url || "");
          if (urlStr.includes("generativelanguage.googleapis.com")) {
            capturedGeminiHeaders = res.headers;
          }
          return res;
        };

        let response: any;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  folder: {
                    type: Type.OBJECT,
                    description: "The generated folder/deck if creating a new one. Can be null if generating cards for existing folder.",
                    properties: {
                      name: { type: Type.STRING, description: "Name of the study folder in Arabic" },
                      description: { type: Type.STRING, description: "Short description of what this folder is about in Arabic" },
                      color: { type: Type.STRING, description: "Elegant hex color for styling" },
                      frontLang: { type: Type.STRING, description: "Language code for the front side (e.g. 'de', 'en', 'fr', 'es')" },
                      backLang: { type: Type.STRING, description: "Language code for the back side (usually 'ar')" },
                      imageSearchQuery: { type: Type.STRING, description: "A simple English word or short phrase representing the main subject of the whole folder/deck for finding an elegant cover image (e.g., 'germany', 'vocabulary', 'paris', 'chemistry', 'robot')" }
                    },
                    required: ["name", "color", "frontLang", "backLang", "imageSearchQuery"]
                  },
                  cards: {
                    type: Type.ARRAY,
                    description: "Array of generated high-quality flashcards",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        frontText: { type: Type.STRING, description: "Front side term, question or phrase in target language" },
                        backText: { type: Type.STRING, description: "Back side translation, answer or explanation in Arabic" },
                        isArticleMode: { type: Type.BOOLEAN, description: "True if front text is a German noun that requires an article" },
                        correctArticle: { type: Type.STRING, description: "The correct article 'der', 'die', 'das', or 'die-plural' if German article mode, otherwise empty" },
                        isPluralMode: { type: Type.BOOLEAN, description: "True if front text is a German noun and has a plural form" },
                        pluralText: { type: Type.STRING, description: "The correct plural form of the German noun, e.g., 'Tische' or empty if not applicable" },
                        translationHint: { type: Type.STRING, description: "Short supportive translation hint or tip (optional)" },
                        difficulty: { type: Type.STRING, description: "Difficulty level: 'easy', 'medium', or 'hard'" },
                        imageSearchQuery: { type: Type.STRING, description: "A simple, descriptive single English noun or phrase to search for an image representing the concept (e.g. 'bicycle', 'apple', 'sun', 'running', 'sadness')." }
                      },
                      required: ["frontText", "backText", "difficulty", "imageSearchQuery"]
                    }
                  }
                },
                required: ["cards"]
              }
            }
          });
        } finally {
          globalThis.fetch = originalFetch;
        }

        const responseText = response.text;
        rawModelResponseText = responseText;
        if (!responseText) {
          throw new Error("Empty response from Gemini API");
        }

        generatedData = JSON.parse(responseText.trim());
        if (generatedData && Array.isArray(generatedData.cards)) {
          generatedData.cards = generatedData.cards.map(sanitizeCardArticleAndPlural);
        }
        const usageMetadata = response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
        
        let geminiRateLimits: any = null;
        let geminiRawHeaders: any = null;
        if (capturedGeminiHeaders) {
          geminiRateLimits = {
            limitRequests: capturedGeminiHeaders.get("x-ratelimit-limit-requests") || capturedGeminiHeaders.get("ratelimit-limit-requests") || "",
            limitTokens: capturedGeminiHeaders.get("x-ratelimit-limit-tokens") || capturedGeminiHeaders.get("ratelimit-limit-tokens") || "",
            remainingRequests: capturedGeminiHeaders.get("x-ratelimit-remaining-requests") || capturedGeminiHeaders.get("ratelimit-remaining-requests") || "",
            remainingTokens: capturedGeminiHeaders.get("x-ratelimit-remaining-tokens") || capturedGeminiHeaders.get("ratelimit-remaining-tokens") || "",
            resetRequests: capturedGeminiHeaders.get("x-ratelimit-reset-requests") || capturedGeminiHeaders.get("ratelimit-reset-requests") || "",
            resetTokens: capturedGeminiHeaders.get("x-ratelimit-reset-tokens") || capturedGeminiHeaders.get("ratelimit-reset-tokens") || "",
          };
          geminiRawHeaders = extractRateLimitHeaders(capturedGeminiHeaders);
        }

        usageStats = {
          model: "gemini-3.5-flash",
          provider: "gemini",
          promptTokens: usageMetadata.promptTokenCount,
          completionTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount,
          rateLimits: geminiRateLimits,
          rawHeaders: geminiRawHeaders
        };

        globalRateLimitsCache.gemini = {
          rateLimits: geminiRateLimits,
          rawHeaders: geminiRawHeaders
        };
        globalRateLimitsCache.lastUpdated = new Date().toISOString();

        sendProgress("status", { message: "تم توليد البطاقات من Gemini بنجاح! جاري جلب الصور وتجهيز غلاف المجلد..." });
      }

      // Automatically search for a relevant cover image for the folder if it exists
      if (imagesMode !== "off" && generatedData && generatedData.folder) {
        const folderQuery = generatedData.folder.imageSearchQuery || generatedData.folder.name;
        if (folderQuery && folderQuery.trim().length > 0) {
          try {
            sendProgress("status", { message: `جاري جلب غلاف المجلد: "${generatedData.folder.name}"...` });
            const { imageUrl } = await fetchSingleImageWithFallbacks(folderQuery, 1);
            if (imageUrl) {
              generatedData.folder.coverImage = imageUrl;
              generatedData.folder.coverImagePosition = "50% 50%";
              console.log(`[AI Auto-Image] Folder Cover image found for "${folderQuery}": ${generatedData.folder.coverImage}`);
            } else {
              console.log(`[AI Auto-Image] Folder Cover: No images found for "${folderQuery}"`);
            }
          } catch (err) {
            console.error(`[AI Auto-Image] Folder Cover: Error searching image for "${folderQuery}":`, err);
          }
        }
      }

      // Automatically search for a relevant image for each card using smart batching & retry rounds
      if (imagesMode !== "off" && generatedData && Array.isArray(generatedData.cards)) {
        const cardItems = generatedData.cards.map((card: any, index: number) => ({
          index,
          card,
          query: card.imageSearchQuery || card.frontText,
          imageUrl: "",
          candidateUrls: [] as string[]
        }));

        await fetchBatchCardImages(cardItems, sendProgress, 8);

        generatedData.cards = cardItems.map((item) => ({
          ...item.card,
          frontImage: item.imageUrl || undefined,
          frontImagePosition: item.imageUrl ? "50% 50%" : undefined,
          autoImageCandidates: item.candidateUrls && item.candidateUrls.length > 0 ? item.candidateUrls : undefined
        }));
      }

      sendProgress("status", { message: "جاري صياغة اللمسات الأخيرة وإدراج البطاقات في مكانها..." });
      if (usageStats) {
        addUsageLog(usageStats.promptTokens, usageStats.completionTokens, usageStats.totalTokens, usageStats.provider);
      }
      sendProgress("complete", { data: generatedData, usage: usageStats, rawModelResponse: rawModelResponseText });
      res.end();
    } catch (err) {
      console.error("Gemini AI Generation failed:", err);
      sendProgress("error", { error: (err as Error).message || "AI Generation failed" });
      res.end();
    }
  });

  // API Route - Batch Refine Cards using Gemini API (with NDJSON Progress Streaming)
  app.post("/api/ai/refine", async (req, res) => {
    const { 
      cards, 
      customApiKey, 
      modifyDescription, 
      descriptionIssue, 
      descriptionInstruction, 
      modifyImages, 
      imageInstruction,
      modifyFrontText,
      frontTextInstruction,
      modifyBackText,
      backTextInstruction,
      germanArticlesMode,
      germanPluralMode,
      germanPluralInstruction,
      aiProvider
    } = req.body;

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: "Cards array is required and cannot be empty" });
    }

    const provider = aiProvider === "groq" ? "groq" : "gemini";
    let apiKey = "";

    if (provider === "groq") {
      apiKey = customApiKey || process.env.GROQ_API_KEY || "";
      if (!apiKey) {
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.write(JSON.stringify({ type: "error", error: "الرجاء توفير مفتاح Groq API Key الخاص بك أولاً في الإعدادات أو الإعدادات الذكية." }) + "\n");
        return res.end();
      }
    } else {
      apiKey = customApiKey || process.env.GEMINI_API_KEY || "";
      if (!apiKey) {
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.write(JSON.stringify({ type: "error", error: "مفتاح Gemini API Key غير مكوّن على الخادم حالياً." }) + "\n");
        return res.end();
      }
    }

    // Set streaming headers
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Transfer-Encoding", "chunked");

    // Pre-emptive Rate Limiting Check (Sliding Window)
    const slidingStats = getSlidingWindowStatus();
    if (slidingStats.isBlocked) {
      res.write(JSON.stringify({ 
        type: "error", 
        error: `توقف مؤقت للخدمة: لقد بلغت الحد اليومي الأقصى للاستهلاك (${slidingStats.tokenLimit.toLocaleString()} توكن). يرجى الانتظار ${slidingStats.resetInFormatted} حتى يتم تصفير العداد، أو ترقية باقتك الآن.`
      }) + "\n");
      return res.end();
    }

    const sendProgress = (type: "status" | "complete" | "error", data: any) => {
      res.write(JSON.stringify({ type, ...data }) + "\n");
    };

    try {
      let rawModelResponseText = "";
      let systemInstruction = `أنت خبير تعليمي ومحرر ومترجم لغات محترف ومصمم بطاقات تفاعلية.
لقد قمنا بتوليد مجموعة من البطاقات التعليمية (flashcards)، والآن يريد المستخدم تعديلها/تحسينها جماعياً بناءً على رغبته وتوجيهات محددة.

المدخلات هي قائمة من البطاقات الحالية بصيغة JSON. يجب عليك قراءة كل بطاقة، وفهم التعديلات المطلوبة بدقة، وتطبيقها على جميع البطاقات، ثم إرجاع قائمة البطاقات المعدلة بنفس هيكل الـ JSON الأصلي تماماً.

⚠️ شروط هامة جداً:
- حافظ على جوهر ومعنى المصطلحات الأساسية للبطاقات إلا إذا طلب المستخدم تغيير النصوص الأساسية صراحةً.
- التزم بتعديل الحقول المطلوبة فقط التي تقع ضمن طلب التعديل النشط.
- أرجع فقط مصفوفة البطاقات المعدلة بداخل حقل "cards" في الـ JSON.`;

      let refinePrompt = `البطاقات الحالية المراد تعديلها:\n${JSON.stringify(cards, null, 2)}\n\n`;
      refinePrompt += `الرجاء تطبيق التعديلات التالية على جميع البطاقات بدون استثناء:\n`;

      if (germanArticlesMode === "on") {
        refinePrompt += `- يجب تفعيل وضع أدوات التعريف الألمانية (isArticleMode = true) لكل الأسماء الألمانية وتحديد الأداة المناسبة (der/die/das/die-plural) في حقل correctArticle لجميع البطاقات.\n`;
      } else if (germanArticlesMode === "off") {
        refinePrompt += `- ممنوع تماماً استخدام وضع أدوات التعريف الألمانية. يجب وضع (isArticleMode = false) و (correctArticle = "") لجميع البطاقات دون استثناء.\n`;
      } else if (germanArticlesMode === "auto") {
        refinePrompt += `- وضع قيمة isArticleMode = true فقط إذا كانت الكلمة الأمامية اسماً في اللغة الألمانية ويملك أداة تعريف (der/die/das/die-plural)، مع وضع correctArticle بالأداة المناسبة.\n`;
      }

      if (germanPluralMode === "on") {
        refinePrompt += `- يجب تفعيل وضع صيغة الجمع (isPluralMode = true) لكل الأسماء الألمانية وتوفير الكلمة بصيغة الجمع في حقل pluralText (مثال: 'Tische' للكلمة 'Tisch').\n`;
      } else if (germanPluralMode === "off") {
        refinePrompt += `- ممنوع تماماً استخدام صيغة الجمع الألمانية. يجب وضع (isPluralMode = false) و (pluralText = "") لجميع البطاقات دون استثناء.\n`;
      } else if (germanPluralMode === "auto") {
        refinePrompt += `- ضع قيمة isPluralMode = true فقط إذا كانت الكلمة الأمامية اسماً ألمانياً له صيغة جمع معروفة، ووفر الكلمة بصيغة الجمع في حقل pluralText (مثال: 'Tische').\n`;
      }
      if (germanPluralMode !== "keep" && germanPluralInstruction && germanPluralInstruction.trim()) {
        refinePrompt += `  * شروط وتوجيهات صيغة الجمع الإضافية: "${germanPluralInstruction.trim()}"\n`;
      }

      if (modifyDescription) {
        refinePrompt += `- تعديل وصف الترجمة والتلميحات (translationHint):\n`;
        if (descriptionIssue) {
          refinePrompt += `  * المشكلة في الوصف السابق: "${descriptionIssue}"\n`;
        }
        refinePrompt += `  * التوجيهات لتوليد الوصف والتلميحات الجديدة: "${descriptionInstruction}"\n`;
      }

      if (modifyImages) {
        refinePrompt += `- تعديل حقل البحث عن الصور (imageSearchQuery):\n`;
        refinePrompt += `  * التوجيهات الجديدة لاختيار ونمط الصور: "${imageInstruction}"\n`;
        refinePrompt += `  * يجب توليد كلمات مفتاحية (imageSearchQuery) جديدة باللغة الإنجليزية لكل بطاقة تلخص المفهوم بطريقة تناسب هذا النمط الجديد.\n`;
      }

      if (modifyFrontText) {
        refinePrompt += `- تعديل النص الأمامي (frontText):\n`;
        refinePrompt += `  * توجيهات تعديل النص الأمامي: "${frontTextInstruction}"\n`;
      }

      if (modifyBackText) {
        refinePrompt += `- تعديل النص الخلفي والترجمة (backText):\n`;
        refinePrompt += `  * توجيهات تعديل النص الخلفي والترجمة: "${backTextInstruction}"\n`;
      }

      let generatedData: any = null;
      let usageStats: any = null;

      if (provider === "groq") {
        sendProgress("status", { message: "جاري الاتصال بخدمة Groq لإعادة صياغة البطاقات..." });

        const systemMessage = `${systemInstruction}\n\nYou must return ONLY a valid, single JSON object containing a "cards" array of refined flashcard objects. No conversational text, no markdown block wrappers. Return raw, well-formatted JSON.`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: refinePrompt }
            ],
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Groq API returned status ${response.status}`);
        }

        const chatResult = await response.json();
        const responseText = chatResult?.choices?.[0]?.message?.content || "";
        rawModelResponseText = responseText;
        if (!responseText.trim()) {
          throw new Error("تلقينا رداً فارغاً من خوادم Groq.");
        }

        generatedData = JSON.parse(responseText.trim());
        const usage = chatResult?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        
        const groqRateLimits = {
          limitRequests: response.headers.get("x-ratelimit-limit-requests") || response.headers.get("ratelimit-limit-requests") || "",
          limitTokens: response.headers.get("x-ratelimit-limit-tokens") || response.headers.get("ratelimit-limit-tokens") || "",
          remainingRequests: response.headers.get("x-ratelimit-remaining-requests") || response.headers.get("ratelimit-remaining-requests") || "",
          remainingTokens: response.headers.get("x-ratelimit-remaining-tokens") || response.headers.get("ratelimit-remaining-tokens") || "",
          resetRequests: response.headers.get("x-ratelimit-reset-requests") || response.headers.get("ratelimit-reset-requests") || "",
          resetTokens: response.headers.get("x-ratelimit-reset-tokens") || response.headers.get("ratelimit-reset-tokens") || "",
        };

        usageStats = {
          model: "llama-3.3-70b-versatile",
          provider: "groq",
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          rateLimits: groqRateLimits,
          rawHeaders: extractRateLimitHeaders(response.headers)
        };

        globalRateLimitsCache.groq = {
          rateLimits: groqRateLimits,
          rawHeaders: extractRateLimitHeaders(response.headers)
        };
        globalRateLimitsCache.lastUpdated = new Date().toISOString();

        sendProgress("status", { message: "جاري تعديل البطاقات ذكياً عبر Groq طبقاً لتوجيهاتك..." });
      } else {
        sendProgress("status", { message: "جاري الاتصال بخدمة جيميناي لإعادة صياغة البطاقات..." });

        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "AI-Studio-Applet"
            }
          }
        });

        sendProgress("status", { message: "جاري تعديل البطاقات ذكياً عبر جيميناي طبقاً لتوجيهاتك..." });

        let capturedGeminiHeaders: Headers | null = null;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input, init) => {
          const res = await originalFetch(input, init);
          const urlStr = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as any).url || "");
          if (urlStr.includes("generativelanguage.googleapis.com")) {
            capturedGeminiHeaders = res.headers;
          }
          return res;
        };

        let response: any;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: refinePrompt,
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  cards: {
                    type: Type.ARRAY,
                    description: "Array of refined high-quality flashcards matching the original structure but updated with new instructions",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        frontText: { type: Type.STRING, description: "Front side term, question or phrase in target language" },
                        backText: { type: Type.STRING, description: "Back side translation, answer or explanation in Arabic" },
                        isArticleMode: { type: Type.BOOLEAN, description: "True if front text is a German noun that requires an article" },
                        correctArticle: { type: Type.STRING, description: "The correct article 'der', 'die', 'das', or 'die-plural' if German article mode, otherwise empty" },
                        isPluralMode: { type: Type.BOOLEAN, description: "True if front text is a German noun and has a plural form" },
                        pluralText: { type: Type.STRING, description: "The correct plural form of the German noun, e.g., 'Tische' or empty if not applicable" },
                        translationHint: { type: Type.STRING, description: "Short supportive translation hint or tip (optional)" },
                        difficulty: { type: Type.STRING, description: "Difficulty level: 'easy', 'medium', or 'hard'" },
                        imageSearchQuery: { type: Type.STRING, description: "A simple, descriptive single English noun or phrase to search for an image representing the concept (e.g. 'bicycle', 'apple', 'sun', 'running', 'sadness')." }
                      },
                      required: ["frontText", "backText", "difficulty", "imageSearchQuery"]
                    }
                  }
                },
                required: ["cards"]
              }
            }
          });
        } finally {
          globalThis.fetch = originalFetch;
        }

        const responseText = response.text;
        rawModelResponseText = responseText;
        if (!responseText) {
          throw new Error("No response text received from Gemini");
        }

        generatedData = JSON.parse(responseText.trim());
        const usageMetadata = response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
        
        let geminiRateLimits: any = null;
        let geminiRawHeaders: any = null;
        if (capturedGeminiHeaders) {
          geminiRateLimits = {
            limitRequests: capturedGeminiHeaders.get("x-ratelimit-limit-requests") || capturedGeminiHeaders.get("ratelimit-limit-requests") || "",
            limitTokens: capturedGeminiHeaders.get("x-ratelimit-limit-tokens") || capturedGeminiHeaders.get("ratelimit-limit-tokens") || "",
            remainingRequests: capturedGeminiHeaders.get("x-ratelimit-remaining-requests") || capturedGeminiHeaders.get("ratelimit-remaining-requests") || "",
            remainingTokens: capturedGeminiHeaders.get("x-ratelimit-remaining-tokens") || capturedGeminiHeaders.get("ratelimit-remaining-tokens") || "",
            resetRequests: capturedGeminiHeaders.get("x-ratelimit-reset-requests") || capturedGeminiHeaders.get("ratelimit-reset-requests") || "",
            resetTokens: capturedGeminiHeaders.get("x-ratelimit-reset-tokens") || capturedGeminiHeaders.get("ratelimit-reset-tokens") || "",
          };
          geminiRawHeaders = extractRateLimitHeaders(capturedGeminiHeaders);
        }

        usageStats = {
          model: "gemini-3.5-flash",
          provider: "gemini",
          promptTokens: usageMetadata.promptTokenCount,
          completionTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount,
          rateLimits: geminiRateLimits,
          rawHeaders: geminiRawHeaders
        };

        globalRateLimitsCache.gemini = {
          rateLimits: geminiRateLimits,
          rawHeaders: geminiRawHeaders
        };
        globalRateLimitsCache.lastUpdated = new Date().toISOString();
      }

      if (generatedData && Array.isArray(generatedData.cards)) {
        generatedData.cards = generatedData.cards.map(sanitizeCardArticleAndPlural);
      }

      // If modifyImages is true, we should fetch new images using smart batching & retry rounds
      if (modifyImages && generatedData && generatedData.cards) {
        const cardItems = generatedData.cards.map((card: any, index: number) => {
          const searchQuery = card.imageSearchQuery || card.frontText;
          let customSearchQuery = searchQuery;
          if (imageInstruction && imageInstruction.trim()) {
            customSearchQuery = `${searchQuery} ${imageInstruction}`;
          }
          return {
            index,
            card,
            query: customSearchQuery,
            imageUrl: "",
            candidateUrls: [] as string[]
          };
        });

        await fetchBatchCardImages(cardItems, sendProgress, 8);

        generatedData.cards = cardItems.map((item) => ({
          ...item.card,
          frontImage: item.imageUrl || undefined,
          frontImagePosition: item.imageUrl ? "50% 50%" : undefined,
          autoImageCandidates: item.candidateUrls && item.candidateUrls.length > 0 ? item.candidateUrls : undefined
        }));
      } else if (generatedData && generatedData.cards) {
        // Map cards by index to keep original frontImage / frontImagePosition if it was not modified
        generatedData.cards = generatedData.cards.map((card: any, index: number) => {
          const originalCard = cards[index];
          if (originalCard) {
            return {
              ...card,
              frontImage: card.frontImage || originalCard.frontImage,
              frontImagePosition: card.frontImagePosition || originalCard.frontImagePosition
            };
          }
          return card;
        });
      }

      sendProgress("status", { message: "جاري صياغة اللمسات الأخيرة وتحديث البطاقات في المجلد..." });
      if (usageStats) {
        addUsageLog(usageStats.promptTokens, usageStats.completionTokens, usageStats.totalTokens, usageStats.provider);
      }
      sendProgress("complete", { data: generatedData, usage: usageStats, rawModelResponse: rawModelResponseText });
      res.end();
    } catch (err) {
      console.error("Gemini AI Refine failed:", err);
      sendProgress("error", { error: (err as Error).message || "AI Refine failed" });
      res.end();
    }
  });

function cleanBrTagsFromObj<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/&lt;br\s*\/?&gt;/gi, "\n") as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanBrTagsFromObj(item)) as unknown as T;
  }
  if (obj && typeof obj === "object" && obj !== null) {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      cleaned[key] = cleanBrTagsFromObj((obj as any)[key]);
    }
    return cleaned;
  }
  return obj;
}

function sanitizeCardArticleAndPlural(card: any): any {
  if (!card || typeof card !== "object") return card;
  let frontText = typeof card.frontText === "string" ? card.frontText.trim() : "";
  let pluralText = typeof card.pluralText === "string" ? card.pluralText.trim() : "";
  let correctArticle = typeof card.correctArticle === "string" ? card.correctArticle.trim() : "";
  let isArticleMode = !!card.isArticleMode;
  let isPluralMode = !!card.isPluralMode;

  // 1. Clean frontText if it starts with der / die / das / die-plural
  const frontMatch = frontText.match(/^(der|die|das)\s+(.+)$/i);
  if (frontMatch) {
    const extractedArticle = frontMatch[1].toLowerCase();
    const noun = frontMatch[2].trim();
    frontText = noun;
    isArticleMode = true;
    if (!correctArticle || correctArticle === "") {
      correctArticle = extractedArticle;
    }
  }

  // 2. Clean pluralText if it starts with der / die / das
  const pluralMatch = pluralText.match(/^(der|die|das)\s+(.+)$/i);
  if (pluralMatch) {
    pluralText = pluralMatch[2].trim();
    isPluralMode = true;
  }

  return {
    ...card,
    frontText,
    pluralText,
    correctArticle,
    isArticleMode,
    isPluralMode
  };
}

  // API Route - Snapchat-style AI Writing & Grammar Corrector & Free Chat
  app.post("/api/ai/correct", express.json(), async (req, res) => {
    try {
      const { text, targetLanguage, targetLevel, chatHistory, customApiKey, geminiApiKey, groqApiKey: bodyGroqApiKey, sendMode, selectedModel, sentenceTopic, sentenceContext, sentenceGrammarFocus, isNewSentenceRequest } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({ error: "الرجاء إدخال النص المطلوب" });
      }

      const effectiveGroqKey = bodyGroqApiKey || req.body.groqApiKey || (selectedModel && (selectedModel.includes("groq") || selectedModel === "groq-llama-[#3.3-70b]") ? customApiKey : "") || process.env.GROQ_API_KEY || "";
      const effectiveGeminiKey = geminiApiKey || req.body.geminiApiKey || (selectedModel && !selectedModel.includes("groq") ? customApiKey : "") || process.env.GEMINI_API_KEY || "";

      const langName = targetLanguage || "الألمانية (German)";
      const userLevel = targetLevel || "B1.1";

      // Determine model ID and friendly display name
      const reqModel = selectedModel || "gemini-3.6-flash";
      let modelId = reqModel;
      let aiModelName = reqModel;
      let isGroqPrimary = false;

      if (reqModel === "groq-llama-3.3-70b" || reqModel === "groq" || req.body.aiProvider === "groq") {
        isGroqPrimary = true;
        aiModelName = "Groq Llama 3.3 70B 🚀";
        if (!effectiveGroqKey) {
          return res.status(400).json({ error: "مفتاح Groq API غير مكوّن. يرجى إدخال مفتاح Groq الخاص بك في إعدادات التطبيق." });
        }
      } else if (reqModel === "grok-2" || reqModel === "grok") {
        if (effectiveGroqKey && !effectiveGeminiKey) {
          isGroqPrimary = true;
          aiModelName = "Grok 2 (Groq Backend) 🤖";
        } else {
          modelId = "gemini-3.6-flash";
          aiModelName = "Grok 2 🤖";
        }
      } else if (reqModel === "gemini-3.6-flash") {
        modelId = "gemini-3.6-flash";
        aiModelName = "Gemini 3.6 Flash ⚡";
      } else if (reqModel === "gemini-3.5-flash") {
        modelId = "gemini-3.5-flash";
        aiModelName = "Gemini 3.5 Flash ⚡";
      } else if (reqModel === "gemini-3.5-flash-lite") {
        modelId = "gemini-3.5-flash-lite";
        aiModelName = "Gemini 3.5 Flash Lite ⚡";
      } else if (reqModel === "gemini-3.1-flash-lite") {
        modelId = "gemini-3.1-flash-lite";
        aiModelName = "Gemini 3.1 Flash Lite ⚡";
      } else if (reqModel === "gemini-2.5-flash-lite") {
        modelId = "gemini-2.5-flash-lite";
        aiModelName = "Gemini 2.5 Flash Lite ⚡";
      } else if (reqModel === "gemini-2.5-pro" || reqModel === "gemini-1.5-pro") {
        modelId = "gemini-2.5-pro";
        aiModelName = "Gemini 2.5 Pro 💎";
      } else if (reqModel === "gemini-1.5-flash") {
        modelId = "gemini-1.5-flash";
        aiModelName = "Gemini 1.5 Flash ⚡";
      } else if (reqModel === "gemini-2.5-flash") {
        modelId = "gemini-2.5-flash";
        aiModelName = "Gemini 2.5 Flash ⚡";
      } else {
        modelId = reqModel;
        aiModelName = reqModel;
      }

      if (!isGroqPrimary && !effectiveGeminiKey) {
        return res.status(400).json({ error: "مفتاح Gemini API Key غير مكوّن على الخادم حالياً. يرجى إضافته في الإعدادات." });
      }

      // Helper function to call Gemini safely with automatic fallback on unavailable/high demand/404 errors
      const callGeminiSafe = async (targetModel: string, configObj: any) => {
        if (!ai) throw new Error("مفتاح Gemini API غير مكوّن.");

        const candidateModels = [
          targetModel,
          "gemini-3.6-flash",
          "gemini-3.5-flash",
          "gemini-2.5-flash",
          "gemini-1.5-flash",
          "gemini-2.5-pro"
        ];

        const validCandidates = Array.from(
          new Set(candidateModels.filter(Boolean))
        );

        let lastErr: any = null;
        for (const candidate of validCandidates) {
          try {
            const result = await ai.models.generateContent({
              model: candidate,
              contents: promptText,
              config: configObj
            });

            // Update friendly model name if a fallback model was used
            if (candidate === "gemini-3.6-flash") aiModelName = "Gemini 3.6 Flash ⚡";
            else if (candidate === "gemini-3.5-flash") aiModelName = "Gemini 3.5 Flash ⚡";
            else if (candidate === "gemini-2.5-flash") aiModelName = "Gemini 2.5 Flash ⚡";
            else if (candidate === "gemini-1.5-flash") aiModelName = "Gemini 1.5 Flash ⚡";

            return result;
          } catch (err: any) {
            lastErr = err;
            console.warn(`[Gemini Safe Call Warning] Model '${candidate}' failed: ${err?.message || err}. Trying next fallback candidate...`);
          }
        }
        throw lastErr;
      };

      // Helper function to call Groq API with system instructions and user prompt
      const callGroqService = async (sysInst: string, promptContent: string) => {
        if (!effectiveGroqKey) throw new Error("مفتاح Groq API غير متوفر في الإعدادات.");

        const resGroq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${effectiveGroqKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: `${sysInst}\n\nتنبيه هام جداً: يجب إرجاع كائن JSON صريح ومطابق تماماً للمطلوب بدون أي نصوص أو شروحات خارج نطاق الـ JSON.` },
              { role: "user", content: promptContent }
            ],
            temperature: 0.2
          })
        });

        if (!resGroq.ok) {
          const errBody = await resGroq.json().catch(() => ({}));
          throw new Error(errBody?.error?.message || `Groq API Error status ${resGroq.status}`);
        }

        const dataGroq = await resGroq.json();
        const outputText = dataGroq?.choices?.[0]?.message?.content || "";
        if (!outputText.trim()) throw new Error("تلقينا رداً فارغاً من خوادم Groq.");
        return outputText.trim();
      };

      const ai = effectiveGeminiKey ? new GoogleGenAI({
        apiKey: effectiveGeminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      }) : null;

      // Build context history with explicit message classification and memory labels
      let promptText = `اللغة المستهدفة: ${langName}\nالمستوى اللغوي للمستخدم: ${userLevel}\nالرسالة الجديدة من المستخدم:\n"${text}"`;
      if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
        const maxHistory = sendMode === "persona" ? 20 : 14;
        const historyContext = chatHistory
          .slice(-maxHistory) // Keep up to 20 recent messages for persona roleplay memory context, and 14 for standard mode
          .map((m: any, index: number) => {
            const senderName = m.sender === "user"
              ? "المستخدم"
              : (m.sendMode === "persona" || m.personaReply
                  ? `الشخصية التفاعلية (${m.personaReply?.personaName || "Persona"})`
                  : "المساعد الذكي (طرف ثالث معلم)");
            const modeLabel = m.modeLabel || (m.sendMode === "persona" ? "محادثة شخصية (Roleplay)" : m.sendMode === "chat" ? "سؤال/حوار حر (Q&A)" : "تصحيح وتحليل لغوي (Correction)");
            const details = m.extraDetails ? ` [${m.extraDetails}]` : "";
            return `[رسالة ${index + 1} - النوع: ${modeLabel}${details}] ${senderName}: "${m.text}"`;
          })
          .join("\n");

        if (sendMode === "persona") {
          const personaName = req.body.selectedPersona?.name || "الشخصية التفاعلية";
          promptText = `تاريخ وذاكرة المحادثة الحصرية المتبادلة مع الشخصية (${personaName}):\n${historyContext}\n\n--------------------\nالرسالة الجديدة الحالية الموجهة حصراً للشخصية (${personaName}) [المستوى اللغوي المحدد: ${userLevel}]:\n"${text}"`;
        } else {
          const currentModeName = sendMode === "chat"
            ? "سؤال واستفسار كطرف ثالث (مستشار ومُعلم لغوي مستقل)"
            : "طلب تصحيح وتقييم لغوي للنص";

          promptText = `تاريخ وذاكرة سجل المحادثة الكامل بمساحة العمل (بما فيه جميع التصحيحات، الأسئلة، وحوارات الشخصيات السابقة للرجوع إليها وإمكانية التعليق أو التحليل):\n${historyContext}\n\n--------------------\nالرسالة الجديدة الحالية من المستخدم موجهة إليك حصراً بصفتك (طرف ثالث مستشار لغوي) [الوضع الحالي المحدد: ${currentModeName} | المستوى اللغوي: ${userLevel}]:\n"${text}"`;
        }
      }

      // Handle Mode: "persona" (Roleplay Persona Chat Reply with Image Search Prompts)
      if (sendMode === "persona") {
        const selectedPersona = req.body.selectedPersona || {
          name: "إيلي (Ellie)",
          job: "بائعة في سوبرماركت",
          age: "24 سنة",
          origin: "برلين، ألمانيا",
          toneStyle: "عفوية، ودودة، سريعة في الكلام، أسلوب تعامل زبائن عملي ويومي",
          backgroundTopics: "تعرف كل ركن في السوبرماركت، تساعد المشترين، تحب المنتجات والمخبوزات الطازجة"
        };

        const enablePersonaCorrection = req.body.enablePersonaCorrection !== false;
        const { chatType, exerciseContext, exerciseVariables, exerciseChecklist, exercisePersonas } = req.body;

        let exerciseInstructionBlock = "";
        if (chatType === "exercise" || (exerciseContext && exerciseContext.trim())) {
          const availablePersonasStr = exercisePersonas && Array.isArray(exercisePersonas) && exercisePersonas.length > 0
            ? exercisePersonas.map((p: any) => `- ID: ${p.id || p.name} | الاسم: ${p.name} | الوظيفة: ${p.job} | الرمز التعبيري (Avatar): ${p.avatar || "🎭"}`).join("\n")
            : `- ID: ${selectedPersona.id || "default"} | الاسم: ${selectedPersona.name} | الوظيفة: ${selectedPersona.job} | الرمز التعبيري: ${selectedPersona.avatar || "🎭"}`;

          // --- SMART EXERCISE CHECKLIST ANALYSIS ---
          const checklistArr = Array.isArray(exerciseChecklist) ? exerciseChecklist : [];
          const firstUncompletedIdx = checklistArr.findIndex((s: any) => !s.isCompleted);
          const activeStep = firstUncompletedIdx !== -1 ? checklistArr[firstUncompletedIdx] : null;
          const isUserStep = activeStep && (
            activeStep.speakerName.includes("المستخدم") ||
            activeStep.speakerName.includes("أنت") ||
            activeStep.speakerName.includes("User")
          );
          const nextPersonaStep = (isUserStep && firstUncompletedIdx + 1 < checklistArr.length)
            ? checklistArr[firstUncompletedIdx + 1]
            : (!isUserStep ? activeStep : null);

          let stepTargetAnalysisStr = "";
          if (activeStep && isUserStep) {
            stepTargetAnalysisStr = `
🔍 **التحليل الذكي الهندسي للخطوة الحالية النشطة**:
- 📍 **الخطوة الحالية غير المكتملة رقم ${firstUncompletedIdx + 1} (خطوة المستخدم)**:
  * المطلوب والشرط الواجب على المستخدم صياغته وإنجازه بنفسه: "${activeStep.objective}"
- 📍 **الخطوة الموالية رقم ${firstUncompletedIdx + 2} (خطوة الشخصية - تُنفذ فقط عند نجاح المستخدم في خطوته 100%)**:
  * المطلوب من الشخصية قوله وطرحه في خطوتها الموالية: "${nextPersonaStep ? nextPersonaStep.objective : 'لا توجد خطوة موالية'}"
`;
          } else if (activeStep && !isUserStep) {
            stepTargetAnalysisStr = `
🔍 **التحليل الذكي الهندسي للخطوة الحالية النشطة**:
- 📍 **الخطوة الحالية النشطة رقم ${firstUncompletedIdx + 1} (خطوة الشخصية)**:
  * المطلوب من الشخصية تنفيذها وصياغتها وطرحها في هذا الرد: "${activeStep.objective}"
`;
          }

          exerciseInstructionBlock = `\n\n🎯 **وضع محادثة التمرين والسيناريو المخصص (Exercise & Roleplay Scenario Engine)**:
سياق وسيناريو التمرين المطلوب التدرب عليه: "${exerciseContext || "تمرين حوار ومحادثة سيناريو"}"
المتغيرات والشروط الخاصة المطلوب التزام المستخدم بها: "${exerciseVariables || "لا توجد شروط إضافية"}"

🔒 **نطاق تقييد الشخصيات الحصري ودعم تعدد الشخصيات (Strict Multi-Persona Scope)**:
الشخصيات المسموح لها بالرد والتفاعل في هذا التمرين هي حصرياً:
${availablePersonasStr}

🎭 **تحديد الشخصية المتحدثة في هذه الجولة (Dynamic Persona Switching)**:
- افحص اسم المتحدث في الخطوة الحالية/الموالية من الـ Checklist (${nextPersonaStep ? nextPersonaStep.speakerName : 'الشخصية المناسبة'}).
- إذا كان التمرين يحتوي على أكثر من شخصية متاحة، التزم بالتحدث باسم الشخصية التي يحين دورها في الـ checklist أو الأكثر ملاءمة للموقف!
- قم بإرجاع قيم personaName و personaId و personaJob و personaAvatar المطابقة بدقة للشخصية المتحدثة في هذه الجولة في كائن JSON الناتج!

🎯 **لائحة تتبع خطوات التمرين الكاملة (Full Exercise Checklist)**:
${JSON.stringify(checklistArr)}
${stepTargetAnalysisStr}

⛔ **قواعد الهندسة الذكية والحازمة للتقييم والرد (Strict Dual-Boundary Execution Rules)**:

1. **التقييم الفعلي لرسالة المستخدم الحالية ("${promptText}")**:
   - قارن رسالة المستخدم بـ (الهدف المطلوب من المستخدم) وهو: "${activeStep && isUserStep ? activeStep.objective : 'لا يوجد'}"
   - افحص بصرامة ما إذا كان المستخدم قد استوفى كافة الأجزاء والشروط المكتوبة في هذا الهدف بنسبة 100% وبصياغة صريحة من طرفه باللغة المستهدفة.

2. 🚨 **المسار الأول: حالة الإجابة الخاطئة أو الناقصة أو الجزئية للمستخدم (INCOMPLETE USER ANSWER)**:
   إذا لم يُنفذ المستخدم جميع أجزاء ومتطلبات هدفه (مثال: أجاب بـ "mache ich gern" فقط دون أن يطرح السؤال المطلوب منه عن الطبخ والتسوق):
   - ❌ **تحديث اللائحة ('updatedChecklist')**: اجعل 'isCompleted: false' لخطوة المستخدم ولكافة الخطوات التالية في اللائحة دون تغيير!
   - 🛑 **حظر قاطع وصارم 1 (NO ROLE STEALING)**: يُمنع منعاً باتاً على الشخصية في 'replyText' أن تجيب عن شروط المستخدم أو أن تطرح السؤال المطلوب من المستخدم! (في مثالك: إذا كان شرط المستخدم أن يسأل لوكاس عن "الطبخ والتسوق"، يُحظر تماماً على لوكاس أن يسأل المستخدم "Kochst du gern?" أو أن يسأله عن الطبخ والتسوق!).
   - 🛑 **حظر قاطع وصارم 2 (NO STEP JUMPING)**: يُمنع تماماً طرح أسئلة الخطوة التالية للشخصية ("${nextPersonaStep ? nextPersonaStep.objective : ''}") أو الانتقال إلى أي موضوع جديد!
   - 💬 **صياغة الرد الحصرية في 'replyText'**:
     * الجملة الأولى: تفاعل ودود وقصير جداً باللغة المستهدفة مع ما قاله المستخدم فقط دون زيادة (مثال: "Das ist schön! 😊").
     * الجملة الثانية (التنبيه الإرشادي): إرفاق تنبيه تنبيهي صريح ومباشر باللغة العربية يوضح الشق الناقص المتبقي ويطلب من المستخدم صياغته بنفسه!
     * مثال تطبيقي صارم للرد الصحيح عند نقص خطوة المستخدم:
       "Das ist schön! 😊 (💡 لكن تذكر أن خطوتك تتطلب منك أيضاً أن تسألني بنفسك باللغة المستهدفة عما إذا كنت أحب الطبخ والتسوق. صغ هذا السؤال بنفسك الآن لنكمل الخطوة!)"

3. ✅ **المسار الثاني: حالة الإجابة الكاملة والمعافاة 100% من المستخدم (FULL COMPLETED USER ANSWER)**:
   فقط عندما يصيغ المستخدم كل المطلوب منه صراحة بنفسه:
   - ✅ **تحديث اللائحة ('updatedChecklist')**: ضع 'isCompleted: true' لخطوة المستخدم.
   - 💬 **صياغة الرد في 'replyText'**: أجب عن سؤال المستخدم، ثم أداة وقُم بتنفيذ خطوة الشخصية الموالية ("${nextPersonaStep ? nextPersonaStep.objective : ''}") واطرح السؤال المخصص للشخصية فيها، وضع 'isCompleted: true' على خطوة الشخصية الموالية أيضاً في 'updatedChecklist'!

4. **إكمال كافة الخطوات (Full Exercise Completion)**:
   عندما يصبح كل عنصر في 'updatedChecklist' يحمل 'isCompleted: true' اجعل 'isExerciseCompleted: true'.`;
        }

        const systemInstructionPersona = `أنت تمثل الشخصية التفاعلية التالية وتجيب بنفس الأسلوب والنبرة باللغة المستهدفة (${langName}):
معلومات الشخصية التي تجسدها:
- الاسم: ${selectedPersona.name}
- المهنة/العمل: ${selectedPersona.job}
- العمر: ${selectedPersona.age}
- الأصل/المدينة: ${selectedPersona.origin}
- صلة القرابة/العلاقة بالمستخدم: ${selectedPersona.relationship || "لا توجد صلة قرابة (حوار رسمي أو موقف عام)"}
- الأسلوب ونبرة الكلام: ${selectedPersona.toneStyle}
- اهتمامات ومواضيع إضافية: ${selectedPersona.backgroundTopics}${exerciseInstructionBlock}

⚠️ هام جداً - تحديد مستوى اللغة القياسي (CEFR Level):
مستوى المتعلم المحدد في هذه المحادثة هو: ${userLevel}.
يجب عليك إلزامياً استخدام مفردات، وتراكيب جمل، وأسلوب كلام يتطابق مع هذا المستوى اللغوي (${userLevel}):
- إذا كان المستوى مبتدئاً (A1.1 أو A1.2 أو A2.1): استخدم جمل بسيطة، واضحة ومباشرة وقصيرة، ومفردات أساسية سهلة الاستيعاب.
- إذا كان المستوى متوسطاً (A2.2 أو B1.1 أو B1.2): استخدم تراكيب متوسطة الصعوبة وأدوات ربط متناسقة، ومفردات يومية طبيعية.
- إذا كان المستوى متقدماً (B2.1 إلى C2): استخدم تعبيرات بليغة، ومفردات متقدمة وثراء لغوي وتراكيب معقدة تناسب المتحدثين المتقدمين.

قواعد أساسية لردود الشخصية والمحادثة الطبيعية:
1. **تكييف طول الرد وحجمه ديناميكياً مع رسالة المستخدم (Natural Adaptive Length)**:
   - إذا كانت رسالة المستخدم قصيرة أو تحية بسيطة أو سؤالاً سريعاً (مثال: "Hi", "Hello", "How are you?", "Guten Morgen"): اجعل الرد قصيراً ومباشراً وعفوياً (من جملة إلى 2-3 جمل كحد أقصى) تماماً كما يتحدث البشر في المحادثات اليومية الحقيقية.
   - إذا كان سؤال المستخدم متوسط الحجم أو يسأل عن شيء محدد: اجعل الرد متوسطاً وواضحاً ومناسباً لنفس حجم السؤال دون حشو أو إطالة غير مبررة.
   - لا تكتب مقالات أو ردوداً طويلة جداً إلا إذا طلب المستخدم شرحاً تفصيلياً أو تطرق لموضوع طويل يستدعي ذلك.
2. الرد على رسالة المستخدم كمحادثة واقعية بأسلوب هذه الشخصية المباشر والخاص باللغة المستهدفة (${langName}) مع الالتزام التام بمستوى ${userLevel} (تنبيه: في حال تمارين السيناريو، يُحظر طرح أسئلة جديدة أو الإجابة بالنيابة عن المستخدم إذا كانت إجابة المستخدم غير مستوفية لشروط خطوته بالكامل).
3. ترجمة باللغة العربية للرد (replyTextArabic).
4. **استخدام الرموز التعبيرية (Emojis)**: استخدام الإيموجي بشكل طبيعي ومناسب في الجمل لنقل المشاعر والنبرة (مثل 😊, 👋, ☕, 🌟, 🎉) دون مبالغة أو حشو مكثف، بل فقط للضرورة لتعزيز العاطفة والتواصل البشري الدافيء.
5. **إنشاء كلمات بحث صور توضيحية باللغة الإنجليزية (imageSearchQueries)**:
   أنشئ من 1 إلى 3 عبارات بحث بصرية باللغة الإنجليزية تمثل الرد وسياق الموقف والمكان والأشياء المذكورة في الرد بوضوح.
${
  enablePersonaCorrection
    ? `6. **تحليل وتصحيح كامل ومفصل لرسالة المستخدم (${promptText})**:
   قم بتحليل رسالة المستخدم وإرجاع كافة مفاتيح التقييم والتصحيح الشاملة التالية في userCorrection:
   - score: تقييم الدرجة المستحقة من 100 حسب مستوى (${userLevel}).
   - gradeLabel: وصف مختصر للتقييم باللغة العربية مع إيموجي (مثل: "ممتاز 🌟").
   - originalText: نص رسالة المستخدم الأصلي.
   - correctedText: النص الخالي تماماً من الأخطاء الإملائية والقواعدية.
   - hasErrors: boolean يحدد ما إذا كانت رسالة المستخدم تتضمن أخطاء أو أسلوب يحتاج تحسين.
   - corrections: قائمة بكل الأخطاء الحاصلة بحقول (originalSegment, correctedSegment, type, reasonAr).
   - nativeVersion: الصياغة العفوية الأفضل كمتحدث أصلي في سياق هذه المحادثة باللغة المستهدفة (${langName}).
   - improvedExpressionText: صياغة أسلوبية مطوّرة وبليغة للجملة لتطوير المستوى اللغوي.
   - improvedExpressionExplanationAr: شرح أسباب التحسين والبلاغة باللغة العربية.
   - positiveFeedbackAr: إشادة بالنص ونقاط القوة في صياغة المستخدم.
   - grammarSummaryAr: ملخص قاعدة لغوية هامة ينبغي للمستخدم تذكرها.`
    : `6. لا تقم بإجراء تحليل أو تصحيح لرسالة المستخدم (لا تتضمن userCorrection).`
}

قم بإرجاع النتيجة بتنسيق JSON حصرياً يحتوي على المفاتيح المطلوبة أعلاه.`;

        let responseText = "";
        let usedModelDisplay = aiModelName;

        if (isGroqPrimary || !ai) {
          responseText = await callGroqService(systemInstructionPersona, promptText);
          usedModelDisplay = "Groq Llama 3.3 70B 🚀";
        } else {
          try {
            const personaProps: any = {
              personaId: { type: Type.STRING, description: "معرف ID الشخصية المجيبة من قائمة الشخصيات المتاحة (مثال: ex-persona-1)" },
              personaName: { type: Type.STRING, description: "اسم الشخصية المجيبة" },
              personaAvatar: { type: Type.STRING, description: "الرمز التعبيري الإيموجي أو صورة الشخصية" },
              personaJob: { type: Type.STRING, description: "وظيفة الشخصية بالعربية" },
              replyText: { type: Type.STRING, description: "نص رد الشخصية باللغة المستهدفة" },
              replyTextArabic: { type: Type.STRING, description: "الترجمة أو الشرح بالعربية" },
              imageSearchQueries: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "1 إلى 3 عبارات بحث صور باللغة الإنجليزية لوصف الرد بصرياً"
              }
            };

            if (chatType === "exercise") {
              personaProps.updatedChecklist = {
                type: Type.ARRAY,
                description: "لائحة خطوات التمرين مع تحديث حالة إنجاز كل خطوة",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    speakerName: { type: Type.STRING },
                    objective: { type: Type.STRING },
                    isCompleted: { type: Type.BOOLEAN }
                  },
                  required: ["id", "speakerName", "objective", "isCompleted"]
                }
              };
              personaProps.isExerciseCompleted = { type: Type.BOOLEAN, description: "هل تم استيفاء كافة خطوات التمرين بنجاح" };
            }
            const personaRequired = ["personaName", "replyText", "imageSearchQueries"];

            if (enablePersonaCorrection) {
              personaProps.userCorrection = {
                type: Type.OBJECT,
                description: "تحليل وتصحيح كامل ومفصل لرسالة المستخدم ليتعلم منها تلقائياً",
                properties: {
                  score: { type: Type.NUMBER, description: "الدرجة المستحقة لرسالة المستخدم من 0 إلى 100" },
                  gradeLabel: { type: Type.STRING, description: "وصف التقييم باللغة العربية مع إيموجي" },
                  originalText: { type: Type.STRING, description: "نص رسالة المستخدم الأصلي" },
                  correctedText: { type: Type.STRING, description: "النص المصحح الخالي تماماً من كافة الأخطاء" },
                  hasErrors: { type: Type.BOOLEAN, description: "هل كانت رسالة المستخدم تتضمن أخطاء؟" },
                  corrections: {
                    type: Type.ARRAY,
                    description: "قائمة بكافة الأخطاء المكتشفة وتفاصيلها",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        originalSegment: { type: Type.STRING, description: "الجزء المخطئ من النص الأصلي" },
                        correctedSegment: { type: Type.STRING, description: "التصحيح الصحيح" },
                        type: { type: Type.STRING, description: "نوع الخطأ: spelling أو grammar أو vocabulary أو style" },
                        reasonAr: { type: Type.STRING, description: "شرح القاعدة والسبب باللغة العربية" }
                      },
                      required: ["originalSegment", "correctedSegment", "type", "reasonAr"]
                    }
                  },
                  nativeVersion: { type: Type.STRING, description: "الصياغة الأفضل والأكثر ملاءمة كمتحدث أصلي في سياق المحادثة" },
                  improvedExpressionText: { type: Type.STRING, description: "التعبير المطور والمحسّن بلاغياً وأكاديمياً للجملة" },
                  improvedExpressionExplanationAr: { type: Type.STRING, description: "شرح التحسين الأسلوبي والبلاغي باللغة العربية" },
                  positiveFeedbackAr: { type: Type.STRING, description: "إشادة بالنقاط الجيدة والممتازة في تعبير المستخدم" },
                  grammarSummaryAr: { type: Type.STRING, description: "شرح أو نصيحة لغوية هامة باللغة العربية" }
                },
                required: ["score", "gradeLabel", "originalText", "correctedText", "hasErrors", "corrections", "nativeVersion"]
              };
              personaRequired.push("userCorrection");
            }

            const response = await callGeminiSafe(modelId, {
              systemInstruction: systemInstructionPersona,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: personaProps,
                required: personaRequired
              }
            });
            responseText = response.text || "";
          } catch (geminiErr: any) {
            console.error("Gemini call failed in persona mode:", geminiErr?.message);
            throw geminiErr;
          }
        }

        if (!responseText) throw new Error("لم يتم تلقي استجابة من الذكاء الاصطناعي للشخصية");

        const personaReply = cleanBrTagsFromObj(JSON.parse(responseText.trim()));

        // Handle initial auto-start greeting prompt: mark step 0 (Persona opening step) as completed (isCompleted: true)
        const isInitialGreetingPrompt = text && (text.includes("[بدء تمرين السيناريو تلقائياً]") || text.includes("ابدأ تمرين السيناريو"));
        if (chatType === "exercise" && exerciseChecklist && Array.isArray(exerciseChecklist) && exerciseChecklist.length > 0) {
          if (isInitialGreetingPrompt) {
            personaReply.updatedChecklist = exerciseChecklist.map((item: any, idx: number) => ({
              ...item,
              isCompleted: idx === 0 ? true : false
            }));
            personaReply.isExerciseCompleted = false;
          } else if (personaReply.updatedChecklist && Array.isArray(personaReply.updatedChecklist)) {
            // Programmatic Safeguard: Enforce strict sequential checklist integrity (No step N+1 can be completed if step N is false)
            let blocked = false;
            personaReply.updatedChecklist = personaReply.updatedChecklist.map((item: any) => {
              if (!item.isCompleted) {
                blocked = true;
                return item;
              }
              if (blocked) {
                return { ...item, isCompleted: false };
              }
              return item;
            });
            personaReply.isExerciseCompleted = personaReply.updatedChecklist.every((item: any) => item.isCompleted);
          }
        }

        if (chatType === "exercise" && exercisePersonas && Array.isArray(exercisePersonas) && exercisePersonas.length > 0) {
          const matchedEx = exercisePersonas.find(
            (p: any) =>
              (p.id && personaReply.personaId === p.id) ||
              (p.name && personaReply.personaName && p.name.trim().toLowerCase().includes(personaReply.personaName.trim().toLowerCase())) ||
              (p.name && personaReply.personaName && personaReply.personaName.trim().toLowerCase().includes(p.name.trim().toLowerCase()))
          ) || exercisePersonas[0];

          personaReply.personaId = matchedEx.id;
          personaReply.personaName = matchedEx.name;
          personaReply.personaAvatar = matchedEx.avatar || "🎭";
          personaReply.personaJob = matchedEx.job || "";
        } else {
          personaReply.personaAvatar = selectedPersona.avatar || "🎭";
          personaReply.personaJob = selectedPersona.job || "";
          personaReply.personaId = selectedPersona.id;
        }

        return res.json({ success: true, sendMode: "persona", personaReply, aiModelName: usedModelDisplay });
      }

      // Handle Mode: "sentence_builder" (Sentence Building Practice Mode)
      if (sendMode === "sentence_builder") {
        const selectedPersona = req.body.selectedPersona || {
          name: "المعلم اللغوي",
          job: "مرافق تكوين الجمل",
          avatar: "🧩",
          id: "sentence_builder_persona"
        };

        const topic = (sentenceTopic || req.body.sentenceTopic || "الموضوع العام").trim();
        const context = (sentenceContext || req.body.sentenceContext || "").trim();
        const grammar = (sentenceGrammarFocus || req.body.sentenceGrammarFocus || "").trim();

        const personaName = selectedPersona.name || "المعلم اللغوي";
        const personaAvatar = selectedPersona.avatar || "🧩";
        const personaJob = selectedPersona.job || "مرافق تكوين الجمل";
        const personaId = selectedPersona.id || "sentence_builder_persona";

        const isAskingNewPrompt = isNewSentenceRequest === true ||
          !text ||
          text.includes("[بدء محادثة تكوين الجمل تلقائياً]") ||
          text.includes("[طلب جملة جديدة لتكوينها]") ||
          text.includes("جملة أخرى") ||
          text.includes("اعطني جملة جديدة");

        let responseText = "";
        let usedModelDisplay = aiModelName;

        if (isAskingNewPrompt) {
          // Extract previously requested prompt sentences to prevent repetition
          const pastPrompts: string[] = [];
          if (Array.isArray(chatHistory)) {
            chatHistory.forEach((msg: any) => {
              if (msg.personaReply?.promptSentenceAr) {
                pastPrompts.push(msg.personaReply.promptSentenceAr);
              }
            });
          }

          // Generate a NEW sentence prompt for the user to compose/translate
          const sysInstNewPrompt = `أنت معلم لغات وشخصية ودودة ومشجعة باسم (${personaName}).
دورك هو قيادة تمرين "تكوين الجمل (Sentence Building)" باللغة المستهدفة (${langName}) للمستخدم.
المستوى اللغوي للمستخدم المحدد لهذه المحادثة: (${userLevel}).

إعدادات التمرين المحددة من المستخدم:
- الموضوع العام المطلوبة الجملة فيه: "${topic}"
${context ? `- السياق الفرعي المطلوبة الجملة فيه: "${context}"` : "- السياق: سياق عام ومناسب للموضوع"}
${grammar ? `- التركيز النحوي / القاعدة المطلوبة: "${grammar}"` : "- القاعدة: قواعد وتراكيب تناسب مستوى " + userLevel}

${pastPrompts.length > 0 ? `
⚠️ تحذير حاسم ومهم جداً: الجمل التالية تم طلبها واقتراحها سابقاً للمستخدم في هذه المحادثة، ويُمنع منعاً باتاً تكرار أي منها أو إعادة طلب نفس الجملة بنفس السياق:
${pastPrompts.map((p, i) => `${i + 1}. "${p}"`).join("\n")}
يجب عليك حتماً صياغة جملة جديدة ومختلفة تماماً بفكرة ومحتوى مبتكر يثري حصيلة المستخدم!
` : ""}

مهمتك:
1. صياغة جملة باللغة العربية (أو بلسان الشخصية) تطلب فيها من المستخدم تكوين أو ترجمة جملة محددة إلى اللغة المستهدفة (${langName}).
   مثال للطلب: «كون الجملة التالية بالـ ${langName}: "أنا آكل الطعام الصحي في المطعم كل مساء"».
2. الجملة المطلوبة يجب أن تكون معبرة، واضحة، ومناسبة جداً لمستوى (${userLevel}) وللموضوع (${topic}) والسياق والقاعدة المطلوبة.
3. التزام شديد بمستوى (${userLevel}):
   - A1/A2: جمل بسيطة أو مركبة من مفردات وأفعال أساسية يومية.
   - B1/B2: جمل متوسطة تشتمل على أدوات ربط وجمل فرعية وأزمنة مناسبة (مثل Perfekt, Präteritum, Passiv, Nebensätze).
   - C1: جمل متقدمة غنية بتراكيب ومفردات أكاديمية ودقيقة.
4. إرفاق تلميح نحوي أو صيغي بسيط ومفيد باللغة العربية (targetSentenceHint) يوجه المستخدم نحو الزمن أو التركيب المطلوب.

قم بإرجاع كائن JSON حصرياً يحتوي على الحقول التالية:
- promptSentenceAr: (نص الجملة المطلوبة من المستخدم باللغة العربية بشكل بليغ ومباشر، مثال: «كون الجملة التالية بالـ ${langName}: "أنا آكل الطعام الصحي في المطعم"»)
- replyText: (الرسالة الترحيبية الكاملة من الشخصية تحث المستخدم وتررحب به وتطلب منه الجملة)
- targetSentenceHint: (تلميح نحوي أو صيغي باللغة العربية)
- expectedTargetSentence: (الترجمة النموذجية المتوقعة للجملة باللغة المستهدفة للمرجعية)
- grammarFocusAr: (ملخص القاعدة النحوية أو التركيز المطلوب)`;

          if (isGroqPrimary || !ai) {
            responseText = await callGroqService(sysInstNewPrompt, promptText);
            usedModelDisplay = "Groq Llama 3.3 70B 🚀";
          } else {
            const response = await callGeminiSafe(modelId, {
              systemInstruction: sysInstNewPrompt,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  promptSentenceAr: { type: Type.STRING, description: "نص الجملة المطلوبة من المستخدم باللغة العربية" },
                  replyText: { type: Type.STRING, description: "نص الترحيب والطلب الكامل من الشخصية" },
                  targetSentenceHint: { type: Type.STRING, description: "تلميح نحوي أو صيغي باللغة العربية" },
                  expectedTargetSentence: { type: Type.STRING, description: "الصياغة النموذجية بالجملة المستهدفة" },
                  grammarFocusAr: { type: Type.STRING, description: "شرح أو اسم القاعدة المطلوبة" }
                },
                required: ["promptSentenceAr", "replyText", "targetSentenceHint", "expectedTargetSentence", "grammarFocusAr"]
              }
            });
            responseText = response.text || "";
          }

          if (!responseText) throw new Error("لم يتم تلقي استجابة لبناء الجملة من الذكاء الاصطناعي");

          const parsedPromptObj = cleanBrTagsFromObj(JSON.parse(responseText.trim()));

          const personaReplyObj: PersonaReply = {
            personaId,
            personaName,
            personaAvatar,
            personaJob,
            replyText: parsedPromptObj.replyText,
            promptSentenceAr: parsedPromptObj.promptSentenceAr,
            targetSentenceHint: parsedPromptObj.targetSentenceHint,
            expectedTargetSentence: parsedPromptObj.expectedTargetSentence,
            grammarFocusAr: parsedPromptObj.grammarFocusAr,
            isSentenceBuilder: true
          };

          return res.json({
            success: true,
            sendMode: "sentence_builder",
            personaReply: personaReplyObj,
            aiModelName: usedModelDisplay
          });
        } else {
          // EVALUATE and CORRECT user's submitted sentence attempt
          const sysInstEval = `أنت معلم لغات وشخصية مشجعة باسم (${personaName}) تقيم إجابة المستخدم في تمرين "تكوين الجمل".
اللغة المستهدفة: (${langName}).
المستوى اللغوي للمستخدم: (${userLevel}).
الموضوع العام: "${topic}".
${context ? `السياق: "${context}"` : ""}
${grammar ? `التركيز النحوي والقواعد المطلوبة: "${grammar}"` : ""}

قام المستخدم بكتابة الجملة التالية باللغة المستهدفة (${langName}):
"${text}"

المطلوب منك:
1. فحص وتقييم جملة المستخدم بأسلوب دقيق جداً ومشجع.
2. فحص الأخطاء الإملائية، النحوية، والسياقية، ومدى ملاءمتها لمستوى (${userLevel}) ومدى تطابقها مع القاعدة المحددة (${grammar || "General Grammar"}).
3. إرجاع كائن JSON صريح يحتوي على:
   - replyText: (رسالة وتعليق تشجيعي بلسان الشخصية (${personaName}) يوضح أداءه والنقاط الممتازة وما يحتاج تحسين)
   - userCorrection: كائن تصحيح شامل يحتوي على:
     - score: (درجة من 0 إلى 100)
     - gradeLabel: (وصف التقييم باللغة العربية مع إيموجي)
     - originalText: (نص المستخدم الأصلي)
     - correctedText: (الجملة المصححة الخالية تماماً من الأخطاء)
     - hasErrors: (boolean)
     - corrections: (قائمة تفصيلية بالأخطاء تشمل originalSegment, correctedSegment, type, reasonAr)
     - nativeVersion: (الصياغة الطبيعية كمتحدث أصلي)
     - improvedExpressionText: (تعبير مطور وأكثر بلاغة للجملة)
     - improvedExpressionExplanationAr: (شرح البلاغة والتحسين)
     - positiveFeedbackAr: (إشادة بنقاط القوة في محاولة المستخدم)
     - grammarSummaryAr: (ملخص القاعدة وكيفية استخدامها)`;

          if (isGroqPrimary || !ai) {
            responseText = await callGroqService(sysInstEval, promptText);
            usedModelDisplay = "Groq Llama 3.3 70B 🚀";
          } else {
            const response = await callGeminiSafe(modelId, {
              systemInstruction: sysInstEval,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  replyText: { type: Type.STRING, description: "تعليق ورأي الشخصية في محاولة المستخدم" },
                  userCorrection: {
                    type: Type.OBJECT,
                    properties: {
                      score: { type: Type.NUMBER, description: "الدرجة المستحقة من 0 إلى 100" },
                      gradeLabel: { type: Type.STRING, description: "وصف التقييم باللغة العربية مع إيموجي" },
                      originalText: { type: Type.STRING, description: "النص الأصلي المكتوب" },
                      correctedText: { type: Type.STRING, description: "النص الخالي من كافة الأخطاء" },
                      hasErrors: { type: Type.BOOLEAN, description: "هل يحتوي النص على أخطاء؟" },
                      corrections: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            originalSegment: { type: Type.STRING },
                            correctedSegment: { type: Type.STRING },
                            type: { type: Type.STRING },
                            reasonAr: { type: Type.STRING }
                          },
                          required: ["originalSegment", "correctedSegment", "type", "reasonAr"]
                        }
                      },
                      nativeVersion: { type: Type.STRING, description: "الصياغة كمتحدث أصلي" },
                      improvedExpressionText: { type: Type.STRING, description: "التعبير المطور" },
                      improvedExpressionExplanationAr: { type: Type.STRING, description: "شرح التحسين" },
                      positiveFeedbackAr: { type: Type.STRING, description: "إشادة وإطراء" },
                      grammarSummaryAr: { type: Type.STRING, description: "ملخص القاعدة النحوية" }
                    },
                    required: ["score", "gradeLabel", "originalText", "correctedText", "hasErrors", "corrections", "nativeVersion", "improvedExpressionText", "improvedExpressionExplanationAr", "positiveFeedbackAr", "grammarSummaryAr"]
                  }
                },
                required: ["replyText", "userCorrection"]
              }
            });
            responseText = response.text || "";
          }

          if (!responseText) throw new Error("لم يتم تلقي استجابة من الذكاء الاصطناعي لتقييم الجملة");

          const parsedEvalObj = cleanBrTagsFromObj(JSON.parse(responseText.trim()));

          const personaReplyObj: PersonaReply = {
            personaId,
            personaName,
            personaAvatar,
            personaJob,
            replyText: parsedEvalObj.replyText,
            userCorrection: parsedEvalObj.userCorrection,
            isSentenceBuilder: true
          };

          return res.json({
            success: true,
            sendMode: "sentence_builder",
            personaReply: personaReplyObj,
            aiModelName: usedModelDisplay
          });
        }
      }

      // Handle Mode: "chat" (Free Conversational AI Reply)
      if (sendMode === "chat") {
        const systemInstructionChat = `أنت معلم ومساعد لغوي ذكي باللغة المستهدفة (${langName}).
أنت تتدخل وتعمل بصفتك **طرفاً ثالثاً مستقلاً (مستشار ومُعلم لغوي خارجي)** بين المستخدم والشخصيات التفاعلية.

⚠️ قواعد الهوية والتمثيل (حاسمة ومهمة جداً):
1. عندما يرسل المستخدم رسالته بوضع "سؤال"، فهو يسألك أنت بصفتك (المساعد والطرف الثالث المعلم)، ولا يتحدث مع الشخصية التفاعلية.
2. **يمنع منعاً باتاً** أن تتحدث أو تجيب بصفتك الشخصية التفاعلية أو تقلدها أو تمثل دورها في هذا الوضع.
3. ميز بوضوح تام في ذاكرة وسجل المحادثة السابق بين ما كتبه المستخدم وما ردت به الشخصية التفاعلية، حتى تفهم السياق بشكل ممتاز.
4. أجب المستخدم بأسلوب المستشار اللغوي الخارجي الودود والمحترف، شارحاً ومجيباً عن أي سؤال أو توضيح أو استفسار نحوي/لغوي/سياقي يطلبه منك.

المستخدم يدرس بمستوى قياسي (${userLevel}).
دورك: تقديم إجابة تفاعلية، واضحة، ومنسقة بأناقة، باللغة العربية مع أمثلة دقيقة باللغة المستهدفة (${langName}) مع مراعاة مستواه اللغوي المحدد (${userLevel}).

قواعد طول وحجم الإجابة:
- **تتناسب الإجابة طردياً مع حجم وطبيعة السؤال**:
  - الأسئلة القصيرة والسريعة تلقى إجابات مباشرة وموجزة دقيقة.
  - الاستفسارات الممتدة أو طلبات الشرح تتلقى إجابة مفصلة ومنسقة.

⚠️ تنبيه هام جداً للتنسيق:
- يمنع منعاً باتاً كتابة أو إدراج أي أوسمة HTML مثل <br> أو <p> في النص.
- استخدم فقط الفواصل السطرية الطبيعية (newlines \\n) وقوائم Markdown (- أو 1.) لتنظيم الأسطر والفقرات والنقاط.

المطلوب منك:
1. title: عنوان مشجع ومناسب للرد (مثلاً: "إجابة وتوضيح لغوي 💬" أو "رد وتوضيح مخصص 💡").
2. replyText: الإجابة الشاملة والواضحة المنسقة بأعلى جودة، استخدم الأسطر (\\n)، النقاط، والتوضيحات المرتبة بشكل بليغ ومفهوم دون إطالة زائدة.
3. **استخدام الرموز التعبيرية (Emojis)**: تضمين إيموجي بشكل متوازن وطبيعي لنقل الإحساس والمشاعر الإيجابية دون مبالغة.
4. **ملاحظة تنسيقية بسيطة**: عندما تقتبس كلمات أو مفردات أو أفعال لغوية باللغة المستهدفة مثل "ich" أو "gehen" أو "du"، ضعها بين علامتي تنصيص مثل "word" أو ""word"" أو \`word\` ليتم تحويلها وتأطيرها تلقائياً بالواجهة كبطاقة كلمة بارزة وأنيقة للمتعلم.

قم بإرجاع النتيجة بتنسيق JSON حصرياً يحتوي على المفتاحين: title و replyText.`;

        let responseText = "";
        let usedModelDisplay = aiModelName;

        if (isGroqPrimary || !ai) {
          responseText = await callGroqService(systemInstructionChat, promptText);
          usedModelDisplay = "Groq Llama 3.3 70B 🚀";
        } else {
          try {
            const response = await callGeminiSafe(modelId, {
              systemInstruction: systemInstructionChat,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "عنوان الإجابة باللغة العربية" },
                  replyText: { type: Type.STRING, description: "نص الرد الكامل والمنسق بأقسام وأسطر واضحة" }
                },
                required: ["title", "replyText"]
              }
            });
            responseText = response.text || "";
          } catch (geminiErr: any) {
            console.error("Gemini call failed in chat mode:", geminiErr?.message);
            throw geminiErr;
          }
        }

        if (!responseText) throw new Error("لم يتم تلقي استجابة من الذكاء الاصطناعي");

        const chatReply = cleanBrTagsFromObj(JSON.parse(responseText.trim()));
        return res.json({ success: true, sendMode: "chat", chatReply, aiModelName: usedModelDisplay });
      }

      // Handle Mode: "correct" (Full Correction Card Schema)
      const systemInstructionCorrect = `أنت مصحح ومدرس لغات محترف ومتخصص في اللغة (${langName}).
المستوى اللغوي للمستخدم هو (${userLevel}).
دورك هو فحص وتقييم وتصحيح النصوص والتعبيرات والإنشاء التي يكتبها المستخدم باللغة المستهدفة (${langName}) بأسلوب مشجع ودقيق جداً ومناسب لمعايير المستوى المحدد (${userLevel}).

⚠️ تنبيه هام جداً للتنسيق:
- يمنع منعاً باتاً كتابة أو إدراج أي أوسمة HTML مثل <br> أو <p> في النص.
- استخدم فقط الفواصل السطرية الطبيعية (newlines \\n) لتنظيم الأسطر والفقرات.

المشترطات المطلوبة منك:
1. تقييم النص وإعطاء درجة دقيقة ومنطقية من 100 (score) معتمدة على معايير مستوى (${userLevel}).
2. إعطاء وصف ممتاز ومختصر للتقييم (gradeLabel) باللغة العربية (مثلاً: "ممتاز جداً 🌟"، "جيد جداً مع أخطاء طفيفة 🎖️"، "يحتاج مراجعة للقواعد 💡").
3. تقديم النص المكتوب الأصلي (originalText).
4. تقديم النص المصحح بالكامل (correctedText) بحيث يخلو من أي خطأ إملائي أو نحوي أو تركيب لغوي.
5. **تنسيق وترتيب الأسطر والفقرات**: حافظ دائماً على تقسيم الأسطر والفقرات المكتوبة (\\n). إذا كان دمج أو تقسيم الأسطر ينقصه سطر جديد أو يحتاج تحسين، قم بتصحيحه وتنسيقه بالأسطر المناسبة في (correctedText) و (nativeVersion).
6. تحديد ما إذا كان يحتوي على أخطاء أم لا (hasErrors: boolean).
7. قائمة تفصيلية بكل الأخطاء (corrections) تشمل:
   - originalSegment: الجزء المخطئ بالنص الأصلي
   - correctedSegment: التصحيح المناسب
   - type: نوع الخطأ ("spelling" أو "grammar" أو "vocabulary" أو "style")
   - reasonAr: شرح سبب الخطأ والقاعدة النحوية/الإملائية باللغة العربية بشكل واضح ومبسط.
8. تقديم صياغة طبيعية كمتحدث أصلي (nativeVersion) كيف يعبر ابن البلد الأصلي عن نفس المعنى مع مراعاة مستوى (${userLevel}).
9. **تحسين التعبير للجملة (improvedExpressionText)**: اقتراح نسخة محسنة ومطوّرة تناسب الارتقاء بمستوى المتعلم إلى أعلى من (${userLevel}).
10. **شرح تحسين التعبير (improvedExpressionExplanationAr)**: تقديم شرح باللغة العربية يوضح كيف تم تحسين التعبير والبلاغة والمفردات المتقدمة المستخدمة في النسخة المحسنة.
11. تقديم ملاحظات إيجابية ومديح للنقاط الجيدة في التعبير (positiveFeedbackAr) باللغة العربية.
12. تقديم ملخص لأهم قاعدة لغوية ينبغي للمستخدم تذكرها (grammarSummaryAr) باللغة العربية.

قم بإرجاع النتيجة بتنسيق JSON حصرياً يحتوي على كافة المفاتيح المذكورة أعلاه.`;

      let responseText = "";
      let usedModelDisplay = aiModelName;

      if (isGroqPrimary || !ai) {
        responseText = await callGroqService(systemInstructionCorrect, promptText);
        usedModelDisplay = "Groq Llama 3.3 70B 🚀";
      } else {
        try {
          const response = await callGeminiSafe(modelId, {
            systemInstruction: systemInstructionCorrect,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.NUMBER, description: "الدرجة المستحقة للنص من 0 إلى 100" },
                gradeLabel: { type: Type.STRING, description: "وصف التقييم باللغة العربية مع إيموجي" },
                originalText: { type: Type.STRING, description: "النص الأصلي المكتوب" },
                correctedText: { type: Type.STRING, description: "النص الخالي تماماً من كافة الأخطاء" },
                hasErrors: { type: Type.BOOLEAN, description: "هل يحتوي النص على أخطاء؟" },
                corrections: {
                  type: Type.ARRAY,
                  description: "قائمة بكافة الأخطاء المكتشفة وتفاصيلها",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      originalSegment: { type: Type.STRING, description: "الجزء المخطئ من النص الأصلي" },
                      correctedSegment: { type: Type.STRING, description: "التصحيح الصحيح" },
                      type: { type: Type.STRING, description: "نوع الخطأ: spelling أو grammar أو vocabulary أو style" },
                      reasonAr: { type: Type.STRING, description: "شرح القاعدة والسبب باللغة العربية" }
                    },
                    required: ["originalSegment", "correctedSegment", "type", "reasonAr"]
                  }
                },
                nativeVersion: { type: Type.STRING, description: "الصياغة الأفضل والأكثر ملاءمة كمتحدث أصلي" },
                improvedExpressionText: { type: Type.STRING, description: "التعبير المطور والمحسّن بلاغياً وأكاديمياً للجملة" },
                improvedExpressionExplanationAr: { type: Type.STRING, description: "شرح التحسين الأسلوبي والبلاغي باللغة العربية" },
                positiveFeedbackAr: { type: Type.STRING, description: "إشادة بالنقاط الجيدة والممتازة في تعبير المستخدم" },
                grammarSummaryAr: { type: Type.STRING, description: "شرح أو نصيحة لغوية هامة باللغة العربية" }
              },
              required: ["score", "gradeLabel", "originalText", "correctedText", "hasErrors", "corrections", "nativeVersion", "improvedExpressionText", "improvedExpressionExplanationAr", "positiveFeedbackAr", "grammarSummaryAr"]
            }
          });
          responseText = response.text || "";
        } catch (geminiErr: any) {
          console.error("Gemini call failed in correction mode:", geminiErr?.message);
          throw geminiErr;
        }
      }

      if (!responseText) {
        throw new Error("لم يتم تلقي استجابة من الذكاء الاصطناعي");
      }

      const analysis = cleanBrTagsFromObj(JSON.parse(responseText.trim()));
      return res.json({ success: true, sendMode: "correct", analysis, aiModelName: usedModelDisplay });
    } catch (err: any) {
      console.error("AI Corrector failed:", err);
      return res.status(500).json({ error: err.message || "فشل تصحيح النص بالذكاء الاصطناعي" });
    }
  });

  // API Endpoint: Transcribe Audio Recording via Groq Whisper or Gemini AI Multimodal
  app.post("/api/transcribe-audio", express.json({ limit: "25mb" }), async (req, res) => {
    try {
      const {
        audioBase64,
        mimeType = "audio/webm",
        targetLanguage = "German",
        geminiApiKey,
        groqApiKey,
        customApiKey,
        userApiKey
      } = req.body;

      if (!audioBase64) {
        return res.status(400).json({ error: "لم يتم إرسال أي بيانات صوتية" });
      }

      const effectiveGroqKey = (groqApiKey && groqApiKey.trim()) || process.env.GROQ_API_KEY || "";
      const effectiveGeminiKey =
        (geminiApiKey && geminiApiKey.trim()) ||
        (customApiKey && customApiKey.trim()) ||
        (userApiKey && userApiKey.trim()) ||
        process.env.GEMINI_API_KEY ||
        "";

      if (!effectiveGroqKey && !effectiveGeminiKey) {
        return res.json({
          success: false,
          transcript: "",
          reason: "no_api_key",
          message: "لم يتم توفير مفتاح Groq API أو Gemini API على الخادم أو الإعدادات"
        });
      }

      // Strip data URL prefix cleanly regardless of codec parameters (e.g. audio/webm;codecs=opus)
      let cleanBase64 = audioBase64;
      if (cleanBase64.includes(";base64,")) {
        cleanBase64 = cleanBase64.split(";base64,").pop() || cleanBase64;
      }
      cleanBase64 = cleanBase64.trim();

      const cleanMime = mimeType.split(";")[0].trim() || "audio/webm";
      const audioBuffer = Buffer.from(cleanBase64, "base64");

      let transcript = "";

      // Method 1: Groq Whisper STT (Ultra-fast & High Accuracy for speech)
      if (effectiveGroqKey) {
        try {
          const fileExt = cleanMime.includes("mp4") || cleanMime.includes("m4a") ? "m4a" : cleanMime.includes("ogg") ? "ogg" : "webm";
          const audioFile = new File([audioBuffer], `recording.${fileExt}`, { type: cleanMime });

          const formData = new FormData();
          formData.append("file", audioFile);
          formData.append("model", "whisper-large-v3-turbo");
          formData.append("response_format", "json");

          const langLower = (targetLanguage || "").toLowerCase();
          if (langLower.includes("german") || langLower.includes("deuts")) formData.append("language", "de");
          else if (langLower.includes("arabic") || langLower.includes("عرب")) formData.append("language", "ar");
          else if (langLower.includes("english") || langLower.includes("إنجل")) formData.append("language", "en");

          const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${effectiveGroqKey}`
            },
            body: formData
          });

          if (groqRes.ok) {
            const groqData = await groqRes.json();
            if (groqData && groqData.text && groqData.text.trim()) {
              transcript = groqData.text.trim();
            }
          } else {
            const errBody = await groqRes.text();
            console.warn("[Groq Whisper STT Error]:", groqRes.status, errBody);
          }
        } catch (gErr: any) {
          console.warn("[Groq Whisper Exception]:", gErr?.message || gErr);
        }
      }

      // Method 2: Gemini Multimodal STT Fallback
      if (!transcript && effectiveGeminiKey) {
        try {
          const ai = new GoogleGenAI({
            apiKey: effectiveGeminiKey,
            httpOptions: {
              headers: {
                "User-Agent": "aistudio-build"
              }
            }
          });

          const prompt = `You are an expert speech recognition and language transcription assistant.
Listen carefully to the audio file attached. The user is speaking in ${targetLanguage} or Arabic/English.
Transcribe the spoken sentences accurately into text.
Rules:
1. Output ONLY the transcribed spoken text verbatim.
2. Do NOT add any quotes, introductory phrases, explanations, or punctuation metadata.
3. If no speech is detected or it is pure silence/noise, return an empty string.`;

          const candidateModels = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-1.5-flash"];

          for (const modelCandidate of candidateModels) {
            try {
              const response = await ai.models.generateContent({
                model: modelCandidate,
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        inlineData: {
                          data: cleanBase64,
                          mimeType: cleanMime
                        }
                      },
                      { text: prompt }
                    ]
                  }
                ]
              });
              const txt = (response.text || "").trim();
              if (txt) {
                transcript = txt;
                break;
              }
            } catch (mErr: any) {
              console.warn(`[Gemini STT] Model ${modelCandidate} failed:`, mErr?.message || mErr);
            }
          }
        } catch (gemErr: any) {
          console.warn("[Gemini STT Exception]:", gemErr?.message || gemErr);
        }
      }

      return res.json({ success: true, transcript });
    } catch (err: any) {
      console.error("Audio transcription server endpoint error:", err);
      return res.status(500).json({ error: err.message || "فشل تحليل الصوت بالذكاء الاصطناعي" });
    }
  });

  // API Endpoint: Create a flashcard from quoted text via AI
  app.post("/api/ai/make-card-from-text", express.json(), async (req, res) => {
    try {
      const {
        quotedText,
        targetLanguage = "German",
        customApiKey,
        geminiApiKey,
        groqApiKey,
        model
      } = req.body;

      if (!quotedText || !quotedText.trim()) {
        return res.status(400).json({ error: "النص المنصص مطلوب لإنشاء البطاقة." });
      }

      const effectiveGeminiKey = geminiApiKey || customApiKey || process.env.GEMINI_API_KEY || "";
      const effectiveGroqKey = groqApiKey || process.env.GROQ_API_KEY || "";

      const cleanQuote = quotedText.trim().replace(/^["'«„“`]+|["'»”`]+$/g, "");
      const langName = targetLanguage || "الألمانية";

      const systemInstruction = `أنت معلم لغات خبير ومتخصص في بناء بطاقات استذكار تعليمية فائقة الدقة (Flashcards).
مهمتك تحليل النص المنصص المقتبس التالي والمقدم من المستخدم:
"${cleanQuote}"

اللغة المستهدفة للنص: ${langName}.

يرجى تحليله بدقة وإنشاء بطاقة استذكار تعليمية واحدة متكاملة في صيغة JSON تحتوي على الحقول التالية:
1. "frontText": الكلمة أو العبارة باللغة المستهدفة (${langName}) مجردة تماماً بدون أداة التعريف (مثال: اكتب "Tisch" وليس "der Tisch"، "Buch" وليس "das Buch"، أو "Guten Tag").
2. "backText": الترجمة العربية الدقيقة والمبسطة للكلمة أو الجملة (مثال: "طاولة" أو "كتاب" أو "صباح الخير").
3. "translationHint": وصف بسيط وموجز جداً باللغة العربية يشرح المعنى أو سياق استخدام الجملة أو نوع الكلمة (مثال: "اسم مذكر في الألمانية يشير للطاولة").
4. "isArticleMode": boolean (ضع true إذا كان النص اسماً ألمانياً له أداة تعريف مثل der/die/das، وإلا false).
5. "correctArticle": إذا كان اسماً ألمانياً، حدد الأداة المناسبة بدقة: "der" للمذكر، "die" للمؤنث، "das" للمحايد، و "die-plural" للجمع. أداة التعريف تُكتب حصراً هنا وممنوع تضمينها في frontText أو pluralText!
6. "isPluralMode": boolean (ضع true إذا كان اسماً وله صيغة جمع معروفة، وإلا false).
7. "pluralText": الكلمة بصيغة الجمع مجردة تماماً بدون أداة (مثال: "Tische" وليس "die Tische") وإلا "".
8. "imageSearchQuery": عبارة بحث إنجليزية قصيرة ودقيقة جداً تمثل المفهوم بصرياً لجلب صورة توضيحية مطابقة (مثال: "wooden office desk table" لـ "Tisch").`;

      let generatedCardData: any = null;

      const reqModel = model || "gemini-2.5-flash";
      let geminiModel = reqModel;
      let isGroqPrimary = false;

      if (reqModel === "groq-llama-3.3-70b" || reqModel === "groq") {
        isGroqPrimary = true;
      } else if (reqModel === "gemini-3.6-flash" || reqModel === "gemini-3.5-flash" || reqModel === "gemini-3.5-flash-lite" || reqModel === "gemini-3.1-flash-lite" || reqModel === "gemini-2.5-flash-lite" || reqModel === "gemini-1.5-pro") {
        geminiModel = reqModel;
      } else {
        geminiModel = "gemini-2.5-flash";
      }

      // If Groq requested primary
      if (isGroqPrimary && effectiveGroqKey) {
        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${effectiveGroqKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemInstruction + "\n\nأرجع كائن JSON فقط بدون أي نص إضافي." },
                { role: "user", content: `أنشئ بطاقة تعليمية للنص: "${cleanQuote}"` }
              ],
              temperature: 0.2
            })
          });

          if (response.ok) {
            const chatResult = await response.json();
            const responseText = chatResult?.choices?.[0]?.message?.content || "";
            if (responseText.trim()) {
              generatedCardData = JSON.parse(responseText.trim());
            }
          }
        } catch (groqErr) {
          console.warn("Groq card generation failed:", groqErr);
        }
      }

      // Try Gemini API if not generated yet
      if (!generatedCardData && effectiveGeminiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: effectiveGeminiKey });
          const response = await ai.models.generateContent({
            model: geminiModel,
            contents: `أنشئ بطاقة تعليمية واحدة للنص التالي: "${cleanQuote}"`,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  frontText: { type: Type.STRING },
                  backText: { type: Type.STRING },
                  translationHint: { type: Type.STRING },
                  isArticleMode: { type: Type.BOOLEAN },
                  correctArticle: { type: Type.STRING },
                  isPluralMode: { type: Type.BOOLEAN },
                  pluralText: { type: Type.STRING },
                  imageSearchQuery: { type: Type.STRING }
                },
                required: ["frontText", "backText", "translationHint", "isArticleMode", "correctArticle", "isPluralMode", "pluralText", "imageSearchQuery"]
              }
            }
          });

          if (response.text) {
            generatedCardData = JSON.parse(response.text.trim());
          }
        } catch (gemErr) {
          console.warn("Gemini card generation failed, trying fallback:", gemErr);
        }
      }

      // Try Groq API fallback if Gemini failed or no Gemini key
      if (!generatedCardData && effectiveGroqKey) {
        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${effectiveGroqKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemInstruction + "\n\nأرجع كائن JSON فقط بدون أي نص إضافي." },
                { role: "user", content: `أنشئ بطاقة تعليمية للنص: "${cleanQuote}"` }
              ],
              temperature: 0.2
            })
          });

          if (response.ok) {
            const chatResult = await response.json();
            const responseText = chatResult?.choices?.[0]?.message?.content || "";
            if (responseText.trim()) {
              generatedCardData = JSON.parse(responseText.trim());
            }
          }
        } catch (groqErr) {
          console.warn("Groq card generation failed:", groqErr);
        }
      }

      // If both AI options failed or gave empty output, create safe fallback structure
      if (!generatedCardData) {
        generatedCardData = {
          frontText: cleanQuote,
          backText: cleanQuote,
          translationHint: "بطاقة مضافة تلقائياً من النص المنصص",
          isArticleMode: false,
          correctArticle: "",
          isPluralMode: false,
          pluralText: "",
          imageSearchQuery: cleanQuote
        };
      }

      generatedCardData = sanitizeCardArticleAndPlural(generatedCardData);

      // Automatically search for matching image using multi-tier image search fallbacks
      let imageCandidates: string[] = [];
      let frontImageUrl: string | undefined = undefined;

      const queryForImage = generatedCardData.imageSearchQuery || cleanQuote;
      try {
        const imgResult = await fetchSingleImageWithFallbacks(queryForImage, 1);
        if (imgResult.imageUrl) {
          frontImageUrl = imgResult.imageUrl;
          imageCandidates = imgResult.candidateUrls;
        }
      } catch (imgErr) {
        console.warn("Image search failed for card:", imgErr);
      }

      const card = {
        frontText: generatedCardData.frontText || cleanQuote,
        frontLang: langName === "German" || langName === "الألمانية" ? "de" : "en",
        backText: generatedCardData.backText || cleanQuote,
        backLang: "ar",
        translationHint: generatedCardData.translationHint || "",
        isArticleMode: !!generatedCardData.isArticleMode,
        correctArticle: generatedCardData.correctArticle || "",
        isPluralMode: !!generatedCardData.isPluralMode,
        pluralText: generatedCardData.pluralText || "",
        frontImage: frontImageUrl,
        autoImageCandidates: imageCandidates.length > 0 ? imageCandidates : undefined,
        imageSearchQuery: queryForImage,
        difficulty: "medium"
      };

      return res.json({ success: true, card });
    } catch (err: any) {
      console.error("Make card from text endpoint error:", err);
      return res.status(500).json({ error: err.message || "فشل إنشاء البطاقة" });
    }
  });

  // API Endpoint: Generate Dynamic Exercise & Roleplay Personas via AI
  app.post("/api/ai/generate-exercise-personas", async (req, res) => {
    try {
      const {
        exerciseContext,
        exerciseVariables,
        targetLanguage,
        userLevel = "B1.1",
        customApiKey,
        geminiApiKey,
        groqApiKey,
        model,
        selectedModel
      } = req.body;

      if (!exerciseContext || !exerciseContext.trim()) {
        return res.status(400).json({ error: "يرجى إدخال سياق التمرين المطلوب لتوليد الشخصيات." });
      }

      const effectiveGeminiKey = geminiApiKey || customApiKey || process.env.GEMINI_API_KEY || "";
      const effectiveGroqKey = groqApiKey || process.env.GROQ_API_KEY || "";

      let aiClient: GoogleGenAI | null = null;
      if (effectiveGeminiKey) {
        aiClient = new GoogleGenAI({ apiKey: effectiveGeminiKey });
      }

      const langName = targetLanguage || "الإنجليزية";

      const systemPrompt = `أنت مصمم سيناريوهات وتمرينات محاكاة لغوية وتفاعلية باللغة (${langName}).
مهمتك تحليل سياق التمرين والمتغيرات والشروط المدخلة، وتوليد سيناريو تمرين متكامل وشخصيات ذكية مخصصة لهذا الموقف تحديداً، بالإضافة إلى لائحة تتبع أهداف وخطوات التمرين (Checklist).

سياق التمرين: "${exerciseContext}"
المتغيرات والشروط الخاصة المطلوب تغطيتها كلياً: "${exerciseVariables || "لا توجد شروط خاصة"}"
اللغة المستهدفة: ${langName}
مستوى المستخدم: ${userLevel}

🚨 **قواعد حازمة لمنع تكرار الأسماء وتوليد أسماء وصور منوعة وواقعية (Strict Name Variety & Persona Customization)**:
- 🚫 **تغيير وتنوع الأسماء إجباري 100%**: يُمنع منعاً باتاً ومطلقاً استخدام اسم "Lukas" أو "لوكاس" أو تكرار أسماء نمطية معادة في كل تمرين!
- ✨ **التنوع الابتكاري التام**: استنبط أسماء متنوعة ومميزة تناسب ثقافة البلد واللغة المستهدفة (${langName}) والسياق المترابط (مثل: Mateo, Elena, Sarah, Herr Weber, Pierre, Clara, Marco, Sofia, Antonio, David, Emma, Liam, Thomas, Charlotte, Frau Berger, etc.).
- 🎭 **إذا كان سياق التمرين يتضمن عدة أطراف أو أدوار**: ولد من 2 إلى 4 شخصيات مختلفة تناسب المواقف والتفاعل المتبادل (مثال: موظف الاستقبال + مدير الفندق + زميل العمل).

يرجى إرجاع نتيجة JSON تتضمن التالي:
1. exerciseTitle: عنوان جذاب ومختصر للتمرين باللغة العربية مع إيموجي (مثال: "🏨 حجز غرفة في فندق فخم").
2. userRole: وصف واضح ومختصر لدور المستخدم باللغة العربية (مثال: "نزيل يرغب في استئجار غرفة مطلة على البحر لمدة 3 أيام").
3. personas: مصفوفة تحتوي من 1 إلى 4 من الشخصيات التفاعلية المولدة خصيصاً لهذا السيناريو.
   لكل شخصية:
   - id: معرف فريد مثل "ex-persona-1"
   - name: اسم الشخصية باللغة المستهدفة مع اسمها المعرب بين قوسين (مثال: "Pierre (بيير)" أو "Elena (إلينا)")
   - job: وظيفتها أو دورها باللغة العربية (مثال: "موظف استقبال الفندق")
   - avatar: رمز تعبيري إيموجي مميز ومعبر جداً عن الدور (مثل: "🏨" أو "👨‍🍳" أو "👨‍💼" أو "👩‍⚕️" أو "👮‍♂️")
   - imageSearchQuery: عبارة بحث ذكية ودقيقة باللغة الإنجليزية لوصف وجه أو صور البورتريه الخاصة بالشخصية لاستخدامها في إيجاد صورة حقيقية بدلاً من الإيموجي (مثال: "friendly professional female hotel receptionist portrait photography face avatar" أو "german male doctor portrait photography, professional face")
   - origin: البلد أو المدينة (مثال: "ميونخ، ألمانيا")
   - toneStyle: أسلوب ونبرة الكلام باللغة العربية (مثال: "رسمي، مهذب، سريع الاستجابة ومرحب")
   - backgroundTopics: المواضيع والمجالات التي تجيدها هذه الشخصية في السيناريو
   - relationship: صلة القرابة أو نوع العلاقة بالمستخدم باللغة العربية (مثال: "مقدم الخدمة في الفندق")
   - roleDescriptionAr: شرح دقيق ومبسط باللغة العربية لدور الشخصية وكيف ستوجه الحوار وتتفاعل مع المستخدم في التمرين.
4. checklist: مصفوفة متسلسلة تضمن التغطية الشاملة والكاملة (100% Coverage) لكل المتغيرات والشروط المدخلة في سياق التمرين.
   🚨 **قاعدة حاسمة وتتابع إجباري لخطوات اللائحة (Step Sequence Rules)**:
   - **الخطوة الأولى (Step 1)** في اللائحة **يجب دوماً ولزاماً** أن تكون خاصة بـ **الشخصية / الذكاء الاصطناعي** (مثل: اسم موظف الاستقبال أو الطبيب) لأن الذكاء الاصطناعي هو من يفتتح المحادثة تلقائياً بالتحية والسؤال الأول!
   - **الخطوة الثانية (Step 2)** تكون خاصة بـ **المستخدم (أنت)** للإجابة على سؤال الشخصية وتلبية الشروط.
   - تتناوب الخطوات بعد ذلك بين الشخصية والمستخدم بالتتابع.
   - لكل خطوة:
     * id: معرف فريد مثل "step-1"
     * speakerName: اسم المتحدث لهذه الخطوة باللغة العربية (الخطوة الأولى دوماً للشخصية مثل "ماركوس (موظف الاستقبال)"، والخطوة الثانية للمستخدم مثل "المستخدم (أنت)")
     * objective: المعنى الجوهري أو الهدف المطلوب قوله/استيفاؤه باللغة العربية بأسلوب مرن
     * isCompleted: false (تبدأ دائماً بـ false)`;

      let responseText = "";
      let usedModelName = model || selectedModel || "gemini-3.6-flash";
      const modelWarnings: string[] = [];

      if ((usedModelName.includes("groq") || usedModelName === "grok-2") && effectiveGroqKey) {
        try {
          const resGroq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${effectiveGroqKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "قم بتوليد الشخصيات واللائحة وتنسيقها بصيغة JSON حصراً بحسب النمط المحدد في التعليمات." }
              ],
              temperature: 0.3
            })
          });
          if (resGroq.ok) {
            const dataGroq = await resGroq.json();
            responseText = dataGroq?.choices?.[0]?.message?.content || "";
            if (responseText) usedModelName = "groq-llama-3.3-70b";
          } else {
            const errTxt = await resGroq.text();
            modelWarnings.push(`Groq Llama 3.3 فشل: ${resGroq.status} ${errTxt}`);
          }
        } catch (groqErr: any) {
          console.warn("Groq primary attempt for personas generation failed, falling back to Gemini:", groqErr);
          modelWarnings.push(`Groq Llama 3.3 فشل: ${groqErr?.message || groqErr}`);
        }
      }

      if (!responseText && aiClient) {
        let targetGeminiModel = usedModelName;
        if (targetGeminiModel.includes("groq") || targetGeminiModel === "grok-2") {
          targetGeminiModel = "gemini-3.6-flash";
        }
        const personaModels = Array.from(new Set([targetGeminiModel, "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro"]));
        for (const pModel of personaModels) {
          try {
            const response = await aiClient.models.generateContent({
              model: pModel,
              contents: systemPrompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    exerciseTitle: { type: Type.STRING, description: "عنوان التمرين باللغة العربية" },
                    userRole: { type: Type.STRING, description: "وصف دور المستخدم في السيناريو" },
                    personas: {
                      type: Type.ARRAY,
                      description: "الشخصيات التفاعلية المولدّة للسيناريو",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING },
                          name: { type: Type.STRING, description: "اسم الشخصية" },
                          job: { type: Type.STRING, description: "وظيفة الشخصية" },
                          avatar: { type: Type.STRING, description: "الإيموجي الرمز التعبيري للشخصية" },
                          imageSearchQuery: { type: Type.STRING, description: "عبارة البحث بالإنجليزية لجلب صورة البورتريه للشخصية" },
                          origin: { type: Type.STRING },
                          toneStyle: { type: Type.STRING },
                          backgroundTopics: { type: Type.STRING },
                          relationship: { type: Type.STRING },
                          roleDescriptionAr: { type: Type.STRING, description: "شرح دور الشخصية بالعربية" }
                        },
                        required: ["id", "name", "job", "avatar", "toneStyle", "roleDescriptionAr"]
                      }
                    },
                    checklist: {
                      type: Type.ARRAY,
                      description: "لائحة تتبع خطوات وأهداف التمرين المتسلسلة",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING },
                          speakerName: { type: Type.STRING, description: "اسم المتحدث لهذه الخطوة" },
                          objective: { type: Type.STRING, description: "الهدف/الجملة المعيارية للخطوة" },
                          isCompleted: { type: Type.BOOLEAN }
                        },
                        required: ["id", "speakerName", "objective", "isCompleted"]
                      }
                    }
                  },
                  required: ["exerciseTitle", "userRole", "personas", "checklist"]
                }
              }
            });
            responseText = response.text || "";
            if (responseText) {
              usedModelName = pModel;
              break;
            }
          } catch (geminiErr: any) {
            const errMsg = geminiErr?.message || String(geminiErr);
            console.warn(`[Persona Generation Warning] Model '${pModel}' failed (${errMsg}). Trying next candidate...`);
            modelWarnings.push(`النموذج '${pModel}' فشل (${errMsg.includes("503") ? "الضغط عالي على الخادم 503" : errMsg.includes("429") ? "تجاوز حد الطلبات 429" : errMsg})`);
          }
        }
      }

      if (!responseText && effectiveGroqKey && !usedModelName.includes("groq")) {
        try {
          const resGroq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${effectiveGroqKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "قم بتوليد الشخصيات واللائحة وتنسيقها بصيغة JSON حصراً بحسب النمط المحدد في التعليمات." }
              ],
              temperature: 0.3
            })
          });
          if (resGroq.ok) {
            const dataGroq = await resGroq.json();
            responseText = dataGroq?.choices?.[0]?.message?.content || "";
            if (responseText) usedModelName = "groq-llama-3.3-70b";
          }
        } catch (groqErr: any) {
          console.warn("Groq fallback for personas also failed:", groqErr);
          modelWarnings.push(`Groq Llama 3.3 فشل أيضاً: ${groqErr?.message || groqErr}`);
        }
      }

      if (!responseText) {
        // Fallback default persona generation if AI call fails
        return res.json({
          success: true,
          usedModel: "fallback-default",
          warnings: modelWarnings.length > 0 ? modelWarnings : ["تعذر الوصول للنماذج المحددة بسبب الضغط العالي، تم إنشاء شخصية افتراضية للتمرين."],
          exerciseTitle: `تمرين: ${exerciseContext.slice(0, 30)}...`,
          userRole: "المتحدث الرئيسي والمشارك في تمرين المحاكاة",
          personas: [
            {
              id: `ex-persona-${Date.now()}`,
              name: "المحاكي الذكي (Smart Roleplay AI)",
              job: "المشرف والشخصية الرئيسية في التمرين",
              avatar: "🎭",
              origin: "الذكاء الاصطناعي",
              toneStyle: "تفاعلي، مشجع وموجه للسيناريو",
              backgroundTopics: exerciseContext,
              relationship: "طرف الحوار في السيناريو",
              roleDescriptionAr: "يتولى التفاعل معك وتوجيه الأسئلة لمساعدتك في تحقيق أهداف التمرين"
            }
          ],
          checklist: [
            { id: "step-1", speakerName: "الشخصية الرئيسية (الافتتاح)", objective: "افتتاح سيناريو التمرين بالتحية وطرح السؤال الأول الموجه للمستخدم", isCompleted: false },
            { id: "step-2", speakerName: "المستخدم (أنت)", objective: "الرد بأسلوب مناسب وتلبية المطلوب في السؤال الأول", isCompleted: false },
            { id: "step-3", speakerName: "الشخصية الرئيسية", objective: "متابعة الحوار بأسلوب الشخصية واستكمال متطلبات التمرين", isCompleted: false }
          ]
        });
      }

      const generatedData = JSON.parse(responseText.trim());
      const defaultAvatarEmojis = ["🏨", "👨‍💼", "👩‍⚕️", "👨‍🍳", "👮‍♂️", "👨‍🏫", "👩‍💻", "🎭", "🏬", "✈️"];
      const sanitizedPersonas = (generatedData.personas || []).map((p: any, idx: number) => {
        let av = p.avatar ? String(p.avatar).trim() : "";
        if (!av) av = defaultAvatarEmojis[idx % defaultAvatarEmojis.length];
        return {
          ...p,
          id: p.id || `ex-persona-${idx + 1}`,
          avatar: av
        };
      });

      const primaryPersonaName = sanitizedPersonas[0]?.name || "الشخصية الرئيسية (الافتتاح)";

      let sanitizedChecklist = Array.isArray(generatedData.checklist) && generatedData.checklist.length > 0
        ? generatedData.checklist
        : [
            { id: "step-1", speakerName: primaryPersonaName, objective: "افتتاح سيناريو التمرين بالتحية وطرح السؤال الأول الموجه للمستخدم", isCompleted: false },
            { id: "step-2", speakerName: "المستخدم (أنت)", objective: "الرد بأسلوب مناسب وتلبية المطلوب في السؤال الأول", isCompleted: false },
            { id: "step-3", speakerName: primaryPersonaName, objective: "تأكيد التفاصيل واستكمال تمرين السيناريو بنجاح", isCompleted: false }
          ];

      // Guarantee Step 1 is always for the AI Persona (Opening question)
      if (sanitizedChecklist.length > 0 && sanitizedChecklist[0].speakerName && sanitizedChecklist[0].speakerName.includes("المستخدم")) {
        sanitizedChecklist[0].speakerName = primaryPersonaName;
        sanitizedChecklist[0].objective = "افتتاح سيناريو التمرين وإتأليف السؤال والتحية الأولى للمستخدم";
      }

      return res.json({
        success: true,
        usedModel: usedModelName,
        warnings: modelWarnings,
        exerciseTitle: generatedData.exerciseTitle,
        userRole: generatedData.userRole,
        personas: sanitizedPersonas,
        checklist: sanitizedChecklist
      });
    } catch (err: any) {
      console.error("Generate exercise personas error:", err);
      return res.status(500).json({ error: err.message || "فشل توليد شخصيات التمرين" });
    }
  });

  // Add a simple in-memory cache for DuckDuckGo search queries
  const ddgImageCache = new Map<string, any[]>();

  // Helper to fetch live images from Wikimedia Commons when DDG or Pixabay rate limit/fail
  async function searchWikimediaImages(q: string): Promise<any[]> {
    if (!q || !q.trim()) return [];
    const cleanQ = q.trim();
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQ)}&gsrlimit=20&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|size&format=json`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "AnkiApp/1.0 (contact@example.com)"
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.query && data.query.pages) {
          const pages = Object.values(data.query.pages) as any[];
          const results = pages
            .filter((p) => p.imageinfo && p.imageinfo[0] && p.imageinfo[0].url && !p.imageinfo[0].url.endsWith(".svg"))
            .map((p, i) => {
              const imgUrl = p.imageinfo[0].url;
              return {
                id: `wiki-${p.pageid || i}-${Date.now()}`,
                webformatURL: imgUrl,
                largeImageURL: imgUrl,
                tags: p.title ? p.title.replace("File:", "").replace(/\.[^/.]+$/, "") : cleanQ
              };
            });
          return results;
        }
      }
    } catch (e) {
      console.error("[Wikimedia Image Search] Error:", e);
    }
    return [];
  }

  // Helper to clean search queries by stripping articles, brackets, numbers, and extra symbols
  function cleanQueryForSearch(raw: string, aggressiveness: number = 1): string {
    if (!raw) return "";
    let s = raw
      .replace(/\b(der|die|das|dem|den|des|the|a|an|le|la|les|el|un|une)\b/gi, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[0-9]+\./g, " ")
      .replace(/[/\\?#,;:!="'()_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (aggressiveness >= 2 && s.length > 0) {
      const words = s.split(" ").filter((w) => w.length > 1);
      if (words.length > 0) {
        s = words.slice(0, 2).join(" ");
      }
    }

    return s || raw.trim();
  }

  // Helper to fetch a single image with multi-tier query fallbacks and providers, returning top image URL and candidate list
  async function fetchSingleImageWithFallbacks(query: string, round: number): Promise<{ imageUrl: string; candidateUrls: string[] }> {
    if (!query || !query.trim()) return { imageUrl: "", candidateUrls: [] };
    const qOriginal = query.trim();
    const qClean = cleanQueryForSearch(qOriginal, round >= 3 ? 2 : 1);

    const candidates: string[] = [];

    // Tier 1: DuckDuckGo with Original Query
    try {
      const { hits } = await searchDuckDuckGoImages(qOriginal, "1");
      if (hits && hits.length > 0) {
        hits.forEach((h: any) => {
          const u = h.largeImageURL || h.webformatURL || h.image || h.url;
          if (u && typeof u === "string" && u.startsWith("http") && !candidates.includes(u)) {
            candidates.push(u);
          }
        });
      }
    } catch (e) {}

    // Tier 2: DuckDuckGo with Clean Query
    if (candidates.length < 5 && qClean && qClean.toLowerCase() !== qOriginal.toLowerCase()) {
      try {
        const { hits } = await searchDuckDuckGoImages(qClean, "1");
        if (hits && hits.length > 0) {
          hits.forEach((h: any) => {
            const u = h.largeImageURL || h.webformatURL || h.image || h.url;
            if (u && typeof u === "string" && u.startsWith("http") && !candidates.includes(u)) {
              candidates.push(u);
            }
          });
        }
      } catch (e) {}
    }

    // Tier 3: Wikimedia Commons
    if (candidates.length < 5) {
      try {
        const wikiHits = await searchWikimediaImages(qClean || qOriginal);
        if (wikiHits && wikiHits.length > 0) {
          wikiHits.forEach((h: any) => {
            const u = h.largeImageURL || h.webformatURL;
            if (u && typeof u === "string" && u.startsWith("http") && !candidates.includes(u)) {
              candidates.push(u);
            }
          });
        }
      } catch (e) {}
    }

    // Tier 4: Openverse Free Media Search
    if (candidates.length < 5) {
      try {
        const ovUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(qClean || qOriginal)}&page_size=10`;
        const ovRes = await fetch(ovUrl, { headers: { "User-Agent": "AnkiApp/1.0" } });
        if (ovRes.ok) {
          const ovData = await ovRes.json();
          if (ovData?.results && Array.isArray(ovData.results)) {
            ovData.results.forEach((r: any) => {
              const u = r.url;
              if (u && typeof u === "string" && u.startsWith("http") && !candidates.includes(u)) {
                candidates.push(u);
              }
            });
          }
        }
      } catch (e) {}
    }

    // Tier 5: Dynamic AI Pollinations Photo Fallback (Ensures every single card gets a valid high-quality photo)
    if (candidates.length === 0) {
      const fallbackQuery = encodeURIComponent(qClean || qOriginal);
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${fallbackQuery}%20clear%20photo%20isolated%20educational?width=512&height=512&nologo=true`;
      candidates.push(pollinationsUrl);
    }

    const imageUrl = candidates.length > 0 ? candidates[0] : "";
    return { imageUrl, candidateUrls: candidates.slice(0, 10) };
  }

  // Array of modern realistic desktop User-Agents to prevent header fingerprinting
  const DESKTOP_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
  ];

  function getRandomUserAgent(): string {
    return DESKTOP_USER_AGENTS[Math.floor(Math.random() * DESKTOP_USER_AGENTS.length)];
  }

  // Smart Batched Sequential/Gentle Parallel Image Fetcher with Controlled Concurrency and Candidate Lists
  async function fetchBatchCardImages(
    cardItems: Array<{ index: number; card: any; query: string; imageUrl: string; candidateUrls?: string[] }>,
    sendProgress: (type: "status", data: { message: string }) => void,
    maxRetryRounds: number = 8
  ) {
    // Pre-fill items that already have existing candidate image lists or existing frontImage to avoid re-querying
    cardItems.forEach((item) => {
      if (item.card.autoImageCandidates && Array.isArray(item.card.autoImageCandidates) && item.card.autoImageCandidates.length > 0) {
        item.candidateUrls = item.card.autoImageCandidates;
        item.imageUrl = item.card.frontImage || item.card.autoImageCandidates[0];
      } else if (item.card.frontImage) {
        item.imageUrl = item.card.frontImage;
        item.candidateUrls = [item.card.frontImage];
      }
    });

    const totalCards = cardItems.length;
    let pendingIndices = cardItems
      .map((item, i) => (!item.imageUrl ? i : -1))
      .filter((idx) => idx !== -1);
    let retryRound = 0;

    if (pendingIndices.length === 0) {
      const alreadyFetched = cardItems.filter((item) => Boolean(item.imageUrl)).length;
      sendProgress("status", {
        message: `تم استخدام قوائم الصور المحفوظة بنجاح! جاهزية ${alreadyFetched} من ${totalCards} صورة (بدون إعادة البحث).`
      });
      return;
    }

    while (pendingIndices.length > 0 && retryRound < maxRetryRounds) {
      retryRound++;
      const currentFetched = cardItems.filter((item) => Boolean(item.imageUrl)).length;

      if (retryRound === 1) {
        sendProgress("status", {
          message: `بدء جلب قوائم الصور والتنزيل (تم جلب ${currentFetched} من ${totalCards} صورة) - الجولة ${retryRound}/${maxRetryRounds}...`
        });
      } else {
        // Adaptive cooldown duration between rounds to allow DuckDuckGo rate limits to clear
        const cooldownSeconds = Math.min(2 + Math.floor((retryRound - 2) * 1.5), 6);
        for (let sec = cooldownSeconds; sec > 0; sec--) {
          sendProgress("status", {
            message: `مهلة تبريد لفك حظر الخادم (متبقي ${sec} ثوانٍ) - إعادة محاولة ${pendingIndices.length} صورة متبقية (تم جلب ${currentFetched} من ${totalCards}) - الجولة ${retryRound}/${maxRetryRounds}...`
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      const failedIndices: number[] = [];
      // Controlled, gentle intra-round batch execution: 3 items in parallel with 150ms delay
      const chunkSize = 3;
      const interChunkDelay = 150;

      for (let i = 0; i < pendingIndices.length; i += chunkSize) {
        const chunk = pendingIndices.slice(i, i + chunkSize);

        await Promise.all(
          chunk.map(async (idx) => {
            const item = cardItems[idx];
            if (!item.query || !item.query.trim()) return;

            try {
              const res = await fetchSingleImageWithFallbacks(item.query, retryRound);
              if (res.imageUrl) {
                item.imageUrl = res.imageUrl;
                item.candidateUrls = res.candidateUrls;
              } else {
                failedIndices.push(idx);
              }
            } catch (err) {
              console.error(`[AI Auto-Image Batch] Card #${idx + 1} ("${item.query}") fetch error:`, err);
              failedIndices.push(idx);
            }
          })
        );

        const currentFetched = cardItems.filter((item) => Boolean(item.imageUrl)).length;
        sendProgress("status", {
          message: `جاري جلب القوائم وتحميل الصور (تم جلب ${currentFetched} من ${totalCards} صورة) - الجولة ${retryRound}/${maxRetryRounds}...`
        });

        if (i + chunkSize < pendingIndices.length) {
          await new Promise((r) => setTimeout(r, interChunkDelay));
        }
      }

      pendingIndices = failedIndices;

      const newlyFetched = cardItems.filter((item) => Boolean(item.imageUrl)).length;
      if (newlyFetched === totalCards) {
        break;
      }
    }

    const finalFetched = cardItems.filter((item) => Boolean(item.imageUrl)).length;
    sendProgress("status", {
      message: `تم الانتهاء بنجاح! تم جلب وحفظ قوائم ${finalFetched} من ${totalCards} صورة (خلال ${retryRound} جولات).`
    });
  }

  // Helper to fetch keyless DuckDuckGo images with proper pagination, retries, and caching
  async function searchDuckDuckGoImages(q: string, page: string = "1", offsetParam?: string): Promise<{ hits: any[]; nextOffset?: number }> {
    const pageNum = parseInt(page) || 1;
    let offset = offsetParam ? parseInt(offsetParam) : (pageNum - 1) * 30;
    if (isNaN(offset)) {
      offset = (pageNum - 1) * 30;
    }

    const cacheKey = `${q.trim().toLowerCase()}_page_${pageNum}_offset_${offset}`;
    if (ddgImageCache.has(cacheKey)) {
      console.log(`[DDG Image Search] Cache HIT for query: "${q}"`);
      return { hits: ddgImageCache.get(cacheKey) || [], nextOffset: undefined };
    }

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        console.log(`[DDG Image Search] Querying DuckDuckGo (Attempt ${attempt + 1}/${maxRetries + 1}): "${q}", page: ${pageNum}, offset: ${offset}`);
        
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`;
        const userAgent = getRandomUserAgent();
        const response = await fetch(searchUrl, {
          headers: {
            "User-Agent": userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none"
          }
        });
        
        if (!response.ok) {
          console.log(`[DDG Image Search] Failed to fetch DDG page: status ${response.status}`);
          if (response.status === 403 && attempt < maxRetries) {
            console.log(`[DDG Image Search] 403 Forbidden rate limit hit. Waiting 1500ms for cooldown before retry...`);
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          return { hits: [] };
        }
        
        const html = await response.text();
        const match = html.match(/vqd\s*=\s*["']([^"']+)["']/i) || 
                      html.match(/vqd\s*:\s*["']([^"']+)["']/i) ||
                      html.match(/vqd=([^&"'\s)]+)/i);
        if (!match) {
          console.log(`[DDG Image Search] Could not extract vqd token from page HTML.`);
          if (attempt < maxRetries) {
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          return { hits: [] };
        }
        
        const vqd = match[1];
        const apiUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,&s=${offset}&p=1`;
        const apiResponse = await fetch(apiUrl, {
          headers: {
            "User-Agent": userAgent,
            "Referer": "https://duckduckgo.com/",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        
        if (!apiResponse.ok) {
          console.log(`[DDG Image Search] API request failed with status ${apiResponse.status}`);
          if (apiResponse.status === 403 && attempt < maxRetries) {
            console.log(`[DDG Image Search] API 403 rate limit met. Waiting 1500ms for cooldown before retry...`);
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          return { hits: [] };
        }
        
        const data = await apiResponse.json();
        if (data && data.results && data.results.length > 0) {
          console.log(`[DDG Image Search] Successfully fetched ${data.results.length} images from DuckDuckGo!`);
          
          let nextOffset: number | undefined;
          if (data.next) {
            const matchS = data.next.match(/[?&]s=([0-9]+)/);
            if (matchS) {
              nextOffset = parseInt(matchS[1]);
            }
          }
          
          if (nextOffset === undefined || nextOffset <= offset) {
            nextOffset = offset + data.results.length;
          }

          const hits = data.results.map((item: any, i: number) => {
            const imageUrl = item.image || item.thumbnail || `ddg-${i}`;
            const stableId = Buffer.from(imageUrl).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
            return {
              id: `ddg-${stableId}`,
              webformatURL: item.thumbnail || item.image,
              largeImageURL: item.image,
              tags: item.title || q
            };
          });

          // Cache the hits
          ddgImageCache.set(cacheKey, hits);

          return { hits, nextOffset };
        }
        
        return { hits: [] };
      } catch (err) {
        console.log(`[DDG Image Search] Exception occurred: ${(err as Error).message}`);
        if (attempt < maxRetries) {
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
      }
    }
    
    return { hits: [] };
  }

  // API Route - Image Search proxy with dynamic provider support (DuckDuckGo or Pixabay or Wikimedia)
  app.get("/api/images", async (req, res) => {
    const q = req.query.q as string || "";
    const page = req.query.page as string || "1";
    const offsetParam = req.query.offset as string || "";
    const provider = req.query.provider as string || "duckduckgo";
    const customKey = req.query.customKey as string || "";
    const pixabayKey = customKey || process.env.PIXABAY_API_KEY;

    console.log(`[API Images] Fetching images: "${q}", page: ${page}, offset: ${offsetParam}, provider: ${provider}`);

    try {
      // 1. Pixabay Provider handling
      if (provider === "pixabay") {
        if (pixabayKey && pixabayKey.length > 5) {
          try {
            const url = `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(q)}&image_type=photo&per_page=24&page=${page}`;
            console.log(`[Pixabay Image Request] Querying Pixabay API, page: ${page}`);
            const response = await fetch(url);
            if (response.ok) {
              const data = await response.json();
              if (data && data.hits) {
                return res.json({
                  hits: data.hits.map((item: any) => ({
                    id: `pixabay-${item.id}`,
                    webformatURL: item.webformatURL,
                    largeImageURL: item.largeImageURL,
                    tags: item.tags
                  })),
                  totalHits: data.totalHits || data.hits.length
                });
              }
            } else {
              console.log(`[Pixabay Image Request] Fails with status: ${response.status}. Falling back to DuckDuckGo.`);
            }
          } catch (err) {
            console.error("Pixabay query error, falling back to DuckDuckGo:", err);
          }
        } else {
          console.log(`[Pixabay Image Request] Pixabay API Key is empty or invalid. Falling back to DuckDuckGo.`);
        }
      }

      // 2. DuckDuckGo Provider handling
      const { hits, nextOffset } = await searchDuckDuckGoImages(q, page, offsetParam);
      if (hits && hits.length > 0) {
        return res.json({ hits: hits, totalHits: hits.length * 5, nextOffset });
      }

      // 3. Wikimedia Commons live query fallback (rate-limit free, high reliability)
      console.log(`[API Images] DDG returned empty or 403. Sourcing live images from Wikimedia Commons for "${q}"...`);
      const wikiHits = await searchWikimediaImages(q);
      if (wikiHits && wikiHits.length > 0) {
        return res.json({ hits: wikiHits, totalHits: wikiHits.length });
      }

      // 4. Openverse free media API search fallback
      try {
        const ovUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=12`;
        const ovRes = await fetch(ovUrl, { headers: { "User-Agent": "AnkiApp/1.0" } });
        if (ovRes.ok) {
          const ovData = await ovRes.json();
          if (ovData?.results && Array.isArray(ovData.results) && ovData.results.length > 0) {
            const ovHits = ovData.results.map((r: any, idx: number) => ({
              id: `ov-${r.id || idx}`,
              webformatURL: r.url,
              largeImageURL: r.url,
              tags: r.title || q
            }));
            return res.json({ hits: ovHits, totalHits: ovHits.length });
          }
        }
      } catch (e) {}

      // 5. Pollinations AI dynamic high-quality photo generation fallback
      const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}%20clear%20photo%20isolated%20educational?width=512&height=512&nologo=true`;
      const fallbackHit = [{
        id: `poll-${Date.now()}`,
        webformatURL: pollUrl,
        largeImageURL: pollUrl,
        tags: q
      }];
      return res.json({ hits: fallbackHit, totalHits: 1 });
    } catch (err) {
      console.error("[API Images] Error in image route:", err);
      res.status(500).json({ error: "Failed to load images" });
    }
  });

  // API Route - Image Proxy to download and serve external image bytes directly (bypasses CORS blocks for offline local caching)
  app.get("/api/proxy-image", async (req, res) => {
    const targetUrl = req.query.url as string || "";
    if (!targetUrl || !targetUrl.startsWith("http")) {
      return res.status(400).send("رابط صورة غير صالحة");
    }

    try {
      const userAgent = getRandomUserAgent();
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": userAgent,
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) {
        return res.status(response.status).send("فشل جلب الصورة من المصدر");
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(buffer);
    } catch (err: any) {
      // Gracefully handle unreachable host, DNS error, or timeout without throwing loud errors
      res.status(502).send("تعذر جلب الصورة من الرابط الخارجي المتردد");
    }
  });

  // API Route - Check current and live AI provider quotas/rate limits
  app.get("/api/ai-quota-check", async (req, res) => {
    const refresh = req.query.refresh === "true";
    const customApiKey = req.query.customApiKey as string || "";
    
    if (refresh) {
      // Perform live lightweight pings to extract fresh headers
      const groqKey = customApiKey || process.env.GROQ_API_KEY || "";
      const geminiKey = customApiKey || process.env.GEMINI_API_KEY || "";

      // 1. Ping Groq if key exists
      if (groqKey) {
        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model: "gemma2-9b-it", // cheaper and faster ping
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1
            })
          });

          if (response.ok) {
            const groqRateLimits = {
              limitRequests: response.headers.get("x-ratelimit-limit-requests") || response.headers.get("ratelimit-limit-requests") || "",
              limitTokens: response.headers.get("x-ratelimit-limit-tokens") || response.headers.get("ratelimit-limit-tokens") || "",
              remainingRequests: response.headers.get("x-ratelimit-remaining-requests") || response.headers.get("ratelimit-remaining-requests") || "",
              remainingTokens: response.headers.get("x-ratelimit-remaining-tokens") || response.headers.get("ratelimit-remaining-tokens") || "",
              resetRequests: response.headers.get("x-ratelimit-reset-requests") || response.headers.get("ratelimit-reset-requests") || "",
              resetTokens: response.headers.get("x-ratelimit-reset-tokens") || response.headers.get("ratelimit-reset-tokens") || "",
            };

            globalRateLimitsCache.groq = {
              rateLimits: groqRateLimits,
              rawHeaders: extractRateLimitHeaders(response.headers)
            };
            globalRateLimitsCache.lastUpdated = new Date().toISOString();
          }
        } catch (groqPingErr) {
          console.error("Groq live quota ping failed:", groqPingErr);
        }
      }

      // 2. Ping Gemini if key exists
      if (geminiKey) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "aistudio-build"
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "ping" }] }],
              generationConfig: { maxOutputTokens: 1 }
            })
          });

          if (response.ok) {
            const geminiRateLimits = {
              limitRequests: response.headers.get("x-ratelimit-limit-requests") || response.headers.get("ratelimit-limit-requests") || "",
              limitTokens: response.headers.get("x-ratelimit-limit-tokens") || response.headers.get("ratelimit-limit-tokens") || "",
              remainingRequests: response.headers.get("x-ratelimit-remaining-requests") || response.headers.get("ratelimit-remaining-requests") || "",
              remainingTokens: response.headers.get("x-ratelimit-remaining-tokens") || response.headers.get("ratelimit-remaining-tokens") || "",
              resetRequests: response.headers.get("x-ratelimit-reset-requests") || response.headers.get("ratelimit-reset-requests") || "",
              resetTokens: response.headers.get("x-ratelimit-reset-tokens") || response.headers.get("ratelimit-reset-tokens") || "",
            };

            globalRateLimitsCache.gemini = {
              rateLimits: geminiRateLimits,
              rawHeaders: extractRateLimitHeaders(response.headers)
            };
            globalRateLimitsCache.lastUpdated = new Date().toISOString();
          }
        } catch (geminiPingErr) {
          console.error("Gemini live quota ping failed:", geminiPingErr);
        }
      }
    }

    res.json({
      status: "success",
      cache: globalRateLimitsCache
    });
  });

  // API Route - Get intelligent sliding window usage stats and log list
  app.get("/api/ai-usage-stats", (req, res) => {
    try {
      const stats = getSlidingWindowStatus();
      res.json({
        status: "success",
        totalTokens24h: stats.totalTokens24h,
        totalRequests24h: stats.totalRequests24h,
        tokenLimit: stats.tokenLimit,
        requestLimit: stats.requestLimit,
        isBlocked: stats.isBlocked,
        resetInSeconds: stats.resetInSeconds,
        resetInFormatted: stats.resetInFormatted,
        recentLogs: stats.activeLogs.slice(-15).reverse()
      });
    } catch (e) {
      console.error("Failed to load sliding window usage stats:", e);
      res.status(500).json({ error: "Failed to load sliding window usage stats" });
    }
  });

  // Helper functions for YouTube Transcript Extractor
  function extractVideoId(url: string): string | null {
    if (!url) return null;
    url = url.trim();
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([^#\?&"'>]+)/,
      /^[a-zA-Z0-9_-]{11}$/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1] && match[1].length === 11) {
        return match[1];
      } else if (match && match[0] && match[0].length === 11) {
        return match[0];
      }
    }
    return null;
  }

  function extractPlayerResponse(html: string): any {
    let index = html.indexOf("ytInitialPlayerResponse =");
    if (index === -1) {
      index = html.indexOf("ytInitialPlayerResponse=");
    }
    if (index === -1) {
      index = html.indexOf("window['ytInitialPlayerResponse']");
      if (index === -1) {
        index = html.indexOf('window["ytInitialPlayerResponse"]');
      }
    }
    if (index === -1) {
      return null;
    }
    const start = html.indexOf("{", index);
    if (start === -1) return null;

    // Use a string-aware brace matching loop that ignores characters inside quotes/escapes
    const endScript = html.indexOf("</script>", start);
    const limit = endScript !== -1 ? endScript : html.length;

    let braceCount = 0;
    let inString = false;
    let stringChar = "";
    let isEscaped = false;
    let end = start;

    for (let i = start; i < limit; i++) {
      const char = html[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (inString) {
        if (char === stringChar) {
          inString = false;
        }
        continue;
      }
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        continue;
      }
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          end = i;
          break;
        }
      }
    }

    if (braceCount === 0) {
      try {
        const jsonStr = html.slice(start, end + 1);
        return JSON.parse(jsonStr);
      } catch (e) {
        console.error("String-aware brace parsing failed, trying simple script-slice fallback...", e);
      }
    }

    // Fallback to simpler search
    let simpleBraceCount = 0;
    let simpleEnd = start;
    for (let i = start; i < html.length; i++) {
      if (html[i] === "{") simpleBraceCount++;
      else if (html[i] === "}") {
        simpleBraceCount--;
        if (simpleBraceCount === 0) {
          simpleEnd = i;
          break;
        }
      }
    }
    try {
      const jsonStr = html.slice(start, simpleEnd + 1);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Simple brace parsing fallback failed:", e);
      return null;
    }
  }

  // API Route - Get YouTube Video Information (Only Image and Title)
  app.get("/api/youtube/info", async (req, res) => {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: "الرجاء توفير رابط فيديو يوتيوب." });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "الرابط المدخل غير صالح. يرجى توفير رابط فيديو يوتيوب صحيح." });
    }

    try {
      console.log(`[YouTube Info] Fetching title & thumbnail only for video ID: ${videoId}`);
      let title = "فيديو يوتيوب";
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oembedUrl);
        if (response.ok) {
          const data = await response.json();
          title = data.title || "فيديو يوتيوب";
        }
      } catch (e) {
        console.warn("[YouTube Info] oEmbed fetch failed, using fallback:", e);
      }

      res.json({
        videoId,
        title,
        thumbnailUrl,
        captionTracks: []
      });
    } catch (err: any) {
      console.error("[YouTube Info Error]", err);
      res.status(500).json({ error: err.message || "حدث خطأ غير متوقع أثناء جلب معلومات الفيديو." });
    }
  });

  // API Route - Fetch and Parse YouTube Transcript XML
  app.post("/api/youtube/transcript", async (req, res) => {
    const { baseUrl } = req.body;
    if (!baseUrl) {
      return res.status(400).json({ error: "رابط النص البرمجي (baseUrl) مطلوب." });
    }

    try {
      console.log(`[YouTube Transcript] Fetching subtitles from: ${baseUrl}`);
      const response = await fetch(baseUrl);
      if (!response.ok) {
        throw new Error("فشل تحميل نص الترجمة من خوادم يوتيوب.");
      }

      const xmlText = await response.text();
      
      // Parse XML elements using regex
      const regex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
      let match;
      const segments: { start: number; duration: number; text: string }[] = [];
      
      while ((match = regex.exec(xmlText)) !== null) {
        const start = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        let text = match[3];

        // Decode basic HTML entities commonly returned by YT XML
        text = text
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&apos;/g, "'")
          .replace(/&#x2F;/g, "/")
          .replace(/[\r\n]+/g, " ")
          .trim();

        if (text) {
          segments.push({ start, duration, text });
        }
      }

      res.json({ segments });
    } catch (err: any) {
      console.error("[YouTube Transcript Error]", err);
      res.status(500).json({ error: err.message || "فشل استخراج الترجمة المصاحبة." });
    }
  });

  // Setup Vite development middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`[Piper Server] Ready. Running background verification for Piper binaries and default models...`);
    repairPiperServerCore().then((res) => {
      console.log(`[Piper Server Startup Check] Verification complete. Executable status: ${res.success}`);
    }).catch((err) => {
      console.warn(`[Piper Server Startup Check] Non-blocking startup check error:`, err);
    });
  });
}

startServer();
