import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  FolderPlus, 
  HelpCircle, 
  Check, 
  Loader2, 
  Volume2, 
  Folder, 
  Layers, 
  BookOpen, 
  ChevronRight, 
  Compass, 
  Trash2, 
  Pencil, 
  Plus, 
  X, 
  AlertCircle,
  Play,
  FileText,
  Image as ImageIcon,
  Image,
  Download,
  Save,
  CheckSquare,
  Code,
  Globe,
  ChevronLeft,
  RectangleVertical,
  RefreshCw,
  Sliders,
  ChevronDown,
  Wand2,
  Menu,
  Cpu,
  Activity,
  Coins,
  Gauge,
  Clock,
  Info,
  Hash,
  Copy,
  ExternalLink,
  Upload,
  DownloadCloud,
  CheckCircle2,
  Search
} from "lucide-react";
import { Folder as FolderType, Flashcard, getSafeImageStyle, TranscriptDocument, getCardSearchQuery } from "../types";
import { ImageWithSkeleton } from "./ReviewSession";
import { speakClient, EditCardModal, ImagePickerModal, preloadImage } from "./Modals";
import { BrowseCard } from "./BrowseCard";
import { motion, AnimatePresence } from "motion/react";
import { CodeViewer } from "./CodeViewer";

interface AIWorkspaceProps {
  folders: FolderType[];
  cards: Flashcard[];
  activeFolderId: string;
  onSelectFolder: (id: string) => void;
  onImportGenerated: (
    generatedFolder: Omit<FolderType, "id" | "createdAt" | "updatedAt"> | null,
    generatedCards: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak">[],
    targetFolderId: string | null
  ) => void;
  onBackToLibrary: () => void;
  aiRefineFolderId?: string | null;
  onClearAiRefineFolderId?: () => void;
  onSaveRefinedFolder?: (
    folderId: string,
    updatedFolder: { name: string; description?: string; color: string; coverImage?: string; coverImagePosition?: string },
    updatedCards: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak">[]
  ) => void;
  onTrashAiFolder?: (folder: AIFolder, cards: AICard[]) => void;
  onTrashAiCard?: (card: AICard) => void;
  onTrashAiCards?: (cards: AICard[]) => void;
  onToggleSidebar?: () => void;
  transcripts?: TranscriptDocument[];
  initialSelectedTranscriptId?: string | null;
  onClearInitialSelectedTranscriptId?: () => void;
}

export interface AIFolder {
  id: string;
  name: string;
  description?: string;
  color: string;
  frontLang: string;
  backLang: string;
  prompt: string;
  createdAt: string;
  frontInstructions?: string;
  backInstructions?: string;
  descInstructions?: string;
  imageInstructions?: string;
  descriptionMode?: "on" | "off" | "auto";
  imagesMode?: "on" | "off" | "auto";
  germanArticlesMode?: "on" | "off" | "auto";
  germanPluralMode?: "on" | "off" | "auto";
  germanPluralInstruction?: string;
  customFolderName?: string;
  customFolderDesc?: string;
  folderDescMode?: "on" | "off" | "auto";
  folderDescCondition?: string;
  coverImage?: string;
  coverImagePosition?: string;
}

export interface AICard {
  id: string;
  folderId: string;
  frontText: string;
  backText: string;
  isArticleMode?: boolean;
  correctArticle?: "der" | "die" | "das" | "";
  translationHint?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  frontImage?: string;
  frontImagePosition?: string;
  isPluralMode?: boolean;
  pluralText?: string;
  pluralLang?: string;
}

const SUGGESTIONS = [
  {
    title: "مفردات السفر بالفرنسية",
    prompt: "أنشئ لي 8 بطاقات لتعلم مفردات السفر الأساسية باللغة الفرنسية مع الترجمة العربية وتلميحات النطق.",
    icon: "🇫🇷"
  },
  {
    title: "مفردات الطقس بالألمانية",
    prompt: "أنشئ لي مجلداً لتعلم كلمات الطقس بالألمانية مع تفعيل وضع أدوات التعريف der/die/das للأسماء.",
    icon: "🇩🇪"
  },
  {
    title: "مصطلحات الذكاء الاصطناعي",
    prompt: "أنشئ لي بطاقات دراسية لشرح مصطلحات الذكاء الاصطناعي المعقدة بالإنجليزية مع ترجمتها ومفهومها بالعربية.",
    icon: "🤖"
  },
  {
    title: "صيغ الكيمياء غير العضوية",
    prompt: "أنشئ لي 6 بطاقات للمركبات الكيميائية وصيغها (مثال: الماء H2O، ثاني أكسيد الكربون CO2) مع شرح بسيط.",
    icon: "🧪"
  }
];

const formatArabicResetTime = (timeStr: string) => {
  if (!timeStr) return "";
  const val = timeStr.trim();
  
  const hoursMatch = val.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minsMatch = val.match(/(\d+(?:\.\d+)?)\s*m(?!s)/i);
  const secsMatch = val.match(/(\d+(?:\.\d+)?)\s*s/i);
  const msMatch = val.match(/(\d+(?:\.\d+)?)\s*ms/i);

  const parts: string[] = [];
  if (hoursMatch) {
    parts.push(`${hoursMatch[1]} س`);
  }
  if (minsMatch) {
    parts.push(`${minsMatch[1]} د`);
  }
  if (secsMatch) {
    const secVal = parseFloat(secsMatch[1]);
    let secFormatted;
    if (Number.isInteger(secVal)) {
      secFormatted = secVal;
    } else if (secVal < 1) {
      secFormatted = secVal.toFixed(2);
    } else {
      secFormatted = secVal.toFixed(1);
    }
    parts.push(`${secFormatted} ث`);
  } else if (msMatch) {
    parts.push(`${msMatch[1]} م.ث`);
  }

  if (parts.length === 0) {
    return val
      .replace(/h/gi, " س")
      .replace(/m(?!s)/gi, " د")
      .replace(/ms/gi, " م.ث")
      .replace(/s/gi, " ث");
  }

  return parts.join(" و ");
};

export interface AIRequestLog {
  id: string;
  timestamp: string;
  prompt: string;
  rawPrompt?: string;
  response?: string;
  provider: "gemini" | "groq";
  model: string;
  status: "success" | "failed";
  cardsCount: number | "auto";
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  rateLimitInfo?: {
    limitType?: string;
    limit?: number;
    used?: number;
    requested?: number;
    resetIn?: string;
  };
  rawRequestBody?: string;
  rawResponseBody?: string;
}

export interface ParsedRateLimit {
  model?: string;
  limitType?: string;
  limit?: number;
  used?: number;
  requested?: number;
  resetIn?: string;
}

export const parseRateLimitError = (errorMsg: string): ParsedRateLimit | null => {
  if (!errorMsg) return null;
  const res: ParsedRateLimit = {};
  
  // Extract model name
  const modelMatch = errorMsg.match(/model `([^`]+)`/) || errorMsg.match(/model ([^\s]+)/);
  if (modelMatch) {
    res.model = modelMatch[1];
  }
  
  // Extract limit type
  const limitTypeMatch = errorMsg.match(/\(([A-Z]{3,4})\)/);
  if (limitTypeMatch) {
    res.limitType = limitTypeMatch[1];
  } else if (errorMsg.includes("tokens per day")) {
    res.limitType = "TPD";
  } else if (errorMsg.includes("requests per minute")) {
    res.limitType = "RPM";
  } else if (errorMsg.includes("tokens per minute")) {
    res.limitType = "TPM";
  } else if (errorMsg.includes("requests per day")) {
    res.limitType = "RPD";
  }
  
  // Extract Limit, Used, Requested numbers
  const limitMatch = errorMsg.match(/Limit\s+([0-9]+)/i);
  if (limitMatch) {
    res.limit = parseInt(limitMatch[1], 10);
  }
  
  const usedMatch = errorMsg.match(/Used\s+([0-9]+)/i);
  if (usedMatch) {
    res.used = parseInt(usedMatch[1], 10);
  }
  
  const requestedMatch = errorMsg.match(/Requested\s+([0-9]+)/i);
  if (requestedMatch) {
    res.requested = parseInt(requestedMatch[1], 10);
  }
  
  // Extract reset in time
  const resetMatch = errorMsg.match(/try again in\s+([a-zA-Z0-9\.]+)/i);
  if (resetMatch) {
    res.resetIn = resetMatch[1];
  }
  
  if (res.limit || res.used || res.resetIn || res.limitType) {
    return res;
  }
  return null;
};

export const AIWorkspace: React.FC<AIWorkspaceProps> = React.memo(({
  folders,
  cards,
  activeFolderId,
  onSelectFolder,
  onImportGenerated,
  onBackToLibrary,
  aiRefineFolderId,
  onClearAiRefineFolderId,
  onSaveRefinedFolder,
  onTrashAiFolder,
  onTrashAiCard,
  onTrashAiCards,
  onToggleSidebar,
  transcripts = [],
  initialSelectedTranscriptId = null,
  onClearInitialSelectedTranscriptId
}) => {
  const [prompt, setPrompt] = useState("");
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string>(() => {
    return initialSelectedTranscriptId || "";
  });

  // Synchronize initial selection if passed from parent
  useEffect(() => {
    if (initialSelectedTranscriptId) {
      setSelectedTranscriptId(initialSelectedTranscriptId);
    }
  }, [initialSelectedTranscriptId]);

  // Pre-fill prompt if a transcript is selected and prompt is empty
  useEffect(() => {
    if (selectedTranscriptId && transcripts && transcripts.length > 0) {
      const found = transcripts.find(t => t.id === selectedTranscriptId);
      if (found && !prompt) {
        setPrompt(`استخرج أهم المفردات والمفاهيم والأسئلة الدراسية من وثيقة التفريغ: ${found.title}`);
      }
    }
  }, [selectedTranscriptId, transcripts]);

  const [cardsCount, setCardsCount] = useState<number | "auto">(10);
  const [frontInstructions, setFrontInstructions] = useState("");
  const [backInstructions, setBackInstructions] = useState("");
  const [descInstructions, setDescInstructions] = useState("");
  const [imageInstructions, setImageInstructions] = useState("");
  const [descriptionMode, setDescriptionMode] = useState<"on" | "off" | "auto">("auto");
  const [imagesMode, setImagesMode] = useState<"on" | "off" | "auto">("auto");
  const [germanArticlesMode, setGermanArticlesMode] = useState<"on" | "off" | "auto">("auto");
  const [germanPluralMode, setGermanPluralMode] = useState<"on" | "off" | "auto">("auto");
  const [germanPluralInstruction, setGermanPluralInstruction] = useState("");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<"general" | "smart" | "german">("general");
  const [cardPluralToggle, setCardPluralToggle] = useState<Record<string, boolean>>({});
  const [customFolderName, setCustomFolderName] = useState("");
  const [customFolderDesc, setCustomFolderDesc] = useState("");
  const [folderDescMode, setFolderDescMode] = useState<"on" | "off" | "auto">("auto");
  const [folderDescCondition, setFolderDescCondition] = useState("");
  
  // Image Fetching & Storage Options States
  const [primaryImageTiming, setPrimaryImageTiming] = useState<"auto_after_ai" | "manual_download">(() => {
    try {
      return (localStorage.getItem("settings_primary_image_timing") as any) || "auto_after_ai";
    } catch {
      return "auto_after_ai";
    }
  });

  const [primaryImageStorageMode, setPrimaryImageStorageMode] = useState<"direct_url" | "data_url">(() => {
    try {
      return (localStorage.getItem("settings_primary_image_storage") as any) || "data_url";
    } catch {
      return "data_url";
    }
  });

  const [secondaryImagesStorageMode, setSecondaryImagesStorageMode] = useState<"direct_urls" | "data_urls">(() => {
    try {
      return (localStorage.getItem("settings_secondary_images_storage") as any) || "data_urls";
    } catch {
      return "data_urls";
    }
  });

  const [imageSearchQuerySource, setImageSearchQuerySource] = useState<"smart_auto" | "front_text_only" | "back_text_only" | "combined_front_back" | "custom_query_only">(() => {
    try {
      return (localStorage.getItem("settings_image_search_query_source") as any) || "smart_auto";
    } catch {
      return "smart_auto";
    }
  });

  const getCardQueryTerm = React.useCallback((card: { frontText?: string; backText?: string; imageSearchQuery?: string }) => {
    return getCardSearchQuery(card);
  }, []);

  const [showImageOptionsModal, setShowImageOptionsModal] = useState(false);
  const [includeAuto10Images, setIncludeAuto10Images] = useState(true);

  // Image fetch progress & storage states matching Library (المكتبة)
  const [isFetchingImages, setIsFetchingImages] = useState(false);
  const [imageFetchProgress, setImageFetchProgress] = useState<{
    current: number;
    total: number;
    currentItem: string;
    currentPreview?: string;
  }>({ current: 0, total: 0, currentItem: "", currentPreview: undefined });
  const [imageFetchSuccess, setImageFetchSuccess] = useState(false);

  const handleDownloadSingleImageFile = React.useCallback(async (imageUrl: string, filename: string) => {
    try {
      if (imageUrl.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = imageUrl;
        a.download = `${filename || "image"}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const response = await fetch(imageUrl, { mode: "cors" });
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${filename || "image"}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        window.open(imageUrl, "_blank");
      }
    } catch (e) {
      window.open(imageUrl, "_blank");
    }
  }, []);

  // Helper to convert external image URL to Data URL (base64) for offline persistence fast & safely
  const convertUrlToDataUrl = async (url: string): Promise<string> => {
    if (!url) return "";
    if (url.startsWith("data:")) return url;

    try {
      const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      const proxyBase = isLocalhost ? "http://localhost:3000/api/proxy-image" : "/api/proxy-image";
      const proxyUrl = `${proxyBase}?url=${encodeURIComponent(url)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500); // Fast 3.5s timeout

      let res = await fetch(proxyUrl, { signal: controller.signal }).catch(() => null);
      clearTimeout(timeoutId);

      if (!res || !res.ok) {
        // Fallback retry direct fetch with short timeout
        const ctrl2 = new AbortController();
        const tid2 = setTimeout(() => ctrl2.abort(), 2000);
        res = await fetch(url, { signal: ctrl2.signal }).catch(() => null);
        clearTimeout(tid2);
      }

      if (res && res.ok) {
        const blob = await res.blob();
        if (blob.size > 100) {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string) || url);
            reader.onerror = () => resolve(url);
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch (err) {
      console.warn("Data URL conversion fallback to original URL:", err);
    }
    return url;
  };
  
  // External Prompt & Data Import Mode States
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [externalTab, setExternalTab] = useState<"prompt" | "import">("prompt");
  const [externalJsonInput, setExternalJsonInput] = useState("");
  const [externalError, setExternalError] = useState<string | null>(null);
  const [externalCopySuccess, setExternalCopySuccess] = useState(false);
  const [externalImporting, setExternalImporting] = useState(false);
  const [externalImportProgress, setExternalImportProgress] = useState("");

  const fetchImageForQuery = async (query: string, timeoutMs = 8000): Promise<string | undefined> => {
    if (!query || !query.trim() || imagesMode === "off") return undefined;
    
    let finalQuery = query.trim();
    if (imageInstructions && imageInstructions.trim()) {
      finalQuery = `${finalQuery} ${imageInstructions.trim()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`/api/images?q=${encodeURIComponent(finalQuery)}&page=1`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }

      const data = await res.json();
      if (data && data.hits && data.hits.length > 0) {
        return data.hits[0].largeImageURL || data.hits[0].webformatURL || undefined;
      }
      return undefined;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  const constructFullExternalPrompt = (userPrompt: string): string => {
    const isAuto = cardsCount === "auto";
    const requestedCardsCount = typeof cardsCount === "number" ? Math.min(Math.max(cardsCount, 1), 50) : 10;
    
    let transcriptText = "";
    if (selectedTranscriptId && transcripts && transcripts.length > 0) {
      const found = transcripts.find(t => t.id === selectedTranscriptId);
      if (found) {
        transcriptText = found.segments.map(s => s.text).join(" ");
      }
    }

    let promptText = `أنت مساعد ذكي متخصص في توليد البطاقات التعليمية (Flashcards) والمجلدات لمساعدة الطلاب على الدراسة والمذاكرة بذكاء (StudySmarter).
تلقيت طلباً بلغة عربية لإنشاء بطاقات تعليمية موضوعها: "${userPrompt.trim() || 'موضوع تعليمي عام'}"

المطلوب منك إرجاع كود JSON مجرد فقط (Valid Raw JSON Object) بالهيكل والتنسيق الدقيق التالي:

{
  "folder": {
    "name": "${customFolderName.trim() || 'اسم المجلد باللغة العربية'}",
    "description": "${customFolderDesc.trim() || 'وصف المجلد باللغة العربية'}",
    "color": "#0056f6",
    "frontLang": "en",
    "backLang": "ar",
    "imageSearchQuery": "كلمة بالإنجليزية لغلاف المجلد"
  },
  "cards": [
    {
      "frontText": "الكلمة أو السؤال باللغة الهدف",
      "backText": "الترجمة أو الإجابة باللغة العربية",
      "isArticleMode": false,
      "correctArticle": "",
      "isPluralMode": false,
      "pluralText": "",
      "pluralLang": "de",
      "translationHint": "تلميح أو توضيح نطق (اختياري)",
      "difficulty": "medium",
      "imageSearchQuery": "كلمة بالإنجليزية لبحث الصور"
    }
  ]
}

⚠️ القواعد والتفاصيل الهامة المحددة:
`;

    if (!isAuto) {
      promptText += `- عدد البطاقات المطلوبة في مصفوفة cards هو بالضبط ${requestedCardsCount} بطاقة دون زيادة أو نقصان.\n`;
    } else {
      promptText += `- قم بإنشاء عدد كافٍ ومناسب من البطاقات لشمول الموضوع وتغطيته تلقائياً.\n`;
    }

    if (descriptionMode === "on") {
      promptText += `- يجب كتابة وصف/تلميح translationHint مفيد لكل بطاقة.\n`;
    } else if (descriptionMode === "off") {
      promptText += `- اجعل حقل translationHint دائماً نصاً فارغاً "".\n`;
    }

    if (germanArticlesMode === "on") {
      promptText += `- تفعيل أدوات التعريف الألمانية (isArticleMode = true) لكل الأسماء وحدد الأداة المناسبة (der/die/das/die-plural) في correctArticle.\n`;
    } else if (germanArticlesMode === "off") {
      promptText += `- إيقاف أدوات التعريف (isArticleMode = false) و correctArticle = "".\n`;
    }

    if (germanPluralMode === "on") {
      promptText += `- تفعيل صيغة الجمع (isPluralMode = true) وتوفير الجمع في حقل pluralText.\n`;
    } else if (germanPluralMode === "off") {
      promptText += `- إيقاف صيغة الجمع (isPluralMode = false) و pluralText = "".\n`;
    }

    if (imagesMode === "off") {
      promptText += `- اجعل حقل imageSearchQuery دائماً نصاً فارغاً "".\n`;
    } else {
      promptText += `- حقل imageSearchQuery في كل بطاقة يجب أن يتكون بالإنجليزية من الكلمة المفتاحية المحددة للبطاقة مدمجة مع النمط المطلوب (مثال لبطاقة التفاحة: "apple cartoon illustration", ولليمون: "lemon cartoon illustration"). يمنع وضع كلمة النمط العامة فقط بدون اسم البطاقة.\n`;
    }

    if (frontInstructions.trim()) {
      promptText += `- تعليمات الوجه الأمامي: ${frontInstructions.trim()}\n`;
    }
    if (backInstructions.trim()) {
      promptText += `- تعليمات الوجه الخلفي: ${backInstructions.trim()}\n`;
    }
    if (descInstructions.trim()) {
      promptText += `- تعليمات التلميح/الوصف: ${descInstructions.trim()}\n`;
    }
    if (imageInstructions.trim()) {
      promptText += `- تعليمات كلمات بحث الصور والنمط المطلوب: ${imageInstructions.trim()}\n`;
    }
    if (germanPluralInstruction.trim()) {
      promptText += `- تعليمات صيغة الجمع: ${germanPluralInstruction.trim()}\n`;
    }

    if (folderDescMode === "on") {
      promptText += `- يرجى توليد وصف غني وشامل للمجلد في حقل description داخل folder.\n`;
    } else if (folderDescMode === "off") {
      promptText += `- اجعل وصف المجلد حتمياً نصاً فارغاً "".\n`;
    }
    if (folderDescCondition.trim()) {
      promptText += `- شروط وصف المجلد: ${folderDescCondition.trim()}\n`;
    }

    if (transcriptText.trim()) {
      promptText += `\n⚠️ نص التفريغ المصاحب المرفق (spT):\n"""\n${transcriptText.trim()}\n"""\n`;
    }

    promptText += `\nرجاءً أرجِع فقط كود JSON صريح ومباشر بدون أي مقدمات أو شروحات نصية خارجية.`;

    return promptText;
  };

  const handleCopyExternalPrompt = () => {
    const fullPrompt = constructFullExternalPrompt(prompt);
    navigator.clipboard.writeText(fullPrompt);
    setExternalCopySuccess(true);
    setTimeout(() => {
      setExternalCopySuccess(false);
      setExternalTab("import");
    }, 1000);
  };

  const handleImportExternalJson = async () => {
    setExternalError(null);
    if (!externalJsonInput.trim()) {
      setExternalError("الرجاء لصق كود JSON أولاً قبل الضغط على الاستيراد.");
      return;
    }

    setExternalImporting(true);
    setExternalImportProgress("جاري تحليل بيانات JSON وتجهيز البطاقات...");

    try {
      let clean = externalJsonInput.trim();
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }

      const data = JSON.parse(clean);

      let cardsList: any[] = [];
      let folderInfo: any = {};

      if (Array.isArray(data)) {
        cardsList = data;
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.cards)) {
          cardsList = data.cards;
        }
        if (data.folder && typeof data.folder === 'object') {
          folderInfo = data.folder;
        }
      }

      if (!Array.isArray(cardsList) || cardsList.length === 0) {
        throw new Error("لم نتمكن من العثور على قائمة بطاقات (cards) صحيحة في كود JSON.");
      }

      // 1. Fetch Folder Cover Image if images mode is not off
      let folderCoverImage: string | undefined = undefined;
      if (imagesMode !== "off") {
        const folderImageQuery = folderInfo.imageSearchQuery || folderInfo.name || customFolderName.trim() || prompt.trim();
        if (folderImageQuery) {
          setExternalImportProgress(`جاري البحث عن صورة غلاف للمجلد: "${folderInfo.name || 'المجلد'}"...`);
          try {
            folderCoverImage = await fetchImageForQuery(folderImageQuery);
          } catch (e) {
            console.warn("Folder cover image fetch failed:", e);
          }
        }
      }

      const folderId = `ai-folder-${Date.now()}`;
      const newCards: AICard[] = cardsList.map((c: any, index: number) => {
        const frontImg = c.frontImage || c.image || undefined;
        return {
          id: `ai-card-${Date.now()}-${index}`,
          folderId: folderId,
          frontText: c.frontText || c.front || c.question || "",
          backText: c.backText || c.back || c.answer || "",
          isArticleMode: Boolean(c.isArticleMode),
          correctArticle: c.correctArticle || "",
          isPluralMode: Boolean(c.isPluralMode),
          pluralText: c.pluralText || "",
          pluralLang: c.pluralLang || "de",
          translationHint: c.translationHint || c.hint || "",
          difficulty: c.difficulty || "medium",
          imageSearchQuery: c.imageSearchQuery || undefined,
          frontImage: frontImg,
          frontImagePosition: frontImg ? "50% 50%" : undefined,
          autoImageCandidates: c.autoImageCandidates || (frontImg ? [frontImg] : undefined)
        };
      });

      const newFolder: AIFolder = {
        id: folderId,
        name: folderInfo.name || customFolderName.trim() || prompt.trim() || "مجلد خارجي مستورد 🌐",
        description: folderInfo.description || customFolderDesc.trim() || "تم استيراده من نموذج ذكاء اصطناعي خارجي",
        color: folderInfo.color || "#8b5cf6",
        frontLang: folderInfo.frontLang || "en",
        backLang: folderInfo.backLang || "ar",
        coverImage: folderCoverImage || undefined,
        coverImagePosition: folderCoverImage ? "50% 50%" : undefined,
        prompt: prompt.trim() || "استيراد خارجي",
        frontInstructions: frontInstructions || undefined,
        backInstructions: backInstructions || undefined,
        descInstructions: descInstructions || undefined,
        imageInstructions: imageInstructions || undefined,
        germanPluralInstruction: germanPluralInstruction || undefined,
        descriptionMode: descriptionMode,
        imagesMode: imagesMode,
        germanArticlesMode: germanArticlesMode,
        germanPluralMode: germanPluralMode,
        customFolderName: customFolderName || undefined,
        customFolderDesc: customFolderDesc || undefined,
        folderDescMode: folderDescMode,
        folderDescCondition: folderDescCondition || undefined,
        createdAt: new Date().toISOString()
      };

      const updatedFolders = [newFolder, ...aiFolders];
      const updatedCards = [...newCards, ...aiCards];

      setAiFolders(updatedFolders);
      setAiCards(updatedCards);
      localStorage.setItem("ai_workspace_folders", JSON.stringify(updatedFolders));
      localStorage.setItem("ai_workspace_cards", JSON.stringify(updatedCards));

      setActiveAiFolderId(folderId);
      setShowExternalModal(false);
      setExternalJsonInput("");
      setExternalCopySuccess(false);

      logAiRequest({
        prompt: prompt || "استيراد خارجي (External Mode)",
        rawPrompt: "استيراد يدوي لكود JSON المجلوب من نموذج خارجي مع تفعيل محرك جلب الصور",
        response: `تم استيراد ${newCards.length} بطاقة للمجلد "${newFolder.name}" بنجاح`,
        provider: "gemini",
        model: "external-json-import",
        cardsCount: newCards.length,
        status: "success"
      });

      // 2. Fetch Card Images via Centralized Unified Image Fetcher & Downloader
      if (imagesMode !== "off" && primaryImageTiming === "auto_after_ai") {
        setLoadingStatus("تم استيراد كود JSON بنجاح! جاري التوليد والجلب التلقائي الموحد للصور والروابط...");
        await handleUnifiedImageFetchAndDownload(newCards, folderId);
      }

    } catch (err: any) {
      setExternalError(`فشل تحليل كود JSON: ${err.message || 'يرجى التأكد من أن الكود الملصق هو صيغة JSON متوافقة'}`);
    } finally {
      setExternalImporting(false);
      setExternalImportProgress("");
    }
  };
  const [aiProvider, setAiProvider] = useState<"gemini" | "groq">(() => {
    try {
      return (localStorage.getItem("settings_ai_provider") as any) || "gemini";
    } catch {
      return "gemini";
    }
  });

  const handleProviderChange = (provider: "gemini" | "groq") => {
    setAiProvider(provider);
    localStorage.setItem("settings_ai_provider", provider);
  };

  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("الذكاء الاصطناعي يستعد للعمل...");
  const [error, setError] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  const [aiRequestHistory, setAiRequestHistory] = useState<AIRequestLog[]>(() => {
    try {
      const saved = localStorage.getItem("ai_request_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const logAiRequest = (params: {
    prompt: string;
    rawPrompt?: string;
    response?: string;
    provider: "gemini" | "groq";
    model: string;
    cardsCount: number | "auto";
    status: "success" | "failed";
    error?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    rawRequestBody?: string;
    rawResponseBody?: string;
  }) => {
    try {
      const parsedLimits = params.error ? parseRateLimitError(params.error) : undefined;
      const newLog: AIRequestLog = {
        id: `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        prompt: params.prompt,
        rawPrompt: params.rawPrompt,
        response: params.response,
        provider: params.provider,
        model: params.model,
        status: params.status,
        cardsCount: params.cardsCount,
        error: params.error,
        usage: params.usage,
        rateLimitInfo: parsedLimits ? {
          limitType: parsedLimits.limitType,
          limit: parsedLimits.limit,
          used: parsedLimits.used,
          requested: parsedLimits.requested,
          resetIn: parsedLimits.resetIn
        } : undefined,
        rawRequestBody: params.rawRequestBody,
        rawResponseBody: params.rawResponseBody
      };
      
      setAiRequestHistory(prev => {
        const updated = [newLog, ...prev].slice(0, 50);
        localStorage.setItem("ai_request_history", JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error("Failed to log AI request:", e);
    }
  };

  // Persistent AI Folders & Cards
  const [aiFolders, setAiFolders] = useState<AIFolder[]>(() => {
    try {
      const saved = localStorage.getItem("ai_workspace_folders");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [aiCards, setAiCards] = useState<AICard[]>(() => {
    try {
      const saved = localStorage.getItem("ai_workspace_cards");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeAiFolderId, setActiveAiFolderId] = useState<string>("");

  // Synchronize with localStorage to reflect any restorations made in the Recycle Bin
  useEffect(() => {
    try {
      const savedFolders = localStorage.getItem("ai_workspace_folders");
      const savedCards = localStorage.getItem("ai_workspace_cards");
      if (savedFolders) setAiFolders(JSON.parse(savedFolders));
      if (savedCards) setAiCards(JSON.parse(savedCards));
    } catch (e) {
      console.error("Failed to sync restored AI elements from localStorage:", e);
    }
  }, []);

  // Telemetry & Token Usage States
  const [lastAiUsage, setLastAiUsage] = useState<{
    model: string;
    provider: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>(() => {
    try {
      const saved = localStorage.getItem("stats_last_ai_usage");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [totalRequests, setTotalRequests] = useState(0);
  const [accumulatedPromptTokens, setAccumulatedPromptTokens] = useState(0);
  const [accumulatedCompletionTokens, setAccumulatedCompletionTokens] = useState(0);
  const [accumulatedTotalTokens, setAccumulatedTotalTokens] = useState(0);

  const [serverQuotas, setServerQuotas] = useState<any>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const fetchServerQuotas = async (forceRefresh = false) => {
    setQuotaLoading(true);
    try {
      const savedApiKey = localStorage.getItem("custom_api_key") || "";
      const response = await fetch(`/api/ai-quota-check?refresh=${forceRefresh}&customApiKey=${encodeURIComponent(savedApiKey)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && data.cache) {
          setServerQuotas(data.cache);
        }
      }
    } catch (err) {
      console.error("Failed to load server AI quotas:", err);
    } finally {
      setQuotaLoading(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    const mStr = m < 10 ? `0${m}` : m;
    const sStr = s < 10 ? `0${s}` : s;
    
    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
  };

  const fetchUsageStats = async () => {
    try {
      const response = await fetch("/api/ai-usage-stats");
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          if (data.isBlocked && data.resetInSeconds > 0) {
            setCountdownSeconds(data.resetInSeconds);
          } else {
            setCountdownSeconds(null);
          }
          // Also set server quotas info
          setServerQuotas(prev => {
            const base = prev || {};
            return {
              ...base,
              usageStats: data
            };
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch usage stats:", err);
    }
  };

  // Active Countdown Timer Effect
  useEffect(() => {
    if (countdownSeconds === null) return;
    if (countdownSeconds <= 0) {
      setCountdownSeconds(null);
      setError(null);
      return;
    }
    const timer = setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev === null || prev <= 1) {
          setError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownSeconds]);

  // Load accumulated stats and quotas on mount
  useEffect(() => {
    setTotalRequests(Number(localStorage.getItem("stats_total_requests") || "0"));
    setAccumulatedPromptTokens(Number(localStorage.getItem("stats_total_prompt_tokens") || "0"));
    setAccumulatedCompletionTokens(Number(localStorage.getItem("stats_total_completion_tokens") || "0"));
    setAccumulatedTotalTokens(Number(localStorage.getItem("stats_total_tokens") || "0"));
    
    // Fetch initial server quotas and usage stats
    fetchServerQuotas(false);
    fetchUsageStats();
  }, []);

  const accumulateUsage = (usage: { model: string; provider: string; promptTokens: number; completionTokens: number; totalTokens: number }) => {
    const newReqs = Number(localStorage.getItem("stats_total_requests") || "0") + 1;
    const newPrompt = Number(localStorage.getItem("stats_total_prompt_tokens") || "0") + (usage.promptTokens || 0);
    const newComp = Number(localStorage.getItem("stats_total_completion_tokens") || "0") + (usage.completionTokens || 0);
    const newTotal = Number(localStorage.getItem("stats_total_tokens") || "0") + (usage.totalTokens || 0);

    localStorage.setItem("stats_total_requests", String(newReqs));
    localStorage.setItem("stats_total_prompt_tokens", String(newPrompt));
    localStorage.setItem("stats_total_completion_tokens", String(newComp));
    localStorage.setItem("stats_total_tokens", String(newTotal));
    localStorage.setItem("stats_last_ai_usage", JSON.stringify(usage));

    setTotalRequests(newReqs);
    setAccumulatedPromptTokens(newPrompt);
    setAccumulatedCompletionTokens(newComp);
    setAccumulatedTotalTokens(newTotal);
    setLastAiUsage(usage);

    // Refresh server quotas cache right after a successful usage event
    fetchServerQuotas(false);
  };

  const [showTelemetry, setShowTelemetry] = useState(true);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [editingCard, setEditingCard] = useState<AICard | null>(null);
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);
  const [imageSearchInitialQuery, setImageSearchInitialQuery] = useState("");
  const [imageSearchCallback, setImageSearchCallback] = useState<((url: string) => void) | null>(null);
  const [nextBatchDirection, setNextBatchDirection] = useState("");
  const [showNextBatchDirection, setShowNextBatchDirection] = useState(false);

  const isRefiningExistingFolder = aiRefineFolderId && activeAiFolderId === aiRefineFolderId;

  // Synchronize folder from main library if we are in AI refinement mode
  useEffect(() => {
    if (aiRefineFolderId) {
      const libFolder = folders.find(f => f.id === aiRefineFolderId);
      if (libFolder) {
        const mapArabicNameToCode = (name: string): string => {
          const mapping: Record<string, string> = {
            "الألمانية": "de",
            "الألماني": "de",
            "الإنجليزية": "en",
            "الإنجليزي": "en",
            "العربية": "ar",
            "العربي": "ar",
            "الإسبانية": "es",
            "الإسباني": "es",
            "الفرنسية": "fr",
            "الفرنسي": "fr"
          };
          return mapping[name] || name || "en";
        };

        const mappedFolder: AIFolder = {
          id: libFolder.id,
          name: libFolder.name,
          description: libFolder.description,
          color: libFolder.color,
          frontLang: mapArabicNameToCode(libFolder.frontLang),
          backLang: mapArabicNameToCode(libFolder.backLang),
          coverImage: libFolder.coverImage,
          coverImagePosition: libFolder.coverImagePosition,
          prompt: `تعديل المجلد ${libFolder.name} بالذكاء الاصطناعي 🪄`,
          createdAt: libFolder.createdAt || new Date().toISOString()
        };

        const exists = aiFolders.some(f => f.id === libFolder.id);
        let newAiFolders = [...aiFolders];
        if (!exists) {
          newAiFolders = [mappedFolder, ...aiFolders];
        } else {
          newAiFolders = aiFolders.map(f => f.id === libFolder.id ? { ...f, ...mappedFolder } : f);
        }

        const libCards = cards.filter(c => c.folderId === aiRefineFolderId);
        const mappedCards: AICard[] = libCards.map(c => ({
          id: c.id,
          folderId: libFolder.id,
          frontText: c.frontText,
          backText: c.backText,
          isArticleMode: c.isArticleMode,
          correctArticle: c.correctArticle,
          isPluralMode: c.isPluralMode,
          pluralText: c.pluralText,
          pluralLang: c.pluralLang,
          translationHint: c.translationHint,
          difficulty: c.difficulty,
          frontImage: c.frontImage,
          frontImagePosition: c.frontImagePosition
        }));

        let newAiCards = aiCards.filter(c => c.folderId !== libFolder.id);
        newAiCards = [...newAiCards, ...mappedCards];

        setAiFolders(newAiFolders);
        setAiCards(newAiCards);
        try {
          localStorage.setItem("ai_workspace_folders", JSON.stringify(newAiFolders));
          localStorage.setItem("ai_workspace_cards", JSON.stringify(newAiCards));
        } catch (e) {
          console.error("Local storage sync failed:", e);
        }

        setActiveAiFolderId(libFolder.id);
      }
    }
  }, [aiRefineFolderId, folders, cards]);

  // Custom IFrame-safe Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "folder" | "card" | "selected_cards" | "all_folder_cards";
    id?: string;
    message: string;
  } | null>(null);

  // Interactive Review Mode State
  const [reviewMode, setReviewMode] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [reviewFlipped, setReviewFlipped] = useState(false);
  const [reviewDirection, setReviewDirection] = useState(0);

  // Import Dialog State
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTargetMode, setImportTargetMode] = useState<"new" | "existing">("new");
  const [selectedExistingFolderId, setSelectedExistingFolderId] = useState("");
  const [parentFolderIdForNew, setParentFolderIdForNew] = useState("");
  const [customImportName, setCustomImportName] = useState("");

  // AI Batch Refinement/Modification States
  const [showRefinePanel, setShowRefinePanel] = useState(false);
  const [refineModifyDescription, setRefineModifyDescription] = useState(false);
  const [refineDescriptionIssue, setRefineDescriptionIssue] = useState("");
  const [refineDescriptionInstruction, setRefineDescriptionInstruction] = useState("");
  const [refineModifyImages, setRefineModifyImages] = useState(false);
  const [refineImageInstruction, setRefineImageInstruction] = useState("");
  const [refineModifyFrontText, setRefineModifyFrontText] = useState(false);
  const [refineFrontTextInstruction, setRefineFrontTextInstruction] = useState("");
  const [refineModifyBackText, setRefineModifyBackText] = useState(false);
  const [refineBackTextInstruction, setRefineBackTextInstruction] = useState("");
  const [refineGermanArticlesMode, setRefineGermanArticlesMode] = useState<"keep" | "on" | "off" | "auto">("keep");
  const [refineGermanPluralMode, setRefineGermanPluralMode] = useState<"keep" | "on" | "off" | "auto">("keep");
  const [refineGermanPluralInstruction, setRefineGermanPluralInstruction] = useState("");
  const [refineAiProvider, setRefineAiProvider] = useState<"gemini" | "groq">(() => {
    try {
      return (localStorage.getItem("settings_refine_ai_provider") as any) || "gemini";
    } catch {
      return "gemini";
    }
  });
  const [nextBatchAiProvider, setNextBatchAiProvider] = useState<"gemini" | "groq">(() => {
    try {
      return (localStorage.getItem("settings_next_batch_ai_provider") as any) || "gemini";
    } catch {
      return "gemini";
    }
  });

  const activeAiFolder = aiFolders.find(f => f.id === activeAiFolderId);
  const folderCards = aiCards.filter(c => c.folderId === activeAiFolderId);

  // Synchronize options when active folder changes
  useEffect(() => {
    if (activeAiFolder) {
      setCustomImportName(activeAiFolder.name);
      setDescriptionMode(activeAiFolder.descriptionMode || "auto");
      setImagesMode(activeAiFolder.imagesMode || "auto");
      setGermanArticlesMode(activeAiFolder.germanArticlesMode || "auto");
      setGermanPluralMode(activeAiFolder.germanPluralMode || "auto");
      setGermanPluralInstruction(activeAiFolder.germanPluralInstruction || "");
      setFrontInstructions(activeAiFolder.frontInstructions || "");
      setBackInstructions(activeAiFolder.backInstructions || "");
      setDescInstructions(activeAiFolder.descInstructions || "");
      setImageInstructions(activeAiFolder.imageInstructions || "");
      // Auto-select all cards in active folder
      setSelectedCardIds(aiCards.filter(c => c.folderId === activeAiFolder.id).map(c => c.id));
      setShowImportDialog(false);
      
      // Reset refinement states
      setShowRefinePanel(false);
      setRefineModifyDescription(false);
      setRefineDescriptionIssue("");
      setRefineDescriptionInstruction("");
      setRefineModifyImages(false);
      setRefineImageInstruction("");
      setRefineModifyFrontText(false);
      setRefineFrontTextInstruction("");
      setRefineModifyBackText(false);
      setRefineBackTextInstruction("");
    } else {
      setReviewMode(false);
      setCurrentReviewIndex(0);
      setReviewFlipped(false);
    }
  }, [activeAiFolderId]);

  // Update folder in local storage when user edits advanced options while a folder is active
  useEffect(() => {
    if (!activeAiFolderId) return;
    const currentFolder = aiFolders.find(f => f.id === activeAiFolderId);
    if (!currentFolder) return;

    if (
      currentFolder.descriptionMode !== descriptionMode ||
      currentFolder.imagesMode !== imagesMode ||
      currentFolder.germanArticlesMode !== germanArticlesMode ||
      currentFolder.germanPluralMode !== germanPluralMode ||
      (currentFolder.frontInstructions || "") !== frontInstructions ||
      (currentFolder.backInstructions || "") !== backInstructions ||
      (currentFolder.descInstructions || "") !== descInstructions ||
      (currentFolder.imageInstructions || "") !== imageInstructions ||
      (currentFolder.germanPluralInstruction || "") !== germanPluralInstruction
    ) {
      const updated = aiFolders.map(f => {
        if (f.id === activeAiFolderId) {
          return {
            ...f,
            descriptionMode,
            imagesMode,
            germanArticlesMode,
            germanPluralMode,
            frontInstructions: frontInstructions || undefined,
            backInstructions: backInstructions || undefined,
            descInstructions: descInstructions || undefined,
            imageInstructions: imageInstructions || undefined,
            germanPluralInstruction: germanPluralInstruction || undefined
          };
        }
        return f;
      });
      setAiFolders(updated);
      localStorage.setItem("ai_workspace_folders", JSON.stringify(updated));
    }
  }, [
    activeAiFolderId,
    descriptionMode,
    imagesMode,
    germanArticlesMode,
    germanPluralMode,
    frontInstructions,
    backInstructions,
    descInstructions,
    imageInstructions,
    germanPluralInstruction
  ]);

  // Set default existing folder if available
  useEffect(() => {
    if (folders.length > 0 && !selectedExistingFolderId) {
      setSelectedExistingFolderId(folders[0].id);
    }
  }, [folders]);

  const readNdjson = async (
    response: Response,
    onStatus: (msg: string) => void,
    onRawChunk?: (text: string) => void
  ) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("لا يمكن قراءة مجرى البيانات من الخادم.");
    }
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalData = null;
    let finalUsage = null;
    let rawResponseText = "";
    let rawModelResponse = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        rawResponseText += chunkText;
        if (onRawChunk) {
          onRawChunk(rawResponseText);
        }

        buffer += chunkText;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === "status") {
              onStatus(chunk.message);
            } else if (chunk.type === "complete") {
              finalData = chunk.data;
              if (chunk.rawModelResponse) {
                rawModelResponse = chunk.rawModelResponse;
              }
              if (chunk.usage) {
                finalUsage = chunk.usage;
                accumulateUsage(chunk.usage);
              }
            } else if (chunk.type === "error") {
              throw new Error(chunk.error);
            }
          } catch (err) {
            console.error("Error parsing stream chunk:", err);
            const errMsg = (err as Error).message || "";
            if (errMsg.includes("failed") || errMsg.includes("error") || errMsg.includes("فشل") || errMsg.includes("Gemini") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("rate")) {
              throw err;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { data: finalData, usage: finalUsage, rawResponseText, rawModelResponse };
  };

  const handleGenerate = async (targetPrompt: string) => {
    if (!targetPrompt.trim()) return;
    setLoading(true);
    setError(null);
    setLoadingStatus("جاري استدعاء خوارزميات الذكاء الاصطناعي من Google Gemini...");

    let finalPromptToSend = targetPrompt;
    let rawReqBody = "";
    let rawResBody = "";
    try {
      // Build detailed structured prompt containing the custom parameters
      const extraInstructionsList: string[] = [];
      if (frontInstructions.trim()) {
        extraInstructionsList.push(`- بالنسبة للوجه الأمامي للبطاقات (frontText): ${frontInstructions.trim()}`);
      }
      if (backInstructions.trim()) {
        extraInstructionsList.push(`- بالنسبة للوجه الخلفي للبطاقات (backText): ${backInstructions.trim()}`);
      }
      if (descInstructions.trim()) {
        extraInstructionsList.push(`- بالنسبة للوصف أو تلميحات الترجمة والمساعدة (translationHint): ${descInstructions.trim()}`);
      }
      if (imageInstructions.trim()) {
        extraInstructionsList.push(`- بالنسبة للكلمة الدليليلة للبحث عن الصور (imageSearchQuery) للبطاقات وغلاف المجلد: ${imageInstructions.trim()}`);
      }
      if (germanPluralMode !== "off" && germanPluralInstruction.trim()) {
        extraInstructionsList.push(`- بالنسبة لصيغة الجمع الألمانية (pluralText): ${germanPluralInstruction.trim()}`);
      }

      if (extraInstructionsList.length > 0) {
        finalPromptToSend += "\n\n⚠️ تعليمات تفصيلية مخصصة يجب دمجها والالتزام بها في توليد البطاقات:\n" + extraInstructionsList.join("\n");
      }

      const activeProvider = aiProvider;
      const customApiKey = activeProvider === "groq"
        ? localStorage.getItem("settings_groq_api_key") || ""
        : localStorage.getItem("settings_gemini_api_key") || "";

      // Compile selected transcript text if any
      let transcriptText = "";
      if (selectedTranscriptId && transcripts && transcripts.length > 0) {
        const found = transcripts.find(t => t.id === selectedTranscriptId);
        if (found) {
          transcriptText = found.segments.map(s => s.text).join(" ");
        }
      }

      const requestPayload = { 
        prompt: finalPromptToSend,
        customApiKey: customApiKey || undefined,
        descriptionMode,
        imagesMode: imagesMode,
        germanArticlesMode,
        germanPluralMode,
        germanPluralInstruction: germanPluralInstruction.trim() || undefined,
        aiProvider: activeProvider,
        customFolderName: customFolderName.trim() || undefined,
        customFolderDesc: customFolderDesc.trim() || undefined,
        folderDescMode,
        folderDescCondition: folderDescCondition.trim() || undefined,
        cardsCount: cardsCount,
        transcriptText: transcriptText || undefined
      };
      rawReqBody = JSON.stringify(requestPayload, null, 2);

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawReqBody
      });

      if (!response.ok) {
        const errText = await response.text();
        rawResBody = errText;
        let errMsg = "فشل الذكاء الاصطناعي في توليد المجلد والبطاقات";
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || errMsg;
        } catch {
          errMsg = errText || errMsg;
        }
        throw new Error(errMsg);
      }

      // Read real-time progress update stream!
      const { data, usage, rawModelResponse } = await readNdjson(response, (statusMessage) => {
        setLoadingStatus(statusMessage);
      }, (rawText) => {
        rawResBody = rawText;
      });

      if (rawModelResponse) {
        rawResBody = rawModelResponse;
      }

      if (data && data.cards && data.cards.length > 0) {
        const folderId = `ai-folder-${Date.now()}`;
        const newFolder: AIFolder = {
          id: folderId,
          name: data.folder?.name || "مجلد ذكي مؤقت",
          description: data.folder?.description || "تم توليده بالكامل عبر الذكاء الاصطناعي",
          color: data.folder?.color || "#0056f6",
          frontLang: data.folder?.frontLang || "en",
          backLang: data.folder?.backLang || "ar",
          coverImage: data.folder?.coverImage || undefined,
          coverImagePosition: data.folder?.coverImagePosition || undefined,
          prompt: targetPrompt,
          frontInstructions: frontInstructions || undefined,
          backInstructions: backInstructions || undefined,
          descInstructions: descInstructions || undefined,
          imageInstructions: imageInstructions || undefined,
          germanPluralInstruction: germanPluralInstruction || undefined,
          descriptionMode: descriptionMode,
          imagesMode: imagesMode,
          germanArticlesMode: germanArticlesMode,
          germanPluralMode: germanPluralMode,
          customFolderName: customFolderName || undefined,
          customFolderDesc: customFolderDesc || undefined,
          folderDescMode: folderDescMode,
          folderDescCondition: folderDescCondition || undefined,
          createdAt: new Date().toISOString()
        };

        const newCards: AICard[] = data.cards.map((c: any, index: number) => ({
          id: `ai-card-${Date.now()}-${index}`,
          folderId: folderId,
          frontText: c.frontText,
          backText: c.backText,
          isArticleMode: c.isArticleMode || false,
          correctArticle: c.correctArticle || "",
          isPluralMode: c.isPluralMode || false,
          pluralText: c.pluralText || "",
          pluralLang: c.pluralLang || "de",
          translationHint: c.translationHint || "",
          difficulty: c.difficulty || "medium",
          frontImage: c.frontImage || undefined,
          frontImagePosition: c.frontImagePosition || undefined
        }));

        const updatedFolders = [newFolder, ...aiFolders];
        const updatedCards = [...newCards, ...aiCards];

        setAiFolders(updatedFolders);
        setAiCards(updatedCards);
        localStorage.setItem("ai_workspace_folders", JSON.stringify(updatedFolders));
        localStorage.setItem("ai_workspace_cards", JSON.stringify(updatedCards));

        // Log successful request
        const responseSummary = `مجلد: ${data.folder?.name || "مجلد ذكي مؤقت"} (${data.folder?.description || ""})
البطاقات المولدة (${data.cards?.length || 0} بطاقة):
` + (data.cards || []).map((c: any, i: number) => {
  return `${i + 1}. الوجه الأمامي: "${c.frontText}" | الوجه الخلفي: "${c.backText}"${c.translationHint ? ` | تلميح: "${c.translationHint}"` : ""}`;
}).join("\n");

        logAiRequest({
          prompt: targetPrompt,
          rawPrompt: finalPromptToSend,
          response: responseSummary,
          provider: activeProvider,
          model: activeProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.5-flash",
          cardsCount: cardsCount,
          status: "success",
          usage: usage || undefined,
          rawRequestBody: rawReqBody,
          rawResponseBody: rawResBody
        });

        setActiveAiFolderId(folderId);
        setPrompt(""); // Clear prompt
        setFrontInstructions("");
        setBackInstructions("");
        setDescInstructions("");
        fetchUsageStats();

        if (imagesMode !== "off" && primaryImageTiming === "auto_after_ai") {
          setLoadingStatus("تم استلام استجابة الذكاء الاصطناعي بنجاح! جاري التوليد والجلب التلقائي للصور الأساسية والروابط الآن...");
          await handleUnifiedImageFetchAndDownload(newCards, folderId);
        }
      } else {
        throw new Error("لم يتمكن الذكاء الاصطناعي من صياغة بطاقات. يرجى تجربة برومبت مختلف.");
      }
    } catch (err) {
      console.error(err);
      const errMsg = (err as Error).message || "حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.";
      setError(errMsg);
      
      // Log failed request
      logAiRequest({
        prompt: targetPrompt,
        rawPrompt: finalPromptToSend,
        provider: aiProvider,
        model: aiProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.5-flash",
        cardsCount: cardsCount,
        status: "failed",
        error: errMsg,
        rawRequestBody: rawReqBody,
        rawResponseBody: rawResBody
      });
      fetchUsageStats();
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNextBatch = async () => {
    if (!activeAiFolder) return;
    setLoading(true);
    setError(null);
    setLoadingStatus("جاري استدعاء الذكاء الاصطناعي وتجهيز الوجبة الإضافية مع استبعاد الكلمات السابقة...");

    // Collect existing card front texts to send as exclude list
    const combinedExcludeList = folderCards.map(c => c.frontText);

    let finalPromptToSend = activeAiFolder.prompt;
    let rawReqBody = "";
    let rawResBody = "";
    try {
      // Build detailed structured prompt containing the custom parameters from active folder
      
      if (nextBatchDirection.trim()) {
        finalPromptToSend += `\n\n🎯 تركيز وتوجيه خاص ومحدد لهذه الوجبة المحددة:\n${nextBatchDirection.trim()}`;
      }

      const extraInstructionsList: string[] = [];
      if (activeAiFolder.frontInstructions?.trim()) {
        extraInstructionsList.push(`- بالنسبة للوجه الأمامي للبطاقات (frontText): ${activeAiFolder.frontInstructions.trim()}`);
      }
      if (activeAiFolder.backInstructions?.trim()) {
        extraInstructionsList.push(`- بالنسبة للوجه الخلفي للبطاقات (backText): ${activeAiFolder.backInstructions.trim()}`);
      }
      if (activeAiFolder.descInstructions?.trim()) {
        extraInstructionsList.push(`- بالنسبة للوصف أو تلميحات الترجمة والمساعدة (translationHint): ${activeAiFolder.descInstructions.trim()}`);
      }
      if (activeAiFolder.imageInstructions?.trim()) {
        extraInstructionsList.push(`- بالنسبة للكلمة الدليليلة للبحث عن الصور (imageSearchQuery) للبطاقات وغلاف المجلد: ${activeAiFolder.imageInstructions.trim()}`);
      }
      if (activeAiFolder.germanPluralInstruction?.trim()) {
        extraInstructionsList.push(`- بالنسبة لصيغة الجمع الألمانية (pluralText): ${activeAiFolder.germanPluralInstruction.trim()}`);
      }

      if (extraInstructionsList.length > 0) {
        finalPromptToSend += "\n\n⚠️ تعليمات تفصيلية مخصصة يجب دمجها والالتزام بها في توليد البطاقات:\n" + extraInstructionsList.join("\n");
      }

      const activeProvider = nextBatchAiProvider;
      const customApiKey = activeProvider === "groq"
        ? localStorage.getItem("settings_groq_api_key") || ""
        : localStorage.getItem("settings_gemini_api_key") || "";

      const requestPayload = { 
        prompt: finalPromptToSend,
        excludeList: combinedExcludeList,
        customApiKey: customApiKey || undefined,
        descriptionMode: activeAiFolder.descriptionMode || "auto",
        imagesMode: activeAiFolder.imagesMode || "auto",
        germanArticlesMode: activeAiFolder.germanArticlesMode || "auto",
        germanPluralMode: activeAiFolder.germanPluralMode || "auto",
        germanPluralInstruction: activeAiFolder.germanPluralInstruction || undefined,
        aiProvider: activeProvider,
        cardsCount: cardsCount
      };
      rawReqBody = JSON.stringify(requestPayload, null, 2);

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawReqBody
      });

      if (!response.ok) {
        const errText = await response.text();
        rawResBody = errText;
        let errMsg = "فشل الذكاء الاصطناعي في توليد الوجبة الإضافية";
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || errMsg;
        } catch {
          errMsg = errText || errMsg;
        }
        throw new Error(errMsg);
      }

      // Read real-time progress update stream!
      const { data, usage, rawModelResponse } = await readNdjson(response, (statusMessage) => {
        setLoadingStatus(statusMessage);
      }, (rawText) => {
        rawResBody = rawText;
      });

      if (rawModelResponse) {
        rawResBody = rawModelResponse;
      }

      if (data && data.cards && data.cards.length > 0) {
        const newCards: AICard[] = data.cards.map((c: any, index: number) => ({
          id: `ai-card-${Date.now()}-${index}`,
          folderId: activeAiFolder.id,
          frontText: c.frontText,
          backText: c.backText,
          isArticleMode: c.isArticleMode || false,
          correctArticle: c.correctArticle || "",
          isPluralMode: c.isPluralMode || false,
          pluralText: c.pluralText || "",
          pluralLang: c.pluralLang || "de",
          translationHint: c.translationHint || "",
          difficulty: c.difficulty || "medium",
          frontImage: c.frontImage || undefined,
          frontImagePosition: c.frontImagePosition || undefined
        }));

        const updatedCards = [...aiCards, ...newCards];
        setAiCards(updatedCards);
        localStorage.setItem("ai_workspace_cards", JSON.stringify(updatedCards));

        // Log successful request
        const responseSummary = `تم توليد وجبة إضافية من البطاقات (${newCards.length} بطاقة):
` + newCards.map((c: any, i: number) => {
  return `${i + 1}. الوجه الأمامي: "${c.frontText}" | الوجه الخلفي: "${c.backText}"${c.translationHint ? ` | تلميح: "${c.translationHint}"` : ""}`;
}).join("\n");

        logAiRequest({
          prompt: `${activeAiFolder.prompt} (وجبة إضافية)`,
          rawPrompt: finalPromptToSend,
          response: responseSummary,
          provider: activeProvider,
          model: activeProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.5-flash",
          cardsCount: cardsCount,
          status: "success",
          usage: usage || undefined,
          rawRequestBody: rawReqBody,
          rawResponseBody: rawResBody
        });

        // Auto select newly added cards
        setSelectedCardIds(prev => [...prev, ...newCards.map(c => c.id)]);
        setNextBatchDirection("");
        setShowNextBatchDirection(false);
        fetchUsageStats();

        if (activeAiFolder.imagesMode !== "off" && primaryImageTiming === "auto_after_ai") {
          setLoadingStatus("تم استلام الوجبة الإضافية بنجاح! جاري التوليد والجلب التلقائي للصور الأساسية والروابط الآن...");
          await handleUnifiedImageFetchAndDownload(newCards, activeAiFolder.id);
        }
      } else {
        throw new Error("لم يقم الذكاء الاصطناعي بإرجاع بطاقات إضافية جديدة. يبدو أنك استنفدت جميع المفاهيم!");
      }
    } catch (err) {
      console.error(err);
      const errMsg = (err as Error).message || "حدث خطأ أثناء توليد الوجبة الإضافية.";
      setError(errMsg);
      
      // Log failed request
      logAiRequest({
        prompt: `${activeAiFolder.prompt} (وجبة إضافية)`,
        rawPrompt: finalPromptToSend,
        provider: nextBatchAiProvider,
        model: nextBatchAiProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.5-flash",
        cardsCount: cardsCount,
        status: "failed",
        error: errMsg,
        rawRequestBody: rawReqBody,
        rawResponseBody: rawResBody
      });
      fetchUsageStats();
    } finally {
      setLoading(false);
    }
  };

  const parseImageProgress = (status: string) => {
    if (!status) return null;
    const isImageRelated = status.includes("صورة") || status.includes("الصور") || status.includes("غلاف") || status.includes("تنزيل");
    if (!isImageRelated) return null;

    const countMatch = status.match(/تم\s+جلب\s+(\d+)\s+من\s+(\d+)/i) || status.match(/(\d+)\s+من\s+(\d+)/i);
    let currentFetched = 0;
    let totalCards = 0;
    if (countMatch) {
      currentFetched = parseInt(countMatch[1], 10);
      totalCards = parseInt(countMatch[2], 10);
    }

    const roundMatch = status.match(/الجولة\s+(\d+)\/(\d+)/i);
    let currentRound = 1;
    let maxRounds = 10;
    if (roundMatch) {
      currentRound = parseInt(roundMatch[1], 10);
      maxRounds = parseInt(roundMatch[2], 10);
    }

    const cooldownMatch = status.match(/متبقي\s+(\d+)\s+ثوان/i);
    let cooldownSec = 0;
    if (cooldownMatch) {
      cooldownSec = parseInt(cooldownMatch[1], 10);
    }

    const isListFetching = status.includes("قائمة") || status.includes("قوائم") || status.includes("بدء جلب");

    return {
      isImageRelated: true,
      isListFetching,
      currentFetched,
      totalCards,
      percent: totalCards > 0 ? Math.round((currentFetched / totalCards) * 100) : 0,
      currentRound,
      maxRounds,
      cooldownSec,
      rawMessage: status
    };
  };

  const handleUnifiedImageFetchAndDownload = async (
    targetCards?: AICard[],
    folderIdOverride?: string
  ) => {
    const cardsToProcess = targetCards || (activeAiFolder ? folderCards : aiCards);
    if (cardsToProcess.length === 0 && !activeAiFolder?.coverImage) return;

    const currentFolderObj = (folderIdOverride ? aiFolders.find(f => f.id === folderIdOverride) : undefined) || activeAiFolder;

    setShowImageOptionsModal(true);
    setLoading(true);
    setError(null);
    setIsFetchingImages(true);
    setImageFetchSuccess(false);

    const isDataUrlPrimary = primaryImageStorageMode === "data_url";
    const isDataUrlSecondary = secondaryImagesStorageMode === "data_urls";
    const queue: { url: string; label: string; cardId: string }[] = [];

    if (isDataUrlPrimary && currentFolderObj?.coverImage) {
      queue.push({ url: currentFolderObj.coverImage, label: `غلاف المجلد: ${currentFolderObj.name}`, cardId: "folder-cover" });
    }

    if (isDataUrlPrimary) {
      cardsToProcess.forEach((card) => {
        if (card.frontImage && card.frontImage.trim()) {
          queue.push({ url: card.frontImage, label: `الصورة الأساسية (وجه): ${card.frontText || "بدون عنوان"}`, cardId: card.id });
        }
        if (card.backImage && card.backImage.trim()) {
          queue.push({ url: card.backImage, label: `الصورة الأساسية (ظهر): ${card.backText || "بدون عنوان"}`, cardId: card.id });
        }
      });
    }

    const updatedCardCandidatesMap: { [cardId: string]: { topImage?: string; candidates: string[] } } = {};

    try {
      const totalCards = cardsToProcess.length;

      // Phase 1: Fetch candidate lists of 10 images for each card
      if (totalCards > 0) {
        for (let idx = 0; idx < totalCards; idx++) {
          const card = cardsToProcess[idx];
          const queryTerm = getCardQueryTerm(card);
          if (!queryTerm) continue;

          setImageFetchProgress({
            current: idx + 1,
            total: totalCards,
            currentItem: `مرحلة 1/2 (جلب القوائم): جلب الـ 10 صور للبطاقة (${idx + 1}/${totalCards}): "${card.frontText || queryTerm}"...`,
            currentPreview: card.frontImage || undefined
          });

          setLoadingStatus(`مرحلة 1/2 (جلب القوائم): جلب الـ 10 صور للبطاقة (${idx + 1}/${totalCards}): "${card.frontText || queryTerm}"...`);

          try {
            const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
            const apiBase = isLocalhost ? "http://localhost:3000/api/images" : "/api/images";
            const res = await fetch(`${apiBase}?q=${encodeURIComponent(queryTerm)}&page=1&provider=duckduckgo`);

            if (res.ok) {
              const data = await res.json();
              const hits = (data.hits || []).slice(0, 10);

              const urls = hits
                .map((h: any) => h.largeImageURL || h.webformatURL || h.image || h.url)
                .filter((u: string) => typeof u === "string" && u.startsWith("http"));

              if (urls.length > 0) {
                updatedCardCandidatesMap[card.id] = {
                  topImage: urls[0],
                  candidates: urls
                };

                // Immediately show the first candidate as preview
                setImageFetchProgress((prev) => ({
                  ...prev,
                  currentPreview: urls[0]
                }));

                // Save candidate images list in localStorage
                try {
                  localStorage.setItem(`auto_images_${card.id}`, JSON.stringify(urls));
                } catch (e) {}

                // Only add images to download queue if user chose Data URLs / Memory cache storage mode
                if (includeAuto10Images && isDataUrlSecondary) {
                  urls.forEach((imgUrl: string, imgIdx: number) => {
                    if (imgUrl && !queue.some(q => q.url === imgUrl)) {
                      queue.push({
                        url: imgUrl,
                        label: `صورة تلقائية #${imgIdx + 1} لـ "${card.frontText || queryTerm}"`,
                        cardId: card.id
                      });
                    }
                  });
                } else if (!card.frontImage && urls[0] && isDataUrlPrimary && !queue.some(q => q.url === urls[0])) {
                  queue.push({
                    url: urls[0],
                    label: `الصورة التلقائية المقترحة لـ "${card.frontText || queryTerm}"`,
                    cardId: card.id
                  });
                }
              }
            }
          } catch (err) {
            console.warn("Failed to fetch 10 auto images for card:", queryTerm, err);
          }

          // Polite rate-limit delay between search requests
          await new Promise((r) => setTimeout(r, 120));
        }
      }

      // Always update state and state persistence for cards with topImage & autoImageCandidates
      setAiCards((prevCards) => {
        const cardMap = new Map<string, AICard>();
        prevCards.forEach((c) => cardMap.set(c.id, c));

        cardsToProcess.forEach((tc) => {
          const match = updatedCardCandidatesMap[tc.id];
          const existing = cardMap.get(tc.id) || tc;
          const finalImg = existing.frontImage || match?.topImage || tc.frontImage || undefined;
          const finalCandidates = (match?.candidates && match.candidates.length > 0)
            ? match.candidates
            : (existing.autoImageCandidates || tc.autoImageCandidates || []);

          cardMap.set(tc.id, {
            ...existing,
            frontImage: finalImg,
            frontImagePosition: finalImg ? "50% 50%" : existing.frontImagePosition,
            autoImageCandidates: finalCandidates
          });
        });

        const mergedCardsArray = Array.from(cardMap.values());
        try {
          localStorage.setItem("ai_workspace_cards", JSON.stringify(mergedCardsArray));
        } catch (e) {}
        return mergedCardsArray;
      });

      if (queue.length === 0) {
        setIsFetchingImages(false);
        setImageFetchSuccess(true);
        setLoading(false);
        setLoadingStatus("تم جلب وحفظ كافة روابط الصور بنجاح!");
        return;
      }

      // Phase 2: Preload & Cache all queued images locally
      setImageFetchProgress({ current: 0, total: queue.length, currentItem: "مرحلة 2/2: التنزيل والتخزين المحلي...", currentPreview: queue[0]?.url });
      setLoadingStatus("مرحلة 2/2: التنزيل والتخزين المحلي في الذاكرة...");

      const concurrency = 2;
      let completed = 0;

      for (let i = 0; i < queue.length; i += concurrency) {
        const chunk = queue.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (item) => {
            try {
              await preloadImage(item.url);
            } catch (err) {
              console.warn("Failed to download/cache image:", item.url, err);
            } finally {
              completed++;
              setImageFetchProgress({
                current: completed,
                total: queue.length,
                currentItem: item.label,
                currentPreview: item.url
              });
            }
          })
        );
        await new Promise((r) => setTimeout(r, 40));
      }

      setIsFetchingImages(false);
      setImageFetchSuccess(true);
      setLoadingStatus("تم اكتمال عملية جلب وتخزين الصور بنجاح!");
    } catch (err) {
      console.error("Unified image fetch error:", err);
      setError("حدث خطأ أثناء جلب وتخزين الصور للبطاقات");
      setIsFetchingImages(false);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchImagesForFolderCards = async () => {
    return handleUnifiedImageFetchAndDownload();
  };

  const handleFetchImageForSingleCard = async (cardId: string) => {
    const card = aiCards.find(c => c.id === cardId);
    if (!card) return;

    setLoading(true);
    setError(null);
    setLoadingStatus(`جاري البحث وجلب قائمة الـ 10 صور وتنزيل الأفضل للبطاقة "${card.frontText}"...`);

    try {
      const q = getCardQueryTerm(card);
      const res = await fetch(`/api/images?q=${encodeURIComponent(q)}&page=1&provider=duckduckgo`);
      if (!res.ok) throw new Error("فشل جلب قائمة الصور للبطاقة");

      const data = await res.json();
      if (data && data.hits && data.hits.length > 0) {
        const hits = data.hits.slice(0, 10);
        const candidateUrls = hits
          .map((h: any) => h.largeImageURL || h.webformatURL || h.image || h.url)
          .filter((u: string) => typeof u === "string" && u.startsWith("http"));

        // Save auto images list in localStorage
        try {
          localStorage.setItem(`auto_images_${cardId}`, JSON.stringify(candidateUrls));
        } catch (e) {}

        const topUrl = candidateUrls[0];
        if (topUrl) {
          const updatedAiCards = aiCards.map(c => c.id === cardId ? {
            ...c,
            frontImage: topUrl,
            frontImagePosition: "50% 50%"
          } : c);
          setAiCards(updatedAiCards);
          localStorage.setItem("ai_workspace_cards", JSON.stringify(updatedAiCards));

          candidateUrls.forEach((u: string) => preloadImage(u).catch(() => {}));
        } else {
          alert("لم نتمكن من العثور على صورة مناسبة لهذه البطاقة");
        }
      } else {
        alert("لم يتم العثور على صور مطابقة للبطاقة");
      }
    } catch (err) {
      console.error("Single card image fetch failed:", err);
      setError("فشل جلب صورة للبطاقة");
    } finally {
      setLoading(false);
    }
  };

  const handleRefineCards = async () => {
    if (!activeAiFolder || folderCards.length === 0) return;
    
    // Check if at least one refinement choice is selected
    const hasActiveChoice = refineModifyDescription || refineModifyImages || refineModifyFrontText || refineModifyBackText || refineGermanArticlesMode !== "keep" || refineGermanPluralMode !== "keep";
    if (!hasActiveChoice) {
      alert("الرجاء اختيار جانب واحد على الأقل لتعديله (الوصف، الصور، النصوص الأمامية، الخلفية، ضبط أدوات التعريف، أو صيغ الجمع)!");
      return;
    }

    if (refineModifyDescription && !refineDescriptionInstruction.trim()) {
      alert("توجيهات الوصف الجديد مطلوبة وإجبارية عند تفعيل تعديل الوصف!");
      return;
    }

    if (refineModifyImages && !refineImageInstruction.trim()) {
      alert("نمط وتوجيهات الصور الجديدة مطلوبة وإجبارية عند تفعيل تعديل الصور!");
      return;
    }

    if (refineModifyFrontText && !refineFrontTextInstruction.trim()) {
      alert("توجيهات تعديل النص الأمامي مطلوبة وإجبارية عند تفعيل تعديل النص الأمامي!");
      return;
    }

    if (refineModifyBackText && !refineBackTextInstruction.trim()) {
      alert("توجيهات تعديل النص الخلفي مطلوبة وإجبارية عند تفعيل تعديل النص الخلفي!");
      return;
    }

    setLoading(true);
    setError(null);
    const activeProvider = refineAiProvider;
    const providerNameArabic = activeProvider === "groq" ? "Groq" : "جيميناي";
    setLoadingStatus(`جاري تحضير البطاقات الحالية وإرسال توجيهات التعديل لـ ${providerNameArabic}...`);

    let refinePromptSummary = `طلب تعديل وتحسين مجلد بطاقات:
`;
    if (refineModifyDescription) {
      refinePromptSummary += `- تعديل وصف المجلد: "${refineDescriptionInstruction}"\n`;
    }
    if (refineModifyImages) {
      refinePromptSummary += `- تعديل الصور: "${refineImageInstruction}"\n`;
    }
    if (refineModifyFrontText) {
      refinePromptSummary += `- تعديل النص الأمامي: "${refineFrontTextInstruction}"\n`;
    }
    if (refineModifyBackText) {
      refinePromptSummary += `- تعديل النص الخلفي: "${refineBackTextInstruction}"\n`;
    }
    if (refineGermanArticlesMode !== "keep") {
      refinePromptSummary += `- نمط أدوات التعريف الألمانية: ${refineGermanArticlesMode}\n`;
    }
    if (refineGermanPluralMode !== "keep") {
      refinePromptSummary += `- نمط صيغ الجمع الألمانية: ${refineGermanPluralMode} (${refineGermanPluralInstruction})\n`;
    }

    let rawReqBody = "";
    let rawResBody = "";
    try {
      const customApiKey = activeProvider === "groq"
        ? localStorage.getItem("settings_groq_api_key") || ""
        : localStorage.getItem("settings_gemini_api_key") || "";

      const requestPayload = {
        cards: folderCards.map(c => ({
          frontText: c.frontText,
          backText: c.backText,
          isArticleMode: c.isArticleMode || false,
          correctArticle: c.correctArticle || "",
          isPluralMode: c.isPluralMode || false,
          pluralText: c.pluralText || "",
          pluralLang: c.pluralLang || "de",
          translationHint: c.translationHint || "",
          difficulty: c.difficulty || "medium",
          frontImage: c.frontImage || "",
          frontImagePosition: c.frontImagePosition || "",
          imageSearchQuery: "" 
        })),
        customApiKey: customApiKey || undefined,
        modifyDescription: refineModifyDescription,
        descriptionIssue: refineDescriptionIssue,
        descriptionInstruction: refineDescriptionInstruction,
        modifyImages: refineModifyImages,
        imageInstruction: refineImageInstruction,
        modifyFrontText: refineModifyFrontText,
        frontTextInstruction: refineFrontTextInstruction,
        modifyBackText: refineModifyBackText,
        backTextInstruction: refineBackTextInstruction,
        germanArticlesMode: refineGermanArticlesMode,
        germanPluralMode: refineGermanPluralMode,
        germanPluralInstruction: refineGermanPluralInstruction,
        aiProvider: activeProvider
      };
      rawReqBody = JSON.stringify(requestPayload, null, 2);

      const response = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawReqBody
      });

      if (!response.ok) {
        const errText = await response.text();
        rawResBody = errText;
        let errMsg = "فشل الذكاء الاصطناعي في تعديل وإعادة صياغة البطاقات";
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || errMsg;
        } catch {
          errMsg = errText || errMsg;
        }
        throw new Error(errMsg);
      }

      // Read real-time progress update stream!
      const { data, usage, rawModelResponse } = await readNdjson(response, (statusMessage) => {
        setLoadingStatus(statusMessage);
      }, (rawText) => {
        rawResBody = rawText;
      });

      if (rawModelResponse) {
        rawResBody = rawModelResponse;
      }

      if (data && data.cards && data.cards.length > 0) {
        // Map back to our AICards structure, keeping original IDs so we update existing cards in-place!
        const refinedCards: AICard[] = data.cards.map((c: any, index: number) => {
          const originalCard = folderCards[index];
          return {
            id: originalCard ? originalCard.id : `ai-card-${Date.now()}-${index}`,
            folderId: activeAiFolder.id,
            frontText: c.frontText,
            backText: c.backText,
            isArticleMode: c.isArticleMode || false,
            correctArticle: c.correctArticle || "",
            isPluralMode: c.isPluralMode || false,
            pluralText: c.pluralText || "",
            pluralLang: c.pluralLang || "de",
            translationHint: c.translationHint || "",
            difficulty: c.difficulty || "medium",
            frontImage: c.frontImage || undefined,
            frontImagePosition: c.frontImagePosition || undefined
          };
        });

        // Filter out old folder cards and insert the refined ones!
        const otherCards = aiCards.filter(c => c.folderId !== activeAiFolder.id);
        const updatedCards = [...otherCards, ...refinedCards];
        
        setAiCards(updatedCards);
        localStorage.setItem("ai_workspace_cards", JSON.stringify(updatedCards));

        // Log successful request
        const responseSummary = `تم تعديل وتحسين البطاقات بنجاح (${refinedCards.length} بطاقة):
` + refinedCards.map((c: any, i: number) => {
  return `${i + 1}. الوجه الأمامي: "${c.frontText}" | الوجه الخلفي: "${c.backText}"${c.translationHint ? ` | تلميح: "${c.translationHint}"` : ""}`;
}).join("\n");

        logAiRequest({
          prompt: `تعديل وتحسين البطاقات للمجلد "${activeAiFolder.name}"`,
          rawPrompt: refinePromptSummary,
          response: responseSummary,
          provider: activeProvider,
          model: activeProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.5-flash",
          cardsCount: folderCards.length,
          status: "success",
          usage: usage || undefined,
          rawRequestBody: rawReqBody,
          rawResponseBody: rawResBody
        });

        // Keep all updated cards selected
        setSelectedCardIds(refinedCards.map(c => c.id));
        
        // Hide panel
        setShowRefinePanel(false);
        fetchUsageStats();
      } else {
        throw new Error("لم يرجع الذكاء الاصطناعي أي بطاقات معدلة.");
      }
    } catch (err) {
      console.error(err);
      const errMsg = (err as Error).message || "حدث خطأ أثناء تعديل البطاقات بالذكاء الاصطناعي.";
      setError(errMsg);

      // Log failed request
      logAiRequest({
        prompt: `تعديل وتحسين البطاقات للمجلد "${activeAiFolder.name}"`,
        rawPrompt: refinePromptSummary,
        provider: refineAiProvider,
        model: refineAiProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.5-flash",
        cardsCount: folderCards.length,
        status: "failed",
        error: errMsg,
        rawRequestBody: rawReqBody,
        rawResponseBody: rawResBody
      });
      fetchUsageStats();
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAiCard = (cardId: string) => {
    setDeleteConfirm({
      type: "card",
      id: cardId,
      message: "هل أنت متأكد من رغبتك في حذف هذه البطاقة الدراسية المؤقتة؟"
    });
  };

  const handleDeleteSelectedCards = () => {
    if (selectedCardIds.length === 0) return;
    setDeleteConfirm({
      type: "selected_cards",
      message: `هل أنت متأكد من رغبتك في حذف ${selectedCardIds.length} من البطاقات المحددة؟`
    });
  };

  const handleDeleteAllFolderCards = () => {
    setDeleteConfirm({
      type: "all_folder_cards",
      message: "هل أنت متأكد من رغبتك في حذف جميع البطاقات في هذا المجلد الذكي المؤقت؟"
    });
  };

  const handleReviewDelete = (cardId: string) => {
    // Delete the card from main list
    const cardToDelete = aiCards.find(c => c.id === cardId);
    if (cardToDelete && onTrashAiCard) {
      onTrashAiCard(cardToDelete);
    }
    const updated = aiCards.filter(c => c.id !== cardId);
    setAiCards(updated);
    localStorage.setItem("ai_workspace_cards", JSON.stringify(updated));
    setSelectedCardIds(prev => prev.filter(id => id !== cardId));

    // Calculate remaining cards in this folder
    const remainingCards = folderCards.filter(c => c.id !== cardId);
    if (remainingCards.length === 0) {
      setReviewMode(false);
      setCurrentReviewIndex(0);
    } else {
      // Adjust index if we were on the last card
      if (currentReviewIndex >= remainingCards.length) {
        setCurrentReviewIndex(remainingCards.length - 1);
      }
    }
    setReviewFlipped(false);
  };

  const handleReviewNext = () => {
    if (currentReviewIndex < folderCards.length - 1) {
      setReviewDirection(1);
      setCurrentReviewIndex(prev => prev + 1);
      setReviewFlipped(false);
    }
  };

  const handleReviewPrev = () => {
    if (currentReviewIndex > 0) {
      setReviewDirection(-1);
      setCurrentReviewIndex(prev => prev - 1);
      setReviewFlipped(false);
    }
  };

  const handleDeleteAiFolder = (folderId: string) => {
    const folder = aiFolders.find(f => f.id === folderId);
    setDeleteConfirm({
      type: "folder",
      id: folderId,
      message: `هل أنت متأكد من رغبتك في حذف المجلد المؤقت "${folder?.name || ''}" بالكامل مع جميع بطاقاته؟`
    });
  };

  const executeConfirmedDelete = () => {
    if (!deleteConfirm) return;

    if (deleteConfirm.type === "card" && deleteConfirm.id) {
      const cardId = deleteConfirm.id;
      const cardToDelete = aiCards.find(c => c.id === cardId);
      if (cardToDelete && onTrashAiCard) {
        onTrashAiCard(cardToDelete);
      }
      const updated = aiCards.filter(c => c.id !== cardId);
      setAiCards(updated);
      localStorage.setItem("ai_workspace_cards", JSON.stringify(updated));
      setSelectedCardIds(prev => prev.filter(id => id !== cardId));
    } else if (deleteConfirm.type === "selected_cards") {
      const cardsToTrash = aiCards.filter(c => selectedCardIds.includes(c.id));
      if (cardsToTrash.length > 0 && onTrashAiCards) {
        onTrashAiCards(cardsToTrash);
      }
      const updated = aiCards.filter(c => !selectedCardIds.includes(c.id));
      setAiCards(updated);
      localStorage.setItem("ai_workspace_cards", JSON.stringify(updated));
      setSelectedCardIds([]);
    } else if (deleteConfirm.type === "all_folder_cards") {
      const cardsToTrash = aiCards.filter(c => c.folderId === activeAiFolderId);
      if (cardsToTrash.length > 0 && onTrashAiCards) {
        onTrashAiCards(cardsToTrash);
      }
      const updated = aiCards.filter(c => c.folderId !== activeAiFolderId);
      setAiCards(updated);
      localStorage.setItem("ai_workspace_cards", JSON.stringify(updated));
      setSelectedCardIds([]);
    } else if (deleteConfirm.type === "folder" && deleteConfirm.id) {
      const folderId = deleteConfirm.id;
      const folderToDelete = aiFolders.find(f => f.id === folderId);
      const cardsToTrash = aiCards.filter(c => c.folderId === folderId);
      if (folderToDelete && onTrashAiFolder) {
        onTrashAiFolder(folderToDelete, cardsToTrash);
      }
      const updatedFolders = aiFolders.filter(f => f.id !== folderId);
      const updatedCards = aiCards.filter(c => c.folderId !== folderId);
      setAiFolders(updatedFolders);
      setAiCards(updatedCards);
      localStorage.setItem("ai_workspace_folders", JSON.stringify(updatedFolders));
      localStorage.setItem("ai_workspace_cards", JSON.stringify(updatedCards));
      if (activeAiFolderId === folderId) {
        setActiveAiFolderId("");
      }
      setSelectedCardIds([]);
    }

    setDeleteConfirm(null);
  };

  const adaptAICardToFlashcard = (aiCard: AICard): Flashcard => {
    return {
      id: aiCard.id,
      folderId: aiCard.folderId,
      frontText: aiCard.frontText,
      frontLang: activeAiFolder?.frontLang || "de",
      frontImage: aiCard.frontImage,
      frontImagePosition: aiCard.frontImagePosition || "50% 50%",
      backText: aiCard.backText,
      backLang: activeAiFolder?.backLang || "ar",
      isArticleMode: aiCard.isArticleMode ?? (activeAiFolder?.germanArticlesMode === "on"),
      correctArticle: aiCard.correctArticle || "",
      isPluralMode: aiCard.isPluralMode ?? (activeAiFolder?.germanPluralMode === "on"),
      pluralText: aiCard.pluralText || "",
      pluralLang: aiCard.pluralLang || "de",
      translationHint: aiCard.translationHint || "",
      createdAt: new Date().toISOString(),
      streak: 0,
      difficulty: aiCard.difficulty || "medium"
    };
  };

  const handleOpenImageSearch = (onSelect: (url: string) => void, initialQuery?: string) => {
    setImageSearchCallback(() => onSelect);
    setImageSearchInitialQuery(initialQuery || "");
    setIsImageSearchOpen(true);
  };

  const handleSaveEditCard = (id: string, updatedFields: Omit<Flashcard, "id" | "createdAt">) => {
    const updatedCards = aiCards.map(c => {
      if (c.id === id) {
        return {
          ...c,
          frontText: updatedFields.frontText,
          backText: updatedFields.backText,
          isArticleMode: updatedFields.isArticleMode,
          correctArticle: updatedFields.correctArticle || "",
          isPluralMode: updatedFields.isPluralMode,
          pluralText: updatedFields.pluralText || "",
          pluralLang: updatedFields.pluralLang || "de",
          translationHint: updatedFields.translationHint || "",
          difficulty: updatedFields.difficulty,
          frontImage: updatedFields.frontImage,
          frontImagePosition: updatedFields.frontImagePosition || "50% 50%"
        };
      }
      return c;
    });
    setAiCards(updatedCards);
    localStorage.setItem("ai_workspace_cards", JSON.stringify(updatedCards));
    setEditingCard(null);
  };

  const toggleCardSelection = (cardId: string) => {
    if (selectedCardIds.includes(cardId)) {
      setSelectedCardIds(selectedCardIds.filter(id => id !== cardId));
    } else {
      setSelectedCardIds([...selectedCardIds, cardId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedCardIds.length === folderCards.length) {
      setSelectedCardIds([]);
    } else {
      setSelectedCardIds(folderCards.map(c => c.id));
    }
  };

  const handleImport = () => {
    if (!activeAiFolder) return;
    const cardsToImport = folderCards
      .filter(c => selectedCardIds.includes(c.id))
      .map(c => {
        let candidates = c.autoImageCandidates;
        if (!candidates && c.id) {
          try {
            const raw = localStorage.getItem(`auto_images_${c.id}`);
            if (raw) candidates = JSON.parse(raw);
          } catch (e) {}
        }
        return {
          frontText: c.frontText,
          backText: c.backText,
          frontLang: activeAiFolder.frontLang,
          backLang: activeAiFolder.backLang,
          isArticleMode: c.isArticleMode || false,
          correctArticle: c.correctArticle || "",
          isPluralMode: c.isPluralMode || false,
          pluralText: c.pluralText || "",
          pluralLang: c.pluralLang || "de",
          translationHint: c.translationHint || "",
          difficulty: c.difficulty || "medium",
          frontImage: c.frontImage || undefined,
          frontImagePosition: c.frontImagePosition || undefined,
          autoImageCandidates: candidates,
          imageSearchQuery: c.imageSearchQuery || undefined,
          oldCardId: c.id
        };
      });

    if (cardsToImport.length === 0) {
      alert("الرجاء تحديد بطاقة واحدة على الأقل للاستيراد");
      return;
    }

    if (importTargetMode === "new") {
      const mapCodeToArabicName = (code: string): string => {
        const mapping: Record<string, string> = {
          de: "الألمانية",
          en: "الإنجليزية",
          ar: "العربية",
          es: "الإسبانية",
          fr: "الفرنسية"
        };
        return mapping[(code || "").toLowerCase()] || "الألمانية";
      };

      const folderData = {
        name: customImportName.trim() || activeAiFolder.name,
        description: activeAiFolder.description || "تم إنشاؤه بواسطة صانع البطاقات الذكي",
        color: activeAiFolder.color,
        frontLang: mapCodeToArabicName(activeAiFolder.frontLang),
        backLang: mapCodeToArabicName(activeAiFolder.backLang),
        coverImage: activeAiFolder.coverImage || undefined,
        coverImagePosition: activeAiFolder.coverImagePosition || undefined,
        parentId: parentFolderIdForNew || undefined
      };
      onImportGenerated(folderData, cardsToImport, null);
    } else {
      const targetId = selectedExistingFolderId || (folders[0]?.id || null);
      onImportGenerated(null, cardsToImport, targetId);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 md:p-8 text-right" dir="rtl">
      
      {/* Upper Navigation / Title Row */}
      <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between border-b border-slate-100 pb-4">
        {/* Right side: Hamburger and Back to Library buttons */}
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors active:scale-95"
              title="القائمة الجانبية"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          
          <button
            onClick={() => {
              if (onClearAiRefineFolderId) onClearAiRefineFolderId();
              onBackToLibrary();
            }}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-700 transition-all cursor-pointer active:scale-95"
          >
            <Compass className="w-3.5 h-3.5 text-slate-400" />
            <span>الرجوع للمكتبة</span>
          </button>
        </div>

        {/* Left side: Simple Icon + Title */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">المساعد الذكي</span>
          <Sparkles className="w-4 h-4 text-[#0056f6]" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Breadcrumb Navigation inside AI Workspace */}
        {activeAiFolderId && (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <span className="hover:text-primary cursor-pointer" onClick={() => {
              if (onClearAiRefineFolderId) onClearAiRefineFolderId();
              setActiveAiFolderId("");
            }}>مساعد التوليد الذكي</span>
            <ChevronLeft className="w-3 h-3 text-slate-300 shrink-0" />
            <span className="text-slate-800 font-black">{activeAiFolder?.name}</span>
          </div>
        )}

        {/* LOADING INDICATOR */}
        {loading && (
          <div className="bg-white rounded-3xl border border-slate-100 p-8 flex flex-col items-center justify-center text-center shadow-lg space-y-5 animate-fade-in max-w-md mx-auto">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-100 border-t-[#0056f6] animate-spin" />
              <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-[#0056f6] animate-pulse" />
            </div>

            <div className="space-y-1">
              <h4 className="font-extrabold text-slate-800 text-base">
                جاري التفكير والتوليد الذكي...
              </h4>
              <p className="text-xs text-slate-500 font-medium">
                يرجى الانتظار أثناء معالجة وقراءة البيانات
              </p>
            </div>

            {/* Structured Image Progress Box */}
            {(() => {
              const imgProg = parseImageProgress(loadingStatus);
              if (imgProg && imgProg.isImageRelated) {
                return (
                  <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-right space-y-3 shadow-3xs">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-[#0056f6]">
                        <Loader2 className="w-4 h-4 animate-spin text-[#0056f6]" />
                        {imgProg.isListFetching ? "جاري جلب قوائم الصور..." : "جاري تنزيل وتخزين الصور..."}
                      </span>
                      {imgProg.totalCards > 0 && (
                        <span className="text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {imgProg.currentFetched} من {imgProg.totalCards}
                        </span>
                      )}
                    </div>

                    {imgProg.totalCards > 0 && (
                      <div className="w-full bg-slate-200/80 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-[#0056f6] via-purple-600 to-emerald-500 h-full transition-all duration-300 rounded-full"
                          style={{ width: `${imgProg.percent}%` }}
                        />
                      </div>
                    )}

                    {imgProg.cooldownSec > 0 && (
                      <div className="flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 p-2 rounded-xl text-[11px] font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                        <span>مهلة تبريد لفك حظر الخادم: متبقي {imgProg.cooldownSec} ثوانٍ...</span>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-600 font-bold leading-relaxed pt-1 border-t border-slate-200/50">
                      {loadingStatus}
                    </p>
                  </div>
                );
              }

              return (
                <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3 text-xs text-[#0056f6] font-extrabold max-w-sm">
                  {loadingStatus}
                </div>
              );
            })()}
          </div>
        )}

        {/* ERROR DISPLAY */}
        {error && !loading && (() => {
          const isQuotaError = error.includes("429") || 
                               error.includes("RESOURCE_EXHAUSTED") || 
                               error.toLowerCase().includes("quota") || 
                               error.toLowerCase().includes("limit") ||
                               error.toLowerCase().includes("rate") ||
                               error.includes("توقّف مؤقت") ||
                               error.includes("توقف مؤقت") ||
                               error.includes("الحد اليومي") ||
                               countdownSeconds !== null;
          
          const parsedLimit = parseRateLimitError(error);
          const isGroq = error.toLowerCase().includes("groq") || error.toLowerCase().includes("llama");
          
          let limitName = "حصة الطلبات المؤقتة";
          if (parsedLimit?.limitType === "TPD") limitName = "الحصة اليومية للتوكنات (TPD)";
          else if (parsedLimit?.limitType === "RPM") limitName = "حصة الطلبات في الدقيقة (RPM)";
          else if (parsedLimit?.limitType === "TPM") limitName = "حصة التوكنات في الدقيقة (TPM)";
          else if (parsedLimit?.limitType === "RPD") limitName = "حصة الطلبات اليومية (RPD)";

          if (isQuotaError) {
            return (
              <div className="bg-slate-50 border border-slate-200 text-slate-900 p-8 rounded-[32px] text-center space-y-6 shadow-xl max-w-lg mx-auto animate-fade-in border-t-4 border-t-amber-500" dir="rtl">
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 text-amber-500 mb-2 animate-bounce">
                    <Clock className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">توقّف مؤقت للخدمة</h3>
                  <p className="text-xs text-slate-500 font-bold max-w-sm mx-auto leading-relaxed">
                    يرجى الانتظار حتى انتهاء العد التنازلي لإرسال طلب جديد، أو ترقية حسابك الآن لتجنب أي توقف.
                  </p>
                </div>

                {/* COUNTDOWN TIMER */}
                <div className="py-5 px-8 bg-white border border-slate-200/60 rounded-2xl inline-block shadow-xs">
                  <span className="text-3xl font-black text-slate-800 tracking-tight font-mono block">
                    {countdownSeconds !== null 
                      ? formatCountdown(countdownSeconds) 
                      : (parsedLimit?.resetIn ? formatArabicResetTime(parsedLimit.resetIn) : "12:44")}
                  </span>
                  <span className="text-[10px] text-slate-400 font-black tracking-wider uppercase mt-1 block">
                    متبقية لإعادة التفعيل
                  </span>
                </div>

                {/* Quota details if available */}
                {(parsedLimit?.limit !== undefined || serverQuotas?.usageStats) && (
                  <div className="bg-white/80 border border-slate-100 p-3 rounded-xl text-right text-[10px] text-slate-500 space-y-1 max-w-xs mx-auto font-medium">
                    <div className="flex justify-between">
                      <span>نوع الحصة الحالية:</span>
                      <span className="font-bold text-slate-700">{limitName}</span>
                    </div>
                    {parsedLimit?.limit !== undefined && (
                      <div className="flex justify-between">
                        <span>الحد الأقصى للمقاييس:</span>
                        <span className="font-mono font-bold text-slate-700">{parsedLimit.limit.toLocaleString()}</span>
                      </div>
                    )}
                    {parsedLimit?.used !== undefined && (
                      <div className="flex justify-between">
                        <span>المستهلك الفعلي:</span>
                        <span className="font-mono font-bold text-slate-700">{parsedLimit.used.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* PREMIUM CTA BUTTON */}
                <div className="pt-2">
                  <a
                    href="https://console.groq.com/settings/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-6 bg-gradient-to-r from-[#0056f6] to-[#0047cc] hover:from-[#0047cc] hover:to-[#003bb3] text-white font-black text-xs rounded-2xl shadow-md transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 cursor-pointer animate-pulse"
                    style={{ animationDuration: "3s" }}
                  >
                    <Sparkles className="w-4 h-4 fill-white animate-spin" style={{ animationDuration: "12s" }} />
                    <span>ترقية الباقة والاشتراك الآن</span>
                  </a>
                </div>

                {/* ALTERNATIVE PROVIDER SWITCH */}
                <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-semibold">هل تريد الاستمرار فوراً؟ يمكنك التبديل للمزود الاحتياطي:</span>
                  <button
                    type="button"
                    onClick={() => {
                      handleProviderChange(aiProvider === "groq" ? "gemini" : "groq");
                      setError(null);
                      setCountdownSeconds(null);
                    }}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>التبديل واستكمال العمل عبر نموذج {aiProvider === "groq" ? "Google Gemini" : "Groq"}</span>
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="bg-rose-50 border border-rose-100 text-rose-800 p-5 rounded-[22px] text-xs space-y-3 shadow-xs text-right animate-fade-in" dir="rtl">
              <div className="flex items-center gap-2 text-rose-700 font-extrabold pb-2 border-b border-rose-100">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <h4 className="text-sm font-black text-right">حدث خطأ أثناء معالجة الطلب</h4>
              </div>
              <p className="font-bold text-rose-900 leading-relaxed text-[11px] font-mono break-words bg-rose-100/30 p-2 rounded-lg border border-rose-200/40 text-right">{error}</p>
              
              <div className="bg-white/60 p-3 rounded-xl border border-rose-200/30 text-rose-950 font-semibold text-[10px] leading-relaxed space-y-2 text-right">
                <span>💡 <strong>اقتراح سريع لحل المشكلة:</strong></span>
                <p>إذا كانت هناك مشكلة اتصال بمزود الذكاء الاصطناعي الحالي، يمكنك التبديل الفوري لتجربة المزود الآخر:</p>
                <button
                  type="button"
                  onClick={() => {
                    handleProviderChange(aiProvider === "groq" ? "gemini" : "groq");
                    setError(null);
                  }}
                  className="px-3.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-bold transition-all text-[9px] cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>التبديل إلى {aiProvider === "groq" ? "Google Gemini" : "Groq"}</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* MAIN VIEWS */}
        {!loading && !activeAiFolderId ? (
          /* =========================================================================
             1. HOME VIEW: Prompt box + Suggestions + List of Temporary AI Folders
             ========================================================================= */
          <>
            {/* Prompt Input Panel */}
            <div className="bg-white rounded-[24px] border border-slate-200/50 p-6 space-y-5 shadow-elevation-2">
              <div className="flex items-center gap-2 text-slate-700">
                <Sparkles className="w-4 h-4 text-[#0056f6]" />
                <h3 className="font-bold text-sm text-slate-800">توليد مجلد دراسي ذكي جديد</h3>
              </div>

              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="مثال: أهم 15 فعلاً إنجليزياً مع الترجمة..."
                  className="w-full min-h-[90px] p-4 bg-slate-50 border border-slate-200/60 rounded-2xl text-xs font-semibold placeholder-slate-400 focus:outline-none focus:border-[#0056f6] focus:bg-white transition-all resize-y leading-relaxed"
                />
              </div>

              {/* Lego piece YT Transcript Selector */}
              {transcripts && transcripts.length > 0 && (
                <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-600 animate-pulse" />
                      <span className="text-xs font-bold text-slate-700">ربط مع وثيقة تفريغ يوتيوب (spT) - كقطعة ليغو منفصلة</span>
                    </div>
                    {selectedTranscriptId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTranscriptId("");
                          if (onClearInitialSelectedTranscriptId) {
                            onClearInitialSelectedTranscriptId();
                          }
                        }}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        إلغاء الربط
                      </button>
                    )}
                  </div>
                  
                  <div className="relative">
                    <select
                      value={selectedTranscriptId}
                      onChange={(e) => setSelectedTranscriptId(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0056f6] transition-all cursor-pointer"
                    >
                      <option value="">-- اختر وثيقة spT لربطها بالتوليد الذكي (اختياري) --</option>
                      {transcripts.map((t) => (
                        <option key={t.id} value={t.id}>
                          🎬 {t.title} ({t.segments.length} فقرة)
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedTranscriptId && (() => {
                    const sel = transcripts.find(t => t.id === selectedTranscriptId);
                    if (!sel) return null;
                    return (
                      <div className="p-3 bg-white rounded-xl border border-amber-100 text-[10px] text-slate-500 flex items-start gap-2">
                        <span className="p-1 bg-amber-100 text-amber-700 rounded font-black shrink-0">spT متصل</span>
                        <div className="text-right flex-1">
                          <p className="font-bold text-slate-700">{sel.title}</p>
                          <p className="mt-1 line-clamp-2">النص المتاح: {sel.segments.map(s => s.text).join(" ")}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Card Count Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-100" dir="rtl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#0056f6]/10 text-[#0056f6] rounded-xl">
                    <Hash className="w-4 h-4" />
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-700 block">عدد البطاقات المراد توليدها</span>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {cardsCount === "auto" 
                        ? "سيقوم الذكاء الاصطناعي بتحديد العدد الأمثل لتغطية الموضوع بالكامل تلقائياً ✨" 
                        : "الافتراضي 10 بطاقات، ويمكنك الاختيار من 1 إلى 50"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 justify-between sm:justify-end">
                  {/* Segmented Control */}
                  <div className="flex bg-slate-200/60 p-1 rounded-xl" dir="rtl">
                    <button
                      type="button"
                      onClick={() => {
                        if (cardsCount === "auto") {
                          setCardsCount(10);
                        }
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${cardsCount !== "auto" ? "bg-white text-[#0056f6] shadow-sm font-black" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      محدّد
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardsCount("auto")}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${cardsCount === "auto" ? "bg-white text-[#0056f6] shadow-sm font-black" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      تلقائي ✨
                    </button>
                  </div>

                  {cardsCount !== "auto" ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setCardsCount(prev => typeof prev === "number" ? Math.max(1, prev - 1) : 9)}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-[#0056f6] hover:bg-slate-50 rounded-lg text-sm font-bold transition-all active:scale-90"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={cardsCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) {
                              setCardsCount(Math.min(Math.max(val, 1), 50));
                            } else {
                              setCardsCount(10); // default fallback
                            }
                          }}
                          className="w-12 text-center text-xs font-black text-[#0056f6] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => setCardsCount(prev => typeof prev === "number" ? Math.min(50, prev + 1) : 11)}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-[#0056f6] hover:bg-slate-50 rounded-lg text-sm font-bold transition-all active:scale-90"
                        >
                          +
                        </button>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="50"
                        value={cardsCount}
                        onChange={(e) => setCardsCount(parseInt(e.target.value) || 10)}
                        className="w-24 sm:w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0056f6]"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100/50 animate-pulse">
                      <span>توليد مرن وذكي</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Specific Custom Fields collapsible accordion */}
              <div className="border border-slate-200/50 rounded-2xl overflow-hidden bg-slate-50/40">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full flex items-center justify-between p-3.5 text-right font-black text-xs text-slate-700 hover:bg-slate-100/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-[#0056f6]" />
                    <span>تخصيص الإعدادات والبطاقات</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showAdvancedOptions ? "rotate-180" : ""}`} />
                </button>
                
                {showAdvancedOptions && (
                  <div className="p-5 bg-white border-t border-slate-100 space-y-5 animate-fade-in text-right">
                    {/* Tabs Selection Bar */}
                    <div className="flex border-b border-slate-100 pb-1.5 mb-2 gap-1.5 overflow-x-auto scrollbar-none" dir="rtl">
                      <button
                        type="button"
                        onClick={() => setAdvancedTab("general")}
                        className={`px-4 py-2 text-xs font-black rounded-xl transition-all border cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          advancedTab === "general"
                            ? "bg-[#0056f6]/5 text-[#0056f6] border-[#0056f6]/20 font-black"
                            : "bg-transparent text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700"
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>عام وتسمية المجلد</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setAdvancedTab("smart")}
                        className={`px-4 py-2 text-xs font-black rounded-xl transition-all border cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          advancedTab === "smart"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200 font-black"
                            : "bg-transparent text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        <span>مفاتيح ذكية وصور</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setAdvancedTab("german")}
                        className={`px-4 py-2 text-xs font-black rounded-xl transition-all border cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          advancedTab === "german"
                            ? "bg-purple-50 text-purple-600 border-purple-200 font-black"
                            : "bg-transparent text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700"
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5 text-purple-500" />
                        <span>قواعد اللغة الألمانية</span>
                      </button>
                    </div>

                    {/* Tab 1: General Settings */}
                    {advancedTab === "general" && (
                      <div className="space-y-5 animate-fade-in">
                        {/* Primary Customization: Front & Back Instructions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Front face constraints */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 block">تعليمات الوجه الأمامي:</label>
                            <input
                              type="text"
                              value={frontInstructions}
                              onChange={(e) => setFrontInstructions(e.target.value)}
                              placeholder="مثال: اذكر نوع الكلمة"
                              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0056f6] focus:bg-white transition-all text-right"
                            />
                          </div>
                          {/* Back face constraints */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 block">تعليمات الوجه الخلفي:</label>
                            <input
                              type="text"
                              value={backInstructions}
                              onChange={(e) => setBackInstructions(e.target.value)}
                              placeholder="مثال: اذكر الترجمة والترابط"
                              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0056f6] focus:bg-white transition-all text-right"
                            />
                          </div>
                        </div>

                        {/* Divider and Folder Customization Section (At the bottom of the options) */}
                        <div className="border-t border-slate-100 pt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Folder Name card */}
                            <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3 flex flex-col justify-between">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 bg-[#0056f6]/10 text-[#0056f6] rounded-lg">
                                    <Folder className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-xs font-bold text-slate-800">اسم المجلد</span>
                                </div>
                              </div>
                              
                              <input
                                type="text"
                                value={customFolderName}
                                onChange={(e) => setCustomFolderName(e.target.value)}
                                placeholder="تلقائي إن ترك فارغاً"
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#0056f6] transition-all text-right"
                                dir="rtl"
                              />
                            </div>

                            {/* Folder Description card */}
                            <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3 flex flex-col justify-between">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 bg-amber-50 text-amber-600 rounded-lg">
                                    <FileText className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-xs font-bold text-slate-800">وصف المجلد</span>
                                </div>
                              </div>
                              
                              {/* Compact controls row */}
                              <div className="flex items-center justify-between gap-3 bg-white/60 p-2 rounded-xl border border-slate-200/40 min-h-[40px]">
                                {/* Checkbox for Auto */}
                                <label className="flex items-center gap-1.5 select-none cursor-pointer group" dir="rtl">
                                  <input
                                    type="checkbox"
                                    checked={folderDescMode === "auto"}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFolderDescMode("auto");
                                      } else {
                                        setFolderDescMode("on");
                                      }
                                    }}
                                    className="sr-only"
                                  />
                                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                    folderDescMode === "auto"
                                      ? "bg-amber-500 border-amber-500 text-white shadow-3xs"
                                      : "border-slate-300 bg-white group-hover:border-slate-400"
                                  }`}>
                                    {folderDescMode === "auto" && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-800">تلقائي</span>
                                </label>

                                {/* Manual Switch or Smart Indicator */}
                                {folderDescMode === "auto" ? (
                                  <div className="text-[9px] font-extrabold text-amber-600 bg-amber-50/80 px-2 py-0.5 rounded-full border border-amber-100">
                                    ذكي
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-500">
                                      {folderDescMode === "on" ? "تشغيل" : "إيقاف"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setFolderDescMode(folderDescMode === "on" ? "off" : "on")}
                                      className={`w-9 h-5 rounded-full p-0.5 relative transition-colors duration-200 outline-none cursor-pointer ${
                                        folderDescMode === "on" ? "bg-amber-500" : "bg-slate-200"
                                      }`}
                                      dir="ltr"
                                    >
                                      <div
                                        className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                                          folderDescMode === "on" ? "translate-x-4" : "translate-x-0"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {folderDescMode !== "off" && (
                                <div className="space-y-2 pt-1.5 border-t border-slate-200/40 animate-fadeIn">
                                  <input
                                    type="text"
                                    value={customFolderDesc}
                                    onChange={(e) => setCustomFolderDesc(e.target.value)}
                                    placeholder="الوصف اليدوي للمجلد"
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:border-[#0056f6] transition-all text-right"
                                    dir="rtl"
                                  />
                                  <input
                                    type="text"
                                    value={folderDescCondition}
                                    onChange={(e) => setFolderDescCondition(e.target.value)}
                                    placeholder="شروط صياغة الوصف"
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:border-[#0056f6] transition-all text-right"
                                    dir="rtl"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Smart Controls */}
                    {advancedTab === "smart" && (
                      <div className="space-y-5 animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* 1. Description & Translation Hint */}
                          <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-blue-50 text-[#0056f6] rounded-lg">
                                  <FileText className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-bold text-slate-800">الوصف والتلميح</span>
                              </div>
                            </div>
                            
                            {/* Compact controls row */}
                            <div className="flex items-center justify-between gap-3 bg-white/60 p-2 rounded-xl border border-slate-200/40 min-h-[40px]">
                              {/* Checkbox for Auto */}
                              <label className="flex items-center gap-1.5 select-none cursor-pointer group" dir="rtl">
                                <input
                                  type="checkbox"
                                  checked={descriptionMode === "auto"}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setDescriptionMode("auto");
                                    } else {
                                      setDescriptionMode("on");
                                    }
                                  }}
                                  className="sr-only"
                                />
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                  descriptionMode === "auto"
                                    ? "bg-[#0056f6] border-[#0056f6] text-white shadow-3xs"
                                    : "border-slate-300 bg-white group-hover:border-slate-400"
                                }`}>
                                  {descriptionMode === "auto" && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-800">تلقائي</span>
                              </label>

                              {/* Manual Switch or Smart Indicator */}
                              {descriptionMode === "auto" ? (
                                <div className="text-[9px] font-extrabold text-[#0056f6] bg-blue-50/80 px-2 py-0.5 rounded-full border border-blue-100">
                                  ذكي
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {descriptionMode === "on" ? "تشغيل" : "إيقاف"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setDescriptionMode(descriptionMode === "on" ? "off" : "on")}
                                    className={`w-9 h-5 rounded-full p-0.5 relative transition-colors duration-200 outline-none cursor-pointer ${
                                      descriptionMode === "on" ? "bg-[#0056f6]" : "bg-slate-200"
                                    }`}
                                    dir="ltr"
                                  >
                                    <div
                                      className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                                        descriptionMode === "on" ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>
                              )}
                            </div>

                            {descriptionMode !== "off" && (
                              <div className="space-y-1 pt-1.5 border-t border-slate-200/40 animate-fadeIn">
                                <input
                                  type="text"
                                  value={descInstructions}
                                  onChange={(e) => setDescInstructions(e.target.value)}
                                  placeholder="شروط الوصف (اختياري)"
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:border-[#0056f6] transition-all text-right"
                                />
                              </div>
                            )}
                          </div>

                          {/* 2. Interactive Images Switch */}
                          <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-emerald-50 text-emerald-600 rounded-lg">
                                  <Image className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-bold text-slate-800">توليد الصور</span>
                              </div>
                            </div>
                            
                            {/* Compact controls row */}
                            <div className="flex items-center justify-between gap-3 bg-white/60 p-2 rounded-xl border border-slate-200/40 min-h-[40px]">
                              {/* Checkbox for Auto */}
                              <label className="flex items-center gap-1.5 select-none cursor-pointer group" dir="rtl">
                                <input
                                  type="checkbox"
                                  checked={imagesMode === "auto"}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setImagesMode("auto");
                                    } else {
                                      setImagesMode("on");
                                    }
                                  }}
                                  className="sr-only"
                                />
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                  imagesMode === "auto"
                                    ? "bg-emerald-600 border-emerald-600 text-white shadow-3xs"
                                    : "border-slate-300 bg-white group-hover:border-slate-400"
                                }`}>
                                  {imagesMode === "auto" && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-800">تلقائي</span>
                              </label>

                              {/* Manual Switch or Smart Indicator */}
                              {imagesMode === "auto" ? (
                                <div className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded-full border border-emerald-100">
                                  ذكي
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {imagesMode === "on" ? "تشغيل" : "إيقاف"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setImagesMode(imagesMode === "on" ? "off" : "on")}
                                    className={`w-9 h-5 rounded-full p-0.5 relative transition-colors duration-200 outline-none cursor-pointer ${
                                      imagesMode === "on" ? "bg-emerald-500" : "bg-slate-200"
                                    }`}
                                    dir="ltr"
                                  >
                                    <div
                                      className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                                        imagesMode === "on" ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>
                              )}
                            </div>

                            {imagesMode !== "off" && (
                              <div className="space-y-1 pt-1.5 border-t border-slate-200/40 animate-fadeIn">
                                <input
                                  type="text"
                                  value={imageInstructions}
                                  onChange={(e) => setImageInstructions(e.target.value)}
                                  placeholder="شروط الصور (اختياري)"
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:border-[#0056f6] transition-all text-right"
                                />
                              </div>
                            )}
                          </div>

                          {/* 3. Image Storage Modes & Timing Configuration */}
                          <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3 col-span-1 sm:col-span-2">
                            <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-blue-50 text-[#0056f6] rounded-lg">
                                  <DownloadCloud className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-black text-slate-800">إعدادات توقيت وتخزين الصور المفصلة</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowImageOptionsModal(true)}
                                className="text-[10px] font-extrabold text-[#0056f6] hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Sliders className="w-3 h-3" />
                                <span>فتح نافذة الخيارات المتقدمة ⚙️</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                              {/* Timing */}
                              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200/50">
                                <span className="text-[10px] font-bold text-slate-500 block">توقيت جلب الصورة الأساسية:</span>
                                <select
                                  value={primaryImageTiming}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setPrimaryImageTiming(val);
                                    localStorage.setItem("settings_primary_image_timing", val);
                                  }}
                                  className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                                >
                                  <option value="auto_after_ai">جلب تلقائي فور رد سيرفر الذكاء ⚡</option>
                                  <option value="manual_download">تأجيل الجلب للضغط اليدوي 🖐️</option>
                                </select>
                              </div>

                              {/* Primary storage */}
                              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200/50">
                                <span className="text-[10px] font-bold text-slate-500 block">نمط خزن الصورة الأساسية:</span>
                                <select
                                  value={primaryImageStorageMode}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setPrimaryImageStorageMode(val);
                                    localStorage.setItem("settings_primary_image_storage", val);
                                  }}
                                  className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                                >
                                  <option value="data_url">تخزين محلي (Data URL / Offline Cache) 💾</option>
                                  <option value="direct_url">رابط مباشر (Direct URL) 🔗</option>
                                </select>
                              </div>

                              {/* Secondary storage */}
                              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200/50">
                                <span className="text-[10px] font-bold text-slate-500 block">خزن الـ 10 صور الثانوية:</span>
                                <select
                                  value={secondaryImagesStorageMode}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setSecondaryImagesStorageMode(val);
                                    localStorage.setItem("settings_secondary_images_storage", val);
                                  }}
                                  className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                                >
                                  <option value="data_urls">تنزيل وتخزين مسبق للـ 10 صور 📦</option>
                                  <option value="direct_urls">روابط مباشرة فقط للـ 10 صور 🌐</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: German Settings */}
                    {advancedTab === "german" && (
                      <div className="space-y-5 animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* 3. German Articles Switch */}
                          <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-purple-50 text-purple-600 rounded-lg">
                                  <Globe className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-bold text-slate-800">الأدوات الألمانية</span>
                              </div>
                            </div>
                            
                            {/* Compact controls row */}
                            <div className="flex items-center justify-between gap-3 bg-white/60 p-2 rounded-xl border border-slate-200/40 min-h-[40px]">
                              {/* Checkbox for Auto */}
                              <label className="flex items-center gap-1.5 select-none cursor-pointer group" dir="rtl">
                                <input
                                  type="checkbox"
                                  checked={germanArticlesMode === "auto"}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setGermanArticlesMode("auto");
                                    } else {
                                      setGermanArticlesMode("on");
                                    }
                                  }}
                                  className="sr-only"
                                />
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                  germanArticlesMode === "auto"
                                    ? "bg-purple-600 border-purple-600 text-white shadow-3xs"
                                    : "border-slate-300 bg-white group-hover:border-slate-400"
                                }`}>
                                  {germanArticlesMode === "auto" && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-800">تلقائي</span>
                              </label>

                              {/* Manual Switch or Smart Indicator */}
                              {germanArticlesMode === "auto" ? (
                                <div className="text-[9px] font-extrabold text-purple-600 bg-purple-50/80 px-2 py-0.5 rounded-full border border-purple-100">
                                  ذكي
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {germanArticlesMode === "on" ? "تشغيل" : "إيقاف"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setGermanArticlesMode(germanArticlesMode === "on" ? "off" : "on")}
                                    className={`w-9 h-5 rounded-full p-0.5 relative transition-colors duration-200 outline-none cursor-pointer ${
                                      germanArticlesMode === "on" ? "bg-purple-600" : "bg-slate-200"
                                    }`}
                                    dir="ltr"
                                  >
                                    <div
                                      className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                                        germanArticlesMode === "on" ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="pt-1.5 border-t border-slate-200/40 text-center">
                              <span className="text-[9px] font-semibold text-slate-400">خاص باللغة الألمانية</span>
                            </div>
                          </div>

                          {/* 4. German Plural Switch */}
                          <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-fuchsia-50 text-fuchsia-600 rounded-lg">
                                  <Plus className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-bold text-slate-800">صيغة الجمع (Plural)</span>
                              </div>
                            </div>
                            
                            {/* Compact controls row */}
                            <div className="flex items-center justify-between gap-3 bg-white/60 p-2 rounded-xl border border-slate-200/40 min-h-[40px]">
                              {/* Checkbox for Auto */}
                              <label className="flex items-center gap-1.5 select-none cursor-pointer group" dir="rtl">
                                <input
                                  type="checkbox"
                                  checked={germanPluralMode === "auto"}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setGermanPluralMode("auto");
                                    } else {
                                      setGermanPluralMode("on");
                                    }
                                  }}
                                  className="sr-only"
                                />
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                  germanPluralMode === "auto"
                                    ? "bg-fuchsia-600 border-fuchsia-600 text-white shadow-3xs"
                                    : "border-slate-300 bg-white group-hover:border-slate-400"
                                }`}>
                                  {germanPluralMode === "auto" && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-800">تلقائي</span>
                              </label>

                              {/* Manual Switch or Smart Indicator */}
                              {germanPluralMode === "auto" ? (
                                <div className="text-[9px] font-extrabold text-fuchsia-600 bg-fuchsia-50/80 px-2 py-0.5 rounded-full border border-fuchsia-100">
                                  ذكي
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {germanPluralMode === "on" ? "تشغيل" : "إيقاف"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setGermanPluralMode(germanPluralMode === "on" ? "off" : "on")}
                                    className={`w-9 h-5 rounded-full p-0.5 relative transition-colors duration-200 outline-none cursor-pointer ${
                                      germanPluralMode === "on" ? "bg-fuchsia-600" : "bg-slate-200"
                                    }`}
                                    dir="ltr"
                                  >
                                    <div
                                      className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                                        germanPluralMode === "on" ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>
                              )}
                            </div>

                            {germanPluralMode !== "off" && (
                              <div className="space-y-1 pt-1.5 border-t border-slate-200/40 animate-fadeIn animate-duration-150">
                                <input
                                  type="text"
                                  value={germanPluralInstruction}
                                  onChange={(e) => setGermanPluralInstruction(e.target.value)}
                                  placeholder="شروط صيغة الجمع (اختياري)"
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:border-fuchsia-500 transition-all text-right"
                                />
                              </div>
                            )}

                            <div className="pt-1.5 border-t border-slate-200/40 text-center">
                              <span className="text-[9px] font-semibold text-slate-400">خاص باللغة الألمانية</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 pt-1">
                {/* Sleek Segmented Model Selector next to the generation button */}
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80 shadow-3xs" dir="rtl">
                  <button
                    type="button"
                    onClick={() => handleProviderChange("gemini")}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      aiProvider === "gemini"
                        ? "bg-white text-[#0056f6] shadow-3xs border border-slate-100"
                        : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Gemini</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderChange("groq")}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      aiProvider === "groq"
                        ? "bg-white text-orange-600 shadow-3xs border border-slate-100"
                        : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    <span>Groq</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setExternalError(null);
                    setExternalCopySuccess(false);
                    setExternalTab("prompt");
                    setShowExternalModal(true);
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  title="تصدير البرومبت الخارجي واستيراد البيانات كـ JSON"
                >
                  <Globe className="w-3.5 h-3.5 text-indigo-600" />
                  <span>خارجي 🌐</span>
                </button>

                <button
                  id="generate-button-main"
                  onClick={() => handleGenerate(prompt)}
                  disabled={!prompt.trim()}
                  className="px-6 py-2 rounded-lg bg-[#0056f6] hover:bg-[#0047cc] text-white font-bold text-xs active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>بدء التوليد الذكي</span>
                </button>
              </div>
            </div>

            {/* Temporary Folders List Section */}
            <div className="space-y-3.5">
              <h3 className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-slate-400" />
                <span>المجلدات الذكية المسودة ({aiFolders.length})</span>
              </h3>

              {aiFolders.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-6">
                  <BookOpen className="w-10 h-10 text-slate-300 mb-2.5" />
                  <h4 className="font-bold text-slate-600 text-xs">لا توجد مجلدات مؤقتة مضافة بعد</h4>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-sm leading-relaxed font-semibold">
                    عند كتابة برومبت والضغط على "توليد"، سيتم إنشاء مجلد ذكي مؤقت وحفظه في هذا القسم لتجربته وتطويره بالكامل قبل نقله لمكتبتك العامة.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 animate-fade-in">
                  {aiFolders.map((f) => {
                    const cardsInFolder = aiCards.filter(c => c.folderId === f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => setActiveAiFolderId(f.id)}
                        className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg hover:shadow-xs transition-all cursor-pointer group hover:bg-slate-50/40"
                      >
                        <div className="flex items-center gap-4 text-right">
                          {/* Book/Binder cover styled spine representing a folder */}
                          <div className="relative w-14 h-14 shrink-0">
                            {/* Folder Tab */}
                            <div 
                              className="absolute top-0 right-1 w-6 h-2 rounded-t-xs border-t border-x z-0"
                              style={{ 
                                backgroundColor: f.color || '#0056f6',
                                borderColor: `${f.color || '#0056f6'}40`
                              }}
                            />
                            {/* Folder Main Body */}
                            <div 
                              className="absolute bottom-0 left-0 right-0 h-[46px] rounded-b-md rounded-tl-md overflow-hidden border shadow-3xs flex items-center justify-center transition-all duration-300 z-10"
                              style={{
                                backgroundColor: `${f.color || '#0056f6'}15`,
                                borderColor: f.color ? `${f.color}50` : "#e2e8f0",
                                borderWidth: "1.5px"
                              }}
                            >
                              <div 
                                className="absolute inset-0 transition-all duration-300 group-hover:brightness-105"
                                style={{
                                  background: `linear-gradient(135deg, ${f.color || '#0056f6'}, ${f.color ? f.color + "dd" : "#0047cc"})`
                                }}
                              />
                              
                              {/* Notebook Binder Spine (RTL) */}
                              <div 
                                className="absolute right-0 top-0 bottom-0 w-2 shadow-sm transition-all flex flex-col justify-around py-1.5 items-center z-10"
                                style={{ backgroundColor: f.color || "#0056f6", filter: "brightness(0.82)" }}
                              >
                                <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                                <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                                <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                              </div>

                              {/* Folder Indicator Icon badge */}
                              <div 
                                className="absolute left-1 bottom-1 bg-white p-0.5 rounded-xs z-10 border shadow-xs flex items-center justify-center"
                                style={{ borderColor: `${f.color || '#0056f6'}15` }}
                              >
                                <Folder className="w-2.5 h-2.5 fill-current" style={{ color: f.color || '#0056f6' }} />
                              </div>
                            </div>
                          </div>

                          {/* Text block */}
                          <div>
                            <h4 className="font-bold text-[#202124] text-base group-hover:text-[#0056f6] transition-colors">
                              {f.name}
                            </h4>
                            <p className="text-xs text-[#5f6368] font-medium mt-1">
                              {cardsInFolder.length} بطاقات • {f.frontLang.toUpperCase()} إلى {f.backLang.toUpperCase()}
                            </p>
                          </div>
                        </div>

                        {/* Delete action button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAiFolder(f.id);
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                          title="حذف هذا المجلد المؤقت"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI REQUEST LOG & QUOTA INSPECTOR */}
            <div className="bg-white rounded-[24px] border border-slate-200/50 p-6 space-y-4 shadow-elevation-1" dir="rtl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#0056f6]" />
                  <h3 className="font-bold text-sm text-slate-800">سجل عمليات وحصص الذكاء الاصطناعي</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAiRequestHistory([]);
                    localStorage.removeItem("ai_request_history");
                  }}
                  disabled={aiRequestHistory.length === 0}
                  className="text-[10px] font-bold text-slate-400 hover:text-rose-600 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors"
                >
                  مسح السجل
                </button>
              </div>

              <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                توضح هذه اللوحة سجل طلبات التوليد السابقة وحالة الحصة المستخدمة (Quotas) لمزودي الخدمة لمساعدتك على فهم حدودك اليومية والدقيقة.
              </p>

              {aiRequestHistory.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-100">
                  <Activity className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-[10px] text-slate-400 font-semibold">لا توجد عمليات مسجلة حالياً</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {aiRequestHistory.map((log) => {
                    const isFailed = log.status === "failed";
                    const hasUsage = !!log.usage && (log.usage.totalTokens > 0);
                    const parsedLimit = log.rateLimitInfo;
                    const dateFormatted = new Date(log.timestamp).toLocaleTimeString("ar-EG", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit"
                    });

                    return (
                      <div 
                        key={log.id} 
                        className={`p-3.5 rounded-xl border transition-all text-right space-y-2.5 ${
                          isFailed 
                            ? "bg-rose-50/40 border-rose-100" 
                            : "bg-slate-50/30 border-slate-150/80 hover:bg-slate-50/60"
                        }`}
                      >
                        {/* Log Header */}
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isFailed ? "bg-rose-500" : "bg-emerald-500 animate-pulse"}`} />
                            <span className="font-black text-slate-700">{log.id}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400 font-semibold">{dateFormatted}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${
                              log.provider === "groq" ? "bg-orange-50 text-orange-600 border border-orange-100" : "bg-blue-50 text-[#0056f6] border border-blue-100"
                            }`}>
                              {log.provider === "groq" ? "Groq" : "Gemini"}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${
                              isFailed ? "bg-rose-100/60 text-rose-700" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            }`}>
                              {isFailed ? "مرفوض / فشل" : "مكتمل بنجاح"}
                            </span>
                          </div>
                        </div>

                        {/* Prompt Info */}
                        <div className="text-[10px] bg-white border border-slate-100 p-2 rounded-lg font-medium text-slate-600 truncate">
                          <strong className="text-slate-800">الطلب المرسل:</strong> {log.prompt}
                        </div>

                        {/* Usage Stats or Error breakdown */}
                        {isFailed ? (
                          <div className="text-[10px] text-rose-800 font-bold bg-rose-50/80 p-2.5 rounded-lg border border-rose-100 leading-relaxed">
                            <p className="font-black text-right">❌ تفاصيل الخطأ المرتجع من الخادم:</p>
                            <p className="font-semibold text-[9px] mt-1 font-mono break-words bg-rose-100/30 p-1.5 rounded text-right">{log.error}</p>
                            
                            {parsedLimit && (
                              <div className="mt-2 pt-2 border-t border-rose-100 grid grid-cols-2 gap-2 text-[9px] font-bold text-rose-900 text-right">
                                {parsedLimit.limitType && (
                                  <div>
                                    الحصة المتأثرة: <span className="font-mono bg-rose-100 px-1 rounded">{parsedLimit.limitType === "TPD" ? "اليومية للتوكنات" : parsedLimit.limitType === "RPM" ? "الدقيقة للطلبات" : "الدقيقة للتوكنات"}</span>
                                  </div>
                                )}
                                {parsedLimit.limit && (
                                  <div>
                                    الحد الأقصى: <span className="font-mono bg-rose-100 px-1 rounded">{parsedLimit.limit.toLocaleString()}</span>
                                  </div>
                                )}
                                {parsedLimit.used !== undefined && (
                                  <div>
                                    المستهلك: <span className="font-mono bg-rose-100 px-1 rounded">{parsedLimit.used.toLocaleString()}</span>
                                  </div>
                                )}
                                {parsedLimit.requested !== undefined && (
                                  <div>
                                    المطلوب: <span className="font-mono bg-rose-100 px-1 rounded">{parsedLimit.requested.toLocaleString()}</span>
                                  </div>
                                )}
                                {parsedLimit.resetIn && (
                                  <div className="col-span-2 text-amber-900 font-black flex items-center gap-1 mt-1">
                                    <span>⏱️ وقت التجدد المتبقي:</span>
                                    <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">{formatArabicResetTime(parsedLimit.resetIn)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2.5 items-center justify-between text-[10px] font-semibold text-slate-500 pt-1">
                            <div>
                              عدد البطاقات المنجزة: <span className="font-black text-slate-700 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{log.cardsCount === "auto" ? "تلقائي ✨" : `${log.cardsCount} بطاقة`}</span>
                            </div>
                            
                            {hasUsage && (
                              <div className="flex items-center gap-2">
                                <span>التوكنات المستهلكة:</span>
                                <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100/50">إجمالي {log.usage?.totalTokens.toLocaleString()}</span>
                                <span className="text-[9px] text-slate-400 font-mono">(مدخلات: {log.usage?.promptTokens} • مخرجات: {log.usage?.completionTokens})</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Collapsible Detailed Prompt & Response Inspector */}
                        {(log.rawPrompt || log.response || log.rawRequestBody || log.rawResponseBody) && (
                          <div className="pt-2 border-t border-slate-100/60 mt-2">
                            <details className="group">
                              <summary className="flex items-center gap-1.5 text-[10px] text-[#0056f6] hover:text-[#0047cc] font-black cursor-pointer select-none">
                                <Code className="w-3.5 h-3.5 text-[#0056f6]" />
                                <span>عرض تفاصيل هندسة الأوامر والبيانات الخام للطلب والرد (Payload Debugger)</span>
                                <ChevronDown className="w-3 h-3 transition-transform duration-200 group-open:rotate-180" />
                              </summary>
                              
                              <div className="mt-3 space-y-4 text-right" dir="rtl">
                                {/* Prompt Engineering & Summary (If present) */}
                                {(log.rawPrompt || log.response) && (
                                  <div className="space-y-4 border-b border-slate-100 pb-4">
                                    <h4 className="text-[10px] font-extrabold text-slate-700">🔍 ملخص هندسة الأوامر والمخرجات المفسرة:</h4>
                                    
                                    {log.rawPrompt && (
                                      <div className="space-y-1">
                                        <span className="text-[9px] text-slate-400 font-extrabold block">البرومبت التفصيلي النهائي المرسل للموديل (Raw Prompt):</span>
                                        <CodeViewer
                                          code={log.rawPrompt}
                                          title="البرومبت التفصيلي النهائي"
                                          language="markdown"
                                          badge="Input Prompt"
                                          compactHeight="max-h-[150px]"
                                          tokenCount={log.usage?.promptTokens}
                                        />
                                      </div>
                                    )}

                                    {log.response && (
                                      <div className="space-y-1">
                                        <span className="text-[9px] text-slate-400 font-extrabold block">البنية والتفاصيل الراجعة من الموديل (Model Output Summary):</span>
                                        <CodeViewer
                                          code={log.response}
                                          title="ملخص المخرجات المفسرة من الموديل"
                                          language="markdown"
                                          badge="Output"
                                          compactHeight="max-h-[150px]"
                                          tokenCount={log.usage?.completionTokens}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Raw HTTP Request & Response Body Section */}
                                {(log.rawRequestBody || log.rawResponseBody) && (
                                  <div className="space-y-3">
                                    <h4 className="text-[10px] font-extrabold text-slate-700">🔌 البيانات الخام المنقولة بالشبكة (Raw HTTP Stream):</h4>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" dir="ltr">
                                      {/* Raw Request Column */}
                                      <div className="space-y-1 text-left">
                                        <span className="text-[9px] text-slate-400 font-extrabold block">الطلب الخام (Raw Request Body):</span>
                                        <CodeViewer
                                          code={log.rawRequestBody || "{}"}
                                          title="محتوى الطلب المرسل"
                                          language="json"
                                          badge="Request Body"
                                          compactHeight="h-[220px]"
                                          tokenCount={log.usage?.promptTokens}
                                        />
                                      </div>

                                      {/* Raw Response Column */}
                                      <div className="space-y-1 text-left">
                                        <span className="text-[9px] text-slate-400 font-extrabold block">الرد الخام المباشر (Raw Response Body):</span>
                                        <CodeViewer
                                          code={log.rawResponseBody || "(empty)"}
                                          title="محتوى الرد المستلم"
                                          language="json"
                                          badge="Response Body"
                                          compactHeight="h-[220px]"
                                          tokenCount={log.usage?.completionTokens}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* =========================================================================
             2. DETAILED VIEW: Normal folder display styled exactly like Explorer.tsx
             ========================================================================= */
          activeAiFolder && (
            <div className="space-y-4 animate-fade-in">
              
              {/* Folder Cover Image / Details Banner */}
              <div 
                className="bg-white border rounded-2xl p-4 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden"
                style={{ borderRight: `6px solid ${activeAiFolder.color || '#0056f6'}` }}
              >
                {activeAiFolder.coverImage && (
                  <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <img
                      src={activeAiFolder.coverImage}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{
                        opacity: 0.08,
                        filter: "blur(2px)"
                      }}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                {/* Book/Notebook Binder layout representation */}
                <div className="flex items-center gap-4 text-right z-10 relative">
                  <div className="relative w-12 h-12 shrink-0">
                    <div 
                      className="absolute top-0 right-1 w-6 h-1.5 rounded-t-xs border-t border-x z-0"
                      style={{ 
                        backgroundColor: activeAiFolder.color || '#0056f6',
                        borderColor: `${activeAiFolder.color || '#0056f6'}40`
                      }}
                    />
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-[40px] rounded-b-md rounded-tl-md overflow-hidden border shadow-sm flex items-center justify-center z-10"
                      style={{
                        background: activeAiFolder.coverImage
                          ? `url(${activeAiFolder.coverImage}) center/cover no-repeat`
                          : `linear-gradient(135deg, ${activeAiFolder.color || '#0056f6'}, ${activeAiFolder.color ? activeAiFolder.color + "cc" : "#0047cc"})`,
                        borderColor: `${activeAiFolder.color}40`,
                        borderWidth: "1.5px"
                      }}
                    >
                      {activeAiFolder.coverImage && (
                        <div className="absolute inset-0 bg-black/10" />
                      )}
                      {/* Spine */}
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-2 shadow-sm flex flex-col justify-around py-1 items-center z-10"
                        style={{ backgroundColor: activeAiFolder.color || "#0056f6", filter: "brightness(0.82)" }}
                      >
                        <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                        <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                      </div>
                      {!activeAiFolder.coverImage && <Folder className="w-4 h-4 text-white/90 z-10" />}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold border border-indigo-100">
                        {isRefiningExistingFolder ? "تعديل مجلد المكتبة بالذكاء الاصطناعي 🪄" : "مجلد ذكي مؤقت 🤖"}
                      </span>
                      <h3 className="text-base font-black text-slate-800 tracking-tight">{activeAiFolder.name}</h3>
                    </div>
                    {activeAiFolder.description && (
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed max-w-xl">{activeAiFolder.description}</p>
                    )}
                    <div className="flex gap-2 pt-0.5">
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
                        من: {activeAiFolder.frontLang.toUpperCase()}
                      </span>
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
                        إلى: {activeAiFolder.backLang.toUpperCase()}
                      </span>
                      <span className="text-[9px] bg-blue-50 text-primary px-1.5 py-0.5 rounded-full font-bold">
                        إجمالي: {folderCards.length} بطاقة
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Action buttons for the AI Folder (Placed below header, compact sizing) */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 p-2 rounded-xl overflow-x-auto whitespace-nowrap scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden z-10">
                {reviewMode ? (
                  <button
                    onClick={() => setReviewMode(false)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-200" />
                    <span>الرجوع لعرض القائمة 📋</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (folderCards.length === 0) {
                        alert("لا توجد بطاقات للمراجعة تفاعلياً!");
                        return;
                      }
                      setReviewMode(true);
                      setCurrentReviewIndex(0);
                      setReviewFlipped(false);
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5 text-violet-200" />
                    <span>تصفح ومراجعة تفاعلية 🎴</span>
                  </button>
                )}

                {isRefiningExistingFolder ? (
                  <button
                    onClick={() => {
                      if (onSaveRefinedFolder && activeAiFolder) {
                        const cardsToSave = folderCards
                          .filter(c => selectedCardIds.includes(c.id))
                          .map(c => {
                            let candidates = c.autoImageCandidates;
                            if (!candidates && c.id) {
                              try {
                                const raw = localStorage.getItem(`auto_images_${c.id}`);
                                if (raw) candidates = JSON.parse(raw);
                              } catch (e) {}
                            }
                            return {
                              id: c.id,
                              frontText: c.frontText,
                              backText: c.backText,
                              frontLang: activeAiFolder.frontLang,
                              backLang: activeAiFolder.backLang,
                              isArticleMode: c.isArticleMode || false,
                              correctArticle: c.correctArticle || "",
                              isPluralMode: c.isPluralMode || false,
                              pluralText: c.pluralText || "",
                              pluralLang: c.pluralLang || "de",
                              translationHint: c.translationHint || "",
                              difficulty: c.difficulty || "medium",
                              frontImage: c.frontImage || undefined,
                              frontImagePosition: c.frontImagePosition || undefined,
                              autoImageCandidates: candidates,
                              imageSearchQuery: c.imageSearchQuery || undefined
                            };
                          });
                        onSaveRefinedFolder(activeAiFolder.id, {
                          name: activeAiFolder.name,
                          description: activeAiFolder.description,
                          color: activeAiFolder.color,
                          coverImage: activeAiFolder.coverImage,
                          coverImagePosition: activeAiFolder.coverImagePosition
                        }, cardsToSave);
                      }
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5 text-white" />
                    <span>حفظ التعديلات في المكتبة 💾</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowImportDialog(true)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0056f6] hover:bg-[#0047cc] text-white font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5 text-white" />
                    <span>تثبيت وحفظ بالمكتبة العامة 💾</span>
                  </button>
                )}

                {!reviewMode && (
                  <button
                    onClick={() => setShowRefinePanel(!showRefinePanel)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1 ${
                      showRefinePanel 
                        ? "bg-amber-600 hover:bg-amber-500 text-white" 
                        : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>تعديل جماعي ذكي بالذكاء الاصطناعي 🪄</span>
                  </button>
                )}

                {!reviewMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setShowImageOptionsModal(true)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                      title="فتح خيارات وبدء جلب وتنزيل الصور للبطاقات"
                    >
                      <DownloadCloud className="w-3.5 h-3.5 text-blue-100" />
                      <span>بدء عملية جلب وتنزيل الصور 🖼️</span>
                    </button>

                    <button
                      onClick={() => setShowImageOptionsModal(true)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-all cursor-pointer flex items-center justify-center border border-slate-200"
                      title="تخصيص نمط وتوقيت تخزين الصور الأساسية والثانوية"
                    >
                      <Sliders className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                  </div>
                )}

                {!reviewMode && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Small themed provider toggle for Next Batch */}
                    <div className="flex items-center gap-0.5 bg-emerald-50/80 p-0.5 rounded-lg border border-emerald-200 text-[10px] select-none h-[30px]">
                      <button
                        type="button"
                        onClick={() => {
                          setNextBatchAiProvider("gemini");
                          localStorage.setItem("settings_next_batch_ai_provider", "gemini");
                        }}
                        className={`px-2.5 py-0.5 rounded-md font-black transition-all h-full flex items-center cursor-pointer ${
                          nextBatchAiProvider === "gemini"
                            ? "bg-emerald-600 text-white shadow-3xs"
                            : "text-emerald-700 hover:bg-emerald-100/50"
                        }`}
                        title="توليد الوجبة الإضافية باستخدام Gemini"
                      >
                        Gemini
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNextBatchAiProvider("groq");
                          localStorage.setItem("settings_next_batch_ai_provider", "groq");
                        }}
                        className={`px-2.5 py-0.5 rounded-md font-black transition-all h-full flex items-center cursor-pointer ${
                          nextBatchAiProvider === "groq"
                            ? "bg-orange-600 text-white shadow-3xs"
                            : "text-emerald-700 hover:bg-emerald-100/50"
                        }`}
                        title="توليد الوجبة الإضافية باستخدام Groq"
                      >
                        Groq
                      </button>
                    </div>

                    <button
                      onClick={() => setShowNextBatchDirection(!showNextBatchDirection)}
                      className={`px-3 py-1.5 rounded-lg font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1 ${
                        showNextBatchDirection
                          ? "bg-emerald-700 text-white"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                      }`}
                      title="توليد وجبة إضافية بموضوع مخصص وموجه"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                      <span>توليد وجبة مخصصة 🔄</span>
                    </button>
                    
                    {!showNextBatchDirection && (
                      <button
                        onClick={handleGenerateNextBatch}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] shadow-xs transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
                        title="توليد سريع لوجبة إضافية تكميلية مباشرة"
                      >
                        <span>توليد سريع ⚡</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="mr-auto shrink-0" />

                <button
                  onClick={() => handleDeleteAiFolder(activeAiFolder.id)}
                  className="shrink-0 p-1.5 rounded-lg border border-rose-200 text-rose-600 bg-rose-50/50 hover:bg-rose-50 text-[11px] font-black transition-all cursor-pointer flex items-center justify-center"
                  title="حذف المجلد المؤقت"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Next Batch Custom Direction Input Panel */}
              {showNextBatchDirection && (
                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-5 space-y-4 animate-fade-in text-right shadow-3xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-black text-slate-800">توجيه موضوعي مخصص للوجبة القادمة</span>
                    </div>
                    <button 
                      onClick={() => {
                        setShowNextBatchDirection(false);
                        setNextBatchDirection("");
                      }}
                      className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                    >
                      إلغاء التخصيص
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                    سيقوم الذكاء الاصطناعي بتوليد بطاقات جديدة تلتزم بنفس لغتك وتفضيلاتك (مثل الصور المخصصة، أو أدوات التعريف) ولكنها ستتجه لتركيز مخصص من المواضيع الذي تحدده هنا.
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/80 p-3 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-[10px] font-bold text-slate-500">مزود الذكاء الاصطناعي للوجبة الإضافية:</span>
                      <div className="flex items-center gap-0.5 bg-slate-150 p-0.5 rounded-lg border border-slate-200 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            setNextBatchAiProvider("gemini");
                            localStorage.setItem("settings_next_batch_ai_provider", "gemini");
                          }}
                          className={`px-2 py-0.5 rounded-md font-bold transition-all h-[24px] flex items-center cursor-pointer ${
                            nextBatchAiProvider === "gemini"
                              ? "bg-emerald-600 text-white shadow-3xs"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          Gemini
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNextBatchAiProvider("groq");
                            localStorage.setItem("settings_next_batch_ai_provider", "groq");
                          }}
                          className={`px-2 py-0.5 rounded-md font-bold transition-all h-[24px] flex items-center cursor-pointer ${
                            nextBatchAiProvider === "groq"
                              ? "bg-orange-600 text-white shadow-3xs"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          Groq
                        </button>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">النموذج النشط: {nextBatchAiProvider === "groq" ? "Llama 3.3 (70B)" : "Gemini 3.5 Flash"}</span>
                  </div>
                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      value={nextBatchDirection}
                      onChange={(e) => setNextBatchDirection(e.target.value)}
                      placeholder="مثال: ركز هذه الوجبة على مصطلحات المطعم والمأكولات، أو الأفعال الأكثر استخداماً..."
                      className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-emerald-200 outline-none focus:border-emerald-600 font-bold bg-white text-right shadow-3xs"
                      dir="rtl"
                    />
                    <button
                      onClick={handleGenerateNextBatch}
                      disabled={loading}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                    >
                      <span>توليد الآن 🚀</span>
                    </button>
                  </div>
                </div>
              )}

              {/* AI BATCH CARD REFINEMENT PANEL */}
              {showRefinePanel && (
                <div className="bg-gradient-to-br from-amber-50/70 to-orange-50/40 border border-amber-200/80 rounded-2xl p-5 space-y-5 animate-fade-in text-right shadow-3xs">
                  <div className="flex items-center justify-between border-b border-amber-150 pb-3">
                    <div className="flex items-center gap-2 text-amber-800">
                      <Wand2 className="w-5 h-5 text-amber-600 animate-pulse" />
                      <h4 className="text-sm font-black">التعديل الجماعي الذكي للبطاقات بالذكاء الاصطناعي 🪄</h4>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setShowRefinePanel(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 bg-white rounded-full border border-slate-100 shadow-3xs cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                    هذا القسم يتيح لك إعادة تعديل، صياغة، أو تحديث كافة البطاقات الموجودة في هذا المجلد بالكامل دفعة واحدة باستخدام الذكاء الاصطناعي! يمكنك اختيار جانب واحد أو أكثر لتغييره.
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/75 border border-amber-200/60 p-3 rounded-xl">
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-xs font-black text-slate-700">اختر محرك الذكاء الاصطناعي للتعديل الجماعي:</span>
                      <div className="flex bg-slate-150 p-0.5 rounded-lg border border-slate-200 text-[10px] h-[28px]">
                        <button
                          type="button"
                          onClick={() => {
                            setRefineAiProvider("gemini");
                            localStorage.setItem("settings_refine_ai_provider", "gemini");
                          }}
                          className={`px-3 py-0.5 rounded-md font-black transition-all h-full flex items-center cursor-pointer ${
                            refineAiProvider === "gemini"
                              ? "bg-amber-600 text-white shadow-3xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Gemini
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRefineAiProvider("groq");
                            localStorage.setItem("settings_refine_ai_provider", "groq");
                          }}
                          className={`px-3 py-0.5 rounded-md font-black transition-all h-full flex items-center cursor-pointer ${
                            refineAiProvider === "groq"
                              ? "bg-orange-600 text-white shadow-3xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Groq (Llama)
                        </button>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      المحرك النشط حالياً: <strong className={refineAiProvider === "groq" ? "text-orange-600" : "text-[#0056f6]"}>{refineAiProvider === "groq" ? "Groq (Llama-3.3-70b)" : "Google Gemini"}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* 1. Description/Hint Modification */}
                    <div className={`p-4 rounded-xl border transition-all ${refineModifyDescription ? 'bg-white border-amber-300 shadow-3xs' : 'bg-slate-50/50 border-slate-200'}`}>
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={refineModifyDescription}
                          onChange={(e) => setRefineModifyDescription(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                        <span className="font-extrabold text-xs text-slate-800">تعديل الوصف والتلميحات (translationHint) 📝</span>
                      </label>
                      
                      {refineModifyDescription && (
                        <div className="mt-3.5 space-y-3 animate-fade-in">
                          <div>
                            <span className="text-[10px] font-black text-slate-500 block mb-1">ما هي مشكلة الوصف أو التلميحات السابقة؟ (اختياري):</span>
                            <input
                              type="text"
                              value={refineDescriptionIssue}
                              onChange={(e) => setRefineDescriptionIssue(e.target.value)}
                              placeholder="مثال: طويلة للغاية، أو معقدة وصعبة الفهم..."
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-amber-400"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-black text-amber-700 block mb-1">التوجيهات وشكل الوصف الجديد (إجباري) * :</span>
                            <textarea
                              value={refineDescriptionInstruction}
                              onChange={(e) => setRefineDescriptionInstruction(e.target.value)}
                              placeholder="مثال: اجعله قصيراً جداً (كلمتين إلى ثلاث فقط) وبلهجة مبسطة وممتعة."
                              className="w-full min-h-[60px] px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs font-bold outline-none resize-none focus:bg-white focus:border-amber-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Image Style Modification */}
                    <div className={`p-4 rounded-xl border transition-all ${refineModifyImages ? 'bg-white border-amber-300 shadow-3xs' : 'bg-slate-50/50 border-slate-200'}`}>
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={refineModifyImages}
                          onChange={(e) => setRefineModifyImages(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                        <span className="font-extrabold text-xs text-slate-800">تغيير نمط الصور والوسائط 🖼️</span>
                      </label>
                      
                      {refineModifyImages && (
                        <div className="mt-3.5 space-y-3 animate-fade-in">
                          <div>
                            <span className="text-[10px] font-black text-amber-700 block mb-1">التوجيهات والنمط البصري الجديد للصور (إجباري) * :</span>
                            <textarea
                              value={refineImageInstruction}
                              onChange={(e) => setRefineImageInstruction(e.target.value)}
                              placeholder="مثال: كرتون ثلاثي الأبعاد، رسومات مسطحة مبسطة، أو clipart باللون الأبيض والأسود..."
                              className="w-full min-h-[105px] px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs font-bold outline-none resize-none focus:bg-white focus:border-amber-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. Front Text Modification */}
                    <div className={`p-4 rounded-xl border transition-all ${refineModifyFrontText ? 'bg-white border-amber-300 shadow-3xs' : 'bg-slate-50/50 border-slate-200'}`}>
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={refineModifyFrontText}
                          onChange={(e) => setRefineModifyFrontText(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                        <span className="font-extrabold text-xs text-slate-800">تعديل النص الأمامي للبطاقات (frontText) 🅰️</span>
                      </label>
                      
                      {refineModifyFrontText && (
                        <div className="mt-3.5 space-y-3 animate-fade-in">
                          <div>
                            <span className="text-[10px] font-black text-amber-700 block mb-1">توجيهات تعديل الكلمة أو العبارة الأمامية (إجباري) * :</span>
                            <textarea
                              value={refineFrontTextInstruction}
                              onChange={(e) => setRefineFrontTextInstruction(e.target.value)}
                              placeholder="مثال: اجعل الكلمات دائماً بصيغة الجمع، أو أضف الأداة والترجمة الصوتية مدمجة..."
                              className="w-full min-h-[80px] px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs font-bold outline-none resize-none focus:bg-white focus:border-amber-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4. Back Text/Translation Modification */}
                    <div className={`p-4 rounded-xl border transition-all ${refineModifyBackText ? 'bg-white border-amber-300 shadow-3xs' : 'bg-slate-50/50 border-slate-200'}`}>
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={refineModifyBackText}
                          onChange={(e) => setRefineModifyBackText(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                        <span className="font-extrabold text-xs text-slate-800">تعديل النص الخلفي والترجمات العربية (backText) 🌐</span>
                      </label>
                      
                      {refineModifyBackText && (
                        <div className="mt-3.5 space-y-3 animate-fade-in">
                          <div>
                            <span className="text-[10px] font-black text-amber-700 block mb-1">توجيهات صياغة الترجمة والوجه الخلفي (إجباري) * :</span>
                            <textarea
                              value={refineBackTextInstruction}
                              onChange={(e) => setRefineBackTextInstruction(e.target.value)}
                              placeholder="مثال: أضف جملة توضيحية كاملة ومثيرة للاهتمام بالعربية، أو اجعل الترجمة باللغة العربية الفصحى المبسطة..."
                              className="w-full min-h-[80px] px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs font-bold outline-none resize-none focus:bg-white focus:border-amber-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 5. German Articles Recommendation */}
                    <div className={`p-4 rounded-xl border transition-all ${refineGermanArticlesMode !== "keep" ? 'bg-white border-amber-300 shadow-3xs' : 'bg-slate-50/50 border-slate-200'}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1 bg-purple-50 text-purple-600 rounded-lg">
                          <Globe className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-extrabold text-xs text-slate-800">توصية أدوات التعريف الألمانية (Article Mode) 🇩🇪</span>
                      </div>
                      
                      <div className="flex bg-slate-200/50 rounded-xl p-0.5 border border-slate-200/60 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRefineGermanArticlesMode("keep")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanArticlesMode === "keep"
                              ? "bg-white text-amber-600 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          عدم التغيير
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefineGermanArticlesMode("on")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanArticlesMode === "on"
                              ? "bg-white text-purple-600 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          تفعيل ON
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefineGermanArticlesMode("off")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanArticlesMode === "off"
                              ? "bg-white text-rose-600 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          تعطيل OFF
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefineGermanArticlesMode("auto")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanArticlesMode === "auto"
                              ? "bg-white text-slate-800 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          تلقائي AUTO
                        </button>
                      </div>

                      <div className="pt-2 mt-2 border-t border-slate-200/40 text-center">
                        <span className="text-[9px] font-semibold text-slate-400">توجيه الذكاء الاصطناعي لتفعيل أو تعطيل أو تحديد الأداة (der/die/das)</span>
                      </div>
                    </div>

                    {/* 6. German Plural Recommendation */}
                    <div className={`p-4 rounded-xl border transition-all ${refineGermanPluralMode !== "keep" ? 'bg-white border-amber-300 shadow-3xs' : 'bg-slate-50/50 border-slate-200'}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1 bg-fuchsia-50 text-fuchsia-600 rounded-lg">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-extrabold text-xs text-slate-800">توصية صيغة الجمع الألمانية (Plural Mode) 🇩🇪</span>
                      </div>
                      
                      <div className="flex bg-slate-200/50 rounded-xl p-0.5 border border-slate-200/60 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRefineGermanPluralMode("keep")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanPluralMode === "keep"
                              ? "bg-white text-amber-600 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          عدم التغيير
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefineGermanPluralMode("on")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanPluralMode === "on"
                              ? "bg-white text-fuchsia-600 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          تفعيل ON
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefineGermanPluralMode("off")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanPluralMode === "off"
                              ? "bg-white text-rose-600 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          تعطيل OFF
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefineGermanPluralMode("auto")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            refineGermanPluralMode === "auto"
                              ? "bg-white text-slate-800 shadow-3xs font-black"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          تلقائي AUTO
                        </button>
                      </div>

                      <div className="pt-2 mt-2 border-t border-slate-200/40 text-center">
                        <span className="text-[9px] font-semibold text-slate-400">توجيه الذكاء الاصطناعي لتفعيل أو تعطيل أو تحديد صيغة الجمع (Tische)</span>
                      </div>

                      {refineGermanPluralMode !== "keep" && (
                        <div className="mt-3.5 space-y-2 animate-fade-in">
                          <span className="text-[10px] font-black text-fuchsia-700 block mb-1">تعليمات أو شروط صيغة الجمع المخصصة (اختياري):</span>
                          <textarea
                            value={refineGermanPluralInstruction}
                            onChange={(e) => setRefineGermanPluralInstruction(e.target.value)}
                            placeholder="مثال: أضف أداة الجمع مع الكلمة، أو ضع صيغة الجمع في جملة كاملة ومفيدة..."
                            className="w-full min-h-[65px] px-3 py-2 bg-slate-50 border border-slate-250 rounded-xl text-xs font-bold outline-none resize-none focus:bg-white focus:border-fuchsia-400"
                          />
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="flex justify-end gap-3 pt-2 border-t border-amber-150">
                    <button
                      type="button"
                      onClick={() => setShowRefinePanel(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 text-xs font-extrabold transition-all cursor-pointer"
                    >
                      إلغاء ❌
                    </button>
                    <button
                      type="button"
                      onClick={handleRefineCards}
                      disabled={loading}
                      className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>تحديث وتعديل جميع البطاقات بالذكاء الاصطناعي ⚡</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Saved Prompt Info Box representing the source prompt with Reuse capability */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-3xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-slate-700">
                    <FileText className="w-4 h-4 text-[#0056f6]" />
                    <h5 className="text-xs font-black text-slate-800">برومبت التوليد والتعليمات المستخدمة لهذا المجلد:</h5>
                  </div>
                  <button
                    onClick={() => {
                      setPrompt(activeAiFolder.prompt);
                      setFrontInstructions(activeAiFolder.frontInstructions || "");
                      setBackInstructions(activeAiFolder.backInstructions || "");
                      setDescInstructions(activeAiFolder.descInstructions || "");
                      setImageInstructions(activeAiFolder.imageInstructions || "");
                      setGermanPluralInstruction(activeAiFolder.germanPluralInstruction || "");
                      if (
                        activeAiFolder.frontInstructions ||
                        activeAiFolder.backInstructions ||
                        activeAiFolder.descInstructions ||
                        activeAiFolder.imageInstructions ||
                        activeAiFolder.germanPluralInstruction
                      ) {
                        setShowAdvancedOptions(true);
                      } else {
                        setShowAdvancedOptions(false);
                      }
                      setActiveAiFolderId(""); // Go back to home where the prompt input is
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0056f6]/10 hover:bg-[#0056f6]/20 text-[#0056f6] rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 text-right self-start sm:self-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تعديل وإعادة استخدام البرومبت</span>
                  </button>
                </div>

                <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100 text-xs font-bold text-slate-600 leading-relaxed">
                  {activeAiFolder.prompt}
                </div>

                {(activeAiFolder.frontInstructions || activeAiFolder.backInstructions || activeAiFolder.descInstructions || activeAiFolder.imageInstructions || activeAiFolder.germanPluralInstruction) && (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
                    {activeAiFolder.frontInstructions && (
                      <div className="bg-slate-50/40 border border-slate-100 p-2.5 rounded-xl text-right">
                        <span className="text-[9px] font-bold text-slate-400 block mb-1">تعليمات الوجه الأمامي:</span>
                        <p className="text-[10px] text-slate-600 font-semibold">{activeAiFolder.frontInstructions}</p>
                      </div>
                    )}
                    {activeAiFolder.backInstructions && (
                      <div className="bg-slate-50/40 border border-slate-100 p-2.5 rounded-xl text-right">
                        <span className="text-[9px] font-bold text-slate-400 block mb-1">تعليمات الوجه الخلفي:</span>
                        <p className="text-[10px] text-slate-600 font-semibold">{activeAiFolder.backInstructions}</p>
                      </div>
                    )}
                    {activeAiFolder.descInstructions && (
                      <div className="bg-slate-50/40 border border-slate-100 p-2.5 rounded-xl text-right">
                        <span className="text-[9px] font-bold text-slate-400 block mb-1">تعليمات الوصف والتبسيط:</span>
                        <p className="text-[10px] text-slate-600 font-semibold">{activeAiFolder.descInstructions}</p>
                      </div>
                    )}
                    {activeAiFolder.imageInstructions && (
                      <div className="bg-slate-50/40 border border-slate-100 p-2.5 rounded-xl text-right">
                        <span className="text-[9px] font-bold text-slate-400 block mb-1">شروط ووصف بحث الصور:</span>
                        <p className="text-[10px] text-slate-600 font-semibold">{activeAiFolder.imageInstructions}</p>
                      </div>
                    )}
                    {activeAiFolder.germanPluralInstruction && (
                      <div className="bg-slate-50/40 border border-slate-100 p-2.5 rounded-xl text-right">
                        <span className="text-[9px] font-bold text-[#d946ef] block mb-1">تعليمات صيغة الجمع الألمانية:</span>
                        <p className="text-[10px] text-slate-600 font-semibold">{activeAiFolder.germanPluralInstruction}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Import Configuration Panel (Collapsible Overlay Block) */}
              {showImportDialog && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 space-y-4 animate-fade-in text-right">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-[#0056f6] flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      <span>إعدادات النقل والحفظ النهائي بالمكتبة</span>
                    </h4>
                    <button 
                      onClick={() => setShowImportDialog(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 bg-white/60 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-2">
                      <span className="text-[10px] font-extrabold uppercase text-slate-500">طريقة النقل والحفظ:</span>
                      <div className="flex gap-2 bg-white/50 p-1 rounded-xl">
                        <button
                          onClick={() => setImportTargetMode("new")}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all ${
                            importTargetMode === "new"
                              ? "bg-white border shadow-3xs text-[#0056f6]"
                              : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          إنشاء مجلد جديد بالمكتبة
                        </button>
                        <button
                          onClick={() => setImportTargetMode("existing")}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all ${
                            importTargetMode === "existing"
                              ? "bg-white border shadow-3xs text-[#0056f6]"
                              : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          إضافة لمجلد موجود
                        </button>
                      </div>
                    </div>

                    <div className="flex items-end">
                      {importTargetMode === "new" ? (
                        <div className="w-full space-y-2">
                          <div className="space-y-1">
                            <span className="text-[10px] font-extrabold text-slate-500 block">اسم المجلد الجديد في المكتبة:</span>
                            <input
                              type="text"
                              value={customImportName}
                              onChange={(e) => setCustomImportName(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#0056f6]"
                              placeholder="أدخل اسماً للمجلد..."
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <span className="text-[10px] font-extrabold text-slate-500 block">المجلد الرئيسي (اختياري):</span>
                            <select
                              value={parentFolderIdForNew}
                              onChange={(e) => setParentFolderIdForNew(e.target.value)}
                              className="w-full py-2 px-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                            >
                              <option value="">مجلد رئيسي في الجذور</option>
                              {folders.map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full space-y-1">
                          <span className="text-[10px] font-extrabold text-slate-500 block">اختر المجلد المستهدف من مكتبتك:</span>
                          <select
                            value={selectedExistingFolderId}
                            onChange={(e) => setSelectedExistingFolderId(e.target.value)}
                            className="w-full py-2 px-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                          >
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-blue-100 pt-4 flex justify-end">
                    <button
                      onClick={handleImport}
                      className="px-6 py-2.5 rounded-xl bg-[#0056f6] hover:bg-[#0047cc] text-white font-black text-xs shadow-md transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4 text-white" />
                      <span>تأكيد الاستيراد ونقل البطاقات المحددة ({selectedCardIds.length}) ⚡</span>
                    </button>
                  </div>
                </div>
              )}

              {reviewMode && folderCards.length > 0 ? (
                /* Interactive Review Mode */
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-6 animate-fade-in text-right">
                  {/* Header / Info bar */}
                  <div className="flex items-center justify-between border-b border-slate-200/50 pb-4">
                    <div className="flex items-center gap-2 text-violet-700">
                      <Layers className="w-5 h-5 text-violet-600 animate-pulse" />
                      <h4 className="font-extrabold text-sm text-slate-800">مراجعة وتصفية البطاقات تفاعلياً</h4>
                    </div>
                    <span className="text-xs bg-white border border-slate-200 text-slate-700 px-3 py-1 rounded-full font-black shadow-3xs">
                      البطاقة {currentReviewIndex + 1} من {folderCards.length}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-300"
                      style={{ 
                        width: `${((currentReviewIndex + 1) / folderCards.length) * 100}%`,
                        backgroundColor: activeAiFolder.color || '#0056f6'
                      }}
                    />
                  </div>

                  {/* The Flashcard itself */}
                  {(() => {
                    const card = folderCards[currentReviewIndex];
                    if (!card) return null;
                    return (
                      <div className="space-y-6">
                        {/* Stable Deck Container with static size and overflow-hidden */}
                        <div className="relative w-full max-w-[356px] h-[466px] mx-auto select-none mb-4 overflow-hidden rounded-[24px]">
                          <AnimatePresence initial={false} custom={reviewDirection} mode="popLayout">
                            <motion.div
                              key={card.id}
                              custom={reviewDirection}
                              variants={{
                                enter: (dir: number) => ({
                                  x: dir > 0 ? -300 : 300,
                                  rotate: dir > 0 ? -8 : 8,
                                  opacity: 0,
                                  scale: 0.95,
                                }),
                                center: {
                                  x: 0,
                                  rotate: 0,
                                  opacity: 1,
                                  scale: 1,
                                  zIndex: 10,
                                  transition: {
                                    duration: 0.24,
                                    ease: [0.16, 1, 0.3, 1],
                                  }
                                },
                                exit: (dir: number) => ({
                                  x: dir > 0 ? 300 : -300,
                                  rotate: dir > 0 ? 8 : -8,
                                  opacity: 0,
                                  scale: 0.95,
                                  zIndex: 0,
                                  transition: {
                                    duration: 0.2,
                                    ease: [0.16, 1, 0.3, 1],
                                  }
                                })
                              }}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              className="absolute inset-2"
                            >
                              <BrowseCard
                                card={card}
                                globalFlipped={reviewFlipped}
                                onFlipToggle={() => setReviewFlipped(!reviewFlipped)}
                                hideFront={false}
                                hideBack={false}
                                frontLang={activeAiFolder?.frontLang || "en"}
                                backLang={activeAiFolder?.backLang || "ar"}
                                onDiscard={() => {
                                  handleReviewDelete(card.id);
                                }}
                                onKeep={() => {
                                  if (!selectedCardIds.includes(card.id)) {
                                    setSelectedCardIds([...selectedCardIds, card.id]);
                                  }
                                  if (currentReviewIndex < folderCards.length - 1) {
                                    handleReviewNext();
                                  } else {
                                    alert("لقد وصلت إلى نهاية المراجعة بنجاح! تم حفظ البطاقة في الوجبة المؤقتة.");
                                    setReviewMode(false);
                                  }
                                }}
                                onEdit={() => {
                                  setEditingCard(card);
                                }}
                              />
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        {/* Interactive Navigation and Action Controls */}
                        <div className="space-y-4">
                          {/* Pagination Bar styled EXACTLY like ReviewSession manual paginations */}
                          <div className="flex justify-between w-full max-w-[356px] mx-auto items-center px-1 mt-1">
                            <button
                              onClick={handleReviewPrev}
                              disabled={currentReviewIndex === 0}
                              className="px-5 py-2.5 bg-[#f1f5f9] border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer hover:bg-slate-200 transition-colors"
                            >
                              <ArrowRight className="w-4 h-4" /> البطاقة السابقة
                            </button>
                            
                            <span className="text-[11px] font-bold text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/10 shadow-3xs">
                              {currentReviewIndex + 1} من {folderCards.length}
                            </span>
                            
                            <button
                              onClick={handleReviewNext}
                              disabled={currentReviewIndex === folderCards.length - 1}
                              className="px-5 py-2.5 bg-primary text-white rounded-2xl text-[11px] font-bold shadow-sm flex items-center gap-1 cursor-pointer hover:opacity-95 disabled:opacity-40"
                            >
                              البطاقة التالية <ArrowLeft className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Tips */}
                        <p className="text-center text-[10px] text-slate-400 font-bold max-w-xs mx-auto leading-relaxed">
                          💡 البطاقات التي تختار "احتفاظ" لها ستبقى في وجبتك المؤقتة وسيتم تحديدها تلقائياً لتثبيتها في مكتبتك العامة لاحقاً.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Cards Listing Section (Header & Actions) */
                <div className="space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-[#0056f6]" />
                      <span className="text-xs font-black text-slate-700">البطاقات الدراسية المؤقتة ({folderCards.length} بطاقة):</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedCardIds.length > 0 ? (
                        <button
                          onClick={handleDeleteSelectedCards}
                          className="text-[11px] font-black text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف المحدد ({selectedCardIds.length})</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleDeleteAllFolderCards}
                          className="text-[11px] font-black text-slate-400 hover:text-rose-600 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف جميع البطاقات</span>
                        </button>
                      )}
                      
                      <div className="w-[1px] h-3 bg-slate-200" />

                      <button
                        onClick={handleFetchImagesForFolderCards}
                        disabled={loading || folderCards.length === 0}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                        title="جلب وتنزيل الصور التلقائية لجميع بطاقات المجلد"
                      >
                        <DownloadCloud className="w-3.5 h-3.5 text-emerald-600" />
                        <span>جلب وتنزيل الصور ({folderCards.length})</span>
                      </button>

                      <div className="w-[1px] h-3 bg-slate-200" />

                      <button
                        onClick={handleSelectAll}
                        className="text-[11px] font-black text-[#0056f6] hover:underline cursor-pointer"
                      >
                        {selectedCardIds.length === folderCards.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                      </button>
                    </div>
                  </div>

                  {/* Cards Grid List - Styled exactly like Explorer card items */}
                  <div className="flex flex-col gap-3">
                    {folderCards.map((card) => {
                      const isSelected = selectedCardIds.includes(card.id);
                      const cardColor = activeAiFolder.color || '#0056f6';
                      return (
                        <div
                          key={card.id}
                          onClick={() => toggleCardSelection(card.id)}
                          className={`flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-xs transition-all group cursor-pointer ${
                            isSelected
                              ? "border-[#0056f6] bg-blue-50/25 shadow-2xs"
                              : "border-slate-100 hover:bg-slate-50/40"
                          }`}
                        >
                          {/* Right side: Checkbox + Card Stack Icon + Details */}
                          <div className="flex items-center gap-4 text-right">
                            
                            {/* Selection Checkbox */}
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCardSelection(card.id);
                              }}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                                isSelected
                                  ? "bg-[#0056f6] border-[#0056f6] text-white"
                                  : "border-slate-300 hover:border-slate-400 bg-white"
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                            </div>

                            {/* Beautiful Unified Card Icon styled exactly like Explorer.tsx */}
                            <div className="relative w-14 h-14 shrink-0">
                              {/* Back Card 2 (Bottom) */}
                              <div 
                                className="absolute top-1 right-1 w-[44px] h-[44px] rounded-xs border bg-white/80 shadow-3xs"
                                style={{ 
                                  borderColor: `${cardColor}20`,
                                  transform: "rotate(-6deg)" 
                                }}
                              />
                              {/* Back Card 1 (Middle) */}
                              <div 
                                className="absolute top-1 right-1 w-[44px] h-[44px] rounded-xs border bg-white/95 shadow-3xs"
                                style={{ 
                                  borderColor: `${cardColor}25`,
                                  transform: "rotate(4deg)" 
                                }}
                              />
                              {/* Main Front Card */}
                              <div 
                                className="absolute bottom-0.5 left-0.5 w-[46px] h-[46px] rounded-sm overflow-hidden border shadow-2xs flex items-center justify-center z-10"
                                style={{
                                  backgroundColor: card.frontImage ? "#ffffff" : `${cardColor}10`,
                                  borderColor: card.frontImage ? "rgba(192, 132, 252, 0.4)" : `${cardColor}30`, // Soft high-contrast purple border
                                  borderWidth: "1.5px"
                                }}
                              >
                                {card.frontImage ? (
                                  <>
                                    <ImageWithSkeleton
                                      src={card.frontImage}
                                      alt=""
                                      className="absolute inset-0 w-full h-full object-cover opacity-95 transition-all"
                                      style={getSafeImageStyle(card.frontImagePosition)}
                                      referrerPolicy="no-referrer"
                                    />
                                    {/* Soft faded black gradient covering the bottom 30% */}
                                    <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/10 via-black/5 to-transparent pointer-events-none z-10" />

                                    {/* Ultra-light, high-contrast Card Indicator Badge */}
                                    <div 
                                      className="absolute left-1 bottom-1 bg-white/95 p-0.5 rounded-xs z-20 border border-slate-100 flex items-center justify-center"
                                      style={{ 
                                        borderColor: "#c084fc30",
                                        boxShadow: "0 2px 5px rgba(0,0,0,0.18), 0 0 3px rgba(255,255,255,0.7)"
                                      }}
                                    >
                                      <RectangleVertical className="w-2.5 h-2.5 text-purple-600 fill-purple-600/10" />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    {/* Lined Index Card design to signify a Flashcard */}
                                    <div className="absolute inset-0 bg-white flex flex-col justify-center gap-1 p-1 px-1.5 overflow-hidden">
                                      <div className="h-0.5 w-[85%] bg-slate-100 rounded-full" />
                                      <div className="h-0.5 w-[70%] bg-slate-100 rounded-full" />
                                      <div className="h-0.5 w-[80%] bg-slate-100 rounded-full" />
                                      <div className="absolute right-2 top-0 bottom-0 w-[1px] bg-rose-200" />
                                    </div>

                                    {/* Small Card Indicator Badge in Solid White with a Vivid Purple Icon */}
                                    <div 
                                      className="absolute left-1 bottom-1 bg-white p-0.5 rounded-xs z-10 border shadow-xs flex items-center justify-center"
                                      style={{ borderColor: "#c084fc30" }}
                                    >
                                      <RectangleVertical className="w-2.5 h-2.5 text-purple-600 fill-purple-600/10" />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Card text and definitions */}
                            <div>
                              <div className="flex items-center gap-1.5">
                                {card.correctArticle && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100 uppercase">
                                    {card.correctArticle}
                                  </span>
                                )}
                                <h4 className="font-bold text-[#202124] text-base group-hover:text-[#0056f6] transition-colors whitespace-pre-wrap" dir="ltr">
                                  {card.frontText}
                                </h4>
                              </div>
                              {cardPluralToggle[card.id] && card.pluralText ? (
                                <p className="text-xs text-fuchsia-600 font-bold mt-1 whitespace-pre-wrap" dir="ltr">
                                  صيغة الجمع: {card.pluralText}
                                </p>
                              ) : (
                                <p className="text-xs text-[#5f6368] font-medium mt-1 whitespace-pre-wrap">
                                  {card.backText} {card.translationHint ? `• (${card.translationHint})` : ""}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Left Side: Pronounce, Edit and Delete Actions */}
                          <div className="flex items-center gap-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                            {card.isPluralMode && card.pluralText && (
                              <button
                                onClick={() => {
                                  const nextShowPlural = !cardPluralToggle[card.id];
                                  setCardPluralToggle(prev => ({
                                    ...prev,
                                    [card.id]: nextShowPlural
                                  }));
                                  if (nextShowPlural) {
                                    speakClient(card.pluralText || "", card.pluralLang || "de");
                                  } else {
                                    speakClient(card.frontText, activeAiFolder.frontLang);
                                  }
                                }}
                                className={`p-2 rounded-xl transition-all cursor-pointer border border-transparent ${
                                  cardPluralToggle[card.id]
                                    ? "text-fuchsia-600 bg-fuchsia-50 hover:bg-fuchsia-100"
                                    : "text-slate-400 hover:text-fuchsia-600 hover:bg-fuchsia-50/50"
                                }`}
                                title={cardPluralToggle[card.id] ? "عرض الترجمة الأصلية" : "عرض واستماع صيغة الجمع (+)"}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFetchImageForSingleCard(card.id);
                              }}
                              disabled={loading}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer border border-transparent disabled:opacity-40"
                              title="جلب وتنزيل صورة جديدة لهذه البطاقة"
                            >
                              <Image className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => speakClient(cardPluralToggle[card.id] && card.pluralText ? card.pluralText : card.frontText, activeAiFolder.frontLang)}
                              className="p-2 text-slate-400 hover:text-[#0056f6] hover:bg-slate-100/60 rounded-xl transition-all cursor-pointer border border-transparent"
                              title="استمع للنطق"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            
                            <button
                              onClick={() => setEditingCard(card)}
                              className="p-2 text-slate-400 hover:text-[#0056f6] hover:bg-slate-100/60 rounded-xl transition-all cursor-pointer border border-transparent"
                              title="تعديل البطاقة"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteAiCard(card.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer border border-transparent"
                              title="حذف من الوجبة المؤقتة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )
        )}
               {/* =========================================================================
           AI Telemetry & Quotas Hub (مراقب حصص المساعدين الأذكياء) - تصميم مبسط وأنيق
           ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-6 text-right" dir="rtl">
          {/* Main Hub Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-3xs shrink-0">
                <Cpu className="w-4.5 h-4.5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-black text-xs text-slate-800">مراقب حصص المساعدين</h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="السيرفر متصل" />
              <button
                onClick={() => fetchServerQuotas(true)}
                disabled={quotaLoading}
                className="flex items-center gap-1 py-1 px-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
                title="تحديث الحصص"
              >
                {quotaLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                <span>تحديث</span>
              </button>
            </div>
          </div>

          {/* Compact Session Stats row */}
          <div className="bg-slate-50/60 rounded-xl p-3 border border-slate-100/50 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">الطلبات بالجلسة:</span>
              <span className="font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-100">{totalRequests}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">التوكنات المستهلكة:</span>
              <span className="font-mono text-indigo-600 bg-white px-2 py-0.5 rounded border border-slate-100">{accumulatedTotalTokens.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-400">
              <span>(المدخلات: {accumulatedPromptTokens.toLocaleString()} • المخرجات: {accumulatedCompletionTokens.toLocaleString()})</span>
            </div>
          </div>

          {/* Historical 24-Hour Sliding Window Log Stats */}
          {serverQuotas?.usageStats && (
            <div className="bg-[#0056f6]/5 rounded-xl p-4 border border-[#0056f6]/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#0056f6]" />
                  مراقب الاستهلاك الفعلي للمنصة (Sliding Window 24h)
                </span>
                <span className="text-[10px] text-slate-500 font-bold">المعدل اليومي الأقصى: 100,000 توكن</span>
              </div>

              {/* Progress Bar of actual 24h sliding usage */}
              {(() => {
                const total24h = serverQuotas.usageStats.totalTokens24h || 0;
                const limit24h = 100000;
                const percent = Math.min(100, Math.round((total24h / limit24h) * 100));
                
                return (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-500">الاستهلاك الإجمالي الفعلي (آخر 24 ساعة):</span>
                      <span className={`font-mono ${percent > 80 ? "text-rose-600 font-black animate-pulse" : "text-slate-800"}`}>
                        {total24h.toLocaleString()} / {limit24h.toLocaleString()} توكن ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          percent > 90 ? "bg-rose-600" : percent > 60 ? "bg-amber-500" : "bg-[#0056f6]"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Collapsible details of previous requests log */}
              <details className="group pt-1 border-t border-[#0056f6]/10">
                <summary className="flex items-center justify-between text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer select-none">
                  <span>سجل المعاملات والطلبات المفصل (آخر 24 ساعة)</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 group-open:rotate-180" />
                </summary>

                <div className="mt-2.5 space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {serverQuotas.usageStats.logs && serverQuotas.usageStats.logs.length > 0 ? (
                    serverQuotas.usageStats.logs.map((log: any, idx: number) => {
                      const isFailed = log.status === "failed";
                      const dateStr = new Date(log.timestamp).toLocaleTimeString("ar-EG", { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100 text-[10px] font-bold">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isFailed ? "bg-rose-500" : "bg-emerald-500"}`} />
                            <span className="text-slate-700 font-extrabold max-w-[200px] truncate" title={log.prompt}>
                              {log.prompt || "تعديل بطاقات"}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-slate-400 font-semibold">{dateStr}</span>
                            {!isFailed ? (
                              <span className="text-[#0056f6] font-black">{log.tokens.toLocaleString()} توكن</span>
                            ) : (
                              <span className="text-rose-500 font-extrabold">مرفوض (حد)</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[10px] text-slate-400 text-center py-2">لا توجد طلبات مسجلة في الـ 24 ساعة الماضية.</p>
                  )}
                </div>
              </details>
            </div>
          )}

          {/* Two Assistant Cards - Styled identically to the Review settings structure */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* 1. Google Gemini */}
            <div className="bg-white border border-slate-100 rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <span className="font-black text-xs text-slate-800">مساعد Google Gemini</span>
                </div>
                <span className="text-[9px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded">نشط</span>
              </div>

              <div className="space-y-2.5 pt-1.5 border-t border-slate-50">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-400">حصة الطلبات اليومية (RPD):</span>
                  <span className="font-mono text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100/60">1,500 طلب</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-400">حصة الطلبات بالدقيقة (RPM):</span>
                  <span className="font-mono text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100/60">15 طلب</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-400">حصة التوكنات بالدقيقة (TPM):</span>
                  <span className="font-mono text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100/60">1,000,000</span>
                </div>
              </div>

              <p className="text-[9px] text-slate-400 font-semibold leading-relaxed pt-1 border-t border-slate-50">
                * يتم مراقبة حصة Gemini تلقائياً عبر السحابة.
              </p>
            </div>

            {/* 2. Groq Cloud */}
            <div className="bg-white border border-slate-100 rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-orange-500" />
                  <span className="font-black text-xs text-slate-800">مساعد Groq Cloud</span>
                </div>
                <span className="text-[9px] bg-orange-50 text-orange-700 font-bold px-2 py-0.5 rounded">نشط</span>
              </div>

              <div className="space-y-3 pt-1.5 border-t border-slate-50">
                {serverQuotas && serverQuotas.groq && serverQuotas.groq.rateLimits && serverQuotas.groq.rateLimits.limitRequests ? (() => {
                  const reqLimit = parseInt(serverQuotas.groq.rateLimits.limitRequests) || 1;
                  const reqRemain = parseInt(serverQuotas.groq.rateLimits.remainingRequests) || 0;
                  const reqPercent = Math.min(100, Math.max(0, Math.round((reqRemain / reqLimit) * 100)));

                  const tokLimit = parseInt(serverQuotas.groq.rateLimits.limitTokens) || 1;
                  const tokRemain = parseInt(serverQuotas.groq.rateLimits.remainingTokens) || 0;
                  const tokPercent = Math.min(100, Math.max(0, Math.round((tokRemain / tokLimit) * 100)));

                  const getBarColorClass = (pct: number) => {
                    if (pct > 50) return "bg-emerald-500";
                    if (pct > 20) return "bg-amber-500";
                    return "bg-rose-500";
                  };

                  const getTextColorClass = (pct: number) => {
                    if (pct > 50) return "text-emerald-600";
                    if (pct > 20) return "text-amber-600";
                    return "text-rose-600 font-black";
                  };

                  return (
                    <div className="space-y-3">
                      {/* Remaining Requests bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-slate-400">الطلبات المتبقية:</span>
                          <span className={`font-mono ${getTextColorClass(reqPercent)}`}>
                            {serverQuotas.groq.rateLimits.remainingRequests} / {serverQuotas.groq.rateLimits.limitRequests} ({reqPercent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-50 border border-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${getBarColorClass(reqPercent)}`}
                            style={{ width: `${reqPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Remaining Tokens bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-slate-400">التوكنات المتبقية:</span>
                          <span className={`font-mono ${getTextColorClass(tokPercent)}`}>
                            {parseInt(serverQuotas.groq.rateLimits.remainingTokens).toLocaleString()} / {parseInt(serverQuotas.groq.rateLimits.limitTokens).toLocaleString()} ({tokPercent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-50 border border-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${getBarColorClass(tokPercent)}`}
                            style={{ width: `${tokPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Compact Reset Timers */}
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1.5 border-t border-slate-50">
                        {serverQuotas.groq.rateLimits.resetRequests && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-300" />
                            تجديد الطلبات: <strong className="font-semibold text-slate-700">{formatArabicResetTime(serverQuotas.groq.rateLimits.resetRequests)}</strong>
                          </span>
                        )}
                        {serverQuotas.groq.rateLimits.resetTokens && (
                          <span className="flex items-center gap-1">
                            <Coins className="w-3 h-3 text-slate-300" />
                            تجديد التوكنات: <strong className="font-semibold text-slate-700">{formatArabicResetTime(serverQuotas.groq.rateLimits.resetTokens)}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="text-[11px] text-slate-400 text-center py-5 space-y-2">
                    <p className="font-bold text-slate-500">لا تتوفر قراءات حية لـ Groq حتى الآن.</p>
                    <button
                      onClick={() => fetchServerQuotas(true)}
                      className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-600 hover:bg-slate-100 font-bold cursor-pointer"
                    >
                      فحص الاتصال الفوري ⚡
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Simple, clean Raw headers link */}
          {serverQuotas && ((serverQuotas.groq && serverQuotas.groq.rawHeaders) || (serverQuotas.gemini && serverQuotas.gemini.rawHeaders)) && (
            <details className="group">
              <summary className="flex items-center justify-between pt-1 text-right font-bold text-[10px] text-slate-400 hover:text-slate-500 cursor-pointer select-none">
                <div className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-slate-300" />
                  <span>عرض البيانات الفنية الخام (Raw API Headers)</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-300 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              
              <div className="p-3 bg-slate-900 text-slate-300 rounded-xl font-mono text-[9px] text-left mt-2 overflow-auto max-h-[140px] space-y-2 border border-slate-800" dir="ltr">
                {serverQuotas.groq && serverQuotas.groq.rawHeaders && (
                  <div>
                    <div className="text-orange-400 font-bold border-b border-slate-800 pb-0.5 mb-1">--- Groq Cloud Headers ---</div>
                    {Object.entries(serverQuotas.groq.rawHeaders).map(([key, val]) => (
                      <div key={key} className="flex justify-between gap-4 border-b border-slate-800/40 pb-0.5">
                        <span className="text-slate-400 shrink-0">{key}:</span>
                        <span className="text-emerald-400 font-bold break-all text-right">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {serverQuotas.gemini && serverQuotas.gemini.rawHeaders && Object.keys(serverQuotas.gemini.rawHeaders).length > 0 && (
                  <div className="mt-3">
                    <div className="text-blue-400 font-bold border-b border-slate-800 pb-0.5 mb-1">--- Google Gemini Headers ---</div>
                    {Object.entries(serverQuotas.gemini.rawHeaders).map(([key, val]) => (
                      <div key={key} className="flex justify-between gap-4 border-b border-slate-800/40 pb-0.5">
                        <span className="text-slate-400 shrink-0">{key}:</span>
                        <span className="text-emerald-400 font-bold break-all text-right">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>

      </div>

      {/* =========================================================================
         INLINE DIALOG: Edit temporary card details using the standard EditCardModal
         ========================================================================= */}
      {editingCard && activeAiFolder && (
        <EditCardModal
          isOpen={!!editingCard}
          onClose={() => setEditingCard(null)}
          card={adaptAICardToFlashcard(editingCard)}
          folders={activeAiFolder ? [{
            id: activeAiFolder.id,
            name: activeAiFolder.name,
            description: activeAiFolder.description || "",
            color: activeAiFolder.color || "#0056f6",
            frontLang: activeAiFolder.frontLang || "de",
            backLang: activeAiFolder.backLang || "ar",
            createdAt: activeAiFolder.createdAt,
            updatedAt: activeAiFolder.createdAt
          }] : []}
          onSave={handleSaveEditCard}
          onOpenImageSearch={handleOpenImageSearch}
          onDelete={handleDeleteAiCard}
        />
      )}

      {isImageSearchOpen && (
        <ImagePickerModal
          isOpen={isImageSearchOpen}
          onClose={() => setIsImageSearchOpen(false)}
          onSelect={(url) => {
            if (imageSearchCallback) {
              imageSearchCallback(url);
            }
            setIsImageSearchOpen(false);
          }}
          initialQuery={imageSearchInitialQuery}
        />
      )}

      {/* Custom IFrame-safe Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center animate-scale-up">
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 animate-pulse">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-800">تأكيد عملية الحذف</h4>
            </div>
            
            <p className="text-xs text-slate-500 font-bold leading-relaxed">
              {deleteConfirm.message}
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={executeConfirmedDelete}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                نعم، احذف
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-700 font-black text-xs rounded-xl border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom External Mode Modal (نسخ البرومبت وإدخال البيانات المجلوبة) */}
      {showExternalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-right animate-scale-up max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">التوليد والاستيراد الخارجي (External Mode)</h3>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                    انسخ الطلب المنظم لأي ذكاء اصطناعي خارجي (ChatGPT, Claude, Gemini Web) ثم ألصق النتيجة لاستيرادها فوراً
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExternalModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-slate-100/80 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setExternalTab("prompt")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  externalTab === "prompt"
                    ? "bg-white text-indigo-600 shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>1. نسخ البرومبت المصمم</span>
              </button>
              <button
                type="button"
                onClick={() => setExternalTab("import")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  externalTab === "import"
                    ? "bg-white text-indigo-600 shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>2. إدخال البيانات المجلوبة (JSON)</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {externalTab === "prompt" ? (
                <div className="space-y-3">
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-indigo-900 font-semibold space-y-1">
                    <p className="font-bold">💡 كيف تستخدم هذا الخيار؟</p>
                    <p className="text-[11px] text-indigo-800/80 leading-relaxed">
                      1. اضغط على زر "نسخ البرومبت" بالأسفل.<br />
                      2. ألصق النص في ChatGPT أو Gemini أو Claude أو أي نموذج أخر.<br />
                      3. انسخ رد النموذج كـ JSON ثم انتقل لتبويب "2. إدخال البيانات المجلوبة" لتأكيد الاستيراد.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">البرومبت المولد تلقائياً مع كافة القواعد:</label>
                      {externalCopySuccess && (
                        <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 animate-pulse">
                          تم نسخ النص بنجاح! ✅
                        </span>
                      )}
                    </div>
                    <textarea
                      readOnly
                      value={constructFullExternalPrompt(prompt)}
                      className="w-full h-56 p-3.5 bg-slate-900 text-slate-200 font-mono text-xs rounded-xl border border-slate-800 focus:outline-none resize-none leading-relaxed"
                      dir="rtl"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-xl text-xs text-amber-900 font-semibold">
                    <p className="font-bold">📥 أدخل أو ألصق النتيجة الملصقة (JSON):</p>
                    <p className="text-[11px] text-amber-800/80 mt-0.5 leading-relaxed">
                      يدعم التطبيق كود JSON المباشر أو الملتف داخل كتل الماركداون (```json ... ```). سيتم استخراج المجلد والبطاقات تلقائياً.
                    </p>
                  </div>

                  {externalError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{externalError}</span>
                    </div>
                  )}

                  {externalImporting && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold rounded-xl flex items-center gap-2.5 animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-600" />
                      <span>{externalImportProgress || "جاري جلب الصور وتوليد البطاقات..."}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">كود JSON المجلوب:</label>
                    <textarea
                      value={externalJsonInput}
                      disabled={externalImporting}
                      onChange={(e) => {
                        setExternalJsonInput(e.target.value);
                        if (externalError) setExternalError(null);
                      }}
                      placeholder={`ألصق النتيجة هنا... مثال:\n{\n  "folder": { "name": "مفردات السفر", "color": "#0056f6" },\n  "cards": [\n    { "frontText": "Bonjour", "backText": "مرحباً" }\n  ]\n}`}
                      className="w-full h-52 p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all resize-none disabled:opacity-60"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                disabled={externalImporting}
                onClick={() => setShowExternalModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer disabled:opacity-40"
              >
                إغلاق
              </button>

              {externalTab === "prompt" ? (
                <button
                  type="button"
                  onClick={handleCopyExternalPrompt}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  <span>نسخ البرومبت وانتقال للاستيراد</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleImportExternalJson}
                  disabled={!externalJsonInput.trim() || externalImporting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {externalImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الاستيراد وجلب الصور...</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      <span>استيراد وتوليد البطاقات الآن</span>
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Image Fetching & Storage Options Modal (Matching Library / Explorer.tsx) */}
      {showImageOptionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-100 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-right relative overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Top Close Button */}
            <button
              onClick={() => {
                if (!isFetchingImages) setShowImageOptionsModal(false);
              }}
              disabled={isFetchingImages}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-all cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Title */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 bg-emerald-600">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 leading-tight">
                  تنزيل وتخزين الصور مسبقاً
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  تخزين الصور التوضيحية للأغلفة والبطاقات في الذاكرة لتصفحها بدون إنترنت
                </p>
              </div>
            </div>

            {/* Target Scope & Auto Images Options */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/80 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-500">نطاق التنزيل:</span>
                <span className="font-black text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-3xs">
                  {activeAiFolder ? activeAiFolder.name : "المساعد الذكي كامل"}
                </span>
              </div>

              {/* Checkbox for 10 Auto Images Option */}
              <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-emerald-100 cursor-pointer hover:bg-emerald-50/40 transition-all select-none">
                <input
                  type="checkbox"
                  checked={includeAuto10Images}
                  onChange={(e) => setIncludeAuto10Images(e.target.checked)}
                  disabled={isFetchingImages}
                  className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="space-y-0.5 text-right">
                  <span className="text-xs font-black text-slate-800 block">
                    تنزيل وتخزين الـ 10 صور التلقائية لكل بطاقة (اختياري) 🖼️
                  </span>
                  <p className="text-[10px] font-semibold text-slate-500 leading-normal">
                    يجلب أول 10 صور نتائج مقترحة من محرك البحث تلقائياً بعد الصورة الأساسية لكل بطاقة، لتصبح جميع خيارات الصور متاحة أوفلاين.
                  </p>
                </div>
              </label>

              {(() => {
                const targetCards = activeAiFolder ? folderCards : aiCards;
                let primaryImages = 0;
                if (activeAiFolder?.coverImage) primaryImages++;

                targetCards.forEach((c) => {
                  if (c.frontImage?.trim()) primaryImages++;
                  if (c.backImage?.trim()) primaryImages++;
                });

                const autoImagesEst = includeAuto10Images ? targetCards.length * 10 : 0;
                const totalCombinedEst = primaryImages + autoImagesEst;

                return (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/50">
                    <span className="font-bold text-slate-500">إجمالي الصور المتوقع تخزينها:</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className="font-extrabold text-[#0056f6] bg-blue-50 px-2 py-0.5 rounded-md">
                        {primaryImages} أساسية
                      </span>
                      {includeAuto10Images && (
                        <span className="font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                          +{autoImagesEst} تلقائية
                        </span>
                      )}
                      <span className="font-black text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-md">
                        المجموع ~{totalCombinedEst} صورة
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Progress Section */}
            {isFetchingImages && (
              <div className="space-y-2 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    جاري تنزيل وتخزين الصور...
                  </span>
                  <span>{imageFetchProgress.current} من {imageFetchProgress.total}</span>
                </div>

                <div className="w-full bg-slate-200/70 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full transition-all duration-300 rounded-full"
                    style={{ 
                      width: imageFetchProgress.total > 0 
                        ? `${Math.round((imageFetchProgress.current / imageFetchProgress.total) * 100)}%` 
                        : "0%" 
                    }}
                  />
                </div>

                {imageFetchProgress.currentItem && (
                  <div className="flex items-center gap-2 pt-1">
                    {imageFetchProgress.currentPreview && (
                      <img 
                        src={imageFetchProgress.currentPreview} 
                        alt="preview" 
                        className="w-8 h-8 rounded-lg object-cover border border-emerald-200 shrink-0" 
                      />
                    )}
                    <p className="text-[11px] font-semibold text-slate-500 truncate">
                      الآن: <span className="text-slate-800 font-bold">{imageFetchProgress.currentItem}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Success Message */}
            {imageFetchSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-emerald-900">
                    تم تنزيل وتخزين كافة الصور بنجاح! 🖼️
                  </h4>
                  <p className="text-[11px] font-semibold text-emerald-700 leading-relaxed">
                    جميع الصور محفوظة الآن في ذاكرة التخزين المحلية. يمكنك تصفح ومراجعة البطاقات بدون استهلاك الإنترنت!
                  </p>
                </div>
              </div>
            )}

            {/* Main Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleUnifiedImageFetchAndDownload()}
                disabled={isFetchingImages}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetchingImages ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التخزين ({imageFetchProgress.current}/{imageFetchProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-5 h-5" />
                    <span>تنزيل وتخزين كافة الصور فوراً 🖼️</span>
                  </>
                )}
              </button>
            </div>

            {/* Individual Card Images Download Section */}
            {(() => {
              const cardsWithImages = (activeAiFolder ? folderCards : aiCards).filter(c => c.frontImage || c.backImage);
              if (cardsWithImages.length === 0) return null;

              return (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>تنزيل فردي للصور إلى جهازك:</span>
                  </h4>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {cardsWithImages.map((card) => (
                      <div key={card.id} className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-700 truncate max-w-[200px]">
                          {card.frontText || "بطاقة بدون عنوان"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {card.frontImage && (
                            <button
                              type="button"
                              onClick={() => handleDownloadSingleImageFile(card.frontImage!, `${card.frontText || "card"}_front`)}
                              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3 h-3 text-blue-600" />
                              <span>الوجه</span>
                            </button>
                          )}
                          {card.backImage && (
                            <button
                              type="button"
                              onClick={() => handleDownloadSingleImageFile(card.backImage!, `${card.backText || "card"}_back`)}
                              className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3 h-3 text-purple-600" />
                              <span>الظهر</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Collapsible Advanced Storage Settings */}
            <details className="group border-t border-slate-100 pt-3 text-xs">
              <summary className="font-bold text-slate-600 cursor-pointer flex items-center justify-between select-none py-1">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  <span>إعدادات خيارات التخزين المتقدمة</span>
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
              </summary>

              <div className="space-y-3 pt-3">
                {/* Primary Image Storage Mode */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                    <Save className="w-3 h-3 text-emerald-600" />
                    <span>حفظ الصورة الأساسية:</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryImageStorageMode("data_url");
                        localStorage.setItem("settings_primary_image_storage", "data_url");
                      }}
                      className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                        primaryImageStorageMode === "data_url"
                          ? "bg-emerald-50 border-emerald-500 text-emerald-800 font-bold"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      <span className="text-[10px] block">تشفير local (Data URL)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryImageStorageMode("direct_url");
                        localStorage.setItem("settings_primary_image_storage", "direct_url");
                      }}
                      className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                        primaryImageStorageMode === "direct_url"
                          ? "bg-emerald-50 border-emerald-500 text-emerald-800 font-bold"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      <span className="text-[10px] block">رابط مباشر (Direct URL)</span>
                    </button>
                  </div>
                </div>

                {/* Secondary Images Storage Mode */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-purple-600" />
                    <span>حفظ الصور الـ 10 الثانوية:</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSecondaryImagesStorageMode("data_urls");
                        localStorage.setItem("settings_secondary_images_storage", "data_urls");
                      }}
                      className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                        secondaryImagesStorageMode === "data_urls"
                          ? "bg-purple-50 border-purple-500 text-purple-800 font-bold"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      <span className="text-[10px] block">تخزين في الذاكرة 📦</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSecondaryImagesStorageMode("direct_urls");
                        localStorage.setItem("settings_secondary_images_storage", "direct_urls");
                      }}
                      className={`p-2 rounded-xl border text-right transition-all cursor-pointer ${
                        secondaryImagesStorageMode === "direct_urls"
                          ? "bg-purple-50 border-purple-500 text-purple-800 font-bold"
                          : "bg-slate-50 border-slate-200 text-slate-600"
                      }`}
                    >
                      <span className="text-[10px] block">روابط فقط 🌐</span>
                    </button>
                  </div>
                </div>

                {/* Image Search Query Source Selector */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-[11px] font-black text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 text-blue-600" />
                      <span>مصدر الكلمة الممررة للبحث الصوري (Query Source):</span>
                    </span>
                    <span className="text-[10px] text-blue-600 font-bold">تحديد التمرير</span>
                  </label>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setImageSearchQuerySource("smart_auto");
                        localStorage.setItem("settings_image_search_query_source", "smart_auto");
                      }}
                      className={`w-full p-2.5 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                        imageSearchQuerySource === "smart_auto"
                          ? "bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs"
                          : "bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[11px] block font-black text-slate-900">تحديد تلقائي ذكي (مستحسن) ✨</span>
                        <span className="text-[9.5px] block text-slate-500 font-medium">بحث مخصص (imageSearchQuery) ← الوجه (frontText) ← الظهر (backText)</span>
                      </div>
                      {imageSearchQuerySource === "smart_auto" && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setImageSearchQuerySource("front_text_only");
                        localStorage.setItem("settings_image_search_query_source", "front_text_only");
                      }}
                      className={`w-full p-2.5 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                        imageSearchQuerySource === "front_text_only"
                          ? "bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs"
                          : "bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[11px] block font-black text-slate-900">النص الأمامي فقط (وجه البطاقة) 🔤</span>
                        <span className="text-[9.5px] block text-slate-500 font-medium">تمرير الكلمة الرئيسية المكتوبة في وجه البطاقة فقط (frontText)</span>
                      </div>
                      {imageSearchQuerySource === "front_text_only" && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setImageSearchQuerySource("back_text_only");
                        localStorage.setItem("settings_image_search_query_source", "back_text_only");
                      }}
                      className={`w-full p-2.5 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                        imageSearchQuerySource === "back_text_only"
                          ? "bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs"
                          : "bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[11px] block font-black text-slate-900">النص الخلفي فقط (الترجمة / ظهر البطاقة) 🌐</span>
                        <span className="text-[9.5px] block text-slate-500 font-medium">تمرير الترجمة أو المعنى المكتوب خلف البطاقة فقط (backText)</span>
                      </div>
                      {imageSearchQuerySource === "back_text_only" && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setImageSearchQuerySource("combined_front_back");
                        localStorage.setItem("settings_image_search_query_source", "combined_front_back");
                      }}
                      className={`w-full p-2.5 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                        imageSearchQuerySource === "combined_front_back"
                          ? "bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs"
                          : "bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[11px] block font-black text-slate-900">دمج الوجه والظهر معاً 🔗</span>
                        <span className="text-[9.5px] block text-slate-500 font-medium">مثال: تمرير "Der Apfel تفاحة" معاً لنتائج دقيقة</span>
                      </div>
                      {imageSearchQuerySource === "combined_front_back" && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setImageSearchQuerySource("custom_query_only");
                        localStorage.setItem("settings_image_search_query_source", "custom_query_only");
                      }}
                      className={`w-full p-2.5 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                        imageSearchQuerySource === "custom_query_only"
                          ? "bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-2xs"
                          : "bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[11px] block font-black text-slate-900">الكلمة المخصصة فقط (imageSearchQuery) 🎯</span>
                        <span className="text-[9.5px] block text-slate-500 font-medium">تمرير كلمة البحث المخصصة فقط المحددة في بيانات البطاقة</span>
                      </div>
                      {imageSearchQuerySource === "custom_query_only" && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Subtle, beautiful floating success stats badge at bottom */}
      {lastAiUsage && (
        <div className="fixed bottom-4 left-4 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-800 text-slate-300 py-2 px-3.5 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-2 animate-fade-in" dir="rtl">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>استهلاك الطلب الأخير: {lastAiUsage.totalTokens.toLocaleString()} رمزاً</span>
        </div>
      )}

      {/* Floating Smart Image Progress Widget */}
      {isFetchingImages && !showImageOptionsModal && (
        <div 
          onClick={() => setShowImageOptionsModal(true)}
          className="fixed bottom-4 right-4 z-50 bg-white/95 backdrop-blur-md border border-emerald-200/90 shadow-2xl p-3.5 rounded-2xl max-w-xs sm:max-w-sm w-full cursor-pointer hover:border-emerald-400 transition-all group animate-slide-up" 
          dir="rtl"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-2 text-emerald-600 font-black truncate">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-emerald-600" />
              <span>جاري جلب الـ 10 صور وتخزينها...</span>
            </span>
            <span className="text-[11px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-100 font-extrabold shrink-0">
              {imageFetchProgress.current} من {imageFetchProgress.total}
            </span>
          </div>

          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden my-2">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full transition-all duration-300 rounded-full"
              style={{ 
                width: imageFetchProgress.total > 0 
                  ? `${Math.round((imageFetchProgress.current / imageFetchProgress.total) * 100)}%` 
                  : "0%" 
              }}
            />
          </div>

          {imageFetchProgress.currentItem && (
            <div className="flex items-center gap-2 mt-1.5">
              {imageFetchProgress.currentPreview && (
                <img 
                  src={imageFetchProgress.currentPreview} 
                  alt="preview" 
                  className="w-7 h-7 rounded-lg object-cover border border-emerald-200 shrink-0" 
                />
              )}
              <p className="text-[10px] font-medium text-slate-600 truncate flex-1">
                {imageFetchProgress.currentItem}
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
});
