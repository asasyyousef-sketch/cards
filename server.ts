import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
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
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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


  // API Route - TTS Audio proxy with file system caching and browser-side cache optimization
  const TTS_CACHE_DIR = path.join(process.cwd(), "tts_cache");
  if (!fs.existsSync(TTS_CACHE_DIR)) {
    try {
      fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
    } catch (err) {
      console.error("Failed to create TTS cache directory:", err);
    }
  }

  app.get("/api/tts", async (req, res) => {
    const text = req.query.text as string;
    const lang = req.query.lang as string || "en";

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    try {
      const cleanText = text.trim();
      const hash = crypto.createHash("md5").update(`${lang}:${cleanText}`).digest("hex");
      const cacheFilePath = path.join(TTS_CACHE_DIR, `${hash}.mp3`);

      // Check if valid cached file exists locally
      if (fs.existsSync(cacheFilePath)) {
        try {
          const stats = fs.statSync(cacheFilePath);
          if (stats.size > 100) {
            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            return fs.createReadStream(cacheFilePath).pipe(res);
          } else {
            // Delete corrupt empty file
            fs.unlinkSync(cacheFilePath);
          }
        } catch (e) {
          console.warn("Error inspecting TTS cache file:", e);
        }
      }

      // Primary & fallback endpoints
      const urls = [
        `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(cleanText)}`,
        `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=gtx&q=${encodeURIComponent(cleanText)}`
      ];

      let nodeBuffer: Buffer | null = null;

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

            if (candidate.length > 100 && !prefix.includes("<html") && !prefix.includes("<!DOCTYPE") && !prefix.includes("{")) {
              nodeBuffer = candidate;
              break;
            }
          }
        } catch (fetchErr) {
          console.warn(`TTS fetch failed for ${url}:`, fetchErr);
        }
      }

      if (!nodeBuffer) {
        throw new Error("Could not retrieve valid audio from TTS services");
      }

      // Save to local cache asynchronously
      fs.promises.writeFile(cacheFilePath, nodeBuffer).catch((writeErr) => {
        console.error("Failed to write to TTS server cache:", writeErr);
      });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(nodeBuffer);
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
   - النص الأمامي (frontText): الكلمة أو السؤال أو الصيغة باللغة الهدف (الوجه الأمامي).
   - النص الخلفي (backText): الترجمة أو الإجابة أو الشرح التفصيلي باللغة العربية (الوجه الخلفي).
   - وضع الأداة (isArticleMode): ضع قيمته true فقط إذا كانت الكلمة الأمامية اسماً في اللغة الألمانية ويملك أداة تعريف (der/die/das/die-plural).
   - الأداة الصحيحة (correctArticle): إذا كان isArticleMode يساوي true، حدد الأداة المناسبة بدقة بالغة: "der" للمذكر، "die" للمؤنث، "das" للمحايد، و "die-plural" للجمع. خلاف ذلك اتركها فارغة "".
   - تلميح الترجمة (translationHint): تلميح مفيد قصير لمساعدة الطالب على الحل أو النطق (اختياري).
   - الصعوبة (difficulty): مستوى الصعوبة المناسب: 'easy' أو 'medium' أو 'hard'.
   - استعلام البحث عن صورة (imageSearchQuery): كلمة أو عبارة قصيرة جداً وبسيطة باللغة الإنجليزية تمثل الكلمة/المفهوم بصرياً للبحث عنها في محرك الصور (مثل: 'apple', 'germany', 'running', 'molecule', 'clock').

تأكد من أن الكلمات دقيقة جداً لغوياً وصحيحة إملائياً، ومفيدة جداً للمتعلم.`;

      let customRules = "\n\n⚠️ قواعد التخصيص الإضافية التي حددها المستخدم ويجب الالتزام بها:";
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
            const { hits } = await searchDuckDuckGoImages(folderQuery, "1");
            if (hits && hits.length > 0) {
              generatedData.folder.coverImage = hits[0].largeImageURL || hits[0].webformatURL || "";
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
      
      // 4. Return empty if no relevant images found (do not return random static images)
      console.log(`[API Images] No relevant search results found for "${q}". Returning empty hits.`);
      res.json({ hits: [], totalHits: 0 });
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
        }
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
    } catch (err) {
      console.error("[Proxy Image Error]", err);
      res.status(500).send("خطأ في الخادم أثناء خفر الصورة");
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
  });
}

startServer();
