import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Menu, Sparkles, Send, Trash2, Plus, CheckCircle2, AlertCircle, AlertTriangle,
  Copy, Check, Volume2, ArrowLeft, BookOpen, ChevronDown, ChevronUp,
  RotateCcw, RotateCw, Award, Zap, HelpCircle, FileText, CheckCheck, Lightbulb, MessageSquare,
  Sliders, Settings, X, Bot, User, UserCheck, Users, ChevronLeft, ChevronRight, Languages, Globe, Mic, MicOff, Radio,
  Edit3, Search, Image, Link2, Loader2, Maximize2, CheckSquare, Info, Layers, PenTool, RefreshCw
} from "lucide-react";

// Realistic Portrait Photo Fallbacks for Personas
const DEFAULT_AVATAR_PHOTOS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=250&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80",
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=250&q=80",
];

// Reusable Persona Avatar Display Component (Supports Image URLs & Emojis gracefully)
const PersonaAvatarDisplay: React.FC<{
  avatar?: string;
  name?: string;
  sizeClass?: string;
}> = ({ avatar, name, sizeClass = "w-11 h-11 text-2xl" }) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatar]);

  const isImg = avatar && (avatar.startsWith("http://") || avatar.startsWith("https://") || avatar.startsWith("data:image/"));
  if (isImg && !imgError) {
    return (
      <img
        src={avatar}
        alt={name || "Persona Avatar"}
        className={`${sizeClass} rounded-full object-cover border border-indigo-400/60 shadow-2xs shrink-0 bg-slate-800`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black shadow-md shrink-0`}>
      {(!isImg && avatar) ? avatar : "👤"}
    </div>
  );
};
import { CorrectorSession, CorrectorMessage, CorrectorAnalysis, Folder, Flashcard, Persona, PersonaReply, ExercisePersona, ExerciseChecklistItem } from "../types";

interface AICorrectorWorkspaceProps {
  onToggleSidebar?: () => void;
  onBackToLibrary?: () => void;
  onImportCards?: (
    folder: Omit<Folder, "id" | "createdAt" | "updatedAt"> | null,
    cards: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak">[],
    targetFolderId: string | null
  ) => void;
  folders?: Folder[];
}

const safeStr = (val: any): string => {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) return val.map((v) => String(v)).join("، ").trim();
  if (val !== null && val !== undefined) return String(val).trim();
  return "";
};

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: "persona-ellie",
    name: "إيلي (Ellie)",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80",
    job: "بائعة في سوبرماركت",
    age: "24 سنة",
    origin: "برلين، ألمانيا",
    relationship: "",
    toneStyle: "عفوية، ودودة، سريعة في الكلام، أسلوب تعامل زبائن عملي ويومي",
    backgroundTopics: "تعرف كل ركن في السوبرماركت، تساعد المشترين، تحب المنتجات والمخبوزات الطازجة",
    isDefault: true
  },
  {
    id: "persona-peter",
    name: "بيتر (Peter)",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80",
    job: "طالب جامعي وطاهٍ مبتدئ",
    age: "22 سنة",
    origin: "ميونيخ، ألمانيا",
    relationship: "صديق وزميل دراسة",
    toneStyle: "مرح، شاب، يتحدث بعامية راقية وسريعة، يحب المزاح والمحادثات اليومية",
    backgroundTopics: "يستيقظ مبكراً للجامعة، يحب الرياضة وطهي البيتزا، دائم التخطيط لعطلة نهاية الأسبوع",
    isDefault: true
  },
  {
    id: "persona-hans",
    name: "د. هانز (Dr. Hans)",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80",
    job: "طبيب وأستاذ جامعي",
    age: "48 سنة",
    origin: "هامبورغ، ألمانيا",
    relationship: "طبيبك الخاص ومستشارك",
    toneStyle: "مؤدب، مهني، دقيق جداً في مفرداته، يشرح الأمور بحكمة واهتمام",
    backgroundTopics: "مهتم بالصحة والأبحاث العلمية، القراءة، القهوة المختصة، والتنس",
    isDefault: true
  },
  {
    id: "persona-sarah",
    name: "سارة (Sarah)",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80",
    job: "مصممة جرافيك وفنانة",
    age: "28 سنة",
    origin: "فيينا، النمسا",
    relationship: "صديقة مقربة ألمانية",
    toneStyle: "مبدعة، متفائلة، تعبر بمشاعر وتشبيهات بصرية ممتازة",
    backgroundTopics: "الفنون الحديثة، المعارض، التصوير، السفر واستكشاف الكافيهات",
    isDefault: true
  }
];

// Persona Reply Message Card Component with Image Carousel Gallery
const PersonaMessageCard: React.FC<{
  msg: CorrectorMessage;
  personas: any[];
  onSpeak: (text: string, lang?: string) => void;
  onCopy: (text: string, id: string) => void;
  isCopied: boolean;
  onSaveFlashcards?: (msgId: string, analysis: CorrectorAnalysis) => void;
  autoSlideInterval?: number;
  onCreateCard?: (text: string) => Promise<void> | void;
}> = ({ msg, personas, onSpeak, onCopy, isCopied, onSaveFlashcards, autoSlideInterval = 0, onCreateCard }) => {
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [showArabicTranslation, setShowArabicTranslation] = useState(false);
  const [showFullScreenImage, setShowFullScreenImage] = useState<string | null>(null);
  const [originalHeight, setOriginalHeight] = useState<number | null>(null);
  const textContainerRef = useRef<HTMLDivElement | null>(null);

  const reply = msg.personaReply;

  // Auto-slide carousel images timer effect (resets on manual or automatic flip)
  useEffect(() => {
    if (!autoSlideInterval || autoSlideInterval <= 0 || !reply?.imageUrls || reply.imageUrls.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentImgIndex((prev) => (prev < reply.imageUrls!.length - 1 ? prev + 1 : 0));
    }, autoSlideInterval);
    return () => clearInterval(timer);
  }, [autoSlideInterval, reply?.imageUrls, currentImgIndex]);

  useLayoutEffect(() => {
    if (!textContainerRef.current || showArabicTranslation) return;

    const el = textContainerRef.current;
    const updateHeight = () => {
      if (el.offsetHeight > 0) {
        setOriginalHeight(el.offsetHeight);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
    };
  }, [reply?.replyText, showArabicTranslation]);
  if (!reply) return null;

  const matchedPersona = personas?.find(
    (p) =>
      (reply.personaId && p.id === reply.personaId) ||
      (reply.personaName && p.name.trim().toLowerCase() === reply.personaName.trim().toLowerCase())
  );

  const displayAvatar = matchedPersona?.avatar || reply.personaAvatar || "🎭";
  const displayName = matchedPersona?.name || reply.personaName || "الشخصية";
  const displayJob = matchedPersona?.job || reply.personaJob;

  const imageUrls = reply.imageUrls || [];
  const imageQueries = reply.imageQueries || [];

  // Gesture / Swipe Sensitivity logic matching global app setting
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mouseStartX = useRef<number | null>(null);
  const mouseStartY = useRef<number | null>(null);
  const isDragging = useRef<boolean>(false);
  const swipeTriggered = useRef<boolean>(false);
  const gestureDirection = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const lastTapRef = useRef<number>(0);

  // Fullscreen gesture refs
  const fsTouchStartX = useRef<number | null>(null);
  const fsTouchStartY = useRef<number | null>(null);
  const fsMouseStartX = useRef<number | null>(null);
  const fsMouseStartY = useRef<number | null>(null);
  const isFsDragging = useRef<boolean>(false);
  const fsSwipeTriggered = useRef<boolean>(false);
  const fsGestureDirection = useRef<'none' | 'horizontal' | 'vertical'>('none');

  const getSensitivity = () => {
    if (typeof window === "undefined") return 40;
    const saved = localStorage.getItem("settings_swipe_sensitivity");
    return saved ? Number(saved) : 40;
  };

  const handleNextImg = () => {
    if (imageUrls.length <= 1) return;
    setCurrentImgIndex((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0));
  };

  const handlePrevImg = () => {
    if (imageUrls.length <= 1) return;
    setCurrentImgIndex((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1));
  };

  const handleDoubleClickOrTap = () => {
    setShowFullScreenImage(imageUrls[currentImgIndex]);
  };

  // Card Touch gesture handlers (Horizontal swipe to cycle images, double-tap for zoom)
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    swipeTriggered.current = false;
    gestureDirection.current = 'none';
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchStartY.current || swipeTriggered.current) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartX.current;
    const diffY = touch.clientY - touchStartY.current;
    const sensitivity = getSensitivity();

    if (gestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 10 && absX > absY) {
        gestureDirection.current = 'horizontal';
      } else if (absY > 10 && absY > absX) {
        // Allow vertical touch move to pass through natively for chat scrolling
        gestureDirection.current = 'vertical';
      }
      return;
    }

    if (gestureDirection.current === 'horizontal' && imageUrls.length > 1 && Math.abs(diffX) > sensitivity) {
      swipeTriggered.current = true;
      if (diffX > 0) {
        handlePrevImg();
      } else {
        handleNextImg();
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartY.current = null;

    // Fast double tap detection on image for touch screens
    const now = Date.now();
    if (!swipeTriggered.current && gestureDirection.current !== 'horizontal') {
      if (lastTapRef.current && (now - lastTapRef.current) < 320) {
        handleDoubleClickOrTap();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }

    gestureDirection.current = 'none';
  };

  // Card Mouse gesture handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseStartX.current = e.clientX;
    mouseStartY.current = e.clientY;
    isDragging.current = true;
    swipeTriggered.current = false;
    gestureDirection.current = 'none';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !mouseStartX.current || !mouseStartY.current || swipeTriggered.current) return;
    const diffX = e.clientX - mouseStartX.current;
    const diffY = e.clientY - mouseStartY.current;
    const sensitivity = getSensitivity();

    if (gestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 10 && absX > absY) {
        gestureDirection.current = 'horizontal';
      } else if (absY > 10 && absY > absX) {
        gestureDirection.current = 'vertical';
      }
      return;
    }

    if (gestureDirection.current === 'horizontal' && imageUrls.length > 1 && Math.abs(diffX) > sensitivity) {
      swipeTriggered.current = true;
      if (diffX > 0) {
        handlePrevImg();
      } else {
        handleNextImg();
      }
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    mouseStartX.current = null;
    mouseStartY.current = null;
    gestureDirection.current = 'none';
  };

  // Full Screen Touch gesture handlers (Swipe DOWN to exit, Horizontal swipe to cycle images)
  const handleFsTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    fsTouchStartX.current = touch.clientX;
    fsTouchStartY.current = touch.clientY;
    fsSwipeTriggered.current = false;
    fsGestureDirection.current = 'none';
  };

  const handleFsTouchMove = (e: React.TouchEvent) => {
    if (!fsTouchStartX.current || !fsTouchStartY.current || fsSwipeTriggered.current) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - fsTouchStartX.current;
    const diffY = touch.clientY - fsTouchStartY.current;
    const sensitivity = getSensitivity();

    if (fsGestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 8 || absY > 8) {
        fsGestureDirection.current = absX > absY ? 'horizontal' : 'vertical';
      }
      return;
    }

    if (fsGestureDirection.current === 'vertical') {
      // Swiping DOWN exits full screen
      if (diffY > sensitivity * 1.3) {
        fsSwipeTriggered.current = true;
        setShowFullScreenImage(null);
      }
    } else if (fsGestureDirection.current === 'horizontal') {
      if (imageUrls.length > 1 && Math.abs(diffX) > sensitivity) {
        fsSwipeTriggered.current = true;
        if (diffX > 0) {
          handlePrevImg();
        } else {
          handleNextImg();
        }
      }
    }
  };

  const handleFsTouchEnd = () => {
    fsTouchStartX.current = null;
    fsTouchStartY.current = null;
    fsGestureDirection.current = 'none';
  };

  // Full Screen Mouse gesture handlers
  const handleFsMouseDown = (e: React.MouseEvent) => {
    fsMouseStartX.current = e.clientX;
    fsMouseStartY.current = e.clientY;
    isFsDragging.current = true;
    fsSwipeTriggered.current = false;
    fsGestureDirection.current = 'none';
  };

  const handleFsMouseMove = (e: React.MouseEvent) => {
    if (!isFsDragging.current || !fsMouseStartX.current || !fsMouseStartY.current || fsSwipeTriggered.current) return;
    const diffX = e.clientX - fsMouseStartX.current;
    const diffY = e.clientY - fsMouseStartY.current;
    const sensitivity = getSensitivity();

    if (fsGestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 8 || absY > 8) {
        fsGestureDirection.current = absX > absY ? 'horizontal' : 'vertical';
      }
      return;
    }

    if (fsGestureDirection.current === 'vertical') {
      // Swiping DOWN exits full screen
      if (diffY > sensitivity * 1.3) {
        fsSwipeTriggered.current = true;
        setShowFullScreenImage(null);
      }
    } else if (fsGestureDirection.current === 'horizontal') {
      if (imageUrls.length > 1 && Math.abs(diffX) > sensitivity) {
        fsSwipeTriggered.current = true;
        if (diffX > 0) {
          handlePrevImg();
        } else {
          handleNextImg();
        }
      }
    }
  };

  const handleFsMouseUp = () => {
    isFsDragging.current = false;
    fsMouseStartX.current = null;
    fsMouseStartY.current = null;
    fsGestureDirection.current = 'none';
  };

  return (
    <div className="space-y-4">
      {/* Persona Info Header */}
      <div dir="auto" className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <PersonaAvatarDisplay avatar={displayAvatar} name={displayName} sizeClass="w-10 h-10 text-xl" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 text-base">{displayName}</span>
            </div>
            {displayJob && (
              <p className="text-xs font-medium text-slate-500 mt-0.5">{displayJob}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {reply.replyTextArabic && (
            <button
              onClick={() => setShowArabicTranslation(!showArabicTranslation)}
              className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold bg-slate-50 border border-slate-200/60"
              title={showArabicTranslation ? "عرض النص الأصلي باللغة المستهدفة" : "عرض الترجمة والتوضيح بالعربية"}
            >
              <Languages className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">{showArabicTranslation ? "النص الأصلي" : "الترجمة"}</span>
            </button>
          )}

          <button
            onClick={() => onSpeak(reply.replyText, msg.targetLanguage)}
            className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold bg-slate-50 border border-slate-200/60"
            title="استماع لنطق الرد"
          >
            <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">استماع</span>
          </button>

          <button
            onClick={() => onCopy(reply.replyText, msg.id)}
            className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold bg-slate-50 border border-slate-200/60"
            title="نسخ النص"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold hidden sm:inline">تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">نسخ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SENTENCE BUILDER PROMPT CARD */}
      {(reply.isSentenceBuilder || reply.promptSentenceAr) && reply.promptSentenceAr && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 rounded-3xl space-y-3 shadow-xs animate-fade-in text-right" dir="rtl">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-black text-emerald-900 bg-emerald-200/80 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
              <PenTool className="w-3.5 h-3.5 text-emerald-700" />
              تمرين تكوين الجملة المطلوب 🧩
            </span>
            {reply.grammarFocusAr && (
              <span className="text-[11px] font-bold text-teal-800 bg-teal-100/90 px-2.5 py-0.5 rounded-full border border-teal-200">
                🎯 التركيز: {reply.grammarFocusAr}
              </span>
            )}
          </div>

          <div className="text-slate-900 font-extrabold text-base sm:text-lg leading-relaxed bg-white/90 p-3.5 rounded-2xl border border-emerald-200/80 shadow-2xs text-right">
            {reply.promptSentenceAr}
          </div>

          {reply.targetSentenceHint && (
            <div className="text-xs font-bold text-emerald-950 bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-200 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">تلميح مساعد: {reply.targetSentenceHint}</span>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area: Reply Text first on mobile, Image Gallery underneath. Side-by-Side on desktop */}
      <div className={`flex flex-col ${imageUrls.length > 0 ? "md:flex-row md:items-stretch" : ""} gap-3 sm:gap-4`}>
        {/* Reply Text */}
        <div
          ref={textContainerRef}
          dir={showArabicTranslation ? "rtl" : "auto"}
          style={{
            minHeight: originalHeight ? `${originalHeight}px` : undefined,
          }}
          className={`order-1 md:order-2 flex-1 w-full bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 text-slate-950 font-medium text-base sm:text-lg leading-relaxed text-start transition-colors duration-200 ${
            imageUrls.length > 0 ? "md:h-64 lg:h-72 overflow-y-auto custom-scrollbar" : ""
          }`}
        >
          {showArabicTranslation ? (
            <div className="animate-fade-in">
              <FormattedText text={reply.replyTextArabic} onSpeak={(t) => onSpeak(t, msg.targetLanguage)} onCopy={(t) => onCopy(t, msg.id)} onCreateCard={onCreateCard} />
            </div>
          ) : (
            <FormattedText text={reply.replyText} onSpeak={(t) => onSpeak(t, msg.targetLanguage)} onCopy={(t) => onCopy(t, msg.id)} onCreateCard={onCreateCard} />
          )}
        </div>

        {/* Image Gallery Carousel (Compact height on mobile so it doesn't eat screen space) */}
        {imageUrls.length > 0 && (
          <div className="order-2 md:order-1 w-full md:w-64 lg:w-72 shrink-0 flex flex-col justify-center">
            <div 
              className="relative w-full h-64 sm:h-72 md:h-full md:aspect-square rounded-2xl overflow-hidden bg-slate-950 border border-slate-300 shadow-md group select-none touch-pan-y cursor-pointer"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { isDragging.current = false; mouseStartX.current = null; }}
              onDoubleClick={handleDoubleClickOrTap}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img
                  key={currentImgIndex}
                  src={imageUrls[currentImgIndex]}
                  alt={`صورة توضيحية لرد ${reply.personaName}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="w-full h-full object-cover pointer-events-none absolute inset-0"
                />
              </AnimatePresence>

              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-slate-950/20 pointer-events-none" />

              {/* Modern Dot Pagination Bar */}
              {imageUrls.length > 1 && (
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 shadow-lg z-10 transition-all">
                  {imageUrls.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImgIndex(idx);
                      }}
                      className={`transition-all duration-300 rounded-full cursor-pointer focus:outline-none ${
                        idx === currentImgIndex
                          ? "w-5 h-2 bg-white shadow-xs"
                          : "w-2 h-2 bg-white/40 hover:bg-white/80 active:scale-125"
                      }`}
                      title={`عرض الصورة ${idx + 1} من ${imageUrls.length}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>



      {showFullScreenImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in select-none touch-pan-y"
          onClick={() => setShowFullScreenImage(null)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[92vh] overflow-hidden rounded-3xl shadow-2xl border border-white/20 flex flex-col items-center bg-slate-900 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleFsTouchStart}
            onTouchMove={handleFsTouchMove}
            onTouchEnd={handleFsTouchEnd}
            onMouseDown={handleFsMouseDown}
            onMouseMove={handleFsMouseMove}
            onMouseUp={handleFsMouseUp}
            onMouseLeave={() => { isFsDragging.current = false; fsMouseStartX.current = null; }}
          >
            <div className="relative w-full h-[80vh] flex items-center justify-center overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img 
                  key={currentImgIndex}
                  src={imageUrls[currentImgIndex] || showFullScreenImage} 
                  alt="عرض الصورة بالكامل" 
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="max-w-full max-h-[80vh] object-contain pointer-events-none select-none p-2 absolute" 
                />
              </AnimatePresence>
            </div>
            {imageQueries[currentImgIndex] && (
              <div className="w-full bg-slate-950/95 p-3 text-center border-t border-white/10" dir="ltr">
                <span className="font-mono text-xs sm:text-sm text-purple-300 font-bold">
                  🔍 {imageQueries[currentImgIndex]}
                </span>
              </div>
            )}

            {/* Modern Dot Pagination Bar in full screen view */}
            {imageUrls.length > 1 && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 px-3.5 py-2 rounded-full bg-black/75 backdrop-blur-md border border-white/20 shadow-xl z-20">
                {imageUrls.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImgIndex(idx);
                    }}
                    className={`transition-all duration-300 rounded-full cursor-pointer focus:outline-none ${
                      idx === currentImgIndex
                        ? "w-6 h-2.5 bg-white shadow-md ring-2 ring-white/40"
                        : "w-2.5 h-2.5 bg-white/40 hover:bg-white/80 active:scale-125"
                    }`}
                    title={`عرض الصورة ${idx + 1} من ${imageUrls.length}`}
                  />
                ))}
              </div>
            )}

            <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSpeak(showArabicTranslation ? reply.replyTextArabic || reply.replyText : reply.replyText, msg.targetLanguage);
                }}
                className="h-9 px-3 rounded-full bg-slate-950/80 hover:bg-purple-900/90 text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/20 shadow-lg active:scale-95 text-xs font-bold"
                title="استماع لنطق رد الشخصية المتعلق بالصور"
              >
                <Volume2 className="w-4 h-4 text-purple-300 shrink-0" />
                <span>استماع</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFullScreenImage(null)}
                className="w-9 h-9 rounded-full bg-slate-950/80 hover:bg-slate-950 text-white flex items-center justify-center transition-all cursor-pointer border border-white/20 shadow-lg active:scale-90"
                title="إغلاق"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LANGUAGES = [
  { code: "German", label: "الألمانية", flag: "🇩🇪", iso: "de" },
  { code: "English", label: "الإنجليزية", flag: "🇬🇧", iso: "en" },
  { code: "French", label: "الفرنسية", flag: "🇫🇷", iso: "fr" },
  { code: "Spanish", label: "الإسبانية", flag: "🇪🇸", iso: "es" },
  { code: "Italian", label: "الإيطالية", flag: "🇮🇹", iso: "it" },
  { code: "Turkish", label: "التركية", flag: "🇹🇷", iso: "tr" },
  { code: "Arabic", label: "العربية", flag: "🇸🇦", iso: "ar" },
];

const CEFR_LEVELS = [
  { code: "A1.1", label: "مبتدئ جداً" },
  { code: "A1.2", label: "مبتدئ" },
  { code: "A2.1", label: "أساسي 1" },
  { code: "A2.2", label: "أساسي 2" },
  { code: "B1.1", label: "متوسط 1" },
  { code: "B1.2", label: "متوسط 2" },
  { code: "B2.1", label: "فوق المتوسط 1" },
  { code: "B2.2", label: "فوق المتوسط 2" },
  { code: "C1.1", label: "متقدم 1" },
  { code: "C1.2", label: "متقدم 2" },
  { code: "C2", label: "متقن كالمتحدث الأصلي" },
];

const SPECIAL_CHARS: Record<string, string[]> = {
  German: ["Ä", "ä", "Ö", "ö", "Ü", "ü", "ß"],
  French: ["é", "è", "ê", "à", "ç", "ù", "ô"],
  Spanish: ["ñ", "á", "é", "í", "ó", "ú", "¿", "¡"],
  Italian: ["à", "è", "é", "ì", "ò", "ù"],
  Turkish: ["ç", "ğ", "ı", "ö", "ş", "ü", "İ"],
  English: ["Ä", "ä", "Ö", "ö", "Ü", "ü", "ß"],
  Arabic: ["Ä", "ä", "Ö", "ö", "Ü", "ü", "ß"]
};

// Interactive span for single-quoted text ("word") with long-press (mobile) and right-click (desktop) bubble popup
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

  const handleTouchStart = () => {
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setShowTooltip(true);
    }, 400);
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
    setShowTooltip(true);
  };

  const handleCopyAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onCopy) {
      onCopy(quotedText);
    } else {
      navigator.clipboard.writeText(quotedText);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeakAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSpeak) {
      onSpeak(quotedText);
    } else {
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(quotedText);
          window.speechSynthesis.speak(u);
        }
      } catch (err) {
        console.error("Speech synthesis error:", err);
      }
    }
  };

  const handleCreateCardAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onCreateCard || isCreatingCard) return;
    setIsCreatingCard(true);
    try {
      await onCreateCard(quotedText);
      setShowTooltip(false);
    } catch (err) {
      console.error("Card creation error:", err);
    } finally {
      setIsCreatingCard(false);
    }
  };

  return (
    <span className="relative inline">
      <bdi
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        onContextMenu={handleContextMenu}
        onClick={(e) => {
          if (isLongPressRef.current) {
            e.preventDefault();
            e.stopPropagation();
            isLongPressRef.current = false;
            return;
          }
        }}
        className={`font-semibold cursor-pointer transition-colors duration-150 ${
          showTooltip ? "text-red-600 font-bold" : "text-slate-900 hover:text-red-600 active:text-red-600"
        }`}
        title="اضغط مطولاً أو كليك يمين لإظهار خيارات الاستماع والنسخ وبطاقة التعلم"
        dir="auto"
      >
        "{quotedText}"
      </bdi>

      {/* Floating Bubble Tooltip / Popover directly above the quoted text */}
      {showTooltip && (
        <>
          {/* Transparent Backdrop to close on click outside */}
          <div
            className="fixed inset-0 z-50 bg-slate-900/10 backdrop-blur-3xs"
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
            }}
          />

          <div
            dir="rtl"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-slate-900 text-white p-1.5 rounded-2xl shadow-xl border border-slate-700/80 flex items-center gap-1.5 animate-scale-up whitespace-nowrap text-xs font-sans select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Arrow tail pointing down */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />

            {/* Listen / Speak Button */}
            <button
              type="button"
              onClick={handleSpeakAction}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0056f6] hover:bg-blue-600 text-white rounded-xl font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              <Volume2 className="w-3.5 h-3.5 text-blue-100" />
              <span>استماع</span>
            </button>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyAction}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 cursor-pointer border shadow-xs ${
                copied
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700"
              }`}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span>نسخ</span>
            </button>

            {/* Make Flashcard Button */}
            {onCreateCard && (
              <button
                type="button"
                onClick={handleCreateCardAction}
                disabled={isCreatingCard}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-all active:scale-95 cursor-pointer shadow-xs border border-amber-500/80 disabled:opacity-50"
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

// Helper to parse inline bold and quoted text cleanly without box cards
const parseInlineContent = (
  lineText: string,
  onSpeak?: (text: string) => void,
  onCopy?: (text: string) => void,
  onCreateCard?: (text: string) => Promise<void> | void
): React.ReactNode => {
  const regex = /(""(.*?)""|"([^"\n]+)"|«([^»]+)»|„([^“]+)“|“([^”]+)”|`([^`]+)`|\*\*(.*?)\*\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lineText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(lineText.substring(lastIndex, match.index));
    }

    const fullMatch = match[0];
    const innerContent =
      match[2] ??
      match[3] ??
      match[4] ??
      match[5] ??
      match[6] ??
      match[7] ??
      match[8];

    if (fullMatch.startsWith('""') && fullMatch.endsWith('""')) {
      // Excluded: Double double-quotes for tashkeel diacritics - plain text without bubble popup
      parts.push(
        <span key={match.index} className="font-semibold text-slate-900" dir="ltr">
          {innerContent}
        </span>
      );
    } else if (fullMatch.startsWith("**") && fullMatch.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-extrabold text-slate-900">
          {innerContent}
        </strong>
      );
    } else if (fullMatch.startsWith("`") && fullMatch.endsWith("`")) {
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded bg-slate-100 text-slate-900 font-mono text-xs border border-slate-200/80" dir="ltr">
          {innerContent}
        </code>
      );
    } else if (innerContent && innerContent.trim().length > 0) {
      // Single pair quoted text ("word", «word», „word“, “word”) -> Interactive with popup
      parts.push(
        <QuotedTextInteractiveSpan
          key={match.index}
          quotedText={innerContent.trim()}
          onSpeak={onSpeak}
          onCopy={onCopy}
          onCreateCard={onCreateCard}
        />
      );
    } else {
      parts.push(fullMatch);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < lineText.length) {
    parts.push(lineText.substring(lastIndex));
  }

  return parts.length > 0 ? parts : lineText;
};

// FormattedText component to parse double quotes, list items, headers, dividers, and bold text
const FormattedText: React.FC<{
  text: string;
  className?: string;
  onSpeak?: (text: string) => void;
  onCopy?: (text: string) => void;
  onCreateCard?: (text: string) => Promise<void> | void;
}> = ({ text, className = "", onSpeak, onCopy, onCreateCard }) => {
  if (!text) return null;

  // Normalize HTML <br> tags into standard line breaks (\n)
  const cleanedText = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;br\s*\/?&gt;/gi, "\n");

  const lines = cleanedText.split("\n");

  return (
    <div dir="auto" className={`space-y-1.5 text-slate-950 leading-relaxed text-start ${className}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // 1. Horizontal Rule (---, ***, ___)
        if (trimmed === "---" || trimmed === "***" || trimmed === "___" || trimmed === "–--") {
          return <hr key={idx} className="my-2.5 border-t border-slate-200/80" />;
        }

        // 2. Bullet lists (- item, * item, • item)
        const bulletMatch = trimmed.match(/^([-*•])\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={idx} dir="auto" className="flex items-start gap-2 my-1 pr-4 pl-1 text-slate-950 text-start">
              <span className="text-[#0056f6] font-bold shrink-0 mt-0.5">•</span>
              <div className="flex-1">{parseInlineContent(bulletMatch[2], onSpeak, onCopy, onCreateCard)}</div>
            </div>
          );
        }

        // 3. Numbered lists (1. item, 2. item, etc.)
        const numMatch = trimmed.match(/^(\d+[\.\)])\s+(.+)$/);
        if (numMatch) {
          return (
            <div key={idx} dir="auto" className="flex items-start gap-2 my-1 pr-4 pl-1 text-slate-950 text-start">
              <span className="text-[#0056f6] font-extrabold shrink-0 text-xs mt-0.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{numMatch[1]}</span>
              <div className="flex-1">{parseInlineContent(numMatch[2], onSpeak, onCopy, onCreateCard)}</div>
            </div>
          );
        }

        // 4. Heading lines (# title, ## title, ### title)
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          return (
            <div key={idx} dir="auto" className="font-extrabold text-slate-950 mt-2 mb-1 text-base sm:text-lg border-r-3 border-[#0056f6] pr-2.5 text-start">
              {parseInlineContent(headingMatch[2], onSpeak, onCopy, onCreateCard)}
            </div>
          );
        }

        // 5. Empty line (paragraph gap)
        if (trimmed === "") {
          return <div key={idx} className="h-0.5" />;
        }

        // 6. Regular text line
        return (
          <div key={idx} dir="auto" className="min-h-[1.2em] text-start">
            {parseInlineContent(line, onSpeak, onCopy, onCreateCard)}
          </div>
        );
      })}
    </div>
  );
};

// Constant list of all available AI models
const ALL_AVAILABLE_MODELS = [
  { key: "gemini-2.5-flash", name: "Gemini 2.5 Flash ⚡", desc: "أحدث معالجة ذكية ومستقرة (موصى به)", badge: "موصى به" },
  { key: "gemini-2.5-pro", name: "Gemini 2.5 Pro 💎", desc: "تحليل لغوي وبلاغي عميق جداً", badge: "تحليل عميق" },
  { key: "gemini-1.5-flash", name: "Gemini 1.5 Flash ⚡", desc: "نموذج فلاش القياسي السريع", badge: "مستقر" },
  { key: "gemini-1.5-pro", name: "Gemini 1.5 Pro 💎", desc: "سياق واسع وفهم دقيق للجمل", badge: "سياق كبير" },
  { key: "groq-llama-3.3-70b", name: "Groq Llama 3.3 70B 🚀", desc: "محرك جروك الفائق في السرعة والتصحيح", badge: "فائق السرعة" },
  { key: "grok-2", name: "Grok 2 🤖", desc: "أسلوب تفاعلي وحوار طبيعي", badge: "تفاعلي" }
];

// Interactive Exercise Checklist Widget Component
// Helper to resolve speaker avatar and name from exercise personas or user
const resolveSpeakerInfo = (speakerName?: string, personas?: ExercisePersona[]) => {
  if (!speakerName) return null;
  const sName = speakerName.trim();
  const lowerS = sName.toLowerCase();

  // Check if it represents user/learner
  if (["المستخدم", "أنت", "المتعلم", "المتعلّم", "الزبون", "العميل", "المشتري", "user", "learner", "you", "me"].some(k => lowerS.includes(k))) {
    return {
      name: sName,
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=250&q=80",
      isUser: true,
    };
  }

  // Find matching persona in exercisePersonas
  if (personas && personas.length > 0) {
    // 1. Direct name match
    let matched = personas.find(p => {
      const pName = p.name.trim().toLowerCase();
      if (pName === lowerS || pName.includes(lowerS) || lowerS.includes(pName)) return true;
      const baseName = pName.split("(")[0].trim().toLowerCase();
      if (baseName && (baseName.includes(lowerS) || lowerS.includes(baseName))) return true;
      return false;
    });

    // 2. Job / Role match
    if (!matched) {
      matched = personas.find(p => {
        const pJob = (p.job || "").trim().toLowerCase();
        if (pJob && (pJob.includes(lowerS) || lowerS.includes(pJob))) return true;
        return false;
      });
    }

    // 3. Fallback to first exercise persona for non-user steps
    if (!matched && personas.length > 0) {
      matched = personas[0];
    }

    if (matched) {
      let avatar = matched.avatar;
      // If avatar is missing or emoji or "🎭", pick deterministic portrait photo
      if (!avatar || (!avatar.startsWith("http") && !avatar.startsWith("data:"))) {
        const hash = Math.abs(matched.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0));
        avatar = DEFAULT_AVATAR_PHOTOS[hash % DEFAULT_AVATAR_PHOTOS.length];
      }
      return {
        name: matched.name,
        avatar: avatar,
        isUser: false,
      };
    }
  }

  // Fallback if no persona array matched
  const hash = Math.abs(sName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0));
  return {
    name: sName,
    avatar: DEFAULT_AVATAR_PHOTOS[hash % DEFAULT_AVATAR_PHOTOS.length],
    isUser: false,
  };
};

const ExerciseChecklistWidget: React.FC<{
  session: CorrectorSession;
  onToggleStep: (stepId: string) => void;
}> = ({ session, onToggleStep }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const activeStepRef = useRef<HTMLDivElement | null>(null);

  if (!session.exerciseChecklist || session.exerciseChecklist.length === 0) {
    return null;
  }

  const checklist = session.exerciseChecklist;
  const completedCount = checklist.filter((item) => item.isCompleted).length;
  const totalCount = checklist.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const isAllCompleted = session.isExerciseCompleted || completedCount === totalCount;

  // Find first uncompleted step (current active step)
  const activeStepId = checklist.find((item) => !item.isCompleted)?.id;

  // Auto-scroll to current active step location when checklist is shown
  useEffect(() => {
    if (isExpanded && activeStepRef.current) {
      activeStepRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isExpanded, activeStepId]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3 font-sans text-right text-slate-100 my-2 animate-fade-in">
      {/* Clean Minimalist Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-700/50 text-indigo-300 flex items-center justify-center text-sm shrink-0">
            📋
          </div>
          <div>
            <h4 className="font-extrabold text-xs sm:text-sm text-slate-100 flex items-center gap-1.5">
              <span>خطوات التمرين</span>
              <span className="text-[11px] font-bold text-indigo-300/80">({completedCount}/{totalCount})</span>
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-md">
            {progressPercent}%
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            title={isExpanded ? "طي اللائحة" : "توسيع اللائحة"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* All Completed Celebration Banner */}
      {isAllCompleted && (
        <div className="p-2.5 bg-emerald-950/80 border border-emerald-600/40 rounded-xl flex items-center gap-2 text-emerald-200 text-xs font-bold animate-fade-in">
          <Award className="w-4 h-4 text-amber-400 shrink-0" />
          <span>تم إنجاز كافة خطوات التمرين بنجاح 🏆</span>
        </div>
      )}

      {/* Checklist Items list styled clean like persona reply cards */}
      {isExpanded && (
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          {checklist.map((item, idx) => {
            const isDone = item.isCompleted;
            const isActive = item.id === activeStepId;
            const speakerInfo = resolveSpeakerInfo(item.speakerName, session.exercisePersonas);

            return (
              <div
                key={item.id || idx}
                ref={isActive ? activeStepRef : null}
                onClick={() => onToggleStep(item.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 text-xs relative ${
                  isDone
                    ? "bg-slate-950/40 border-slate-800/60 text-slate-400 opacity-80"
                    : isActive
                    ? "bg-slate-800/90 border-blue-500/80 text-white shadow-md border-r-4 border-r-blue-500"
                    : "bg-slate-900/60 border-slate-800/60 text-slate-300 hover:bg-slate-800/50"
                }`}
              >
                {/* Checkbox Icon */}
                <div className="shrink-0 mt-0.5">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : isActive ? (
                    <div className="w-4 h-4 rounded-md border-2 border-blue-400 bg-blue-500/20 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-md border border-slate-700 bg-slate-950/60" />
                  )}
                </div>

                {/* Content formatted like persona replies */}
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Step Number */}
                    <span className={`font-mono text-[11px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                      isDone
                        ? "text-slate-500 line-through"
                        : isActive
                        ? "text-blue-300 font-extrabold"
                        : "text-slate-400"
                    }`}>
                      #{idx + 1}
                    </span>

                    {/* Speaker info styled like persona header */}
                    {speakerInfo && (
                      <div className="inline-flex items-center gap-1.5 shrink-0">
                        <PersonaAvatarDisplay avatar={speakerInfo.avatar} name={speakerInfo.name} sizeClass="w-4 h-4 text-[10px]" />
                        <span className={`font-extrabold text-[11px] ${isDone ? "text-slate-500 line-through" : "text-slate-200"}`}>
                          {speakerInfo.name}
                        </span>
                      </div>
                    )}

                    {/* Single subtle active indicator */}
                    {isActive && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping mr-auto" />
                    )}
                  </div>

                  <p className={`text-xs leading-relaxed ${
                    isDone
                      ? "text-slate-500 line-through font-normal"
                      : isActive
                      ? "text-slate-100 font-bold"
                      : "text-slate-300 font-normal"
                  }`}>
                    {item.objective}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Sticky Header Bar for Pinned Step & Exercise Context Visibility (Sleek, Mobile-First, Persona Style)
const StickyExerciseHeaderBar: React.FC<{
  session: CorrectorSession;
  onToggleStep: (stepId: string) => void;
}> = ({ session, onToggleStep }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullSentenceExpanded, setIsFullSentenceExpanded] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (session.chatType !== "exercise") return null;

  const checklist = session.exerciseChecklist || [];
  const completedCount = checklist.filter((item) => item.isCompleted).length;
  const totalCount = checklist.length;
  const activeStepIdx = checklist.findIndex((item) => !item.isCompleted);
  const activeStep = activeStepIdx >= 0 ? checklist[activeStepIdx] : null;
  const activeStepNum = activeStepIdx >= 0 ? activeStepIdx + 1 : totalCount;
  const isAllDone = totalCount > 0 && completedCount === totalCount;
  const speakerInfo = activeStep ? resolveSpeakerInfo(activeStep.speakerName, session.exercisePersonas) : null;

  const handleCopyText = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCopyAll = () => {
    const parts = [
      `🎯 عنوان التمرين: ${session.exerciseTitle || "تمرين تفاعلي"}`,
      session.exerciseContext ? `📌 سياق التمرين: ${session.exerciseContext}` : "",
      session.exerciseVariables ? `📋 الشروط والمتغيرات: ${session.exerciseVariables}` : "",
      session.userRole ? `👤 دورك: ${session.userRole}` : "",
      session.exercisePersonas && session.exercisePersonas.length > 0
        ? `👥 الشخصيات المشاركة:\n` + session.exercisePersonas.map((p) => `- ${p.name} (${p.job || "شخصية"}): ${p.promptInstructions || ""}`).join("\n")
        : ""
    ].filter(Boolean).join("\n\n");

    navigator.clipboard.writeText(parts);
    setCopiedField("all");
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <>
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-md font-sans text-right animate-fade-in">
        {/* Header Row */}
        <div className="flex items-stretch select-none">
          {/* Step Counter Badge - Integrated seamlessly with full height of header */}
          <button
            type="button"
            onClick={() => {
              setIsExpanded(!isExpanded);
              setIsFullSentenceExpanded(false);
            }}
            className="flex items-center justify-center gap-1 shrink-0 bg-slate-950 hover:bg-slate-800 px-3.5 py-2.5 text-xs font-mono font-bold text-indigo-300 border-l border-slate-800 transition-colors cursor-pointer active:scale-98"
            title="اضغط لفتح قائمة الجمل والخطوات والوصول لموقع الجملة الحالية"
          >
            <span>#{isAllDone ? totalCount : activeStepNum}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{totalCount}</span>
          </button>

          {/* Sentence Text Area - Clicking expands/collapses sentence inline */}
          <div
            onClick={() => {
              setIsFullSentenceExpanded(!isFullSentenceExpanded);
              setIsExpanded(false);
            }}
            className="min-w-0 flex-1 cursor-pointer hover:bg-slate-800/40 px-3.5 py-2.5 transition-colors flex items-center"
            title={isFullSentenceExpanded ? "اضغط لتقليص الجملة" : "اضغط لعرض كامل النص للجملة"}
          >
            {isAllDone ? (
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                🏆 اكتمل التمرين بنجاح
              </span>
            ) : activeStep ? (
              <span className={`text-slate-100 font-semibold text-xs sm:text-sm leading-snug transition-all ${
                isFullSentenceExpanded ? "whitespace-normal break-words" : "truncate block"
              }`}>
                {activeStep.objective}
              </span>
            ) : (
              <p className="text-xs font-medium text-slate-300 truncate">
                {session.exerciseContext || "تمرين تفاعلي"}
              </p>
            )}
          </div>
        </div>

        {/* Dropdown Tray: Sentences & Steps + Info Button (when clicking step count badge) */}
        {isExpanded && (
          <div className="p-3.5 bg-slate-950 border-t border-slate-800 max-h-[70vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
              <span className="text-xs font-black text-slate-200">📋 قائمة جمل وخطوات التمرين</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInfoModal(true);
                }}
                className="px-2.5 py-1 bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Info className="w-3.5 h-3.5 text-indigo-400" />
                <span>تفاصيل السيناريو والشخصيات</span>
              </button>
            </div>
            <ExerciseChecklistWidget session={session} onToggleStep={onToggleStep} />
          </div>
        )}
      </div>

      {/* Panoramic Exercise Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in font-sans text-right" dir="rtl">
          <div className="relative max-w-2xl w-full bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-indigo-950 border border-indigo-700/60 text-indigo-300 flex items-center justify-center text-xl shrink-0">
                  🎭
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                    {session.exerciseTitle || "تفاصيل سيناريو التمرين"}
                  </h3>
                  <p className="text-xs text-indigo-300/80 font-medium">معلومات التمرين والشخصيات الكاملة</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyAll}
                  className="px-3 py-1.5 bg-indigo-900/80 hover:bg-indigo-800 text-indigo-100 border border-indigo-700/60 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
                >
                  {copiedField === "all" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">تم نسخ الكل</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-indigo-300" />
                      <span className="hidden sm:inline">نسخ الكل</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs leading-relaxed">
              {/* Scenario Context Card */}
              {session.exerciseContext && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-indigo-300 text-xs flex items-center gap-1.5">
                      <span>🎯</span>
                      <span>سياق التمرين والجملة الرئيسية:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(session.exerciseContext!, "context")}
                      className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                      title="نسخ السياق"
                    >
                      {copiedField === "context" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === "context" ? "تم النسخ" : "نسخ"}</span>
                    </button>
                  </div>
                  <p className="text-slate-200 font-medium leading-relaxed bg-slate-900/90 p-3 rounded-xl border border-slate-800/80">
                    {session.exerciseContext}
                  </p>
                </div>
              )}

              {/* Variables / Conditions Card */}
              {session.exerciseVariables && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-amber-300 text-xs flex items-center gap-1.5">
                      <span>📋</span>
                      <span>الشروط والمتغيرات المطلوبة:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(session.exerciseVariables!, "variables")}
                      className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                      title="نسخ الشروط"
                    >
                      {copiedField === "variables" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === "variables" ? "تم النسخ" : "نسخ"}</span>
                    </button>
                  </div>
                  <p className="text-slate-200 font-medium leading-relaxed bg-slate-900/90 p-3 rounded-xl border border-slate-800/80">
                    {session.exerciseVariables}
                  </p>
                </div>
              )}

              {/* Personas Panoramic Grid */}
              {session.exercisePersonas && session.exercisePersonas.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-slate-200 text-xs flex items-center gap-1.5">
                      <span>👥</span>
                      <span>الشخصيات المشاركة في السيناريو ({session.exercisePersonas.length}):</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {session.exercisePersonas.map((persona, pIdx) => (
                      <div
                        key={persona.id || pIdx}
                        className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 flex items-start justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <PersonaAvatarDisplay avatar={persona.avatar} name={persona.name} sizeClass="w-10 h-10 text-lg" />
                          <div className="space-y-0.5 min-w-0">
                            <h4 className="font-extrabold text-white text-xs truncate">{persona.name}</h4>
                            {persona.job && (
                              <p className="text-[11px] text-indigo-300 font-medium truncate">{persona.job}</p>
                            )}
                            {persona.promptInstructions && (
                              <p className="text-[10px] text-slate-400 line-clamp-2 leading-snug mt-1">
                                {persona.promptInstructions}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyText(`${persona.name} (${persona.job || "شخصية"}): ${persona.promptInstructions || ""}`, `p_${pIdx}`)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="نسخ تفاصيل الشخصية"
                        >
                          {copiedField === `p_${pIdx}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User Role Card */}
              {session.userRole && (
                <div className="bg-indigo-950/50 border border-indigo-800/60 rounded-2xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-300 font-extrabold">👤 دورك المقترح:</span>
                    <span className="text-white font-bold">{session.userRole}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(session.userRole!, "userRole")}
                    className="p-1 text-indigo-300 hover:bg-indigo-900/60 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                  >
                    {copiedField === "userRole" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === "userRole" ? "تم النسخ" : "نسخ"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Sticky Header Bar for Sentence Builder Mode
const StickySentenceBuilderHeaderBar: React.FC<{
  session: CorrectorSession;
  onEditSettings: () => void;
  onRequestNewPrompt: () => void;
  targetLevel: string;
}> = ({ session, onEditSettings, onRequestNewPrompt, targetLevel }) => {
  if (session.chatType !== "sentence_builder") return null;

  const currentLangObj = LANGUAGES.find((l) => l.code === session.targetLanguage) || LANGUAGES[0];

  return (
    <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border-b border-emerald-200/80 px-3.5 py-2 flex items-center justify-between gap-2.5 z-10 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1.5 shrink-0">
          <PenTool className="w-3.5 h-3.5 text-emerald-100" />
          <span>كون الجمل</span>
        </span>

        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 flex-wrap">
          <span className="bg-white/90 px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs flex items-center gap-1">
            <span>🌐 اللغة:</span>
            <strong className="text-emerald-900">{currentLangObj.flag} {currentLangObj.label}</strong>
          </span>

          <span className="bg-white/90 px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs">
            📌 الموضوع: <strong className="text-emerald-900">{session.sentenceTopic || "عام"}</strong>
          </span>

          {session.sentenceContext && (
            <span className="bg-white/90 px-2.5 py-1 rounded-xl border border-teal-200 shadow-2xs">
              🏙️ السياق: <strong className="text-teal-900">{session.sentenceContext}</strong>
            </span>
          )}

          {session.sentenceGrammarFocus && (
            <span className="bg-white/90 px-2.5 py-1 rounded-xl border border-teal-200 shadow-2xs">
              🎯 القاعدة: <strong className="text-emerald-800">{session.sentenceGrammarFocus}</strong>
            </span>
          )}

          <span className="bg-emerald-100/80 text-emerald-950 px-2 py-1 rounded-xl text-[11px] font-black border border-emerald-300/60">
            المستوى: {targetLevel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onRequestNewPrompt}
          className="px-2.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
          title="الحصول على جملة جديدة لتكوينها"
        >
          <RefreshCw className="w-3.5 h-3.5 text-purple-200" />
          <span className="hidden sm:inline">جملة أخرى 🔄</span>
        </button>

        <button
          type="button"
          onClick={onEditSettings}
          className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-extrabold text-xs rounded-xl border border-slate-300 shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
          title="تعديل الموضوع أو السياق أو القواعد"
        >
          <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
          <span>تعديل الإعدادات ✏️</span>
        </button>
      </div>
    </div>
  );
};

export const AICorrectorWorkspace: React.FC<AICorrectorWorkspaceProps> = ({
  onToggleSidebar,
  onBackToLibrary,
  onImportCards,
  folders = []
}) => {
  // Load saved sessions from localStorage
  const [sessions, setSessions] = useState<CorrectorSession[]>(() => {
    try {
      const saved = localStorage.getItem("ai_corrector_sessions");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("ai_corrector_active_session_id");
      return saved || "";
    } catch {
      return "";
    }
  });

  const [targetLanguage, setTargetLanguage] = useState<string>("German");
  const [targetLevel, setTargetLevel] = useState<string>(() => {
    try {
      return localStorage.getItem("ai_corrector_target_level") || "B1.1";
    } catch {
      return "B1.1";
    }
  });
  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importedSessionId, setImportedSessionId] = useState<string | null>(null);
  const [showFolderPickerForMsg, setShowFolderPickerForMsg] = useState<string | null>(null);
  const [selectedTargetFolderId, setSelectedTargetFolderId] = useState<string>("");
  const [cardToastMessage, setCardToastMessage] = useState<string | null>(null);

  // Personas State & Management
  const [personas, setPersonas] = useState<Persona[]>(() => {
    try {
      const saved = localStorage.getItem("ai_corrector_personas");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_PERSONAS;
  });

  const [activePersonaId, setActivePersonaId] = useState<string>(() => {
    try {
      return localStorage.getItem("ai_corrector_active_persona_id") || DEFAULT_PERSONAS[0].id;
    } catch {
      return DEFAULT_PERSONAS[0].id;
    }
  });

  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Partial<Persona> | null>(null);
  const [isNewPersona, setIsNewPersona] = useState(false);

  // Avatar Selection & DuckDuckGo Image Search State
  const [avatarTab, setAvatarTab] = useState<"duckduckgo" | "link" | "emoji">("duckduckgo");
  const [ddgSearchQuery, setDdgSearchQuery] = useState("");
  const [ddgResults, setDdgResults] = useState<Array<{ title: string; image: string; thumbnail: string; source?: string }>>([]);
  const [ddgLoading, setDdgLoading] = useState(false);

  // AI Persona Auto Generator State
  const [aiPersonaPrompt, setAiPersonaPrompt] = useState("");
  const [isGeneratingAiPersona, setIsGeneratingAiPersona] = useState(false);
  const [aiPersonaError, setAiPersonaError] = useState<string | null>(null);
  const [aiPersonaSuccess, setAiPersonaSuccess] = useState<string | null>(null);

  const handleGeneratePersonaAI = async () => {
    if (!aiPersonaPrompt.trim()) return;
    setIsGeneratingAiPersona(true);
    setAiPersonaError(null);
    setAiPersonaSuccess(null);
    try {
      const savedGeminiKey = localStorage.getItem("settings_gemini_api_key") || "";
      const savedGroqKey = localStorage.getItem("settings_groq_api_key") || "";
      const activeModelForPersona = buttonModels?.persona || selectedModel || "gemini-3.6-flash";

      const res = await fetch("/api/generate-persona-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPersonaPrompt.trim(),
          geminiApiKey: savedGeminiKey,
          groqApiKey: savedGroqKey,
          userApiKey: savedGeminiKey,
          customApiKey: activeModelForPersona.includes("groq") ? savedGroqKey : savedGeminiKey,
          selectedModel: activeModelForPersona
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل توليد الشخصية بالذكاء الاصطناعي");
      }

      const p = data.persona || {};
      const generatedAvatar = safeStr(p.avatar) || safeStr(p.emoji) || "🎭";
      setEditingPersona((prev) => ({
        ...prev,
        name: safeStr(p.name) || safeStr(prev?.name) || "شخصية جديدة",
        job: safeStr(p.job) || safeStr(prev?.job) || "شخصية محادثة",
        age: safeStr(p.age) || safeStr(prev?.age) || "25 سنة",
        origin: safeStr(p.origin) || safeStr(prev?.origin) || "عالمي",
        relationship: safeStr(p.relationship) || safeStr(prev?.relationship) || "",
        toneStyle: safeStr(p.toneStyle) || safeStr(prev?.toneStyle) || "ودود وعفوي",
        backgroundTopics: safeStr(p.backgroundTopics) || safeStr(prev?.backgroundTopics) || "محادثات يومية عامة",
        avatar: generatedAvatar
      }));

      setAiPersonaSuccess(`تم توليد واكتشاف تفاصيل "${safeStr(p.name) || 'الشخصية'}" بنجاح!`);

      // Set avatar tab to duckduckgo and auto-load search options
      setAvatarTab("duckduckgo");
      if (p.imageSearchQuery) {
        setDdgSearchQuery(p.imageSearchQuery);
        handleSearchDdgImages(p.imageSearchQuery);
      }
    } catch (err: any) {
      console.error("AI Persona Gen Error:", err);
      setAiPersonaError(err.message || "حدث خطأ غير متوقع أثناء توليد الشخصية.");
    } finally {
      setIsGeneratingAiPersona(false);
    }
  };

  const handleSearchDdgImages = async (queryText?: string) => {
    const q = (queryText || ddgSearchQuery || editingPersona?.name || "avatar portrait").trim();
    if (!q) return;
    setDdgLoading(true);
    try {
      const res = await fetch(`/api/duckduckgo-images?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          setDdgResults(data.results);
        }
      }
    } catch (e) {
      console.error("Failed to fetch DDG images:", e);
    } finally {
      setDdgLoading(false);
    }
  };

  // Sync personas & activePersonaId to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ai_corrector_personas", JSON.stringify(personas));
    } catch (e) {
      console.error(e);
    }
  }, [personas]);

  useEffect(() => {
    try {
      localStorage.setItem("ai_corrector_active_persona_id", activePersonaId);
    } catch (e) {
      console.error(e);
    }
  }, [activePersonaId]);

  const activePersona = personas.find((p) => p.id === activePersonaId) || personas[0] || DEFAULT_PERSONAS[0];

  // Helper to select persona and bind it specifically to the active conversation session
  const handleSelectPersonaForSession = (personaId: string) => {
    setActivePersonaId(personaId);
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, personaId } : s))
      );
    }
  };

  const fetchImagesForQueries = async (queries: string[]): Promise<string[]> => {
    if (!queries || queries.length === 0) return [];
    try {
      const urls: string[] = [];
      for (const query of queries) {
        if (!query || !query.trim()) continue;
        const res = await fetch(`/api/images?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.hits && data.hits.length > 0) {
            const hit = data.hits[0];
            const imgUrl = hit.webformatURL || hit.largeImageURL || hit.url || hit.image;
            if (imgUrl) urls.push(imgUrl);
          }
        }
      }
      return urls;
    } catch (err) {
      console.error("Error fetching images for persona queries:", err);
      return [];
    }
  };

  const handleSavePersona = (personaData: Partial<Persona> | null) => {
    if (!personaData) return;
    const pName = safeStr(personaData.name);
    if (!pName) return;

    const pAvatar = safeStr(personaData.avatar) || "🎭";
    const pJob = safeStr(personaData.job) || "شخصية محادثة";
    const pAge = safeStr(personaData.age) || "25 سنة";
    const pOrigin = safeStr(personaData.origin) || "عالمي";
    const pRel = safeStr(personaData.relationship);
    const pTone = safeStr(personaData.toneStyle) || "ودود وعفوي";
    const pBg = safeStr(personaData.backgroundTopics) || "محادثات يومية عامة";

    if (isNewPersona || !personaData.id) {
      const newP: Persona = {
        id: `persona-custom-${Date.now()}`,
        name: pName,
        avatar: pAvatar,
        job: pJob,
        age: pAge,
        origin: pOrigin,
        relationship: pRel,
        toneStyle: pTone,
        backgroundTopics: pBg,
        isDefault: false
      };
      setPersonas((prev) => {
        const next = [...prev, newP];
        try {
          localStorage.setItem("ai_corrector_personas", JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
      handleSelectPersonaForSession(newP.id);
    } else {
      const updatedPersona: Persona = {
        id: personaData.id,
        name: pName,
        avatar: pAvatar,
        job: pJob,
        age: pAge,
        origin: pOrigin,
        relationship: pRel,
        toneStyle: pTone,
        backgroundTopics: pBg,
        isDefault: personaData.isDefault || false
      };
      setPersonas((prev) => {
        const next = prev.map((p) => (p.id === personaData.id ? updatedPersona : p));
        try {
          localStorage.setItem("ai_corrector_personas", JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
      handleSelectPersonaForSession(updatedPersona.id);

      // Update personaReply details across all saved sessions when persona is modified
      setSessions((prevSessions) =>
        prevSessions.map((session) => ({
          ...session,
          messages: session.messages.map((m) => {
            if (
              m.personaReply &&
              (m.personaReply.personaId === personaData.id ||
                m.personaReply.personaName?.trim().toLowerCase() === personaData.name?.trim().toLowerCase())
            ) {
              return {
                ...m,
                personaReply: {
                  ...m.personaReply,
                  personaId: updatedPersona.id,
                  personaName: updatedPersona.name,
                  personaAvatar: updatedPersona.avatar,
                  personaJob: updatedPersona.job
                }
              };
            }
            return m;
          })
        }))
      );
    }
    setEditingPersona(null);
    setIsNewPersona(false);
    setAiPersonaSuccess(null);
  };

  const handleDeletePersona = (id: string) => {
    const filtered = personas.filter((p) => p.id !== id);
    if (filtered.length === 0) return;
    setPersonas(filtered);
    if (activePersonaId === id) {
      handleSelectPersonaForSession(filtered[0].id);
    }
  };

  // Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMobileSettingsMenu, setShowMobileSettingsMenu] = useState(false);
  const [showSimplePersonaModal, setShowSimplePersonaModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [selectedChatType, setSelectedChatType] = useState<"free" | "exercise" | "sentence_builder">("free");
  const [sentenceTopicInput, setSentenceTopicInput] = useState<string>("");
  const [sentenceContextInput, setSentenceContextInput] = useState<string>("");
  const [sentenceGrammarFocusInput, setSentenceGrammarFocusInput] = useState<string>("");
  const [sentenceLanguageInput, setSentenceLanguageInput] = useState<string>("German");
  const [showEditSentenceSettingsModal, setShowEditSentenceSettingsModal] = useState<boolean>(false);

  // Dual Voice Input (Instant Speech-to-Text + MediaRecorder Audio STT Fallback)
  const [isListening, setIsListening] = useState<boolean>(false);
  const [listeningSeconds, setListeningSeconds] = useState<number>(0);
  const [speechInterimText, setSpeechInterimText] = useState<string>("");
  const [isTranscribingAudio, setIsTranscribingAudio] = useState<boolean>(false);
  
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);
  const initialTextBeforeRecordRef = useRef<string>("");
  const timerIntervalRef = useRef<any>(null);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const getSpeechLangCode = (lang: string) => {
    switch (lang) {
      case "German": return "de-DE";
      case "English": return "en-US";
      case "French": return "fr-FR";
      case "Spanish": return "es-ES";
      case "Arabic": return "ar-SA";
      case "Italian": return "it-IT";
      case "Russian": return "ru-RU";
      case "Chinese": return "zh-CN";
      case "Turkish": return "tr-TR";
      default: return "de-DE";
    }
  };

  const formatAudioTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const stopAllVoiceStreams = () => {
    isListeningRef.current = false;
    setIsListening(false);
    setSpeechInterimText("");
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch (e) { /* ignore */ }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const cancelSpeechToText = () => {
    stopAllVoiceStreams();
    recordedChunksRef.current = [];
    setInputText(initialTextBeforeRecordRef.current);
  };

  const finishAndTranscribeSpeech = async () => {
    const recordedChunks = [...recordedChunksRef.current];
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    stopAllVoiceStreams();

    const savedGeminiKey = localStorage.getItem("settings_gemini_api_key") || "";
    const savedGroqKey = localStorage.getItem("settings_groq_api_key") || "";

    if (recordedChunks.length > 0) {
      const audioBlob = new Blob(recordedChunks, { type: mimeType });
      if (audioBlob.size > 800) {
        setIsTranscribingAudio(true);
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            try {
              const res = await fetch("/api/transcribe-audio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  audioBase64: base64Audio,
                  mimeType: audioBlob.type || "audio/webm",
                  targetLanguage: activeSession?.targetLanguage || targetLanguage || "German",
                  geminiApiKey: savedGeminiKey,
                  groqApiKey: savedGroqKey,
                  customApiKey: savedGeminiKey
                })
              });

              const contentType = res.headers.get("content-type");
              if (res.ok && contentType && contentType.includes("application/json")) {
                const data = await res.json();
                if (data.success && data.transcript && data.transcript.trim()) {
                  const serverTranscript = data.transcript.trim();
                  setInputText((prevText) => {
                    const base = initialTextBeforeRecordRef.current;
                    if (!prevText || prevText.trim() === base.trim()) {
                      return serverTranscript;
                    }
                    if (!prevText.toLowerCase().includes(serverTranscript.toLowerCase())) {
                      return (prevText + " " + serverTranscript).trim();
                    }
                    return prevText;
                  });
                } else if (data.reason === "no_api_key") {
                  console.warn("No STT API Key configured on server");
                }
              } else {
                const errTxt = await res.text();
                console.warn("Transcription server response notice:", res.status, errTxt);
              }
            } catch (err) {
              console.error("Transcription API error:", err);
            } finally {
              setIsTranscribingAudio(false);
              recordedChunksRef.current = [];
            }
          };
        } catch (err) {
          console.error("FileReader audio error:", err);
          setIsTranscribingAudio(false);
          recordedChunksRef.current = [];
        }
      }
    }
  };

  const toggleSpeechToText = async () => {
    if (isListening) {
      await finishAndTranscribeSpeech();
      return;
    }

    initialTextBeforeRecordRef.current = inputText;
    setListeningSeconds(0);
    recordedChunksRef.current = [];
    isListeningRef.current = true;
    setIsListening(true);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setListeningSeconds((prev) => prev + 1);
    }, 1000);

    const currentLang = activeSession?.targetLanguage || targetLanguage || "German";
    const langCode = getSpeechLangCode(currentLang);

    // 1. Try to initialize MediaRecorder for audio capture
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        if (typeof MediaRecorder !== "undefined") {
          const mr = new MediaRecorder(stream);
          mediaRecorderRef.current = mr;
          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          mr.start(250);
        }
      }
    } catch (err: any) {
      console.warn("Microphone getUserMedia notice:", err);
    }

    // 2. Try to initialize SpeechRecognition for real-time live typing preview
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = langCode;

        let accumulatedFinalText = "";

        recognition.onresult = (event: any) => {
          let finalTranscript = "";
          let interimTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (finalTranscript) {
            accumulatedFinalText += (accumulatedFinalText ? " " : "") + finalTranscript;
          }

          setSpeechInterimText(interimTranscript);

          const base = initialTextBeforeRecordRef.current;
          const currentSpoken = (accumulatedFinalText + (interimTranscript ? " " + interimTranscript : "")).trim();

          if (currentSpoken) {
            const space = base && !base.endsWith(" ") ? " " : "";
            setInputText(base + space + currentSpoken);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition notice:", event.error);
        };

        recognition.onend = () => {
          if (isListeningRef.current) {
            try { recognition.start(); } catch (e) { /* ignore */ }
          }
        };

        recognition.start();
      } catch (err) {
        console.warn("SpeechRecognition start exception:", err);
      }
    }
  };

  const handleRequestNewSentencePrompt = async (targetSessionObj?: CorrectorSession) => {
    const sessionToUse = targetSessionObj || activeSession;
    if (!sessionToUse) return;

    setLoading(true);

    const matchedPersona = personas.find((p) => p.id === sessionToUse.personaId) || activePersona || DEFAULT_PERSONAS[0];
    const savedGeminiKey = localStorage.getItem("settings_gemini_api_key") || "";
    const savedGroqKey = localStorage.getItem("settings_groq_api_key") || "";
    const activeModelForButton = buttonModels?.persona || selectedModel || "gemini-3.6-flash";

    try {
      const res = await fetch("/api/ai/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[طلب جملة جديدة لتكوينها - ${Date.now()}]`,
          targetLanguage: sessionToUse.targetLanguage || targetLanguage,
          targetLevel,
          chatHistory: sessionToUse.messages,
          sendMode: "sentence_builder",
          chatType: "sentence_builder",
          isNewSentenceRequest: true,
          sentenceTopic: sessionToUse.sentenceTopic,
          sentenceContext: sessionToUse.sentenceContext,
          sentenceGrammarFocus: sessionToUse.sentenceGrammarFocus,
          selectedPersona: matchedPersona,
          selectedModel: activeModelForButton,
          geminiApiKey: savedGeminiKey,
          groqApiKey: savedGroqKey,
          customApiKey: activeModelForButton.includes("groq") ? savedGroqKey : savedGeminiKey
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل الحصول على جملة جديدة من الذكاء الاصطناعي");
      }

      const aiMsg: CorrectorMessage = {
        id: `msg-ai-${Date.now()}`,
        sender: "ai",
        text: data.personaReply?.replyText || "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sendMode: "sentence_builder",
        personaId: matchedPersona.id,
        personaName: matchedPersona.name,
        personaReply: data.personaReply,
        aiModelName: `${data.aiModelName || "Gemini"} • ${matchedPersona.name}`,
        targetLanguage: sessionToUse.targetLanguage || targetLanguage
      };

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionToUse.id ? { ...s, messages: [...s.messages, aiMsg] } : s))
      );
    } catch (err: any) {
      console.error("Error fetching sentence prompt:", err);
      alert(err?.message || "حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSentenceBuilderSession = async () => {
    if (!sentenceTopicInput.trim()) {
      alert("يرجى إدخال الموضوع العام لتمرين تكوين الجمل.");
      return;
    }

    const topic = sentenceTopicInput.trim();
    const context = sentenceContextInput.trim();
    const grammar = sentenceGrammarFocusInput.trim();
    const chosenPersona = personas.find((p) => p.id === selectedPersonaForNewChat) || activePersona || DEFAULT_PERSONAS[0];

    const newS: CorrectorSession = {
      id: `session-${Date.now()}`,
      title: `تكوين جمل: ${topic}`,
      targetLanguage: sentenceLanguageInput || targetLanguage || "German",
      createdAt: new Date().toISOString(),
      personaId: chosenPersona.id,
      chatType: "sentence_builder",
      sentenceTopic: topic,
      sentenceContext: context,
      sentenceGrammarFocus: grammar,
      messages: []
    };

    setSessions((prev) => [newS, ...prev]);
    setActiveSessionId(newS.id);
    setShowNewChatModal(false);

    // Auto request first prompt sentence
    await handleRequestNewSentencePrompt(newS);
  };
  const [selectedPersonaForNewChat, setSelectedPersonaForNewChat] = useState<string>("");
  const [exerciseContext, setExerciseContext] = useState<string>("");
  const [exerciseVariables, setExerciseVariables] = useState<string>("");
  const [showExercisePersonasPreviewModal, setShowExercisePersonasPreviewModal] = useState(false);
  const [isGeneratingExercisePersonas, setIsGeneratingExercisePersonas] = useState(false);
  const [personaGenWarnings, setPersonaGenWarnings] = useState<string[]>([]);
  const [personaGenUsedModel, setPersonaGenUsedModel] = useState<string>("");
  const [personaGenError, setPersonaGenError] = useState<string | null>(null);
  const [generatedExerciseData, setGeneratedExerciseData] = useState<{
    exerciseTitle: string;
    userRole: string;
    checklist?: ExerciseChecklistItem[];
    personas: ExercisePersona[];
  } | null>(null);

  const handleToggleChecklistStep = (stepId: string) => {
    if (!activeSessionId) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId || !s.exerciseChecklist) return s;
        const updated = s.exerciseChecklist.map((item) => {
          if (item.id === stepId) {
            return { ...item, isCompleted: !item.isCompleted };
          }
          return item;
        });
        const allDone = updated.every((item) => item.isCompleted);
        return {
          ...s,
          exerciseChecklist: updated,
          isExerciseCompleted: allDone
        };
      })
    );
  };
  const [showLangLevelModal, setShowLangLevelModal] = useState(false);
  const [showButtonModelsModal, setShowButtonModelsModal] = useState(false);
  const [showQuickAccessModal, setShowQuickAccessModal] = useState(false);
  const [showQuickModelMenu, setShowQuickModelMenu] = useState(false);
  const [quickMenuAction, setQuickMenuAction] = useState<"correct" | "chat" | "persona">("correct");

  // Quick Access Models Selection (Up to 5)
  const [quickAccessModels, setQuickAccessModels] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("ai_corrector_quick_access_models");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 5);
      }
    } catch {}
    return [
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
      "groq-llama-3.3-70b",
      "grok-2",
      "gemini-1.5-pro"
    ];
  });

  // Sync quickAccessModels to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ai_corrector_quick_access_models", JSON.stringify(quickAccessModels));
    } catch (e) {
      console.error("Failed to save quick access models:", e);
    }
  }, [quickAccessModels]);

  // Long-press and right-click handlers for execution buttons
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef<boolean>(false);

  const handleButtonTouchStart = (mode: "correct" | "chat" | "persona") => {
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setQuickMenuAction(mode);
      setShowQuickModelMenu(true);
    }, 450);
  };

  const handleButtonTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleButtonClick = (e: React.MouseEvent, mode: "correct" | "chat" | "persona") => {
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressRef.current = false;
      return;
    }
    handleSendMessage(mode);
  };

  const handleButtonContextMenu = (e: React.MouseEvent, mode: "correct" | "chat" | "persona") => {
    e.preventDefault();
    e.stopPropagation();
    setQuickMenuAction(mode);
    setShowQuickModelMenu(true);
  };
  const [buttonModels, setButtonModels] = useState<{
    correct: string;
    chat: string;
    persona: string;
    exerciseAnalysis: string;
    makeCard: string;
  }>(() => {
    try {
      const saved = localStorage.getItem("ai_corrector_button_models");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          correct: parsed.correct || "gemini-3.6-flash",
          chat: parsed.chat || "gemini-3.5-flash-lite",
          persona: parsed.persona || "gemini-3.6-flash",
          exerciseAnalysis: parsed.exerciseAnalysis || "gemini-3.6-flash",
          makeCard: parsed.makeCard || "gemini-2.5-flash"
        };
      }
    } catch {
      // Fallback defaults
    }
    return {
      correct: "gemini-3.6-flash",
      chat: "gemini-3.5-flash-lite",
      persona: "gemini-3.6-flash",
      exerciseAnalysis: "gemini-3.6-flash",
      makeCard: "gemini-2.5-flash"
    };
  });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      return localStorage.getItem("ai_corrector_selected_model") || "gemini-3.6-flash";
    } catch {
      return "gemini-3.6-flash";
    }
  });
  const [speechRate, setSpeechRate] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("ai_corrector_speech_rate")) || 1.0;
    } catch {
      return 1.0;
    }
  });
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => {
    try {
      return localStorage.getItem("ai_corrector_voice_uri") || "";
    } catch {
      return "";
    }
  });
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ai_corrector_auto_speak") === "true";
    } catch {
      return false;
    }
  });

  const [autoSlideInterval, setAutoSlideInterval] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("ai_corrector_auto_slide_interval");
      if (saved !== null) return Number(saved);
    } catch {}
    return 0;
  });

  const [enablePersonaCorrection, setEnablePersonaCorrection] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ai_corrector_enable_persona_correction") !== "false";
    } catch {
      return true;
    }
  });

  const [activeCorrectionModalData, setActiveCorrectionModalData] = useState<{
    corr: CorrectorAnalysis;
    msgId: string;
    userText?: string;
    targetLanguage: string;
  } | null>(null);

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [installedPiperModels, setInstalledPiperModels] = useState<any[]>([]);
  const [catalogPiperModels, setCatalogPiperModels] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const triggeredGreetingsRef = useRef<Set<string>>(new Set());

  // Pagination & Scroll State
  const [visibleMessagesCount, setVisibleMessagesCount] = useState<number>(10);
  const prevSessionIdRef = useRef<string>("");
  const prevMessagesLengthRef = useRef<number>(0);

  // Sync settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ai_corrector_selected_model", selectedModel);
      localStorage.setItem("ai_corrector_speech_rate", String(speechRate));
      localStorage.setItem("ai_corrector_voice_uri", selectedVoiceURI);
      localStorage.setItem("ai_corrector_auto_speak", String(autoSpeak));
      localStorage.setItem("ai_corrector_auto_slide_interval", String(autoSlideInterval));
      localStorage.setItem("ai_corrector_enable_persona_correction", String(enablePersonaCorrection));
      localStorage.setItem("ai_corrector_button_models", JSON.stringify(buttonModels));
    } catch (e) {
      console.error("Failed to save AI corrector settings:", e);
    }
  }, [selectedModel, speechRate, selectedVoiceURI, autoSpeak, autoSlideInterval, enablePersonaCorrection, buttonModels]);

  // Fetch installed and catalog Piper TTS models from server
  useEffect(() => {
    const fetchTtsModels = async () => {
      try {
        const [resInst, resCat] = await Promise.all([
          fetch("/api/tts/models").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/tts/catalog").then((r) => (r.ok ? r.json() : null)).catch(() => null)
        ]);
        if (resInst?.models) setInstalledPiperModels(resInst.models);
        if (resCat) {
          const catList = Array.isArray(resCat) ? resCat : (resCat.catalog || []);
          setCatalogPiperModels(catList);
        }
      } catch (e) {
        console.error("Failed to load Piper TTS models:", e);
      }
    };
    fetchTtsModels();
  }, []);

  // Load available SpeechSynthesis Voices
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Sync sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ai_corrector_sessions", JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save corrector sessions:", e);
    }
  }, [sessions]);

  // Sync activeSessionId to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ai_corrector_active_session_id", activeSessionId);
    } catch (e) {
      console.error(e);
    }
  }, [activeSessionId]);

  // Sync active persona to match the persona assigned to the current active session
  useEffect(() => {
    if (!activeSessionId) return;
    const currentS = sessions.find((s) => s.id === activeSessionId);
    if (currentS) {
      if (currentS.personaId && personas.some((p) => p.id === currentS.personaId)) {
        setActivePersonaId(currentS.personaId);
      } else {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, personaId: activePersonaId } : s))
        );
      }
    }
  }, [activeSessionId]);

  // Ensure active session exists
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const allSessionMessages = activeSession?.messages || [];
  const totalMsgsCount = allSessionMessages.length;
  const visibleMessages = allSessionMessages.slice(Math.max(0, totalMsgsCount - visibleMessagesCount));
  const hasMoreMessages = totalMsgsCount > visibleMessagesCount;

  // 1. When switching sessions: reset visible message limit to 10 and scroll INSTANTLY to bottom
  useEffect(() => {
    if (!activeSessionId) return;

    if (prevSessionIdRef.current !== activeSessionId) {
      prevSessionIdRef.current = activeSessionId;
      setVisibleMessagesCount(10);
      prevMessagesLengthRef.current = totalMsgsCount;

      // Snap scroll to bottom instantly without sliding down from top
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
    }
  }, [activeSessionId, totalMsgsCount]);

  // 2. When new message is added or AI responds: scroll down smoothly
  useEffect(() => {
    if (!activeSessionId) return;

    if (totalMsgsCount > prevMessagesLengthRef.current) {
      prevMessagesLengthRef.current = totalMsgsCount;
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: "smooth"
          });
        }
      });
    }
  }, [totalMsgsCount, loading]);

  // 3. Load 10 earlier messages and preserve relative scroll position
  const handleLoadMoreMessages = () => {
    if (!hasMoreMessages || !chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;

    setVisibleMessagesCount((prev) => Math.min(prev + 10, totalMsgsCount));

    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        const newScrollHeight = chatContainerRef.current.scrollHeight;
        chatContainerRef.current.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
      }
    });
  };

  // 4. Chat Scroll handler (strictly passive, no auto-loading on scroll to preserve DOM lightness)
  const handleChatScroll = () => {
    // Intentionally passive to avoid auto-expanding DOM elements on scroll
  };

  const getFriendlyModelName = (modelKey: string) => {
    switch (modelKey) {
      case "gemini-3.5-flash-lite":
        return "Gemini 3.5 Flash Lite ⚡";
      case "gemini-3.1-flash-lite":
        return "Gemini 3.1 Flash Lite ⚡";
      case "gemini-2.5-flash-lite":
        return "Gemini 2.5 Flash Lite ⚡";
      case "gemini-3.5-flash":
        return "Gemini 3.5 Flash ⚡";
      case "groq-llama-3.3-70b":
      case "groq":
        return "Groq Llama 3.3 70B 🚀";
      case "grok-2":
      case "grok":
        return "Grok 2 🤖";
      case "gemini-2.5-flash":
        return "Gemini 2.5 Flash ⚡";
      case "gemini-1.5-pro":
        return "Gemini 1.5 Pro 💎";
      case "gemini-3.6-flash":
      default:
        return "Gemini 3.6 Flash ⚡";
    }
  };

  const handleGenerateExercisePersonas = async (ctxInput: string, varInput?: string, overrideModel?: string) => {
    setIsGeneratingExercisePersonas(true);
    setShowExercisePersonasPreviewModal(true);
    setGeneratedExerciseData(null);
    setPersonaGenWarnings([]);
    setPersonaGenError(null);

    const modelToUse = overrideModel || buttonModels.exerciseAnalysis || selectedModel || "gemini-3.6-flash";
    setPersonaGenUsedModel(modelToUse);

    try {
      const savedGeminiKey = localStorage.getItem("settings_gemini_api_key") || "";
      const savedGroqKey = localStorage.getItem("settings_groq_api_key") || "";
      const langObj = LANGUAGES.find((l) => l.code === targetLanguage) || LANGUAGES[0];

      const res = await fetch("/api/ai/generate-exercise-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseContext: ctxInput,
          exerciseVariables: varInput,
          targetLanguage: langObj.label,
          userLevel: targetLevel,
          model: modelToUse,
          selectedModel: modelToUse,
          customApiKey: modelToUse.includes("groq") ? savedGroqKey : savedGeminiKey,
          geminiApiKey: savedGeminiKey,
          groqApiKey: savedGroqKey
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `فشل الاتصال بالخادم (${res.status})`);
      }

      const data = await res.json();

      if (data.warnings && Array.isArray(data.warnings) && data.warnings.length > 0) {
        setPersonaGenWarnings(data.warnings);
      }
      if (data.usedModel) {
        setPersonaGenUsedModel(data.usedModel);
      }

      if (data.success) {
        let rawPersonas = data.personas && data.personas.length > 0 ? data.personas : [
          {
            id: `ex-${Date.now()}`,
            name: "الشخصية التفاعلية",
            job: "طرف المحادثة الرئيسي",
            avatar: "🎭",
            origin: "محلية",
            toneStyle: "تفاعلي وودود",
            backgroundTopics: ctxInput,
            roleDescriptionAr: "تتولى إدارة الحوار وتوجيه الأسئلة لمساعدتك في تحقيق أهداف التمرين"
          }
        ];

        // Fetch real portrait photos for exercise personas
        const personasWithRealAvatars = await Promise.all(
          rawPersonas.map(async (p: ExercisePersona, pIdx: number) => {
            try {
              const query = p.imageSearchQuery || `${p.name.split(" ")[0]} ${p.job} portrait photography face`;
              const imgs = await fetchImagesForQueries([query]);
              if (imgs && imgs.length > 0 && imgs[0]) {
                return { ...p, avatar: imgs[0] };
              }
            } catch (err) {
              console.error("Failed to fetch image for exercise persona:", err);
            }
            // Fallback photo if search fails or returns empty
            const fallbackAvatar = DEFAULT_AVATAR_PHOTOS[pIdx % DEFAULT_AVATAR_PHOTOS.length];
            return { ...p, avatar: p.avatar && p.avatar.startsWith("http") ? p.avatar : fallbackAvatar };
          })
        );

        setGeneratedExerciseData({
          exerciseTitle: data.exerciseTitle || `تمرين: ${ctxInput.slice(0, 25)}...`,
          userRole: data.userRole || "المحاور الرئيسي والمشارك في التمرين",
          checklist: data.checklist || [],
          personas: personasWithRealAvatars
        });
      }
    } catch (err: any) {
      console.warn("Exercise personas generation error:", err);
      const errMsg = err?.message || String(err);
      setPersonaGenError(errMsg);
      setPersonaGenWarnings([`تعذر التوليد المباشر بنموذج ${getFriendlyModelName(modelToUse)}: ${errMsg}`]);
      setGeneratedExerciseData({
        exerciseTitle: `تمرين: ${ctxInput.slice(0, 25)}...`,
        userRole: "المتحدث والطرف الأساسي في التمرين",
        checklist: [],
        personas: [
          {
            id: `ex-${Date.now()}`,
            name: "المحاكي الذكي (AI Persona)",
            job: "موجه السيناريو والشخصية الرئيسية",
            avatar: DEFAULT_AVATAR_PHOTOS[0],
            toneStyle: "تفاعلي وودود",
            roleDescriptionAr: "يتفاعل معك مباشرة بحسب سياق التمرين المذكور"
          }
        ]
      });
    } finally {
      setIsGeneratingExercisePersonas(false);
    }
  };

  const triggerExerciseInitialGreeting = async (
    sessionId: string,
    langCode: string,
    ctxInput: string,
    varInput?: string,
    exPersonas?: ExercisePersona[],
    exChecklist?: ExerciseChecklistItem[]
  ) => {
    if (triggeredGreetingsRef.current.has(sessionId)) {
      return;
    }
    triggeredGreetingsRef.current.add(sessionId);

    setLoading(true);
    try {
      const langObj = LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0];
      const primaryPersona = exPersonas && exPersonas.length > 0 ? exPersonas[0] : activePersona;

      const personaInstruction = primaryPersona
        ? `أنت تجسد شخصية (${primaryPersona.name}) ووظيفتك (${primaryPersona.job}) ونبرتك (${primaryPersona.toneStyle || "ودودة وتفاعلية"}).`
        : "";

      const initialPrompt = `[بدء تمرين السيناريو تلقائياً] ابدأ تمرين السيناريو والتفاعل الآن بصفتك الشخصية الرئيسية (${primaryPersona?.name || "المحاكي"}) في هذا السيناريو باللغة المستهدفة (${langObj.label}):
سياق السيناريو: "${ctxInput}"
${varInput ? `الشروط والمتغيرات المطلوب مراعاتها: "${varInput}"` : ""}
${personaInstruction}
اطرح التحية أو أول سؤال محفز باللغة المستهدفة لتبدأ محادثة التمرين فوراً مع المستخدم وتفتتح الجولة الأولى في السيناريو.`;

      const savedGeminiKey = localStorage.getItem("settings_gemini_api_key") || "";
      const savedGroqKey = localStorage.getItem("settings_groq_api_key") || "";

      const activePersonaModel = buttonModels.persona || selectedModel || "gemini-3.6-flash";

      const res = await fetch("/api/ai/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: initialPrompt,
          targetLanguage: langObj.label,
          targetLevel,
          sendMode: "persona",
          chatType: "exercise",
          exerciseContext: ctxInput,
          exerciseVariables: varInput,
          exerciseChecklist: exChecklist,
          exercisePersonas: exPersonas,
          selectedPersona: primaryPersona,
          selectedModel: activePersonaModel,
          customApiKey: activePersonaModel.includes("groq") ? savedGroqKey : savedGeminiKey,
          geminiApiKey: savedGeminiKey,
          groqApiKey: savedGroqKey
        })
      });

      if (!res.ok) {
        throw new Error("Failed to start exercise scenario greeting");
      }

      const data = await res.json();
      if (data.success && data.personaReply) {
        // Fetch images for query prompts if available
        let imageUrls: string[] = [];
        if (data.personaReply.imageSearchQueries && Array.isArray(data.personaReply.imageSearchQueries)) {
          imageUrls = await fetchImagesForQueries(data.personaReply.imageSearchQueries);
        }

        const replyPId = data.personaReply?.personaId?.trim();
        const replyPName = data.personaReply?.personaName?.trim().toLowerCase();

        const matchedPersona = exPersonas?.find((p) => {
          if (replyPId && p.id === replyPId) return true;
          if (replyPName) {
            const pName = p.name.trim().toLowerCase();
            if (pName === replyPName || pName.includes(replyPName) || replyPName.includes(pName)) return true;
            const baseName = pName.split("(")[0].trim();
            if (baseName && (baseName.includes(replyPName) || replyPName.includes(baseName))) return true;
            const firstName = baseName.split(" ")[0];
            if (firstName && firstName.length >= 2 && replyPName.includes(firstName)) return true;
          }
          return false;
        }) || primaryPersona;

        const updatedPersonaReply = {
          ...data.personaReply,
          personaId: matchedPersona?.id || data.personaReply.personaId,
          personaName: matchedPersona?.name || data.personaReply.personaName || primaryPersona?.name,
          personaAvatar: matchedPersona?.avatar || data.personaReply.personaAvatar || primaryPersona?.avatar || "🎭",
          personaJob: matchedPersona?.job || data.personaReply.personaJob || primaryPersona?.job,
          imageUrls,
          imageQueries: data.personaReply.imageSearchQueries || []
        };

        const updatedChecklist = data.personaReply?.updatedChecklist || data.updatedChecklist || exChecklist;
        const isExerciseCompleted = data.personaReply?.isExerciseCompleted || data.isExerciseCompleted || false;

        const aiMsg: CorrectorMessage = {
          id: `msg-${Date.now()}`,
          sender: "ai",
          text: updatedPersonaReply.replyText,
          timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
          sendMode: "persona",
          aiModelName: data.aiModelName || getFriendlyModelName(activePersonaModel),
          personaReply: updatedPersonaReply,
          targetLanguage: langCode
        };

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              exerciseChecklist: updatedChecklist,
              isExerciseCompleted: isExerciseCompleted,
              messages: [aiMsg]
            };
          })
        );

        if ((autoSpeak || localStorage.getItem("ai_corrector_auto_speak") === "true") && updatedPersonaReply.replyText) {
          handleSpeakText(updatedPersonaReply.replyText, langCode);
        }
      }
    } catch (err) {
      console.warn("Exercise auto-start error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewSession = (
    langCode: string,
    customTitle?: string,
    chosenPersonaId?: string,
    chatType: "free" | "exercise" = "free",
    ctxInput?: string,
    varInput?: string,
    exTitle?: string,
    uRole?: string,
    exPersonas?: ExercisePersona[],
    exChecklist?: ExerciseChecklistItem[]
  ) => {
    const langObj = LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0];
    let defaultTitle = "";
    if (chatType === "exercise") {
      defaultTitle = customTitle || exTitle || (ctxInput ? `تمرين: ${ctxInput.length > 25 ? ctxInput.slice(0, 25) + "..." : ctxInput} (${langObj.flag})` : `تمرين سيناريو (${langObj.flag})`);
    } else {
      const personaToUse = chosenPersonaId || activePersonaId;
      const personaObj = personas.find((p) => p.id === personaToUse) || activePersona;
      defaultTitle = customTitle || `محادثة حرة مع ${personaObj.name} (${langObj.flag})`;
    }

    const newSession: CorrectorSession = {
      id: `session-${Date.now()}`,
      title: defaultTitle,
      targetLanguage: langCode,
      createdAt: new Date().toISOString(),
      personaId: (chatType === "exercise" && exPersonas?.[0]?.id) ? exPersonas[0].id : (chosenPersonaId || activePersonaId),
      chatType,
      exerciseContext: ctxInput,
      exerciseVariables: varInput,
      exerciseTitle: exTitle,
      userRole: uRole,
      exercisePersonas: exPersonas,
      exerciseChecklist: exChecklist,
      messages: []
    };

    if (chosenPersonaId && chatType === "free") {
      setActivePersonaId(chosenPersonaId);
    }

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setTargetLanguage(langCode);
  };

  // Auto-trigger initial greeting if exercise session has no messages yet
  useEffect(() => {
    if (
      activeSession &&
      activeSession.chatType === "exercise" &&
      activeSession.exerciseContext &&
      (!activeSession.messages || activeSession.messages.length === 0) &&
      !loading
    ) {
      triggerExerciseInitialGreeting(
        activeSession.id,
        activeSession.targetLanguage || targetLanguage,
        activeSession.exerciseContext,
        activeSession.exerciseVariables,
        activeSession.exercisePersonas,
        activeSession.exerciseChecklist
      );
    }
  }, [activeSessionId, activeSession?.messages?.length]);

  const handleRenameSession = (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle.trim() } : s))
    );
    setEditingSessionId(null);
    setEditingSessionTitle("");
  };

  // Insert Umlaut/Special character without losing textarea focus
  const handleInsertChar = (char: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setInputText((prev) => prev + char);
      return;
    }
    const start = textarea.selectionStart ?? inputText.length;
    const end = textarea.selectionEnd ?? inputText.length;
    const updated = inputText.substring(0, start) + char + inputText.substring(end);
    setInputText(updated);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + char.length, start + char.length);
    });
  };

  const handleSendMessage = async (
    sendMode: "correct" | "chat" | "persona" = "correct",
    textToSend?: string,
    overrideModel?: string,
    removeMessageId?: string
  ) => {
    const content = (textToSend || inputText).trim();
    if (!content || loading) return;

    if (!textToSend) setInputText("");

    let currentSessionId = activeSessionId;
    let currentSession = sessions.find((s) => s.id === currentSessionId);

    if (!currentSession) {
      const langObj = LANGUAGES.find((l) => l.code === targetLanguage) || LANGUAGES[0];
      const snippet = content.length > 28 ? content.slice(0, 28) + "..." : content;
      const newS: CorrectorSession = {
        id: `session-${Date.now()}`,
        title: `${snippet} (${langObj.flag})`,
        targetLanguage: targetLanguage,
        createdAt: new Date().toISOString(),
        personaId: activePersonaId,
        messages: []
      };
      currentSessionId = newS.id;
      currentSession = newS;
      setActiveSessionId(newS.id);
      setSessions((prev) => [newS, ...prev]);
    }

    const currentLang = currentSession.targetLanguage || targetLanguage;

    // Create user message
    const userMsg: CorrectorMessage = {
      id: `msg-user-${Date.now()}`,
      sender: "user",
      text: content,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      sendMode,
      personaId: sendMode === "persona" ? activePersona?.id : undefined,
      personaName: sendMode === "persona" ? activePersona?.name : undefined
    };

    const targetRemoveId = removeMessageId || editingMessageId;
    let baseMessages = currentSession.messages || [];
    if (targetRemoveId) {
      const idx = baseMessages.findIndex((m) => m.id === targetRemoveId);
      baseMessages = baseMessages.filter((m, i) => {
        if (m.id === targetRemoveId) return false;
        if (idx >= 0 && i === idx + 1 && m.id.startsWith("msg-error-")) return false;
        return true;
      });
      setEditingMessageId(null);
    }

    // Update session state locally first and auto-set descriptive session title if default
    const updatedMessages = [...baseMessages, userMsg];
    const langObj = LANGUAGES.find((l) => l.code === currentLang) || LANGUAGES[0];
    const snippet = content.length > 28 ? content.slice(0, 28) + "..." : content;
    const autoTitle = `${snippet} (${langObj.flag})`;

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === currentSessionId) {
          const isDefaultTitle =
            !s.title ||
            s.title.startsWith("محادثة تصحيح") ||
            s.title.startsWith("محادثة جديد");
          const updatedTitle = isDefaultTitle ? autoTitle : s.title;
          return { ...s, title: updatedTitle, personaId: activePersonaId, messages: updatedMessages };
        }
        return s;
      })
    );

    setLoading(true);

    try {
      // Filter past messages strictly according to valid exchanges & active sendMode:
      // 1. Exclude any orphaned user messages (messages without a valid AI response due to error/refresh)
      // 2. Exclude any AI error messages
      // 3. For "persona" mode: ONLY include dialog messages exchanged with the current active persona.
      // 4. For "correct" / "chat" modes: Include ALL valid past messages in the workspace.
      const rawPast = updatedMessages.slice(0, -1);
      const validPairs: CorrectorMessage[] = [];

      for (let i = 0; i < rawPast.length; i++) {
        const m = rawPast[i];
        if (m.sender === "ai") {
          // Only include valid AI responses
          if (m.personaReply || m.chatReply || m.analysis) {
            validPairs.push(m);
          }
        } else if (m.sender === "user") {
          // A user message is only valid if followed by a successful valid AI response
          const nextMsg = rawPast[i + 1];
          if (
            nextMsg &&
            nextMsg.sender === "ai" &&
            (nextMsg.personaReply || nextMsg.chatReply || nextMsg.analysis)
          ) {
            validPairs.push(m);
          }
        }
      }

      const previousMessages = validPairs.filter((m) => {
        if (currentSession?.chatType === "exercise") {
          // For exercise sessions, retain ALL messages in the exercise roleplay exchange
          return true;
        }
        if (sendMode === "persona") {
          // STRICT ISOLATION: ONLY include messages belonging to this persona roleplay exchange
          const isPersonaMsg = m.sendMode === "persona" || !!m.personaReply || !!m.personaId;
          if (!isPersonaMsg) return false;

          // Filter strictly by activePersona if available
          if (activePersona) {
            if (m.personaReply) {
              const matchId = m.personaReply.personaId === activePersona.id;
              const matchName = m.personaReply.personaName?.trim().toLowerCase() === activePersona.name?.trim().toLowerCase();
              return matchId || matchName;
            }
            if (m.personaId) {
              return m.personaId === activePersona.id;
            }
            if (m.personaName) {
              return m.personaName.trim().toLowerCase() === activePersona.name?.trim().toLowerCase();
            }
          }
          return true;
        } else {
          // "correct" and "chat" modes: Include FULL session history across ALL modes & message types!
          return true;
        }
      });

      const chatHistory = previousMessages.map((m) => {
        if (m.sender === "user") {
          const modeLabel = m.sendMode === "persona"
            ? `محادثة شخصية (${m.personaName || activePersona?.name || "شخصية"})`
            : m.sendMode === "chat"
            ? "سؤال / حوار عام"
            : "تصحيح لغوي";
          return {
            sender: "user",
            text: m.text,
            sendMode: m.sendMode || "correct",
            modeLabel
          };
        } else {
          let modeText = m.sendMode || "correct";
          let modeLabel = "تصحيح وتحليل لغوي";
          let summaryText = m.text;
          let extraDetails = "";

          if (m.personaReply) {
            modeText = "persona";
            modeLabel = `رد الشخصية (${m.personaReply.personaName || "الشخصية"})`;
            summaryText = m.personaReply.replyText || m.text;
            extraDetails = `الشخصية: ${m.personaReply.personaName || "الشخصية"}`;
          } else if (m.chatReply) {
            modeText = "chat";
            modeLabel = "إجابة سؤال / توضيح حوار";
            summaryText = m.chatReply.replyText || m.text;
            if (m.chatReply.title) extraDetails = `العنوان: ${m.chatReply.title}`;
          } else if (m.analysis) {
            modeText = "correct";
            modeLabel = "تصحيح وتحليل لغوي";
            summaryText = m.analysis.correctedText || m.text;
            extraDetails = `النص المصحح: "${m.analysis.correctedText}" (الدرجة: ${m.analysis.score}/100)`;
          }

          return {
            sender: "ai",
            text: summaryText,
            sendMode: modeText,
            modeLabel,
            extraDetails
          };
        }
      });

      const savedGeminiKey = localStorage.getItem("settings_gemini_api_key") || "";
      const savedGroqKey = localStorage.getItem("settings_groq_api_key") || "";
      const activeModelForButton = overrideModel || buttonModels[sendMode] || selectedModel;

      const res = await fetch("/api/ai/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: content,
          targetLanguage: currentLang,
          targetLevel,
          chatHistory,
          sendMode: currentSession.chatType === "sentence_builder" ? "sentence_builder" : sendMode,
          chatType: currentSession.chatType,
          sentenceTopic: currentSession.sentenceTopic,
          sentenceContext: currentSession.sentenceContext,
          sentenceGrammarFocus: currentSession.sentenceGrammarFocus,
          exerciseContext: currentSession.exerciseContext,
          exerciseVariables: currentSession.exerciseVariables,
          exerciseChecklist: currentSession.exerciseChecklist,
          exercisePersonas: currentSession.exercisePersonas,
          selectedModel: activeModelForButton,
          selectedPersona: activePersona,
          enablePersonaCorrection,
          geminiApiKey: savedGeminiKey,
          groqApiKey: savedGroqKey,
          customApiKey: activeModelForButton.includes("groq") ? savedGroqKey : savedGeminiKey
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الاتصال بالذكاء الاصطناعي");

      const modelDisplayName = data.aiModelName || getFriendlyModelName(activeModelForButton);

      if ((data.sendMode === "persona" || data.sendMode === "sentence_builder") && data.personaReply) {
        // Fetch images for query prompts if available
        let imageUrls: string[] = [];
        if (data.personaReply.imageSearchQueries && Array.isArray(data.personaReply.imageSearchQueries)) {
          imageUrls = await fetchImagesForQueries(data.personaReply.imageSearchQueries);
        }

        let matchedExPersona: any = null;
        if (currentSession.chatType === "exercise" && currentSession.exercisePersonas?.length) {
          const replyPId = data.personaReply?.personaId?.trim();
          const replyPName = data.personaReply?.personaName?.trim().toLowerCase();

          matchedExPersona = currentSession.exercisePersonas.find((p) => {
            if (replyPId && p.id === replyPId) return true;
            if (replyPName) {
              const pName = p.name.trim().toLowerCase();
              if (pName === replyPName || pName.includes(replyPName) || replyPName.includes(pName)) return true;
              const baseName = pName.split("(")[0].trim();
              if (baseName && (baseName.includes(replyPName) || replyPName.includes(baseName))) return true;
              const firstName = baseName.split(" ")[0];
              if (firstName && firstName.length >= 2 && replyPName.includes(firstName)) return true;
            }
            return false;
          }) || currentSession.exercisePersonas[0];
        }

        const personaReplyObj: PersonaReply = {
          ...data.personaReply,
          personaId: matchedExPersona?.id || data.personaReply.personaId || activePersona.id,
          personaName: matchedExPersona?.name || data.personaReply.personaName || activePersona.name,
          personaAvatar: matchedExPersona?.avatar || data.personaReply.personaAvatar || activePersona.avatar || "🎭",
          personaJob: matchedExPersona?.job || data.personaReply.personaJob || activePersona.job,
          imageUrls,
          imageQueries: data.personaReply.imageSearchQueries || []
        };

        const updatedChecklist = data.personaReply?.updatedChecklist || data.updatedChecklist || currentSession.exerciseChecklist;
        const isExerciseCompleted = data.personaReply?.isExerciseCompleted || data.isExerciseCompleted || currentSession.isExerciseCompleted;

        const aiMsg: CorrectorMessage = {
          id: `msg-ai-${Date.now()}`,
          sender: "ai",
          text: personaReplyObj.replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          sendMode: "persona",
          aiModelName: `${modelDisplayName} • ${personaReplyObj.personaName}`,
          personaReply: personaReplyObj,
          targetLanguage: currentLang
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  exerciseChecklist: updatedChecklist,
                  isExerciseCompleted: isExerciseCompleted,
                  messages: [...s.messages, aiMsg]
                }
              : s
          )
        );

        if (autoSpeak) {
          handleSpeakText(aiMsg.text, currentLang);
        }
      } else if (data.sendMode === "chat" && data.chatReply) {
        const aiMsg: CorrectorMessage = {
          id: `msg-ai-${Date.now()}`,
          sender: "ai",
          text: data.chatReply.replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          sendMode: "chat",
          aiModelName: modelDisplayName,
          chatReply: data.chatReply,
          targetLanguage: currentLang
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId ? { ...s, messages: [...s.messages, aiMsg] } : s
          )
        );
      } else {
        const analysis: CorrectorAnalysis = data.analysis;

        const aiMsg: CorrectorMessage = {
          id: `msg-ai-${Date.now()}`,
          sender: "ai",
          text: analysis.correctedText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          sendMode: "correct",
          aiModelName: modelDisplayName,
          analysis,
          targetLanguage: currentLang
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId ? { ...s, messages: [...s.messages, aiMsg] } : s
          )
        );
      }
    } catch (err: any) {
      console.error(err);

      const errorMsg: CorrectorMessage = {
        id: `msg-error-${Date.now()}`,
        sender: "ai",
        text: `⚠️ عذراً، تعذر الحصول على رد من الذكاء الاصطناعي: ${err?.message || "تأكد من إعداد مفتاح API أو الاتصال وحاول مجدداً"}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        aiModelName: getFriendlyModelName(selectedModel)
      };

      // Keep userMsg in conversation history and append the errorMsg right after it
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== currentSessionId) return s;
          return { ...s, messages: [...s.messages, errorMsg] };
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    const filtered = sessions.filter((s) => s.id !== sessionId);
    setSessions(filtered);
    if (activeSessionId === sessionId) {
      setActiveSessionId(filtered[0]?.id || "");
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getModelsForTargetLanguage = (langCode: string) => {
    const langObj = LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0];
    const langIso = langObj.iso;
    const langShort = langIso.split("-")[0].toLowerCase();

    // Default known Piper models per language
    const defaultPiperModels: Record<string, Array<{ id: string; name: string; flag: string }>> = {
      de: [
        { id: "de_DE-thorsten-medium", name: "Thorsten Medium (ألماني - متوسط)", flag: "🇩🇪" },
        { id: "de_DE-thorsten-high", name: "Thorsten High (ألماني - عالي الجودة)", flag: "🇩🇪" },
        { id: "de_DE-kerstin-low", name: "Kerstin Low (ألماني أنثوي - خفيف)", flag: "🇩🇪" },
        { id: "de_DE-pavoque-low", name: "Pavoque Low (ألماني - سريع)", flag: "🇩🇪" },
        { id: "de_DE-amany-medium", name: "Amany (ألماني - صوت أماني)", flag: "🇩🇪" }
      ],
      ar: [
        { id: "ar_JO-kareem-medium", name: "Kareem (عربي أردني)", flag: "🇯🇴" }
      ],
      en: [
        { id: "en_US-lessac-medium", name: "Lessac (إنجليزي أمريكي)", flag: "🇺🇸" }
      ]
    };

    const defaults = defaultPiperModels[langShort] || [];

    // Filter server installed and catalog models
    const installedForLang = installedPiperModels.filter(
      (m) => m.lang === langShort || m.id.toLowerCase().startsWith(`${langShort}_`)
    );
    const catalogForLang = catalogPiperModels.filter(
      (m) => m.lang === langShort || m.id.toLowerCase().startsWith(`${langShort}_`)
    );

    const map = new Map<string, { id: string; name: string; flag: string; isInstalled: boolean }>();

    defaults.forEach((m) => {
      const isInst = installedPiperModels.some((ip) => ip.id === m.id);
      map.set(m.id, { id: m.id, name: m.name, flag: m.flag, isInstalled: isInst });
    });

    catalogForLang.forEach((m) => {
      const isInst = installedPiperModels.some((ip) => ip.id === m.id);
      if (!map.has(m.id)) {
        map.set(m.id, { id: m.id, name: m.name || m.id, flag: m.flag || langObj.flag, isInstalled: isInst });
      } else {
        map.get(m.id)!.isInstalled = isInst || map.get(m.id)!.isInstalled;
      }
    });

    installedForLang.forEach((m) => {
      if (!map.has(m.id)) {
        map.set(m.id, { id: m.id, name: m.name || m.id, flag: m.flag || langObj.flag, isInstalled: true });
      } else {
        map.get(m.id)!.isInstalled = true;
      }
    });

    // Also check primary saved model in localStorage
    const savedPrimary = localStorage.getItem(`settings_primary_piper_model_${langShort}`);
    if (savedPrimary && !map.has(savedPrimary) && savedPrimary !== "google" && savedPrimary !== "webspeech") {
      map.set(savedPrimary, {
        id: savedPrimary,
        name: `النموذج الرئيسي (${savedPrimary})`,
        flag: langObj.flag,
        isInstalled: true
      });
    }

    return Array.from(map.values());
  };

  const handleSpeakText = (text: string, langCode?: string, customVoice?: string) => {
    // Local filter function to strip all emojis and formatting before speech synthesis
    let textToSpeak = (text || "")
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/[*_~`#]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!textToSpeak) return;

    let voiceToUse = customVoice !== undefined ? customVoice : selectedVoiceURI;
    const currentLang = langCode || activeSession?.targetLanguage || targetLanguage;
    const langObj =
      LANGUAGES.find(
        (l) =>
          l.code === currentLang ||
          l.iso === currentLang ||
          l.code.toLowerCase() === currentLang.toLowerCase() ||
          l.label === currentLang
      ) || LANGUAGES[0];
    const langIso = langObj ? langObj.iso : "de";
    const langShort = langIso.split("-")[0].toLowerCase();

    // CRITICAL: If target language is NOT Arabic (e.g. German, English, French), filter out Arabic parenthetical guidance/instructions so TTS only reads foreign target language
    if (langShort !== "ar") {
      textToSpeak = textToSpeak
        .replace(/[\(\[\{][^\)\}\]]*[\u0600-\u06FF][^\)\}\]]*[\)\]\}]/g, " ")
        .replace(/[\u0600-\u06FF]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (!textToSpeak) return;

    // If no explicit voice selected or set to auto, resolve primary model for this target language
    if (!voiceToUse || voiceToUse === "auto" || voiceToUse === "default") {
      const primarySaved =
        localStorage.getItem(`settings_primary_piper_model_${langShort}`) ||
        localStorage.getItem("settings_primary_piper_model");
      if (primarySaved) {
        voiceToUse = primarySaved;
      }
    }

    // Check for language mismatch (e.g. selected voice is German de_DE but text language is Arabic ar)
    if (voiceToUse && (voiceToUse.startsWith("de_") || voiceToUse.startsWith("ar_") || voiceToUse.startsWith("en_"))) {
      const modelLangPrefix = voiceToUse.split("_")[0];
      if (modelLangPrefix !== langShort) {
        const primaryForLang = localStorage.getItem(`settings_primary_piper_model_${langShort}`);
        if (primaryForLang) {
          voiceToUse = primaryForLang;
        } else if (langShort === "de") {
          voiceToUse = "de_DE-thorsten-medium";
        } else if (langShort === "ar") {
          voiceToUse = "ar_JO-kareem-medium";
        } else if (langShort === "en") {
          voiceToUse = "en_US-lessac-medium";
        }
      }
    }

    // Cancel existing audio playback
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }

    // Check if Google Translate TTS or Piper Neural Model or API route audio
    const isPiperOrGoogle =
      voiceToUse === "google" ||
      voiceToUse === "google_tts" ||
      voiceToUse?.startsWith("de_") ||
      voiceToUse?.startsWith("ar_") ||
      voiceToUse?.startsWith("en_") ||
      voiceToUse?.includes("medium") ||
      voiceToUse?.includes("high") ||
      voiceToUse?.includes("low") ||
      voiceToUse?.endsWith(".onnx");

    // Helper for WebSpeech fallback if audio endpoint fails or returns non-audio
    const speakViaWebSpeech = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = langIso;
        utterance.rate = speechRate;

        if (voiceToUse && !voiceToUse.includes("google") && !voiceToUse.includes("piper") && voiceToUse !== "webspeech") {
          const matched = availableVoices.find((v) => v.voiceURI === voiceToUse);
          if (matched) utterance.voice = matched;
        } else if (langObj) {
          const langVoice = availableVoices.find((v) =>
            v.lang.toLowerCase().includes(langShort)
          );
          if (langVoice) utterance.voice = langVoice;
        }

        window.speechSynthesis.speak(utterance);
      }
    };

    if (isPiperOrGoogle) {
      const voiceParam = `&voice=${encodeURIComponent(voiceToUse)}`;
      const ttsApiUrl = `/api/tts?text=${encodeURIComponent(textToSpeak)}&lang=${langShort}${voiceParam}`;

      const audio = new Audio(ttsApiUrl);
      audio.playbackRate = speechRate;
      currentAudioRef.current = audio;

      audio.onerror = (e) => {
        console.error("TTS audio playback failed for chosen voice:", voiceToUse, e);
      };
      audio.play().catch((err) => {
        console.error("TTS audio play failed for chosen voice:", voiceToUse, err);
      });
      return;
    }

    // Direct WebSpeech API
    speakViaWebSpeech();
  };

  const handleCreateFlashcardsFromAnalysis = (msgId: string, analysis: CorrectorAnalysis) => {
    if (!onImportCards) return;

    // Convert corrections into flashcards
    const flashcardsToCreate: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak">[] = [];

    if (analysis.corrections && analysis.corrections.length > 0) {
      analysis.corrections.forEach((c) => {
        flashcardsToCreate.push({
          frontText: c.correctedSegment,
          frontLang: activeSession?.targetLanguage === "German" ? "de" : "en",
          backText: `${c.reasonAr} (بدلاً من: ${c.originalSegment})`,
          backLang: "ar",
          translationHint: `تصحيح: ${c.originalSegment} ➔ ${c.correctedSegment}`,
          difficulty: "medium"
        });
      });
    }

    if (analysis.nativeVersion) {
      flashcardsToCreate.push({
        frontText: analysis.nativeVersion,
        frontLang: activeSession?.targetLanguage === "German" ? "de" : "en",
        backText: `الصياغة الاحترافية للعبارة: ${analysis.originalText}`,
        backLang: "ar",
        translationHint: "أسلوب المتحدث الأصلي",
        difficulty: "easy"
      });
    }

    if (analysis.improvedExpressionText) {
      flashcardsToCreate.push({
        frontText: analysis.improvedExpressionText,
        frontLang: activeSession?.targetLanguage === "German" ? "de" : "en",
        backText: `تعبير محصّن ومطور: ${analysis.improvedExpressionExplanationAr || analysis.originalText}`,
        backLang: "ar",
        translationHint: "تحسين التعبير الأسلوبي البليغ",
        difficulty: "medium"
      });
    }

    if (flashcardsToCreate.length === 0) return;

    let targetFolder = selectedTargetFolderId ? selectedTargetFolderId : null;
    let newFolderData = null;

    if (!targetFolder && folders.length === 0) {
      newFolderData = {
        name: `بطاقات تصحيح (${LANGUAGES.find((l) => l.code === activeSession?.targetLanguage)?.label || "اللغة"})`,
        description: `تم إنشاؤها تلقائياً من أخطاء المحادثة`,
        color: "#10b981",
        frontLang: activeSession?.targetLanguage === "German" ? "de" : "en",
        backLang: "ar"
      };
    }

    onImportCards(newFolderData, flashcardsToCreate, targetFolder);
    setImportedSessionId(msgId);
    setShowFolderPickerForMsg(null);
    setTimeout(() => setImportedSessionId(null), 3000);
  };

  const handleMakeCardFromQuotedText = async (quotedText: string) => {
    if (!quotedText || !quotedText.trim() || !onImportCards) return;

    const savedGeminiKey = localStorage.getItem("settings_gemini_api_key") || "";
    const savedGroqKey = localStorage.getItem("settings_groq_api_key") || "";
    const modelToUse = buttonModels.makeCard || selectedModel || "gemini-2.5-flash";
    const langToUse = activeSession?.targetLanguage || targetLanguage || "German";

    try {
      const res = await fetch("/api/ai/make-card-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotedText,
          targetLanguage: langToUse,
          geminiApiKey: savedGeminiKey,
          groqApiKey: savedGroqKey,
          model: modelToUse
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

      // Check if folder named "بطاقات" exists
      const existingFolder = folders.find((f) => f.name && f.name.trim().toLowerCase() === "بطاقات");

      let targetFolderId: string | null = null;
      let newFolderData: Omit<Folder, "id" | "createdAt" | "updatedAt"> | null = null;

      if (existingFolder) {
        targetFolderId = existingFolder.id;
      } else {
        newFolderData = {
          name: "بطاقات",
          description: "", // لا يحتوي أي وصف
          color: "#3b82f6",
          frontLang: langToUse === "German" ? "de" : "en",
          backLang: "ar"
        };
      }

      onImportCards(newFolderData, [cardData], targetFolderId);
      setCardToastMessage(`تمت إضافة البطاقة "${cardData.frontText}" بنجاح إلى مجلد "بطاقات" 🎴`);
      setTimeout(() => setCardToastMessage(null), 3500);
    } catch (err) {
      console.warn("Error creating card from text via AI:", err);
      // Fallback local card creation
      const langShort = langToUse === "German" ? "de" : "en";
      const matchArt = quotedText.trim().match(/^(der|die|das)\s+(.+)$/i);
      const cleanFront = matchArt ? matchArt[2].trim() : quotedText.trim();
      const articleFound = matchArt ? matchArt[1].toLowerCase() : "";

      const fallbackCard: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak"> = {
        frontText: cleanFront,
        frontLang: langShort,
        backText: quotedText.trim(),
        backLang: "ar",
        translationHint: "بطاقة مضافة من النص المقتبس",
        isArticleMode: !!articleFound,
        correctArticle: articleFound,
        frontImage: `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanFront)}%20clear%20photo%20isolated%20educational?width=512&height=512&nologo=true`,
        autoImageCandidates: [`https://image.pollinations.ai/prompt/${encodeURIComponent(cleanFront)}%20clear%20photo%20isolated%20educational?width=512&height=512&nologo=true`],
        difficulty: "medium"
      };

      const existingFolder = folders.find((f) => f.name && f.name.trim().toLowerCase() === "بطاقات");

      let targetFolderId: string | null = null;
      let newFolderData: Omit<Folder, "id" | "createdAt" | "updatedAt"> | null = null;

      if (existingFolder) {
        targetFolderId = existingFolder.id;
      } else {
        newFolderData = {
          name: "بطاقات",
          description: "",
          color: "#3b82f6",
          frontLang: langShort,
          backLang: "ar"
        };
      }

      onImportCards(newFolderData, [fallbackCard], targetFolderId);
      setCardToastMessage(`تمت إضافة البطاقة "${quotedText}" إلى مجلد "بطاقات" 🎴`);
      setTimeout(() => setCardToastMessage(null), 3500);
    }
  };

  const currentLangObj = LANGUAGES.find((l) => l.code === (activeSession?.targetLanguage || targetLanguage)) || LANGUAGES[0];

  return (
    <div className="flex-1 h-full flex flex-col bg-[#f0f2f5] overflow-hidden select-text relative" dir="rtl">
      {/* Toast Alert Notification for Card Creation */}
      {cardToastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-amber-500/50 flex items-center gap-2.5 animate-bounce-short text-xs sm:text-sm font-bold backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{cardToastMessage}</span>
        </div>
      )}
      {/* 1. TOP HEADER BAR - MINIMALIST */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 px-3 py-2 flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Active Conversation Title (Minimalist Click to open sessions list) */}
          <button
            type="button"
            onClick={() => setShowSessionsModal(true)}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-100 text-slate-900 rounded-lg transition-all cursor-pointer group shrink-0 active:scale-95"
            title="انقر لعرض وإدارة المحادثات المخزنة"
          >
            <MessageSquare className="w-4 h-4 text-[#0056f6] shrink-0" />
            <h2 className="font-extrabold text-slate-900 text-sm group-hover:text-[#0056f6] transition-colors whitespace-nowrap">
              {activeSession?.title || "محادثة جديدة"}
            </h2>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0056f6] shrink-0 transition-colors" />
          </button>
        </div>

        {/* Left Actions: Settings Button Only (Icon-Only) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowMobileSettingsMenu(true)}
            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors shrink-0"
            title="إعدادات قسم صحح الشاملة (الموديلات، الصوت، اللغة، والشخصيات)"
          >
            <Sliders className="w-5 h-5 text-[#0056f6]" />
          </button>
        </div>
      </header>

      {/* Sticky Pinned Exercise Header Bar for Steps & Context Visibility */}
      {activeSession && (
        <StickyExerciseHeaderBar session={activeSession} onToggleStep={handleToggleChecklistStep} />
      )}

      {/* Sticky Pinned Sentence Builder Header Bar */}
      {activeSession && (
        <StickySentenceBuilderHeaderBar
          session={activeSession}
          onEditSettings={() => {
            setSentenceLanguageInput(activeSession.targetLanguage || targetLanguage || "German");
            setSentenceTopicInput(activeSession.sentenceTopic || "");
            setSentenceContextInput(activeSession.sentenceContext || "");
            setSentenceGrammarFocusInput(activeSession.sentenceGrammarFocus || "");
            setShowEditSentenceSettingsModal(true);
          }}
          onRequestNewPrompt={() => handleRequestNewSentencePrompt()}
          targetLevel={targetLevel}
        />
      )}

      {/* 2. CHAT CANVAS MESSAGES */}
      <div 
        ref={chatContainerRef}
        onScroll={handleChatScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 select-text"
      >
        {/* Load 10 Earlier Messages Button */}
        {hasMoreMessages && (
          <div className="flex justify-center py-2 animate-fade-in">
            <button
              onClick={handleLoadMoreMessages}
              className="px-4 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0056f6] font-extrabold text-xs rounded-full border border-slate-200/90 hover:border-blue-300 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95"
              title="تحميل 10 رسائل سابقة"
            >
              <ChevronUp className="w-4 h-4 text-[#0056f6]" />
              <span>عرض 10 رسائل أقدم ({totalMsgsCount - visibleMessagesCount} متبقية)</span>
            </button>
          </div>
        )}

        {visibleMessages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center space-y-4 max-w-md mx-auto my-auto p-6 bg-white/80 backdrop-blur-xs rounded-3xl border border-slate-200/80 shadow-xs animate-fade-in">
            <div className="w-16 h-16 rounded-3xl bg-purple-100 text-purple-600 flex items-center justify-center text-3xl shadow-2xs">
              <PersonaAvatarDisplay avatar={activePersona.avatar} name={activePersona.name} sizeClass="w-10 h-10 text-2xl" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-extrabold text-slate-900 text-base">محادثة جديدة ✍️</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                أنت الآن تتحدث مع <span className="font-extrabold text-purple-900">{activePersona.name}</span> ({activePersona.job || "مساعد لغوي"}).
                <br />
                اكتب أي نص باللغة <span className="font-extrabold text-slate-800">{currentLangObj.label} {currentLangObj.flag}</span> في الخانة بالأسفل للتصحيح أو المحادثة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPersonaForNewChat(activePersonaId || personas[0]?.id || "");
                setShowNewChatModal(true);
              }}
              className="mt-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-purple-600/20"
            >
              <Sparkles className="w-4 h-4 text-purple-200" />
              <span>بدء محادثة جديدة (تحديد النوع والشخصية)</span>
            </button>
          </div>
        )}

        {visibleMessages.map((msg) => {
          const isUser = msg.sender === "user";
          const hasAnalysis = !!msg.analysis;

          const msgIdxInAll = allSessionMessages.findIndex((m) => m.id === msg.id);
          const nextAiMsg = msgIdxInAll >= 0 ? allSessionMessages[msgIdxInAll + 1] : null;
          const hasValidAiReply = Boolean(
            nextAiMsg &&
            nextAiMsg.sender === "ai" &&
            (nextAiMsg.personaReply || nextAiMsg.chatReply || nextAiMsg.analysis)
          );

          const isInContextMemory = isUser
            ? hasValidAiReply
            : Boolean(msg.personaReply || msg.chatReply || msg.analysis);

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-start" : "items-end"} animate-fade-in`}
            >
              <div className="flex items-center gap-2 mb-1 px-1 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400">{msg.timestamp}</span>
                <span className="text-[11px] font-extrabold text-slate-800">
                  {isUser ? "أنت" : (msg.aiModelName || getFriendlyModelName(selectedModel))}
                </span>

                {/* VISUAL CONTEXT MEMORY BADGE - DOT ONLY */}
                {isInContextMemory ? (
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-purple-600 border border-purple-300 shadow-2xs inline-block"
                    title="مشمولة في سجل ذاكرة الذكاء 🟣"
                  />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-white border border-slate-400 shadow-2xs inline-block"
                    title="غير مشمولة في السجل ⚪"
                  />
                )}
              </div>

              {/* USER MESSAGE BUBBLE */}
              {isUser && (() => {
                const correctionData: CorrectorAnalysis | null =
                  nextAiMsg?.personaReply?.userCorrection ||
                  nextAiMsg?.analysis ||
                  null;

                const hasCorrectionContent =
                  correctionData &&
                  (correctionData.correctedText || correctionData.explanationAr || correctionData.nativeVersion || correctionData.score !== undefined);

                return (
                  <div className="flex flex-col items-start gap-1.5 max-w-[88%] sm:max-w-[75%]">
                    {/* Message Bubble */}
                    <div 
                      className={`w-full ${
                        msg.sendMode === "correct"
                          ? "bg-emerald-700"
                          : "bg-[#0056f6]"
                      } text-white p-4 rounded-3xl rounded-tr-xs shadow-md text-sm font-medium leading-relaxed whitespace-pre-wrap ${
                        activeSession?.targetLanguage === "Arabic" ? "text-right" : "text-left"
                      }`}
                      dir={activeSession?.targetLanguage === "Arabic" ? "rtl" : "ltr"}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1.5 opacity-90 text-[11px] font-semibold">
                        <div className="flex items-center gap-1.5">
                          {msg.sendMode === "persona" ? (
                            (() => {
                              const matchedPersonaForMsg = [...(activeSession?.exercisePersonas || []), ...personas].find(
                                (p) =>
                                  (msg.personaReply?.personaId && p.id === msg.personaReply.personaId) ||
                                  (msg.personaReply?.personaName && p.name.trim().toLowerCase() === msg.personaReply.personaName.trim().toLowerCase())
                              );
                              const pName = matchedPersonaForMsg?.name || msg.personaReply?.personaName || activePersona.name;
                              const pAvatar = matchedPersonaForMsg?.avatar || msg.personaReply?.personaAvatar || activePersona.avatar || "🎭";
                              return (
                                <span className="flex items-center gap-1.5 text-white/90">
                                  <UserCheck className="w-3.5 h-3.5 text-white/80" />
                                  <span>موجه إلى {pName}</span>
                                  <PersonaAvatarDisplay avatar={pAvatar} name={pName} sizeClass="w-3.5 h-3.5 text-[9px]" />
                                </span>
                              );
                            })()
                          ) : msg.sendMode === "correct" ? (
                            <span className="flex items-center gap-1 text-white/90">
                              <CheckCheck className="w-3.5 h-3.5" /> طلب تصحيح
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-white/90">
                              <MessageSquare className="w-3.5 h-3.5" /> محادثة / سؤال
                            </span>
                          )}
                        </div>

                        {!isInContextMemory && !loading && (
                          <span 
                            className="bg-rose-900/70 text-rose-100 p-1 rounded-full border border-rose-300/40 shadow-2xs inline-flex items-center justify-center"
                            title="فشل الإرسال (تعذر الحصول على رد)"
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
                          </span>
                        )}
                      </div>
                      {msg.text}
                    </div>

                    {/* Correction Button Pill (Positioned right under user bubble) */}
                    {hasCorrectionContent && (() => {
                      const score = correctionData.score;
                      const isHigh = score !== undefined ? score >= 85 : !correctionData.hasErrors;
                      const isMedium = score !== undefined ? score >= 65 && score < 85 : false;

                      const btnBgClass = isHigh
                        ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-300/80"
                        : isMedium
                        ? "bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300/80"
                        : "bg-rose-50 hover:bg-rose-100 text-rose-950 border-rose-300/80";

                      const iconColorClass = isHigh
                        ? "text-emerald-600"
                        : isMedium
                        ? "text-amber-600"
                        : "text-rose-600";

                      const scoreBadgeBg = isHigh
                        ? "bg-emerald-600"
                        : isMedium
                        ? "bg-amber-500"
                        : "bg-rose-500";

                      return (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveCorrectionModalData({
                              corr: correctionData,
                              msgId: msg.id,
                              userText: msg.text,
                              targetLanguage: activeSession?.targetLanguage || targetLanguage
                            })
                          }
                          className={`flex items-center gap-1.5 px-2.5 py-1 ${btnBgClass} border rounded-2xl text-xs font-extrabold cursor-pointer transition-all shadow-2xs active:scale-95 group`}
                          title="عرض تقرير تحليل وتصحيح هذه الجملة"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${iconColorClass} shrink-0`} />
                          {score !== undefined && (
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] text-white font-black shadow-2xs ${scoreBadgeBg}`}>
                              {score}%
                            </span>
                          )}
                          {(correctionData.hasErrors || (score !== undefined && score < 100)) && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="توجد أخطاء" />
                          )}
                        </button>
                      );
                    })()}

                    {/* ORPHANED FAILED MESSAGE ACTION BUTTONS */}
                    {!isInContextMemory && !loading && (
                      <div className="flex items-center gap-2 pt-1 animate-fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            const textToResend = msg.text;
                            const targetSendMode = msg.sendMode || "persona";
                            handleSendMessage(targetSendMode, textToResend, undefined, msg.id);
                          }}
                          className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95 flex items-center justify-center"
                          title="إعادة الإرسال الآن 🔄"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setInputText(msg.text);
                            setEditingMessageId(msg.id);
                            textareaRef.current?.focus();
                          }}
                          className="p-2 bg-white hover:bg-slate-100 text-blue-600 border border-slate-300 rounded-xl transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs"
                          title="تعديل الرسالة وإعادة إرسالها ✏️"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSessions((prev) =>
                              prev.map((s) => {
                                if (s.id !== activeSessionId) return s;
                                const idx = s.messages.findIndex((m) => m.id === msg.id);
                                const filtered = s.messages.filter((m, i) => {
                                  if (m.id === msg.id) return false;
                                  if (idx >= 0 && i === idx + 1 && m.id.startsWith("msg-error-")) return false;
                                  return true;
                                });
                                return { ...s, messages: filtered };
                              })
                            );
                          }}
                          className="p-2 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 rounded-xl transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs"
                          title="حذف الرسالة المعلقة 🗑️"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* AI MESSAGE CARD (SNAPCHAT CARD STYLE) */}
              {!isUser && (
                <div dir="auto" className="w-full max-w-2xl bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-4 text-start">
                  {/* If Persona Reply */}
                  {msg.personaReply && (
                    <PersonaMessageCard
                      msg={msg}
                      personas={[...(activeSession?.exercisePersonas || []), ...personas]}
                      onSpeak={handleSpeakText}
                      onCopy={handleCopyText}
                      isCopied={copiedId === msg.id}
                      onSaveFlashcards={handleCreateFlashcardsFromAnalysis}
                      autoSlideInterval={autoSlideInterval}
                      onCreateCard={handleMakeCardFromQuotedText}
                    />
                  )}

                  {/* If Chat Reply */}
                  {msg.chatReply && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <span className="text-xs sm:text-sm font-black text-[#0056f6] flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-[#0056f6]" />
                          {msg.chatReply.title || "رد وتوضيح الذكاء الاصطناعي 💬"}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSpeakText(msg.chatReply!.replyText, msg.targetLanguage)}
                            className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="نطق الإجابة"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCopyText(msg.chatReply!.replyText, msg.id)}
                            className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                            title="نسخ النص"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-600" />
                                <span className="hidden sm:inline">تم النسخ</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                <span className="hidden sm:inline">نسخ</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <div dir="auto" className="text-slate-950 font-medium text-base sm:text-lg leading-relaxed text-start bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80">
                        <FormattedText text={msg.chatReply.replyText} onSpeak={(t) => handleSpeakText(t, msg.targetLanguage)} onCopy={(t) => handleCopyText(t, msg.id)} onCreateCard={handleMakeCardFromQuotedText} />
                      </div>
                    </div>
                  )}

                  {/* If simple message without analysis, chatReply, or personaReply */}
                  {!hasAnalysis && !msg.chatReply && !msg.personaReply && (
                    <div dir="auto" className="text-slate-950 text-base sm:text-lg leading-relaxed font-medium text-start">
                      <FormattedText text={msg.text} onSpeak={(t) => handleSpeakText(t, msg.targetLanguage)} onCopy={(t) => handleCopyText(t, msg.id)} onCreateCard={handleMakeCardFromQuotedText} />
                    </div>
                  )}

                  {/* RICH ANALYSIS BREAKDOWN CARD */}
                  {hasAnalysis && msg.analysis && (
                    <div className="space-y-4">
                      {/* Top Header Score Badge & Grade */}
                      <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-slate-50 border border-amber-200/80 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-xs ${
                              msg.analysis.score >= 85
                                ? "bg-emerald-600"
                                : msg.analysis.score >= 65
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                          >
                            {msg.analysis.score}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-base">
                                {msg.analysis.gradeLabel}
                              </span>
                              <Award className="w-4 h-4 text-amber-600" />
                            </div>
                            <p className="text-xs text-slate-500 font-semibold">
                              تقييم التعبير الكتابي باللغة {currentLangObj.label} {currentLangObj.flag}
                            </p>
                          </div>
                        </div>

                        {/* Speech Synth Button */}
                        <button
                          onClick={() => handleSpeakText(msg.analysis!.correctedText, msg.targetLanguage)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200/80 text-slate-700 font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
                          title="استماع للنص المصحح"
                        >
                          <Volume2 className="w-4 h-4 text-[#0056f6]" />
                          <span className="hidden sm:inline">نطق النص</span>
                        </button>
                      </div>

                      {/* Clean Corrected Text (النص المصحح الخالي من الأخطاء) */}
                      <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCheck className="w-4 h-4 text-emerald-600" />
                            النص الخالي من الأخطاء (التصحيح النهائي):
                          </span>
                          <button
                            onClick={() => handleCopyText(msg.analysis!.correctedText, msg.id)}
                            className="p-1 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                            title="نسخ النص الخالي من الأخطاء"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="hidden sm:inline">تم النسخ</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">نسخ</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p 
                          className={`text-slate-900 font-bold text-base leading-relaxed whitespace-pre-wrap ${
                            msg.targetLanguage === "Arabic" ? "text-right" : "text-left"
                          }`}
                          dir={msg.targetLanguage === "Arabic" ? "rtl" : "ltr"}
                          style={{ wordBreak: "break-word" }}
                        >
                          {msg.analysis.correctedText}
                        </p>
                      </div>

                      {/* Corrections List Breakdown (الأخطاء والتصويبات) */}
                      {msg.analysis.hasErrors && msg.analysis.corrections.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5 pr-1">
                            <AlertCircle className="w-4 h-4 text-rose-500" />
                            الأخطاء المكتشفة وتوضيح القواعد ({msg.analysis.corrections.length}):
                          </h4>

                          <div className="space-y-2">
                            {msg.analysis.corrections.map((corr, idx) => (
                              <div
                                key={idx}
                                className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2" dir={msg.targetLanguage === "Arabic" ? "rtl" : "ltr"}>
                                    <span className="line-through text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/50 text-left">
                                      {corr.originalSegment}
                                    </span>
                                    <span className="text-slate-400 font-black">➔</span>
                                    <span className="text-emerald-700 font-black bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/50 text-left">
                                      {corr.correctedSegment}
                                    </span>
                                  </div>

                                  <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                                    {corr.type === "grammar"
                                      ? "قواعد"
                                      : corr.type === "spelling"
                                      ? "إملاء"
                                      : corr.type === "vocabulary"
                                      ? "مفردات"
                                      : "أسلوب"}
                                  </span>
                                </div>

                                {corr.reasonAr && (
                                  <>
                                    <div className="w-full border-t border-slate-200/80 my-2" />
                                    <div className="text-slate-800 font-medium leading-relaxed text-xs sm:text-sm bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                                      <FormattedText text={corr.reasonAr} onCreateCard={handleMakeCardFromQuotedText} />
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-xs font-bold text-blue-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                          <span>ممتاز جداً! لم يتم العثور على أي أخطاء إملائية أو نحوية في تعبيرك.</span>
                        </div>
                      )}

                      {/* Native Speaker Version (صياغة المتحدث الأصلي) */}
                      {msg.analysis.nativeVersion && (
                        <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl space-y-1">
                          <span className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                            <Lightbulb className="w-4 h-4 text-amber-600" />
                            طريقة المتحدث الأصلي (Native Phrasing):
                          </span>
                          <p 
                            className={`text-slate-900 font-bold text-sm leading-relaxed whitespace-pre-wrap ${
                              msg.targetLanguage === "Arabic" ? "text-right" : "text-left"
                            }`}
                            dir={msg.targetLanguage === "Arabic" ? "rtl" : "ltr"}
                          >
                            "{msg.analysis.nativeVersion}"
                          </p>
                        </div>
                      )}

                      {/* Improved Expression Section (تحسين التعبير للجملة) */}
                      {msg.analysis.improvedExpressionText && (
                        <div className="p-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-purple-50/50 border border-indigo-200/80 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
                              <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                              تحسين التعبير للجملة (صياغة بليغة متقدمة) 🚀:
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSpeakText(msg.analysis!.improvedExpressionText!, msg.targetLanguage)}
                                className="p-1 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer text-[11px] font-bold flex items-center gap-1"
                                title="نطق التعبير المحسن"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCopyText(msg.analysis!.improvedExpressionText!, `${msg.id}-improved`)}
                                className="p-1 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer text-[11px] font-bold flex items-center gap-1"
                                title="نسخ التعبير المحسن"
                              >
                                {copiedId === `${msg.id}-improved` ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="hidden sm:inline">تم النسخ</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">نسخ</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <p 
                            className={`text-indigo-950 font-black text-base leading-relaxed whitespace-pre-wrap ${
                              msg.targetLanguage === "Arabic" ? "text-right" : "text-left"
                            }`}
                            dir={msg.targetLanguage === "Arabic" ? "rtl" : "ltr"}
                          >
                            {msg.analysis.improvedExpressionText}
                          </p>

                          {msg.analysis.improvedExpressionExplanationAr && (
                            <div className="text-xs text-indigo-900/90 font-medium leading-relaxed pt-1 border-t border-indigo-200/50">
                              💡 <span className="font-bold">سبب التحسين والألوان البلاغية:</span> <FormattedText text={msg.analysis.improvedExpressionExplanationAr} onCreateCard={handleMakeCardFromQuotedText} />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Positive Feedback & Grammar Tip */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {msg.analysis.positiveFeedbackAr && (
                          <div className="p-3 bg-violet-50/70 border border-violet-200/60 rounded-2xl">
                            <span className="font-bold text-violet-900 block mb-0.5">✨ نقاط القوة:</span>
                            <div className="text-slate-700 font-medium leading-snug">
                              <FormattedText text={msg.analysis.positiveFeedbackAr} onCreateCard={handleMakeCardFromQuotedText} />
                            </div>
                          </div>
                        )}

                        {msg.analysis.grammarSummaryAr && (
                          <div className="p-3 bg-sky-50/70 border border-sky-200/60 rounded-2xl">
                            <span className="font-bold text-sky-900 block mb-0.5">📚 قاعدة هامة للذكر:</span>
                            <div className="text-slate-700 font-medium leading-snug">
                              <FormattedText text={msg.analysis.grammarSummaryAr} onCreateCard={handleMakeCardFromQuotedText} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Flashcard Import Action Button */}
                      {onImportCards && (
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                          {importedSessionId === msg.id ? (
                            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              تمت إضافة البطاقات إلى مكتبتك بنجاح! 🎉
                            </span>
                          ) : showFolderPickerForMsg === msg.id ? (
                            <div className="flex items-center gap-2 w-full flex-wrap">
                              <select
                                value={selectedTargetFolderId}
                                onChange={(e) => setSelectedTargetFolderId(e.target.value)}
                                className="bg-slate-100 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none"
                              >
                                <option value="">المجلد الرئيسي (المكتبة)</option>
                                {folders.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    📁 {f.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleCreateFlashcardsFromAnalysis(msg.id, msg.analysis!)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                              >
                                حفظ الآن
                              </button>
                              <button
                                onClick={() => setShowFolderPickerForMsg(null)}
                                className="px-2 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (folders.length > 0) {
                                  setShowFolderPickerForMsg(msg.id);
                                } else {
                                  handleCreateFlashcardsFromAnalysis(msg.id, msg.analysis!);
                                }
                              }}
                              className="w-auto px-3 sm:px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                              title="حفظ الأخطاء كبطاقات استذكار في المكتبة"
                            >
                              <BookOpen className="w-4 h-4 text-amber-400" />
                              <span className="hidden sm:inline">حفظ الأخطاء كبطاقات استذكار في المكتبة 📥</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* LOADING INDICATOR */}
        {loading && (
          <div className="flex flex-col items-end animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs flex items-center gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-[#0056f6] border-t-transparent animate-spin" />
              <span className="text-xs font-bold text-slate-700">جاري فحص وتصحيح النص بالذكاء الاصطناعي...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* 4. SNAPCHAT FLOATING INPUT BAR WITH ACTION BUTTONS ON THE LEFT */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shadow-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage("persona");
          }}
          className="max-w-5xl mx-auto flex flex-col gap-2"
        >
          {editingMessageId && (
            <div className="flex items-center justify-between bg-blue-50/90 border border-blue-200 px-3.5 py-2 rounded-xl text-xs font-bold text-blue-900 animate-fade-in">
              <span className="flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>جاري تعديل الرسالة... (عند الإرسال ستُحدّث نفس الرسالة)</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingMessageId(null);
                  setInputText("");
                }}
                className="p-1 hover:bg-blue-100 rounded-lg text-blue-600 cursor-pointer transition-colors"
                title="إلغاء التعديل"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch gap-2.5 sm:gap-4">
            <div className="relative flex-1 flex flex-col">
              {isTranscribingAudio && (
                <div className="mb-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-between shadow-lg animate-pulse">
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
                    <span>⚡ جاري تحليل وتحويل تسجيلك الصوتي بنجاح عبر الذكاء الاصطناعي...</span>
                  </span>
                </div>
              )}

              {isListening ? (
                /* INSTANT WEB SPEECH DIRECT DICTATION PANEL */
                <div className="w-full bg-slate-900 text-white p-3.5 sm:p-4 rounded-2xl border-2 border-red-500/80 shadow-2xl flex flex-col gap-3 animate-fadeIn">
                  {/* Header & Control Bar */}
                  <div className="flex items-center justify-between gap-2.5 flex-wrap">
                    {/* Live Mic Indicator + Timer */}
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3.5 w-3.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                      </span>
                      <span className="font-mono text-base font-black text-red-400 tracking-wider">
                        {formatAudioTime(listeningSeconds)}
                      </span>
                      <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1">
                        <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                        <span>تسجيل وإملاء صوتي ({currentLangObj.flag} {currentLangObj.label})</span>
                      </span>
                    </div>

                    {/* ANIMATED WAVEFORM VISUALIZER */}
                    <div className="flex items-center gap-1 h-7 px-3 bg-slate-800/90 rounded-xl border border-slate-700/80 shadow-inner">
                      {[12, 22, 16, 26, 14, 24, 10, 20, 18, 25].map((h, idx) => (
                        <div
                          key={idx}
                          className="w-1.5 rounded-full bg-gradient-to-t from-red-500 via-pink-400 to-amber-300 animate-[bounce_0.8s_infinite]"
                          style={{
                            height: `${h}px`,
                            animationDelay: `${(idx % 5) * 0.15}s`
                          }}
                        />
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-indigo-600/40 hover:bg-indigo-600/70 text-indigo-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 border border-indigo-500/40 transition-all"
                        title="فتح التطبيق في تبويب جديد مستقل لضمان منح إذن الميكروفون"
                      >
                        <Globe className="w-3.5 h-3.5 text-indigo-300" />
                        <span className="hidden sm:inline">تبويب جديد ↗</span>
                      </a>

                      <button
                        type="button"
                        onClick={cancelSpeechToText}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-white rounded-xl text-xs font-extrabold flex items-center gap-1 border border-red-500/30 transition-all cursor-pointer"
                        title="إلغاء الإملاء والتراجع عن التسجيل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>إلغاء 🗑️</span>
                      </button>

                      <button
                        type="button"
                        onClick={toggleSpeechToText}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
                        title="إيقاف التسجيل وتحويل صوتك إلى نص عبر السيرفر"
                      >
                        <Check className="w-4 h-4" />
                        <span>تثبيت وإنهاء ✅</span>
                      </button>
                    </div>
                  </div>

                  {/* Status & Live Preview Text Box */}
                  <div className="bg-slate-800/90 rounded-xl p-3 text-sm text-slate-100 border border-slate-700 flex flex-col gap-1 min-h-[52px]">
                    <div className="flex items-center justify-between text-2xs text-slate-400 border-b border-slate-700/60 pb-1 mb-1">
                      <span className="font-bold text-amber-300 flex items-center gap-1">
                        <span>🎙️ الميكروفون يستمع حالياً... تحدث بوضوح باللغة {currentLangObj.label}</span>
                      </span>
                      <span>{currentLangObj.flag} {currentLangObj.label}</span>
                    </div>

                    {inputText ? (
                      <div className="font-extrabold text-emerald-300 leading-relaxed break-words">
                        {inputText}
                        {speechInterimText && (
                          <span className="text-amber-300 italic animate-pulse mr-1 font-semibold">
                            {" "}[{speechInterimText}...]
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 font-medium italic flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                        <span>تحدث الآن بصوتك... سينكتب كلامك فوراً، وعند الضغط على (تثبيت وإنهاء) سيقوم الذكاء الاصطناعي بتحليله وتحويله بدقة 100%!</span>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative w-full flex-1">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSendMessage("persona");
                      }
                    }}
                    placeholder={`اكتب أو اضغط زر الإملاء الصوتي للتحدث باللغة ${currentLangObj.label} ${currentLangObj.flag} هنا...`}
                    rows={2}
                    disabled={loading}
                    dir={currentLangObj.code === "Arabic" ? "rtl" : "ltr"}
                    className={`w-full min-h-[72px] sm:min-h-[118px] sm:h-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-900 font-extrabold text-base sm:text-lg p-3 sm:p-3.5 ${
                      currentLangObj.code === "Arabic" ? "pr-3 pl-12 sm:pl-14" : "pl-12 sm:pl-14 pr-3"
                    } rounded-2xl border border-slate-300 focus:border-[#0056f6] focus:outline-none focus:ring-2 focus:ring-[#0056f6]/30 transition-all resize-none placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs sm:placeholder:text-sm leading-relaxed ${
                      currentLangObj.code === "Arabic" ? "text-right" : "text-left"
                    }`}
                  />

                  {/* INSTANT DIRECT SPEECH MIC BUTTON */}
                  <button
                    type="button"
                    onClick={toggleSpeechToText}
                    className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 px-3 py-2 sm:px-3.5 sm:py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white font-extrabold text-xs rounded-xl shadow-md shadow-purple-600/25 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer select-none"
                    title="إملاء صوتي مباشر (تحويل الكلام إلى نص فوراً عبر Google)"
                  >
                    <Mic className="w-4 h-4 text-white animate-pulse" />
                    <span className="hidden sm:inline">إملاء صوتي 🎙️</span>
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons: Horizontal Row-Reverse on Mobile (Persona on Left), Vertical Stack on Desktop */}
            {activeSession?.chatType === "sentence_builder" ? (
              <div className="flex flex-row sm:flex-col gap-1.5 w-full sm:w-36 shrink-0 sm:justify-between">
                {/* 1. Correct Button */}
                <button
                  type="button"
                  disabled={!inputText.trim() || loading}
                  onClick={() => handleSendMessage("sentence_builder")}
                  className="flex-1 sm:w-full h-10 sm:h-9 px-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1 shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer select-none"
                  title="تصحيح الجملة وتقييم القواعد والمعنى حسب الموضوع والسياق والقاعدة المطلوبين"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-100 shrink-0" />
                  <span>تصحيح ✍️</span>
                </button>

                {/* 2. Question Button */}
                <button
                  type="button"
                  disabled={!inputText.trim() || loading}
                  onTouchStart={() => handleButtonTouchStart("chat")}
                  onTouchEnd={handleButtonTouchEnd}
                  onTouchMove={handleButtonTouchEnd}
                  onMouseDown={() => handleButtonTouchStart("chat")}
                  onMouseUp={handleButtonTouchEnd}
                  onMouseLeave={handleButtonTouchEnd}
                  onClick={(e) => handleButtonClick(e, "chat")}
                  onContextMenu={(e) => handleButtonContextMenu(e, "chat")}
                  className="flex-1 sm:w-full h-10 sm:h-9 px-2 bg-[#0056f6] hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1 shadow-md shadow-blue-600/20 transition-all active:scale-95 cursor-pointer select-none"
                  title="طرح سؤال واستفسار حول القاعدة أو المفردات"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-blue-100 shrink-0" />
                  <span>سؤال 💬</span>
                </button>

                {/* 3. Another Sentence Prompt Button */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleRequestNewSentencePrompt()}
                  className="flex-1 sm:w-full h-10 sm:h-9 px-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:bg-slate-300 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1 shadow-md shadow-purple-600/20 transition-all active:scale-95 cursor-pointer select-none"
                  title="الحصول على جملة أخرى جديدة لتكوينها"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-purple-200 shrink-0" />
                  <span className="truncate">جملة أخرى 🔄</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-row-reverse sm:flex-col gap-1.5 w-full sm:w-36 shrink-0 sm:justify-between">
                {/* 1. Purple Persona Reply / Exercise Send Button (Left on Mobile, Top on Desktop) */}
                {activeSession?.chatType === "exercise" ? (
                  <button
                    type="button"
                    disabled={!inputText.trim() || loading}
                    onClick={(e) => handleButtonClick(e, "persona")}
                    className="flex-1 sm:w-full h-10 sm:h-9 px-2 sm:px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-md shadow-purple-600/20 transition-all active:scale-95 cursor-pointer select-none"
                    title="إرسال الرسالة ومتابعة سيناريو التمرين مع شخصيات الذكاء الاصطناعي"
                  >
                    <Send className="w-3.5 h-3.5 text-purple-100 shrink-0" />
                    <span className="truncate">إرسال 🚀</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!inputText.trim() || loading}
                    onTouchStart={() => handleButtonTouchStart("persona")}
                    onTouchEnd={handleButtonTouchEnd}
                    onTouchMove={handleButtonTouchEnd}
                    onMouseDown={() => handleButtonTouchStart("persona")}
                    onMouseUp={handleButtonTouchEnd}
                    onMouseLeave={handleButtonTouchEnd}
                    onClick={(e) => handleButtonClick(e, "persona")}
                    onContextMenu={(e) => handleButtonContextMenu(e, "persona")}
                    className="flex-1 sm:w-full h-10 sm:h-9 px-2 sm:px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-md shadow-purple-600/20 transition-all active:scale-95 cursor-pointer select-none"
                    title={`الرد كمحادثة واقعية بشخصية (${activePersona.name}) - ضغطة مطولة أو كليك يمين للوصول السريع`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-purple-100 shrink-0" />
                    <span className="truncate">لـ {activePersona.name}</span>
                  </button>
                )}

                {/* 2. Blue Chat/Question Button (Middle) */}
                <button
                  type="button"
                  disabled={!inputText.trim() || loading}
                  onTouchStart={() => handleButtonTouchStart("chat")}
                  onTouchEnd={handleButtonTouchEnd}
                  onTouchMove={handleButtonTouchEnd}
                  onMouseDown={() => handleButtonTouchStart("chat")}
                  onMouseUp={handleButtonTouchEnd}
                  onMouseLeave={handleButtonTouchEnd}
                  onClick={(e) => handleButtonClick(e, "chat")}
                  onContextMenu={(e) => handleButtonContextMenu(e, "chat")}
                  className="flex-1 sm:w-full h-10 sm:h-9 px-2 sm:px-3 bg-[#0056f6] hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-md shadow-blue-600/20 transition-all active:scale-95 cursor-pointer select-none"
                  title="اضغط للارسال بالموديل الافتراضي، أو ضغطة مطولة / كليك يمين للوصول السريع للموديلات"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-blue-100 shrink-0" />
                  <span>سؤال</span>
                </button>

                {/* 3. Green Correct Button (Right on Mobile, Bottom on Desktop) */}
                <button
                  type="button"
                  disabled={!inputText.trim() || loading}
                  onTouchStart={() => handleButtonTouchStart("correct")}
                  onTouchEnd={handleButtonTouchEnd}
                  onTouchMove={handleButtonTouchEnd}
                  onMouseDown={() => handleButtonTouchStart("correct")}
                  onMouseUp={handleButtonTouchEnd}
                  onMouseLeave={handleButtonTouchEnd}
                  onClick={(e) => handleButtonClick(e, "correct")}
                  onContextMenu={(e) => handleButtonContextMenu(e, "correct")}
                  className="flex-1 sm:w-full h-10 sm:h-9 px-2 sm:px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer select-none"
                  title="اضغط للارسال بالموديل الافتراضي، أو ضغطة مطولة / كليك يمين للوصول السريع للموديلات"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-100 shrink-0" />
                  <span>تصحيح</span>
                </button>
              </div>
            )}
          </div>

          {/* GERMAN UMLAUTS & ACCENT KEYBOARD BAR - AT THE BOTTOM, ALIGNED WITH TEXTAREA LEFT EDGE */}
          <div className="hidden sm:flex flex-row items-center gap-4 pt-1.5">
            <div dir="ltr" className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar justify-start">
              {(SPECIAL_CHARS[currentLangObj.code] || SPECIAL_CHARS["German"]).map((char) => (
                <button
                  key={char}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleInsertChar(char)}
                  className="min-w-[34px] h-7 px-1.5 bg-slate-100 hover:bg-blue-50 hover:border-blue-400 border border-slate-300 active:border-blue-600 text-slate-900 font-black text-xs rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center justify-center font-mono select-none shrink-0"
                  title={`إضافة الحرف '${char}' للجملة بدون فقدان التركيز`}
                >
                  {char}
                </button>
              ))}
            </div>
            <div className="w-36 shrink-0" />
          </div>
        </form>
      </div>

      {/* 4.5. GENERAL SETTINGS & APP/PERSONA SETTINGS MENU MODAL */}
      {showMobileSettingsMenu && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowMobileSettingsMenu(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Menu Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-50 text-[#0056f6] flex items-center justify-center font-bold shadow-xs">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">إعدادات قسم صحح</h3>
                  <p className="text-xs text-slate-500 font-medium">الإعدادات العامة وإعدادات التطبيق والشخصيات</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileSettingsMenu(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu Options List */}
            <div className="space-y-4 pt-1 flex-1 overflow-y-auto custom-scrollbar pr-0.5">
              {/* SECTION 1: الإعدادات العامة */}
              <div className="space-y-2">
                <div className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>الإعدادات العامة (General Settings)</span>
                </div>

                {/* Option: Quick Model Access */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileSettingsMenu(false);
                    setShowQuickAccessModal(true);
                  }}
                  className="w-full p-3.5 bg-amber-50/80 hover:bg-amber-100/90 border border-amber-200/90 rounded-2xl flex items-center justify-between gap-3 text-right transition-all cursor-pointer active:scale-98 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-amber-200/70 flex items-center justify-center text-amber-800 shrink-0 shadow-2xs">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-amber-950 flex items-center gap-1.5 flex-wrap">
                        <span>الوصول للموديلات بسرعة</span>
                        <span className="text-[10px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                          {quickAccessModels.length} / 5 موديلات
                        </span>
                      </div>
                      <div className="text-xs text-amber-800/80 font-medium mt-0.5">
                        تحديد الموديلات التي تظهر بالقائمة السريعة عند الضغط المطول أو الكليك يمين
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-amber-600 shrink-0" />
                </button>
              </div>

              {/* SECTION 2: إعدادات التطبيق والشخصيات */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 px-1 pt-1">
                  <Sliders className="w-3.5 h-3.5 text-[#0056f6]" />
                  <span>إعدادات التطبيق والشخصيات</span>
                </div>

                {/* Option 0: Button Models Assignment Modal Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileSettingsMenu(false);
                    setShowButtonModelsModal(true);
                  }}
                  className="w-full p-3.5 bg-indigo-50/80 hover:bg-indigo-100/90 border border-indigo-200/90 rounded-2xl flex items-center justify-between gap-3 text-right transition-all cursor-pointer active:scale-98 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-200/70 flex items-center justify-center text-indigo-800 shrink-0 shadow-2xs">
                      <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-indigo-950 flex items-center gap-1.5 flex-wrap">
                        <span>تحديد موديلات الأزرار</span>
                        <span className="text-[10px] font-black bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full">
                          مُخصص لكل زر
                        </span>
                      </div>
                      <div className="text-xs text-indigo-800/80 font-medium mt-0.5">
                        تعيين موديل ذكاء اصطناعي خاص لكل زر (تصحيح، سؤال، شخصية، وتحليل السيناريو)
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-indigo-600 shrink-0" />
                </button>

                {/* Option 1: Language & Level Modal Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileSettingsMenu(false);
                    setShowLangLevelModal(true);
                  }}
                  className="w-full p-3.5 bg-blue-50/80 hover:bg-blue-100/90 border border-blue-200/90 rounded-2xl flex items-center justify-between gap-3 text-right transition-all cursor-pointer active:scale-98 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-blue-200/70 flex items-center justify-center text-[#0056f6] shrink-0 shadow-2xs">
                      <Languages className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-blue-950 flex items-center gap-1.5 flex-wrap">
                        <span>لغة ومستوى المحادثة</span>
                        <span className="text-[10px] font-black bg-blue-200 text-blue-900 px-2 py-0.5 rounded-full">
                          {currentLangObj.flag} {currentLangObj.label} ({targetLevel})
                        </span>
                      </div>
                      <div className="text-xs text-blue-800/80 font-medium mt-0.5">
                        تعديل اللغة المستهدفة والتصحيح ومستوى (CEFR)
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-blue-600 shrink-0" />
                </button>

                {/* Option 2: Current Conversation Persona Selection */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileSettingsMenu(false);
                    setShowSimplePersonaModal(true);
                  }}
                  className="w-full p-3.5 bg-purple-50/80 hover:bg-purple-100/90 border border-purple-200/90 rounded-2xl flex items-center justify-between gap-3 text-right transition-all cursor-pointer active:scale-98 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <PersonaAvatarDisplay avatar={activePersona.avatar} name={activePersona.name} sizeClass="w-11 h-11 text-2xl" />
                    <div>
                      <div className="font-extrabold text-sm text-purple-950 flex items-center gap-1.5 flex-wrap">
                        <span>شخصية المحادثة الحالية</span>
                        <span className="text-[10px] font-black bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full">
                          {activePersona.name}
                        </span>
                      </div>
                      <div className="text-xs text-purple-800/80 font-medium mt-0.5">
                        اختر المتحدث الحالي للمحادثة ({activePersona.job || "شخصية تفاعلية"})
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-purple-600 shrink-0" />
                </button>

                {/* Option 3: Chat & Voice Settings */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileSettingsMenu(false);
                    setShowSettingsModal(true);
                  }}
                  className="w-full p-3.5 bg-emerald-50/80 hover:bg-emerald-100/90 border border-emerald-200/90 rounded-2xl flex items-center justify-between gap-3 text-right transition-all cursor-pointer active:scale-98 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-200/70 flex items-center justify-center text-emerald-800 shrink-0 shadow-2xs">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-emerald-950">
                        إعدادات الصوت وموديل الذكاء
                      </div>
                      <div className="text-xs text-emerald-800/80 font-medium mt-0.5">
                        تعديل سرعة الصوت، اختيار الصوت، وموديل الذكاء الاصطناعي
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-emerald-600 shrink-0" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMobileSettingsMenu(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* 4.6. DEDICATED QUICK MODEL ACCESS SETTINGS MODAL */}
      {showQuickAccessModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowQuickAccessModal(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <Zap className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">الوصول للموديلات بسرعة</h3>
                  <p className="text-xs text-slate-500 font-medium">اختر حتى 5 موديلات تظهر بضغطة مطولة أو كليك يمين</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAccessModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Access Info & Counter Badge */}
            <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200/80 flex items-center justify-between gap-3 text-xs shrink-0">
              <div className="space-y-0.5">
                <div className="font-extrabold text-amber-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>كيف تعمل الموديلات السريعة؟</span>
                </div>
                <div className="text-[11px] text-amber-800 font-medium">
                  عند الضغط المطول (على الموبايل) أو الكليك يمين (على الكمبيوتر) على أزرار التنفيذ، تظهر هذه القائمة لتشغيل الموديل لهذه المرة فقط.
                </div>
              </div>
              <div className="bg-amber-200 text-amber-950 font-black px-3 py-1.5 rounded-xl shrink-0 text-center text-xs shadow-2xs">
                {quickAccessModels.length} / 5
              </div>
            </div>

            {/* Models Selection List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
              {ALL_AVAILABLE_MODELS.map((m) => {
                const isSelected = quickAccessModels.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        if (quickAccessModels.length <= 1) return;
                        setQuickAccessModels(quickAccessModels.filter((k) => k !== m.key));
                      } else {
                        if (quickAccessModels.length >= 5) return;
                        setQuickAccessModels([...quickAccessModels, m.key]);
                      }
                    }}
                    className={`w-full p-3.5 rounded-2xl border transition-all text-right flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-amber-50/90 border-amber-400 ring-2 ring-amber-400/30 shadow-2xs"
                        : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-400"
                      }`}>
                        {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : <div className="w-2 h-2 rounded-full bg-slate-400" />}
                      </div>
                      <div>
                        <div className="font-extrabold text-xs text-slate-900 flex items-center gap-2">
                          <span>{m.name}</span>
                          <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">
                            {m.badge}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {m.desc}
                        </div>
                      </div>
                    </div>

                    <span className={`text-xs font-black px-2.5 py-1 rounded-xl shrink-0 ${
                      isSelected ? "bg-amber-200 text-amber-900" : "text-slate-400 bg-slate-100"
                    }`}>
                      {isSelected ? "مضاف بالسريعة" : "+ إضافة"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowQuickAccessModal(false)}
                className="w-full py-3 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-98 cursor-pointer"
              >
                حفظ الموديلات السريعة ✨
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4.7. QUICK MODEL ACCESS EXECUTION POPUP */}
      {showQuickModelMenu && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowQuickModelMenu(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shadow-xs shrink-0 ${
                  quickMenuAction === "correct"
                    ? "bg-emerald-100 text-emerald-800"
                    : quickMenuAction === "chat"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-purple-100 text-purple-800"
                }`}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {quickMenuAction === "correct"
                      ? "قائمة التنفيذ السريع: زر تصحيح 🟢"
                      : quickMenuAction === "chat"
                      ? "قائمة التنفيذ السريع: زر سؤال 🔵"
                      : `قائمة التنفيذ السريع: زر لـ ${activePersona.name} 🟣`}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">اختر الموديل للتنفيذ به لهذه المرة فقط</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickModelMenu(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TOP SECTION: Primary Default Model for this Button */}
            {(() => {
              const defaultModelKey = buttonModels[quickMenuAction] || selectedModel;
              const defaultModelObj = ALL_AVAILABLE_MODELS.find((m) => m.key === defaultModelKey);
              const defaultName = defaultModelObj ? defaultModelObj.name : getFriendlyModelName(defaultModelKey);

              return (
                <div className="p-3.5 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50/50 border-2 border-amber-300 rounded-2xl space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      الموديل الأساسي الافتراضي للزر:
                    </span>
                    <span className="text-[10px] font-black bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md">
                      الأساسي 📌
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickModelMenu(false);
                      handleSendMessage(quickMenuAction, undefined, defaultModelKey);
                    }}
                    className="w-full p-3 bg-white hover:bg-amber-100/80 border border-amber-300 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer shadow-xs active:scale-98 text-right"
                  >
                    <div>
                      <div className="font-extrabold text-xs text-slate-900">
                        {defaultName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                        إرسال بالموديل المعين مسبقاً لهذا الزر
                      </div>
                    </div>
                    <span className="text-xs font-black text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg shrink-0">
                      تنفيذ بالأساسي 📌
                    </span>
                  </button>
                </div>
              );
            })()}

            {/* Quick Access Models List */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-black text-slate-700 block">
                ⚡ موديلات الوصول السريع المحددة (تنفيذ لمرة واحدة):
              </label>

              {quickAccessModels.map((mKey) => {
                const modelObj = ALL_AVAILABLE_MODELS.find((m) => m.key === mKey);
                const mName = modelObj ? modelObj.name : getFriendlyModelName(mKey);
                const mDesc = modelObj ? modelObj.desc : "";

                return (
                  <button
                    key={mKey}
                    type="button"
                    onClick={() => {
                      setShowQuickModelMenu(false);
                      handleSendMessage(quickMenuAction, undefined, mKey);
                    }}
                    className="w-full p-3 bg-slate-50 hover:bg-blue-50/80 border border-slate-200/90 hover:border-blue-300 rounded-2xl flex items-center justify-between gap-3 text-right transition-all cursor-pointer active:scale-98 shadow-xs group"
                  >
                    <div>
                      <div className="font-extrabold text-xs text-slate-900 group-hover:text-[#0056f6] transition-colors flex items-center gap-1.5">
                        <span>{mName}</span>
                      </div>
                      {mDesc && (
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {mDesc}
                        </div>
                      )}
                    </div>

                    <span className="text-[11px] font-bold bg-white group-hover:bg-[#0056f6] text-slate-700 group-hover:text-white px-2.5 py-1 rounded-xl border border-slate-200/80 group-hover:border-blue-600 shrink-0 transition-all shadow-2xs">
                      تنفيذ الآن ⚡
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowQuickModelMenu(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer mt-2"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* 4.8. SIMPLE PERSONA SELECTION MODAL */}
      {showSimplePersonaModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowSimplePersonaModal(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-900 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <UserCheck className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">شخصية المحادثة الحالية 🎭</h3>
                  <p className="text-xs text-slate-500 font-medium">اختر المتحدث الحالي للمحادثة بضغطة واحدة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSimplePersonaModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simple Persona List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 custom-scrollbar">
              {personas.map((p) => {
                const isActive = p.id === activePersonaId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      handleSelectPersonaForSession(p.id);
                      setShowSimplePersonaModal(false);
                    }}
                    className={`w-full p-3.5 rounded-2xl border transition-all text-right flex items-center justify-between gap-3 cursor-pointer ${
                      isActive
                        ? "bg-purple-50/90 border-purple-400 ring-2 ring-purple-500/30 shadow-xs"
                        : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PersonaAvatarDisplay avatar={p.avatar} name={p.name} sizeClass="w-12 h-12 text-2xl" />
                      <div className="min-w-0">
                        <div className="font-extrabold text-sm text-slate-900 truncate flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {isActive && (
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                              النشط الآن
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-purple-700 truncate mt-0.5">
                          {p.job || "شخصية محادثة"}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isActive ? (
                        <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full border-2 border-slate-300 hover:border-purple-400" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowSimplePersonaModal(false);
                  setShowPersonaModal(true);
                }}
                className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-3.5 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Sliders className="w-4 h-4" />
                <span>إدارة الشخصيات وإضافة جديدة...</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSimplePersonaModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4.5.5. DEDICATED LANGUAGE & LEVEL SETTINGS MODAL */}
      {showLangLevelModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowLangLevelModal(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9.5 h-9.5 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold shadow-xs">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">لغة ومستوى المحادثة</h3>
                  <p className="text-xs text-slate-500 font-medium">تخصيص اللغة المستهدفة ومستوى التصحيح (CEFR)</p>
                </div>
              </div>
              <button
                onClick={() => setShowLangLevelModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              {/* Target Language Selection */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Languages className="w-4 h-4 text-amber-600" />
                  <span>اختر اللغة المستهدفة لممارسة المحادثة</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map((lang) => {
                    const isSelected = (activeSession?.targetLanguage || targetLanguage) === lang.code;
                    return (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setTargetLanguage(lang.code);
                          handleCreateNewSession(lang.code);
                        }}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? "bg-[#0056f6] text-white shadow-md ring-2 ring-blue-300"
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{lang.flag}</span>
                          <span>{lang.label}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CEFR Level Selection */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <span>اختر مستوى الصعوبة والقواعد (CEFR)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CEFR_LEVELS.map((lvl) => {
                    const isSelected = targetLevel === lvl.code;
                    return (
                      <button
                        key={lvl.code}
                        onClick={() => {
                          setTargetLevel(lvl.code);
                          try {
                            localStorage.setItem("ai_corrector_target_level", lvl.code);
                          } catch (err) {}
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl text-center transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300"
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80"
                        }`}
                      >
                        <span className="font-black text-xs">{lvl.code}</span>
                        <span className={`text-[10px] mt-0.5 truncate max-w-full ${isSelected ? "text-emerald-100 font-extrabold" : "text-slate-500 font-medium"}`}>
                          {lvl.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Save / Close Button */}
            <button
              onClick={() => setShowLangLevelModal(false)}
              className="w-full py-3 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-98 cursor-pointer mt-3"
            >
              حفظ وإغلاق
            </button>
          </div>
        </div>
      )}

      {/* 4.5.6. DEDICATED BUTTON MODELS SETTINGS MODAL */}
      {showButtonModelsModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowButtonModelsModal(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9.5 h-9.5 rounded-2xl bg-indigo-50 text-indigo-800 flex items-center justify-center font-bold shadow-xs">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">تحديد موديلات الأزرار</h3>
                  <p className="text-xs text-slate-500 font-medium">اختر لكل زر الموديل الأنسب لأداء مهمته</p>
                </div>
              </div>
              <button
                onClick={() => setShowButtonModelsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3.5">
              {/* Button 1: Correct Button */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                      <CheckCheck className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-xs text-slate-900">زر "تصحيح" 🟢</span>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                    {getFriendlyModelName(buttonModels.correct)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">مخصص لفحص النص، القواعد، إعطاء التقييمات واكتشاف الأخطاء.</p>
                <select
                  value={buttonModels.correct}
                  onChange={(e) => setButtonModels((prev) => ({ ...prev, correct: e.target.value }))}
                  className="w-full bg-white text-slate-900 font-extrabold text-xs px-3 py-2 rounded-xl border border-emerald-300 focus:outline-none cursor-pointer"
                >
                  <optgroup label="🔥 الموديلات ذات الطلبات الكثيرة (500 RPD)">
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite ⚡ (10 RPM)</option>
                  </optgroup>
                  <optgroup label="✨ النماذج العامة والمتقدمة">
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash ⚡ (أحدث معالجة - موصى به)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash ⚡ (مستقر)</option>
                    <option value="groq-llama-3.3-70b">Groq Llama 3.3 70B 🚀 (فائق السرعة)</option>
                    <option value="grok-2">Grok 2 🤖 (تفاعلي)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ⚡ (خفيف)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro 💎 (تحليل عميق)</option>
                  </optgroup>
                </select>
              </div>

              {/* Button 2: Question / Chat Button */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#0056f6] text-white flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-xs text-slate-900">زر "سؤال" 🔵</span>
                  </div>
                  <span className="text-[10px] font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                    {getFriendlyModelName(buttonModels.chat)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">مخصص للأسئلة الشارحة المباشرة، الاستفسارات والتوضيحات.</p>
                <select
                  value={buttonModels.chat}
                  onChange={(e) => setButtonModels((prev) => ({ ...prev, chat: e.target.value }))}
                  className="w-full bg-white text-slate-900 font-extrabold text-xs px-3 py-2 rounded-xl border border-blue-300 focus:outline-none cursor-pointer"
                >
                  <optgroup label="🔥 الموديلات ذات الطلبات الكثيرة (500 RPD)">
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite ⚡ (10 RPM)</option>
                  </optgroup>
                  <optgroup label="✨ النماذج العامة والمتقدمة">
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash ⚡ (أحدث معالجة - موصى به)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash ⚡ (مستقر)</option>
                    <option value="groq-llama-3.3-70b">Groq Llama 3.3 70B 🚀 (فائق السرعة)</option>
                    <option value="grok-2">Grok 2 🤖 (تفاعلي)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ⚡ (خفيف)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro 💎 (تحليل عميق)</option>
                  </optgroup>
                </select>
              </div>

              {/* Button 3: Persona Reply Button */}
              <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-center">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-xs text-slate-900">زر "الشخصية" 🟣</span>
                  </div>
                  <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md">
                    {getFriendlyModelName(buttonModels.persona)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">مخصص للحوار البلاغي والتفاعلي الواقعي بشخصية الذكاء الاصطناعي.</p>
                <select
                  value={buttonModels.persona}
                  onChange={(e) => setButtonModels((prev) => ({ ...prev, persona: e.target.value }))}
                  className="w-full bg-white text-slate-900 font-extrabold text-xs px-3 py-2 rounded-xl border border-purple-300 focus:outline-none cursor-pointer"
                >
                  <optgroup label="🔥 الموديلات ذات الطلبات الكثيرة (500 RPD)">
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite ⚡ (10 RPM)</option>
                  </optgroup>
                  <optgroup label="✨ النماذج العامة والمتقدمة">
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash ⚡ (أحدث معالجة - موصى به)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash ⚡ (مستقر)</option>
                    <option value="groq-llama-3.3-70b">Groq Llama 3.3 70B 🚀 (فائق السرعة)</option>
                    <option value="grok-2">Grok 2 🤖 (تفاعلي)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ⚡ (خفيف)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro 💎 (تحليل عميق)</option>
                  </optgroup>
                </select>
              </div>

              {/* Button 4: Analyze Scenario & Display Personas Button */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white flex items-center justify-center font-extrabold text-xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-xs text-slate-900">زر "تحليل السيناريو وعرض الشخصيات" 🎭</span>
                  </div>
                  <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
                    {getFriendlyModelName(buttonModels.exerciseAnalysis || "gemini-3.6-flash")}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">مخصص لتحليل سيناريو التمرين وتوليد الشخصيات عند إنشاء محادثة تمرين جديدة.</p>
                <select
                  value={buttonModels.exerciseAnalysis || "gemini-3.6-flash"}
                  onChange={(e) => setButtonModels((prev) => ({ ...prev, exerciseAnalysis: e.target.value }))}
                  className="w-full bg-white text-slate-900 font-extrabold text-xs px-3 py-2 rounded-xl border border-amber-300 focus:outline-none cursor-pointer"
                >
                  <optgroup label="🔥 الموديلات ذات الطلبات الكثيرة (500 RPD)">
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite ⚡ (10 RPM)</option>
                  </optgroup>
                  <optgroup label="✨ النماذج العامة والمتقدمة">
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash ⚡ (أحدث معالجة - موصى به)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash ⚡ (مستقر)</option>
                    <option value="groq-llama-3.3-70b">Groq Llama 3.3 70B 🚀 (فائق السرعة)</option>
                    <option value="grok-2">Grok 2 🤖 (تفاعلي)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ⚡ (خفيف)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro 💎 (تحليل عميق)</option>
                  </optgroup>
                </select>
              </div>

              {/* Button 5: Make Flashcard from Quoted Text Button */}
              <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center font-extrabold text-xs">
                      <Layers className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-xs text-slate-900">زر "إنشاء بطاقة استذكار من النص المنصص" 🎴</span>
                  </div>
                  <span className="text-[10px] font-black bg-rose-100 text-rose-900 px-2 py-0.5 rounded-md">
                    {getFriendlyModelName(buttonModels.makeCard || "gemini-2.5-flash")}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">مخصص لتحليل النص المنصص عند الضغط على زر "بطاقة" وتوليد بطاقة استذكار مخصصة تلقائياً.</p>
                <select
                  value={buttonModels.makeCard || "gemini-2.5-flash"}
                  onChange={(e) => setButtonModels((prev) => ({ ...prev, makeCard: e.target.value }))}
                  className="w-full bg-white text-slate-900 font-extrabold text-xs px-3 py-2 rounded-xl border border-rose-300 focus:outline-none cursor-pointer"
                >
                  <optgroup label="🔥 الموديلات ذات الطلبات الكثيرة (500 RPD)">
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite ⚡ (500 RPD)</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite ⚡ (10 RPM)</option>
                  </optgroup>
                  <optgroup label="✨ النماذج العامة والمتقدمة">
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash ⚡ (أحدث معالجة - موصى به)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash ⚡ (مستقر)</option>
                    <option value="groq-llama-3.3-70b">Groq Llama 3.3 70B 🚀 (فائق السرعة)</option>
                    <option value="grok-2">Grok 2 🤖 (تفاعلي)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ⚡ (خفيف - سريع)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro 💎 (تحليل عميق)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Save / Close Button */}
            <button
              onClick={() => setShowButtonModelsModal(false)}
              className="w-full py-3 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-98 cursor-pointer mt-3"
            >
              حفظ وتطبيق الموديلات
            </button>
          </div>
        </div>
      )}

      {/* 4.6. STORED CONVERSATIONS NAVIGATION MODAL */}
      {showSessionsModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowSessionsModal(false)}
          dir="rtl"
        >
          <div
            className="bg-white w-full sm:max-w-lg max-h-[85vh] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 flex flex-col text-right font-sans animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9.5 h-9.5 rounded-2xl bg-blue-50 text-[#0056f6] flex items-center justify-center font-bold shadow-xs">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">المحادثات المخزنة</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    تنقل بين محادثاتك السابقة أو أنشئ محادثة جديدة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSessionsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action: New Conversation */}
            <div className="py-3 border-b border-slate-100 shrink-0">
              <button
                onClick={() => {
                  setShowSessionsModal(false);
                  setSelectedPersonaForNewChat(activePersonaId || personas[0]?.id || "");
                  setShowNewChatModal(true);
                }}
                className="w-full py-3 px-4 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>بدء محادثة جديدة (تحديد النوع والشخصية)</span>
              </button>
            </div>

            {/* Sessions Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1 min-h-[180px]">
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-medium text-xs">
                  لا توجد محادثات مخزنة حالياً
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = editingSessionId === session.id;
                  const sessionPersona = personas.find((p) => p.id === session.personaId) || DEFAULT_PERSONAS[0];

                  const lastMsg = session.messages && session.messages.length > 0 ? session.messages[session.messages.length - 1] : null;
                  let lastMsgText = "محادثة فارغة";
                  if (lastMsg) {
                    if (lastMsg.text?.trim()) {
                      lastMsgText = lastMsg.text.trim();
                    } else if (lastMsg.personaReply?.replyText?.trim()) {
                      lastMsgText = lastMsg.personaReply.replyText.trim();
                    } else if (lastMsg.chatReply?.replyText?.trim()) {
                      lastMsgText = lastMsg.chatReply.replyText.trim();
                    }
                  }

                  return (
                    <div
                      key={session.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isActive
                          ? "bg-purple-50/90 border-purple-400 ring-2 ring-purple-300/50 shadow-xs"
                          : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                      }`}
                    >
                      <div
                        className="flex-1 min-w-0 cursor-pointer flex items-center gap-3"
                        onClick={() => {
                          if (!isEditing) {
                            setActiveSessionId(session.id);
                            setTargetLanguage(session.targetLanguage);
                            setShowSessionsModal(false);
                          }
                        }}
                      >
                        {/* Persona Avatar */}
                        <div className="relative shrink-0">
                          <PersonaAvatarDisplay avatar={sessionPersona.avatar} name={sessionPersona.name} sizeClass="w-11 h-11 text-xl" />
                          {isActive && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
                          )}
                        </div>

                        {/* Title & Last Message */}
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editingSessionTitle}
                                onChange={(e) => setEditingSessionTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleRenameSession(session.id, editingSessionTitle);
                                  }
                                }}
                                className="flex-1 bg-white border border-purple-400 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                autoFocus
                              />
                              <button
                                onClick={() => handleRenameSession(session.id, editingSessionTitle)}
                                className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                                title="حفظ العنوان"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingSessionId(null)}
                                className="p-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 cursor-pointer"
                                title="إلغاء"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div className="font-extrabold text-sm text-slate-900 truncate">
                                {session.title}
                              </div>
                              <div className="text-xs text-slate-500 font-medium truncate mt-0.5">
                                {lastMsgText}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Message Count (Numerical Only) */}
                          <div
                            className={`h-8 min-w-[32px] px-2 text-xs font-black rounded-xl border flex items-center justify-center select-none shadow-2xs transition-colors ${
                              isActive
                                ? "bg-purple-100/90 text-purple-950 border-purple-300/80"
                                : "bg-slate-100/90 text-slate-700 border-slate-200/80"
                            }`}
                            title={`عدد الرسائل في هذه المحادثة: ${session.messages?.length || 0}`}
                          >
                            {session.messages?.length || 0}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(session.id);
                              setEditingSessionTitle(session.title);
                            }}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                            title="تعديل اسم المحادثة"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.id);
                            }}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="حذف هذه المحادثة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowSessionsModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4.6.5. START NEW CONVERSATION MODAL (اختيار نوع المحادثة والتمرين) */}
      {showNewChatModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowNewChatModal(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-900 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">بدء محادثة جديدة 💬</h3>
                  <p className="text-xs text-slate-500 font-medium">اختر نوع المحادثة للبدء في ممارسة اللغة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-0.5 custom-scrollbar">
              {/* STEP 1: اختر نوع المحادثة */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-700 block flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>1. اختر نوع المحادثة:</span>
                </label>
                
                <div className="space-y-2.5">
                  {/* Option 1: المحادثة حرة */}
                  <button
                    type="button"
                    onClick={() => setSelectedChatType("free")}
                    className={`w-full p-3.5 rounded-2xl border transition-all text-right flex items-start justify-between gap-3 cursor-pointer ${
                      selectedChatType === "free"
                        ? "bg-purple-50/90 border-purple-500 ring-2 ring-purple-500/20 shadow-xs"
                        : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>المحادثة حرة</span>
                        <span className="text-[10px] font-black bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full">
                          المحادثة الطبيعية
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        حوار طليق وتلقائي مع الشخصية المختارة دون قيود محددة (النمط الاعتيادي للمحادثة).
                      </p>
                    </div>

                    <div className="shrink-0 mt-0.5">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedChatType === "free" ? "border-purple-600 bg-purple-600 text-white" : "border-slate-300"
                      }`}>
                        {selectedChatType === "free" && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </button>

                  {/* Option 2: محادثة التمارين والسيناريوهات */}
                  <button
                    type="button"
                    onClick={() => setSelectedChatType("exercise")}
                    className={`w-full p-3.5 rounded-2xl border transition-all text-right flex items-start justify-between gap-3 cursor-pointer ${
                      selectedChatType === "exercise"
                        ? "bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs"
                        : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>محادثة تمرين (Scenario/Roleplay)</span>
                        <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                          تمرّن على سيناريوهات ومحادثات محددة
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        أدخل نص التمرين أو السيناريو والشروط المطلوبة، وسيقوم الذكاء الاصطناعي بإنشاء وتولي الشخصية المناسبة وتوجيه الحوار.
                      </p>
                    </div>

                    <div className="shrink-0 mt-0.5">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedChatType === "exercise" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"
                      }`}>
                        {selectedChatType === "exercise" && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </button>

                  {/* Option 3: قسم كون الجمل */}
                  <button
                    type="button"
                    onClick={() => setSelectedChatType("sentence_builder")}
                    className={`w-full p-3.5 rounded-2xl border transition-all text-right flex items-start justify-between gap-3 cursor-pointer ${
                      selectedChatType === "sentence_builder"
                        ? "bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                        : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>كون الجمل (Sentence Builder)</span>
                        <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                          تمرين ذكي لتكوين وصياغة الجمل
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        يطلب منك الذكاء الاصطناعي صياغة جمل حسب موضوع وسياق وقواعد محددة، ثم يصحح لك الإجابة مباشرة.
                      </p>
                    </div>

                    <div className="shrink-0 mt-0.5">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedChatType === "sentence_builder" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"
                      }`}>
                        {selectedChatType === "sentence_builder" && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* STEP 2: DYNAMIC CONTENT BASED ON CHAT TYPE */}
              {selectedChatType === "free" ? (
                /* OPTION 1 DYNAMIC CONTENT: SELECT PERSONA */
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-black text-slate-700 block flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-purple-600" />
                    <span>2. اختر الشخصية الأولية للمحادثة:</span>
                  </label>
                  <p className="text-[11px] text-slate-500 font-medium">
                    اختر إحدى الشخصيات المخزنة لتكون المتحدث الرئيسي في هذه المحادثة:
                  </p>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {personas.map((p) => {
                      const isSelected = p.id === (selectedPersonaForNewChat || activePersonaId);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPersonaForNewChat(p.id)}
                          className={`w-full p-3 rounded-2xl border transition-all text-right flex items-center justify-between gap-3 cursor-pointer ${
                            isSelected
                              ? "bg-purple-50/90 border-purple-500 ring-2 ring-purple-500/20 shadow-xs"
                              : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PersonaAvatarDisplay avatar={p.avatar} name={p.name} sizeClass="w-10 h-10 text-xl" />
                            <div className="min-w-0">
                              <div className="font-extrabold text-xs text-slate-900 truncate flex items-center gap-1.5">
                                <span>{p.name}</span>
                                {isSelected && (
                                  <span className="text-[9px] font-black bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full">
                                    الشخصية المختارة
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-bold text-purple-700 truncate mt-0.5">
                                {p.job || "شخصية محادثة"}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? "border-purple-600 bg-purple-600 text-white" : "border-slate-300"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : selectedChatType === "exercise" ? (
                /* OPTION 2 DYNAMIC CONTENT: EXERCISE CONTEXT & VARIABLES INPUTS */
                <div className="space-y-3.5 pt-2 border-t border-slate-100 animate-fade-in">
                  <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-3 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-indigo-950 font-medium leading-relaxed">
                      الذكاء الاصطناعي سيحلل سياق التمرين والمتغيرات تلقائياً، ليولد الشخصيات المناسبة، ويدير الحوار مع إتاحة نظام التصحيح كاملاً.
                    </p>
                  </div>

                  {/* Context Input Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800 block flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>سياق التمرين / النص الأصلي (Context Input): <span className="text-rose-500">*</span></span>
                    </label>
                    <textarea
                      value={exerciseContext}
                      onChange={(e) => setExerciseContext(e.target.value)}
                      placeholder="أدخل سياق التمرين أو السيناريو المطلوب للتدرب عليه (مثال: حوار عند حجز غرفة في فندق، أو إجراء مقابلة عمل في شركة، أو طلب طعام في مطعم...)"
                      rows={3}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all resize-none"
                    />
                  </div>

                  {/* Variables Input Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800 block flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      <span>المتغيرات / الشروط (Variables Input) - اختياري:</span>
                    </label>
                    <textarea
                      value={exerciseVariables}
                      onChange={(e) => setExerciseVariables(e.target.value)}
                      placeholder="أدخل أي شروط أو متغيرات إضافية للتمرين (مثال: استخدام اسم السيد مولر، التركيز على أفعال الماضي البسيط، التحدث بلغة رسمية، إلخ)"
                      rows={2.5}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all resize-none"
                    />
                  </div>
                </div>
              ) : (
                /* OPTION 3 DYNAMIC CONTENT: SENTENCE BUILDER INPUTS */
                <div className="space-y-3.5 pt-2 border-t border-slate-100 animate-fade-in">
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 flex items-start gap-2.5">
                    <PenTool className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-emerald-950 font-medium leading-relaxed">
                      سيطلب منك الذكاء الاصطناعي صياغة جمل في اللغة المختارة حسب الموضوع والسياق والتركيز المطلوب، ثم يصحح لك إجاباتك مباشرة.
                    </p>
                  </div>

                  {/* Target Language Selector for Sentence Builder */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800 block flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-emerald-600" />
                      <span>لغة الشخصية / اللغة المستهدفة للتمرين:</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {LANGUAGES.map((lang) => {
                        const isSelected = (sentenceLanguageInput || targetLanguage) === lang.code;
                        return (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => setSentenceLanguageInput(lang.code)}
                            className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? "bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-2xs"
                                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span>{lang.flag}</span>
                              <span>{lang.label}</span>
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* General Topic (Required) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800 block flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>الموضوع العام (General Topic): <span className="text-rose-500">*</span></span>
                    </label>
                    <input
                      type="text"
                      value={sentenceTopicInput}
                      onChange={(e) => setSentenceTopicInput(e.target.value)}
                      placeholder="مثال: المطعم، السفر، التسوق، العمل، الصحة..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  {/* Context Field (Optional) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800 block flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-emerald-600" />
                      <span>السياق (Context) - اختياري:</span>
                    </label>
                    <input
                      type="text"
                      value={sentenceContextInput}
                      onChange={(e) => setSentenceContextInput(e.target.value)}
                      placeholder="مثال: طلب الفاتورة، حجز طاولة، الشكوى من الطعام..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  {/* Grammar Focus Field (Optional) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800 block flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>التركيز على قاعدة نحوية (Grammar Focus) - اختياري:</span>
                    </label>
                    <input
                      type="text"
                      value={sentenceGrammarFocusInput}
                      onChange={(e) => setSentenceGrammarFocusInput(e.target.value)}
                      placeholder="مثال: جمل ماضي، أفعال حركية، أدوات الربط، صيغة الأمر..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  {/* Select Persona for Sentence Builder */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <label className="text-xs font-black text-slate-700 block flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span>الشخصية المعلمة (الموجهة للتمرين):</span>
                    </label>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                      {personas.map((p) => {
                        const isSelected = p.id === (selectedPersonaForNewChat || activePersonaId);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedPersonaForNewChat(p.id)}
                            className={`w-full p-2.5 rounded-2xl border transition-all text-right flex items-center justify-between gap-3 cursor-pointer ${
                              isSelected
                                ? "bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                                : "bg-slate-50/80 hover:bg-slate-100/90 border-slate-200/80"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PersonaAvatarDisplay avatar={p.avatar} name={p.name} sizeClass="w-8 h-8 text-lg" />
                              <div className="min-w-0">
                                <div className="font-extrabold text-xs text-slate-900 truncate">
                                  {p.name}
                                </div>
                                <div className="text-[10px] font-bold text-emerald-700 truncate">
                                  {p.job || "معلم لغوي"}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"
                              }`}>
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 shrink-0 flex items-center gap-2">
              <button
                type="button"
                disabled={
                  (selectedChatType === "exercise" && !exerciseContext.trim()) ||
                  (selectedChatType === "sentence_builder" && !sentenceTopicInput.trim())
                }
                onClick={() => {
                  if (selectedChatType === "exercise") {
                    if (!exerciseContext.trim()) return;
                    setShowNewChatModal(false);
                    handleGenerateExercisePersonas(exerciseContext, exerciseVariables);
                  } else if (selectedChatType === "sentence_builder") {
                    if (!sentenceTopicInput.trim()) return;
                    handleCreateSentenceBuilderSession();
                  } else {
                    const personaIdToUse = selectedPersonaForNewChat || activePersonaId || personas[0]?.id;
                    handleCreateNewSession(targetLanguage, undefined, personaIdToUse, "free");
                    setShowNewChatModal(false);
                  }
                }}
                className={`flex-1 py-3 text-white font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                  (selectedChatType === "exercise" && !exerciseContext.trim()) ||
                  (selectedChatType === "sentence_builder" && !sentenceTopicInput.trim())
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                    : selectedChatType === "exercise"
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md shadow-indigo-600/20"
                    : selectedChatType === "sentence_builder"
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-600/20"
                    : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-md shadow-purple-600/20"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {selectedChatType === "exercise"
                    ? "تحليل السيناريو وعرض الشخصيات 🎭"
                    : selectedChatType === "sentence_builder"
                    ? "بدء تمرين تكوين الجمل 🧩"
                    : "تأكيد وبدء المحادثة الآن 🚀"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SENTENCE BUILDER SETTINGS MODAL */}
      {showEditSentenceSettingsModal && activeSession && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={() => setShowEditSentenceSettingsModal(false)}
          dir="rtl"
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 text-right font-sans animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-slate-900 text-base">تعديل إعدادات تكوين الجمل ✏️</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditSentenceSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Target Language Selection in Edit Modal */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-600" />
                  <span>لغة المحادثة والشخصية (Language):</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {LANGUAGES.map((lang) => {
                    const isSelected = (sentenceLanguageInput || activeSession.targetLanguage || targetLanguage) === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setSentenceLanguageInput(lang.code)}
                        className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-500/30 shadow-2xs"
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span>{lang.flag}</span>
                          <span>{lang.label}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">الموضوع العام (Topic) *</label>
                <input
                  type="text"
                  value={sentenceTopicInput}
                  onChange={(e) => setSentenceTopicInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">السياق (Context)</label>
                <input
                  type="text"
                  value={sentenceContextInput}
                  onChange={(e) => setSentenceContextInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">التركيز على قاعدة نحوية (Grammar Focus)</label>
                <input
                  type="text"
                  value={sentenceGrammarFocusInput}
                  onChange={(e) => setSentenceGrammarFocusInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!sentenceTopicInput.trim()) return;
                  const updatedTopic = sentenceTopicInput.trim();
                  const updatedContext = sentenceContextInput.trim();
                  const updatedGrammar = sentenceGrammarFocusInput.trim();

                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === activeSession.id
                        ? {
                            ...s,
                            targetLanguage: sentenceLanguageInput || s.targetLanguage,
                            sentenceTopic: updatedTopic,
                            sentenceContext: updatedContext,
                            sentenceGrammarFocus: updatedGrammar
                          }
                        : s
                    )
                  );
                  setShowEditSentenceSettingsModal(false);
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-600/20"
              >
                حفظ التغييرات 💾
              </button>
              <button
                type="button"
                onClick={() => setShowEditSentenceSettingsModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4.6.6. EXERCISE PERSONAS PREVIEW & CONFIRMATION MODAL (شخصيات سيناريو التمرين) */}
      {showExercisePersonasPreviewModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          dir="rtl"
        >
          <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 animate-slide-up sm:animate-scale-up">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 flex items-center justify-center text-xl shadow-inner">
                  🎭
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                    <span>شخصيات سيناريو التمرين</span>
                    <span className="text-[10px] font-black bg-indigo-500/40 text-indigo-100 px-2 py-0.5 rounded-full border border-indigo-400/30">
                      مولدة بالذكاء الاصطناعي ✨
                    </span>
                  </h3>
                  <p className="text-xs text-indigo-200/90 font-medium">
                    {isGeneratingExercisePersonas
                      ? "جاري تحليل السيناريو وتوليد شخصيات الموقف المناسبة..."
                      : generatedExerciseData?.exerciseTitle || "شخصيات المحاكاة الخاصة بهذا التمرين"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowExercisePersonasPreviewModal(false)}
                className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
              {/* Warnings / Error Banner & Model Switcher Suggestion */}
              {!isGeneratingExercisePersonas && (personaGenWarnings.length > 0 || personaGenError) && (
                <div className="bg-amber-50/95 border-2 border-amber-300 rounded-2xl p-3.5 sm:p-4 space-y-3 text-xs animate-fade-in shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-extrabold text-amber-950 text-xs sm:text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>تنبيه أداء نموذج التحليل ({getFriendlyModelName(personaGenUsedModel || buttonModels.exerciseAnalysis || "gemini-3.6-flash")}):</span>
                    </div>
                  </div>

                  <div className="space-y-1 bg-white/90 p-2.5 rounded-xl border border-amber-200 text-amber-900 font-semibold leading-relaxed">
                    {personaGenWarnings.map((w, idx) => (
                      <p key={idx} className="flex items-start gap-1.5">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{w}</span>
                      </p>
                    ))}
                  </div>

                  {/* Model Switch Suggestion Dropdown */}
                  <div className="pt-2 border-t border-amber-200/80 space-y-2">
                    <div className="flex items-center justify-between text-amber-950 font-black text-xs">
                      <span>💡 اقتراح الموقع: قم بالتحليل باستخدام نموذج آخر من القائمة:</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        value={buttonModels.exerciseAnalysis || "gemini-3.6-flash"}
                        onChange={(e) => {
                          const newM = e.target.value;
                          setButtonModels((prev) => ({ ...prev, exerciseAnalysis: newM }));
                          handleGenerateExercisePersonas(exerciseContext, exerciseVariables, newM);
                        }}
                        className="flex-1 bg-white text-slate-900 font-extrabold text-xs px-3 py-2 rounded-xl border-2 border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs"
                      >
                        <optgroup label="🔥 الموديلات ذات الطلبات الكثيرة (500 RPD)">
                          <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite ⚡ (500 RPD)</option>
                          <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite ⚡ (500 RPD)</option>
                          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite ⚡ (10 RPM)</option>
                        </optgroup>
                        <optgroup label="✨ النماذج العامة والمتقدمة">
                          <option value="gemini-3.5-flash">Gemini 3.5 Flash ⚡ (مستقر - موصى به)</option>
                          <option value="groq-llama-3.3-70b">Groq Llama 3.3 70B 🚀 (فائق السرعة)</option>
                          <option value="grok-2">Grok 2 🤖 (تفاعلي)</option>
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash ⚡ (خفيف)</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro 💎 (تحليل متقدم)</option>
                          <option value="gemini-3.6-flash">Gemini 3.6 Flash ⚡</option>
                        </optgroup>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleGenerateExercisePersonas(exerciseContext, exerciseVariables, buttonModels.exerciseAnalysis)}
                        className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إعادة التحليل بهذا النموذج</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isGeneratingExercisePersonas ? (
                /* Loading Skeleton */
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin flex items-center justify-center"></div>
                    <Sparkles className="w-6 h-6 text-indigo-600 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-slate-800 text-sm">جاري إنشاء الشخصيات والسيناريو بالذكاء الاصطناعي...</h4>
                    <p className="text-xs text-slate-500 font-medium max-w-xs">
                      يتم تحليل سياق التمرين وتوليد الشخصيات التفاعلية مع صياغة أدوارهم بدقة
                    </p>
                  </div>
                </div>
              ) : generatedExerciseData ? (
                /* Personas Preview Content */
                <div className="space-y-4 animate-fade-in">
                  {/* User Role Banner */}
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200/80 rounded-2xl p-4 space-y-1">
                    <div className="flex items-center gap-2 text-purple-900 font-extrabold text-xs">
                      <UserCheck className="w-4 h-4 text-purple-600" />
                      <span>دورك أنت في التمرين (User Role):</span>
                    </div>
                    <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                      {generatedExerciseData.userRole}
                    </p>
                  </div>

                  {/* Generated Personas Section */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span>الشخصيات التي ستتحدث معك في هذا التمرين ({generatedExerciseData.personas.length}):</span>
                      </label>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        مربوطة بهذه المحادثة فقط
                      </span>
                    </div>

                    <div className="space-y-3">
                      {generatedExerciseData.personas.map((persona, index) => (
                        <div 
                          key={persona.id || index}
                          className="bg-white border-2 border-indigo-100 hover:border-indigo-300 rounded-2xl p-4 shadow-xs space-y-3 transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <PersonaAvatarDisplay avatar={persona.avatar} name={persona.name} sizeClass="w-12 h-12 text-2xl" />
                              <div>
                                <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                                  <span>{persona.name}</span>
                                  <span className="text-[10px] font-black bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                                    الشخصية الرئيسية #{index + 1}
                                  </span>
                                </h4>
                                <div className="text-xs font-extrabold text-indigo-600 mt-0.5">
                                  {persona.job}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Persona Details */}
                          <div className="bg-slate-50/80 rounded-xl p-3 space-y-1.5 text-xs">
                            {persona.roleDescriptionAr && (
                              <p className="text-slate-700 font-medium leading-relaxed">
                                <span className="font-bold text-slate-900">طريقة التفاعل:</span> {persona.roleDescriptionAr}
                              </p>
                            )}
                            {persona.toneStyle && (
                              <p className="text-slate-500 font-medium text-[11px]">
                                <span className="font-bold text-slate-700">النبرة والأسلوب:</span> {persona.toneStyle}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Generated Interactive Checklist Steps Preview */}
                  {generatedExerciseData.checklist && generatedExerciseData.checklist.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                          <span>خطوات وأهداف التمرين المسرودة ({generatedExerciseData.checklist.length} خطوات):</span>
                        </label>
                        <span className="text-[10px] font-bold text-slate-500 bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded-md border border-indigo-100">
                          تُتتبع تلقائياً أثناء الحوار
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {generatedExerciseData.checklist.map((step, sIdx) => (
                          <div key={step.id || sIdx} className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2.5 text-xs">
                            <span className="w-5 h-5 rounded-lg bg-indigo-100 text-indigo-800 font-black text-[11px] flex items-center justify-center shrink-0">
                              {sIdx + 1}
                            </span>
                            <div className="space-y-0.5 min-w-0">
                              {step.speakerName && (() => {
                                const info = resolveSpeakerInfo(step.speakerName, generatedExerciseData.personas);
                                if (!info) return <span className="font-extrabold text-slate-900 block">{step.speakerName}:</span>;
                                return (
                                  <div className="inline-flex items-center gap-1.5 bg-slate-200/90 border border-slate-300 px-2 py-0.5 rounded-lg text-[11px] font-extrabold text-slate-800 mb-1">
                                    <PersonaAvatarDisplay avatar={info.avatar} name={info.name} sizeClass="w-4 h-4 text-[10px]" />
                                    <span>{info.name}</span>
                                  </div>
                                );
                              })()}
                              <span className="text-slate-600 font-medium leading-relaxed">{step.objective}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            {!isGeneratingExercisePersonas && generatedExerciseData && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleCreateNewSession(
                      targetLanguage,
                      undefined,
                      undefined,
                      "exercise",
                      exerciseContext,
                      exerciseVariables,
                      generatedExerciseData.exerciseTitle,
                      generatedExerciseData.userRole,
                      generatedExerciseData.personas,
                      generatedExerciseData.checklist
                    );
                    setShowExercisePersonasPreviewModal(false);
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>بدء التفاعل والسيناريو الآن 🚀</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateExercisePersonas(exerciseContext, exerciseVariables)}
                  className="px-3.5 py-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-extrabold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  title="إعادة توليد شخصيات وسيناريو تمرين جديد"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>إعادة التوليد</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. CHAT & VOICE SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden space-y-0 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#0056f6] flex items-center justify-center text-white shadow-sm">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight">إعدادات المحادثة والصوت ⚙️</h3>
                  <p className="text-[11px] text-slate-300 font-medium">خصّص موديل الذكاء الاصطناعي وصوت ونطق النصوص</p>
                </div>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Section 1: AI Model Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#0056f6]" />
                    <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">اختيار نموذج الذكاء الاصطناعي</h4>
                  </div>
                </div>

                {/* Group A: الموديلات ذات الطلبات الكثيرة */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-xs">🔥</span>
                    <span className="font-black text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                      الموديلات ذات الطلبات الكثيرة (أعلى سعة للطلبات 500 RPD)
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite ⚡", desc: "500 طلب/يومياً (500 RPD) و 15/دقيقة - أقصى سعة للعمل المكثف المستمر", tag: "500 RPD" },
                      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite ⚡", desc: "500 طلب/يومياً (500 RPD) و 15/دقيقة - نموذج خفيف مستقر دون انقطاع", tag: "500 RPD" },
                      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite ⚡", desc: "10 طلبات/دقيقة (20 RPD) - استجابة خفيفة وسريعة جداً للمحاذاة المباشرة", tag: "10 RPM" },
                    ].map((m) => {
                      const isSelected = selectedModel === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedModel(m.id)}
                          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "bg-amber-50/80 border-amber-500 text-slate-900 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100/80 border-slate-200/80 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? "border-amber-500 bg-amber-500" : "border-slate-300"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                            </div>
                            <div>
                              <div className="font-extrabold text-sm text-slate-900">{m.name}</div>
                              <div className="text-[11px] text-slate-500 font-medium">{m.desc}</div>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            isSelected ? "bg-amber-500 text-white border-amber-600" : "bg-amber-100/60 text-amber-800 border-amber-200/60"
                          }`}>
                            {m.tag}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Group B: النماذج العامة والمتقدمة */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-xs">✨</span>
                    <span className="font-black text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      النماذج العامة والمتقدمة
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash ⚡", desc: "النموذج الأساسي - أسرع وأحدث معالجة ذكية من جوجل (250K TPM)", tag: "موصى به" },
                      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash ⚡", desc: "نموذج توليد البطاقات المستقر والسريع بمرونة عالية (250K TPM)", tag: "مستقر" },
                      { id: "groq-llama-3.3-70b", name: "Groq Llama 3.3 70B 🚀", desc: "خوادم Groq الفائقة (أداء عالي وسريع جداً بدون قيود شحن مجاني)", tag: "فائق السرعة" },
                      { id: "grok-2", name: "Grok 2 🤖", desc: "نموذج جروك التفاعلي للمحادثة والبلاغة اللغوية", tag: "تفاعلي" },
                      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash ⚡", desc: "نموذج تصحيح سريع ومباشر", tag: "خفيف" },
                      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro 💎", desc: "تحليل أكاديمي عميق للنصوص المعقدة والإنشاء", tag: "احترافي" },
                    ].map((m) => {
                      const isSelected = selectedModel === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedModel(m.id)}
                          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "bg-blue-50/70 border-[#0056f6] text-slate-900 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100/80 border-slate-200/80 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? "border-[#0056f6] bg-[#0056f6]" : "border-slate-300"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                            </div>
                            <div>
                              <div className="font-extrabold text-sm text-slate-900">{m.name}</div>
                              <div className="text-[11px] text-slate-500 font-medium">{m.desc}</div>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            isSelected ? "bg-[#0056f6] text-white border-blue-600" : "bg-slate-200/60 text-slate-600 border-slate-300/60"
                          }`}>
                            {m.tag}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* Section 2: Voice & TTS Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-[#0056f6]" />
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">إعدادات الصوت ونطق النصوص</h4>
                </div>

                {/* Voice Model Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">قارئ الصوت (Voice Speaker Model):</label>
                  <div className="relative">
                    <select
                      value={selectedVoiceURI}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedVoiceURI(val);
                        const langShort = currentLangObj.iso.split("-")[0].toLowerCase();
                        if (val) {
                          localStorage.setItem(`settings_primary_piper_model_${langShort}`, val);
                          localStorage.setItem("settings_primary_piper_model", val);
                        }
                      }}
                      className="w-full appearance-none bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs p-3 pl-8 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0056f6]/30 cursor-pointer transition-all"
                    >
                      <option value="">تلقائي (صوت النظام الافتراضي للغة)</option>

                      <optgroup label="⚡ خدمات النطق المباشرة">
                        <option value="google">⚡ Google Translate TTS (خدمة سريعة لسيرفرات جوجل)</option>
                        <option value="webspeech">🌐 Web Speech API (نطق المتصفح المباشر)</option>
                      </optgroup>

                      <optgroup label={`🧠 نماذج Piper العصبية المتاحة (${currentLangObj.flag} ${currentLangObj.label})`}>
                        {getModelsForTargetLanguage(currentLangObj.code).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.flag} {m.name} {m.isInstalled ? "💾 (منزّل أوفلاين)" : "☁️ (متاح أونلاين)"}
                          </option>
                        ))}
                      </optgroup>

                      <optgroup label={`🎙️ أصوات المتصفح (${currentLangObj.label})`}>
                        {availableVoices
                          .filter((v) =>
                            v.lang.toLowerCase().includes(currentLangObj.iso.split("-")[0].toLowerCase())
                          )
                          .map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              🗣️ {v.name} ({v.lang})
                            </option>
                          ))}
                      </optgroup>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Speech Speed Rate */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">سرعة النطق (Speech Speed):</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { rate: 0.8, label: "بطيء (0.8x) 🐢" },
                      { rate: 1.0, label: "عادي (1.0x) 🗣️" },
                      { rate: 1.2, label: "سريع (1.2x) 🚀" },
                    ].map((item) => (
                      <button
                        key={item.rate}
                        type="button"
                        onClick={() => setSpeechRate(item.rate)}
                        className={`py-2 px-3 rounded-xl font-extrabold text-xs transition-all border cursor-pointer ${
                          speechRate === item.rate
                            ? "bg-[#0056f6] text-white border-[#0056f6] shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto-read Toggle (Persona Replies Only) */}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div>
                    <div className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-emerald-600" />
                      <span>نطق رد الشخصية تلقائياً</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                      عند التفعيل، يتم نطق ردود الشخصيات فقط فور وصولها (تجاهل رد السؤال والتصحيح)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoSpeak(!autoSpeak)}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                      autoSpeak ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${
                      autoSpeak ? "right-6" : "right-0.5"
                    }`} />
                  </button>
                </div>

                {/* Auto-Slide Carousel Images Setting */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                        <Image className="w-4 h-4 text-purple-600" />
                        <span>تقليب الصور التلقائي (Auto-Slide Images) 🖼️</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                        التبديل التلقائي بين صور معارض ردود الشخصيات بفترة زمنية محددة
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 pt-1">
                    {[
                      { val: 0, label: "إيقاف" },
                      { val: 500, label: "0.5 ثانية" },
                      { val: 1000, label: "1 ثانية" },
                      { val: 2000, label: "2 ثانية" },
                      { val: 3000, label: "3 ثواني" },
                      { val: 4000, label: "4 ثواني" },
                      { val: 5000, label: "5 ثواني" },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setAutoSlideInterval(opt.val)}
                        className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold transition-all border cursor-pointer ${
                          autoSlideInterval === opt.val
                            ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Enable Persona Text Correction Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-purple-50/80 rounded-2xl border border-purple-200/80">
                  <div>
                    <div className="font-extrabold text-xs text-purple-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span>تصحيح وتقييم النص في الرد كشخصية</span>
                    </div>
                    <div className="text-[10px] text-purple-800/80 font-medium mt-0.5">
                      إظهار بطاقة التحليل والتصحيح اللغوي مدمجة ومخفية تحت رد الشخصية
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnablePersonaCorrection(!enablePersonaCorrection)}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                      enablePersonaCorrection ? "bg-purple-700" : "bg-slate-300"
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${
                      enablePersonaCorrection ? "right-6" : "right-0.5"
                    }`} />
                  </button>
                </div>

                {/* Test Voice Button */}
                <button
                  type="button"
                  onClick={() => {
                    const sampleTexts: Record<string, string> = {
                      German: "Hallo! Das ist ein Hörtest für die Sprachausgabe.",
                      English: "Hello! This is a voice synthesis test.",
                      French: "Bonjour! Ceci est un test de synthèse vocale.",
                      Spanish: "¡Hola! Esta es una prueba de síntesis de voz.",
                      Arabic: "مرحباً! هذا اختبار لصوت ونطق الذكاء الاصطناعي."
                    };
                    const sample = sampleTexts[currentLangObj.code] || "Hallo! Das ist ein Test.";
                    handleSpeakText(sample, currentLangObj.code);
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition-all cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-[#0056f6]" />
                  <span>تجربة الصوت الآن 🔊 ({currentLangObj.flag} {currentLangObj.label})</span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-6 py-2.5 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md cursor-pointer"
              >
                حفظ وإغلاق ✨
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. PERSONA SELECTION & CUSTOM PERSONA MODAL */}
      {showPersonaModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" dir="rtl">
          <div className="bg-white max-w-2xl w-full rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] border border-slate-100">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-700 text-white flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-2xl shadow-inner shrink-0">
                  🎭
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg tracking-tight leading-tight">إعداد واختيار شخصيات المحادثة</h3>
                  <p className="text-[11px] sm:text-xs text-purple-100/90 font-medium mt-0.5">اختر شخصية تفاعلية للتحاور معها أو أنشئ شخصيتك المخصصة</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPersonaModal(false);
                  setEditingPersona(null);
                  setIsNewPersona(false);
                }}
                className="p-2 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer shrink-0"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 pt-2 shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingPersona(null);
                  setIsNewPersona(false);
                }}
                className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-extrabold rounded-t-xl transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                  !editingPersona
                    ? "bg-white text-purple-900 border-purple-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/80"
                }`}
              >
                <span>🎭 قائمة الشخصيات المتاحة</span>
                <span className="bg-purple-100 text-purple-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-purple-200">
                  {personas.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!editingPersona) {
                    setEditingPersona({
                      name: "",
                      avatar: "🎭",
                      job: "",
                      age: "25 سنة",
                      origin: "",
                      toneStyle: "ودود ومرح",
                      backgroundTopics: ""
                    });
                    setIsNewPersona(true);
                  }
                }}
                className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-extrabold rounded-t-xl transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                  editingPersona
                    ? "bg-white text-purple-900 border-purple-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/80"
                }`}
              >
                <Plus className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{editingPersona ? (isNewPersona ? "إضافة شخصية جديدة" : "تعديل الشخصية") : "إضافة شخصية جديدة"}</span>
              </button>
            </div>

            {/* Modal Content Scroll Area */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar bg-slate-50/50">
              {/* VIEW 1: PERSONA EDITOR FORM */}
              {editingPersona ? (
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h4 className="font-extrabold text-sm sm:text-base text-purple-950 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span>{isNewPersona ? "إنشاء وتخصيص شخصية جديدة" : `تعديل مواصفات: ${editingPersona.name}`}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPersona(null);
                        setIsNewPersona(false);
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                    >
                      ← العودة للقائمة
                    </button>
                  </div>

                  {/* AI PERSONA GENERATOR WIDGET */}
                  <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white p-4 rounded-2xl shadow-md border border-purple-400/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/30 flex items-center justify-center border border-purple-400/40">
                          <Bot className="w-5 h-5 text-purple-200" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-black text-sm text-purple-100 flex items-center gap-1.5">
                              <span>مساعد الذكاء الاصطناعي لتوليد الشخصيات 🪄</span>
                            </h5>
                            <span className="text-[10px] font-black bg-purple-800/80 text-purple-200 border border-purple-400/40 px-2 py-0.5 rounded-full">
                              الموديل: {getFriendlyModelName(buttonModels?.persona || selectedModel)}
                            </span>
                          </div>
                          <p className="text-[11px] text-purple-200/80 font-medium mt-0.5">
                            اكتب أي وصف (مثال: "طفلة عمرها 15" أو "رئيس شركة") وسيتم استخراج وتوليد جميع التفاصيل والصورة المناسبة تلقائياً!
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={aiPersonaPrompt}
                        onChange={(e) => setAiPersonaPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleGeneratePersonaAI();
                          }
                        }}
                        placeholder="اكتب وصف الشخصية (مثال: طفلة عمرها 15، رئيس شركة، دكتورة أسنان...)"
                        className="flex-1 bg-purple-950/80 text-white placeholder-purple-300/60 font-bold text-xs p-3 rounded-xl border border-purple-400/40 focus:outline-none focus:ring-2 focus:ring-purple-300"
                      />
                      <button
                        type="button"
                        onClick={handleGeneratePersonaAI}
                        disabled={isGeneratingAiPersona || !aiPersonaPrompt.trim()}
                        className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        {isGeneratingAiPersona ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>جاري التوليد...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 fill-current" />
                            <span>توليد تلقائي ✨</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick Preset Prompts */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] font-bold text-purple-300">أمثلة سريعة للتوليد بنقرة واحدة:</span>
                      {[
                        "طفلة عمرها 15 طالبة مدرسة",
                        "رئيس شركة تقنية كبرى",
                        "طبيبة أسنان مرحة ببرلين",
                        "بائع خبز فرنسي لطيف",
                        "مرشد سياحي في دبي"
                      ].map((promptEx) => (
                        <button
                          key={promptEx}
                          type="button"
                          onClick={() => {
                            setAiPersonaPrompt(promptEx);
                          }}
                          className="text-[10px] font-extrabold bg-purple-800/60 hover:bg-purple-700/80 text-purple-100 px-2.5 py-1 rounded-lg border border-purple-400/30 transition-colors cursor-pointer"
                        >
                          + {promptEx}
                        </button>
                      ))}
                    </div>

                    {aiPersonaError && (
                      <div className="p-2.5 bg-red-950/80 border border-red-500/50 rounded-xl text-red-200 text-xs font-bold">
                        ⚠️ {aiPersonaError}
                      </div>
                    )}

                    {aiPersonaSuccess && (
                      <div className="p-3 bg-emerald-950/90 border border-emerald-400/60 rounded-xl text-emerald-100 text-xs font-bold flex items-center justify-between gap-2 flex-wrap animate-fade-in">
                        <span className="flex items-center gap-1.5">
                          <span>✨ {aiPersonaSuccess}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingPersona) handleSavePersona(editingPersona);
                          }}
                          className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black px-3.5 py-1.5 rounded-lg transition-all cursor-pointer text-xs shrink-0 shadow-sm flex items-center gap-1"
                        >
                          <span>حفظ وإعتماد الشخصية فوراً 💾</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Multi-source Avatar Selector (DuckDuckGo, Image Link, Emojis) */}
                  <div className="space-y-2.5 bg-gradient-to-br from-purple-50/80 to-indigo-50/50 p-3.5 sm:p-4 rounded-2xl border border-purple-200/80 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="text-xs font-black text-purple-950 flex items-center gap-1.5">
                        <span>صورة أو رمز الشخصية (Avatar):</span>
                      </label>
                      <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-purple-200/80 text-[11px] font-bold shadow-2xs">
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarTab("duckduckgo");
                            if (ddgResults.length === 0) {
                              const q = `${editingPersona.name || ""} ${editingPersona.job || "portrait avatar"}`.trim();
                              setDdgSearchQuery(q);
                              handleSearchDdgImages(q);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                            avatarTab === "duckduckgo"
                              ? "bg-purple-700 text-white shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <Search className="w-3 h-3" />
                          <span>بحث DuckDuckGo 🔍</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAvatarTab("link")}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                            avatarTab === "link"
                              ? "bg-purple-700 text-white shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <Link2 className="w-3 h-3" />
                          <span>رابط صورة (URL)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAvatarTab("emoji")}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                            avatarTab === "emoji"
                              ? "bg-purple-700 text-white shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <span>🎭 إيموجي</span>
                        </button>
                      </div>
                    </div>

                    {/* Current Avatar Live Preview Badge */}
                    <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
                      <span className="text-xs font-extrabold text-slate-500 shrink-0">المعاينة الحالية:</span>
                      <PersonaAvatarDisplay avatar={editingPersona.avatar} name={editingPersona.name} sizeClass="w-10 h-10 text-xl" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900">{editingPersona.name || "اسم الشخصية"}</span>
                        {editingPersona.avatar?.startsWith("http") ? (
                          <span className="block text-[10px] text-emerald-600 font-bold">صورة بورتريه حقيقية 🖼️</span>
                        ) : (
                          <span className="block text-[10px] text-purple-600 font-bold">أيقونة تعبيرية 🎭</span>
                        )}
                      </div>
                    </div>

                    {/* TAB 1: DUCKDUCKGO IMAGE SEARCH */}
                    {avatarTab === "duckduckgo" && (
                      <div className="space-y-2.5 animate-fade-in pt-1">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={ddgSearchQuery}
                              onChange={(e) => setDdgSearchQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSearchDdgImages();
                                }
                              }}
                              placeholder="اكتب كلمة بحث بصرية (مثال: teacher portrait, barista female...)"
                              className="w-full bg-white text-slate-900 font-bold text-xs p-2.5 pr-8 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500/30"
                            />
                            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSearchDdgImages()}
                            disabled={ddgLoading}
                            className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                          >
                            {ddgLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                            <span>بحث DuckDuckGo</span>
                          </button>
                        </div>

                        {/* Quick preset query chips */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-500">مقترحات سريعة:</span>
                          {["female teacher portrait", "male doctor portrait", "barista woman", "tour guide portrait", "young student portrait"].map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => {
                                setDdgSearchQuery(q);
                                handleSearchDdgImages(q);
                              }}
                              className="text-[10px] font-bold bg-white hover:bg-purple-100 text-purple-900 px-2 py-0.5 rounded-lg border border-purple-200 cursor-pointer transition-colors"
                            >
                              + {q}
                            </button>
                          ))}
                        </div>

                        {/* Image Results Grid */}
                        {ddgLoading ? (
                          <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-2">
                            <Loader2 className="w-6 h-6 text-purple-600 animate-spin mx-auto" />
                            <p className="text-xs font-bold text-purple-900">جاري جلب صور البورتريه عبر محرك DuckDuckGo...</p>
                          </div>
                        ) : ddgResults.length > 0 ? (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1.5 bg-white rounded-xl border border-slate-200 custom-scrollbar">
                            {ddgResults.map((item, idx) => {
                              const isSelected = editingPersona.avatar === item.image;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setEditingPersona({ ...editingPersona, avatar: item.image })}
                                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer group ${
                                    isSelected
                                      ? "border-purple-600 ring-2 ring-purple-500/40 scale-95"
                                      : "border-slate-200 hover:border-purple-400 hover:scale-102"
                                  }`}
                                  title={item.title}
                                >
                                  <img
                                    src={item.thumbnail || item.image}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.src = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80";
                                    }}
                                  />
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-purple-900/40 flex items-center justify-center">
                                      <CheckCircle2 className="w-6 h-6 text-white drop-shadow-md" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-4 text-center bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-500">
                            انقر على "بحث DuckDuckGo" لعرض واستعراض صور شخصية حقيقية 🔍
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 2: DIRECT IMAGE URL */}
                    {avatarTab === "link" && (
                      <div className="space-y-2 animate-fade-in pt-1">
                        <label className="block text-xs font-bold text-slate-700">أدخل رابط الصورة المباشر (Direct Image URL):</label>
                        <input
                          type="url"
                          value={editingPersona.avatar?.startsWith("http") ? editingPersona.avatar : ""}
                          onChange={(e) => setEditingPersona({ ...editingPersona, avatar: e.target.value })}
                          placeholder="مثال: https://images.unsplash.com/photo-1534528741775-53994a69daeb..."
                          className="w-full bg-white text-slate-900 font-bold text-xs p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500/30"
                        />
                        <p className="text-[10px] font-medium text-slate-500">
                          يمكنك إدخال أي رابط صورة من الإنترنت (Unsplash, Google Images, إلخ) وسيتم اعتمادها كصورة شخصية حقيقية!
                        </p>
                      </div>
                    )}

                    {/* TAB 3: EMOJIS */}
                    {avatarTab === "emoji" && (
                      <div className="space-y-2 animate-fade-in pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {["🧑‍🏫", "👩‍⚕️", "👨‍🍳", "☕", "✈️", "🎨", "💼", "🏋️", "👩‍💻", "🎓", "🥖", "🕵️", "🎭", "👨‍🔬", "👱‍♀️", "👨‍💼"].map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => setEditingPersona({ ...editingPersona, avatar: emoji })}
                              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all cursor-pointer border ${
                                editingPersona.avatar === emoji
                                  ? "bg-purple-100 border-purple-500 ring-2 ring-purple-500/30 scale-105"
                                  : "bg-white hover:bg-purple-50 border-slate-200"
                              }`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs font-bold text-slate-500 shrink-0">أو اكتب رمز إيموجي مخصص:</span>
                          <input
                            type="text"
                            value={editingPersona.avatar || ""}
                            onChange={(e) => setEditingPersona({ ...editingPersona, avatar: e.target.value })}
                            placeholder="مثال: 👩‍🚀"
                            className="w-24 bg-white text-slate-900 font-black text-center text-lg p-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500/30"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشخصية <span className="text-rose-500">*</span>:</label>
                      <input
                        type="text"
                        value={safeStr(editingPersona.name)}
                        onChange={(e) => setEditingPersona({ ...editingPersona, name: e.target.value })}
                        placeholder="مثال: إيلي / Ellie"
                        className="w-full bg-white text-slate-900 font-bold text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500/30 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">المهنة / الوظيفة:</label>
                      <input
                        type="text"
                        value={safeStr(editingPersona.job)}
                        onChange={(e) => setEditingPersona({ ...editingPersona, job: e.target.value })}
                        placeholder="مثال: بائعة في سوبرماركت"
                        className="w-full bg-white text-slate-900 font-bold text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500/30 shadow-2xs"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className="text-[10px] font-bold text-slate-400">نماذج سريعة:</span>
                        {["بائع سوبرماركت", "مستقبل فنادق", "طبيب عيادة", "مرشد سياحي", "صديق مقرب"].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setEditingPersona({ ...editingPersona, job: preset })}
                            className="text-[10px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-900 px-2 py-0.5 rounded-lg border border-purple-200 cursor-pointer"
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">العمر:</label>
                      <input
                        type="text"
                        value={safeStr(editingPersona.age)}
                        onChange={(e) => setEditingPersona({ ...editingPersona, age: e.target.value })}
                        placeholder="مثال: 24 سنة"
                        className="w-full bg-white text-slate-900 font-bold text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500/30 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">الأصل / المدينة والبلد:</label>
                      <input
                        type="text"
                        value={safeStr(editingPersona.origin)}
                        onChange={(e) => setEditingPersona({ ...editingPersona, origin: e.target.value })}
                        placeholder="مثال: برلين، ألمانيا"
                        className="w-full bg-white text-slate-900 font-bold text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500/30 shadow-2xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">صلة القرابة / العلاقة بالمستخدم (اختياري):</label>
                      <input
                        type="text"
                        value={safeStr(editingPersona.relationship)}
                        onChange={(e) => setEditingPersona({ ...editingPersona, relationship: e.target.value })}
                        placeholder="مثال: اتركه فارغاً إذا لا توجد صلة (طبيب، بائع...) أو اكتب: صديقة ألمانية، جارك في البناية، أختك الصغرى..."
                        className="w-full bg-white text-slate-900 font-bold text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500/30 shadow-2xs"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className="text-[10px] font-bold text-slate-400">خيارات سريعة:</span>
                        {["فارغة (لا توجد صلة / رسمية)", "صديقة ألمانية", "أختك الصغرى", "جارك في البناية", "زميل عمل"].map((relPreset) => (
                          <button
                            key={relPreset}
                            type="button"
                            onClick={() =>
                              setEditingPersona({
                                ...editingPersona,
                                relationship: relPreset.startsWith("فارغة") ? "" : relPreset
                              })
                            }
                            className="text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg border border-amber-200 cursor-pointer"
                          >
                            + {relPreset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الأسلوب ونبرة الكلام:</label>
                    <input
                      type="text"
                      value={safeStr(editingPersona.toneStyle)}
                      onChange={(e) => setEditingPersona({ ...editingPersona, toneStyle: e.target.value })}
                      placeholder="مثال: عفوية، ودودة، سريعة، لغة يومية عملاتية"
                      className="w-full bg-white text-slate-900 font-bold text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500/30 shadow-2xs"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span className="text-[10px] font-bold text-slate-400">نماذج نبرة:</span>
                      {["ودود ومرح", "رسمي واحترافي", "عفوي وسريع", "مرح وفكاهي"].map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => setEditingPersona({ ...editingPersona, toneStyle: tone })}
                          className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 cursor-pointer"
                        >
                          + {tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">اهتمامات وخلفية موضوعات الشخصية:</label>
                    <textarea
                      rows={2.5}
                      value={safeStr(editingPersona.backgroundTopics)}
                      onChange={(e) => setEditingPersona({ ...editingPersona, backgroundTopics: e.target.value })}
                      placeholder="مثال: تعرف كل منتجات المحل، تحب مساعدة الزبائن، تناقش العروض والمخبوزات الطازجة..."
                      className="w-full bg-white text-slate-900 font-medium text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500/30 resize-none shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPersona(null);
                        setIsNewPersona(false);
                      }}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePersona(editingPersona)}
                      disabled={!safeStr(editingPersona.name)}
                      className="px-6 py-2.5 bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>حفظ وإعتماد الشخصية 💾</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* VIEW 2: PERSONAS GALLERY GRID */
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-purple-50/80 p-3 rounded-2xl border border-purple-200/60 flex-wrap gap-2">
                    <span className="text-xs font-extrabold text-purple-950">اختر إحدى الشخصيات أو ولد شخصية جيدة بالـ AI:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPersona({
                            name: "",
                            avatar: "🎭",
                            job: "",
                            age: "",
                            origin: "",
                            relationship: "",
                            toneStyle: "",
                            backgroundTopics: ""
                          });
                          setIsNewPersona(true);
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs rounded-xl shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>توليد بالـ AI 🪄</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingPersona({
                            name: "",
                            avatar: "🎭",
                            job: "",
                            age: "25 سنة",
                            origin: "",
                            relationship: "",
                            toneStyle: "ودود ومرح",
                            backgroundTopics: ""
                          });
                          setIsNewPersona(true);
                        }}
                        className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span>شخصية جديدة</span>
                      </button>
                    </div>
                  </div>

                  {/* Persona Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {personas.map((p) => {
                      const isActive = p.id === activePersonaId;
                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 relative ${
                            isActive
                              ? "bg-purple-50/90 border-purple-400 ring-2 ring-purple-500/30 shadow-md"
                              : "bg-white hover:bg-slate-50/90 border-slate-200/90 shadow-2xs"
                          }`}
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <PersonaAvatarDisplay avatar={p.avatar} name={p.name} sizeClass="w-12 h-12 text-2xl" />
                                <div>
                                  <h4 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
                                    <span>{p.name}</span>
                                    {isActive && <span className="text-emerald-600 text-xs font-black bg-emerald-100 px-1.5 py-0.5 rounded-md">النشط</span>}
                                  </h4>
                                  <p className="text-xs font-bold text-purple-700 mt-0.5">{p.job}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPersona(p);
                                    setIsNewPersona(false);
                                  }}
                                  className="p-2 hover:bg-purple-100 text-purple-800 rounded-xl cursor-pointer transition-colors"
                                  title="تعديل الشخصية"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                {personas.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePersona(p.id)}
                                    className="p-2 hover:bg-rose-100 text-rose-600 rounded-xl cursor-pointer transition-colors"
                                    title="حذف الشخصية"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="text-xs text-slate-700 font-medium space-y-1.5 bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-800">
                                  📍 {p.origin || "غير محدد"} • {p.age || "25 سنة"}
                                </span>
                                {p.relationship && (
                                  <span className="bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/90 text-[11px] font-bold text-amber-900 flex items-center gap-1">
                                    🤝 {p.relationship}
                                  </span>
                                )}
                                <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-[11px] font-bold text-purple-900">
                                  💬 {p.toneStyle || "ودود"}
                                </span>
                              </div>
                              {p.backgroundTopics && (
                                <div className="text-[11px] text-slate-600 leading-relaxed pt-0.5">
                                  🎯 <strong className="text-slate-800">المواضيع:</strong> {p.backgroundTopics}
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              handleSelectPersonaForSession(p.id);
                              setShowPersonaModal(false);
                            }}
                            className={`w-full py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 ${
                              isActive
                                ? "bg-purple-700 text-white shadow-sm"
                                : "bg-slate-100 hover:bg-purple-100 hover:text-purple-900 text-slate-800 border border-slate-200"
                            }`}
                          >
                            {isActive ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                <span>الشخصية النشطة حالياً</span>
                              </>
                            ) : (
                              <span>تحديد كـ شخصية المحادثة ✨</span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center shrink-0 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("هل تريد استعادة جميع الشخصيات الافتراضية الأصلية؟")) {
                      setPersonas(DEFAULT_PERSONAS);
                      setActivePersonaId(DEFAULT_PERSONAS[0].id);
                    }
                  }}
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl border border-purple-200 shadow-2xs"
                >
                  <span>🔄 استعادة الشخصيات الافتراضية</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowPersonaModal(false)}
                className="px-5 sm:px-6 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md cursor-pointer active:scale-95 transition-all"
              >
                إغلاق وفتح المحادثة 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL USER CORRECTION MODAL POPUP */}
      {activeCorrectionModalData && (() => {
        const { corr, msgId, userText: modalUserText, targetLanguage: modalLang } = activeCorrectionModalData;
        const messageInSession = activeSession?.messages.find((m) => m.id === msgId);
        const originalUserText = modalUserText || messageInSession?.text || "";

        return (
          <div 
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
            onClick={() => setActiveCorrectionModalData(null)}
            dir="rtl"
          >
            <div 
              className="bg-white w-full sm:max-w-xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border border-slate-200 flex flex-col text-right font-sans animate-slide-up overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold shadow-xs shrink-0">
                    <Sparkles className="w-5 h-5 text-amber-600 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-1.5">
                      <span>تحليل وتصحيح الجملة</span>
                      {corr.hasErrors && (
                        <span className="text-[10px] font-black bg-rose-500 text-white px-2 py-0.5 rounded-full">
                          توجد أخطاء
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      تقرير التقييم والتصحيح اللغوي لرسالتك
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCorrectionModalData(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto space-y-3.5 py-3.5 pr-1 text-slate-900 text-sm custom-scrollbar">
                {/* 1. Score & Grade Badge */}
                {corr.score !== undefined && corr.gradeLabel && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/90 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-xs ${
                          corr.score >= 85
                            ? "bg-emerald-600"
                            : corr.score >= 65
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                      >
                        {corr.score}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-base">
                            {corr.gradeLabel}
                          </span>
                          <Award className="w-4 h-4 text-amber-600" />
                        </div>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">
                          نتيجة التقييم اللغوي
                        </p>
                      </div>
                    </div>

                    {corr.correctedText && (
                      <button
                        type="button"
                        onClick={() => handleSpeakText(corr.correctedText, modalLang)}
                        className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl transition-colors cursor-pointer"
                        title="استماع لنطق التصحيح"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {/* 1.5. Original User Message */}
                {originalUserText && (
                  <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-2xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-black text-blue-900">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-[#0056f6]" />
                        رسالتك التي كتبتها:
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSpeakText(originalUserText, modalLang)}
                          className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-lg transition-colors cursor-pointer"
                          title="استماع لنطق الرسالة الأصلية"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyText(originalUserText, msgId + "_orig_text")}
                          className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-lg transition-colors cursor-pointer"
                          title="نسخ النص الأصلي"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div
                      className="p-3 bg-[#0056f6] text-white rounded-xl border border-blue-400 font-bold text-base sm:text-lg text-left select-text shadow-2xs leading-relaxed"
                      dir={modalLang === "Arabic" ? "rtl" : "ltr"}
                    >
                      {originalUserText}
                    </div>
                  </div>
                )}

                {/* 2. Corrected phrasing */}
                {corr.correctedText && (
                  <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-2xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-black text-emerald-900">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        الصياغة الأصح والخالية تماماً من الأخطاء:
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSpeakText(corr.correctedText, modalLang)}
                          className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg transition-colors cursor-pointer"
                          title="استماع لنطق التصحيح"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyText(corr.correctedText, msgId + "_corr_text")}
                          className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg transition-colors cursor-pointer"
                          title="نسخ النص التصحيحي"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-emerald-200/80 text-slate-950 font-bold text-base sm:text-lg text-left select-text shadow-2xs leading-relaxed" dir="ltr">
                      {corr.correctedText}
                    </div>
                  </div>
                )}

                {/* 3. Discovered Errors Breakdown */}
                {corr.hasErrors && corr.corrections && corr.corrections.length > 0 ? (
                  <div className="space-y-2.5">
                    <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>الأخطاء المكتشفة وتفاصيل تصحيحها ({corr.corrections.length}):</span>
                    </h5>
                    <div className="space-y-2">
                      {corr.corrections.map((item, idx) => {
                        const typeBadge =
                          item.type === "grammar"
                            ? { label: "قواعد", bg: "bg-purple-100 text-purple-900 border-purple-200" }
                            : item.type === "spelling"
                            ? { label: "إملاء", bg: "bg-rose-100 text-rose-900 border-rose-200" }
                            : item.type === "vocabulary"
                            ? { label: "مفردات", bg: "bg-amber-100 text-amber-900 border-amber-200" }
                            : { label: "أسلوب", bg: "bg-blue-100 text-blue-900 border-blue-200" };

                        return (
                          <div
                            key={idx}
                            className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs shadow-2xs"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap" dir="ltr">
                                <span className="line-through text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 text-left select-text" dir="ltr">
                                  {item.originalSegment}
                                </span>
                                <span className="text-emerald-600 font-black text-sm">➔</span>
                                <span className="text-emerald-800 font-extrabold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 text-left select-text" dir="ltr">
                                  {item.correctedSegment}
                                </span>
                              </div>
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${typeBadge.bg}`}>
                                {typeBadge.label}
                              </span>
                            </div>
                            {item.reasonAr && (
                              <>
                                <div className="w-full border-t border-slate-200/80 my-2" />
                                <div className="text-slate-800 font-medium leading-relaxed text-xs sm:text-sm bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                                  <FormattedText text={item.reasonAr} onCreateCard={handleMakeCardFromQuotedText} />
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-100/60 border border-emerald-200 rounded-2xl text-xs sm:text-sm font-extrabold text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>ممتاز جداً! رسالتك سليمة لغوياً وخالية من أي أخطاء.</span>
                  </div>
                )}

                {/* 4. Native Speaker Version */}
                {corr.nativeVersion && (
                  <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-black text-amber-900">
                      <span className="flex items-center gap-1.5">
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                        طريقة المتحدث الأصلي في هذا السياق (Native Phrasing):
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSpeakText(corr.nativeVersion!, modalLang)}
                          className="p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg transition-colors cursor-pointer"
                          title="استماع"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyText(corr.nativeVersion!, msgId + "_nat_text")}
                          className="p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg transition-colors cursor-pointer"
                          title="نسخ"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="p-3 bg-white rounded-xl border border-amber-200/80 text-slate-950 font-bold text-base sm:text-lg text-left select-text leading-relaxed" dir="ltr">
                      {corr.nativeVersion}
                    </p>
                  </div>
                )}

                {/* 5. Improved Expression */}
                {corr.improvedExpressionText && (
                  <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-indigo-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        تحسين التعبير والصياغة المتقدمة:
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSpeakText(corr.improvedExpressionText!, modalLang)}
                          className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 rounded-lg transition-colors cursor-pointer"
                          title="استماع لنطق التعبير المحسن"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyText(corr.improvedExpressionText!, msgId + "_imp_text")}
                          className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 rounded-lg transition-colors cursor-pointer"
                          title="نسخ"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="p-3 bg-white rounded-xl border border-indigo-200 text-indigo-950 font-black text-base sm:text-lg text-left select-text leading-relaxed" dir="ltr">
                      {corr.improvedExpressionText}
                    </p>
                    {corr.improvedExpressionExplanationAr && (
                      <div className="text-xs text-slate-700 font-medium leading-relaxed pr-0.5" dir="rtl">
                        💡 <FormattedText text={corr.improvedExpressionExplanationAr} onCreateCard={handleMakeCardFromQuotedText} />
                      </div>
                    )}
                  </div>
                )}

                {/* 6. Positive Feedback & Grammar Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {corr.positiveFeedbackAr && (
                    <div className="p-3 bg-violet-50 border border-violet-200 rounded-2xl">
                      <span className="font-bold text-violet-900 block mb-0.5">✨ نقاط القوة الممتازة:</span>
                      <div className="text-slate-700 font-medium leading-snug">
                        <FormattedText text={corr.positiveFeedbackAr} onCreateCard={handleMakeCardFromQuotedText} />
                      </div>
                    </div>
                  )}

                  {corr.grammarSummaryAr && (
                    <div className="p-3 bg-sky-50 border border-sky-200 rounded-2xl">
                      <span className="font-bold text-sky-900 block mb-0.5">📚 قاعدة هامة للتذكر:</span>
                      <div className="text-slate-700 font-medium leading-snug">
                        <FormattedText text={corr.grammarSummaryAr} onCreateCard={handleMakeCardFromQuotedText} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Legacy Explanation if present */}
                {corr.explanationAr && !corr.grammarSummaryAr && (
                  <div className="p-3 bg-amber-100/60 rounded-2xl border border-amber-200 text-amber-950 text-xs sm:text-sm font-medium leading-relaxed">
                    <span className="font-extrabold text-amber-900 block mb-1">💡 ملحوظة ونقاط تعليمية:</span>
                    {corr.explanationAr}
                  </div>
                )}

                {/* 7. Flashcard Action Button */}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      handleCreateFlashcardsFromAnalysis(msgId + "_user_corr", corr);
                      setActiveCorrectionModalData(null);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-amber-900 hover:bg-amber-950 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <BookOpen className="w-4 h-4 text-amber-300" />
                    <span>حفظ أخطاء الجملة كبطاقات استذكار 📥</span>
                  </button>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveCorrectionModalData(null)}
                  className="w-full py-3 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl transition-all cursor-pointer shadow-xs active:scale-98"
                >
                  إغلاق والعودة للمحادثة
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
