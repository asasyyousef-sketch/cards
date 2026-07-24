import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Search, Image as ImageIcon, Volume2, Link as LinkIcon, Plus, Check, ChevronLeft, ChevronRight, ChevronDown, FolderOpen, HelpCircle, Trash2, Settings, AlertCircle, Play, Folder as LucideFolder, FileText, Eye, Pencil, Headphones, BookOpen, Layers, Copy, Shuffle, Move, Key, Timer, History } from "lucide-react";
import { Folder, Flashcard, ReviewMethod, getSafeImageStyle } from "../types";

// Helper for Arabic voice synthesis fallback on the client
let currentActiveAudio: HTMLAudioElement | null = null;

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

export const stopActiveAudio = () => {
  if (currentActiveAudio) {
    fadeAndStopAudio(currentActiveAudio);
    currentActiveAudio = null;
  }
};

export const preloadTTS = async (text: string, lang: string): Promise<string> => {
  if (!text || !text.trim()) return "";
  const cleanText = text.trim();
  const cacheKey = `${cleanText}_${lang}`;
  if (ttsCache[cacheKey]) {
    return ttsCache[cacheKey];
  }

  const url = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}`;

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

export const speakClient = async (text: string, lang: string) => {
  if (!text || !text.trim()) return;
  const cleanText = text.trim();
  stopActiveAudio();

  const cacheKey = `${cleanText}_${lang}`;
  let cachedUrl = ttsCache[cacheKey];

  if (!cachedUrl && "caches" in window) {
    try {
      const url = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}`;
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(url);
      if (cachedResponse && cachedResponse.ok) {
        const cType = cachedResponse.headers.get("content-type") || "";
        if (cType.includes("audio")) {
          const blob = await cachedResponse.blob();
          if (blob.size > 100) {
            cachedUrl = URL.createObjectURL(blob);
            ttsCache[cacheKey] = cachedUrl;
          } else {
            await cache.delete(url);
          }
        } else {
          await cache.delete(url);
        }
      }
    } catch (err) {
      console.warn("Failed to match in caches for play:", err);
    }
  }

  const playDirectNetwork = () => {
    const networkUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}&_t=${Date.now()}`;
    const audio = new Audio(networkUrl);
    currentActiveAudio = audio;
    audio.play().catch((err) => {
      console.warn("Direct network TTS play failed:", err);
    });
  };

  if (cachedUrl) {
    const audio = new Audio(cachedUrl);
    currentActiveAudio = audio;
    audio.play().catch((err) => {
      console.warn("Cached audio play failed, clearing stale cache and falling back to network:", err);
      delete ttsCache[cacheKey];
      if ("caches" in window) {
        caches.open(CACHE_NAME).then((c) => c.delete(`/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}`));
      }
      playDirectNetwork();
    });
  } else {
    try {
      const preloadedUrl = await preloadTTS(cleanText, lang);
      if (preloadedUrl) {
        const audio = new Audio(preloadedUrl);
        currentActiveAudio = audio;
        audio.play().catch((err) => {
          console.warn("Preloaded audio play failed, falling back to direct network:", err);
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

const playBrowserSynthesis = (text: string, lang: string) => {
  // Completely disabled to remove the un-advanced browser voice fallback
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
      setCorrectArticle(card.correctArticle || "");
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
                        {React.cloneElement(m.iconElement as React.ReactElement, {
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
                                  {React.cloneElement(mObj.iconElement as React.ReactElement, {
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
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [audioApi, setAudioApi] = useState("google_proxy");
  const [customTtsUrl, setCustomTtsUrl] = useState("");
  const [imageApi, setImageApi] = useState("duckduckgo");
  const [pixabayKey, setPixabayKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState("gemini");

  // Site scale zoom states
  const [siteScale, setSiteScale] = useState(100);
  const initialScaleRef = useRef(100);

  // Cache Manager states
  const [imageCacheCount, setImageCacheCount] = useState<number | null>(null);
  const [imageCacheSize, setImageCacheSize] = useState<string | null>(null);
  const [ttsCacheCount, setTtsCacheCount] = useState<number | null>(null);
  const [ttsCacheSize, setTtsCacheSize] = useState<string | null>(null);
  const [isCalculatingCache, setIsCalculatingCache] = useState(false);

  // Sandbox states
  const [testVoiceText, setTestVoiceText] = useState("Hallo, wie geht es dir heute?");
  const [testVoiceLang, setTestVoiceLang] = useState("de");
  const [isSpeaking, setIsSpeaking] = useState(false);

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
      
      const savedScale = localStorage.getItem("settings_site_scale");
      const initialScale = savedScale ? parseInt(savedScale, 10) : 100;
      setSiteScale(initialScale);
      initialScaleRef.current = initialScale;

      // reset test state
      setTestImages([]);
      setImgSearchStatus(null);
      
      calculateCacheStats();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem("settings_audio_api", audioApi);
    localStorage.setItem("settings_custom_tts_url", customTtsUrl);
    localStorage.setItem("settings_image_api", imageApi);
    localStorage.setItem("settings_pixabay_key", pixabayKey);
    localStorage.setItem("settings_gemini_api_key", geminiApiKey);
    localStorage.setItem("settings_groq_api_key", groqApiKey);
    localStorage.setItem("settings_ai_provider", aiProvider);
    localStorage.setItem("settings_site_scale", String(siteScale));
    onClose();
  };

  const handleCancel = () => {
    applyScale(initialScaleRef.current);
    onClose();
  };

  const handleTestSpeech = () => {
    setIsSpeaking(true);
    
    // Save current values temporarily to make speakClient use them
    const origApi = localStorage.getItem("settings_audio_api");
    const origUrl = localStorage.getItem("settings_custom_tts_url");

    localStorage.setItem("settings_audio_api", audioApi);
    localStorage.setItem("settings_custom_tts_url", customTtsUrl);

    speakClient(testVoiceText, testVoiceLang);

    // Restore after a short delay
    setTimeout(() => {
      if (origApi) localStorage.setItem("settings_audio_api", origApi);
      else localStorage.removeItem("settings_audio_api");
      if (origUrl) localStorage.setItem("settings_custom_tts_url", origUrl);
      else localStorage.removeItem("settings_custom_tts_url");
      setIsSpeaking(false);
    }, 1500);
  };

  const handleTestImageSearch = async () => {
    if (!testImgQuery.trim()) return;
    setIsSearchingImages(true);
    setImgSearchStatus(null);
    try {
      // Dynamically resolve base API URL for dual-environment compatibility (local dev vs cloud preview)
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

  // Adjust placeholder text when lang changes
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
            <h2 className="font-bold text-lg text-on-surface">إعدادات الصوت والصور وتجربتها</h2>
          </div>
          <button onClick={handleCancel} className="text-outline hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-low cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Section 0: AI Provider & API Key Settings */}
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
          </div>

          {/* Section 1: Audio/TTS Settings */}
          <div className="p-5 rounded-2xl border border-outline-variant/40 bg-surface-container-low/50 space-y-4">
            <h3 className="font-bold text-base text-primary flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              <span>إعدادات نطق الكلمات (TTS API)</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAudioApi("google_proxy")}
                className={`p-3.5 rounded-xl border text-right flex flex-col gap-1 transition-all ${
                  audioApi === "google_proxy"
                    ? "border-primary bg-primary/5 text-primary shadow-sm font-bold"
                    : "border-outline-variant bg-surface hover:border-outline hover:bg-surface-container-high"
                }`}
              >
                <span className="font-bold text-sm">مترجم جوجل المطور</span>
                <span className="text-xs text-on-surface-variant leading-relaxed">نطق سحابي عالي الدقة ومعبر بمخارج صحيحة.</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioApi("web_speech")}
                className={`p-3.5 rounded-xl border text-right flex flex-col gap-1 transition-all ${
                  audioApi === "web_speech"
                    ? "border-primary bg-primary/5 text-primary shadow-sm font-bold"
                    : "border-outline-variant bg-surface hover:border-outline hover:bg-surface-container-high"
                }`}
              >
                <span className="font-bold text-sm">نطق المتصفح المدمج</span>
                <span className="text-xs text-on-surface-variant leading-relaxed">يعتمد على محرك النطق في جهازك محلياً بلا إنترنت.</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioApi("custom")}
                className={`p-3.5 rounded-xl border text-right flex flex-col gap-1 transition-all ${
                  audioApi === "custom"
                    ? "border-primary bg-primary/5 text-primary shadow-sm font-bold"
                    : "border-outline-variant bg-surface hover:border-outline hover:bg-surface-container-high"
                }`}
              >
                <span className="font-bold text-sm">رابط API مخصص</span>
                <span className="text-xs text-on-surface-variant leading-relaxed">إمكانية استخدام خادم نطق خارجي مخصص لتطبيقك.</span>
              </button>
            </div>

            {audioApi === "custom" && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-bold text-on-surface-variant">رابط الـ API للنطق (TTS Endpoint URL):</label>
                <input
                  type="text"
                  value={customTtsUrl}
                  onChange={(e) => setCustomTtsUrl(e.target.value)}
                  placeholder="https://api.example.com/tts?text={text}&lang={lang}"
                  className="w-full text-sm px-4 py-2.5 rounded-xl border border-outline bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none font-mono"
                />
                <p className="text-[10.5px] text-on-surface-variant leading-relaxed font-semibold">
                  * سيتم استبدال الرموز <code className="font-mono bg-surface-container-high px-1 rounded text-primary">{`{text}`}</code> بالكلمة المراد نطقها، والرمز <code className="font-mono bg-surface-container-high px-1 rounded text-primary">{`{lang}`}</code> برمز اللغة (مثل de, en, ar).
                </p>
              </div>
            )}

            {/* Audio Sandbox Play Area */}
            <div className="mt-4 p-4 rounded-xl bg-surface-container-high/60 border border-outline-variant/30 space-y-3">
              <span className="text-xs font-bold text-primary block">🧪 معمل تجربة الصوت والنطق:</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={testVoiceText}
                    onChange={(e) => setTestVoiceText(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface focus:outline-none"
                    placeholder="اكتب كلمة أو جملة لتجربتها..."
                  />
                </div>
                <div className="w-full sm:w-40">
                  <select
                    value={testVoiceLang}
                    onChange={(e) => handleLangChange(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface focus:outline-none font-semibold"
                  >
                    <option value="de">الألمانية (de)</option>
                    <option value="en">الإنجليزية (en)</option>
                    <option value="ar">العربية (ar)</option>
                    <option value="es">الإسبانية (es)</option>
                    <option value="fr">الفرنسية (fr)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleTestSpeech}
                  disabled={isSpeaking || !testVoiceText.trim()}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:bg-primary-container transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isSpeaking ? "يجري التشغيل..." : "استمع وجرب"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Image API Settings */}
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
                <p className="text-[10.5px] text-on-surface-variant leading-relaxed flex items-start gap-1.5 font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                  <span>
                    الرجاء إدخال مفتاح Pixabay الخاص بك للبحث بنجاح عند تفعيل هذا الخيار.
                  </span>
                </p>
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

          {/* Section 3: Site Scaling Settings */}
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

          {/* Section 4: Cache Manager */}
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
            <h3 className="text-sm font-extrabold text-on-surface flex items-center gap-2 mb-1.5">
              <Trash2 className="w-5 h-5 text-purple-600" />
              <span>4. إدارة الذاكرة المؤقتة (Cache Manager)</span>
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
