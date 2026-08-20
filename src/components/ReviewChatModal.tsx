import React, { useState, useEffect, useRef, memo } from "react";
import {
  X,
  Send,
  Sparkles,
  Bot,
  Volume2,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Layers,
  Trash2,
  Loader2,
  CheckCircle2,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  ZoomIn,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Flashcard, Folder } from "../types";

export interface ReviewChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
  timestamp: number;
}

interface ReviewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: Flashcard;
  previousCards: Flashcard[];
  nextCards: Flashcard[];
  folderInfo?: {
    name?: string;
    description?: string;
    targetLanguage?: string;
    sourceLanguage?: string;
  };
  onPlayPronunciation?: (text: string, lang?: string) => void;
}

const AVAILABLE_MODELS = [
  // High quota models (500 RPD / lightweight)
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite ⚡", desc: "أداء ممتاز وخفيف مع حصة يومية عالية (500 طلب/يوم)", tag: "500 RPD" },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite ⚡", desc: "سريع وخفيف جداً للمحادثات اليومية (500 طلب/يوم)", tag: "500 RPD" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite ⚡", desc: "اقتصادي وسريع جداً للمحادثات الفورية", tag: "خفيف" },
  
  // General & Advanced Models
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash ⚡", desc: "أحدث وأقوى نموذج لمعالجة اللغات والشرح الدقيق (موصى به)", tag: "موصى به" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash ⚡", desc: "نموذج مستقر وفائق السرعة في الردود والشروحات", tag: "مستقر" },
  { id: "groq-llama-3.3-70b", name: "Groq Llama 3.3 70B 🚀", desc: "سرعة استجابة فائقة وخارقة عبر Groq API", tag: "Groq" },
  { id: "grok-2", name: "Grok 2 🤖", desc: "نموذج تفاعلي متقدم لشرح المصطلحات والأمثلة", tag: "تفاعلي" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash ⚡", desc: "سريع وخفيف ودقيق في صياغة الجمل والتمارين", tag: "خفيف" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro 💎", desc: "أعلى دقة لغوية وتحليل نحوي متعمق وشامل", tag: "تحليل عميق" }
];

const AVAILABLE_VOICES = [
  { id: "default", name: "الصوت الافتراضي للمنظومة", flag: "⚙️", desc: "يتبع الصوت الأساسي المحدد في إعدادات التطبيق" },
  { id: "google", name: "Google Translate TTS", flag: "⚡", desc: "خدمة نطق سريعة ومباشرة من جوجل" },
  { id: "webspeech", name: "Web Speech API", flag: "🌐", desc: "محرك نطق المتصفح الداخلي المباشر" },
  // German Piper Voices
  { id: "de_DE-thorsten-medium", name: "🇩🇪 Thorsten (ألماني - متوسط)", flag: "🇩🇪", desc: "صوت ألماني نقي عالي الدقة والوضوح" },
  { id: "de_DE-thorsten_emotional-medium", name: "🇩🇪 Thorsten Emotional (ألماني - معبر)", flag: "🇩🇪", desc: "نبرة معبرة طبيعية للمحادثات" },
  { id: "de_DE-ramona-medium", name: "🇩🇪 Ramona (ألماني - أنثوي)", flag: "🇩🇪", desc: "صوت نسائي ألماني واضح" },
  { id: "de_DE-kerstin-low", name: "🇩🇪 Kerstin (ألماني - خفيف)", flag: "🇩🇪", desc: "صوت نسائي ألماني خفيف وسريع" },
  // English Piper Voices
  { id: "en_US-lessac-medium", name: "🇺🇸 Lessac (إنجليزي - أنثوي)", flag: "🇺🇸", desc: "صوت إنجليزي أمريكي قياسي عالي النقاء" },
  { id: "en_US-ryan-medium", name: "🇺🇸 Ryan (إنجليزي - رجالي)", flag: "🇺🇸", desc: "صوت إنجليزي رجالي متزن" },
  { id: "en_GB-alan-medium", name: "🇬🇧 Alan (إنجليزي بريطاني)", flag: "🇬🇧", desc: "نبرة بريطانية مميزة ودقيقة" },
  // Arabic Piper Voice
  { id: "ar_JO-kareem-medium", name: "🇯🇴 Kareem (عربي)", flag: "🇯🇴", desc: "صوت عربي فصيح واضح المخارج" }
];

// Interactive Quoted Span with Floating Bubble Tooltip (ONLY for quoted text!)
const QuotedTextInteractiveSpan: React.FC<{
  quotedText: string;
  onSpeak?: (text: string) => void;
  onCopy?: (text: string) => void;
  onCreateCard?: (text: string) => Promise<void> | void;
}> = ({ quotedText, onSpeak, onCopy, onCreateCard }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const cleanText = quotedText.trim();

  const handleTouchStart = () => {
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setShowTooltip(true);
    }, 380);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip((prev) => !prev);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressRef.current = false;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip((prev) => !prev);
  };

  const handleCopyAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onCopy) {
      onCopy(cleanText);
    } else {
      navigator.clipboard.writeText(cleanText);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeakAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSpeak) {
      onSpeak(cleanText);
    } else {
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(cleanText);
          window.speechSynthesis.speak(u);
        }
      } catch (err) {
        console.error("Speech error:", err);
      }
    }
  };

  const handleCreateCardAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onCreateCard || isCreatingCard) return;
    setIsCreatingCard(true);
    try {
      await onCreateCard(cleanText);
      setShowTooltip(false);
    } catch (err) {
      console.error("Card creation error:", err);
    } finally {
      setIsCreatingCard(false);
    }
  };

  return (
    <span className="relative inline-block">
      <bdi
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        className={`transition-all duration-150 cursor-pointer select-text font-semibold ${
          showTooltip
            ? "text-amber-400 font-bold underline decoration-amber-400 decoration-2 underline-offset-2"
            : "text-amber-300 hover:text-amber-200 active:text-amber-400 underline decoration-amber-400/40 decoration-1 underline-offset-2"
        }`}
        title="انقر لإظهار خيارات: استماع، نسخ، أو إضافة كبطاقة فلاش كارد"
        dir="auto"
      >
        "{cleanText}"
      </bdi>

      {/* Floating Action Bubble */}
      {showTooltip && (
        <>
          {/* Backdrop to close popup on outside click */}
          <div
            className="fixed inset-0 z-[999999] bg-black/25 backdrop-blur-3xs"
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
            }}
          />

          <div
            dir="rtl"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-[1000000] bg-slate-950 text-white p-1.5 rounded-2xl shadow-2xl border border-slate-700/90 flex items-center gap-1.5 animate-scale-up whitespace-nowrap text-xs font-sans select-none ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tail arrow pointing down */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950" />

            {/* 1. Listen / Speak Button */}
            <button
              type="button"
              onClick={handleSpeakAction}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
              title="استماع للنطق الصوتي"
            >
              <Volume2 className="w-3.5 h-3.5 text-blue-100" />
              <span>استماع</span>
            </button>

            {/* 2. Copy Button */}
            <button
              type="button"
              onClick={handleCopyAction}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold transition-all active:scale-95 cursor-pointer border shadow-xs ${
                copied
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700"
              }`}
              title="نسخ النص"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span>نسخ</span>
            </button>

            {/* 3. Make Flashcard Button */}
            {onCreateCard && (
              <button
                type="button"
                onClick={handleCreateCardAction}
                disabled={isCreatingCard}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all active:scale-95 cursor-pointer shadow-xs border border-amber-500/80 disabled:opacity-50"
                title="توليد وحفظ كبطاقة فلاش كارد في المجلد"
              >
                {isCreatingCard ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-100 animate-spin" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-amber-100" />
                )}
                <span>بطاقة</span>
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
};

// Helper to parse inline formatting recursively (bold, inline code, italics, and quotes)
const parseInlineChatContent = (
  lineText: string,
  onSpeak?: (text: string) => void,
  onCopy?: (text: string) => void,
  onCreateCard?: (text: string) => Promise<void> | void
): React.ReactNode => {
  if (!lineText) return null;

  // Regex matches:
  // 1. Double double-quotes: ""..."" (plain text without quotes)
  // 2. Single pair quotes: "..." | «...» | „...“ | “...” (interactive with bubble)
  // 3. Bold text: **...** (strong text, parsed recursively)
  // 4. Inline code: `...` (code badge, parsed recursively)
  // 5. Italic text: *...* (emphasis, parsed recursively)
  const regex = /(""(.*?)""|"([^"\n]+)"|«([^»]+)»|„([^“]+)“|“([^”]+)”|\*\*(.*?)\*\*|`([^`]+)`|\*([^*\n]+)\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lineText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(lineText.substring(lastIndex, match.index));
    }

    const fullMatch = match[0];
    const isDoubleDoubleQuote = fullMatch.startsWith('""') && fullMatch.endsWith('""');
    const isBold = fullMatch.startsWith("**") && fullMatch.endsWith("**");
    const isCode = fullMatch.startsWith("`") && fullMatch.endsWith("`");
    const isItalic = !isBold && fullMatch.startsWith("*") && fullMatch.endsWith("*");

    if (isDoubleDoubleQuote) {
      const inner = match[2] || "";
      parts.push(
        <span key={match.index} className="font-semibold text-slate-200" dir="ltr">
          {inner}
        </span>
      );
    } else if (isBold) {
      const inner = match[7] || "";
      parts.push(
        <strong key={match.index} className="font-extrabold text-white">
          {parseInlineChatContent(inner, onSpeak, onCopy, onCreateCard)}
        </strong>
      );
    } else if (isCode) {
      const inner = match[8] || "";
      parts.push(
        <code
          key={match.index}
          className="px-1 py-0.5 rounded text-indigo-300 font-mono text-xs mx-0.5 inline-block"
          dir="ltr"
        >
          {parseInlineChatContent(inner, onSpeak, onCopy, onCreateCard)}
        </code>
      );
    } else if (isItalic) {
      const inner = match[9] || "";
      parts.push(
        <em key={match.index} className="italic text-slate-300">
          {parseInlineChatContent(inner, onSpeak, onCopy, onCreateCard)}
        </em>
      );
    } else {
      // Single pair quoted text ("word", «word», „word“, “word”) -> ONLY these show the floating bubble!
      const quotedInner = match[3] ?? match[4] ?? match[5] ?? match[6] ?? "";
      if (quotedInner && quotedInner.trim().length > 0) {
        parts.push(
          <QuotedTextInteractiveSpan
            key={match.index}
            quotedText={quotedInner.trim()}
            onSpeak={onSpeak}
            onCopy={onCopy}
            onCreateCard={onCreateCard}
          />
        );
      } else {
        parts.push(fullMatch);
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < lineText.length) {
    parts.push(lineText.substring(lastIndex));
  }

  return parts.length > 0 ? parts : lineText;
};

// Helper structures and utilities for Chat Images and Markdown Table parsing
export interface ChatImageItem {
  query: string;
  size?: "small" | "medium" | "large";
  caption?: string;
  keyword?: string;
}

interface ImageBlock {
  type: "image";
  items: ChatImageItem[];
}

interface TableBlock {
  type: "table";
  headers: string[];
  alignments: Array<"right" | "center" | "left" | "auto">;
  rows: string[][];
}

interface LineBlock {
  type: "line";
  line: string;
}

type ParsedBlock = TableBlock | LineBlock | ImageBlock;

// Global memory cache for image search queries to avoid repeated fetches
const chatImageQueryCache = new Map<string, string[]>();

export const fetchImagesForChatQuery = async (query: string): Promise<string[]> => {
  const cleanQ = query.trim();
  if (!cleanQ) return [];
  if (chatImageQueryCache.has(cleanQ)) {
    return chatImageQueryCache.get(cleanQ)!;
  }

  // 1. Try DuckDuckGo / Pixabay unified endpoint
  try {
    const res = await fetch(`/api/images?q=${encodeURIComponent(cleanQ)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.hits) && data.hits.length > 0) {
        const urls = data.hits
          .map((h: any) => h.largeImageURL || h.webformatURL || h.previewURL)
          .filter(Boolean);
        if (urls.length > 0) {
          chatImageQueryCache.set(cleanQ, urls);
          return urls;
        }
      }
    }
  } catch (e) {}

  // 2. Try DuckDuckGo direct fallback endpoint
  try {
    const res2 = await fetch(`/api/duckduckgo-images?q=${encodeURIComponent(cleanQ)}`);
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2 && Array.isArray(data2.results) && data2.results.length > 0) {
        const urls2 = data2.results
          .map((r: any) => r.image || r.thumbnail)
          .filter(Boolean);
        if (urls2.length > 0) {
          chatImageQueryCache.set(cleanQ, urls2);
          return urls2;
        }
      }
    }
  } catch (e) {}

  return [];
};

// Parse image tags like $$IMAGE:{...}$$ or $$IMAGES:[{...}]$$ or $$IMAGE|query:...$$
export const parseImageTag = (tagStr: string): ChatImageItem[] | null => {
  const trimmed = tagStr.trim();

  // 1. JSON format: $$IMAGE:{...}$$ or $$IMAGES:[{...}]$$
  const jsonMatch = trimmed.match(/^\$\$(?:IMAGES?|PHOTOS?|IMGS?):\s*(\[[\s\S]*\]|\{[\s\S]*\})\s*\$\$$/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => ({
            query: String(item.query || item.q || item.title || item.keyword || "").trim(),
            size: (item.size || "small") as "small" | "medium" | "large",
            caption: String(item.caption || item.desc || item.title || "").trim(),
            keyword: String(item.keyword || item.word || "").trim()
          }))
          .filter((x) => x.query.length > 0);
      } else if (typeof parsed === "object" && parsed !== null) {
        const q = String(parsed.query || parsed.q || parsed.title || parsed.keyword || "").trim();
        if (q) {
          return [
            {
              query: q,
              size: (parsed.size || "large") as "small" | "medium" | "large",
              caption: String(parsed.caption || parsed.desc || parsed.title || "").trim(),
              keyword: String(parsed.keyword || parsed.word || "").trim()
            }
          ];
        }
      }
    } catch (e) {
      // JSON parse error, fall through to pipe format
    }
  }

  // 2. Pipe format: $$IMAGE|query:...|caption:...|size:...$$ or $$IMAGE|query|size|caption$$
  const pipeMatch = trimmed.match(/^\$\$(?:IMAGE|IMAGES|PHOTO|PHOTOS|IMG)\s*\|\s*([^$]+)\$\$$/i);
  if (pipeMatch) {
    const content = pipeMatch[1].trim();
    if (content.includes(":") || content.includes("=")) {
      const parts = content.split(/\|/);
      const item: ChatImageItem = { query: "" };
      parts.forEach((p) => {
        const [k, ...v] = p.split(/[:=]/);
        const key = k?.trim().toLowerCase();
        const val = v.join(":").trim();
        if (key === "query" || key === "q" || key === "search") item.query = val;
        else if (key === "size" || key === "s") item.size = val as any;
        else if (key === "caption" || key === "c" || key === "title") item.caption = val;
        else if (key === "keyword" || key === "word" || key === "k") item.keyword = val;
      });
      if (item.query) {
        return [
          {
            query: item.query,
            size: item.size || "large",
            caption: item.caption || "",
            keyword: item.keyword || ""
          }
        ];
      }
    } else {
      const parts = content.split("|").map((s) => s.trim());
      if (parts[0]) {
        return [
          {
            query: parts[0],
            size: (parts[1] as any) || "large",
            caption: parts[2] || "",
            keyword: parts[3] || ""
          }
        ];
      }
    }
  }

  return null;
};

// Interactive Single Image Card with Loading Skeleton, Multi-photo carousel, Audio Pronunciation, and Lightbox trigger
const ChatImageCard: React.FC<{
  item: ChatImageItem;
  onSpeak?: (text: string) => void;
  onOpenLightbox?: (imgUrl: string, caption?: string, keyword?: string, query?: string) => void;
}> = ({ item, onSpeak, onOpenLightbox }) => {
  const [images, setImages] = useState<string[]>(() => {
    return chatImageQueryCache.get(item.query.trim()) || [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(() => images.length === 0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const cleanQ = item.query.trim();
    if (!cleanQ) return;

    const cached = chatImageQueryCache.get(cleanQ);
    if (cached && cached.length > 0) {
      setImages(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    fetchImagesForChatQuery(cleanQ)
      .then((urls) => {
        if (!isMounted) return;
        if (urls.length > 0) {
          setImages(urls);
        } else {
          setHasError(true);
        }
      })
      .catch(() => {
        if (isMounted) setHasError(true);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [item.query]);

  const currentImg = images[currentIndex] || images[0];
  const size = item.size || "large";

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div
        className={`w-full rounded-2xl bg-slate-900/90 border border-slate-800/80 p-3 my-2.5 flex items-center gap-3 animate-pulse ${
          size === "large" ? "min-h-[140px]" : size === "medium" ? "min-h-[110px]" : "min-h-[72px]"
        }`}
      >
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400/70 shrink-0">
          <ImageIcon className="w-6 h-6 animate-spin" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-slate-700/70 rounded w-2/3"></div>
          <div className="h-2.5 bg-slate-800/80 rounded w-1/3"></div>
          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            جاري تحميل الصورة التوضيحية...
          </span>
        </div>
      </div>
    );
  }

  // Error / No image found fallback
  if (hasError || !currentImg) {
    return null;
  }

  // 1. Small Layout (Grid item or compact word representation)
  if (size === "small") {
    return (
      <div
        className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-700/70 bg-slate-900/90 hover:border-emerald-500/60 hover:bg-slate-900 transition-all group cursor-pointer shadow-sm select-none"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpenLightbox?.(currentImg, item.caption, item.keyword, item.query);
        }}
        title="انقر نقراً مزدوجاً للتكبير"
      >
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-slate-800">
          <img
            src={currentImg}
            alt={item.caption || item.keyword || "الصورة"}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
          />
        </div>

        <div className="flex-1 min-w-0 text-start">
          {item.caption && (
            <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed font-medium" dir="auto">
              {item.caption}
            </p>
          )}
        </div>
      </div>
    );
  }

  // 2. Medium Layout (Aspect 16:9 contextual illustration)
  if (size === "medium") {
    return (
      <div
        className="w-full my-2.5 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-900/90 shadow-md group transition-all select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative w-full h-44 sm:h-52 bg-slate-950/90 flex items-center justify-center overflow-hidden cursor-pointer"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenLightbox?.(currentImg, item.caption, item.keyword, item.query);
          }}
          title="انقر نقراً مزدوجاً للتكبير"
        >
          <img
            src={currentImg}
            alt={item.caption || item.keyword || "الصورة"}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
          />

          {images.length > 1 && (
            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                }}
                className="pointer-events-auto p-1 rounded-full bg-black/70 hover:bg-black text-white text-xs border border-white/20 shadow"
                title="السابقة"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[9.5px] font-mono text-white border border-white/10">
                {currentIndex + 1} / {images.length}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                }}
                className="pointer-events-auto p-1 rounded-full bg-black/70 hover:bg-black text-white text-xs border border-white/20 shadow"
                title="التالية"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {item.caption && (
          <div className="p-2.5 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-200 leading-snug flex-1" dir="auto">
              {item.caption}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 3. Large Layout (Full Hero Image with rich caption)
  return (
    <div
      className="w-full my-3 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-900/90 shadow-xl group transition-all select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-h-72 sm:max-h-80 bg-slate-950/90 flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpenLightbox?.(currentImg, item.caption, item.keyword, item.query);
        }}
        title="انقر نقراً مزدوجاً للتكبير"
      >
        <img
          src={currentImg}
          alt={item.caption || item.keyword || "الصورة"}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover max-h-72 sm:max-h-80 group-hover:scale-105 transition-transform duration-300 pointer-events-none"
        />

        {images.length > 1 && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
              }}
              className="pointer-events-auto p-1.5 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-lg active:scale-95"
              title="الصورة السابقة"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="pointer-events-auto px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[11px] font-mono text-white border border-white/20 shadow">
              {currentIndex + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
              }}
              className="pointer-events-auto p-1.5 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-lg active:scale-95"
              title="الصورة التالية"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {item.caption && (
        <div className="p-3.5 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm">
          <span className="font-bold text-slate-100 leading-relaxed flex-1" dir="auto">
            {item.caption}
          </span>
        </div>
      )}
    </div>
  );
};

// Gallery of Images (renders single card or multiple cards in a responsive grid)
const ChatImageGallery: React.FC<{
  items: ChatImageItem[];
  onSpeak?: (text: string) => void;
  onOpenLightbox?: (imgUrl: string, caption?: string, keyword?: string, query?: string) => void;
}> = ({ items, onSpeak, onOpenLightbox }) => {
  if (!items || items.length === 0) return null;

  // Single Image Item
  if (items.length === 1) {
    return (
      <ChatImageCard
        item={items[0]}
        onSpeak={onSpeak}
        onOpenLightbox={onOpenLightbox}
      />
    );
  }

  // Multiple Items Gallery Grid
  return (
    <div className="my-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {items.map((item, idx) => (
          <ChatImageCard
            key={idx}
            item={{ ...item, size: item.size || "small" }}
            onSpeak={onSpeak}
            onOpenLightbox={onOpenLightbox}
          />
        ))}
      </div>
    </div>
  );
};

const splitTableRow = (rowStr: string): string[] => {
  let cleaned = rowStr.trim();
  if (cleaned.startsWith("|")) cleaned = cleaned.substring(1);
  if (cleaned.endsWith("|")) cleaned = cleaned.substring(0, cleaned.length - 1);
  return cleaned.split("|").map((cell) => cell.trim());
};

const isSeparatorRow = (rowStr: string): boolean => {
  const trimmed = rowStr.trim();
  if (!trimmed.includes("|") && !trimmed.startsWith("-")) return false;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
};

const getAlignments = (sepStr: string): Array<"right" | "center" | "left" | "auto"> => {
  const cells = splitTableRow(sepStr);
  return cells.map((cell) => {
    const c = cell.trim();
    const startColon = c.startsWith(":");
    const endColon = c.endsWith(":");
    if (startColon && endColon) return "center";
    if (endColon) return "left";
    if (startColon) return "right";
    return "auto";
  });
};

const parseMarkdownBlocks = (lines: string[]): ParsedBlock[] => {
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for Image Tags ($$IMAGE:...$$ or $$IMAGES:[...]$$)
    if (
      trimmed.startsWith("$$IMAGE") ||
      trimmed.startsWith("$$PHOTO") ||
      trimmed.startsWith("$$IMG")
    ) {
      if (trimmed.endsWith("$$")) {
        const imageItems = parseImageTag(trimmed);
        if (imageItems && imageItems.length > 0) {
          blocks.push({ type: "image", items: imageItems });
          i++;
          continue;
        }
      } else {
        // Multi-line JSON image tag collection
        let accumulated = line;
        let j = i + 1;
        let foundEnd = false;
        while (j < lines.length && j < i + 25) {
          accumulated += "\n" + lines[j];
          if (lines[j].trim().endsWith("$$")) {
            foundEnd = true;
            break;
          }
          j++;
        }
        if (foundEnd) {
          const imageItems = parseImageTag(accumulated);
          if (imageItems && imageItems.length > 0) {
            blocks.push({ type: "image", items: imageItems });
            i = j + 1;
            continue;
          }
        }
      }
    }

    // Check for inline image tag in line: split line if it contains $$IMAGE...$$
    if (trimmed.includes("$$IMAGE") || trimmed.includes("$$PHOTO") || trimmed.includes("$$IMG")) {
      const inlineTagMatch = trimmed.match(/(\$\$(?:IMAGE|IMAGES|PHOTO|PHOTOS|IMG)[\s\S]*?\$\$)/);
      if (inlineTagMatch) {
        const tagText = inlineTagMatch[1];
        const parsedItems = parseImageTag(tagText);
        if (parsedItems && parsedItems.length > 0) {
          const before = trimmed.substring(0, inlineTagMatch.index).trim();
          const after = trimmed.substring(inlineTagMatch.index! + tagText.length).trim();
          if (before) blocks.push({ type: "line", line: before });
          blocks.push({ type: "image", items: parsedItems });
          if (after) blocks.push({ type: "line", line: after });
          i++;
          continue;
        }
      }
    }

    // Check for standard markdown table: header row + separator row
    const looksLikeTable = trimmed.includes("|") && splitTableRow(trimmed).length >= 2;
    const nextLineIsSep = i + 1 < lines.length && isSeparatorRow(lines[i + 1]);

    if (looksLikeTable && nextLineIsSep) {
      const headers = splitTableRow(trimmed);
      const alignments = getAlignments(lines[i + 1]);
      const rows: string[][] = [];
      i += 2; // skip header and separator

      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (rowLine === "" || !rowLine.includes("|")) {
          break;
        }
        if (isSeparatorRow(rowLine)) {
          i++;
          continue;
        }
        rows.push(splitTableRow(rowLine));
        i++;
      }

      blocks.push({
        type: "table",
        headers,
        alignments,
        rows
      });
      continue;
    }

    // Check for consecutive pipe lines (even if separator line was missing)
    if (looksLikeTable && i + 1 < lines.length && lines[i + 1].trim().includes("|")) {
      const firstCells = splitTableRow(trimmed);
      const secondCells = splitTableRow(lines[i + 1].trim());
      if (firstCells.length >= 2 && firstCells.length === secondCells.length) {
        const headers = firstCells;
        const alignments: Array<"right" | "center" | "left" | "auto"> = headers.map(() => "auto");
        const rows: string[][] = [];
        i += 1;
        while (i < lines.length) {
          const rowLine = lines[i].trim();
          if (rowLine === "" || !rowLine.includes("|")) {
            break;
          }
          if (isSeparatorRow(rowLine)) {
            i++;
            continue;
          }
          rows.push(splitTableRow(rowLine));
          i++;
        }
        blocks.push({
          type: "table",
          headers,
          alignments,
          rows
        });
        continue;
      }
    }

    blocks.push({ type: "line", line });
    i++;
  }

  return blocks;
};

// FormattedChatMessage Component for full Markdown parsing (images, tables, headings, dividers, indented lists, bold, code, quotes)
const FormattedChatMessage: React.FC<{
  text: string;
  className?: string;
  onSpeak?: (text: string) => void;
  onCopy?: (text: string) => void;
  onCreateCard?: (text: string) => Promise<void> | void;
  onOpenLightbox?: (imgUrl: string, caption?: string, keyword?: string, query?: string) => void;
}> = ({ text, className = "", onSpeak, onCopy, onCreateCard, onOpenLightbox }) => {
  if (!text) return null;

  const cleanedText = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;br\s*\/?&gt;/gi, "\n");

  const rawLines = cleanedText.split("\n");
  const blocks = parseMarkdownBlocks(rawLines);

  return (
    <div dir="auto" className={`space-y-1.5 text-slate-100 leading-relaxed text-start select-text ${className}`}>
      {blocks.map((block, bIdx) => {
        // Render Embedded Images Gallery Block
        if (block.type === "image") {
          return (
            <ChatImageGallery
              key={bIdx}
              items={block.items}
              onSpeak={onSpeak}
              onOpenLightbox={onOpenLightbox}
            />
          );
        }

        // Render Markdown Table with auto-fitted columns and smooth slim horizontal scroll (RTL order: Column 1 on Right)
        if (block.type === "table") {
          return (
            <div
              key={bIdx}
              dir="rtl"
              className="w-full my-3 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-sm max-w-full table-scrollbar-thin pb-0.5 touch-pan-x"
            >
              <table dir="rtl" className="w-max min-w-full text-xs sm:text-sm text-right border-collapse">
                <thead className="bg-slate-800/95 text-indigo-300 border-b border-slate-700 font-bold">
                  <tr>
                    {block.headers.map((h, hIdx) => {
                      const align = block.alignments[hIdx] || "auto";
                      return (
                        <th
                          key={hIdx}
                          dir="rtl"
                          className={`px-3.5 py-2.5 whitespace-nowrap border-l border-slate-700/60 last:border-l-0 ${
                            align === "center"
                              ? "text-center"
                              : align === "left"
                              ? "text-left"
                              : align === "right"
                              ? "text-right"
                              : "text-right"
                          }`}
                        >
                          {parseInlineChatContent(h, onSpeak, onCopy, onCreateCard)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={rIdx % 2 === 1 ? "bg-slate-800/35 hover:bg-slate-800/70 transition-colors" : "hover:bg-slate-800/50 transition-colors"}
                    >
                      {row.map((cell, cIdx) => {
                        const align = block.alignments[cIdx] || "auto";
                        return (
                          <td
                            key={cIdx}
                            dir="rtl"
                            className={`px-3.5 py-2.5 whitespace-nowrap text-slate-200 border-l border-slate-800/60 last:border-l-0 ${
                              align === "center"
                                ? "text-center"
                                : align === "left"
                                ? "text-left"
                                : align === "right"
                                ? "text-right"
                                : "text-right"
                            }`}
                          >
                            {parseInlineChatContent(cell, onSpeak, onCopy, onCreateCard)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        const line = block.line;
        const trimmed = line.trim();

        // 1. Horizontal Rule (---, ***, ___, –--)
        if (trimmed === "---" || trimmed === "***" || trimmed === "___" || trimmed === "–--" || trimmed === "- - -") {
          return <hr key={bIdx} className="my-3 border-t border-slate-700/80" />;
        }

        // 2. Heading lines (# title, ## title, ### title, #### title)
        const headingMatch = line.match(/^(\s*)(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[2].length;
          const title = headingMatch[3];
          if (level === 1) {
            return (
              <h1
                key={bIdx}
                dir="auto"
                className="font-black text-white text-base sm:text-lg mt-3 mb-1.5 border-r-3 border-blue-500 pr-2.5 text-start"
              >
                {parseInlineChatContent(title, onSpeak, onCopy, onCreateCard)}
              </h1>
            );
          }
          if (level === 2) {
            return (
              <h2
                key={bIdx}
                dir="auto"
                className="font-extrabold text-white text-sm sm:text-base mt-2.5 mb-1.5 border-r-3 border-blue-500 pr-2.5 text-start"
              >
                {parseInlineChatContent(title, onSpeak, onCopy, onCreateCard)}
              </h2>
            );
          }
          return (
            <h3
              key={bIdx}
              dir="auto"
              className="font-bold text-blue-300 text-xs sm:text-sm mt-2 mb-1 border-r-3 border-blue-500/80 pr-2.5 text-start"
            >
              {parseInlineChatContent(title, onSpeak, onCopy, onCreateCard)}
            </h3>
          );
        }

        // 3. Bullet lists (* item, - item, • item, with support for nested indentation)
        const bulletMatch = line.match(/^(\s*)([-*•])\s+(.+)$/);
        if (bulletMatch) {
          const indent = bulletMatch[1].length;
          const isSub = indent >= 2;
          return (
            <div
              key={bIdx}
              dir="auto"
              className={`flex items-start gap-2 my-1 text-start ${
                isSub ? "mr-4 sm:mr-6 text-slate-300" : "pr-1 text-slate-200"
              }`}
            >
              <span className={`shrink-0 mt-0.5 font-bold ${isSub ? "text-blue-300 text-xs" : "text-blue-400"}`}>
                {isSub ? "◦" : "•"}
              </span>
              <div className="flex-1 leading-relaxed">
                {parseInlineChatContent(bulletMatch[3], onSpeak, onCopy, onCreateCard)}
              </div>
            </div>
          );
        }

        // 4. Numbered lists (1. item, 2. item, 1) item, with support for indentation)
        const numMatch = line.match(/^(\s*)(\d+[\.\)])\s+(.+)$/);
        if (numMatch) {
          const indent = numMatch[1].length;
          const isSub = indent >= 2;
          return (
            <div
              key={bIdx}
              dir="auto"
              className={`flex items-start gap-2 my-1 text-start ${
                isSub ? "mr-4 sm:mr-6 text-slate-300" : "pr-1 text-slate-200"
              }`}
            >
              <span className="text-blue-300 font-extrabold shrink-0 text-xs mt-0.5 bg-blue-950/80 px-1.5 py-0.5 rounded border border-blue-800/80 font-mono">
                {numMatch[2]}
              </span>
              <div className="flex-1 leading-relaxed">
                {parseInlineChatContent(numMatch[3], onSpeak, onCopy, onCreateCard)}
              </div>
            </div>
          );
        }

        // 5. Empty line (paragraph gap)
        if (trimmed === "") {
          return <div key={bIdx} className="h-1.5" />;
        }

        // 6. Regular text line
        return (
          <div key={bIdx} dir="auto" className="min-h-[1.25em] text-start text-slate-200 leading-relaxed">
            {parseInlineChatContent(line, onSpeak, onCopy, onCreateCard)}
          </div>
        );
      })}
    </div>
  );
};

export const ReviewChatModal: React.FC<ReviewChatModalProps> = ({
  isOpen,
  onClose,
  card,
  previousCards,
  nextCards,
  folderInfo,
  onPlayPronunciation
}) => {
  const [messages, setMessages] = useState<ReviewChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`review_chat_history_${card.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("settings_review_chat_model") || "gemini-2.5-flash";
  });
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    return localStorage.getItem("settings_review_chat_voice") || "default";
  });
  const [responseLength, setResponseLength] = useState<"concise" | "balanced" | "detailed">(() => {
    return (localStorage.getItem("settings_review_chat_length") as any) || "balanced";
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPromptsMenuOpen, setIsPromptsMenuOpen] = useState(false);
  const [isImageMenuOpen, setIsImageMenuOpen] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const [activeLightbox, setActiveLightbox] = useState<{
    url: string;
    caption?: string;
    keyword?: string;
    query?: string;
  } | null>(null);
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isInitialOpenRef = useRef(true);

  // Reset pagination and initial scroll flag when card or modal changes
  useEffect(() => {
    if (isOpen) {
      setVisibleCount(10);
      isInitialOpenRef.current = true;
      setIsImageMenuOpen(false);
      setIsPromptsMenuOpen(false);
    }
  }, [isOpen, card.id]);

  // Save model selection
  useEffect(() => {
    localStorage.setItem("settings_review_chat_model", selectedModel);
  }, [selectedModel]);

  // Save voice selection and sync with global voice if applicable
  useEffect(() => {
    localStorage.setItem("settings_review_chat_voice", selectedVoice);
    if (selectedVoice !== "default") {
      const cardLang = (card.frontLang || "de").toLowerCase().split("-")[0].split("_")[0];
      localStorage.setItem(`settings_primary_piper_model_${cardLang}`, selectedVoice);
      localStorage.setItem("settings_primary_piper_model", selectedVoice);
    }
  }, [selectedVoice, card.frontLang]);

  useEffect(() => {
    localStorage.setItem("settings_review_chat_length", responseLength);
  }, [responseLength]);

  // Save chat history per card (max 30 messages)
  useEffect(() => {
    if (messages.length > 0) {
      try {
        const trimmed = messages.slice(-30);
        localStorage.setItem(`review_chat_history_${card.id}`, JSON.stringify(trimmed));
      } catch (e) {}
    }
  }, [messages, card.id]);

  // Scroll to bottom: instant on open (no animation), smooth on subsequent new messages
  useEffect(() => {
    if (isOpen) {
      if (isInitialOpenRef.current) {
        // Instant jump to bottom without animation
        if (chatScrollContainerRef.current) {
          chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
        }
        isInitialOpenRef.current = false;
      } else {
        // Smooth scroll for subsequent user/AI messages
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, isOpen, visibleCount]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string, forceImages?: boolean) => {
    const query = (textToSend !== undefined ? textToSend : inputMessage).trim();
    if (!query || isLoading) return;

    const shouldIncludeImages = forceImages || isImageMode;

    const userMsg: ReviewChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev.slice(-29), userMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const customGeminiKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("settings_gemini_api_key") || "";
      const customGroqKey = localStorage.getItem("groq_api_key") || localStorage.getItem("settings_groq_api_key") || "";

      const historyPayload = messages.slice(-28).map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch("/api/ai/review-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: {
            id: card.id,
            frontText: card.frontText,
            backText: card.backText,
            translationHint: card.translationHint,
            correctArticle: card.correctArticle,
            pluralText: card.pluralText,
            frontLang: card.frontLang,
            backLang: card.backLang
          },
          previousCards: previousCards.slice(-5).map((c) => ({
            frontText: c.frontText,
            backText: c.backText,
            translationHint: c.translationHint,
            correctArticle: c.correctArticle
          })),
          nextCards: nextCards.slice(0, 5).map((c) => ({
            frontText: c.frontText,
            backText: c.backText,
            translationHint: c.translationHint,
            correctArticle: c.correctArticle
          })),
          folderInfo: {
            name: folderInfo?.name || "مجموعة البطاقات",
            description: folderInfo?.description || "",
            targetLanguage: card.frontLang || folderInfo?.targetLanguage || "de",
            sourceLanguage: card.backLang || folderInfo?.sourceLanguage || "ar"
          },
          chatHistory: historyPayload,
          message: query,
          includeImages: shouldIncludeImages,
          selectedModel: selectedModel,
          responseLength: responseLength,
          geminiApiKey: customGeminiKey,
          groqApiKey: customGroqKey
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `خطأ في الخادم (${res.status})`);
      }

      const data = await res.json();
      const aiReply: ReviewChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply || "لم أستطع صياغة رد واضح، يرجى المحاولة ثانية.",
        modelUsed: data.usedModel || selectedModel,
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev.slice(-29), aiReply]);
    } catch (err: any) {
      const errorMsg: ReviewChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `⚠️ تعذر إكمال الطلب: ${err.message || "يرجى التحقق من اتصالك بالإنترنت أو مفتاح الـ API."}`,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Create flashcard from token with smart AI backend call & DB sync
  const handleCreateCardFromToken = async (tokenText: string) => {
    const customGeminiKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("settings_gemini_api_key") || "";
    const customGroqKey = localStorage.getItem("groq_api_key") || localStorage.getItem("settings_groq_api_key") || "";
    const langToUse = card.frontLang === "de" ? "German" : "English";

    try {
      const res = await fetch("/api/ai/make-card-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotedText: tokenText,
          targetLanguage: langToUse,
          geminiApiKey: customGeminiKey,
          groqApiKey: customGroqKey,
          model: selectedModel
        })
      });

      let cardData: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak">;

      if (res.ok) {
        const data = await res.json();
        if (data.card) {
          cardData = data.card;
        } else {
          throw new Error("Invalid response format");
        }
      } else {
        throw new Error("Failed to fetch card from AI");
      }

      // Determine target folder: current folder or folder named "بطاقات"
      let cachedFolders: Folder[] = [];
      let cachedCards: Flashcard[] = [];
      try {
        cachedFolders = JSON.parse(localStorage.getItem("cached_folders") || "[]");
        cachedCards = JSON.parse(localStorage.getItem("cached_cards") || "[]");
      } catch (e) {}

      let targetFolderId = card.folderId;
      if (!targetFolderId) {
        const existingFolder = cachedFolders.find((f) => f.name && f.name.trim().toLowerCase() === "بطاقات");
        if (existingFolder) {
          targetFolderId = existingFolder.id;
        } else {
          const newFolder: Folder = {
            id: `folder-${Date.now()}`,
            name: "بطاقات",
            description: "",
            color: "#3b82f6",
            frontLang: card.frontLang || "de",
            backLang: "ar",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          cachedFolders = [newFolder, ...cachedFolders];
          targetFolderId = newFolder.id;
        }
      }

      const newCard: Flashcard = {
        ...cardData,
        id: `card-${Date.now()}`,
        folderId: targetFolderId,
        createdAt: new Date().toISOString(),
        streak: 0
      };

      const updatedCards = [newCard, ...cachedCards];

      // Save to localStorage & database
      try {
        localStorage.setItem("cached_folders", JSON.stringify(cachedFolders));
        localStorage.setItem("cached_cards", JSON.stringify(updatedCards));
      } catch (e) {}

      fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: cachedFolders, cards: updatedCards })
      }).catch(console.error);

      setToastMessage(`تمت إضافة البطاقة "${newCard.frontText}" بنجاح إلى المجلد 🎴`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.warn("Fallback local card creation:", err);
      // Fallback local card
      const matchArt = tokenText.trim().match(/^(der|die|das)\s+(.+)$/i);
      const cleanFront = matchArt ? matchArt[2].trim() : tokenText.trim();
      const articleFound = matchArt ? matchArt[1].toLowerCase() : "";

      let cachedFolders: Folder[] = [];
      let cachedCards: Flashcard[] = [];
      try {
        cachedFolders = JSON.parse(localStorage.getItem("cached_folders") || "[]");
        cachedCards = JSON.parse(localStorage.getItem("cached_cards") || "[]");
      } catch (e) {}

      const newCard: Flashcard = {
        id: `card-${Date.now()}`,
        folderId: card.folderId || (cachedFolders[0]?.id || ""),
        frontText: cleanFront,
        frontLang: card.frontLang || "de",
        backText: tokenText.trim(),
        backLang: "ar",
        translationHint: "بطاقة مضافة من جلسة المراجعة الذكية",
        isArticleMode: !!articleFound,
        correctArticle: articleFound,
        frontImage: `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanFront)}%20clear%20photo%20isolated%20educational?width=512&height=512&nologo=true`,
        autoImageCandidates: [`https://image.pollinations.ai/prompt/${encodeURIComponent(cleanFront)}%20clear%20photo%20isolated%20educational?width=512&height=512&nologo=true`],
        difficulty: "medium",
        createdAt: new Date().toISOString(),
        streak: 0
      };

      const updatedCards = [newCard, ...cachedCards];
      try {
        localStorage.setItem("cached_cards", JSON.stringify(updatedCards));
      } catch (e) {}

      fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: cachedFolders, cards: updatedCards })
      }).catch(console.error);

      setToastMessage(`تمت إضافة البطاقة "${tokenText}" بنجاح 🎴`);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    if (window.confirm("هل ترغب في مسح سجل محادثة هذه البطاقة؟")) {
      setMessages([]);
      localStorage.removeItem(`review_chat_history_${card.id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  const quickPrompts = [
    { icon: "💡", label: "شرح الكلمة والأصل", prompt: `اشرح لي بالتفصيل معنى وأصل الكلمة "${card.frontText}" واستخداماتها الدقيقة.` },
    { icon: "✍️", label: "3 جمل سياقية واقعية", prompt: `أعطني 3 جمل يومية واقعية ومتنوعة مستخدمة من قبل الناطقين الأصليين تحتوي على "${card.frontText}" مع الترجمة.` },
    { icon: "🔍", label: "القواعد والإعراب والأداة", prompt: `اشرح لي القواعد النحوية المرتبطة بـ "${card.frontText}" ${card.correctArticle ? `(أداة التعريف ${card.correctArticle})` : ''} وصيغ الجمع أو تصريفات الفعل مع الضمائر.` },
    { icon: "⚖️", label: "الفروقات والمرادفات", prompt: `ما هي أهم المرادفات لـ "${card.frontText}" وما الفرق الدقيق بينها في الاستخدام اليومي؟` },
    { icon: "🎯", label: "اختبرني بسؤال أو تمرين", prompt: `اطرح علي سؤالاً أو تمرين إكمال فراغ لاختبار فهمي للكلمة "${card.frontText}".` }
  ];

  const imageQuickPrompts = [
    {
      icon: "🖼️",
      label: "شرح بصري شامل مع صور",
      prompt: `اشرح لي الكلمة "${card.correctArticle ? card.correctArticle + ' ' : ''}${card.frontText}" بالتفصيل مع إرفاق صور توضيحية عالية الجودة للأشياء والمفاهيم المرتبطة بها.`
    },
    {
      icon: "🧩",
      label: "صور لمكونات وأجزاء الكلمة",
      prompt: `اعرض لي صوراً توضيحية لمكونات وتفاصيل "${card.frontText}" مع تسمية ونطق كل جزء باللغة ${card.frontLang === 'de' ? 'الألمانية' : 'الإنجليزية'}.`
    },
    {
      icon: "📸",
      label: "صور لسياقات الاستخدام الواقعية",
      prompt: `أريد صوراً توضيحية لمواقف وسياقات استخدام "${card.frontText}" في الحياة اليومية مع أمثلة عملية.`
    },
    {
      icon: "⚖️",
      label: "مقارنة مرئية بالصور مع كلمات مشابهة",
      prompt: `قارن بالصور التوضيحية بين "${card.frontText}" وأقرب الكلمات المشابهة أو المرادفات مع توضيح الفروقات بدقة.`
    }
  ];

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-md select-none animate-fadeIn"
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* High-Resolution Fullscreen Lightbox Modal */}
      <AnimatePresence>
        {activeLightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000002] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-6 select-none"
            onClick={(e) => {
              e.stopPropagation();
              setActiveLightbox(null);
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveLightbox(null);
              }}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shadow-lg z-10"
              title="إغلاق الصورة المكبرة"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className="max-w-4xl max-h-[82vh] w-full flex flex-col items-center justify-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative max-h-[68vh] max-w-full rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-slate-950 flex items-center justify-center">
                <img
                  src={activeLightbox.url}
                  alt={activeLightbox.caption || activeLightbox.query || "الصورة"}
                  referrerPolicy="no-referrer"
                  className="max-h-[68vh] max-w-full object-contain rounded-2xl"
                />
              </div>

              <div className="w-full max-w-xl bg-slate-900/95 border border-slate-700/80 rounded-2xl p-3.5 text-center space-y-2 shadow-xl backdrop-blur-md">
                {activeLightbox.caption && (
                  <div className="text-sm sm:text-base font-bold text-white leading-relaxed" dir="auto">
                    {activeLightbox.caption}
                  </div>
                )}
                {activeLightbox.keyword && (
                  <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
                    <button
                      type="button"
                      onClick={() => {
                        if (onPlayPronunciation) {
                          onPlayPronunciation(activeLightbox.keyword!, card.frontLang || "de");
                        } else {
                          try {
                            window.speechSynthesis.cancel();
                            const u = new SpeechSynthesisUtterance(activeLightbox.keyword!);
                            window.speechSynthesis.speak(u);
                          } catch (e) {}
                        }
                      }}
                      className="flex items-center gap-1.5 font-bold font-sans text-indigo-300 hover:text-white bg-indigo-950/80 border border-indigo-500/40 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                    >
                      <span>{activeLightbox.keyword}</span>
                      <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Toast Alert Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000001] bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400/60 text-xs sm:text-sm font-bold"
          >
            <CheckCircle2 className="w-4 h-4 text-white" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="w-full max-w-3xl h-[92vh] max-h-[850px] bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP HEADER */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
          {/* Right: AI Title & Active Word */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">المساعد اللغوي</h3>
              <span className="text-slate-600">•</span>
              <span className="text-xs font-extrabold text-indigo-300 font-sans dir-ltr">
                {card.correctArticle ? `${card.correctArticle} ` : ''}{card.frontText}
              </span>
            </div>
          </div>

          {/* Left: Actions (Settings, Context, Clear, Close) */}
          <div className="flex items-center gap-1.5">
            {/* Model & Settings Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="اختيار الموديل"
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1 border ${
                isSettingsOpen
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                  : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700/60"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-medium">الموديل</span>
            </button>

            {/* Clear History */}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                title="مسح المحادثة"
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 border border-slate-700/60 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Exit Button */}
            <button
              type="button"
              onClick={onClose}
              title="إغلاق"
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CONTEXT INSPECTOR DRAWER */}
        <AnimatePresence>
          {isContextDrawerOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-slate-950/95 border-b border-slate-800 p-4 shrink-0 overflow-y-auto max-h-60 z-20 text-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-1.5">
                  <span className="font-bold text-indigo-400">سياق البيئة والبطاقات (Context Awareness):</span>
                  <span>المجلد: {folderInfo?.name || "بدون اسم"}</span>
                </div>

                {/* Previous 5 */}
                <div>
                  <span className="text-[11px] font-bold text-slate-400 block mb-1">
                    ⏮️ البطاقات السابقة (الـ 5 السابقة):
                  </span>
                  {previousCards.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {previousCards.slice(-5).map((c, i) => (
                        <div key={c.id || i} className="bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 rounded-lg text-[11px] flex justify-between">
                          <span className="font-sans font-bold text-slate-300">{c.correctArticle ? `${c.correctArticle} ` : ''}{c.frontText}</span>
                          <span className="text-slate-400">{c.backText}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 text-[10px]">لا توجد بطاقات سابقة</span>
                  )}
                </div>

                {/* Current */}
                <div className="p-2 bg-indigo-950/40 border border-indigo-600/40 rounded-xl">
                  <span className="text-[11px] font-bold text-indigo-300 block mb-1">
                    🃏 البطاقة الحالية النشطة:
                  </span>
                  <div className="flex items-center justify-between text-white font-bold font-sans">
                    <span>{card.correctArticle ? `${card.correctArticle} ` : ''}{card.frontText} {card.pluralText ? `(جمع: ${card.pluralText})` : ''}</span>
                    <span className="text-indigo-200 font-normal">{card.backText}</span>
                  </div>
                  {card.translationHint && (
                    <p className="text-[10px] text-slate-400 mt-1">تلميح/وصف: {card.translationHint}</p>
                  )}
                </div>

                {/* Next 5 */}
                <div>
                  <span className="text-[11px] font-bold text-slate-400 block mb-1">
                    ⏭️ البطاقات التالية (الـ 5 التالية):
                  </span>
                  {nextCards.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {nextCards.slice(0, 5).map((c, i) => (
                        <div key={c.id || i} className="bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 rounded-lg text-[11px] flex justify-between">
                          <span className="font-sans font-bold text-slate-300">{c.correctArticle ? `${c.correctArticle} ` : ''}{c.frontText}</span>
                          <span className="text-slate-400">{c.backText}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 text-[10px]">لا توجد بطاقات تالية</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CHAT MESSAGES BODY */}
        <div
          ref={chatScrollContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 select-text"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto my-auto space-y-4 py-8">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <p className="text-sm text-slate-300 font-medium">
                اسأل عن القواعد، المعاني، أو اطلب جمل وأمثلة توضيحية
              </p>

              {/* Quick Prompts */}
              <div className="w-full flex flex-wrap items-center justify-center gap-2 pt-2">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(qp.prompt)}
                    className="px-3 py-1.5 bg-slate-800/90 hover:bg-indigo-600/20 hover:border-indigo-500/50 border border-slate-700/80 rounded-xl text-xs text-slate-200 transition-all cursor-pointer active:scale-95 text-right shadow-sm flex items-center gap-1.5"
                  >
                    <span>{qp.icon}</span>
                    <span>{qp.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* LOAD MORE MESSAGES BUTTON (PAGINATION) */}
              {messages.length > visibleCount && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 10)}
                    className="px-3.5 py-1.5 bg-slate-800/90 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-300 font-bold text-xs rounded-full border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer shadow-sm flex items-center gap-1.5 active:scale-95"
                    title="تحميل 10 رسائل سابقة"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                    <span>عرض 10 رسائل أقدم ({messages.length - visibleCount} متبقية)</span>
                  </button>
                </div>
              )}

              {messages.slice(-visibleCount).map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-start" : "items-end"}`}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-xs font-medium"
                        : "bg-slate-800/90 border border-slate-700/70 text-slate-100 rounded-bl-xs"
                    }`}
                  >
                    {/* Render message with clean layout */}
                    {msg.role === "user" ? (
                      <div className="whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="pt-1">
                        <FormattedChatMessage
                          text={msg.content}
                          onSpeak={(txt) => {
                            if (onPlayPronunciation) {
                              onPlayPronunciation(txt, card.frontLang || "de");
                            } else {
                              try {
                                window.speechSynthesis.cancel();
                                const u = new SpeechSynthesisUtterance(txt);
                                window.speechSynthesis.speak(u);
                              } catch (e) {}
                            }
                          }}
                          onCopy={(txt) => {
                            navigator.clipboard.writeText(txt);
                          }}
                          onCreateCard={handleCreateCardFromToken}
                          onOpenLightbox={(imgUrl, caption, keyword, query) => {
                            setActiveLightbox({
                              url: imgUrl,
                              caption,
                              keyword,
                              query
                            });
                          }}
                        />

                        {/* Subtle bottom separator with tiny model name matching message background */}
                        <div className="mt-2 pt-1.5 border-t border-slate-700/30 flex items-center justify-between select-none bg-transparent">
                          <span className="text-[8.5px] text-slate-400/70 font-normal tracking-wide">
                            {AVAILABLE_MODELS.find((m) => m.id === (msg.modelUsed || selectedModel))?.name || msg.modelUsed || selectedModel}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-indigo-400 bg-slate-800/60 border border-slate-700/50 px-4 py-2 rounded-2xl w-fit animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs font-semibold">جارٍ صياغة الرد...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* INPUT FOOTER WITH TELEGRAM/WHATSAPP STYLE PROMPT MENU & IMAGES MENU */}
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 bg-slate-950/90 border-t border-slate-800/80 shrink-0 relative">
          {/* Telegram-style Quick Prompts Popup Window */}
          <AnimatePresence>
            {isPromptsMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                className="absolute bottom-full mb-3 right-3 left-3 sm:right-4 sm:left-auto sm:w-[420px] bg-slate-900/98 backdrop-blur-xl border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden z-30 p-2 space-y-1.5"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-800 text-xs font-bold text-slate-300">
                  <div className="flex items-center gap-1.5 text-indigo-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>اقتراحات وأسئلة سريعة</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPromptsMenuOpen(false)}
                    className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 p-0.5 custom-scrollbar">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setIsPromptsMenuOpen(false);
                        handleSendMessage(qp.prompt);
                      }}
                      className="w-full text-right p-2.5 rounded-xl hover:bg-indigo-600/15 hover:border-indigo-500/40 border border-transparent transition-all flex items-start gap-2.5 group cursor-pointer"
                    >
                      <span className="text-base shrink-0 mt-0.5">{qp.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-extrabold text-slate-200 group-hover:text-indigo-300 transition-colors">
                          {qp.label}
                        </div>
                        <div className="text-[10.5px] text-slate-400 font-normal line-clamp-1 mt-0.5">
                          {qp.prompt}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Telegram-style Images Menu Popup Window */}
          <AnimatePresence>
            {isImageMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                className="absolute bottom-full mb-3 right-3 left-3 sm:right-28 sm:left-auto sm:w-[420px] bg-slate-900/98 backdrop-blur-xl border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden z-30 p-2 space-y-1.5"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-800 text-xs font-bold text-slate-300">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>طلب صور توضيحية</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImageMenuOpen(false)}
                    className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Toggle Mode Option */}
                <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                  <div className="text-start">
                    <div className="text-xs font-bold text-slate-200">تضمين صور مع كل رسالة</div>
                    <div className="text-[10px] text-slate-400">يجلب الذكاء صوراً بصرية داعمة تلقائياً</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImageMode(!isImageMode)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      isImageMode
                        ? "bg-emerald-600 border-emerald-400 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {isImageMode ? "مفعّل ✓" : "معطّل"}
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 p-0.5 custom-scrollbar">
                  {imageQuickPrompts.map((iqp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setIsImageMenuOpen(false);
                        handleSendMessage(iqp.prompt, true);
                      }}
                      className="w-full text-right p-2.5 rounded-xl hover:bg-emerald-600/15 hover:border-emerald-500/40 border border-transparent transition-all flex items-start gap-2.5 group cursor-pointer"
                    >
                      <span className="text-base shrink-0 mt-0.5">{iqp.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-extrabold text-slate-200 group-hover:text-emerald-300 transition-colors">
                          {iqp.label}
                        </div>
                        <div className="text-[10.5px] text-slate-400 font-normal line-clamp-1 mt-0.5">
                          {iqp.prompt}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Small borderless/transparent quick prompts and images trigger above textarea */}
          <div className="flex items-center justify-between px-1 mb-1.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsPromptsMenuOpen(!isPromptsMenuOpen);
                  setIsImageMenuOpen(false);
                }}
                title="فتح قائمة الاقتراحات السريعة"
                className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-indigo-300 transition-colors bg-transparent border-0 p-0 cursor-pointer select-none"
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>اقتراحات سريعة</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsImageMenuOpen(!isImageMenuOpen);
                  setIsPromptsMenuOpen(false);
                }}
                title="فتح قائمة طلب الصور"
                className={`flex items-center gap-1 text-[11px] font-bold transition-colors bg-transparent border-0 p-0 cursor-pointer select-none ${
                  isImageMode ? "text-emerald-400 font-extrabold" : "text-slate-400 hover:text-emerald-300"
                }`}
              >
                <ImageIcon className="w-3 h-3 text-emerald-400" />
                <span>صور {isImageMode && "✓"}</span>
              </button>
            </div>

            {isImageMode && (
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800/60">
                وضع الصور مفعّل
              </span>
            )}
          </div>

          <div className="flex items-end gap-2 bg-slate-900/90 border border-slate-700/60 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20 rounded-2xl p-2 sm:p-2.5 transition-all shadow-inner">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder=""
              rows={2}
              className="flex-1 min-h-[64px] sm:min-h-[76px] bg-transparent border-0 outline-none resize-none text-sm sm:text-base font-semibold text-slate-100 p-1.5 leading-relaxed"
            />

            <button
              type="button"
              disabled={!inputMessage.trim() || isLoading}
              onClick={() => handleSendMessage()}
              className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 ${
                inputMessage.trim() && !isLoading
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 active:scale-95"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
              }`}
              title="إرسال"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 rtl:rotate-180" />
                  <span className="hidden sm:inline">إرسال</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* SETTINGS POPUP MODAL (نافذة منبثقة بدل نافذة منسدلة) */}
        <AnimatePresence>
          {isSettingsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">إعدادات المحادثة والذكاء الاصطناعي</h4>
                      <p className="text-[11px] text-slate-400">تخصيص النموذج وصوت النطق وطول الإجابات</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 text-right">
                  {/* 1. AI Model Dropdown */}
                  <div>
                    <label className="text-xs font-bold text-slate-200 block mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Bot className="w-4 h-4 text-indigo-400" />
                        <span>نموذج الذكاء الاصطناعي (AI Model):</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                        {AVAILABLE_MODELS.find(m => m.id === selectedModel)?.tag || "محدد"}
                      </span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold cursor-pointer appearance-none pl-8"
                      >
                        {AVAILABLE_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — [{m.tag}]
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {AVAILABLE_MODELS.find(m => m.id === selectedModel)?.desc}
                    </p>
                  </div>

                  {/* 2. Voice Model Dropdown (اختيار صوت الموديل المحدد) */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <label className="text-xs font-bold text-slate-200 block mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                        <span>صوت محرك النطق (Voice Model):</span>
                      </span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-semibold cursor-pointer appearance-none pl-8"
                      >
                        {AVAILABLE_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.flag} {v.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {AVAILABLE_VOICES.find(v => v.id === selectedVoice)?.desc}
                    </p>
                  </div>

                  {/* 3. Response Length Selector */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <label className="text-xs font-bold text-slate-200 block mb-1.5">
                      📏 حجم وطبيعة الإجابة:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "concise", label: "⚡ مختصر", desc: "نقاط سريعة" },
                        { id: "balanced", label: "⚖️ متوازن", desc: "أمثلة وشرح" },
                        { id: "detailed", label: "📚 مفصل", desc: "جداول وسياق" }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setResponseLength(item.id as any)}
                          className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                            responseLength === item.id
                              ? "bg-indigo-600/25 border-indigo-500 text-indigo-300 font-bold ring-1 ring-indigo-500/50"
                              : "bg-slate-950 hover:bg-slate-800 border-slate-700/60 text-slate-400"
                          }`}
                        >
                          <span className="text-xs">{item.label}</span>
                          <span className="text-[9.5px] text-slate-500 mt-0.5">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    حفظ وإغلاق
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
