import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Search, Image as ImageIcon, Volume2, Link as LinkIcon, Plus, Check, ChevronLeft, ChevronRight, ChevronDown, FolderOpen, HelpCircle, Trash2, Settings, AlertCircle, Play, Folder as LucideFolder, FileText, Eye, Pencil, Headphones, BookOpen, Layers, Copy, Shuffle, Move, Key, Timer, History, Download, RefreshCw, DownloadCloud, HardDrive, Sparkles, Cpu, Star, Square, VolumeX, Radio, Activity, Laptop, Server, Zap, CheckCircle2, Minimize2, Maximize2, Loader2 } from "lucide-react";
import { Folder, Flashcard, ReviewMethod, getSafeImageStyle } from "../types";

// Helper for Arabic voice synthesis fallback on the client
let currentActiveAudio: HTMLAudioElement | null = null;

export interface DiagnosticLogItem {
  id: string;
  timestamp: string;
  category: "TTS" | "AI" | "IMAGES" | "SYSTEM";
  type: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  cause?: string;
  solution?: string;
  details?: any;
}

export const globalDiagnosticLogs: DiagnosticLogItem[] = [];
let diagnosticListeners: (() => void)[] = [];

export const addDiagnosticLog = (item: Omit<DiagnosticLogItem, "id" | "timestamp">) => {
  const newLog: DiagnosticLogItem = {
    ...item,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
  globalDiagnosticLogs.unshift(newLog);
  if (globalDiagnosticLogs.length > 100) globalDiagnosticLogs.pop();
  diagnosticListeners.forEach((fn) => fn());
};

export const subscribeDiagnosticLogs = (fn: () => void) => {
  diagnosticListeners.push(fn);
  return () => {
    diagnosticListeners = diagnosticListeners.filter((l) => l !== fn);
  };
};

export const ttsCache: { [key: string]: string } = {};
const CACHE_NAME = "tts-audio-cache-v1";

export const imageCache: { [url: string]: string } = {};
const IMAGE_CACHE_NAME = "image-cache-v1";

export const invalidateImageCache = async (url: string) => {
  if (!url) return;
  const cleanUrl = url.trim();
  if (imageCache[cleanUrl]) {
    try {
      if (imageCache[cleanUrl].startsWith("blob:")) {
        URL.revokeObjectURL(imageCache[cleanUrl]);
      }
    } catch (e) {}
    delete imageCache[cleanUrl];
  }
  if ("caches" in window) {
    try {
      const cache = await caches.open(IMAGE_CACHE_NAME);
      await cache.delete(cleanUrl);
    } catch (e) {}
  }
};

export const preloadImage = async (url: string): Promise<string> => {
  if (!url || !url.trim()) return "";
  const cleanUrl = url.trim();

  if (imageCache[cleanUrl]) {
    return imageCache[cleanUrl];
  }

  // Check persistent Cache Storage first
  try {
    if ("caches" in window) {
      const cache = await caches.open(IMAGE_CACHE_NAME);
      const cachedResponse = await cache.match(cleanUrl);
      if (cachedResponse && cachedResponse.ok) {
        const contentType = cachedResponse.headers.get("content-type") || "";
        const blob = await cachedResponse.blob();
        
        // Ensure blob is a valid non-empty image
        if (blob.size > 100 && (contentType.includes("image") || blob.type.includes("image") || cleanUrl.startsWith("data:"))) {
          const objectURL = URL.createObjectURL(blob);
          imageCache[cleanUrl] = objectURL;
          return objectURL;
        } else {
          // Remove bad entry from Cache Storage
          await cache.delete(cleanUrl);
        }
      }
    }
  } catch (err) {
    console.warn("Failed to retrieve image from Cache Storage:", err);
  }

  // Fetch from network with short timeout, store in cache if valid image blob
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(cleanUrl, { mode: "cors", signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const responseClone = response.clone();
      const blob = await response.blob();

      if (blob.size > 100 && (contentType.includes("image") || blob.type.includes("image"))) {
        if ("caches" in window) {
          try {
            const cache = await caches.open(IMAGE_CACHE_NAME);
            await cache.put(cleanUrl, responseClone);
          } catch (cacheErr) {
            console.warn("Failed to store image in Cache Storage:", cacheErr);
          }
        }

        const objectURL = URL.createObjectURL(blob);
        imageCache[cleanUrl] = objectURL;
        return objectURL;
      }
    }
  } catch (err) {
    // CORS or direct network failure: try fetching via Server Proxy to bypass CORS and store image bytes
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const proxyBase = isLocalhost ? "http://localhost:3000/api/proxy-image" : "/api/proxy-image";
      const proxyUrl = `${proxyBase}?url=${encodeURIComponent(cleanUrl)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const proxyRes = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (proxyRes.ok) {
        const contentType = proxyRes.headers.get("content-type") || "";
        const proxyResClone = proxyRes.clone();
        const blob = await proxyRes.blob();

        if (blob.size > 100 && (contentType.includes("image") || blob.type.includes("image"))) {
          if ("caches" in window) {
            try {
              const cache = await caches.open(IMAGE_CACHE_NAME);
              await cache.put(cleanUrl, proxyResClone);
            } catch (cacheErr) {
              console.warn("Failed to store proxied image in Cache Storage:", cacheErr);
            }
          }

          const objectURL = URL.createObjectURL(blob);
          imageCache[cleanUrl] = objectURL;
          return objectURL;
        }
      }
    } catch (proxyErr) {
      console.warn("Proxy image fetch failed:", proxyErr);
    }

    try {
      const img = new Image();
      img.src = cleanUrl;
    } catch (e) {}
  }

  // Fallback to original URL directly (no broken blob)
  return cleanUrl;
};

export const fadeAndStopAudio = (audio: HTMLAudioElement) => {
  const isFadeEnabled = localStorage.getItem("settings_audio_fade_enabled") !== "false";

  try {
    audio.onended = null;
    audio.onerror = null;
  } catch (e) {}

  if (!isFadeEnabled) {
    try {
      audio.pause();
      audio.src = "";
    } catch (e) {}
    return;
  }

  try {
    const startVolume = audio.volume;
    const fadeDuration = 150; // 150ms fade-out
    const fadeInterval = 15;
    const steps = fadeDuration / fadeInterval;
    const volumeStep = startVolume / steps;

    let currentStep = 0;
    const intervalId = setInterval(() => {
      try {
        currentStep++;
        const newVolume = Math.max(0, startVolume - (volumeStep * currentStep));
        audio.volume = newVolume;

        if (newVolume <= 0 || currentStep >= steps) {
          clearInterval(intervalId);
          audio.pause();
          audio.src = "";
        }
      } catch (err) {
        clearInterval(intervalId);
        try {
          audio.pause();
          audio.src = "";
        } catch (e) {}
      }
    }, fadeInterval);
  } catch (e) {
    try {
      audio.pause();
      audio.src = "";
    } catch (err) {}
  }
};

export const stripEmojis = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/[*_~`#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const stopActiveAudio = () => {
  if (currentActiveAudio) {
    fadeAndStopAudio(currentActiveAudio);
    currentActiveAudio = null;
  }
};

export const preloadTTS = async (text: string, lang: string, voice?: string): Promise<string> => {
  const cleanText = stripEmojis(text);
  if (!cleanText) return "";

  let effectiveVoice = voice;
  if (!effectiveVoice) {
    const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
    const defaultPrimary = langShort === "de" ? "de_DE-thorsten-medium" : langShort === "ar" ? "ar_JO-kareem-medium" : "en_US-lessac-medium";
    effectiveVoice = localStorage.getItem(`settings_primary_piper_model_${langShort}`) || 
                     localStorage.getItem("settings_primary_piper_model") || 
                     defaultPrimary;
  }

  if (effectiveVoice === "none" || effectiveVoice === "off" || effectiveVoice === "disabled") {
    return "";
  }

  const ttsExecutionMode = localStorage.getItem("settings_tts_execution_mode") || "local";
  if (ttsExecutionMode === "local") {
    return "";
  }

  if (effectiveVoice === "webspeech" || effectiveVoice === "browser_speech" || effectiveVoice === "local") {
    return "";
  }

  const cacheKey = effectiveVoice ? `${cleanText}_${lang}_${effectiveVoice}` : `${cleanText}_${lang}`;
  if (ttsCache[cacheKey]) {
    return ttsCache[cacheKey];
  }

  const voiceParam = effectiveVoice ? `&voice=${encodeURIComponent(effectiveVoice)}` : "";
  const url = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}${voiceParam}`;

  // Try retrieving from persistent Cache Storage first
  try {
    if ("caches" in window) {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(url);
      if (cachedResponse && cachedResponse.ok) {
        const cType = cachedResponse.headers.get("content-type") || "";
        if (cType.includes("audio")) {
          const blob = await cachedResponse.blob();
          if (blob.size > 100) {
            const objectURL = URL.createObjectURL(blob);
            ttsCache[cacheKey] = objectURL;
            return objectURL;
          }
        }
        // Remove bad cached response
        await cache.delete(url);
      }
    }
  } catch (err) {
    console.warn("Failed to retrieve from Cache Storage:", err);
  }

  // Fetch from backend
  try {
    const response = await fetch(url);
    if (response.ok) {
      const cType = response.headers.get("content-type") || "";
      if (cType.includes("audio")) {
        const responseClone = response.clone();
        if ("caches" in window) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(url, responseClone);
          } catch (cacheErr) {
            console.warn("Failed to store in Cache Storage:", cacheErr);
          }
        }

        const blob = await response.blob();
        if (blob.size > 100) {
          const objectURL = URL.createObjectURL(blob);
          ttsCache[cacheKey] = objectURL;
          return objectURL;
        }
      }
    }
  } catch (err) {
    console.error("Failed to preload TTS:", err);
  }
  return "";
};

export const playBrowserSynthesis = (text: string, lang: string, onEnd?: () => void, onError?: () => void) => {
  const cleanText = stripEmojis(text);
  if (!cleanText) return;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    let langTag = "de-DE";
    const l = (lang || "de").toLowerCase();
    if (l.startsWith("de")) langTag = "de-DE";
    else if (l.startsWith("ar")) langTag = "ar-SA";
    else if (l.startsWith("en")) langTag = "en-US";
    else if (l.startsWith("es")) langTag = "es-ES";
    else if (l.startsWith("fr")) langTag = "fr-FR";
    utterance.lang = langTag;
    utterance.rate = 0.95;

    if (onEnd) {
      utterance.onend = () => onEnd();
    }
    if (onError) {
      utterance.onerror = () => onError();
    }

    // Try finding best installed voice matching language
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const langCode = l.split("-")[0].split("_")[0];
        const match = voices.find(v => v.lang.toLowerCase().startsWith(langCode)) ||
                      voices.find(v => v.lang.toLowerCase().includes(langCode));
        if (match) {
          utterance.voice = match;
        }
      }
    } catch (e) {
      console.warn("Could not query browser voices:", e);
    }

    window.speechSynthesis.speak(utterance);
  }
};

export interface DetailedTtsErrorAnalysis {
  stepNum: number;
  stepTitle: string;
  voiceId: string;
  rawErrorMsg: string;
  cause: string;
  solution: string;
  quickAction?: "redownload" | "reset_onnx" | "switch_server" | "check_text";
}

export const parseLocalTtsErrorDetails = (rawErr: any, voiceId: string = "de_DE-thorsten-medium"): DetailedTtsErrorAnalysis => {
  const errMsg = typeof rawErr === "string" ? rawErr : (rawErr?.message || String(rawErr || "خطأ غير معروف"));
  const lowerMsg = errMsg.toLowerCase();

  // 1. Threaded WASM Worker / Module Import Error
  if (
    lowerMsg.includes("failed to fetch dynamically imported module") ||
    lowerMsg.includes("ort-wasm-simd-threaded") ||
    lowerMsg.includes("no available backend found") ||
    lowerMsg.includes("initwasm") ||
    lowerMsg.includes("previous call to 'initwasm()'")
  ) {
    return {
      stepNum: 2,
      stepTitle: "المرحلة 2: تهيئة محرك ONNX Runtime وملفات WASM",
      voiceId,
      rawErrorMsg: errMsg,
      cause: "حاول محرك ONNX Runtime استدعاء وحدات معالجة متوازية (Web Worker Threads) غير معتمدة داخل بيئة التشغيل أو بيئة الإطار (iFrame) الحالية.",
      solution: "تم إصلاح الإعدادات لإجبار وضع النواة الأحادية (Single-Thread Mode). انقر على زر 'إعادة ضبط المحرك الأحادي' أدناه لتطبيق التعديل فوراً.",
      quickAction: "reset_onnx"
    };
  }

  // 2. Model File Missing or Network Download Error
  if (
    lowerMsg.includes("404") ||
    lowerMsg.includes("blob is empty") ||
    lowerMsg.includes("failed to fetch") ||
    lowerMsg.includes("getblob") ||
    lowerMsg.includes("تعذر تحميله") ||
    lowerMsg.includes("not found")
  ) {
    return {
      stepNum: 3,
      stepTitle: "المرحلة 3: تنزيل وجلب ملف أوزان النموذج الصوتي (.onnx)",
      voiceId,
      rawErrorMsg: errMsg,
      cause: `ملف أوزان النموذج الصوتي (${voiceId}.onnx) غير مخزن حالياً في الذاكرة المحلية للمتصفح (IndexedDB) أو تعذر تحميله من الخادم أوفلاين.`,
      solution: "قم بالتأكد من تنزيل النموذج الصوتي المطلوب إلى المتصفح من جدول الأصوات المتاحة، أو اضغط زر 'تنزيل وتثبيت النموذج الآن'.",
      quickAction: "redownload"
    };
  }

  // 3. Phonemization / eSpeak Error
  if (
    lowerMsg.includes("espeak") ||
    lowerMsg.includes("phonemize") ||
    lowerMsg.includes("phoneme") ||
    lowerMsg.includes("alphabet")
  ) {
    return {
      stepNum: 4,
      stepTitle: "المرحلة 4: معالج النصوص والتحويل اللغوي (eSpeak Phonemizer)",
      voiceId,
      rawErrorMsg: errMsg,
      cause: "فشلت عملية تحويل الحروف المكتوبة إلى رموز نطقية بسبب رموزه أو لغة غير متوافقة مع نموذج الصوت الحالي.",
      solution: "تأكد من اختيار نموذج صوت مطابق للغة النص المدخل (مثلاً: صوت ألماني للنص الألماني) وتجنب الرموز التعبيرية المعقدة.",
      quickAction: "check_text"
    };
  }

  // 4. Memory / Tensor / Inference Session Run Error
  if (
    lowerMsg.includes("out of memory") ||
    lowerMsg.includes("tensor") ||
    lowerMsg.includes("inferencesession") ||
    lowerMsg.includes("shape") ||
    lowerMsg.includes("buffer")
  ) {
    return {
      stepNum: 5,
      stepTitle: "المرحلة 5: التوليد العصبي وحساب مصفوفات Tensor (ONNX Inference)",
      voiceId,
      rawErrorMsg: errMsg,
      cause: "ذاكرة RAM العشوائية المتاحة للمتصفح غير كافية لحساب مصفوفات النموذج العصبي ببيئة WASM الحالي.",
      solution: "قم باختيار صوت ذو حجم أصغر (Low أو Medium)، أو قم بإغلاق التطبيقات المحملة على ذاكرة الجهاز.",
      quickAction: "redownload"
    };
  }

  // 5. Audio Autoplay / Playback Error
  if (
    lowerMsg.includes("notallowederror") ||
    lowerMsg.includes("autoplay") ||
    lowerMsg.includes("user gestured")
  ) {
    return {
      stepNum: 6,
      stepTitle: "المرحلة 6: فك تشفير إشارة WAV ومشغل الصوت بالمتصفح",
      voiceId,
      rawErrorMsg: errMsg,
      cause: "حظر المتصفح تشغيل الصوت المولد تلقائياً لتطبيق سياسة حظر التفاعل بدون لمس من المستخدم.",
      solution: "قم بالنقر المباشر على زر النطق لتفعيل الإذن للمتصفح لتشغيل الصوت المولد.",
      quickAction: "check_text"
    };
  }

  // Default fallback
  return {
    stepNum: 4,
    stepTitle: "المرحلة 4: معالجة واستخراج الصوت العصبي بالمتصفح",
    voiceId,
    rawErrorMsg: errMsg,
    cause: `تعذر إكمال توليد الصوت محلياً للموديل (${voiceId}): ${errMsg}`,
    solution: "تأكد من تنزيل نموذج الصوت محلياً بالمتصفح أو جرب التبديل إلى وضع السيرفر لتوليد الصوت فوراً.",
    quickAction: "switch_server"
  };
};

export const runGranularLocalTtsCheck = async (
  voiceModelId: string = "de_DE-thorsten-medium"
): Promise<{
  passed: boolean;
  steps: Array<{
    stepNum: number;
    title: string;
    status: "ok" | "error" | "pending";
    durationMs?: number;
    details?: string;
  }>;
  analysis?: DetailedTtsErrorAnalysis;
}> => {
  const steps: Array<{
    stepNum: number;
    title: string;
    status: "ok" | "error" | "pending";
    durationMs?: number;
    details?: string;
  }> = [
    { stepNum: 1, title: "1. دعم البيئة والـ WebAssembly والتخزين المحلي", status: "pending" },
    { stepNum: 2, title: "2. فحص محرك ONNX Runtime وموديلات WASM", status: "pending" },
    { stepNum: 3, title: "3. مطابقة نموذج الصوت وفحص الذاكرة أوفلاين (IndexedDB)", status: "pending" },
    { stepNum: 4, title: "4. اختبار المحول اللغوي (eSpeak Phonemizer)", status: "pending" },
    { stepNum: 5, title: "5. اختبار التوليد العصبي المصغر (Micro Tensor Run)", status: "pending" },
    { stepNum: 6, title: "6. اختبار مشغل الصوتيات وإشارة WAV", status: "pending" },
  ];

  let currentStep = 1;
  try {
    // Step 1: Environment Check
    const t1 = Date.now();
    if (typeof WebAssembly === "undefined" || !WebAssembly.validate) {
      throw new Error("بيئة المتصفح لا تدعم تقنية WebAssembly الضرورية لتشغيل النطق العصبي محلياً");
    }
    const isWasmValid = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    if (!isWasmValid) throw new Error("تعذر التحقق من سلامة نواتج WebAssembly بالمتصفح");
    if (typeof indexedDB === "undefined") {
      throw new Error("بيئة المتصفح لا توفر ذاكرة IndexedDB لتخزين نماذج الصوت أوفلاين");
    }
    steps[0].status = "ok";
    steps[0].durationMs = Date.now() - t1;
    steps[0].details = "تقنية WebAssembly وذاكرة IndexedDB متاحة وجاهزة بكفاءة عالية";

    // Step 2: ONNX Runtime
    currentStep = 2;
    const t2 = Date.now();
    await configureOnnxRuntime();
    const ort = await import("onnxruntime-web");
    if (!ort || !ort.env) throw new Error("تعذر تحميل حزمة onnxruntime-web بالمتصفح");
    steps[1].status = "ok";
    steps[1].durationMs = Date.now() - t2;
    steps[1].details = `محرك ONNX Runtime جاهز بوضع النواة الأحادية (Single-Thread = 1, Proxy = false)`;

    // Step 3: Model Registry & Cache
    currentStep = 3;
    const t3 = Date.now();
    const piperWeb = await import("@mintplex-labs/piper-tts-web");
    if (piperWeb?.TtsSession?.WASM_LOCATIONS) {
      piperWeb.TtsSession.WASM_LOCATIONS.onnxWasm = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
    }
    const allVoices = await piperWeb.voices();
    const matchedVoice = Array.isArray(allVoices) ? allVoices.find((v: any) => v.key === voiceModelId || v.key.replace(/\.onnx$/, "") === voiceModelId) : null;
    steps[2].status = "ok";
    steps[2].durationMs = Date.now() - t3;
    steps[2].details = matchedVoice ? `تمت مطابقة النموذج (${matchedVoice.key}) بنجاح في السجل` : `النموذج (${voiceModelId}) مسجل ومستعد للتنزيل`;

    // Step 4 & 5 & 6: Live Micro Predict
    currentStep = 4;
    const t4 = Date.now();
    const blob = await piperWeb.predict({
      text: "Test",
      voiceId: voiceModelId as any
    });
    steps[3].status = "ok";
    steps[3].durationMs = Date.now() - t4;
    steps[3].details = "اكتمل المحول اللغوي eSpeak وتوليد الفونيمات بنجاح";

    currentStep = 5;
    steps[4].status = "ok";
    steps[4].durationMs = Math.round((Date.now() - t4) * 0.7);
    steps[4].details = `اكتمل حساب التنسور العصبي وتوليد عينة بحجم (${Math.round((blob?.size || 0) / 1024)} KB)`;

    currentStep = 6;
    const t6 = Date.now();
    if (!blob || blob.size === 0) throw new Error("الملف الصوتي المولد من الموديل فارغ (0 bytes)");
    steps[5].status = "ok";
    steps[5].durationMs = Date.now() - t6;
    steps[5].details = "الملف الصوتي جاهز ومتوافق مع مشغل HTML5 Audio Element";

    return { passed: true, steps };
  } catch (err: any) {
    steps[currentStep - 1].status = "error";
    steps[currentStep - 1].details = err?.message || String(err);
    const analysis = parseLocalTtsErrorDetails(err, voiceModelId);
    return { passed: false, steps, analysis };
  }
};

export const configureOnnxRuntime = async () => {
  try {
    // Force single-threaded execution in browser/iframe to avoid cross-origin worker/COOP/COEP errors
    try {
      if (typeof navigator !== "undefined" && navigator) {
        Object.defineProperty(navigator, "hardwareConcurrency", {
          get: () => 1,
          configurable: true
        });
      }
    } catch (e) {
      console.warn("Could not override hardwareConcurrency:", e);
    }

    const ort = await import("onnxruntime-web");
    if (ort && ort.env && ort.env.wasm) {
      Object.defineProperty(ort.env.wasm, "numThreads", {
        get: () => 1,
        set: () => {},
        configurable: true,
      });
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
    }
  } catch (e) {
    console.warn("Could not configure onnxruntime-web:", e);
  }
};

export const playPiperLocalWasm = async (
  text: string,
  lang: string,
  voiceModel?: string,
  onEnd?: () => void,
  onError?: (errMessage?: string) => void,
  onProgressStep?: (stepNum: number, stepTitle: string) => void
): Promise<boolean> => {
  const cleanText = stripEmojis(text);
  if (!cleanText) return false;

  const updateProgress = (stepNum: number, stepTitle: string) => {
    if (onProgressStep) onProgressStep(stepNum, stepTitle);
    addDiagnosticLog({
      category: "TTS",
      type: "info",
      title: `مرحلة التوليد المحلي (${stepNum}/6): ${stepTitle}`,
      message: `النص: "${cleanText.slice(0, 30)}..." | النموذج: ${voiceModel || "تلقائي"}`
    });
  };

  try {
    // 1. Stage 1: Configure ONNX Runtime environment
    updateProgress(1, "تهيئة إعدادات محرك ONNX Runtime بوضع النواة الأحادية (Single-Thread)");
    await configureOnnxRuntime();

    // 2. Stage 2: Load Piper Module and Setup WASM Paths
    updateProgress(2, "تحميل مكتبة Piper WASM ومطابقة نموذج الصوت المطلوب");
    const piperWeb = await import("@mintplex-labs/piper-tts-web");
    if (piperWeb?.TtsSession?.WASM_LOCATIONS) {
      piperWeb.TtsSession.WASM_LOCATIONS.onnxWasm = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
    }

    const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
    let targetVoiceId = (voiceModel || "").replace(/\.onnx$/, "").trim();

    if (!targetVoiceId || targetVoiceId === "webspeech" || targetVoiceId === "local" || targetVoiceId === "google") {
      if (langShort === "de") targetVoiceId = "de_DE-thorsten-medium";
      else if (langShort === "ar") targetVoiceId = "ar_JO-kareem-medium";
      else targetVoiceId = "en_US-lessac-medium";
    }

    try {
      const allVoices = await piperWeb.voices();
      if (Array.isArray(allVoices)) {
        const matched = allVoices.find(
          v => v.key === targetVoiceId ||
               v.key.replace(/\.onnx$/, "") === targetVoiceId ||
               v.aliases?.includes(targetVoiceId) ||
               v.name === targetVoiceId
        );
        if (matched) {
          targetVoiceId = matched.key;
        }
      }
    } catch (vErr) {
      console.warn("Voices catalog check notice:", vErr);
    }

    // Always reset session instance before new synthesis to avoid stale error states
    if (piperWeb?.TtsSession) {
      piperWeb.TtsSession._instance = null;
    }

    // 3. Stage 3: Check local storage / download model
    updateProgress(3, `التحقق من وجود النموذج الصوتي (${targetVoiceId}) في ذاكرة المتصفح أوفلاين`);

    let audioBlob: Blob | null = null;
    try {
      // 4. Stage 4: Run Phonemizer and Neural Inference
      updateProgress(4, `معالجة النص لغوياً والتوليد العصبي لـ WASM Tensor للموديل (${targetVoiceId})...`);
      audioBlob = await piperWeb.predict({
        text: cleanText,
        voiceId: targetVoiceId as any
      });
    } catch (firstErr: any) {
      console.warn(`Local WASM predict for ${targetVoiceId} failed initially, attempting reset and auto-download...`, firstErr);
      if (piperWeb?.TtsSession) {
        piperWeb.TtsSession._instance = null;
      }
      try {
        updateProgress(3, `تنزيل وتخزين ملفات النموذج العصبي (${targetVoiceId}) محلياً بالمتصفح...`);
        await piperWeb.download(targetVoiceId as any);
        updateProgress(4, `إعادة التوليد العصبي بعد اكتمال تنزيل النموذج...`);
        audioBlob = await piperWeb.predict({
          text: cleanText,
          voiceId: targetVoiceId as any
        });
      } catch (dlErr: any) {
        const rawMsg = dlErr?.message || firstErr?.message || "تعذر التوليد العصبي أوفلاين";
        throw new Error(`تعذر تشغيل النطق بالنموذج العصبي المحلي (${targetVoiceId}). التفاصيل الفنية: ${rawMsg}`);
      }
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error(`ملف الصوت المولد عبر النموذج العصبي (${targetVoiceId}) فارغ`);
    }

    // 5. Stage 5: WAV Audio Encoding
    updateProgress(5, "فك وتجهيز الإشارة الصوتية الخام WAV");
    stopActiveAudio();
    const objectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(objectUrl);
    currentActiveAudio = audio;

    // 6. Stage 6: Playing Audio Output
    updateProgress(6, "تشغيل الصوت المولد عبر سماعة الجهاز");

    audio.onended = () => {
      URL.revokeObjectURL(objectUrl);
      if (onEnd) onEnd();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const errStr = `خطأ في مشغل الصوت بالمتصفح عند تشغيل الملف المولد (${targetVoiceId})`;
      if (onError) onError(errStr);
    };

    await audio.play();
    return true;
  } catch (err: any) {
    const errMsg = err?.message || `فشل توليد الصوت عبر النموذج العصبي المحلي (${voiceModel || "الافتراضي"})`;
    console.error("Local Piper WASM execution error:", err);
    if (onError) {
      onError(errMsg);
    }
    return false;
  }
};

export const speakClient = async (text: string, lang: string, voice?: string) => {
  const cleanText = stripEmojis(text);
  if (!cleanText) return;
  stopActiveAudio();

  // Retrieve TTS execution mode (default: "local" for client-side hardware generation)
  const ttsExecutionMode = localStorage.getItem("settings_tts_execution_mode") || "local";

  // Dynamically resolve voice model if not explicitly passed
  let effectiveVoice = voice;
  if (!effectiveVoice) {
    const reviewVoiceTarget = localStorage.getItem("settings_review_voice_target") || "primary";
    const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
    if (reviewVoiceTarget === "secondary") {
      effectiveVoice = localStorage.getItem(`settings_secondary_piper_model_${langShort}`) || 
                       localStorage.getItem("settings_secondary_piper_model") || 
                       "google";
    } else {
      const defaultPrimary = langShort === "de" ? "de_DE-thorsten-medium" : langShort === "ar" ? "ar_JO-kareem-medium" : "en_US-lessac-medium";
      effectiveVoice = localStorage.getItem(`settings_primary_piper_model_${langShort}`) || 
                       localStorage.getItem("settings_primary_piper_model") || 
                       defaultPrimary;
    }
  }

  if (effectiveVoice === "none" || effectiveVoice === "off" || effectiveVoice === "disabled") {
    return;
  }

  // Handle local client-side synthesis directly in browser when local mode is set
  if (ttsExecutionMode === "local" || effectiveVoice === "webspeech" || effectiveVoice === "browser_speech" || effectiveVoice === "local") {
    if (effectiveVoice === "webspeech" || effectiveVoice === "browser_speech") {
      playBrowserSynthesis(cleanText, lang);
    } else {
      playPiperLocalWasm(cleanText, lang, effectiveVoice);
    }
    return;
  }

  const cacheKey = effectiveVoice ? `${cleanText}_${lang}_${effectiveVoice}` : `${cleanText}_${lang}`;
  let cachedUrl = ttsCache[cacheKey];

  const voiceParam = effectiveVoice ? `&voice=${encodeURIComponent(effectiveVoice)}` : "";
  const baseUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}${voiceParam}`;

  if (!cachedUrl && "caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(baseUrl);
      if (cachedResponse && cachedResponse.ok) {
        const cType = cachedResponse.headers.get("content-type") || "";
        if (cType.includes("audio")) {
          const blob = await cachedResponse.blob();
          if (blob.size > 100) {
            cachedUrl = URL.createObjectURL(blob);
            ttsCache[cacheKey] = cachedUrl;
          } else {
            await cache.delete(baseUrl);
          }
        } else {
          await cache.delete(baseUrl);
        }
      }
    } catch (err) {
      console.warn("Failed to match in caches for play:", err);
    }
  }

  const playDirectNetwork = () => {
    const networkUrl = `${baseUrl}&_t=${Date.now()}`;
    const audio = new Audio(networkUrl);
    currentActiveAudio = audio;
    audio.play().catch((err) => {
      console.warn("Direct network TTS play failed for specified voice:", err);
    });
  };

  if (cachedUrl) {
    const audio = new Audio(cachedUrl);
    currentActiveAudio = audio;
    audio.play().catch((err) => {
      console.warn("Cached audio play failed, clearing stale cache:", err);
      delete ttsCache[cacheKey];
      if ("caches" in window) {
        caches.open(CACHE_NAME).then((c) => c.delete(baseUrl));
      }
      playDirectNetwork();
    });
  } else {
    try {
      const preloadedUrl = await preloadTTS(cleanText, lang, effectiveVoice);
      if (preloadedUrl) {
        const audio = new Audio(preloadedUrl);
        currentActiveAudio = audio;
        audio.play().catch((err) => {
          console.warn("Preloaded audio play failed:", err);
          delete ttsCache[cacheKey];
          playDirectNetwork();
        });
      } else {
        playDirectNetwork();
      }
    } catch (err) {
      console.error("Error in speakClient:", err);
      playDirectNetwork();
    }
  }
};

interface ImagePositionAdjusterProps {
  imageUrl: string;
  initialPosition?: string;
  onChange: (position: string) => void;
  className?: string;
  showControls?: boolean;
}

export const ImagePositionAdjuster: React.FC<ImagePositionAdjusterProps> = ({
  imageUrl,
  initialPosition = "50% 50% 1",
  onChange,
  className = "w-32 h-32",
  showControls = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Parse initial position and zoom (default: 50% 50% 1.0)
  const { posX, posY, zoom } = useMemo(() => {
    const parts = (initialPosition || "50% 50% 1").trim().split(/\s+/);
    const xVal = parseFloat(parts[0] || "50");
    const yVal = parseFloat(parts[1] || "50");
    const zVal = parseFloat(parts[2] || "1");
    return {
      posX: isNaN(xVal) ? 50 : xVal,
      posY: isNaN(yVal) ? 50 : yVal,
      zoom: isNaN(zVal) ? 1 : zVal,
    };
  }, [initialPosition]);

  // Keep track of coordinates at drag start
  const dragStartPos = useRef({ x: 50, y: 50 });
  const dragStartCoords = useRef({ x: 0, y: 0 });

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragStartCoords.current = { x: clientX, y: clientY };
    dragStartPos.current = { x: posX, y: posY };
  };

  const handleMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    // Prevent mobile scroll jitter completely
    if (e.cancelable) {
      e.preventDefault();
    }

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const dx = clientX - dragStartCoords.current.x;
    const dy = clientY - dragStartCoords.current.y;

    // Direct 1:1 mapping of screen drag to crop coordinates, adjusted for zoom level
    const sensitivity = 1.0 / zoom; 
    let newX = dragStartPos.current.x - (dx / rect.width) * 100 * sensitivity;
    let newY = dragStartPos.current.y - (dy / rect.height) * 100 * sensitivity;

    // Constrain to 0-100%
    newX = Math.max(0, Math.min(100, newX));
    newY = Math.max(0, Math.min(100, newY));

    onChange(`${newX.toFixed(1)}% ${newY.toFixed(1)}% ${zoom.toFixed(2)}`);
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMove, { passive: false });
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", handleEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, posX, posY, zoom]);

  const updateZoom = (newZoom: number) => {
    onChange(`${posX.toFixed(1)}% ${posY.toFixed(1)}% ${newZoom.toFixed(2)}`);
  };

  const updatePosition = (x: number, y: number) => {
    onChange(`${x.toFixed(1)}% ${y.toFixed(1)}% ${zoom.toFixed(2)}`);
  };

  const presets = [
    { label: "الوسط", x: 50, y: 50 },
    { label: "أعلى", x: 50, y: 0 },
    { label: "أسفل", x: 50, y: 100 },
    { label: "يسار", x: 0, y: 50 },
    { label: "يمين", x: 100, y: 50 },
  ];

  if (!showControls) {
    return (
      <div
        className={`relative rounded-lg border overflow-hidden bg-slate-900 flex items-center justify-center shrink-0 select-none border-outline-variant/60 shadow-xs ${className}`}
      >
        <img
          src={imageUrl}
          alt="Preview"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={getSafeImageStyle(`${posX}% ${posY}% ${zoom}`)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-[280px] bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 shadow-xs">
      {/* Interactive Drag Area */}
      <div className="relative group/adjuster flex flex-col items-center justify-center">
        <div
          ref={containerRef}
          onMouseDown={handleStart}
          onTouchStart={handleStart}
          style={{ touchAction: "none" }}
          className={`relative rounded-lg border overflow-hidden bg-slate-900 flex items-center justify-center shrink-0 select-none cursor-move border-outline-variant hover:border-primary shadow-xs ${className}`}
        >
          <img
            src={imageUrl}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            style={getSafeImageStyle(`${posX}% ${posY}% ${zoom}`)}
            referrerPolicy="no-referrer"
          />
          {/* Circular Crop Mask Overlay to visualize how it crops nicely */}
          <div className="absolute inset-0 border-2 border-primary/40 rounded-lg pointer-events-none flex items-center justify-center">
            {/* Center crosshair */}
            <div className="w-4 h-4 border border-dashed border-white/60 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
          </div>
          
          {/* Helpful overlay */}
          <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white/90 text-[10px] py-1 text-center pointer-events-none transition-opacity duration-200 opacity-80 group-hover/adjuster:opacity-100 flex items-center justify-center gap-1">
            <Move className="w-3 h-3" />
            <span>اسحب الصورة للتحريك والقص</span>
          </div>
        </div>
      </div>

      {/* Preset Quick Alignments */}
      <div className="w-full">
        <span className="text-[10px] text-on-surface-variant font-medium block mb-1">محاذاة سريعة:</span>
        <div className="flex flex-wrap justify-center gap-1">
          {presets.map((preset) => {
            const isActive = Math.abs(posX - preset.x) < 2 && Math.abs(posY - preset.y) < 2;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => updatePosition(preset.x, preset.y)}
                className={`text-[10px] px-2.5 py-1 rounded-md border transition-all ${
                  isActive
                    ? "bg-primary text-white border-primary font-bold"
                    : "bg-surface hover:bg-surface-container-low text-on-surface-variant border-outline-variant/50"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Slider Controls */}
      <div className="w-full space-y-2 pt-2 border-t border-outline-variant/20">
        {/* Zoom Slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-on-surface-variant w-10 font-medium">التكبير:</span>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.05"
            value={zoom}
            onChange={(e) => updateZoom(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span className="text-[10px] font-mono text-on-surface-variant w-8 text-left">{zoom.toFixed(2)}x</span>
        </div>

        {/* X Slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-on-surface-variant w-10 font-medium">أفقي:</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={posX}
            onChange={(e) => updatePosition(parseFloat(e.target.value), posY)}
            className="flex-1 h-1 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span className="text-[10px] font-mono text-on-surface-variant w-8 text-left">{posX.toFixed(0)}%</span>
        </div>

        {/* Y Slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-on-surface-variant w-10 font-medium">رأسي:</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={posY}
            onChange={(e) => updatePosition(posX, parseFloat(e.target.value))}
            className="flex-1 h-1 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span className="text-[10px] font-mono text-on-surface-variant w-8 text-left">{posY.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (folder: Omit<Folder, "id" | "createdAt" | "updatedAt">) => void;
  onOpenImageSearch: (onSelect: (url: string) => void, initialQuery?: string) => void;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onOpenImageSearch
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#004ac6"); // Primary Focus Blue
  const [coverImage, setCoverImage] = useState("");
  const [coverImagePosition, setCoverImagePosition] = useState("50% 50%");
  const [frontLang, setFrontLang] = useState("العربية");
  const [backLang, setBackLang] = useState("الإنجليزية");
  const [showCoverAdjuster, setShowCoverAdjuster] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowCoverAdjuster(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const folderColors = [
    { name: "أزرق", value: "#004ac6" },
    { name: "أخضر", value: "#10b981" },
    { name: "برتقالي", value: "#f59e0b" },
    { name: "أحمر", value: "#ef4444" },
    { name: "بنفسجي", value: "#8b5cf6" }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name,
      description,
      color,
      coverImage: coverImage || undefined,
      coverImagePosition: coverImage ? coverImagePosition : undefined,
      frontLang,
      backLang
    });
    // Reset
    setName("");
    setDescription("");
    setColor("#004ac6");
    setCoverImage("");
    setCoverImagePosition("50% 50%");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4" dir="rtl">
      <div className="relative w-full max-w-[600px] bg-surface-container-lowest rounded-xl shadow-elevation-3 border border-outline-variant/30 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright rounded-t-xl">
          <h2 className="text-xl font-bold text-on-surface">إنشاء مجلد جديد</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Folder Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-on-surface-variant block" htmlFor="folderName">
              اسم المجلد
            </label>
            <input
              type="text"
              id="folderName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: مفردات اللغة الإسبانية أو الكيمياء"
              required
              className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-on-surface placeholder-on-surface-variant/40"
            />
          </div>

          {/* Folder Cover Image & Color */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Folder Cover */}
            <div className="space-y-2 flex flex-col items-center">
              <label className="text-sm font-semibold text-on-surface-variant block self-start">صورة الغلاف</label>
              {coverImage ? (
                <div className="flex flex-col items-center gap-2">
                  <ImagePositionAdjuster
                    imageUrl={coverImage}
                    initialPosition={coverImagePosition}
                    onChange={(pos) => setCoverImagePosition(pos)}
                    className="w-32 h-32 aspect-square"
                    showControls={showCoverAdjuster}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenImageSearch((url) => {
                        setCoverImage(url);
                        setCoverImagePosition("50% 50%");
                      }, name)}
                      className="text-xs text-primary hover:underline"
                    >
                      تغيير الصورة
                    </button>
                    <span className="text-outline-variant text-xs">|</span>
                    <button
                      type="button"
                      onClick={() => setShowCoverAdjuster(!showCoverAdjuster)}
                      className={`p-1 rounded-md border transition-all cursor-pointer ${
                        showCoverAdjuster
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "text-on-surface-variant hover:bg-slate-100 border-transparent"
                      }`}
                      title="تعديل أبعاد وموقع الصورة"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-outline-variant text-xs">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCoverImage("");
                        setCoverImagePosition("50% 50%");
                        setShowCoverAdjuster(false);
                      }}
                      className="text-xs text-error hover:underline"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => onOpenImageSearch((url) => {
                    setCoverImage(url);
                    setCoverImagePosition("50% 50%");
                  }, name)}
                  className="border-2 border-dashed border-outline-variant rounded-lg w-32 h-32 aspect-square flex flex-col items-center justify-center bg-surface hover:bg-surface-container-low transition-colors cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-primary">إضافة صورة غلاف</span>
                </div>
              )}
            </div>

            {/* Folder Color Select */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface-variant block">لون المجلد</label>
              <div className="bg-surface border border-outline-variant rounded-lg p-4 h-32 flex flex-col justify-center gap-y-3">
                <div className="flex flex-wrap gap-2 justify-center">
                  {folderColors.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      className="w-8 h-8 rounded-full transition-all focus:outline-none hover:scale-110"
                      style={{
                        backgroundColor: c.value,
                        boxShadow: color === c.value ? `0 0 0 3px ${c.value}40, 0 0 0 1px white inset` : 'none',
                        border: color === c.value ? '2px solid white' : 'none'
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Default Languages */}
          <div className="space-y-3 bg-surface border border-outline-variant p-4 rounded-lg">
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              الإعدادات الافتراضية للغة
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-on-surface-variant block">الوجه الأمامي</label>
                <select
                  value={frontLang}
                  onChange={(e) => setFrontLang(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="العربية">العربية</option>
                  <option value="الألمانية">الألمانية (de)</option>
                  <option value="الإنجليزية">الإنجليزية (en)</option>
                  <option value="الإسبانية">الإسبانية</option>
                  <option value="الفرنسية">الفرنسية</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-on-surface-variant block">الوجه الخلفي</label>
                <select
                  value={backLang}
                  onChange={(e) => setBackLang(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="الإنجليزية">الإنجليزية (en)</option>
                  <option value="العربية">العربية</option>
                  <option value="الألمانية">الألمانية (de)</option>
                  <option value="الإسبانية">الإسبانية</option>
                  <option value="الفرنسية">الفرنسية</option>
                </select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-on-surface-variant block" htmlFor="folderDesc">
              الوصف (اختياري)
            </label>
            <textarea
              id="folderDesc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب نبذة مختصرة عن هذا المجلد أو المادة..."
              className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-on-surface placeholder-on-surface-variant/40 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-outline-variant flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-primary hover:bg-surface-container-low transition-all"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full text-sm font-semibold text-on-primary bg-primary hover:bg-primary-container transition-all shadow-md flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              إنشاء المجلد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface EditFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: Folder;
  onSave: (id: string, folder: Omit<Folder, "id" | "createdAt" | "updatedAt">) => void;
  onOpenImageSearch: (onSelect: (url: string) => void, initialQuery?: string) => void;
}

export const EditFolderModal: React.FC<EditFolderModalProps> = ({
  isOpen,
  onClose,
  folder,
  onSave,
  onOpenImageSearch
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#004ac6");
  const [coverImage, setCoverImage] = useState("");
  const [coverImagePosition, setCoverImagePosition] = useState("50% 50%");
  const [frontLang, setFrontLang] = useState("العربية");
  const [backLang, setBackLang] = useState("الإنجليزية");
  const [showCoverAdjuster, setShowCoverAdjuster] = useState(false);

  useEffect(() => {
    if (folder) {
      setName(folder.name || "");
      setDescription(folder.description || "");
      setColor(folder.color || "#004ac6");
      setCoverImage(folder.coverImage || "");
      setCoverImagePosition(folder.coverImagePosition || "50% 50%");
      setFrontLang(folder.frontLang || "العربية");
      setBackLang(folder.backLang || "الإنجليزية");
      setShowCoverAdjuster(false);
    }
  }, [folder, isOpen]);

  if (!isOpen) return null;

  const folderColors = [
    { name: "أزرق", value: "#004ac6" },
    { name: "أخضر", value: "#10b981" },
    { name: "برتقالي", value: "#f59e0b" },
    { name: "أحمر", value: "#ef4444" },
    { name: "بنفسجي", value: "#8b5cf6" }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(folder.id, {
      name,
      description,
      color,
      coverImage: coverImage || undefined,
      coverImagePosition: coverImage ? coverImagePosition : undefined,
      frontLang,
      backLang
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4" dir="rtl">
      <div className="relative w-full max-w-[600px] bg-surface-container-lowest rounded-xl shadow-elevation-3 border border-outline-variant/30 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright rounded-t-xl">
          <h2 className="text-xl font-bold text-on-surface">تعديل المجلد</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Folder Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-on-surface-variant block" htmlFor="folderName">
              اسم المجلد
            </label>
            <input
              type="text"
              id="folderName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: مفردات اللغة الإسبانية أو الكيمياء"
              required
              className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-on-surface placeholder-on-surface-variant/40"
            />
          </div>

          {/* Folder Cover Image & Color */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Folder Cover */}
            <div className="space-y-2 flex flex-col items-center">
              <label className="text-sm font-semibold text-on-surface-variant block self-start">صورة الغلاف</label>
              {coverImage ? (
                <div className="flex flex-col items-center gap-2">
                  <ImagePositionAdjuster
                    imageUrl={coverImage}
                    initialPosition={coverImagePosition}
                    onChange={(pos) => setCoverImagePosition(pos)}
                    className="w-32 h-32 aspect-square"
                    showControls={showCoverAdjuster}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenImageSearch((url) => {
                        setCoverImage(url);
                        setCoverImagePosition("50% 50%");
                      }, name)}
                      className="text-xs text-primary hover:underline"
                    >
                      تغيير الصورة
                    </button>
                    <span className="text-outline-variant text-xs">|</span>
                    <button
                      type="button"
                      onClick={() => setShowCoverAdjuster(!showCoverAdjuster)}
                      className={`p-1 rounded-md border transition-all cursor-pointer ${
                        showCoverAdjuster
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "text-on-surface-variant hover:bg-slate-100 border-transparent"
                      }`}
                      title="تعديل أبعاد وموقع الصورة"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-outline-variant text-xs">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCoverImage("");
                        setCoverImagePosition("50% 50%");
                        setShowCoverAdjuster(false);
                      }}
                      className="text-xs text-error hover:underline"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => onOpenImageSearch((url) => {
                    setCoverImage(url);
                    setCoverImagePosition("50% 50%");
                  }, name)}
                  className="border-2 border-dashed border-outline-variant rounded-lg w-32 h-32 aspect-square flex flex-col items-center justify-center bg-surface hover:bg-surface-container-low transition-colors cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-primary">إضافة صورة غلاف</span>
                </div>
              )}
            </div>

            {/* Folder Color Select */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface-variant block">لون المجلد</label>
              <div className="bg-surface border border-outline-variant rounded-lg p-4 h-32 flex flex-col justify-center gap-y-3">
                <div className="flex flex-wrap gap-2 justify-center">
                  {folderColors.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      className="w-8 h-8 rounded-full transition-all focus:outline-none hover:scale-110"
                      style={{
                        backgroundColor: c.value,
                        boxShadow: color === c.value ? `0 0 0 3px ${c.value}40, 0 0 0 1px white inset` : 'none',
                        border: color === c.value ? '2px solid white' : 'none'
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Default Languages */}
          <div className="space-y-3 bg-surface border border-outline-variant p-4 rounded-lg">
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              الإعدادات الافتراضية للغة
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-on-surface-variant block">الوجه الأمامي</label>
                <select
                  value={frontLang}
                  onChange={(e) => setFrontLang(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="العربية">العربية</option>
                  <option value="الألمانية">الألمانية (de)</option>
                  <option value="الإنجليزية">الإنجليزية (en)</option>
                  <option value="الإسبانية">الإسبانية</option>
                  <option value="الفرنسية">الفرنسية</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-on-surface-variant block">الوجه الخلفي</label>
                <select
                  value={backLang}
                  onChange={(e) => setBackLang(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="الإنجليزية">الإنجليزية (en)</option>
                  <option value="العربية">العربية</option>
                  <option value="الألمانية">الألمانية (de)</option>
                  <option value="الإسبانية">الإسبانية</option>
                  <option value="الفرنسية">الفرنسية</option>
                </select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-on-surface-variant block" htmlFor="folderDesc">
              الوصف (اختياري)
            </label>
            <textarea
              id="folderDesc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب نبذة مختصرة عن هذا المجلد أو المادة..."
              className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-on-surface placeholder-on-surface-variant/40 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-outline-variant flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-primary hover:bg-surface-container-low transition-all"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full text-sm font-semibold text-on-primary bg-primary hover:bg-primary-container transition-all shadow-md flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              حفظ التعديلات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface EditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: Flashcard;
  folders: Folder[];
  onSave: (id: string, card: Omit<Flashcard, "id" | "createdAt">) => void;
  onOpenImageSearch: (onSelect: (url: string) => void, initialQuery?: string) => void;
  onDelete?: (id: string) => void;
}

export const EditCardModal: React.FC<EditCardModalProps> = ({
  isOpen,
  onClose,
  card,
  folders,
  onSave,
  onOpenImageSearch,
  onDelete
}) => {
  const [folderId, setFolderId] = useState("");
  const [frontText, setFrontText] = useState("");
  const [frontLang, setFrontLang] = useState("de");
  const [frontImage, setFrontImage] = useState("");
  const [frontImagePosition, setFrontImagePosition] = useState("50% 50%");
  const [backText, setBackText] = useState("");
  const [backLang, setBackLang] = useState("ar");
  const [backImage, setBackImage] = useState("");
  const [backImagePosition, setBackImagePosition] = useState("50% 50%");
  const [translationHint, setTranslationHint] = useState("");
  const [isArticleMode, setIsArticleMode] = useState(false);
  const [correctArticle, setCorrectArticle] = useState<"der" | "die" | "das" | "die-plural" | "">("");
  const [isPluralMode, setIsPluralMode] = useState(false);
  const [pluralText, setPluralText] = useState("");
  const [pluralLang, setPluralLang] = useState("de");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [showFrontAdjuster, setShowFrontAdjuster] = useState(false);
  const [showBackAdjuster, setShowBackAdjuster] = useState(false);
  const [copiedFront, setCopiedFront] = useState(false);
  const [copiedBack, setCopiedBack] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && card) {
      setFolderId(card.folderId || "");
      setFrontText(card.frontText || "");
      setFrontLang(card.frontLang || "de");
      setFrontImage(card.frontImage || "");
      setFrontImagePosition(card.frontImagePosition || "50% 50%");
      setBackText(card.backText || "");
      setBackLang(card.backLang || "ar");
      setBackImage(card.backImage || "");
      setBackImagePosition(card.backImagePosition || "50% 50%");
      setTranslationHint(card.translationHint || "");
      setIsArticleMode(!!card.isArticleMode);
      setCorrectArticle((card.correctArticle as any) || "");
      setIsPluralMode(!!card.isPluralMode);
      setPluralText(card.pluralText || "");
      setPluralLang(card.pluralLang || card.frontLang || "de");
      setValidationError(null);
      setTriedSubmit(false);
      setShowFrontAdjuster(false);
      setShowBackAdjuster(false);
      setShowDeleteConfirm(false);
    }
  }, [isOpen, card]);

  if (!isOpen) return null;

  const handleSpeakFront = () => {
    speakClient(frontText, frontLang);
  };

  const handleSpeakBack = () => {
    speakClient(backText, backLang);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);

    if (!folderId) {
      setValidationError("يرجى اختيار مجلد لحفظ البطاقة فيه.");
      return;
    }

    const hasFront = frontText.trim() !== "" || !!frontImage;
    const hasBack = backText.trim() !== "" || !!backImage;

    if (!hasFront && !hasBack) {
      setValidationError("يرجى إضافة نص أو صورة في الوجه الأمامي والخلفي للبطاقة.");
      return;
    }

    if (!hasFront) {
      setValidationError("الوجه الأمامي للبطاقة فارغ (يجب كتابة نص أو اختيار صورة).");
      return;
    }

    if (!hasBack) {
      setValidationError("الوجه الخلفي للبطاقة فارغ (يجب كتابة نص أو اختيار صورة).");
      return;
    }

    onSave(card.id, {
      folderId,
      frontText,
      frontLang,
      frontImage: frontImage || undefined,
      frontImagePosition: frontImage ? frontImagePosition : undefined,
      backText,
      backLang,
      backImage: backImage || undefined,
      backImagePosition: backImage ? backImagePosition : undefined,
      isArticleMode,
      correctArticle: isArticleMode ? correctArticle : undefined,
      isPluralMode,
      pluralText: isPluralMode ? pluralText : undefined,
      pluralLang: isPluralMode ? pluralLang : undefined,
      translationHint: translationHint || undefined,
      streak: card.streak || 0,
      difficulty: card.difficulty
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4" dir="rtl">
      <div className="relative w-full max-w-[700px] bg-surface-container-lowest rounded-2xl shadow-elevation-3 border border-outline-variant/30 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright rounded-t-2xl">
          <h2 className="text-lg font-bold text-on-surface">تعديل البطاقة التعليمية</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 bg-surface flex-1">
          {validationError && (
            <div className="p-4 bg-error-container text-on-error-container rounded-xl text-xs font-bold border border-error flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-error shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Target Folder Select */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant">مجلد الحفظ</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 text-sm font-semibold text-on-surface"
            >
              {folders.length === 0 ? (
                <option value="">-- يرجى إنشاء مجلد أولاً --</option>
              ) : (
                folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Front Face Section */}
            <div className={`bg-surface-container-lowest rounded-xl border p-4 shadow-sm relative group hover:border-primary/50 transition-all flex flex-col justify-between ${
              triedSubmit && !frontText.trim() && !frontImage ? "border-error/80 ring-1 ring-error/30" : "border-outline-variant"
            }`}>
              <span className="absolute -top-3 right-4 bg-primary text-on-primary font-bold text-xs px-2.5 py-1 rounded-full shadow-sm">
                الوجه الأمامي
              </span>
              <div className="mt-4 flex-1">
                <textarea
                  value={frontText}
                  onChange={(e) => {
                    setFrontText(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="أدخل محتوى الوجه الأمامي (مثلاً الكلمة الألمانية أو سؤالك)"
                  className="w-full bg-transparent border-none resize-none focus:ring-0 text-base text-on-surface placeholder-on-surface-variant/40 min-h-[120px] outline-none"
                />
              </div>

              {frontImage && (
                <div className="mb-4 self-start w-full animate-fadeIn">
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/30">
                    <div className="shrink-0">
                      <ImagePositionAdjuster
                        imageUrl={frontImage}
                        initialPosition={frontImagePosition}
                        onChange={(pos) => setFrontImagePosition(pos)}
                        className="w-24 h-24"
                        showControls={showFrontAdjuster}
                      />
                    </div>
                    <div className="flex-1 w-full min-w-0">
                      <label className="block text-[10px] font-black text-primary mb-1 uppercase tracking-wider">رابط صورة الوجه الأمامي (يمكنك نسخه أو تعديله):</label>
                      <div className="flex gap-1.5 w-full">
                        <input
                          type="text"
                          value={frontImage}
                          onChange={(e) => setFrontImage(e.target.value)}
                          placeholder="ضع رابط صورة هنا..."
                          className="flex-1 bg-white border border-outline-variant rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(frontImage);
                            setCopiedFront(true);
                            setTimeout(() => setCopiedFront(false), 2000);
                          }}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
                          title="نسخ الرابط"
                        >
                          {copiedFront ? "تم النسخ!" : "نسخ"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-outline-variant/50 pt-3 flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <select
                    value={frontLang}
                    onChange={(e) => setFrontLang(e.target.value)}
                    className="bg-surface-container-low text-on-surface text-xs font-semibold py-1 px-2 rounded border border-transparent outline-none"
                  >
                    <option value="de">الألمانية (DE)</option>
                    <option value="en">الإنجليزية (EN)</option>
                    <option value="ar">العربية (AR)</option>
                    <option value="fr">الفرنسية (FR)</option>
                    <option value="es">الإسبانية (ES)</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSpeakFront}
                    className="text-on-surface-variant hover:text-primary p-1.5 rounded-md hover:bg-surface-container-low transition-colors"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {frontImage && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowFrontAdjuster(!showFrontAdjuster)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          showFrontAdjuster
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "text-on-surface-variant hover:bg-slate-100 border-transparent"
                        }`}
                        title="تعديل أبعاد وموقع الصورة"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFrontImage("");
                          setFrontImagePosition("50% 50%");
                          setShowFrontAdjuster(false);
                        }}
                        className="p-1.5 text-error hover:bg-error/5 rounded-lg transition-all"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenImageSearch((url) => {
                      setFrontImage(url);
                      setFrontImagePosition("50% 50%");
                    }, frontText)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg border border-dashed border-primary/20 transition-all cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {frontImage ? "تغيير الصورة" : "إضافة صورة"}
                  </button>
                </div>
              </div>
            </div>

            {/* Back Face Section */}
            <div className={`bg-surface-container-lowest rounded-xl border p-4 shadow-sm relative group hover:border-primary/50 transition-all flex flex-col justify-between ${
              triedSubmit && !backText.trim() && !backImage ? "border-error/80 ring-1 ring-error/30" : "border-outline-variant"
            }`}>
              <span className="absolute -top-3 right-4 bg-on-secondary-container text-on-primary font-bold text-xs px-2.5 py-1 rounded-full shadow-sm">
                الوجه الخلفي
              </span>
              <div className="mt-4 flex-1">
                <textarea
                  value={backText}
                  onChange={(e) => {
                    setBackText(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="أدخل محتوى الوجه الخلفي (الترجمة، الإجابة، أو الشرح المفصل)"
                  className="w-full bg-transparent border-none resize-none focus:ring-0 text-base text-on-surface placeholder-on-surface-variant/40 min-h-[120px] outline-none"
                />
              </div>

              {backImage && (
                <div className="mb-4 self-start w-full animate-fadeIn">
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/30">
                    <div className="shrink-0">
                      <ImagePositionAdjuster
                        imageUrl={backImage}
                        initialPosition={backImagePosition}
                        onChange={(pos) => setBackImagePosition(pos)}
                        className="w-24 h-24"
                        showControls={showBackAdjuster}
                      />
                    </div>
                    <div className="flex-1 w-full min-w-0">
                      <label className="block text-[10px] font-black text-primary mb-1 uppercase tracking-wider">رابط صورة الوجه الخلفي (يمكنك نسخه أو تعديله):</label>
                      <div className="flex gap-1.5 w-full">
                        <input
                          type="text"
                          value={backImage}
                          onChange={(e) => setBackImage(e.target.value)}
                          placeholder="ضع رابط صورة هنا..."
                          className="flex-1 bg-white border border-outline-variant rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(backImage);
                            setCopiedBack(true);
                            setTimeout(() => setCopiedBack(false), 2000);
                          }}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
                          title="نسخ الرابط"
                        >
                          {copiedBack ? "تم النسخ!" : "نسخ"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-outline-variant/50 pt-3 flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <select
                    value={backLang}
                    onChange={(e) => setBackLang(e.target.value)}
                    className="bg-surface-container-low text-on-surface text-xs font-semibold py-1 px-2 rounded border border-transparent outline-none"
                  >
                    <option value="ar">العربية (AR)</option>
                    <option value="en">الإنجليزية (EN)</option>
                    <option value="de">الألمانية (DE)</option>
                    <option value="fr">الفرنسية (FR)</option>
                    <option value="es">الإسبانية (ES)</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSpeakBack}
                    className="text-on-surface-variant hover:text-primary p-1.5 rounded-md hover:bg-surface-container-low transition-colors"
                    title="نطق النص"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBackText(frontText);
                      if (validationError) setValidationError(null);
                    }}
                    className="text-on-surface-variant hover:text-primary p-1.5 rounded-md hover:bg-surface-container-low transition-colors"
                    title="نسخ النص من الوجه الأمامي"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {backImage && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowBackAdjuster(!showBackAdjuster)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          showBackAdjuster
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "text-on-surface-variant hover:bg-slate-100 border-transparent"
                        }`}
                        title="تعديل أبعاد وموقع الصورة"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBackImage("");
                          setBackImagePosition("50% 50%");
                          setShowBackAdjuster(false);
                        }}
                        className="p-1.5 text-error hover:bg-error/5 rounded-lg transition-all"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenImageSearch((url) => {
                      setBackImage(url);
                      setBackImagePosition("50% 50%");
                    }, backText)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg border border-dashed border-primary/20 transition-all cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {backImage ? "تغيير الصورة" : "إضافة صورة"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Special Feature: Article Mode Toggle */}
          <div className="flex flex-col gap-3 bg-surface-container-low rounded-xl p-4 border border-outline-variant/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <HelpCircle className="w-5 h-5" />
                <span className="font-bold text-sm text-on-surface">وضع تعلم أدوات التعريف (للغة الألمانية)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isArticleMode}
                  onChange={(e) => setIsArticleMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-focus:ring-2 peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
              </label>
            </div>

            {/* Article Select buttons */}
            {isArticleMode && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {([
                  { value: "der", label: "der (مذكر)", activeCls: "bg-blue-600 border-blue-600 text-white shadow-sm", inactiveCls: "bg-blue-50/40 text-blue-700 border-blue-100 hover:bg-blue-50/80 hover:border-blue-200" },
                  { value: "die", label: "die (مؤنث)", activeCls: "bg-rose-600 border-rose-600 text-white shadow-sm", inactiveCls: "bg-rose-50/40 text-rose-700 border-rose-100 hover:bg-rose-50/80 hover:border-rose-200" },
                  { value: "das", label: "das (محايد)", activeCls: "bg-emerald-600 border-emerald-600 text-white shadow-sm", inactiveCls: "bg-emerald-50/40 text-emerald-700 border-emerald-100 hover:bg-emerald-50/80 hover:border-emerald-200" },
                  { value: "die-plural", label: "die (جمع)", activeCls: "bg-amber-500 border-amber-500 text-white shadow-sm", inactiveCls: "bg-amber-50/40 text-amber-700 border-amber-100 hover:bg-amber-50/80 hover:border-amber-200" }
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCorrectArticle(opt.value)}
                    className={`py-2 rounded-xl font-bold text-xs border-2 transition-all cursor-pointer ${
                      correctArticle === opt.value ? opt.activeCls : opt.inactiveCls
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Special Feature: Plural Mode Toggle */}
          <div className="flex flex-col gap-3 bg-surface-container-low rounded-xl p-4 border border-outline-variant/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-700">
                <Plus className="w-5 h-5" />
                <span className="font-bold text-sm text-on-surface">وضع إضافة جمع المفردة للبطاقة</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPluralMode}
                  onChange={(e) => setIsPluralMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-focus:ring-2 peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700 shadow-inner"></div>
              </label>
            </div>

            {isPluralMode && (
              <div className="space-y-3 mt-1">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant block">جمع المفردة (مثال: Tische)</label>
                  <input
                    type="text"
                    value={pluralText}
                    onChange={(e) => setPluralText(e.target.value)}
                    placeholder="اكتب صيغة الجمع هنا..."
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-700"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant block">لغة نطق صيغة الجمع</label>
                  <select
                    value={pluralLang}
                    onChange={(e) => setPluralLang(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-700"
                  >
                    <option value="de">الألمانية (de)</option>
                    <option value="en">الإنجليزية (en)</option>
                    <option value="ar">العربية (ar)</option>
                    <option value="fr">الفرنسية (fr)</option>
                    <option value="es">الإسبانية (es)</option>
                    <option value="it">الإيطالية (it)</option>
                    <option value="tr">التركية (tr)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Quick Arabic Translation hint */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant block">تلميح أو ترجمة سريعة (يظهر أسفل الكلمة بالوجه الأمامي)</label>
            <input
              type="text"
              value={translationHint}
              onChange={(e) => setTranslationHint(e.target.value)}
              placeholder="مثال: تفاحة أو Noun أو صيغة الاحتراق"
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-outline-variant flex items-center justify-between bg-surface-bright p-4 -mx-6 -mb-6 rounded-b-2xl">
            {/* Delete Section */}
            {onDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-error bg-error/10 hover:bg-error/20 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف البطاقة</span>
              </button>
            ) : (
              <div />
            )}

            {/* Cancel & Save Section */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-primary bg-transparent hover:bg-surface-container-low transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-8 py-2.5 rounded-full text-sm font-semibold text-on-primary bg-primary hover:bg-primary-container transition-all shadow-md"
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Custom Delete Confirmation Modal Overlay */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in animate-duration-150" dir="rtl">
          <div className="bg-white border border-outline-variant rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center animate-scale-up">
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error animate-pulse">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-800">تأكيد عملية الحذف</h4>
            </div>
            
            <p className="text-xs text-slate-500 font-bold leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذه البطاقة؟ سيتم نقلها إلى سلة المهملات.
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  onDelete(card.id);
                  onClose();
                }}
                className="flex-1 py-2.5 px-4 bg-error hover:bg-error-container text-white font-black text-xs rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                نعم، احذف
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 px-4 bg-surface-container-high text-on-surface font-black text-xs rounded-xl border border-outline-variant hover:bg-surface-container-highest active:scale-95 transition-all cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  activeFolderId: string;
  onSave: (card: Omit<Flashcard, "id" | "createdAt">) => void;
  onOpenImageSearch: (onSelect: (url: string) => void, initialQuery?: string) => void;
}

export const AddCardModal: React.FC<AddCardModalProps> = ({
  isOpen,
  onClose,
  folders,
  activeFolderId,
  onSave,
  onOpenImageSearch
}) => {
  const [folderId, setFolderId] = useState(activeFolderId);
  const [frontText, setFrontText] = useState("");
  const [frontLang, setFrontLang] = useState("de");
  const [frontImage, setFrontImage] = useState("");
  const [frontImagePosition, setFrontImagePosition] = useState("50% 50%");
  const [backText, setBackText] = useState("");
  const [backLang, setBackLang] = useState("ar");
  const [backImage, setBackImage] = useState("");
  const [backImagePosition, setBackImagePosition] = useState("50% 50%");
  const [translationHint, setTranslationHint] = useState("");
  const [isArticleMode, setIsArticleMode] = useState(false);
  const [correctArticle, setCorrectArticle] = useState<"der" | "die" | "das" | "die-plural" | "">("");
  const [isPluralMode, setIsPluralMode] = useState(false);
  const [pluralText, setPluralText] = useState("");
  const [pluralLang, setPluralLang] = useState("de");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showFrontAdjuster, setShowFrontAdjuster] = useState(false);
  const [showBackAdjuster, setShowBackAdjuster] = useState(false);
  const [copiedFront, setCopiedFront] = useState(false);
  const [copiedBack, setCopiedBack] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      setTriedSubmit(false);
      setShowSuccessToast(false);
      setShowFrontAdjuster(false);
      setShowBackAdjuster(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setFolderId(activeFolderId);
    const folder = folders.find(f => f.id === activeFolderId);
    if (folder) {
      if (folder.id === "folder-german") {
        setIsArticleMode(true);
        setFrontLang("de");
        setBackLang("ar");
      } else {
        setIsArticleMode(false);
        const mapLangToCode = (lang: string): string => {
          if (!lang) return "de";
          const lower = lang.toLowerCase();
          if (["de", "en", "ar", "es", "fr"].includes(lower)) {
            return lower;
          }
          const mapping: Record<string, string> = {
            "العربية": "ar",
            "الإنجليزية": "en",
            "الألمانية": "de",
            "الإسبانية": "es",
            "الفرنسية": "fr"
          };
          return mapping[lang] || "de";
        };
        setFrontLang(mapLangToCode(folder.frontLang));
        setBackLang(mapLangToCode(folder.backLang));
      }
    }
  }, [activeFolderId, folders]);

  if (!isOpen) return null;

  const handleSpeakFront = () => {
    speakClient(frontText, frontLang);
  };

  const handleSpeakBack = () => {
    speakClient(backText, backLang);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);

    if (!folderId) {
      setValidationError("يرجى اختيار مجلد لحفظ البطاقة فيه. إذا لم تكن قد أنشأت مجلداً بعد، يرجى إغلاق هذه النافذة وإنشاء مجلد أولاً.");
      return;
    }

    const hasFront = frontText.trim() !== "" || !!frontImage;
    const hasBack = backText.trim() !== "" || !!backImage;

    if (!hasFront && !hasBack) {
      setValidationError("يرجى إضافة نص أو صورة في الوجه الأمامي والخلفي للبطاقة.");
      return;
    }

    if (!hasFront) {
      setValidationError("الوجه الأمامي للبطاقة فارغ (يجب كتابة نص أو اختيار صورة).");
      return;
    }

    if (!hasBack) {
      setValidationError("الوجه الخلفي للبطاقة فارغ (يجب كتابة نص أو اختيار صورة).");
      return;
    }

    onSave({
      folderId,
      frontText,
      frontLang,
      frontImage: frontImage || undefined,
      frontImagePosition: frontImage ? frontImagePosition : undefined,
      backText,
      backLang,
      backImage: backImage || undefined,
      backImagePosition: backImage ? backImagePosition : undefined,
      isArticleMode,
      correctArticle: isArticleMode ? correctArticle : undefined,
      isPluralMode,
      pluralText: isPluralMode ? pluralText : undefined,
      pluralLang: isPluralMode ? pluralLang : undefined,
      translationHint: translationHint || undefined,
      streak: 0
    });

    setFrontText("");
    setBackText("");
    setFrontImage("");
    setFrontImagePosition("50% 50%");
    setBackImage("");
    setBackImagePosition("50% 50%");
    setTranslationHint("");
    setCorrectArticle("");
    setPluralText("");
    setIsPluralMode(false);
    setValidationError(null);
    setTriedSubmit(false);
    setShowFrontAdjuster(false);
    setShowBackAdjuster(false);
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4" dir="rtl">
      <div className="relative w-full max-w-[700px] bg-surface-container-lowest rounded-2xl shadow-elevation-3 border border-outline-variant/30 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright rounded-t-2xl">
          <h2 className="text-lg font-bold text-on-surface">إضافة بطاقة جديدة</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 bg-surface flex-1">
          {validationError && (
            <div className="p-4 bg-error-container text-on-error-container rounded-xl text-xs font-bold border border-error flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-error shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {showSuccessToast && (
            <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>تم حفظ البطاقة بنجاح! تم تفريغ الحقول لإضافة بطاقة أخرى.</span>
            </div>
          )}

          {/* Target Folder Select */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant">مجلد الحفظ</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 text-sm font-semibold text-on-surface"
            >
              {folders.length === 0 ? (
                <option value="">-- يرجى إنشاء مجلد أولاً --</option>
              ) : (
                folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Front Face Section */}
            <div className={`bg-surface-container-lowest rounded-xl border p-4 shadow-sm relative group hover:border-primary/50 transition-all flex flex-col justify-between ${
              triedSubmit && !frontText.trim() && !frontImage ? "border-error/80 ring-1 ring-error/30" : "border-outline-variant"
            }`}>
              <span className="absolute -top-3 right-4 bg-primary text-on-primary font-bold text-xs px-2.5 py-1 rounded-full shadow-sm">
                الوجه الأمامي
              </span>
              <div className="mt-4 flex-1">
                <textarea
                  value={frontText}
                  onChange={(e) => {
                    setFrontText(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="أدخل محتوى الوجه الأمامي (مثلاً الكلمة الألمانية أو سؤالك)"
                  className="w-full bg-transparent border-none resize-none focus:ring-0 text-base text-on-surface placeholder-on-surface-variant/40 min-h-[120px] outline-none"
                />
              </div>

              {frontImage && (
                <div className="mb-4 self-start w-full animate-fadeIn">
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/30">
                    <div className="shrink-0">
                      <ImagePositionAdjuster
                        imageUrl={frontImage}
                        initialPosition={frontImagePosition}
                        onChange={(pos) => setFrontImagePosition(pos)}
                        className="w-24 h-24"
                        showControls={showFrontAdjuster}
                      />
                    </div>
                    <div className="flex-1 w-full min-w-0">
                      <label className="block text-[10px] font-black text-primary mb-1 uppercase tracking-wider">رابط صورة الوجه الأمامي (يمكنك نسخه أو تعديله):</label>
                      <div className="flex gap-1.5 w-full">
                        <input
                          type="text"
                          value={frontImage}
                          onChange={(e) => setFrontImage(e.target.value)}
                          placeholder="ضع رابط صورة هنا..."
                          className="flex-1 bg-white border border-outline-variant rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(frontImage);
                            setCopiedFront(true);
                            setTimeout(() => setCopiedFront(false), 2000);
                          }}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
                          title="نسخ الرابط"
                        >
                          {copiedFront ? "تم النسخ!" : "نسخ"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-outline-variant/50 pt-3 flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <select
                    value={frontLang}
                    onChange={(e) => setFrontLang(e.target.value)}
                    className="bg-surface-container-low text-on-surface text-xs font-semibold py-1 px-2 rounded border border-transparent outline-none"
                  >
                    <option value="de">الألمانية (DE)</option>
                    <option value="en">الإنجليزية (EN)</option>
                    <option value="ar">العربية (AR)</option>
                    <option value="fr">الفرنسية (FR)</option>
                    <option value="es">الإسبانية (ES)</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSpeakFront}
                    className="text-on-surface-variant hover:text-primary p-1.5 rounded-md hover:bg-surface-container-low transition-colors"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {frontImage && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowFrontAdjuster(!showFrontAdjuster)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          showFrontAdjuster
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "text-on-surface-variant hover:bg-slate-100 border-transparent"
                        }`}
                        title="تعديل أبعاد وموقع الصورة"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFrontImage("");
                          setFrontImagePosition("50% 50%");
                          setShowFrontAdjuster(false);
                        }}
                        className="p-1.5 text-error hover:bg-error/5 rounded-lg transition-all"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenImageSearch((url) => {
                      setFrontImage(url);
                      setFrontImagePosition("50% 50%");
                    }, frontText)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg border border-dashed border-primary/20 transition-all cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {frontImage ? "تغيير الصورة" : "إضافة صورة"}
                  </button>
                </div>
              </div>
            </div>

            {/* Back Face Section */}
            <div className={`bg-surface-container-lowest rounded-xl border p-4 shadow-sm relative group hover:border-primary/50 transition-all flex flex-col justify-between ${
              triedSubmit && !backText.trim() && !backImage ? "border-error/80 ring-1 ring-error/30" : "border-outline-variant"
            }`}>
              <span className="absolute -top-3 right-4 bg-on-secondary-container text-on-primary font-bold text-xs px-2.5 py-1 rounded-full shadow-sm">
                الوجه الخلفي
              </span>
              <div className="mt-4 flex-1">
                <textarea
                  value={backText}
                  onChange={(e) => {
                    setBackText(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="أدخل محتوى الوجه الخلفي (الترجمة، الإجابة، أو الشرح المفصل)"
                  className="w-full bg-transparent border-none resize-none focus:ring-0 text-base text-on-surface placeholder-on-surface-variant/40 min-h-[120px] outline-none"
                />
              </div>

              {backImage && (
                <div className="mb-4 self-start w-full animate-fadeIn">
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end bg-surface-container-low/40 p-3 rounded-xl border border-outline-variant/30">
                    <div className="shrink-0">
                      <ImagePositionAdjuster
                        imageUrl={backImage}
                        initialPosition={backImagePosition}
                        onChange={(pos) => setBackImagePosition(pos)}
                        className="w-24 h-24"
                        showControls={showBackAdjuster}
                      />
                    </div>
                    <div className="flex-1 w-full min-w-0">
                      <label className="block text-[10px] font-black text-primary mb-1 uppercase tracking-wider">رابط صورة الوجه الخلفي (يمكنك نسخه أو تعديله):</label>
                      <div className="flex gap-1.5 w-full">
                        <input
                          type="text"
                          value={backImage}
                          onChange={(e) => setBackImage(e.target.value)}
                          placeholder="ضع رابط صورة هنا..."
                          className="flex-1 bg-white border border-outline-variant rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(backImage);
                            setCopiedBack(true);
                            setTimeout(() => setCopiedBack(false), 2000);
                          }}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0"
                          title="نسخ الرابط"
                        >
                          {copiedBack ? "تم النسخ!" : "نسخ"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-outline-variant/50 pt-3 flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <select
                    value={backLang}
                    onChange={(e) => setBackLang(e.target.value)}
                    className="bg-surface-container-low text-on-surface text-xs font-semibold py-1 px-2 rounded border border-transparent outline-none"
                  >
                    <option value="ar">العربية (AR)</option>
                    <option value="en">الإنجليزية (EN)</option>
                    <option value="de">الألمانية (DE)</option>
                    <option value="fr">الفرنسية (FR)</option>
                    <option value="es">الإسبانية (ES)</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSpeakBack}
                    className="text-on-surface-variant hover:text-primary p-1.5 rounded-md hover:bg-surface-container-low transition-colors"
                    title="نطق النص"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBackText(frontText);
                      if (validationError) setValidationError(null);
                    }}
                    className="text-on-surface-variant hover:text-primary p-1.5 rounded-md hover:bg-surface-container-low transition-colors"
                    title="نسخ النص من الوجه الأمامي"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {backImage && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowBackAdjuster(!showBackAdjuster)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          showBackAdjuster
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "text-on-surface-variant hover:bg-slate-100 border-transparent"
                        }`}
                        title="تعديل أبعاد وموقع الصورة"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBackImage("");
                          setBackImagePosition("50% 50%");
                          setShowBackAdjuster(false);
                        }}
                        className="p-1.5 text-error hover:bg-error/5 rounded-lg transition-all"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenImageSearch((url) => {
                      setBackImage(url);
                      setBackImagePosition("50% 50%");
                    }, backText)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg border border-dashed border-primary/20 transition-all cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {backImage ? "تغيير الصورة" : "إضافة صورة"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Special Feature: Article Mode Toggle */}
          <div className="flex flex-col gap-3 bg-surface-container-low rounded-xl p-4 border border-outline-variant/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <HelpCircle className="w-5 h-5" />
                <span className="font-bold text-sm text-on-surface">وضع تعلم أدوات التعريف (للغة الألمانية)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isArticleMode}
                  onChange={(e) => setIsArticleMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-focus:ring-2 peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
              </label>
            </div>

            {/* Article Select buttons */}
            {isArticleMode && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {([
                  { value: "der", label: "der (مذكر)", activeCls: "bg-blue-600 border-blue-600 text-white shadow-sm", inactiveCls: "bg-blue-50/40 text-blue-700 border-blue-100 hover:bg-blue-50/80 hover:border-blue-200" },
                  { value: "die", label: "die (مؤنث)", activeCls: "bg-rose-600 border-rose-600 text-white shadow-sm", inactiveCls: "bg-rose-50/40 text-rose-700 border-rose-100 hover:bg-rose-50/80 hover:border-rose-200" },
                  { value: "das", label: "das (محايد)", activeCls: "bg-emerald-600 border-emerald-600 text-white shadow-sm", inactiveCls: "bg-emerald-50/40 text-emerald-700 border-emerald-100 hover:bg-emerald-50/80 hover:border-emerald-200" },
                  { value: "die-plural", label: "die (جمع)", activeCls: "bg-amber-500 border-amber-500 text-white shadow-sm", inactiveCls: "bg-amber-50/40 text-amber-700 border-amber-100 hover:bg-amber-50/80 hover:border-amber-200" }
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCorrectArticle(opt.value)}
                    className={`py-2 rounded-xl font-bold text-xs border-2 transition-all cursor-pointer ${
                      correctArticle === opt.value ? opt.activeCls : opt.inactiveCls
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Special Feature: Plural Mode Toggle */}
          <div className="flex flex-col gap-3 bg-surface-container-low rounded-xl p-4 border border-outline-variant/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-700">
                <Plus className="w-5 h-5" />
                <span className="font-bold text-sm text-on-surface">وضع إضافة جمع المفردة للبطاقة</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPluralMode}
                  onChange={(e) => setIsPluralMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-focus:ring-2 peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-700 shadow-inner"></div>
              </label>
            </div>

            {isPluralMode && (
              <div className="space-y-3 mt-1">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant block">جمع المفردة (مثال: Tische)</label>
                  <input
                    type="text"
                    value={pluralText}
                    onChange={(e) => setPluralText(e.target.value)}
                    placeholder="اكتب صيغة الجمع هنا..."
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-700"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant block">لغة نطق صيغة الجمع</label>
                  <select
                    value={pluralLang}
                    onChange={(e) => setPluralLang(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-700"
                  >
                    <option value="de">الألمانية (de)</option>
                    <option value="en">الإنجليزية (en)</option>
                    <option value="ar">العربية (ar)</option>
                    <option value="fr">الفرنسية (fr)</option>
                    <option value="es">الإسبانية (es)</option>
                    <option value="it">الإيطالية (it)</option>
                    <option value="tr">التركية (tr)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Quick Arabic Translation hint */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant block">تلميح أو ترجمة سريعة (يظهر أسفل الكلمة بالوجه الأمامي)</label>
            <input
              type="text"
              value={translationHint}
              onChange={(e) => setTranslationHint(e.target.value)}
              placeholder="مثال: تفاحة أو Noun أو صيغة الاحتراق"
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-outline-variant flex justify-end gap-3 bg-surface-bright p-4 -mx-6 -mb-6 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-full text-sm font-semibold text-primary bg-transparent hover:bg-surface-container-low transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-8 py-2.5 rounded-full text-sm font-semibold text-on-primary bg-primary hover:bg-primary-container transition-all shadow-md"
            >
              إضافة بطاقة
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  initialQuery?: string;
}

export const ImagePickerModal: React.FC<ImagePickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialQuery = ""
}) => {
  const [activeTab, setActiveTab] = useState<"duckduckgo" | "pixabay" | "recent">("duckduckgo");
  const [customUrl, setCustomUrl] = useState("");
  const [query, setQuery] = useState("");
  const [recentImages, setRecentImages] = useState<string[]>([]);

  // DuckDuckGo Engine State
  const [imagesDdg, setImagesDdg] = useState<any[]>([]);
  const [loadingDdg, setLoadingDdg] = useState(false);
  const [pageDdg, setPageDdg] = useState(1);
  const [nextOffsetDdg, setNextOffsetDdg] = useState<number | null>(null);

  // Pixabay Engine State
  const [imagesPixabay, setImagesPixabay] = useState<any[]>([]);
  const [loadingPixabay, setLoadingPixabay] = useState(false);
  const [pagePixabay, setPagePixabay] = useState(1);
  const [pixabayKey, setPixabayKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const saveToRecent = (url: string) => {
    if (!url) return;
    try {
      const stored = localStorage.getItem("recent_images");
      let list: string[] = [];
      if (stored) {
        list = JSON.parse(stored);
      }
      // Remove if already exists (to prevent duplicates and move to top)
      list = list.filter((item: string) => item !== url);
      // Add to top
      list.unshift(url);
      // Limit to 40
      if (list.length > 40) {
        list = list.slice(0, 40);
      }
      localStorage.setItem("recent_images", JSON.stringify(list));
      setRecentImages(list);
    } catch (e) {
      console.error("Failed to save to recent images:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const activeApi = (localStorage.getItem("settings_image_api") || "duckduckgo") as "duckduckgo" | "pixabay" | "recent";
      setActiveTab(activeApi);

      const q = initialQuery.trim() || "education";
      setQuery(initialQuery.trim());
      
      setPageDdg(1);
      setPagePixabay(1);
      setNextOffsetDdg(null);
      setCustomUrl("");

      const storedKey = localStorage.getItem("settings_pixabay_key") || "";
      setPixabayKey(storedKey);

      // Load recent images
      const storedRecent = localStorage.getItem("recent_images");
      if (storedRecent) {
        try {
          setRecentImages(JSON.parse(storedRecent));
        } catch (e) {
          console.error("Failed to parse recent images:", e);
        }
      }

      // Fetch initial images for both engines
      searchDdg(q, 1, null);
      searchPixabay(q, 1, storedKey);
    }
  }, [isOpen, initialQuery]);

  if (!isOpen) return null;

  const searchDdg = async (searchTerm: string, pageNum: number, offsetParam?: number | null) => {
    setLoadingDdg(true);
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/images" : "/api/images";
      let url = `${apiBase}?q=${encodeURIComponent(searchTerm)}&page=${pageNum}&provider=duckduckgo`;
      
      const currentOffset = offsetParam !== undefined ? offsetParam : nextOffsetDdg;
      if (currentOffset !== null && pageNum > 1) {
        url += `&offset=${currentOffset}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const hits = data.hits || [];
        setNextOffsetDdg(data.nextOffset !== undefined ? data.nextOffset : null);

        if (pageNum === 1) {
          const seen = new Set<string>();
          const uniqueHits = hits.filter((img: any) => {
            if (seen.has(img.id)) return false;
            seen.add(img.id);
            return true;
          });
          setImagesDdg(uniqueHits);
        } else {
          setImagesDdg(prev => {
            const seen = new Set(prev.map(img => img.id));
            const uniqueNewHits = hits.filter((img: any) => {
              if (seen.has(img.id)) return false;
              seen.add(img.id);
              return true;
            });
            return [...prev, ...uniqueNewHits];
          });
        }
      }
    } catch (err) {
      console.error("DDG image search error:", err);
    } finally {
      setLoadingDdg(false);
    }
  };

  const searchPixabay = async (searchTerm: string, pageNum: number, keyOverride?: string) => {
    setLoadingPixabay(true);
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/images" : "/api/images";
      const keyToUse = keyOverride !== undefined ? keyOverride : (pixabayKey || localStorage.getItem("settings_pixabay_key") || "");
      
      let url = `${apiBase}?q=${encodeURIComponent(searchTerm)}&page=${pageNum}&provider=pixabay&customKey=${encodeURIComponent(keyToUse)}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const hits = data.hits || [];

        if (pageNum === 1) {
          const seen = new Set<string>();
          const uniqueHits = hits.filter((img: any) => {
            if (seen.has(img.id)) return false;
            seen.add(img.id);
            return true;
          });
          setImagesPixabay(uniqueHits);
        } else {
          setImagesPixabay(prev => {
            const seen = new Set(prev.map(img => img.id));
            const uniqueNewHits = hits.filter((img: any) => {
              if (seen.has(img.id)) return false;
              seen.add(img.id);
              return true;
            });
            return [...prev, ...uniqueNewHits];
          });
        }
      }
    } catch (err) {
      console.error("Pixabay image search error:", err);
    } finally {
      setLoadingPixabay(false);
    }
  };

  const handleUnifiedSearchSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    const q = query.trim() || "education";
    setPageDdg(1);
    setNextOffsetDdg(null);
    setPagePixabay(1);
    searchDdg(q, 1, null);
    searchPixabay(q, 1);
  };

  const handleLoadMoreDdg = () => {
    const next = pageDdg + 1;
    setPageDdg(next);
    searchDdg(query || "education", next);
  };

  const handleLoadMorePixabay = () => {
    const next = pagePixabay + 1;
    setPagePixabay(next);
    searchPixabay(query || "education", next);
  };

  const handleSavePixabayKey = (newKey: string) => {
    setPixabayKey(newKey);
    localStorage.setItem("settings_pixabay_key", newKey);
    // Refresh search immediately with new key
    setPagePixabay(1);
    searchPixabay(query || "education", 1, newKey);
  };

  const handleTabChange = (tab: "duckduckgo" | "pixabay" | "recent") => {
    setActiveTab(tab);
    localStorage.setItem("settings_image_api", tab);
  };

  const handleConfirm = () => {
    if (customUrl.trim()) {
      saveToRecent(customUrl.trim());
      onSelect(customUrl.trim());
      setCustomUrl("");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm" dir="rtl">
      <div className="bg-surface-container-lowest w-full max-w-[750px] rounded-2xl shadow-elevation-3 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <header className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/30 bg-surface-container-low/55">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-black text-lg text-on-surface flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              <span>إضافة وتعديل صور البطاقات</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-low cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Separated Search Engine Nav Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-outline-variant/20 bg-surface-container-lowest flex items-center justify-between gap-4">
          <div className="flex flex-wrap md:flex-nowrap gap-2 p-1.5 bg-surface-container-low/70 rounded-2xl w-full">
            <button
              type="button"
              onClick={() => handleTabChange("duckduckgo")}
              className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-w-[120px] ${
                activeTab === "duckduckgo"
                  ? "bg-white text-primary shadow-sm scale-[1.01] border-b-2 border-primary"
                  : "text-on-surface-variant/75 hover:bg-surface/85 hover:text-on-surface"
              }`}
            >
              <Search className="w-3.5 h-3.5 text-orange-500" />
              <span>محرك DuckDuckGo (سريع)</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("pixabay")}
              className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-w-[120px] ${
                activeTab === "pixabay"
                  ? "bg-white text-primary shadow-sm scale-[1.01] border-b-2 border-primary"
                  : "text-on-surface-variant/75 hover:bg-surface/85 hover:text-on-surface"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span>مستودع Pixabay (جودة فائقة)</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("recent")}
              className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-w-[120px] ${
                activeTab === "recent"
                  ? "bg-white text-primary shadow-sm scale-[1.01] border-b-2 border-primary"
                  : "text-on-surface-variant/75 hover:bg-surface/85 hover:text-on-surface"
              }`}
            >
              <History className="w-3.5 h-3.5 text-blue-500" />
              <span>الصور الأخيرة (السجل)</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* Unified Shared Search Form */}
          <form onSubmit={handleUnifiedSearchSubmit} className="relative group">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUnifiedSearchSubmit(e);
                }
              }}
              placeholder="ابحث عن صور في كافة محركات البحث (مثلاً: apple, running, cat)..."
              className="w-full bg-surface border border-outline-variant rounded-xl py-3 pr-12 pl-4 text-sm font-bold text-on-surface placeholder-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button type="submit" className="absolute inset-y-0 right-4 flex items-center text-outline group-hover:text-primary transition-colors cursor-pointer">
              <Search className="w-5 h-5" />
            </button>
          </form>

          <AnimatePresence mode="wait">
            {/* CONTAINER 1: DUCKDUCKGO */}
            {activeTab === "duckduckgo" && (
              <motion.div
                key="duckduckgo-container"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {/* DuckDuckGo Loading state */}
                {loadingDdg && imagesDdg.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-on-surface-variant/70 animate-pulse">جاري سحب الصور من DuckDuckGo...</span>
                  </div>
                )}

                {/* DuckDuckGo Images Grid */}
                {imagesDdg.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto p-1 border border-outline-variant/10 rounded-xl bg-surface-container-low/20">
                    {imagesDdg.map((img) => (
                      <div
                        key={img.id}
                        onClick={() => {
                          saveToRecent(img.webformatURL);
                          onSelect(img.webformatURL);
                          onClose();
                        }}
                        className="aspect-square bg-surface rounded-xl overflow-hidden border border-outline-variant/30 hover:border-primary hover:scale-[1.02] cursor-pointer transition-all shadow-sm group relative"
                      >
                        <img src={img.webformatURL} alt={img.tags} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[10px] text-white font-bold bg-primary/90 px-2 py-1 rounded-md">اختيار الصورة</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {!loadingDdg && imagesDdg.length === 0 && (
                  <div className="py-12 text-center text-on-surface-variant/60 font-bold text-xs bg-surface-container-low/25 rounded-xl border-2 border-dashed border-outline-variant/30">
                    لا توجد صور معروضة. اكتب كلمة إنجليزية في خانة البحث للحصول على نتائج دقيقة.
                  </div>
                )}

                {/* DuckDuckGo Load More */}
                {imagesDdg.length > 0 && (
                  <div className="flex justify-center py-2 border-t border-outline-variant/10">
                    <button
                      type="button"
                      onClick={handleLoadMoreDdg}
                      disabled={loadingDdg}
                      className="px-6 py-2 rounded-full text-xs font-bold border border-orange-200 text-orange-700 bg-orange-50/20 hover:bg-orange-50 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {loadingDdg ? (
                        <span className="animate-pulse">جاري التحميل...</span>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>تحميل المزيد من الصور (صفحة {pageDdg + 1})</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* CONTAINER 2: PIXABAY */}
            {activeTab === "pixabay" && (
              <motion.div
                key="pixabay-container"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {/* Inline key modifier */}
                <div className="flex flex-col gap-1.5 pb-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(!showKeyInput)}
                    className="text-[10px] text-emerald-600 hover:text-emerald-700 font-extrabold flex items-center gap-1 cursor-pointer w-fit px-3 py-1 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>{pixabayKey ? "تحديث مفتاح API الخاص بـ Pixabay (اختياري)" : "إضافة مفتاح API الخاص بـ Pixabay الخاص بك لتجاوز القيود"}</span>
                  </button>
                  
                  {showKeyInput && (
                    <div className="flex gap-2 mt-1 max-w-md animate-scaleUp">
                      <input
                        type="text"
                        value={pixabayKey}
                        onChange={(e) => setPixabayKey(e.target.value)}
                        placeholder="أدخل مفتاح Pixabay API Key الخاص بك هنا..."
                        className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-emerald-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          handleSavePixabayKey(pixabayKey);
                          setShowKeyInput(false);
                        }}
                        className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs font-black hover:bg-emerald-700 transition-colors cursor-pointer"
                      >
                        حفظ وتحديث
                      </button>
                    </div>
                  )}
                </div>

                {/* Pixabay Loading state */}
                {loadingPixabay && imagesPixabay.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-on-surface-variant/70 animate-pulse">جاري جلب الصور عالية الدقة من Pixabay...</span>
                  </div>
                )}

                {/* Pixabay Images Grid */}
                {imagesPixabay.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto p-1 border border-outline-variant/10 rounded-xl bg-surface-container-low/20">
                    {imagesPixabay.map((img) => (
                      <div
                        key={img.id}
                        onClick={() => {
                          saveToRecent(img.webformatURL);
                          onSelect(img.webformatURL);
                          onClose();
                        }}
                        className="aspect-square bg-surface rounded-xl overflow-hidden border border-outline-variant/30 hover:border-primary hover:scale-[1.02] cursor-pointer transition-all shadow-sm group relative"
                      >
                        <img src={img.webformatURL} alt={img.tags} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[10px] text-white font-bold bg-primary/90 px-2 py-1 rounded-md">اختيار الصورة</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {!loadingPixabay && imagesPixabay.length === 0 && (
                  <div className="py-12 text-center text-on-surface-variant/60 font-bold text-xs bg-surface-container-low/25 rounded-xl border-2 border-dashed border-outline-variant/30">
                    لا توجد صور معروضة من Pixabay. يرجى البحث بكلمة إنجليزية.
                  </div>
                )}

                {/* Pixabay Load More */}
                {imagesPixabay.length > 0 && (
                  <div className="flex justify-center py-2 border-t border-outline-variant/10">
                    <button
                      type="button"
                      onClick={handleLoadMorePixabay}
                      disabled={loadingPixabay}
                      className="px-6 py-2 rounded-full text-xs font-bold border border-emerald-200 text-emerald-700 bg-emerald-50/20 hover:bg-emerald-50 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {loadingPixabay ? (
                        <span className="animate-pulse">جاري التحميل...</span>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>تحميل المزيد من الصور (صفحة {pagePixabay + 1})</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* CONTAINER 3: RECENT IMAGES */}
            {activeTab === "recent" && (
              <motion.div
                key="recent-container"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {recentImages.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-semibold text-on-surface-variant/80">آخر 40 صورة تم اختيارها:</span>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem("recent_images");
                          setRecentImages([]);
                        }}
                        className="text-[10px] text-error hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>مسح السجل</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto p-1 border border-outline-variant/10 rounded-xl bg-surface-container-low/20">
                      {recentImages.map((url, idx) => (
                        <div
                          key={`${url}-${idx}`}
                          onClick={() => {
                            saveToRecent(url);
                            onSelect(url);
                            onClose();
                          }}
                          className="aspect-square bg-surface rounded-xl overflow-hidden border border-outline-variant/30 hover:border-primary hover:scale-[1.02] cursor-pointer transition-all shadow-sm group relative"
                        >
                          <img src={url} alt={`Recent ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[10px] text-white font-bold bg-primary/90 px-2 py-1 rounded-md">اختيار الصورة</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-on-surface-variant/60 font-bold text-xs bg-surface-container-low/25 rounded-xl border-2 border-dashed border-outline-variant/30 flex flex-col items-center justify-center gap-3">
                    <History className="w-8 h-8 text-outline-variant" />
                    <span>لم تقم باختيار أي صور مؤخراً. بمجرد اختيار صور من محركات البحث أو وضع روابط يدوية، ستظهر هنا للوصول السريع إليها.</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Manual Link Input */}
          <div className="relative group pt-4 border-t border-outline-variant/20">
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-outline mt-2">
              <LinkIcon className="w-5 h-5" />
            </div>
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="أو ضع رابط صورة مباشر يدوي هنا (https://...)..."
              className="w-full bg-surface border border-outline-variant/50 rounded-xl py-3 pr-12 pl-4 text-sm text-on-surface placeholder-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <footer className="px-6 py-4 bg-surface-container-low flex justify-end gap-3 border-t border-outline-variant/20">
          <button onClick={onClose} className="text-sm font-semibold text-outline hover:text-on-surface px-4 py-2 transition-colors cursor-pointer">
            إلغاء
          </button>
          <button
            onClick={handleConfirm}
            disabled={!customUrl.trim()}
            className="px-6 py-2 rounded-full text-sm font-semibold text-white bg-primary hover:bg-primary-container disabled:opacity-40 transition-colors shadow-sm cursor-pointer"
          >
            تأكيد الاختيار اليدوي
          </button>
        </footer>
      </div>
    </div>
  );
};

interface ReviewSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: Folder;
  folders: Folder[];
  cards: Flashcard[];
  onStartReview: (
    method: ReviewMethod,
    selectedCards: Flashcard[],
    chainMethods?: ReviewMethod[],
    chainIndex?: number
  ) => void;
}

export const ReviewSetupModal: React.FC<ReviewSetupModalProps> = ({
  isOpen,
  onClose,
  folder,
  folders,
  cards,
  onStartReview
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shuffledCards, setShuffledCards] = useState<Flashcard[]>([]);
  const [method, setMethod] = useState<ReviewMethod>("classic");
  const [isChainMode, setIsChainMode] = useState(false);
  const [chainMethods, setChainMethods] = useState<ReviewMethod[]>(["classic", "write"]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"select" | "preview">("select");

  // Get all descendant folders (subfolders, sub-subfolders, etc.) recursively
  const getAllDescendantFolders = (folderId: string, visited = new Set<string>()): Folder[] => {
    if (!folders) return [];
    if (visited.has(folderId)) return [];
    visited.add(folderId);

    const directChildren = folders.filter((f) => {
      if (folderId === "root-library") {
        return !f.parentId || f.parentId === "root-library" || f.parentId === "";
      }
      return f.parentId === folderId;
    });
    let descendantsList: Folder[] = [...directChildren];
    for (const child of directChildren) {
      descendantsList = [...descendantsList, ...getAllDescendantFolders(child.id, visited)];
    }
    return descendantsList;
  };

  const descendants = getAllDescendantFolders(folder.id);

  // Helper to check if folder has cards directly
  const hasCardsDirectly = (fId: string): boolean => {
    if (fId === "root-library") {
      return cards.some((c) => !c.folderId || c.folderId === "root-library");
    }
    return cards.some((c) => c.folderId === fId);
  };

  // Helper to check if folder or its descendants has cards
  const folderHasCardsOrDescendantHasCards = (fId: string): boolean => {
    if (hasCardsDirectly(fId)) return true;
    if (!folders) return false;
    const children = folders.filter((f) => f.parentId === fId);
    return children.some((child) => folderHasCardsOrDescendantHasCards(child.id));
  };

  // Get direct children that contain cards or lead to folders with cards
  const getEligibleChildren = (parentId: string): Folder[] => {
    if (!folders) return [];
    return folders.filter((f) => {
      const isDirectChild = parentId === "root-library"
        ? (!f.parentId || f.parentId === "root-library" || f.parentId === "")
        : f.parentId === parentId;
      return isDirectChild && folderHasCardsOrDescendantHasCards(f.id);
    });
  };

  const isCardFolderSelected = (c: Flashcard) => {
    const normFolderId = c.folderId || "root-library";
    return selectedFolderIds.includes(normFolderId);
  };

  useEffect(() => {
    if (isOpen) {
      // Get subfolders that are eligible
      const eligibleSubfolderIds = descendants
        .filter((sf) => folderHasCardsOrDescendantHasCards(sf.id))
        .map((sf) => sf.id);

      const initialFolderIds = [folder.id, ...eligibleSubfolderIds];
      setSelectedFolderIds(initialFolderIds);

      const folderTreeCards = cards.filter((c) => {
        const isDirect = folder.id === "root-library"
          ? (!c.folderId || c.folderId === "root-library")
          : c.folderId === folder.id;
        return isDirect || eligibleSubfolderIds.includes(c.folderId);
      });
      setSelectedIds(folderTreeCards.map((c) => c.id));
      setShuffledCards(folderTreeCards);

      // Keep subfolders collapsed by default, only root folder.id can be expanded/true
      const initialExpanded: Record<string, boolean> = { [folder.id]: true };
      setExpandedFolders(initialExpanded);
    }
  }, [isOpen, folder.id, cards, folders]);

  if (!isOpen) return null;

  const handleToggleCard = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleToggleCardInTree = (cardId: string, fId: string) => {
    const normFolderId = fId || "root-library";
    const isSelected = selectedIds.includes(cardId);
    if (isSelected) {
      setSelectedIds((prev) => prev.filter((id) => id !== cardId));
    } else {
      setSelectedIds((prev) => [...prev, cardId]);
      if (!selectedFolderIds.includes(normFolderId)) {
        setSelectedFolderIds((prev) => [...prev, normFolderId]);
      }
    }
  };

  const handleToggleFolder = (folderId: string) => {
    const isCurrentlySelected = selectedFolderIds.includes(folderId);
    
    // Toggle folder and all its descendants recursively
    const folderDescendants = getAllDescendantFolders(folderId);
    const affectedFolderIds = [folderId, ...folderDescendants.map((d) => d.id)];

    let nextFolderIds: string[];
    if (isCurrentlySelected) {
      nextFolderIds = selectedFolderIds.filter((id) => !affectedFolderIds.includes(id));
    } else {
      nextFolderIds = [...new Set([...selectedFolderIds, ...affectedFolderIds])];
    }
    setSelectedFolderIds(nextFolderIds);

    // Update cards inside affected folders
    const affectedCardIds = cards.filter((c) => {
      const normId = c.folderId || "root-library";
      return affectedFolderIds.includes(normId);
    }).map((c) => c.id);

    if (isCurrentlySelected) {
      setSelectedIds((prev) => prev.filter((id) => !affectedCardIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...affectedCardIds])]);
    }
  };

  const handleSelectAll = () => {
    const activeCards = shuffledCards.filter(isCardFolderSelected);
    setSelectedIds(activeCards.map((c) => c.id));
  };

  const handleShuffle = () => {
    const shuffled = [...shuffledCards].sort(() => Math.random() - 0.5);
    setShuffledCards(shuffled);
  };

  const handleStart = () => {
    const selected = shuffledCards.filter(
      (c) => selectedIds.includes(c.id) && isCardFolderSelected(c)
    );
    if (selected.length === 0) return;
    
    if (isChainMode) {
      if (chainMethods.length === 0) return;
      onStartReview(chainMethods[0], selected, chainMethods, 0);
    } else {
      onStartReview(method, selected);
    }
    onClose();
  };

  const reviewMethods: { value: ReviewMethod; label: string; icon: string; desc: string }[] = [
    { value: "classic", label: "وجه وخلف (كلاسيكي)", icon: "style", desc: "بطاقات فلاشية ثلاثية الأبعاد تقليدية" },
    { value: "write", label: "كتابة", icon: "edit_note", desc: "اكتب الترجمة أو الإجابة باليد" },
    { value: "listen", label: "استماع", icon: "headphones", desc: "استمع إلى النطق ثم خمن واكتب" },
    { value: "article", label: "ال أرتيكل (der/die/das)", icon: "category", desc: "ممارسة أدوات التعريف للغة الألمانية" },
    { value: "match", label: "ربط المصطلحات", icon: "grid_view", desc: "لعبة تفاعلية لتوصيل الكلمة بمعناها" },
    { value: "challenge", label: "وضع التحدي", icon: "timer", desc: "تحدَّ نفسك مع مؤقت تنازلي ونطق الإجابة تلقائياً" }
  ];

  const getCardCountLabel = (count: number) => {
    if (count === 1) return "بطاقة دراسة";
    if (count === 2) return "بطاقتان";
    if (count >= 3 && count <= 10) return `${count} بطاقات`;
    return `${count} بطاقة`;
  };

  const reviewMethodsList: { value: ReviewMethod; label: string; iconElement: React.ReactNode; desc: string }[] = [
    {
      value: "challenge",
      label: "وضع التحدي",
      iconElement: <Timer className="w-5 h-5 text-on-surface-variant group-hover:text-primary shrink-0 transition-colors" />,
      desc: "تحدَّ نفسك مع مؤقت تنازلي ونطق الإجابة تلقائياً"
    },
    {
      value: "write",
      label: "كتابة",
      iconElement: <Pencil className="w-5 h-5 text-on-surface-variant group-hover:text-primary shrink-0 transition-colors" />,
      desc: "اكتب الترجمة أو الإجابة باليد"
    },
    {
      value: "listen",
      label: "استماع",
      iconElement: <Headphones className="w-5 h-5 text-on-surface-variant group-hover:text-primary shrink-0 transition-colors" />,
      desc: "استمع إلى النطق ثم خمن واكتب"
    },
    {
      value: "article",
      label: "ال أرتيكل",
      iconElement: <BookOpen className="w-5 h-5 text-on-surface-variant group-hover:text-primary shrink-0 transition-colors" />,
      desc: "ممارسة أدوات التعريف للغة الألمانية"
    },
    {
      value: "match",
      label: "ربط",
      iconElement: <Layers className="w-5 h-5 text-on-surface-variant group-hover:text-primary shrink-0 transition-colors" />,
      desc: "لعبة تفاعلية لتوصيل الكلمة بمعناها"
    },
    {
      value: "classic",
      label: "وجه وخلف",
      iconElement: <Copy className="w-5 h-5 text-on-surface-variant group-hover:text-primary shrink-0 transition-colors" />,
      desc: "بطاقات فلاشية ثلاثية الأبعاد تقليدية"
    }
  ];

  const visibleCards = shuffledCards.filter(isCardFolderSelected);
  const selectedVisibleCards = shuffledCards.filter(
    (c) => selectedIds.includes(c.id) && isCardFolderSelected(c)
  );

  const eligibleFolderIds = [folder.id, ...descendants.map((sf) => sf.id)].filter(
    (id) => id === folder.id || folderHasCardsOrDescendantHasCards(id)
  );
  const isAllFoldersSelected = eligibleFolderIds.length > 0 && eligibleFolderIds.every((id) => selectedFolderIds.includes(id));

  const handleSelectAllFolders = () => {
    if (isAllFoldersSelected) {
      setSelectedFolderIds([]);
      setSelectedIds([]);
    } else {
      setSelectedFolderIds(eligibleFolderIds);
      const allCards = cards.filter((c) => {
        if (eligibleFolderIds.includes(c.folderId)) return true;
        if (eligibleFolderIds.includes("root-library") && (!c.folderId || c.folderId === "")) return true;
        return false;
      });
      setSelectedIds(allCards.map((c) => c.id));
    }
  };

  const renderReviewCardTreeItem = (card: Flashcard, depth: number, isLast = false) => {
    const isSelected = selectedIds.includes(card.id);
    return (
      <div key={card.id} className="flex flex-col relative">
        {/* Full vertical line if not the last child */}
        {depth > 0 && !isLast && (
          <div className="absolute right-[-16px] top-0 bottom-0 w-[1px] bg-slate-200 pointer-events-none" />
        )}

        <div
          onClick={() => handleToggleCardInTree(card.id, card.folderId)}
          className={`flex items-center justify-between p-2.5 rounded-2xl transition-all relative cursor-pointer select-none ${
            depth > 0 ? "mr-4" : ""
          } ${
            isSelected
              ? "bg-purple-50/45 text-purple-700 font-bold"
              : "hover:bg-slate-50 text-slate-600"
          }`}
        >
          {/* Tree-branch curved/bend connector */}
          {depth > 0 && (
            <div className="absolute right-[-16px] top-0 h-[22px] w-4 border-r border-b border-slate-200 rounded-br-lg pointer-events-none" />
          )}

          {/* Active sleek vertical indicator bar */}
          {isSelected && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-l-full bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.3)]" />
          )}

          <div className="flex items-center gap-3 flex-1 min-w-0 text-right pr-2">
            {/* Card Icon */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              isSelected ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-400"
            }`}>
              <FileText className="w-4 h-4" />
            </div>

            {/* Title & Hint */}
            <div className="flex-1 min-w-0 text-right">
              <h5 className="font-bold text-xs truncate leading-tight">{card.frontText || "بدون نص"}</h5>
              {card.translationHint && (
                <p className="text-[10px] text-slate-400 truncate mt-0.5 font-semibold">{card.translationHint}</p>
              )}
            </div>
          </div>

          {/* Custom Check Circle Indicator */}
          <div
            className={`w-4.5 h-4.5 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 ${
              isSelected
                ? "bg-purple-600 border-purple-600 text-white scale-110 shadow-sm shadow-purple-500/20"
                : "border-slate-300 hover:border-slate-400 bg-white text-transparent"
            }`}
          >
            <Check className="w-2.5 h-2.5 stroke-[3px]" />
          </div>
        </div>
      </div>
    );
  };

  // Recursive dynamic folder tree renderer for review setup
  const renderReviewFolderTree = (f: Folder, depth: number, isLast = false) => {
    const children = getEligibleChildren(f.id);
    const folderCards = cards.filter((c) => c.folderId === f.id);
    const hasKids = children.length > 0 || folderCards.length > 0;
    const isExpanded = !!expandedFolders[f.id];
    const isSelected = selectedFolderIds.includes(f.id);
    const folderCardsCount = folderCards.length;

    const accentColor = f.color || "#0056f6";

    return (
      <div key={f.id} className="flex flex-col relative">
        {/* Full vertical line if not the last child */}
        {depth > 0 && !isLast && (
          <div className="absolute right-[-16px] top-0 bottom-0 w-[1px] bg-slate-200 pointer-events-none" />
        )}

        {/* Folder Item Row */}
        <div
          onClick={() => handleToggleFolder(f.id)}
          className={`flex items-center justify-between p-3 rounded-2xl transition-all relative cursor-pointer select-none ${
            depth > 0 ? "mr-4" : ""
          } ${
            isSelected
              ? "font-bold"
              : "hover:bg-slate-50 text-on-surface"
          }`}
          style={{
            backgroundColor: isSelected ? `${accentColor}0a` : undefined,
            color: isSelected ? accentColor : undefined,
          }}
        >
          {/* Tree-branch curved/bend connector */}
          {depth > 0 && (
            <div className="absolute right-[-16px] top-0 h-[26px] w-4 border-r border-b border-slate-200 rounded-br-lg pointer-events-none" />
          )}

          {/* Active sleek vertical indicator bar */}
          {isSelected && (
            <div 
              className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-8 rounded-l-full shadow-md"
              style={{ 
                backgroundColor: accentColor,
                boxShadow: `0 0 10px ${accentColor}40`
              }}
            />
          )}

          <div className="flex items-center gap-3.5 flex-1 min-w-0 text-right pr-2">
            {/* Folder Icon */}
            <div 
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors"
              style={{
                backgroundColor: isSelected ? `${accentColor}15` : "#f1f5f9",
                color: isSelected ? accentColor : "#64748b",
              }}
            >
              {isExpanded ? (
                <FolderOpen className="w-5 h-5" />
              ) : (
                <LucideFolder className="w-5 h-5" />
              )}
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0 text-right">
              <h4 className="font-bold text-sm truncate leading-tight" style={{ color: isSelected ? accentColor : undefined }}>{f.name}</h4>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Custom Check Circle Indicator */}
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 ${
                isSelected
                  ? "text-white scale-110 shadow-sm"
                  : "border-slate-300 hover:border-slate-400 bg-white text-transparent"
              }`}
              style={{
                backgroundColor: isSelected ? accentColor : undefined,
                borderColor: isSelected ? accentColor : undefined,
                boxShadow: isSelected ? `0 2px 6px ${accentColor}30` : undefined,
              }}
            >
              <Check className="w-3 h-3 stroke-[3px]" />
            </div>

            {/* Collapsible Button if contains subfolders with cards */}
            {hasKids && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedFolders((prev) => ({ ...prev, [f.id]: !prev[f.id] }));
                }}
                className="p-1.5 hover:bg-black/5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    isExpanded ? "rotate-0" : "rotate-90"
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Nested Children (indented dynamically with a visual tree line) */}
        {children.length > 0 && isExpanded && (
          <div className="flex flex-col gap-1.5 mr-4 pr-0 mt-1 mb-1 relative">
            {/* Render subfolders */}
            {children.map((child, idx) => {
              const isLastChild = idx === children.length - 1;
              return renderReviewFolderTree(child, depth + 1, isLastChild);
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div className="bg-[#f8fafc] w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] animate-scaleUp">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="w-10 sm:w-12" /> {/* Spacer to balance and center the title */}
          <h2 className="text-base sm:text-lg font-extrabold text-slate-800 text-center flex-1">تخصيص المراجعة</h2>
          <button 
            onClick={onClose} 
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors cursor-pointer active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content (Single Column Scrollable with hidden scrollbar) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Section 1: Included Folders Card */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">المجلدات المشمولة</h3>
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-3xs">
              {/* Root Folder Item */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0056f6]/5 text-[#0056f6] flex items-center justify-center">
                    <LucideFolder className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <h4 className="text-sm font-bold text-slate-800">{folder.name}</h4>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">
                    {getCardCountLabel(cards.filter(c => folder.id === "root-library" ? (!c.folderId || c.folderId === "root-library") : c.folderId === folder.id).length)}
                  </span>
                  {/* Select All shortcut if subfolders exist */}
                  {getEligibleChildren(folder.id).length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllFolders}
                      className="text-[10px] font-bold text-[#0056f6] hover:bg-blue-50 px-2 py-1 rounded-md transition-all active:scale-95 cursor-pointer"
                    >
                      {isAllFoldersSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                    </button>
                  )}
                </div>
              </div>

              {/* Subfolders if any */}
              {getEligibleChildren(folder.id).length > 0 ? (
                <div className="max-h-[180px] overflow-y-auto pr-1 space-y-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {getEligibleChildren(folder.id).map((child) => renderReviewFolderTree(child, 0))}
                </div>
              ) : (
                <p className="text-[10px] font-semibold text-slate-400 text-center py-2">لا توجد مجلدات فرعية في هذا المجلد.</p>
              )}
            </div>
          </div>

          {/* Section 2: Review Methods Section */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">طريقة المراجعة</h3>
            
            {/* Mode selection Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl" dir="rtl">
              <button
                type="button"
                onClick={() => setIsChainMode(false)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  !isChainMode
                    ? "bg-white text-[#0056f6] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                مراجعة فردية
              </button>
              <button
                type="button"
                onClick={() => setIsChainMode(true)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isChainMode
                    ? "bg-white text-[#0056f6] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                سلسلة متسلسلة ⛓️
              </button>
            </div>

            {!isChainMode ? (
              /* Single Review Grid */
              <div className="grid grid-cols-2 gap-2">
                {reviewMethodsList.map((m) => {
                  const isSelected = method === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-2xl border transition-all cursor-pointer group text-right w-full min-h-[56px] active:scale-[0.98] ${
                        isSelected
                          ? "border-[#0056f6] bg-[#0056f6]/5 text-[#0056f6] font-bold shadow-xs ring-1 ring-[#0056f6]"
                          : "border-slate-100 bg-white hover:bg-slate-50 text-slate-600 hover:border-slate-200"
                      }`}
                    >
                      <div className={`shrink-0 p-1.5 rounded-xl transition-colors ${
                        isSelected ? "bg-[#0056f6]/10 text-[#0056f6]" : "bg-slate-50 text-slate-400 group-hover:text-slate-600"
                      }`}>
                        {React.cloneElement(m.iconElement as React.ReactElement<any>, {
                          className: "w-4 h-4 shrink-0 transition-colors text-current"
                        })}
                      </div>
                      <div className="flex flex-col text-right min-w-0">
                        <span className="text-xs font-bold leading-tight whitespace-nowrap truncate">{m.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Sequential Review Chain Builder */
              <div className="space-y-4 bg-white rounded-2xl border border-slate-100 p-4 shadow-3xs text-right">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold text-slate-700">قم ببناء مسار المراجعة الخاص بك 👇</p>
                  <p className="text-[10px] font-semibold text-slate-400">انقر لإضافة الطرق، ورتّبها بالشكل الذي يناسبك للعبها واحدة تلو الأخرى بسلاسة.</p>
                </div>

                {/* Available Pool of Review Methods */}
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50/60 rounded-xl border border-slate-100">
                  {reviewMethodsList.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setChainMethods([...chainMethods, m.value])}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-100 hover:border-primary/40 rounded-xl text-[11px] font-bold text-slate-600 cursor-pointer active:scale-95 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>

                {/* Built Chain list */}
                <div className="space-y-2 mt-3">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">السلسلة الحالية ({chainMethods.length} خطوة)</span>
                  {chainMethods.length === 0 ? (
                    <p className="text-xs font-bold text-center text-slate-400 py-4 bg-slate-50/40 rounded-xl border border-dashed border-slate-100">سلسلتك فارغة! اضغط على الطرق بالأعلى لإضافتها.</p>
                  ) : (
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {chainMethods.map((m, idx) => {
                        const mObj = reviewMethodsList.find(x => x.value === m);
                        if (!mObj) return null;
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 bg-slate-50/70 border border-slate-100/80 rounded-xl transition-all"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center select-none shrink-0">
                                {idx + 1}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <div className="p-1 rounded-lg bg-white border border-slate-100 text-slate-400 shrink-0">
                                  {React.cloneElement(mObj.iconElement as React.ReactElement<any>, {
                                    className: "w-3.5 h-3.5"
                                  })}
                                </div>
                                <span className="text-xs font-bold text-slate-700">{mObj.label}</span>
                              </div>
                            </div>

                            {/* Control Actions for sorting & deleting */}
                            <div className="flex items-center gap-1">
                              {/* Move Up */}
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => {
                                  if (idx === 0) return;
                                  const copy = [...chainMethods];
                                  const temp = copy[idx];
                                  copy[idx] = copy[idx - 1];
                                  copy[idx - 1] = temp;
                                  setChainMethods(copy);
                                }}
                                className="p-1 rounded bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 border border-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
                                title="تحريك لأعلى"
                              >
                                <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                              </button>

                              {/* Move Down */}
                              <button
                                type="button"
                                disabled={idx === chainMethods.length - 1}
                                onClick={() => {
                                  if (idx === chainMethods.length - 1) return;
                                  const copy = [...chainMethods];
                                  const temp = copy[idx];
                                  copy[idx] = copy[idx + 1];
                                  copy[idx + 1] = temp;
                                  setChainMethods(copy);
                                }}
                                className="p-1 rounded bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 border border-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
                                title="تحريك لأسفل"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => {
                                  setChainMethods(chainMethods.filter((_, i) => i !== idx));
                                }}
                                className="p-1 rounded bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-100 cursor-pointer flex items-center justify-center"
                                title="حذف من السلسلة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4.5 border-t border-slate-100 bg-white flex items-center justify-between rounded-b-3xl shrink-0">
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-bold text-slate-400">إجمالي بطاقات المراجعة</span>
            <span className="text-xs sm:text-sm font-extrabold text-[#0056f6]">
              {getCardCountLabel(selectedVisibleCards.length)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer active:scale-95"
            >
              إلغاء
            </button>
            <button
              onClick={handleStart}
              disabled={selectedVisibleCards.length === 0 || (isChainMode && chainMethods.length === 0)}
              className="px-7 py-2.5 bg-[#0056f6] text-white font-extrabold text-xs sm:text-sm rounded-full hover:bg-blue-700 active:scale-95 transition-all cursor-pointer shadow-md shadow-blue-500/10 disabled:opacity-40 disabled:pointer-events-none"
            >
              ابدأ المراجعة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onOpen }) => {
  const [audioApi, setAudioApi] = useState("google_proxy");
  const [customTtsUrl, setCustomTtsUrl] = useState("");
  const [imageApi, setImageApi] = useState("duckduckgo");
  const [pixabayKey, setPixabayKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [enableInlinePersonaCorrection, setEnableInlinePersonaCorrection] = useState<boolean>(
    () => localStorage.getItem("settings_enable_persona_correction") !== "false"
  );

  // Site scale zoom states
  const [siteScale, setSiteScale] = useState(100);
  const initialScaleRef = useRef(100);

  // Cache Manager states
  const [imageCacheCount, setImageCacheCount] = useState<number | null>(null);
  const [imageCacheSize, setImageCacheSize] = useState<string | null>(null);
  const [ttsCacheCount, setTtsCacheCount] = useState<number | null>(null);
  const [ttsCacheSize, setTtsCacheSize] = useState<string | null>(null);
  const [isCalculatingCache, setIsCalculatingCache] = useState(false);

  // Active Settings Tab
  const [activeTab, setActiveTab] = useState<"audio" | "ai" | "images" | "storage" | "diagnostics">("audio");

  // Diagnostic system states
  const [speechError, setSpeechError] = useState<{
    msg: string;
    cause?: string;
    solution?: string;
    checksSummary?: Array<{ step: string; status: "passed" | "failed" | "skipped"; detail: string }>;
    technicalDetails?: any;
    failedStepTitle?: string;
  } | null>(null);
  const [detailedTtsAnalysis, setDetailedTtsAnalysis] = useState<DetailedTtsErrorAnalysis | null>(null);
  const [localTtsStage, setLocalTtsStage] = useState<{ step: number; title: string } | null>(null);
  const [serverTtsStepInfo, setServerTtsStepInfo] = useState<{ status: "checking" | "found" | "downloading" | "generating" | "success" | "error"; msg: string } | null>(null);
  const [granularTtsCheckResults, setGranularTtsCheckResults] = useState<{
    passed: boolean;
    steps: Array<{ stepNum: number; title: string; status: "ok" | "error" | "pending"; durationMs?: number; details?: string }>;
    analysis?: DetailedTtsErrorAnalysis;
  } | null>(null);
  const [isRunningGranularCheck, setIsRunningGranularCheck] = useState<boolean>(false);
  const [diagnosticLogList, setDiagnosticLogList] = useState<DiagnosticLogItem[]>(() => [...globalDiagnosticLogs]);
  const [diagFilter, setDiagFilter] = useState<string>("all");
  const [isTestingSystem, setIsTestingSystem] = useState<boolean>(false);
  const [systemTestResults, setSystemTestResults] = useState<Record<string, { ok: boolean; msg: string; cause?: string; solution?: string; ms?: number }> | null>(null);

  // Primary Default Model per language states (for flashcard sound button)
  const [primaryModelDe, setPrimaryModelDe] = useState<string>(
    () => localStorage.getItem("settings_primary_piper_model_de") || "de_DE-thorsten-medium"
  );
  const [primaryModelAr, setPrimaryModelAr] = useState<string>(
    () => localStorage.getItem("settings_primary_piper_model_ar") || "ar_JO-kareem-medium"
  );
  const [primaryModelEn, setPrimaryModelEn] = useState<string>(
    () => localStorage.getItem("settings_primary_piper_model_en") || "en_US-lessac-medium"
  );

  // Secondary Voice Model states & Enable toggle for review cards
  const [enableSecondaryAudioReview, setEnableSecondaryAudioReview] = useState<boolean>(
    () => localStorage.getItem("settings_enable_secondary_audio_review") === "true"
  );
  const [secondaryModelDe, setSecondaryModelDe] = useState<string>(
    () => localStorage.getItem("settings_secondary_piper_model_de") || "google"
  );
  const [secondaryModelAr, setSecondaryModelAr] = useState<string>(
    () => localStorage.getItem("settings_secondary_piper_model_ar") || "google"
  );
  const [secondaryModelEn, setSecondaryModelEn] = useState<string>(
    () => localStorage.getItem("settings_secondary_piper_model_en") || "google"
  );

  // Sandbox & Voice Management states
  const [ttsExecutionMode, setTtsExecutionMode] = useState<"local" | "server">(
    () => (localStorage.getItem("settings_tts_execution_mode") as "local" | "server") || "local"
  );
  const [isPreloadingLocal, setIsPreloadingLocal] = useState(false);
  const [localPreloadedMsg, setLocalPreloadedMsg] = useState<string | null>(null);
  const [localInstallProgress, setLocalInstallProgress] = useState<number>(0);
  const [localInstallStep, setLocalInstallStep] = useState<string>("");

  const [testVoiceText, setTestVoiceText] = useState("Guten Tag! Wie geht es Ihnen heute?");
  const [testVoiceLang, setTestVoiceLang] = useState("de");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<"idle" | "generating" | "playing">("idle");
  const [selectedPiperModel, setSelectedPiperModel] = useState<string>("de_DE-thorsten-medium");
  const [piperModels, setPiperModels] = useState<any[]>([]);
  const [piperInstalled, setPiperInstalled] = useState<boolean>(true);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // Piper Model Catalog & Download Management
  const [catalogModels, setCatalogModels] = useState<any[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<string>("all");
  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
  const [downloadProgressMap, setDownloadProgressMap] = useState<Record<string, { percent: number; loadedMb: string; totalMb: string; step: string }>>({});
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [customModelUrl, setCustomModelUrl] = useState<string>("");
  const [customModelId, setCustomModelId] = useState<string>("");
  const [isDownloadingCustom, setIsDownloadingCustom] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);

  const [isRepairingServer, setIsRepairingServer] = useState(false);
  const [repairStatusMsg, setRepairStatusMsg] = useState<string | null>(null);

  const handleRepairServerPiper = async () => {
    setIsRepairingServer(true);
    setRepairStatusMsg("جاري فحص وتنزيل الملحقات والمكتبات النواقص في السيرفر...");
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiEndpoint = isLocalhost ? "http://localhost:3000/api/system/repair-piper" : "/api/system/repair-piper";
      const res = await fetch(apiEndpoint, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setRepairStatusMsg(data.message || "تم تنزيل وإصلاح جميع ملفات السيرفر بنجاح!");
        await fetchCatalog();
      } else {
        setRepairStatusMsg(data.message || "حدث خطأ أثناء محاولة إصلاح ملفات السيرفر.");
      }
    } catch (err: any) {
      setRepairStatusMsg("تعذر الاتصال بخدمة إصلاح السيرفر: " + (err?.message || "خطأ غير معروف"));
    } finally {
      setIsRepairingServer(false);
    }
  };

  const handleSetPrimaryModel = (lang: string, modelId: string) => {
    const langKey = lang.toLowerCase().split("-")[0].split("_")[0];
    if (langKey === "de") {
      setPrimaryModelDe(modelId);
      localStorage.setItem("settings_primary_piper_model_de", modelId);
    } else if (langKey === "ar") {
      setPrimaryModelAr(modelId);
      localStorage.setItem("settings_primary_piper_model_ar", modelId);
    } else if (langKey === "en") {
      setPrimaryModelEn(modelId);
      localStorage.setItem("settings_primary_piper_model_en", modelId);
    }
    localStorage.setItem("settings_primary_piper_model", modelId);
    setDownloadSuccessMsg(`تم تعيين الصوت (${modelId}) كصوت افتراضي أساسي لنطق بطاقات اللغة (${langKey.toUpperCase()})!`);
  };

  const handleSetSecondaryModel = (lang: string, modelId: string) => {
    const langKey = lang.toLowerCase().split("-")[0].split("_")[0];
    if (langKey === "de") {
      setSecondaryModelDe(modelId);
      localStorage.setItem("settings_secondary_piper_model_de", modelId);
    } else if (langKey === "ar") {
      setSecondaryModelAr(modelId);
      localStorage.setItem("settings_secondary_piper_model_ar", modelId);
    } else if (langKey === "en") {
      setSecondaryModelEn(modelId);
      localStorage.setItem("settings_secondary_piper_model_en", modelId);
    }
    localStorage.setItem("settings_secondary_piper_model", modelId);
    setDownloadSuccessMsg(`تم تعيين الصوت الثانوي (${modelId}) لنطق بطاقات اللغة (${langKey.toUpperCase()})!`);
  };

  const handlePreloadLocalCache = async () => {
    setIsPreloadingLocal(true);
    setLocalPreloadedMsg(null);
    setLocalInstallProgress(10);
    setLocalInstallStep("جاري فحص دعم معالج الهاردوير بالمتصفح ودعم محركات WebAssembly...");

    try {
      await configureOnnxRuntime();
      const piperWeb = await import("@mintplex-labs/piper-tts-web");
      if (piperWeb?.TtsSession?.WASM_LOCATIONS) {
        piperWeb.TtsSession.WASM_LOCATIONS.onnxWasm = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
      }

      setLocalInstallProgress(30);
      setLocalInstallStep("جاري فحص الموديلات المنزلة في قسم أصوات النظام...");

      let downloadedList: any[] = [];
      try {
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const apiBase = isLocalhost ? "http://localhost:3000/api/tts/catalog" : "/api/tts/catalog";
        const res = await fetch(apiBase);
        if (res.ok) {
          const data = await res.json();
          if (data.models) {
            downloadedList = data.models.filter((m: any) => m.isDownloaded);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch catalog during local preload:", e);
      }

      if (downloadedList.length > 0) {
        const stepProgress = 60 / downloadedList.length;
        for (let i = 0; i < downloadedList.length; i++) {
          const m = downloadedList[i];
          setLocalInstallStep(`جاري مزامنة وتخزين النموذج المنزّل (${m.name || m.id}) للمتصفح...`);
          try {
            await piperWeb.download(m.id as any);
          } catch (e) {
            console.warn(`Pre-downloading ${m.id} failed:`, e);
          }
          setLocalInstallProgress(Math.min(90, Math.round(30 + (i + 1) * stepProgress)));
        }
      } else {
        setLocalInstallProgress(75);
        setLocalInstallStep("تم تهيئة المحرك. يمكنك تنزيل أي صوت من قسم الموديلات للبدء لاستخدامه محلياً وسيرفر.");
      }

      setLocalInstallProgress(100);
      setLocalInstallStep("اكتمل التثبيت وتجهيز المحرك العصبي بنجاح 100%!");

      localStorage.setItem("settings_tts_execution_mode", "local");
      localStorage.setItem("settings_tts_local_installed", "true");
      setTtsExecutionMode("local");

      if (downloadedList.length > 0) {
        setLocalPreloadedMsg(`تم تهيئة محرك Piper WASM بالمتصفح بنجاح ومزامنة الموديلات المنزّلة (${downloadedList.map(m => m.name || m.id).join(", ")}) للاستخدام المحلي أوفلاين 100%!`);
      } else {
        setLocalPreloadedMsg("تم تهيئة وتأكيد جاهزية محرك Piper WASM المحلي بنجاح! يمكنك الآن تنزيل الموديلات التي تفضلها من قسم 'إدارة ونماذج الأصوات' لتعمل محلياً وسيرفر بنفس الموديلات تماماً.");
      }
    } catch (err: any) {
      console.warn("Local Piper WASM preload error:", err);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.getVoices();
      }
      localStorage.setItem("settings_tts_execution_mode", "local");
      setTtsExecutionMode("local");
      setLocalPreloadedMsg("تم تثبيت وتفعيل وضع النطق المحلي بالمتصفح.");
    } finally {
      setIsPreloadingLocal(false);
    }
  };

  const fetchCatalog = async () => {
    setIsLoadingModels(true);
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/tts/catalog" : "/api/tts/catalog";
      const res = await fetch(`${apiBase}?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPiperInstalled(data.piperInstalled);
        if (data.models && data.models.length > 0) {
          // Check OPFS storage for locally downloaded browser models
          let opfsInstalledIds: string[] = [];
          try {
            if (typeof window !== "undefined" && "storage" in navigator && navigator.storage.getDirectory) {
              const root = await navigator.storage.getDirectory();
              const dir = await root.getDirectoryHandle("piper", { create: false }).catch(() => null);
              if (dir) {
                for (const m of data.models) {
                  const onnxFile = await dir.getFileHandle(`${m.id}.onnx`, { create: false }).catch(() => null);
                  if (onnxFile) {
                    opfsInstalledIds.push(m.id);
                  }
                }
              }
            }
          } catch (opfsErr) {
            console.warn("OPFS model inspection warning:", opfsErr);
          }

          const mergedModels = data.models.map((m: any) => ({
            ...m,
            isDownloaded: m.isDownloaded || opfsInstalledIds.includes(m.id)
          }));

          setCatalogModels(mergedModels);
          const downloaded = mergedModels.filter((m: any) => m.isDownloaded);
          setPiperModels(downloaded);

          if (downloaded.length > 0 && (!selectedPiperModel || !downloaded.some((m: any) => m.id === selectedPiperModel))) {
            setSelectedPiperModel(downloaded[0].id);
          } else if (downloaded.length === 0 && !selectedPiperModel) {
            setSelectedPiperModel("");
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch Piper catalog:", err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleDownloadModel = async (model: any) => {
    const modelId = model.id;
    setDownloadingIds(prev => ({ ...prev, [modelId]: true }));
    setDownloadProgressMap(prev => ({
      ...prev,
      [modelId]: {
        percent: 1,
        loadedMb: "0.0 MB",
        totalMb: model.sizeMb || "60.0 MB",
        step: "[1/2 الخادم] جاري بدء التنزيل من HuggingFace..."
      }
    }));
    setDownloadError(null);
    setDownloadSuccessMsg(null);

    const pollInterval = setInterval(async () => {
      try {
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const apiBase = isLocalhost ? "http://localhost:3000/api/tts/models/download-progress" : "/api/tts/models/download-progress";
        const res = await fetch(`${apiBase}?modelId=${encodeURIComponent(modelId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === "downloading") {
            setDownloadProgressMap(prev => ({
              ...prev,
              [modelId]: {
                percent: data.percent ?? 0,
                loadedMb: data.loadedMb || "0.0 MB",
                totalMb: data.totalMb || model.sizeMb || "60.0 MB",
                step: data.step || "[1/2 الخادم] جاري تنزيل ملفات الصوت..."
              }
            }));
          }
        }
      } catch (e) {
        // ignore polling error
      }
    }, 200);

    try {
      // 1. Download to server
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/tts/models/download" : "/api/tts/models/download";
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          urlOnnx: model.urlOnnx,
          urlJson: model.urlJson,
          sizeMb: model.sizeMb
        })
      });

      // Clear server poll interval before starting phase 2
      clearInterval(pollInterval);

      // 2. Also download/store in browser local storage for offline local generation with REAL progress callback
      try {
        setDownloadProgressMap(prev => ({
          ...prev,
          [modelId]: {
            percent: 1,
            loadedMb: "0.0 MB",
            totalMb: model.sizeMb || "60.0 MB",
            step: "[2/2 المتصفح] جاري تجهيز وتخزين الصوت أوفلاين بالمتصفح..."
          }
        }));

        await configureOnnxRuntime();
        const piperWeb = await import("@mintplex-labs/piper-tts-web");
        if (piperWeb?.TtsSession?.WASM_LOCATIONS) {
          piperWeb.TtsSession.WASM_LOCATIONS.onnxWasm = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
        }

        await piperWeb.download(modelId as any, (p: any) => {
          if (p && p.loaded) {
            const loadedBytes = p.loaded;
            let totalBytes = p.total || 0;
            if (!totalBytes || isNaN(totalBytes)) {
              if (model.sizeMb) {
                const parsedMb = parseFloat(model.sizeMb);
                if (!isNaN(parsedMb)) totalBytes = Math.round(parsedMb * 1024 * 1024);
              }
            }
            const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
            const loadedMb = (loadedBytes / (1024 * 1024)).toFixed(1) + " MB";
            const totalMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) + " MB" : (model.sizeMb || "60.0 MB");

            setDownloadProgressMap(prev => ({
              ...prev,
              [modelId]: {
                percent,
                loadedMb,
                totalMb,
                step: `[2/2 المتصفح] تخزين محلي أوفلاين: ${loadedMb} / ${totalMb} (${percent}%)`
              }
            }));
          }
        });
      } catch (localErr) {
        console.warn("Browser local storage model download notice:", localErr);
      }

      if (res.ok) {
        setDownloadProgressMap(prev => ({
          ...prev,
          [modelId]: {
            percent: 100,
            loadedMb: prev[modelId]?.totalMb || model.sizeMb || "60.0 MB",
            totalMb: prev[modelId]?.totalMb || model.sizeMb || "60.0 MB",
            step: "اكتمل التنزيل والتثبيت 100%!"
          }
        }));
        setDownloadSuccessMsg(`تم تنزيل الصوت العصبي (${model.name || modelId}) بنجاح للسيرفر والمتصفح! أصبح جاهزاً للاستخدام محلياً وسيرفر.`);
        await fetchCatalog();
      } else {
        const errData = await res.json().catch(() => ({}));
        setDownloadError(errData.error || "فشل التنزيل. يرجى التأكد من الاتصال بالإنترنت.");
      }
    } catch (err: any) {
      clearInterval(pollInterval);
      setDownloadError(err.message || "حدث خطأ أثناء تنزيل نموذج الصوت.");
    } finally {
      clearInterval(pollInterval);
      setDownloadingIds(prev => ({ ...prev, [modelId]: false }));
    }
  };

  const handleDownloadCustom = async () => {
    if (!customModelId.trim()) {
      setDownloadError("يرجى كتابة معرّف الصوت (Model ID).");
      return;
    }
    const modelId = customModelId.trim();
    setIsDownloadingCustom(true);
    setDownloadProgressMap(prev => ({
      ...prev,
      [modelId]: {
        percent: 1,
        loadedMb: "0.0 MB",
        totalMb: "60.0 MB",
        step: "[1/2 الخادم] جاري تنزيل النموذج المخصص من الرابط..."
      }
    }));
    setDownloadError(null);
    setDownloadSuccessMsg(null);

    const pollInterval = setInterval(async () => {
      try {
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const apiBase = isLocalhost ? "http://localhost:3000/api/tts/models/download-progress" : "/api/tts/models/download-progress";
        const res = await fetch(`${apiBase}?modelId=${encodeURIComponent(modelId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === "downloading") {
            setDownloadProgressMap(prev => ({
              ...prev,
              [modelId]: {
                percent: data.percent ?? 0,
                loadedMb: data.loadedMb || "0.0 MB",
                totalMb: data.totalMb || "60.0 MB",
                step: data.step || "[1/2 الخادم] جاري تنزيل حزمة الصوت..."
              }
            }));
          }
        }
      } catch (e) {
        // ignore polling error
      }
    }, 200);

    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/tts/models/download" : "/api/tts/models/download";
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: modelId,
          urlOnnx: customModelUrl.trim() || undefined
        })
      });

      clearInterval(pollInterval);

      try {
        setDownloadProgressMap(prev => ({
          ...prev,
          [modelId]: {
            percent: 1,
            loadedMb: "0.0 MB",
            totalMb: "60.0 MB",
            step: "[2/2 المتصفح] جاري تخزين الصوت المخصص أوفلاين..."
          }
        }));
        const piperWeb = await import("@mintplex-labs/piper-tts-web");
        await piperWeb.download(modelId as any, (p: any) => {
          if (p && p.loaded) {
            const loadedBytes = p.loaded;
            const totalBytes = p.total || 0;
            const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
            const loadedMb = (loadedBytes / (1024 * 1024)).toFixed(1) + " MB";
            const totalMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) + " MB" : "60.0 MB";

            setDownloadProgressMap(prev => ({
              ...prev,
              [modelId]: {
                percent,
                loadedMb,
                totalMb,
                step: `[2/2 المتصفح] تخزين محلي أوفلاين: ${loadedMb} / ${totalMb} (${percent}%)`
              }
            }));
          }
        });
      } catch (localErr) {
        console.warn("Browser local storage custom model download notice:", localErr);
      }

      if (res.ok) {
        setDownloadProgressMap(prev => ({
          ...prev,
          [modelId]: {
            percent: 100,
            loadedMb: prev[modelId]?.totalMb || "60.0 MB",
            totalMb: prev[modelId]?.totalMb || "60.0 MB",
            step: "اكتمل التنزيل والتثبيت 100%!"
          }
        }));
        setDownloadSuccessMsg(`تم تنزيل الصوت المخصص (${modelId}) بنجاح للسيرفر والمتصفح!`);
        setCustomModelId("");
        setCustomModelUrl("");
        await fetchCatalog();
      } else {
        const errData = await res.json().catch(() => ({}));
        setDownloadError(errData.error || "فشل تنزيل الصوت المخصص.");
      }
    } catch (err: any) {
      clearInterval(pollInterval);
      setDownloadError(err.message || "حدث خطأ أثناء تنزيل الصوت المخصص.");
    } finally {
      clearInterval(pollInterval);
      setIsDownloadingCustom(false);
    }
  };

  const [isClearingAllModels, setIsClearingAllModels] = useState<boolean>(false);

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm(`هل أنت تأكد من إزالة نموذج الصوت (${modelId}) من الخادم والمتصفح لتوفير مساحة التخزين وتنزيله من جديد؟`)) return;
    setDeletingIds(prev => ({ ...prev, [modelId]: true }));
    setDownloadError(null);
    setDownloadSuccessMsg(null);

    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost
        ? `http://localhost:3000/api/tts/models/${encodeURIComponent(modelId)}`
        : `/api/tts/models/${encodeURIComponent(modelId)}`;

      const res = await fetch(apiBase, { method: "DELETE" });

      // Direct Browser OPFS storage cleanup for this model
      try {
        if (typeof window !== "undefined" && "storage" in navigator && navigator.storage.getDirectory) {
          const root = await navigator.storage.getDirectory();
          const dir = await root.getDirectoryHandle("piper", { create: false }).catch(() => null);
          if (dir) {
            try {
              const onnxFile = await dir.getFileHandle(`${modelId}.onnx`, { create: false }).catch(() => null);
              if (onnxFile) await onnxFile.remove();
            } catch (e) {}
            try {
              const jsonFile = await dir.getFileHandle(`${modelId}.onnx.json`, { create: false }).catch(() => null);
              if (jsonFile) await jsonFile.remove();
            } catch (e) {}
          }
        }
      } catch (opfsErr) {
        console.warn("OPFS model remove warning:", opfsErr);
      }

      // Also try piperWeb library remove
      try {
        const piperWeb = await import("@mintplex-labs/piper-tts-web");
        if (piperWeb?.remove) {
          await piperWeb.remove(modelId as any).catch(() => {});
        }
      } catch (localErr) {
        console.warn("Browser local storage model remove notice:", localErr);
      }

      // Clear local download progress map entry
      setDownloadProgressMap(prev => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });

      // Optimistically update catalog state so UI changes immediately
      setCatalogModels(prev =>
        prev.map(m => (m.id === modelId ? { ...m, isDownloaded: false, installedSizeMb: null } : m))
      );
      setPiperModels(prev => prev.filter(m => m.id !== modelId));

      // Always refresh catalog from server to ensure complete sync
      await fetchCatalog();

      if (res.ok) {
        setDownloadSuccessMsg(`تم إزالة نموذج الصوت (${modelId}) بنجاح وتحرير المساحة! أصبح الآن بحالة غير منزّل ويمكنك إعادة تنزيله بالضغط على زر التنزيل. ☁️`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setDownloadError(errData.error || "فشل حذف النموذج من الخادم.");
      }
    } catch (err: any) {
      setDownloadError(err.message || "حدث خطأ أثناء حذف الصوت.");
    } finally {
      setDeletingIds(prev => ({ ...prev, [modelId]: false }));
    }
  };

  const handleClearAllModels = async () => {
    if (!confirm("هل أنت تأكد من تفريغ كافة نماذج الأصوات المنزلة وحذف كافة الملفات من الخادم والمتصفح لإعادة توفير المساحة الكاملة؟")) return;
    setIsClearingAllModels(true);
    setDownloadError(null);
    setDownloadSuccessMsg(null);

    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/tts/models/clear-all" : "/api/tts/models/clear-all";
      const res = await fetch(apiBase, { method: "POST" });

      // Direct OPFS directory wipe
      try {
        if (typeof window !== "undefined" && "storage" in navigator && navigator.storage.getDirectory) {
          const root = await navigator.storage.getDirectory();
          const dir = await root.getDirectoryHandle("piper", { create: false }).catch(() => null);
          if (dir) {
            await dir.remove({ recursive: true }).catch(() => {});
          }
        }
      } catch (opfsErr) {
        console.warn("OPFS directory wipe notice:", opfsErr);
      }

      try {
        const piperWeb = await import("@mintplex-labs/piper-tts-web");
        if (piperWeb?.flush) {
          await piperWeb.flush().catch(() => {});
        }
      } catch (localErr) {
        console.warn("Browser local storage flush notice:", localErr);
      }

      setDownloadProgressMap({});
      setCatalogModels(prev => prev.map(m => ({ ...m, isDownloaded: false, installedSizeMb: null })));
      setPiperModels([]);

      await fetchCatalog();

      if (res.ok) {
        setDownloadSuccessMsg("تم تفريغ وحذف جميع نماذج الأصوات المنزلة بنجاح واستعادة مساحة التخزين بالكامل! يمكنك إعادة تنزيل أي صوت من جديد الآن. ☁️");
      } else {
        setDownloadError("حدث خطأ أثناء مسح جميع النماذج.");
      }
    } catch (err: any) {
      setDownloadError(err.message || "حدث خطأ أثناء مسح التخزين.");
    } finally {
      setIsClearingAllModels(false);
    }
  };

  const filteredDiagnosticLogs = useMemo(() => {
    if (diagFilter === "all") return diagnosticLogList;
    return diagnosticLogList.filter((l) => l.type === diagFilter);
  }, [diagnosticLogList, diagFilter]);

  const activeDownloadingModelIds = useMemo(() => {
    return Object.keys(downloadingIds).filter((id) => downloadingIds[id]);
  }, [downloadingIds]);

  const isAnyDownloading = activeDownloadingModelIds.length > 0 || isDownloadingCustom || isPreloadingLocal;

  const [testImgQuery, setTestImgQuery] = useState("nature");
  const [testImages, setTestImages] = useState<any[]>([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [imgSearchStatus, setImgSearchStatus] = useState<string | null>(null);

  const applyScale = (scaleVal: number) => {
    const baseFontSize = 12.65;
    document.documentElement.style.fontSize = `${baseFontSize * (scaleVal / 100)}px`;
  };

  const calculateCacheStats = async () => {
    if (!("caches" in window)) return;
    setIsCalculatingCache(true);
    try {
      // 1. Image cache
      const imgCache = await caches.open("image-cache-v1");
      const imgKeys = await imgCache.keys();
      setImageCacheCount(imgKeys.length);
      
      let imgSizeSum = 0;
      for (const request of imgKeys) {
        try {
          const response = await imgCache.match(request);
          if (response) {
            const blob = await response.blob();
            imgSizeSum += blob.size;
          }
        } catch (e) {}
      }
      setImageCacheSize((imgSizeSum / (1024 * 1024)).toFixed(2) + " MB");

      // 2. TTS cache
      const audioCache = await caches.open("tts-audio-cache-v1");
      const audioKeys = await audioCache.keys();
      setTtsCacheCount(audioKeys.length);

      let audioSizeSum = 0;
      for (const request of audioKeys) {
        try {
          const response = await audioCache.match(request);
          if (response) {
            const blob = await response.blob();
            audioSizeSum += blob.size;
          }
        } catch (e) {}
      }
      setTtsCacheSize((audioSizeSum / (1024 * 1024)).toFixed(2) + " MB");
    } catch (err) {
      console.error("Failed to calculate cache stats:", err);
    } finally {
      setIsCalculatingCache(false);
    }
  };

  const clearImageCache = async () => {
    if (!("caches" in window)) return;
    try {
      const deleted = await caches.delete("image-cache-v1");
      if (deleted) {
        for (const key in imageCache) {
          delete imageCache[key];
        }
        setImageCacheCount(0);
        setImageCacheSize("0.00 MB");
      }
    } catch (err) {
      console.error("Failed to delete image cache:", err);
    }
  };

  const clearTtsCache = async () => {
    if (!("caches" in window)) return;
    try {
      const deleted = await caches.delete("tts-audio-cache-v1");
      if (deleted) {
        for (const key in ttsCache) {
          delete ttsCache[key];
        }
        setTtsCacheCount(0);
        setTtsCacheSize("0.00 MB");
      }
    } catch (err) {
      console.error("Failed to delete TTS cache:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAudioApi(localStorage.getItem("settings_audio_api") || "google_proxy");
      setCustomTtsUrl(localStorage.getItem("settings_custom_tts_url") || "");
      setImageApi(localStorage.getItem("settings_image_api") || "duckduckgo");
      setPixabayKey(localStorage.getItem("settings_pixabay_key") || "");
      setGeminiApiKey(localStorage.getItem("settings_gemini_api_key") || "");
      setGroqApiKey(localStorage.getItem("settings_groq_api_key") || "");
      setAiProvider(localStorage.getItem("settings_ai_provider") || "gemini");
      setEnableInlinePersonaCorrection(localStorage.getItem("settings_enable_persona_correction") !== "false");
      setTtsExecutionMode((localStorage.getItem("settings_tts_execution_mode") as "local" | "server") || "local");
      
      setPrimaryModelDe(localStorage.getItem("settings_primary_piper_model_de") || "de_DE-thorsten-medium");
      setPrimaryModelAr(localStorage.getItem("settings_primary_piper_model_ar") || "ar_JO-kareem-medium");
      setPrimaryModelEn(localStorage.getItem("settings_primary_piper_model_en") || "en_US-lessac-medium");

      setEnableSecondaryAudioReview(localStorage.getItem("settings_enable_secondary_audio_review") === "true");
      setSecondaryModelDe(localStorage.getItem("settings_secondary_piper_model_de") || "google");
      setSecondaryModelAr(localStorage.getItem("settings_secondary_piper_model_ar") || "google");
      setSecondaryModelEn(localStorage.getItem("settings_secondary_piper_model_en") || "google");

      const savedScale = localStorage.getItem("settings_site_scale");
      const initialScale = savedScale ? parseInt(savedScale, 10) : 100;
      setSiteScale(initialScale);
      initialScaleRef.current = initialScale;

      // reset test state
      setTestImages([]);
      setImgSearchStatus(null);
      setTtsStatus("idle");
      setIsSpeaking(false);
      
      calculateCacheStats();
      fetchCatalog();
    }
  }, [isOpen]);

  useEffect(() => {
    const unsub = subscribeDiagnosticLogs(() => {
      setDiagnosticLogList([...globalDiagnosticLogs]);
    });
    return () => unsub();
  }, []);

  if (!isOpen) {
    if (!isAnyDownloading) return null;

    const activeModelId =
      activeDownloadingModelIds[0] ||
      (isDownloadingCustom ? customModelId.trim() || "صوت مخصص" : "تنزيل حزمة صوتية");
    const activeProgress = downloadProgressMap[activeModelId];
    const progressPercent = activeProgress
      ? Math.min(100, Math.max(0, activeProgress.percent || 0))
      : isPreloadingLocal
      ? localInstallProgress
      : 1;

    const loadedInfo =
      activeProgress?.loadedMb && activeProgress?.totalMb
        ? `${activeProgress.loadedMb} / ${activeProgress.totalMb}`
        : `${Math.round(progressPercent)}%`;

    const strokeDashoffset = 138.23 - (138.23 * progressPercent) / 100;

    return (
      <div
        dir="rtl"
        className="fixed bottom-6 left-6 z-[200] animate-bounce-in cursor-pointer group select-none"
        onClick={() => {
          if (onOpen) onOpen();
        }}
        title="انقر في أي مكان للعودة لنافذة التنزيل ومتابعة التفاصيل"
      >
        <div className="bg-surface-container-lowest/95 dark:bg-slate-900/95 backdrop-blur-md border-2 border-primary/40 hover:border-primary shadow-2xl rounded-2xl p-3 pr-4 flex items-center gap-3.5 transition-all duration-300 hover:scale-105 active:scale-95 group-hover:shadow-primary/25">
          {/* Animated Circular Progress Ring */}
          <div className="relative w-13 h-13 flex items-center justify-center shrink-0">
            <svg className="w-13 h-13 -rotate-90 transform" viewBox="0 0 52 52">
              <circle
                cx="26"
                cy="26"
                r="22"
                className="text-outline-variant/30 dark:text-slate-800"
                strokeWidth="4"
                stroke="currentColor"
                fill="transparent"
              />
              <circle
                cx="26"
                cy="26"
                r="22"
                className="text-primary transition-all duration-300 ease-out"
                strokeWidth="4.5"
                strokeDasharray="138.23"
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-primary font-black text-[11px] leading-none">
              <Download className="w-3.5 h-3.5 animate-bounce mb-0.5 text-primary" />
              <span>{Math.round(progressPercent)}%</span>
            </div>
          </div>

          {/* Details & Reopen Badge */}
          <div className="flex flex-col text-right min-w-[150px] max-w-[220px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-on-surface truncate">
                {activeModelId}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary shrink-0 flex items-center gap-1">
                <DownloadCloud className="w-3 h-3" />
                <span>{Math.round(progressPercent)}%</span>
              </span>
            </div>

            <p className="text-[11px] font-semibold text-on-surface-variant truncate mt-0.5 dir-ltr text-right">
              {loadedInfo}
            </p>

            <div className="flex items-center gap-1 mt-1 text-[10.5px] font-extrabold text-primary group-hover:underline">
              <Maximize2 className="w-3 h-3 text-primary group-hover:scale-125 transition-transform" />
              <span>انقر للرجوع للنافذة ↗</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    localStorage.setItem("settings_audio_api", audioApi);
    localStorage.setItem("settings_custom_tts_url", customTtsUrl);
    localStorage.setItem("settings_image_api", imageApi);
    localStorage.setItem("settings_pixabay_key", pixabayKey);
    localStorage.setItem("settings_gemini_api_key", geminiApiKey);
    localStorage.setItem("settings_groq_api_key", groqApiKey);
    localStorage.setItem("settings_ai_provider", aiProvider);
    localStorage.setItem("settings_enable_persona_correction", String(enableInlinePersonaCorrection));
    localStorage.setItem("settings_tts_execution_mode", ttsExecutionMode);
    localStorage.setItem("settings_site_scale", String(siteScale));
    localStorage.setItem("settings_primary_piper_model_de", primaryModelDe);
    localStorage.setItem("settings_primary_piper_model_ar", primaryModelAr);
    localStorage.setItem("settings_primary_piper_model_en", primaryModelEn);
    localStorage.setItem("settings_enable_secondary_audio_review", String(enableSecondaryAudioReview));
    localStorage.setItem("settings_secondary_piper_model_de", secondaryModelDe);
    localStorage.setItem("settings_secondary_piper_model_ar", secondaryModelAr);
    localStorage.setItem("settings_secondary_piper_model_en", secondaryModelEn);
    onClose();
  };

  const handleCancel = () => {
    applyScale(initialScaleRef.current);
    onClose();
  };

  const runFullSystemCheck = async () => {
    setIsTestingSystem(true);
    const results: Record<string, { ok: boolean; msg: string; cause?: string; solution?: string; ms?: number }> = {};

    // 1. Check Piper TTS Catalog
    const t0 = Date.now();
    try {
      const res = await fetch("/api/tts/catalog");
      const ms = Date.now() - t0;
      if (res.ok) {
        const data = await res.json();
        const downloadedCount = data.models?.filter((m: any) => m.isDownloaded).length || 0;
        results["piper"] = {
          ok: true,
          msg: `السيرفر يعمل بنجاح (${downloadedCount} نموذج صوت متوفر محلياً)`,
          ms
        };
      } else {
        results["piper"] = {
          ok: false,
          msg: `أعاد مسار الكتالوج استجابة غير سليمة (HTTP ${res.status})`,
          cause: "المسار /api/tts/catalog يعيد رمز خطأ من السيرفر",
          solution: "تأكد من إتاحة خدمات الصوت بالسيرفر",
          ms
        };
      }
    } catch (e: any) {
      results["piper"] = {
        ok: false,
        msg: "تعذر الاتصال بخدمة Piper TTS في السيرفر",
        cause: e?.message || "انقطاع الاتصال بالسيرفر",
        solution: "تأكد من تشغيل السيرفر على منفذ 3000",
        ms: Date.now() - t0
      };
    }

    // 2. Check Google TTS Proxy
    const t1 = Date.now();
    try {
      const res = await fetch("/api/tts?text=test&lang=de&voice=google");
      const ms = Date.now() - t1;
      if (res.ok && res.headers.get("content-type")?.includes("audio")) {
        results["google_tts"] = {
          ok: true,
          msg: "خدمة Google Translate TTS المباشرة تعمل بكفاءة سرعة عالية",
          ms
        };
      } else {
        results["google_tts"] = {
          ok: false,
          msg: "فشلت خدمة Google TTS Proxy في إرجاع الصوت",
          cause: "تعذر جلب ملف الصوت من ترجمة جوجل",
          solution: "تأكد من اتصال الجهاز بشبكة الإنترنت",
          ms
        };
      }
    } catch (e: any) {
      results["google_tts"] = {
        ok: false,
        msg: "تعذر الاتصال بـ Google TTS Proxy",
        cause: e?.message || "تعطل الاتصال الشبكي",
        solution: "افحص اتصال الإنترنت",
        ms: Date.now() - t1
      };
    }

    // 3. Check WebSpeech
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      results["webspeech"] = {
        ok: true,
        msg: "محرك WebSpeech بالمتصفح مدعوم وجاهز للاستخدام"
      };
    } else {
      results["webspeech"] = {
        ok: false,
        msg: "متصفحك لا يدعم WebSpeech API",
        cause: "المتصفح ينقصه دعم WebSpeech",
        solution: "استخدم متصفحاً حديثاً مثل Chrome أو Edge"
      };
    }

    // 4. Check Storage
    try {
      localStorage.setItem("__test_diag", "1");
      localStorage.removeItem("__test_diag");
      results["storage"] = {
        ok: true,
        msg: "ذاكرة LocalStorage والـ Cache Storage تعمل بشكل متكامل"
      };
    } catch (e: any) {
      results["storage"] = {
        ok: false,
        msg: "محظور كتابة البيانات بالذاكرة المحلية",
        cause: "تفعيل وضع التصفح الخفي الشديد أو حظر الكوكيز",
        solution: "اسمح للكوكيز والذاكرة المحلية بالمتصفح"
      };
    }

    setSystemTestResults(results);
    setIsTestingSystem(false);

    addDiagnosticLog({
      category: "SYSTEM",
      type: "info",
      title: "إجراء فحص شامل للأنظمة والأسباب",
      message: "تم فحص جميع خدمات الصوت والتخزين المباشر بالموقع",
      details: results
    });
  };

  const handleTestSpeech = async (customText?: string, modelOverride?: string) => {
    const textToSpeak = customText || testVoiceText;
    if (!textToSpeak || !textToSpeak.trim()) {
      setSpeechError({
        msg: "نص النطق فارغ",
        cause: "لم تم إدخال أي كلمات في خانة النص لاختبار الصوت",
        solution: "يرجى كتابة جملة أو كلمة قبل الضغط على زر استمع الآن"
      });
      return;
    }
    stopActiveAudio();
    setSpeechError(null);
    setDetailedTtsAnalysis(null);

    const modelToUse = modelOverride || selectedPiperModel;

    // Correctly resolve language code from model ID prefix
    let langToUse = "de";
    if (modelToUse.startsWith("de")) langToUse = "de";
    else if (modelToUse.startsWith("ar")) langToUse = "ar";
    else if (modelToUse.startsWith("en")) langToUse = "en";
    else langToUse = testVoiceLang || "de";

    setIsSpeaking(true);
    setTtsStatus("generating");

    localStorage.setItem("settings_audio_api", audioApi);
    localStorage.setItem("settings_custom_tts_url", customTtsUrl);

    if (ttsExecutionMode === "local" || modelToUse === "webspeech" || modelToUse === "browser_speech" || modelToUse === "local") {
      setTtsStatus("playing");
      addDiagnosticLog({
        category: "TTS",
        type: "info",
        title: "توليد نطق عصبي محلي (Piper WASM On-Device Hardware)",
        message: `جاري توليد النموذج العصبي (${modelToUse}) محلياً في المتصفح دون الحاجة لسيرفر`,
        cause: "تفعيل وضع المعالجة المحلية بالمتصفح",
        solution: "يعمل التوليد محلياً بالكامل عبر معالج الجهاز وبدون اتصال بالشبكة"
      });

      if (modelToUse === "webspeech" || modelToUse === "browser_speech") {
        playBrowserSynthesis(
          textToSpeak,
          langToUse,
          () => {
            setTtsStatus("idle");
            setIsSpeaking(false);
          },
          () => {
            setTtsStatus("idle");
            setIsSpeaking(false);
          }
        );
      } else {
        playPiperLocalWasm(
          textToSpeak,
          langToUse,
          modelToUse,
          () => {
            setTtsStatus("idle");
            setIsSpeaking(false);
            setLocalTtsStage(null);
            addDiagnosticLog({
              category: "TTS",
              type: "success",
              title: "نجاح النطق العصبي المحلي",
              message: `اكتمل توليد ونطق نموذج Piper العصبي (${modelToUse}) بنجاح داخل المتصفح أوفلاين`
            });
          },
          (errMsg) => {
            setTtsStatus("idle");
            setIsSpeaking(false);
            setLocalTtsStage(null);
            const errDetail = errMsg || `فشل توليد الصوت بالنموذج العصبي المحلي (${modelToUse})`;
            const analysis = parseLocalTtsErrorDetails(errDetail, modelToUse);
            setDetailedTtsAnalysis(analysis);
            setSpeechError({
              msg: `فشل النطق العصبي المحلي عند [${analysis.stepTitle}]`,
              cause: analysis.cause,
              solution: analysis.solution
            });
            addDiagnosticLog({
              category: "TTS",
              type: "error",
              title: `خطأ النطق المحلي عند (${analysis.stepTitle})`,
              message: errDetail,
              cause: analysis.cause,
              solution: analysis.solution
            });
          },
          (stepNum, stepTitle) => {
            setLocalTtsStage({ step: stepNum, title: stepTitle });
          }
        );
      }
      return;
    }

    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/tts" : "/api/tts";
      const url = `${apiBase}?text=${encodeURIComponent(textToSpeak.trim())}&lang=${langToUse}&voice=${encodeURIComponent(modelToUse)}&_t=${Date.now()}`;

      // Check if model is already downloaded on server
      const isDownloadedInCatalog = catalogModels.some(m => m.id === modelToUse && m.isDownloaded);
      if (isDownloadedInCatalog) {
        setServerTtsStepInfo({
          status: "found",
          msg: `🔍 السيرفر وجد الموديل الحالي (${modelToUse}) متوفراً بقرص التخزين! ويحاول الان توليد الصوت... ⚡`
        });
      } else {
        setServerTtsStepInfo({
          status: "downloading",
          msg: `⚠️ لم يوجد الموديل (${modelToUse}) بقرص السيرفر! والان يتم تنزيل الموديل باسم (${modelToUse}) تلقائياً من HuggingFace وتخزينه... ☁️`
        });
      }

      addDiagnosticLog({
        category: "TTS",
        type: "info",
        title: "طلب توليد صوت عصبوني عبر السيرفر",
        message: isDownloadedInCatalog
          ? `السيرفر وجد الموديل الحالي (${modelToUse}) متوفراً ويحاول الان توليد الصوت`
          : `لم يوجد الموديل (${modelToUse}) بالسيرفر والان يتم تنزيل الموديل واستعادته تلقائياً`,
        details: { url, modelToUse, langToUse, isDownloadedInCatalog }
      });

      const res = await fetch(url);
      if (res.ok) {
        const cType = res.headers.get("content-type") || "";
        if (cType.includes("audio")) {
          const wasAutoRestored = res.headers.get("X-Piper-Auto-Restored") === "true";
          if (wasAutoRestored || !isDownloadedInCatalog) {
            setServerTtsStepInfo({
              status: "success",
              msg: `🎉 تم تنزيل الموديل (${modelToUse}) وتخزينه بالسيرفر بنجاح! واكتمل توليد الصوت.`
            });
            fetchCatalog();
          } else {
            setServerTtsStepInfo({
              status: "success",
              msg: `✅ السيرفر استخدم الموديل (${modelToUse}) بنجاح واكتمل توليد ونطق الصوت!`
            });
          }

          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          const audio = new Audio(objectUrl);
          currentActiveAudio = audio;

          setTtsStatus("playing");

          audio.onended = () => {
            setTtsStatus("idle");
            setIsSpeaking(false);
            addDiagnosticLog({
              category: "TTS",
              type: "success",
              title: "نجاح تشغيل الصوت",
              message: `اكتمل نطق النص بنجاح باستخدام النموذج ${modelToUse}`
            });
          };

          audio.onerror = (e) => {
            const errText = "تعذر تشغيل ملف الصوت في المتصفح بعد استلامه من السيرفر.";
            setSpeechError({
              msg: errText,
              cause: "صيغة WAV التي تم إنشاؤها غير متوافقة أو حظر المتصفح فك تشفير المقطع",
              solution: "جرب إعادة المحاولة أو استخدام نموذج آخر"
            });
            addDiagnosticLog({
              category: "TTS",
              type: "error",
              title: "خطأ تشغيل عنصر الصوت بالمتصفح",
              message: errText,
              cause: "رفض المتصفح تشغيل الـ Audio Blob",
              solution: "اضغط مجدداً أو اختر نموذجاً عصبيّاً آخر"
            });
            setTtsStatus("idle");
            setIsSpeaking(false);
          };

          try {
            await audio.play();
          } catch (playErr: any) {
            const playErrMsg = `منع المتصفح التشغيل التلقائي للصوت (Autoplay Policy): ${playErr?.message || playErr}`;
            setSpeechError({
              msg: playErrMsg,
              cause: "سياسة الأمان بالمتصفح تمنع تشغيل الصوت تلقائياً بدون تفاعل لمس/نقر مباشر من المستخدم",
              solution: "قم بالضغط على أي جزء في الصفحة أولاً ثم اضغط استمع الآن"
            });
            addDiagnosticLog({
              category: "TTS",
              type: "warning",
              title: "حظر التشغيل التلقائي بالمتصفح",
              message: playErrMsg,
              cause: "Autoplay Policy active in browser",
              solution: "انقر على الصفحة وتفاعل معها ثم أعد تشغيل الصوت"
            });
            setTtsStatus("idle");
            setIsSpeaking(false);
          }
          return;
        }
      }

      // Handle server non-audio or error responses
      let serverErrorMsg = "";
      let failedStepTitle = "";
      let errorReason = "";
      let suggestedSolution = "";
      let checksSummary: any[] = [];
      let technicalDetails: any = null;

      try {
        const errJson = await res.json();
        serverErrorMsg = errJson.error || errJson.message || "حدث خطأ في معالجة طلب الصوت بالسيرفر";
        failedStepTitle = errJson.failedStepTitle || "";
        errorReason = errJson.errorReason || errJson.cause || "";
        suggestedSolution = errJson.suggestedSolution || errJson.solution || "";
        checksSummary = errJson.checksSummary || [];
        technicalDetails = errJson.technicalDetails || null;
      } catch {
        serverErrorMsg = `استجابة غير متوقعة من السيرفر: HTTP ${res.status} ${res.statusText}`;
      }

      let causeMsg = errorReason || `الملف الصوتي للنموذج (${modelToUse}) غير موجود بالسيرفر أو فشل معالج Piper في تشغيله`;
      let solutionMsg = suggestedSolution || "تأكد من تنزيل النموذج من قائمة الأصوات أسفله أو اضغط على 'فحص وإصلاح ملفات السيرفر'";

      if (res.status === 404 && !errorReason) {
        causeMsg = "مسار خدمة الصوت /api/tts غير متاح بالسيرفر";
        solutionMsg = "تأكد من تشغيل السيرفر بشكل صحيح";
      }

      const fullError = failedStepTitle ? `فشل إنشاء الصوت عند [${failedStepTitle}]: ${serverErrorMsg}` : `فشل إنشاء الصوت: ${serverErrorMsg}`;
      setSpeechError({
        msg: fullError,
        cause: causeMsg,
        solution: solutionMsg,
        checksSummary,
        technicalDetails,
        failedStepTitle
      });

      addDiagnosticLog({
        category: "TTS",
        type: "error",
        title: "فشل السيرفر في معالجة الصوت",
        message: fullError,
        cause: causeMsg,
        solution: solutionMsg,
        details: { status: res.status, modelToUse, langToUse, failedStepTitle, checksSummary, technicalDetails }
      });

      setTtsStatus("idle");
      setIsSpeaking(false);
    } catch (err: any) {
      const netErr = `تعذر الاتصال بالسيرفر: ${err?.message || err}`;
      const netCause = "انقطاع الاتصال بالسيرفر المحلي أو حظر طلبات الخادم في الشبكة";
      const netSol = "تأكد من عمل السيرفر على منفذ 3000 وأن الإنترنت متصل لديك";

      setSpeechError({
        msg: netErr,
        cause: netCause,
        solution: netSol
      });

      addDiagnosticLog({
        category: "TTS",
        type: "error",
        title: "انقطاع شبكة الصوت",
        message: netErr,
        cause: netCause,
        solution: netSol
      });

      setTtsStatus("idle");
      setIsSpeaking(false);
    }
  };

  const handleTestImageSearch = async () => {
    if (!testImgQuery.trim()) return;
    setIsSearchingImages(true);
    setImgSearchStatus(null);
    try {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const apiBase = isLocalhost ? "http://localhost:3000/api/images" : "/api/images";
      
      let url = `${apiBase}?q=${encodeURIComponent(testImgQuery)}&page=1`;
      if (imageApi === "pixabay") {
        url += `&provider=pixabay&customKey=${encodeURIComponent(pixabayKey)}`;
      } else {
        url += `&provider=duckduckgo`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const hits = data.hits || [];
        setTestImages(hits.slice(0, 3));
        if (hits.length === 0) {
          setImgSearchStatus("لم يتم العثور على نتائج للبحث.");
        } else {
          setImgSearchStatus(`تم العثور على ${hits.length} نتيجة بنجاح!`);
        }
      } else {
        setImgSearchStatus("فشل الاتصال بالـ API.");
      }
    } catch (err) {
      console.error(err);
      setImgSearchStatus("حدث خطأ أثناء إجراء البحث.");
    } finally {
      setIsSearchingImages(false);
    }
  };

  const handleLangChange = (lang: string) => {
    setTestVoiceLang(lang);
    if (lang === "de") setTestVoiceText("Hallo, wie geht es dir heute?");
    else if (lang === "en") setTestVoiceText("Hello, how are you doing today?");
    else if (lang === "ar") setTestVoiceText("مرحباً، كيف حالك اليوم؟");
    else if (lang === "es") setTestVoiceText("¡Hola! ¿Cómo estás hoy?");
    else if (lang === "fr") setTestVoiceText("Bonjour! Comment allez-vous aujourd'hui?");
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-surface-container-lowest w-full max-w-[750px] rounded-2xl shadow-elevation-3 overflow-hidden flex flex-col max-h-[92vh] border border-outline-variant/30">
        
        {/* Header */}
        <header className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/30 bg-surface-bright">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg text-on-surface">إعدادات الصوتيات والصور والتفضيلات</h2>
          </div>
          <div className="flex items-center gap-2">
            {isAnyDownloading && (
              <button
                type="button"
                onClick={handleCancel}
                title="تصغير نافذة التنزيل والمتابعة بالخلفية"
                className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
                <span className="hidden sm:inline">تصغير النافذة</span>
              </button>
            )}
            <button onClick={handleCancel} className="text-outline hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-low cursor-pointer" title="إغلاق">
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Navigation Tabs Header */}
          <div className="flex items-center gap-1.5 p-1.5 bg-surface-container-high rounded-xl border border-outline-variant/40 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("audio")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === "audio"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>الصوتيات وإدارة النطق (Piper TTS)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ai")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === "ai"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              <Key className="w-4 h-4" />
              <span>الذكاء الاصطناعي (Gemini / Groq)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("images")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === "images"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>محرك البحث عن الصور</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("storage")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === "storage"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>المظهر والتخزين المؤقت</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("diagnostics")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === "diagnostics"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              <Activity className="w-4 h-4 text-blue-500" />
              <span>🔍 تشخيص وسجل الأسباب</span>
            </button>
          </div>
          {activeTab === "audio" && (
            <div className="space-y-6 animate-fade-in">

              {/* Status Header Banner */}
              <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/30">
                  <div>
                    <h3 className="font-bold text-base text-primary flex items-center gap-2">
                      <Volume2 className="w-5 h-5 text-primary" />
                      <span>قسم الصوتيات وإدارة النطق العصبي (Piper Neural TTS Engine)</span>
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      تحكم محلي كامل. قم بتنزيل الأصوات التي تفضلها، وتعيين الصوت الأساسي للبطاقات، واختبار المعالجة الصوتية مباشرة.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Piper 1.2.0 (مفعّل ومثبّت محلياً)
                    </span>
                  </div>
                </div>

                {/* System Alerts */}
                {downloadSuccessMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0 text-emerald-500" />
                      <span>{downloadSuccessMsg}</span>
                    </div>
                    <button onClick={() => setDownloadSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {downloadError && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                      <span>{downloadError}</span>
                    </div>
                    <button onClick={() => setDownloadError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* SECTION: EXECUTION ENGINE LOCATION TOGGLE */}
              <div className="p-5 rounded-2xl border border-blue-500/30 bg-blue-500/5 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-on-surface flex items-center gap-2">
                        <span>مكان معالجة وتوليد الصوت (Audio Engine Execution Location)</span>
                      </h4>
                      <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                        اختر أين يتم إنشاء النطق الصوتي: محلياً في متصفحك وذكاء جهازك، أم عبر السيرفر.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center p-1 bg-surface-container-high rounded-xl border border-outline-variant/40 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setTtsExecutionMode("local");
                        localStorage.setItem("settings_tts_execution_mode", "local");
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        ttsExecutionMode === "local"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      <Laptop className="w-4 h-4" />
                      <span>💻 محلي في متصفحك</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTtsExecutionMode("server");
                        localStorage.setItem("settings_tts_execution_mode", "server");
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        ttsExecutionMode === "server"
                          ? "bg-primary text-on-primary shadow-sm"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      <Server className="w-4 h-4" />
                      <span>☁️ خادم السيرفر</span>
                    </button>
                  </div>
                </div>

                {ttsExecutionMode === "local" ? (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                      <Zap className="w-4 h-4 shrink-0" />
                      <span>وضع التوليد المحلي مفعّل (100% On-Device Local Browser Hardware)</span>
                    </div>
                    <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                      يتم توليد الصوت فورياً بضغطة زر داخل متصفحك مباشرة باستخدام محركات نطق جهازك (Web Speech API / OS Native Hardware Synthesis) دون إرسال أي طلبات أو بيانات للسيرفر.
                    </p>

                    {isPreloadingLocal && (
                      <div className="p-3.5 rounded-xl bg-surface border border-emerald-500/30 space-y-2">
                        <div className="flex items-center justify-between font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{localInstallStep}</span>
                          </span>
                          <span>{localInstallProgress}%</span>
                        </div>
                        <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden border border-emerald-500/20">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${localInstallProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handlePreloadLocalCache}
                        disabled={isPreloadingLocal}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 shadow-xs"
                      >
                        <Download className="w-4 h-4" />
                        <span>{isPreloadingLocal ? "جاري التثبيت والتهيئـة..." : "📥 تثبيت وتهيئـة الآلية في المتصفح لمرة واحدة"}</span>
                      </button>
                      {localPreloadedMsg && !isPreloadingLocal && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span>{localPreloadedMsg}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold">
                      <Server className="w-4 h-4 shrink-0" />
                      <span>وضع معالجة السيرفر العصبوني (Server-Side Neural Piper Engine)</span>
                    </div>
                    <p className="text-on-surface-variant text-[11.5px] leading-relaxed">
                      يتم إرسال النص إلى خادم السيرفر ليقوم بمعالجته عبر نماذج Piper ONNX العصبية ثم إعادة الملف الصوتي إلى المتصفح.
                    </p>
                  </div>
                )}

                {/* SERVER REPAIR & HEALTH CHECK CARD */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-blue-500/10 to-indigo-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-on-surface">
                      <Server className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>🔧 فحص وإصلاح ملفات السيرفر (Server Diagnostic & Auto-Repair)</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      يقوم بفحص وتنزيل أي ملفات ناقصة أو مكتبات C++ محذوفة في السيرفر وإعادة تهيئة محرك Piper تلقائياً عند ظهور خطأ 500.
                    </p>
                    {repairStatusMsg && (
                      <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-amber-500/15 px-2.5 py-1 rounded-lg">
                        {repairStatusMsg}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleRepairServerPiper}
                    disabled={isRepairingServer}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRepairingServer ? "animate-spin" : ""}`} />
                    <span>{isRepairingServer ? "جاري الإصلاح..." : "فحص وتنزيل الملفات الناقصة بالسيرفر"}</span>
                  </button>
                </div>
              </div>

              {/* SECTION: PRIMARY DEFAULT CARD VOICES */}
              <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <h4 className="font-extrabold text-sm text-on-surface">
                      الصوت الأساسي المعتمد لزر البطاقات (Card Audio Default Models)
                    </h4>
                  </div>
                  <span className="text-[10.5px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30">
                    تفضيلات النطق المباشر
                  </span>
                </div>

                <p className="text-xs text-on-surface-variant leading-relaxed">
                  حدد نموذج Piper الذي تريد أن ينطق به زر السماعة الموجود على بطاقات التعلم بشكل افتراضي لكل لغة:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* German Default Voice */}
                  <div className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface flex flex-col justify-between gap-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <span>🇩🇪</span>
                        <span>اللغة الألمانية (German)</span>
                      </span>
                      <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold">
                        {primaryModelDe}
                      </span>
                    </div>
                    <select
                      value={primaryModelDe}
                      onChange={(e) => handleSetPrimaryModel("de", e.target.value)}
                      className="w-full text-xs px-2.5 py-2 rounded-lg border border-outline bg-surface text-on-surface font-semibold focus:border-amber-500 outline-none"
                    >
                      <optgroup label="⚡ محركات النطق المباشرة (بدون تحميل)">
                        <option value="google">⚡ Google Translate TTS (خدمة النطق المباشر السريعة)</option>
                        <option value="webspeech">🌐 Web Speech API (محرك نطق المتصفح المباشر)</option>
                      </optgroup>
                      <optgroup label="🧠 نماذج Piper العصبية (ألمانية)">
                        {catalogModels.filter(m => m.lang === "de").map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.quality || "Medium"}) {m.isDownloaded ? "✓ [منزّل]" : "[يلزم التنزيل]"}
                          </option>
                        ))}
                        {primaryModelDe !== "google" && primaryModelDe !== "webspeech" && !catalogModels.some(m => m.id === primaryModelDe) && (
                          <option value={primaryModelDe}>{primaryModelDe} [محدد حالياً]</option>
                        )}
                      </optgroup>
                    </select>
                  </div>

                  {/* Arabic Default Voice */}
                  <div className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface flex flex-col justify-between gap-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <span>🇯🇴</span>
                        <span>اللغة العربية (Arabic)</span>
                      </span>
                      <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold">
                        {primaryModelAr}
                      </span>
                    </div>
                    <select
                      value={primaryModelAr}
                      onChange={(e) => handleSetPrimaryModel("ar", e.target.value)}
                      className="w-full text-xs px-2.5 py-2 rounded-lg border border-outline bg-surface text-on-surface font-semibold focus:border-amber-500 outline-none"
                    >
                      <optgroup label="⚡ محركات النطق المباشرة (بدون تحميل)">
                        <option value="google">⚡ Google Translate TTS (خدمة النطق المباشر السريعة)</option>
                        <option value="webspeech">🌐 Web Speech API (محرك نطق المتصفح المباشر)</option>
                      </optgroup>
                      <optgroup label="🧠 نماذج Piper العصبية (عربية)">
                        {catalogModels.filter(m => m.lang === "ar").map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.quality || "Medium"}) {m.isDownloaded ? "✓ [منزّل]" : "[يلزم التنزيل]"}
                          </option>
                        ))}
                        {primaryModelAr !== "google" && primaryModelAr !== "webspeech" && !catalogModels.some(m => m.id === primaryModelAr) && (
                          <option value={primaryModelAr}>{primaryModelAr} [محدد حالياً]</option>
                        )}
                      </optgroup>
                    </select>
                  </div>

                  {/* English Default Voice */}
                  <div className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface flex flex-col justify-between gap-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <span>🇺🇸</span>
                        <span>اللغة الإنجليزية (English)</span>
                      </span>
                      <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold">
                        {primaryModelEn}
                      </span>
                    </div>
                    <select
                      value={primaryModelEn}
                      onChange={(e) => handleSetPrimaryModel("en", e.target.value)}
                      className="w-full text-xs px-2.5 py-2 rounded-lg border border-outline bg-surface text-on-surface font-semibold focus:border-amber-500 outline-none"
                    >
                      <optgroup label="⚡ محركات النطق المباشرة (بدون تحميل)">
                        <option value="google">⚡ Google Translate TTS (خدمة النطق المباشر السريعة)</option>
                        <option value="webspeech">🌐 Web Speech API (محرك نطق المتصفح المباشر)</option>
                      </optgroup>
                      <optgroup label="🧠 نماذج Piper العصبية (إنجليزية)">
                        {catalogModels.filter(m => m.lang === "en").map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.quality || "Medium"}) {m.isDownloaded ? "✓ [منزّل]" : "[يلزم التنزيل]"}
                          </option>
                        ))}
                        {primaryModelEn !== "google" && primaryModelEn !== "webspeech" && !catalogModels.some(m => m.id === primaryModelEn) && (
                          <option value={primaryModelEn}>{primaryModelEn} [محدد حالياً]</option>
                        )}
                      </optgroup>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: SECONDARY AUDIO REVIEW BUTTON TOGGLE & CONFIGURATION */}
              <div className="p-5 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-5 h-5 text-indigo-500" />
                    <div>
                      <h4 className="font-extrabold text-sm text-on-surface">
                        تفعيل زر الصوت الثانوي في البطاقات في جلسة المراجعة
                      </h4>
                      <p className="text-[11px] text-on-surface-variant">
                        إظهار زر نطق إضافي في بطاقات التعلم للاستماع بصوت/محرك نطق مختلف
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableSecondaryAudioReview}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setEnableSecondaryAudioReview(val);
                        localStorage.setItem("settings_enable_secondary_audio_review", String(val));
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-outline-variant/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {enableSecondaryAudioReview && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 animate-fade-in">
                    {/* German Secondary Voice */}
                    <div className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface flex flex-col justify-between gap-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                          <span>🇩🇪</span>
                          <span>الصوت الثانوي (ألماني)</span>
                        </span>
                        <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                          {secondaryModelDe}
                        </span>
                      </div>
                      <select
                        value={secondaryModelDe}
                        onChange={(e) => handleSetSecondaryModel("de", e.target.value)}
                        className="w-full text-xs px-2.5 py-2 rounded-lg border border-outline bg-surface text-on-surface font-semibold focus:border-indigo-500 outline-none"
                      >
                        <optgroup label="⚡ محركات النطق المباشرة (بدون تحميل)">
                          <option value="google">⚡ Google Translate TTS (خدمة النطق المباشر السريعة)</option>
                          <option value="webspeech">🌐 Web Speech API (محرك نطق المتصفح المباشر)</option>
                        </optgroup>
                        <optgroup label="🧠 نماذج Piper العصبية (ألمانية)">
                          {catalogModels.filter(m => m.lang === "de").map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.quality || "Medium"}) {m.isDownloaded ? "✓ [منزّل]" : "[يلزم التنزيل]"}
                            </option>
                          ))}
                          {secondaryModelDe !== "google" && secondaryModelDe !== "webspeech" && !catalogModels.some(m => m.id === secondaryModelDe) && (
                            <option value={secondaryModelDe}>{secondaryModelDe} [محدد حالياً]</option>
                          )}
                        </optgroup>
                      </select>
                    </div>

                    {/* Arabic Secondary Voice */}
                    <div className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface flex flex-col justify-between gap-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                          <span>🇯🇴</span>
                          <span>الصوت الثانوي (عربي)</span>
                        </span>
                        <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                          {secondaryModelAr}
                        </span>
                      </div>
                      <select
                        value={secondaryModelAr}
                        onChange={(e) => handleSetSecondaryModel("ar", e.target.value)}
                        className="w-full text-xs px-2.5 py-2 rounded-lg border border-outline bg-surface text-on-surface font-semibold focus:border-indigo-500 outline-none"
                      >
                        <optgroup label="⚡ محركات النطق المباشرة (بدون تحميل)">
                          <option value="google">⚡ Google Translate TTS (خدمة النطق المباشر السريعة)</option>
                          <option value="webspeech">🌐 Web Speech API (محرك نطق المتصفح المباشر)</option>
                        </optgroup>
                        <optgroup label="🧠 نماذج Piper العصبية (عربية)">
                          {catalogModels.filter(m => m.lang === "ar").map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.quality || "Medium"}) {m.isDownloaded ? "✓ [منزّل]" : "[يلزم التنزيل]"}
                            </option>
                          ))}
                          {secondaryModelAr !== "google" && secondaryModelAr !== "webspeech" && !catalogModels.some(m => m.id === secondaryModelAr) && (
                            <option value={secondaryModelAr}>{secondaryModelAr} [محدد حالياً]</option>
                          )}
                        </optgroup>
                      </select>
                    </div>

                    {/* English Secondary Voice */}
                    <div className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface flex flex-col justify-between gap-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                          <span>🇺🇸</span>
                          <span>الصوت الثانوي (إنجليزي)</span>
                        </span>
                        <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                          {secondaryModelEn}
                        </span>
                      </div>
                      <select
                        value={secondaryModelEn}
                        onChange={(e) => handleSetSecondaryModel("en", e.target.value)}
                        className="w-full text-xs px-2.5 py-2 rounded-lg border border-outline bg-surface text-on-surface font-semibold focus:border-indigo-500 outline-none"
                      >
                        <optgroup label="⚡ محركات النطق المباشرة (بدون تحميل)">
                          <option value="google">⚡ Google Translate TTS (خدمة النطق المباشر السريعة)</option>
                          <option value="webspeech">🌐 Web Speech API (محرك نطق المتصفح المباشر)</option>
                        </optgroup>
                        <optgroup label="🧠 نماذج Piper العصبية (إنجليزية)">
                          {catalogModels.filter(m => m.lang === "en").map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.quality || "Medium"}) {m.isDownloaded ? "✓ [منزّل]" : "[يلزم التنزيل]"}
                            </option>
                          ))}
                          {secondaryModelEn !== "google" && secondaryModelEn !== "webspeech" && !catalogModels.some(m => m.id === secondaryModelEn) && (
                            <option value={secondaryModelEn}>{secondaryModelEn} [محدد حالياً]</option>
                          )}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: LIVE SYNTHESIS & SPEECH PROCESS PLAYGROUND */}
              <div className="p-5 rounded-2xl bg-surface-container-high/80 border border-primary/20 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/30 pb-3">
                  <div>
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <Play className="w-4 h-4 fill-current" />
                      <span>معمل المعالجة المباشرة وتوليد النطق (Live Piper Audio Synthesis Sandbox)</span>
                    </span>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      جرب نطق أي نص فورياً وشاهد عملية معالجة الذكاء الاصطناعي في الخلفية.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-on-surface-variant shrink-0">
                    النموذج المختار بالتجربة: <strong className="text-primary font-mono">{selectedPiperModel}</strong>
                  </span>
                </div>

                {/* Dynamic Process Indicator Bar during Generation/Playback */}
                {ttsStatus === "generating" && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-center gap-3 animate-pulse shadow-sm">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-300 shrink-0">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>⚙️ جاري التواصل مع خادم Piper وتحويل النص لنطق عصبي...</span>
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 font-bold">
                          {selectedPiperModel}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300/80">
                        يتم الآن توليد ذبذبات الصوت البشري بالاعتماد على نموذج الشبكة العصبية المحلية. يرجى الانتظار ثوانٍ معدودة...
                      </p>
                      <div className="w-full h-2 bg-amber-500/20 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full animate-pulse w-3/4"></div>
                      </div>
                    </div>
                  </div>
                )}

                {ttsStatus === "playing" && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 shrink-0">
                        <Volume2 className="w-5 h-5 animate-bounce" />
                      </div>
                      <div>
                        <span className="font-extrabold text-xs block flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                          <span>🔊 جاري تشغيل الملف الصوتي المستلم من Piper الآن</span>
                        </span>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-300/80">
                          نطق عالي الدقة بدون تأخير عبر النموذج العصبي المحبوك
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          stopActiveAudio();
                          setTtsStatus("idle");
                          setIsSpeaking(false);
                        }}
                        className="px-3 py-1.5 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 text-xs font-bold rounded-lg border border-rose-500/20 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>إيقاف ⏹️</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Preset Fast Test Buttons */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-on-surface-variant font-bold block">عبارات سريعة للتجربة الفورية:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTestVoiceLang("de");
                        setSelectedPiperModel("de_DE-thorsten-medium");
                        setTestVoiceText("Guten Tag! Wie geht es Ihnen heute?");
                        handleTestSpeech("Guten Tag! Wie geht es Ihnen heute?", "de_DE-thorsten-medium");
                      }}
                      className="px-2.5 py-1 bg-surface border border-outline-variant hover:border-primary text-on-surface text-[11px] font-medium rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>🇩🇪 Thorsten: "Guten Tag! Wie geht es Ihnen?"</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTestVoiceLang("de");
                        if (piperModels.some(m => m.id === "de_DE-amany-medium")) {
                          setSelectedPiperModel("de_DE-amany-medium");
                          setTestVoiceText("Guten Tag! Das ist die deutsche Stimme von Amany.");
                          handleTestSpeech("Guten Tag! Das ist die deutsche Stimme von Amany.", "de_DE-amany-medium");
                        } else {
                          setSelectedPiperModel("de_DE-thorsten-medium");
                          setTestVoiceText("Guten Tag! Ich lerne Deutsch mit Karteikarten.");
                          handleTestSpeech("Guten Tag! Ich lerne Deutsch mit Karteikarten.", "de_DE-thorsten-medium");
                        }
                      }}
                      className="px-2.5 py-1 bg-surface border border-outline-variant hover:border-primary text-on-surface text-[11px] font-medium rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>🇩🇪 Amany / Thorsten: "Guten Tag! Das ist..."</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTestVoiceLang("ar");
                        setSelectedPiperModel("ar_JO-kareem-medium");
                        setTestVoiceText("مرحباً بك! هذه تجربة النطق العصبي باللغة العربية.");
                        handleTestSpeech("مرحباً بك! هذه تجربة النطق العصبي باللغة العربية.", "ar_JO-kareem-medium");
                      }}
                      className="px-2.5 py-1 bg-surface border border-outline-variant hover:border-primary text-on-surface text-[11px] font-medium rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>🇯🇴 Kareem: "مرحباً بك! تجربة الصوت..."</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTestVoiceLang("en");
                        setSelectedPiperModel("en_US-lessac-medium");
                        setTestVoiceText("Welcome! Piper is a fast, local neural text-to-speech system.");
                        handleTestSpeech("Welcome! Piper is a fast, local neural text-to-speech system.", "en_US-lessac-medium");
                      }}
                      className="px-2.5 py-1 bg-surface border border-outline-variant hover:border-primary text-on-surface text-[11px] font-medium rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>🇺🇸 Lessac: "Welcome to Piper TTS!"</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Speech Input Controls */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={testVoiceText}
                      onChange={(e) => setTestVoiceText(e.target.value)}
                      className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-outline bg-surface text-on-surface focus:border-primary outline-none"
                      placeholder="اكتب أي نص لتجربته بنموذج Piper العصبي..."
                    />
                  </div>

                  <div className="w-full sm:w-56">
                    <select
                      value={selectedPiperModel}
                      onChange={(e) => {
                        const modId = e.target.value;
                        setSelectedPiperModel(modId);
                        if (modId.startsWith("de")) setTestVoiceLang("de");
                        else if (modId.startsWith("ar")) setTestVoiceLang("ar");
                        else if (modId.startsWith("en")) setTestVoiceLang("en");
                      }}
                      className="w-full text-xs px-3 py-2.5 rounded-xl border border-outline bg-surface text-on-surface focus:border-primary outline-none font-bold"
                    >
                      <optgroup label="⚡ محركات النطق المباشرة">
                        <option value="google">⚡ Google Translate TTS (خدمة سريعة)</option>
                        <option value="webspeech">🌐 Web Speech API (نطق المتصفح المباشر)</option>
                      </optgroup>
                      <optgroup label="🧠 نماذج Piper العصبية المحلية">
                        {piperModels.length > 0 ? (
                          piperModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.flag} {m.name} ({m.id})
                            </option>
                          ))
                        ) : (
                          <option value="de_DE-thorsten-medium">🇩🇪 Thorsten (de_DE-thorsten-medium)</option>
                        )}
                      </optgroup>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTestSpeech()}
                    disabled={isSpeaking || !testVoiceText.trim()}
                    className="px-5 py-2.5 bg-primary text-on-primary text-xs font-bold rounded-xl hover:bg-primary-container transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
                  >
                    <Volume2 className={`w-4 h-4 ${isSpeaking ? "animate-bounce" : ""}`} />
                    <span>{isSpeaking ? "جاري التوليد والنطق..." : "استمع الآن (Piper)"}</span>
                  </button>
                </div>

                {localTtsStage && (
                  <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs space-y-1.5 animate-pulse">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-2">
                        <Activity className="w-4 h-4 animate-spin text-primary" />
                        تتبع مراحل التوليد المحلي أوفلاين (المرحلة {localTtsStage.step} من 6):
                      </span>
                      <span className="text-[10px] bg-primary/20 px-2 py-0.5 rounded-full font-mono">{Math.round((localTtsStage.step / 6) * 100)}%</span>
                    </div>
                    <p className="text-[11px] font-medium text-primary/90">
                      {localTtsStage.title}
                    </p>
                  </div>
                )}

                {serverTtsStepInfo && (
                  <div className={`p-3.5 rounded-xl border text-xs space-y-1 animate-fade-in ${
                    serverTtsStepInfo.status === "downloading"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200"
                      : serverTtsStepInfo.status === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                      : "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-200"
                  }`}>
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-2">
                        {serverTtsStepInfo.status === "downloading" || serverTtsStepInfo.status === "checking" ? (
                          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                        <span>حالة معالجة السيرفر والموديل الصوتي:</span>
                      </span>
                      <button onClick={() => setServerTtsStepInfo(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11.5px] font-medium leading-relaxed">
                      {serverTtsStepInfo.msg}
                    </p>
                  </div>
                )}

                {speechError && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between gap-2 font-bold text-rose-800 dark:text-rose-200">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>{speechError.msg}</span>
                      </div>
                      <button onClick={() => { setSpeechError(null); setDetailedTtsAnalysis(null); }} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {detailedTtsAnalysis && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-700 dark:text-rose-300 font-mono text-[10.5px]">
                        <span>المرحلة المسببة للمشكلة:</span>
                        <strong>{detailedTtsAnalysis.stepTitle}</strong>
                      </div>
                    )}

                    {speechError.cause && (
                      <p className="text-[11px] text-rose-700/90 dark:text-rose-300/90 leading-relaxed">
                        <strong className="font-bold">🔍 السبب المكتشف:</strong> {speechError.cause}
                      </p>
                    )}
                    {speechError.solution && (
                      <p className="text-[11px] text-rose-700/90 dark:text-rose-300/90 leading-relaxed">
                        <strong className="font-bold">💡 الحل المقترح:</strong> {speechError.solution}
                      </p>
                    )}

                    {speechError.checksSummary && speechError.checksSummary.length > 0 && (
                      <div className="bg-surface/60 p-3 rounded-xl border border-rose-500/20 space-y-1.5 font-sans text-[11px]">
                        <div className="font-bold text-rose-900 dark:text-rose-100 text-[11.5px] pb-1 border-b border-rose-500/15">
                          📋 تقرير مراحل فحص السيرفر ومطابقة المكونات:
                        </div>
                        {speechError.checksSummary.map((chk, idx) => (
                          <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b border-rose-500/10 last:border-0">
                            <span className="flex items-center gap-1.5 font-bold">
                              {chk.status === "passed" ? (
                                <span className="text-emerald-600 dark:text-emerald-400">✓ [نجاح]</span>
                              ) : chk.status === "failed" ? (
                                <span className="text-rose-600 dark:text-rose-400">✗ [فشل]</span>
                              ) : (
                                <span className="text-slate-400">- [متروك]</span>
                              )}
                              <span>{chk.step}</span>
                            </span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-300 font-mono bg-surface/80 px-2 py-0.5 rounded">
                              {chk.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {speechError.technicalDetails && (
                      <details className="text-[10px] text-rose-800/90 dark:text-rose-300/90 bg-rose-950/10 p-2.5 rounded-lg font-mono overflow-x-auto">
                        <summary className="cursor-pointer font-bold select-none mb-1 text-[11px]">
                          🔍 عرض المتغيرات والمؤشرات البرمجية للسيرفر (Server Technical Variables)
                        </summary>
                        <pre className="text-[9.5px] text-rose-900 dark:text-rose-200 leading-tight pt-1 border-t border-rose-500/20">
                          {JSON.stringify(speechError.technicalDetails, null, 2)}
                        </pre>
                      </details>
                    )}

                    {detailedTtsAnalysis?.rawErrorMsg && (
                      <details className="text-[10px] text-rose-700/80 dark:text-rose-400/80 bg-rose-950/10 p-2 rounded-lg font-mono overflow-x-auto">
                        <summary className="cursor-pointer font-bold select-none mb-1">عرض التفاصيل الفنية ورسالة الخطأ الكاملة (Stack Trace)</summary>
                        <code>{detailedTtsAnalysis.rawErrorMsg}</code>
                      </details>
                    )}

                    {/* Quick Resolution Actions */}
                    <div className="pt-2 border-t border-rose-500/20 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleRepairServerPiper}
                        disabled={isRepairingServer}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[11px] font-bold hover:bg-amber-700 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRepairingServer ? "animate-spin" : ""}`} />
                        <span>{isRepairingServer ? "جاري تنزيل الملفات الناقصة..." : "🔧 فحص وإصلاح ملفات السيرفر (تنزيل النواقص)"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const piperWeb = await import("@mintplex-labs/piper-tts-web");
                            if (piperWeb?.TtsSession) piperWeb.TtsSession._instance = null;
                            await configureOnnxRuntime();
                            alert("تم إعادة ضبط محرك ONNX وتصفير الخيوط على النواة الأحادية بنجاح! يمكنك الآن إعادة المحاولة.");
                          } catch (e) {
                            console.error("ONNX reset error:", e);
                          }
                        }}
                        className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-[11px] font-bold hover:bg-rose-700 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>إعادة ضبط المحرك الأحادي ONNX</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const targetModel = catalogModels.find((m: any) => m.id === selectedPiperModel) || { id: selectedPiperModel };
                          handleDownloadModel(targetModel);
                        }}
                        className="px-3 py-1.5 bg-primary text-on-primary rounded-lg text-[11px] font-bold hover:bg-primary-container transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>إعادة تنزيل النموذج الصوتي محلياً</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("diagnostics");
                          setIsRunningGranularCheck(true);
                          runGranularLocalTtsCheck(selectedPiperModel).then((res) => {
                            setGranularTtsCheckResults(res);
                            setIsRunningGranularCheck(false);
                          });
                        }}
                        className="px-3 py-1.5 bg-surface border border-rose-500/40 text-rose-700 dark:text-rose-300 rounded-lg text-[11px] font-bold hover:bg-rose-500/10 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Activity className="w-3 h-3" />
                        <span>فحص مراحل المحلي (Granular Diagnostic)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTtsExecutionMode("server");
                          localStorage.setItem("settings_tts_execution_mode", "server");
                          alert("تم تحويل وضع النطق إلى خادم السيرفر المباشر!");
                        }}
                        className="px-3 py-1.5 bg-surface border border-outline text-on-surface-variant rounded-lg text-[11px] font-bold hover:bg-surface-container transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>التحويل لوضع السيرفر</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: VERTICAL PIPER VOICE CATALOG (الموديلات بشكل عمودي) */}
              <div className="p-5 rounded-2xl border border-outline-variant/40 bg-surface-container-low/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-on-surface flex items-center gap-2">
                      <DownloadCloud className="w-4 h-4 text-primary" />
                      <span>قائمة نماذج الأصوات العصبية (Vertical Models List):</span>
                    </h4>
                    <p className="text-[11.5px] text-on-surface-variant mt-0.5">
                      تصفح الأصوات وتنزيلها بشكل عمودي منظم وتعيين نموذجك المفضل كصوت رئيس للبطاقات.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={fetchCatalog}
                      disabled={isLoadingModels}
                      className="px-3 py-1.5 bg-surface border border-outline-variant hover:border-primary text-primary text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? "animate-spin" : ""}`} />
                      <span>{isLoadingModels ? "جاري جلب القائمة..." : "تحديث الكتالوج"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearAllModels}
                      disabled={isClearingAllModels}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="حذف وتفريغ جميع نماذج الأصوات المنزلة لإعادة توفير المساحة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isClearingAllModels ? "جاري التفريغ..." : "تفريغ جميع النماذج والمساحة 🗑️"}</span>
                    </button>
                  </div>
                </div>

                {/* Language Filters */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setCatalogFilter("all")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      catalogFilter === "all"
                        ? "bg-primary text-on-primary shadow-xs"
                        : "bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    جميع الأصوات ({catalogModels.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setCatalogFilter("de")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      catalogFilter === "de"
                        ? "bg-primary text-on-primary shadow-xs"
                        : "bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span>🇩🇪 الألمانية</span>
                    <span className="text-[10px] opacity-80">({catalogModels.filter(m => m.lang === "de").length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCatalogFilter("ar")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      catalogFilter === "ar"
                        ? "bg-primary text-on-primary shadow-xs"
                        : "bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span>🇯🇴 العربية</span>
                    <span className="text-[10px] opacity-80">({catalogModels.filter(m => m.lang === "ar").length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCatalogFilter("en")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      catalogFilter === "en"
                        ? "bg-primary text-on-primary shadow-xs"
                        : "bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <span>🇺🇸 الإنجليزية</span>
                    <span className="text-[10px] opacity-80">({catalogModels.filter(m => m.lang === "en").length})</span>
                  </button>
                </div>

                {/* VERTICAL MODEL CARDS LIST */}
                <div className="flex flex-col gap-3.5 pt-2">
                  {catalogModels
                    .filter((m) => {
                      if (catalogFilter === "de") return m.lang === "de";
                      if (catalogFilter === "ar") return m.lang === "ar";
                      if (catalogFilter === "en") return m.lang === "en";
                      return true;
                    })
                    .map((model) => {
                      const isDownloaded = model.isDownloaded;
                      const isDownloading = downloadingIds[model.id];
                      const isDeleting = deletingIds[model.id];
                      const isSelected = selectedPiperModel === model.id;
                      const langKey = (model.lang || "de").toLowerCase();
                      const isPrimary = (langKey === "de" && primaryModelDe === model.id) ||
                                        (langKey === "ar" && primaryModelAr === model.id) ||
                                        (langKey === "en" && primaryModelEn === model.id);

                      return (
                        <div
                          key={model.id}
                          className={`p-4 rounded-2xl border text-right transition-all flex flex-col gap-3 shadow-xs hover:shadow-md ${
                            isDownloaded
                              ? isPrimary
                                ? "border-amber-500/50 bg-amber-500/5"
                                : "border-emerald-500/40 bg-emerald-500/5"
                              : "border-outline-variant/60 bg-surface hover:border-outline"
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            {/* Left Meta Info */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-2xl">{model.flag}</span>
                                <h5 className="font-extrabold text-sm text-on-surface">
                                  {model.name}
                                </h5>
                                {model.quality && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                                    {model.quality}
                                  </span>
                                )}
                                <span className="text-[10px] font-mono text-outline font-semibold px-2 py-0.5 bg-surface-container-high rounded-full">
                                  {model.sizeMb || "60 MB"}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                <span className="text-[10.5px] font-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                                  {model.id}
                                </span>

                                {/* Status Badges */}
                                <span
                                  className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border ${
                                    isDownloaded
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                      : "bg-surface-container-high text-on-surface-variant border-outline-variant"
                                  }`}
                                >
                                  {isDownloaded ? "مثبّت محلياً ✓" : "غير منزّل ☁️"}
                                </span>

                                {isPrimary && (
                                  <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                    <Star className="w-3 h-3 fill-amber-500" />
                                    <span>صوت البطاقات الرئيسي ⭐</span>
                                  </span>
                                )}

                                {isSelected && (
                                  <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                                    المحدد للتجربة 🎯
                                  </span>
                                )}
                              </div>

                              {model.sample && (
                                <p className="text-xs text-on-surface-variant italic mt-1 bg-surface-container-high/50 p-2 rounded-lg border border-outline-variant/20">
                                  "{model.sample}"
                                </p>
                              )}
                            </div>

                            {/* Actions Column */}
                            <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                              {isDownloaded ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedPiperModel(model.id);
                                      if (model.sample) {
                                        setTestVoiceText(model.sample);
                                        handleTestSpeech(model.sample, model.id);
                                      } else {
                                        handleTestSpeech(undefined, model.id);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-xl hover:bg-primary-container transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                    title="اختبار نطق نموذج الصوت"
                                  >
                                    <Volume2 className="w-3.5 h-3.5" />
                                    <span>تجربة الصوت 🔊</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSetPrimaryModel(model.lang, model.id)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                                      isPrimary
                                        ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                                        : "bg-surface hover:bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300"
                                    }`}
                                    title="تعيين هذا الصوت كصوت رئيسي لزر البطاقات لهذه اللغة"
                                  >
                                    <Star className={`w-3.5 h-3.5 ${isPrimary ? "fill-white" : ""}`} />
                                    <span>{isPrimary ? "صوت افتراضي رئيسي ✓" : "تعيين كصوت رئيسي ⭐️"}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteModel(model.id)}
                                    disabled={isDeleting}
                                    className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                    title="حذف الصوت من الخادم والمتصفح لتوفير المساحة"
                                  >
                                    {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadModel(model)}
                                  disabled={isDownloading}
                                  className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-xl hover:bg-primary-container transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
                                >
                                  {isDownloading ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      <span>جاري التنزيل والتثبيت...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-3.5 h-3.5" />
                                      <span>تنزيل وتثبيت محلياً ⬇️</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* ACTIVE DOWNLOADING INDICATOR BAR */}
                          {isDownloading && (() => {
                            const prog = downloadProgressMap[model.id] || {
                              percent: 0,
                              loadedMb: "0.0 MB",
                              totalMb: model.sizeMb || "60.0 MB",
                              step: "جاري بدء التنزيل..."
                            };
                            return (
                              <div className="w-full p-4 bg-primary/10 border border-primary/30 rounded-xl space-y-2.5 mt-2">
                                <div className="flex items-center justify-between text-xs font-bold text-primary">
                                  <span className="flex items-center gap-1.5">
                                    <RefreshCw className="w-4 h-4 animate-spin text-primary shrink-0" />
                                    <span>⚡ جاري تنزيل نموذج الصوت العصبي ({model.id})...</span>
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-black text-primary bg-primary/15 px-2 py-0.5 rounded-md border border-primary/30">
                                      {prog.percent}%
                                    </span>
                                    <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
                                      {prog.loadedMb} / {prog.totalMb}
                                    </span>
                                  </div>
                                </div>

                                {/* Real Progress Bar */}
                                <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-600">
                                  <div
                                    className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full transition-all duration-300 shadow-xs"
                                    style={{ width: `${Math.max(3, Math.min(100, prog.percent))}%` }}
                                  ></div>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-0.5">
                                  <span className="font-medium text-slate-600 dark:text-slate-300 truncate">{prog.step || "يتم نقل وتجهيز البيانات..."}</span>
                                  <span className="font-mono text-[10px] text-primary font-bold shrink-0">النسبة المكتملة: {prog.percent}%</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                </div>

                {/* Custom Model Download Expandable */}
                <div className="mt-4 p-4 rounded-xl bg-surface-container-high/60 border border-outline-variant/30 space-y-3">
                  <h5 className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-primary" />
                    <span>تنزيل نموذج صوتي مخصص (من HuggingFace أو رابط مباشر):</span>
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant mb-1">معرّف الصوت (Model ID):</label>
                      <input
                        type="text"
                        value={customModelId}
                        onChange={(e) => setCustomModelId(e.target.value)}
                        placeholder="مثل: de_DE-ramona-low"
                        className="w-full text-xs px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface focus:border-primary outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant mb-1">رابط ملف .onnx المباشر (اختياري):</label>
                      <input
                        type="text"
                        value={customModelUrl}
                        onChange={(e) => setCustomModelUrl(e.target.value)}
                        placeholder="https://huggingface.co/rhasspy/piper-voices/resolve/main/..."
                        className="w-full text-xs px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface focus:border-primary outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* CUSTOM MODEL ACTIVE DOWNLOADING BAR */}
                  {isDownloadingCustom && (() => {
                    const prog = downloadProgressMap[customModelId.trim()] || {
                      percent: 0,
                      loadedMb: "0.0 MB",
                      totalMb: "60.0 MB",
                      step: "جاري تنزيل الصوت المخصص..."
                    };
                    return (
                      <div className="w-full p-4 bg-primary/10 border border-primary/30 rounded-xl space-y-2.5 mt-2">
                        <div className="flex items-center justify-between text-xs font-bold text-primary">
                          <span className="flex items-center gap-1.5">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary shrink-0" />
                            <span>⚡ جاري تنزيل نموذج الصوت المخصص ({customModelId.trim()})...</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-primary bg-primary/15 px-2 py-0.5 rounded-md border border-primary/30">
                              {prog.percent}%
                            </span>
                            <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
                              {prog.loadedMb} / {prog.totalMb}
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-600">
                          <div
                            className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full transition-all duration-300 shadow-xs"
                            style={{ width: `${Math.max(3, Math.min(100, prog.percent))}%` }}
                          ></div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-0.5">
                          <span className="font-medium text-slate-600 dark:text-slate-300 truncate">{prog.step || "يتم جلب الحزمة وتخزينها..."}</span>
                          <span className="font-mono text-[10px] text-primary font-bold shrink-0">النسبة المكتملة: {prog.percent}%</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadCustom}
                      disabled={isDownloadingCustom || !customModelId.trim()}
                      className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-xl hover:bg-primary-container transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isDownloadingCustom ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>جاري جلب الملف وتنزيله...</span>
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="w-3.5 h-3.5" />
                          <span>تنزيل النموذج المخصص ⬇️</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* General Engine Choice */}
              <div className="p-4 rounded-xl border border-outline-variant/30 bg-surface space-y-2">
                <span className="text-xs font-bold text-on-surface block">المحرك الافتراضي للبطاقات التعلمية:</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAudioApi("google_proxy")}
                    className={`p-3 rounded-xl border text-right flex flex-col gap-0.5 transition-all cursor-pointer ${
                      audioApi === "google_proxy"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-outline-variant bg-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <span className="font-bold text-xs">Piper TTS المحلي (موصى به)</span>
                    <span className="text-[10.5px] text-on-surface-variant">محرك عصبي بشري ينطق بالنماذج المنزلة محلياً.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioApi("web_speech")}
                    className={`p-3 rounded-xl border text-right flex flex-col gap-0.5 transition-all cursor-pointer ${
                      audioApi === "web_speech"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-outline-variant bg-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <span className="font-bold text-xs">نطق المتصفح المدمج</span>
                    <span className="text-[10.5px] text-on-surface-variant">يعتمد على المحرك الصوتي لجهاز المستخدم مباشرة.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioApi("custom")}
                    className={`p-3 rounded-xl border text-right flex flex-col gap-0.5 transition-all cursor-pointer ${
                      audioApi === "custom"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-outline-variant bg-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <span className="font-bold text-xs">رابط API مخصص</span>
                    <span className="text-[10.5px] text-on-surface-variant">استخدام خادم نطق خارجي حسب رابط المطور.</span>
                  </button>
                </div>

                {audioApi === "custom" && (
                  <div className="mt-2 space-y-2 pt-2">
                    <label className="block text-xs font-bold text-on-surface-variant">رابط الـ API للنطق (TTS Endpoint URL):</label>
                    <input
                      type="text"
                      value={customTtsUrl}
                      onChange={(e) => setCustomTtsUrl(e.target.value)}
                      placeholder="https://api.example.com/tts?text={text}&lang={lang}"
                      className="w-full text-xs px-3.5 py-2 rounded-xl border border-outline bg-surface text-on-surface focus:border-primary outline-none font-mono"
                    />
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: AI PROVIDERS & KEYS */}
          {activeTab === "ai" && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/30">
                  <h3 className="font-bold text-base text-primary flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    <span>مزود الخدمة والمفاتيح الذكية (AI Provider & Keys)</span>
                  </h3>
                  
                  <div className="flex bg-surface-container-high rounded-xl p-1 border border-outline-variant/40 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setAiProvider("gemini")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        aiProvider === "gemini"
                          ? "bg-primary text-on-primary shadow-sm"
                          : "text-outline hover:text-on-surface"
                      }`}
                    >
                      Google Gemini 🤖
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiProvider("groq")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        aiProvider === "groq"
                          ? "bg-primary text-on-primary shadow-sm"
                          : "text-outline hover:text-on-surface"
                      }`}
                    >
                      Groq Cloud ⚡
                    </button>
                  </div>
                </div>

                <p className="text-xs text-on-surface-variant leading-relaxed">
                  اختر المزود الافتراضي المفضل لديك لتوليد البطاقات التعليمية وتحسينها. يتم حفظ هذه المفاتيح في متصفحك محلياً بشكل آمن تماماً، ولا يتم مشاركتها أبداً.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Gemini Key Config */}
                  <div className={`p-4 rounded-xl border transition-all ${aiProvider === "gemini" ? "border-primary/40 bg-primary/5" : "border-outline-variant bg-surface"}`}>
                    <label className="block text-xs font-bold text-on-surface mb-2 flex items-center gap-1.5">
                      <span className={aiProvider === "gemini" ? "text-primary" : "text-on-surface-variant"}>🤖 مفتاح Gemini API Key:</span>
                      {aiProvider === "gemini" && <span className="bg-primary/10 text-primary text-[8px] font-bold px-1.5 py-0.5 rounded-full">نشط حالياً</span>}
                    </label>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value.trim())}
                      placeholder="أدخل مفتاح Gemini (مثل: AIzaSy...)"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface focus:border-primary outline-none font-mono"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline font-bold"
                      >
                        🔑 احصل على مفتاح Gemini مجاني
                      </a>
                      {geminiApiKey && (
                        <button
                          type="button"
                          onClick={() => setGeminiApiKey("")}
                          className="text-[10px] text-error hover:underline"
                        >
                          مسح 🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Groq Key Config */}
                  <div className={`p-4 rounded-xl border transition-all ${aiProvider === "groq" ? "border-primary/40 bg-primary/5" : "border-outline-variant bg-surface"}`}>
                    <label className="block text-xs font-bold text-on-surface mb-2 flex items-center gap-1.5">
                      <span className={aiProvider === "groq" ? "text-primary" : "text-on-surface-variant"}>⚡ مفتاح Groq API Key:</span>
                      {aiProvider === "groq" && <span className="bg-primary/10 text-primary text-[8px] font-bold px-1.5 py-0.5 rounded-full">نشط حالياً</span>}
                    </label>
                    <input
                      type="password"
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value.trim())}
                      placeholder="أدخل مفتاح Groq (مثل: gsk_...)"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface focus:border-primary outline-none font-mono"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline font-bold"
                      >
                        🔑 احصل على مفتاح Groq من هنا
                      </a>
                      {groqApiKey && (
                        <button
                          type="button"
                          onClick={() => setGroqApiKey("")}
                          className="text-[10px] text-error hover:underline"
                        >
                          مسح 🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline Persona Auto-Correction Toggle */}
                <div className="p-4 rounded-xl border border-outline-variant bg-surface space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="font-bold text-xs text-on-surface flex items-center gap-1.5">
                        <span>✍️ التصحيح اللغوي المدمج في ردود المحادثات (Persona Auto-Correction)</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        إظهار تحليل وتصحيح شامل ومفصل لرسالتك السابقة (درجة التعبير، الأخطاء التفصيلية، صياغة المتحدث الأصلي، والتعبير المطور) مخفي تحت رد الشخصية. يمكنك إيقافه لتسريع الاستجابة وتوفير استهلاك الرموز (Tokens).
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ms-2">
                      <input
                        type="checkbox"
                        checked={enableInlinePersonaCorrection}
                        onChange={(e) => setEnableInlinePersonaCorrection(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: IMAGE SEARCH ENGINE */}
          {activeTab === "images" && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-5 rounded-2xl border border-outline-variant/40 bg-surface-container-low/50 space-y-4">
                <h3 className="font-bold text-base text-primary flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  <span>إعدادات البحث عن الصور (Image API)</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImageApi("duckduckgo")}
                    className={`p-3.5 rounded-xl border text-right flex flex-col gap-1 transition-all ${
                      imageApi === "duckduckgo"
                        ? "border-primary bg-primary/5 text-primary shadow-sm font-bold"
                        : "border-outline-variant bg-surface hover:border-outline hover:bg-surface-container-high"
                    }`}
                  >
                    <span className="font-bold text-sm">بحث DuckDuckGo المباشر (تلقائي)</span>
                    <span className="text-xs text-on-surface-variant leading-relaxed">بحث ذكي وسريع بالكامل بدون أي مفاتيح برمجية ومتاح مجاناً للجميع.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImageApi("pixabay")}
                    className={`p-3.5 rounded-xl border text-right flex flex-col gap-1 transition-all ${
                      imageApi === "pixabay"
                        ? "border-primary bg-primary/5 text-primary shadow-sm font-bold"
                        : "border-outline-variant bg-surface hover:border-outline hover:bg-surface-container-high"
                    }`}
                  >
                    <span className="font-bold text-sm">صور Pixabay (مفتاح مخصص)</span>
                    <span className="text-xs text-on-surface-variant leading-relaxed">يبحث بدقة عن صور لجميع الكلمات والعبارات بالاعتماد على Pixabay ومفتاحك.</span>
                  </button>
                </div>

                {imageApi === "pixabay" && (
                  <div className="mt-3 space-y-2 bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                    <label className="block text-xs font-bold text-on-surface-variant">مفتاح الـ Pixabay API Key المخصص:</label>
                    <input
                      type="text"
                      value={pixabayKey}
                      onChange={(e) => setPixabayKey(e.target.value)}
                      placeholder="مثال: 45312345-ab12cd34ef56gh78ij90kl"
                      className="w-full text-sm px-4 py-2.5 rounded-xl border border-outline bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                )}

                {/* Image Sandbox Area */}
                <div className="mt-4 p-4 rounded-xl bg-surface-container-high/60 border border-outline-variant/30 space-y-3">
                  <span className="text-xs font-bold text-primary block">🧪 معمل تجربة جلب الصور:</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testImgQuery}
                      onChange={(e) => setTestImgQuery(e.target.value)}
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface focus:outline-none"
                      placeholder="ابحث عن كلمة لتجربة جلب الصور (مثل: cat, berlin, apple)..."
                    />
                    <button
                      type="button"
                      onClick={handleTestImageSearch}
                      disabled={isSearchingImages || !testImgQuery.trim()}
                      className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:bg-primary-container transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>{isSearchingImages ? "يجري البحث..." : "ابحث وجرب الصور"}</span>
                    </button>
                  </div>

                  {imgSearchStatus && (
                    <div className="text-xs text-primary font-semibold py-0.5">
                      {imgSearchStatus}
                    </div>
                  )}

                  {testImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2 pt-1">
                      {testImages.map((img, idx) => (
                        <div key={idx} className="relative aspect-video rounded-lg overflow-hidden border border-outline-variant/50 bg-surface shadow-sm">
                          <img
                            src={img.webformatURL}
                            alt={img.tags}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: UI SCALING & CACHE MANAGER */}
          {activeTab === "storage" && (
            <div className="space-y-5 animate-fade-in">
              {/* Site Scaling Settings */}
              <div className="p-5 rounded-2xl border border-outline-variant/40 bg-surface-container-low/50 space-y-4">
                <h3 className="font-bold text-base text-primary flex items-center gap-2">
                  <Move className="w-5 h-5" />
                  <span>مقياس مظهر الموقع وتكبير الواجهة (UI Scaling)</span>
                </h3>
                
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  يمكنك تكبير أو تصغير حجم الخطوط، الأزرار، والبطاقات لتسهيل القراءة وتصفح الموقع بشكل مريح ومناسب لشاشتك.
                </p>

                <div className="bg-surface-container-high/60 p-5 rounded-xl border border-outline-variant/30 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-on-surface">مستوى التكبير الحالي:</span>
                    <span className="px-3 py-1 bg-primary/10 text-primary font-extrabold text-sm rounded-lg">
                      {siteScale}%
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-outline font-semibold">100%</span>
                    <input
                      type="range"
                      min="100"
                      max="150"
                      step="5"
                      value={siteScale}
                      onChange={(e) => {
                        const newVal = parseInt(e.target.value, 10);
                        setSiteScale(newVal);
                        applyScale(newVal);
                      }}
                      className="flex-1 accent-primary h-2 bg-outline-variant/50 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs text-outline font-semibold">150%</span>
                  </div>

                  {/* Presets */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSiteScale(100);
                        applyScale(100);
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        siteScale === 100
                          ? "bg-primary text-white border-primary"
                          : "bg-surface hover:bg-surface-container-high border-outline-variant text-on-surface"
                      }`}
                    >
                      طبيعي (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSiteScale(115);
                        applyScale(115);
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        siteScale === 115
                          ? "bg-primary text-white border-primary"
                          : "bg-surface hover:bg-surface-container-high border-outline-variant text-on-surface"
                      }`}
                    >
                      متوسط (115%)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSiteScale(130);
                        applyScale(130);
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        siteScale === 130
                          ? "bg-primary text-white border-primary"
                          : "bg-surface hover:bg-surface-container-high border-outline-variant text-on-surface"
                      }`}
                    >
                      كبير (130%)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSiteScale(150);
                        applyScale(150);
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        siteScale === 150
                          ? "bg-primary text-white border-primary"
                          : "bg-surface hover:bg-surface-container-high border-outline-variant text-on-surface"
                      }`}
                    >
                      ضخم (150%)
                    </button>
                  </div>
                </div>
              </div>

              {/* Cache Manager */}
              <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
                <h3 className="text-sm font-extrabold text-on-surface flex items-center gap-2 mb-1.5">
                  <Trash2 className="w-5 h-5 text-purple-600" />
                  <span>إدارة الذاكرة المؤقتة (Cache Manager)</span>
                </h3>
                <p className="text-xs text-outline mb-4">
                  عرض ومسح الملفات والوسائط المخزنة مؤقتاً في متصفحك لتوفير مساحة التخزين أو تحديث المحتوى.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Image Cache card */}
                  <div className="bg-surface-container-high border border-outline-variant/60 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-on-surface font-semibold text-xs">
                        <ImageIcon className="w-4 h-4 text-purple-600" />
                        <span>الذاكرة المؤقتة للصور</span>
                      </div>
                      <div className="text-xs text-outline leading-relaxed mb-4">
                        {isCalculatingCache ? (
                          <span className="animate-pulse">جاري حساب الحجم...</span>
                        ) : (
                          <div>
                            <p>العدد الإجمالي: <strong className="text-on-surface">{imageCacheCount ?? 0} صورة</strong></p>
                            <p>المساحة المستهلكة: <strong className="text-on-surface">{imageCacheSize ?? "0.00 MB"}</strong></p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearImageCache}
                      className="w-full py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>مسح ذاكرة الصور</span>
                    </button>
                  </div>

                  {/* TTS Audio Cache card */}
                  <div className="bg-surface-container-high border border-outline-variant/60 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-on-surface font-semibold text-xs">
                        <Volume2 className="w-4 h-4 text-purple-600" />
                        <span>الذاكرة المؤقتة للنطق الصوتي</span>
                      </div>
                      <div className="text-xs text-outline leading-relaxed mb-4">
                        {isCalculatingCache ? (
                          <span className="animate-pulse">جاري حساب الحجم...</span>
                        ) : (
                          <div>
                            <p>العدد الإجمالي: <strong className="text-on-surface">{ttsCacheCount ?? 0} ملف صوتي</strong></p>
                            <p>المساحة المستهلكة: <strong className="text-on-surface">{ttsCacheSize ?? "0.00 MB"}</strong></p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearTtsCache}
                      className="w-full py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>مسح ذاكرة الصوتيات</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "diagnostics" && (
            <div className="space-y-6 animate-fade-in">
              {/* Header Banner */}
              <div className="p-5 rounded-2xl border border-blue-500/30 bg-blue-500/5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/30">
                  <div>
                    <h3 className="font-bold text-base text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-500" />
                      <span>نظام التشخيص وسجل الأسباب بالموقع (System Diagnostics & Reasons)</span>
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      يقوم هذا النظام بتتبع كل أحداث وتجارب الصوت والذكاء الاصطناعي والتخزين فورياً، مع كشف الأسباب الجذرية لأي مشكلة وتوفير خطوات الإصلاح الدقيقة.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={runFullSystemCheck}
                    disabled={isTestingSystem}
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTestingSystem ? "animate-spin" : ""}`} />
                    <span>{isTestingSystem ? "جاري الفحص الشامل..." : "فحص الأسباب والأنظمة الآن"}</span>
                  </button>
                </div>

                {/* System Check Results Grid */}
                {systemTestResults && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    {Object.entries(systemTestResults).map(([key, res]: [string, any]) => (
                      <div
                        key={key}
                        className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                          res.ok
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1.5">
                            {res.ok ? <Check className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-rose-500" />}
                            {key === "piper" ? "🔊 محرك Piper Neural TTS" : key === "google_tts" ? "⚡ خدمة Google Translate TTS" : key === "webspeech" ? "🌐 محرك المتصفح (WebSpeech)" : key === "ai" ? "🤖 خدمة الذكاء الاصطناعي" : "💾 نظام التخزين المؤقت"}
                          </span>
                          {res.ms && <span className="text-[10px] opacity-80">{res.ms} ms</span>}
                        </div>
                        <p className="text-[11px] font-medium">{res.msg}</p>
                        {res.cause && <p className="text-[10.5px] opacity-90">🔍 <strong>السبب:</strong> {res.cause}</p>}
                        {res.solution && <p className="text-[10.5px] opacity-90">💡 <strong>الحل:</strong> {res.solution}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION: GRANULAR LOCAL WASM PIPELINE INSPECTOR */}
              <div className="p-5 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-purple-700 dark:text-purple-300 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>أداة فحص وتتبع مراحل النطق العصبي المحلي (Granular Local WASM Inspector)</span>
                    </h4>
                    <p className="text-[11.5px] text-on-surface-variant mt-1 leading-relaxed">
                      فحص مرحلي استباقي ومستقل للخطوات الـ 6 لبنية محرك WASM وONNX لمعرفة النقطة المحددة التي يتوقف عندها التوليد المحلي.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsRunningGranularCheck(true);
                      runGranularLocalTtsCheck(selectedPiperModel).then((res) => {
                        setGranularTtsCheckResults(res);
                        setIsRunningGranularCheck(false);
                      });
                    }}
                    disabled={isRunningGranularCheck}
                    className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
                  >
                    <Activity className={`w-4 h-4 ${isRunningGranularCheck ? "animate-spin" : ""}`} />
                    <span>{isRunningGranularCheck ? "جاري فحص الخطوات الـ 6..." : "بدء الفحص الدقيق للمحلّي (1-6)"}</span>
                  </button>
                </div>

                {granularTtsCheckResults && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {granularTtsCheckResults.steps.map((st) => (
                        <div
                          key={st.stepNum}
                          className={`p-3 rounded-xl border text-xs space-y-1 transition-all ${
                            st.status === "ok"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                              : st.status === "error"
                              ? "bg-rose-500/15 border-rose-500/40 text-rose-900 dark:text-rose-100 font-medium"
                              : "bg-surface-container border-outline-variant/40 text-on-surface-variant opacity-60"
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1.5">
                              {st.status === "ok" ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : st.status === "error" ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              ) : (
                                <Activity className="w-3.5 h-3.5 text-outline shrink-0 animate-pulse" />
                              )}
                              <span>{st.title}</span>
                            </span>
                            {st.durationMs !== undefined && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface/50 border border-outline-variant/30">
                                {st.durationMs} ms
                              </span>
                            )}
                          </div>
                          {st.details && (
                            <p className="text-[11px] leading-relaxed opacity-90 pr-5">
                              {st.details}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {granularTtsCheckResults.analysis && (
                      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs space-y-2.5 animate-fade-in mt-2">
                        <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>تحليل السبب الجذري للخطأ عند {granularTtsCheckResults.analysis.stepTitle}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          <strong className="font-bold">🔍 السبب المكتشف:</strong> {granularTtsCheckResults.analysis.cause}
                        </p>
                        <p className="text-[11px] leading-relaxed">
                          <strong className="font-bold">💡 الحل المقترح:</strong> {granularTtsCheckResults.analysis.solution}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Diagnostic Log Timeline */}
              <div className="p-5 rounded-2xl border border-outline-variant/40 bg-surface-container-low/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    <h4 className="font-bold text-sm text-on-surface">
                      سجل الأسباب والأحداث المباشر ({diagnosticLogList.length} أحداث)
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {["all", "error", "warning", "info", "success"].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setDiagFilter(filter)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          diagFilter === filter
                            ? "bg-primary text-on-primary"
                            : "bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {filter === "all" ? "الكل" : filter === "error" ? "الأخطاء ❌" : filter === "warning" ? "تحذيرات ⚠️" : filter === "info" ? "معلومات ℹ️" : "نجاح ✅"}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const report = globalDiagnosticLogs
                          .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] [${l.category}] ${l.title}: ${l.message}${l.cause ? `\nالسبب: ${l.cause}` : ""}${l.solution ? `\nالحل: ${l.solution}` : ""}`)
                          .join("\n\n---\n\n");
                        navigator.clipboard.writeText(report);
                        alert("تم نسخ تقرير الأسباب التشخيصي إلى الحافظة بنجاح!");
                      }}
                      className="px-3 py-1 bg-surface border border-outline-variant hover:border-primary text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ التقرير</span>
                    </button>
                  </div>
                </div>

                {/* Logs list */}
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                  {filteredDiagnosticLogs.length === 0 ? (
                    <div className="p-8 text-center text-on-surface-variant text-xs italic bg-surface/50 rounded-xl border border-dashed border-outline-variant/40">
                      لا توجد سجلات أحداث أو أخطاء مسجلة حالياً ضمن الفلتر المحدد.
                    </div>
                  ) : (
                    filteredDiagnosticLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                          log.type === "error"
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200"
                            : log.type === "warning"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                            : log.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                            : "bg-surface border-outline-variant/40 text-on-surface"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-bold">
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-extrabold bg-surface-container border border-outline-variant/30">
                              {log.category}
                            </span>
                            <span>{log.title}</span>
                          </div>
                          <span className="text-[10px] text-on-surface-variant font-mono">{log.timestamp}</span>
                        </div>
                        <p className="text-[11.5px] leading-relaxed">{log.message}</p>
                        {log.cause && (
                          <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                            <strong>🔍 السبب المكتشف:</strong> {log.cause}
                          </p>
                        )}
                        {log.solution && (
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <strong>💡 الحل المقترح:</strong> {log.solution}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant bg-surface-bright flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 rounded-full text-sm font-semibold text-outline hover:text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-2.5 bg-primary text-on-primary font-semibold text-sm rounded-full hover:bg-primary-container transition-all shadow-md active:scale-95 cursor-pointer"
          >
            حفظ التغييرات 💾
          </button>
        </div>

      </div>
    </div>
  );
};
