import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Flag, Volume2, HelpCircle, RefreshCw, CheckCircle, AlertCircle, Timer, Award, Trophy, ArrowLeft, ArrowRight, Play, Pause, Eye, RotateCcw, ThumbsUp, ThumbsDown, Sparkles, ChevronRight, ChevronUp, ChevronDown, MoreHorizontal, Sliders, Shuffle, EyeOff, VolumeX, Clock, Layers, Pencil, Plus, Check, Moon, Sun, DownloadCloud, Image as ImageIcon, CheckCircle2, Loader2, Download, Minimize2, Maximize2, Repeat, Trash2, ArrowUp, ArrowDown, Music, Mic, Save, Square, Bot, MessageSquare } from "lucide-react";
import { Flashcard, Folder, ReviewMethod, getSafeImageStyle, getCardSearchQuery } from "../types";
import { speakClient, preloadTTS, ttsCache, stopActiveAudio, fadeAndStopAudio, preloadImage, imageCache, invalidateImageCache, playPiperLocalWasm } from "./Modals";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { ReviewChatModal } from "./ReviewChatModal";

export const globallyLoadedImages = new Set<string>();
let sharedAudioCtx: AudioContext | null = null;

export const getSharedAudioContext = (): AudioContext | null => {
  try {
    if (typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (e) {
    console.warn("Failed to initialize or resume shared AudioContext", e);
    return null;
  }
};

// Global unlock listener on mobile devices
if (typeof window !== "undefined") {
  const unlockAudioContext = () => {
    try {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}
  };
  window.addEventListener("touchstart", unlockAudioContext, { passive: true });
  window.addEventListener("touchend", unlockAudioContext, { passive: true });
  window.addEventListener("click", unlockAudioContext, { passive: true });
  window.addEventListener("keydown", unlockAudioContext, { passive: true });
}

export const ddgImagesCache: { [query: string]: string[] } = {};
export const brokenImagesSet = new Set<string>();

const prefetchDdgImagesForCard = async (card: Flashcard) => {
  // First check if auto_images_ is already stored locally or attached to card
  try {
    const rawAuto = localStorage.getItem(`auto_images_${card.id}`);
    if (rawAuto) {
      const parsed = JSON.parse(rawAuto);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach((url: string) => {
          if (url) preloadImage(url).catch(() => {});
        });
        return; // Already cached locally
      }
    }
  } catch (e) {}

  if (card.autoImageCandidates && Array.isArray(card.autoImageCandidates) && card.autoImageCandidates.length > 0) {
    card.autoImageCandidates.forEach((url: string) => {
      if (url) preloadImage(url).catch(() => {});
    });
    return; // Already cached on card
  }

  const query = getCardSearchQuery(card);
  if (!query) return;
  
  if (ddgImagesCache[query]) {
    return;
  }

  try {
    const res = await fetch(`/api/images?q=${encodeURIComponent(query)}&page=1&provider=duckduckgo`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.hits && data.hits.length > 0) {
        const urls = data.hits.slice(0, 10)
          .map((h: any) => h.largeImageURL || h.webformatURL)
          .filter((url: string) => typeof url === "string" && url.startsWith("http") && !brokenImagesSet.has(url));
        
        ddgImagesCache[query] = urls;

        // Preload each image in the background using the existing preloadImage helper
        urls.forEach((url: string) => {
          preloadImage(url).catch(() => {});
        });
      }
    }
  } catch (err) {
    console.error("Failed to prefetch images for card:", query, err);
  }
};

export interface RepeatSequenceStep {
  id: string;
  type: "speak" | "pause" | "note";
  voice?: string;
  pauseDuration?: number;
  noteType?:
    | "start"
    | "end"
    | "chime"
    | "ding"
    | "pop"
    | "marimba"
    | "success"
    | "double_chime"
    | "tick"
    | "bell"
    | "laser";
  includeArticle?: "auto" | "with" | "indefinite" | "without";
}

export const formatTextForArticleMode = (
  text: string,
  mode?: "auto" | "with" | "indefinite" | "without",
  card?: Flashcard | null
): string => {
  if (!text || !mode || mode === "auto") return text;

  const trimmedText = text.trim();

  // Article mode is considered active ONLY if card explicitly has isArticleMode === true OR has a non-empty correctArticle
  const isArticleActive = Boolean(card?.isArticleMode || card?.correctArticle);

  // If article mode is not active for this card, read automatically (raw card text)
  if (!isArticleActive && (mode === "with" || mode === "indefinite")) {
    return text;
  }

  // Determine the article stored in the card (or detect from text if present)
  let rawArt = card?.correctArticle?.trim()?.toLowerCase() || "";
  if (!rawArt) {
    const match = trimmedText.match(/^(der|die|das)\s+/i);
    if (match) {
      rawArt = match[1].toLowerCase();
    }
  }

  // Extract clean noun without leading article if present
  let cleanNoun = trimmedText;
  const germanArticlesRegex = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\s+/i;

  if (rawArt) {
    const checkArt = rawArt === "die-plural" ? "die" : rawArt;
    if (cleanNoun.toLowerCase().startsWith(checkArt + " ")) {
      cleanNoun = cleanNoun.slice(checkArt.length).trim();
    } else if (germanArticlesRegex.test(cleanNoun)) {
      cleanNoun = cleanNoun.replace(germanArticlesRegex, "").trim();
    }
  } else if (germanArticlesRegex.test(cleanNoun)) {
    cleanNoun = cleanNoun.replace(germanArticlesRegex, "").trim();
  }

  // 1. Without Article
  if (mode === "without") {
    return cleanNoun;
  }

  // 2. Definite Article (der / die / das)
  if (mode === "with") {
    let defArt = rawArt;
    if (defArt === "die-plural") defArt = "die";
    if (!defArt) defArt = "der";
    return `${defArt} ${cleanNoun}`;
  }

  // 3. Indefinite Article (ein / eine)
  if (mode === "indefinite") {
    if (rawArt === "der" || rawArt === "das") {
      return `ein ${cleanNoun}`;
    } else if (rawArt === "die") {
      return `eine ${cleanNoun}`;
    } else if (rawArt === "die-plural") {
      // Plural in German has NO indefinite article
      return cleanNoun;
    } else {
      return `ein ${cleanNoun}`;
    }
  }

  return text;
};

export interface SavedCustomRepeatPlan {
  id: string;
  name: string;
  sequence: RepeatSequenceStep[];
}

export const DEFAULT_REPEAT_SEQUENCE: RepeatSequenceStep[] = [
  { id: "s1", type: "speak", voice: "default" },
  { id: "s2", type: "pause", pauseDuration: 1.0 },
  { id: "s3", type: "speak", voice: "default" },
];

export const PRESET_REPEAT_PLANS: SavedCustomRepeatPlan[] = [
  {
    id: "preset_balanced_2x",
    name: "2x متوازن (افتراضي)",
    sequence: [
      { id: "s1", type: "speak", voice: "default" },
      { id: "s2", type: "pause", pauseDuration: 1.0 },
      { id: "s3", type: "speak", voice: "default" },
    ],
  },
  {
    id: "preset_intensive_3x",
    name: "3x ثلاثي مكثف",
    sequence: [
      { id: "s1", type: "speak", voice: "default" },
      { id: "s2", type: "pause", pauseDuration: 0.5 },
      { id: "s3", type: "speak", voice: "default" },
      { id: "s4", type: "pause", pauseDuration: 0.5 },
      { id: "s5", type: "speak", voice: "default" },
    ],
  },
  {
    id: "preset_interactive_training",
    name: "🎤 لوحة التدريب والترديد",
    sequence: [
      { id: "s1", type: "speak", voice: "primary" },
      { id: "s2", type: "pause", pauseDuration: 0.5 },
      { id: "s3", type: "speak", voice: "primary" },
      { id: "s4", type: "note", noteType: "start" },
      { id: "s5", type: "pause", pauseDuration: 3.0 },
      { id: "s6", type: "note", noteType: "end" },
      { id: "s7", type: "speak", voice: "secondary" },
    ],
  },
];

export const playAudioNote = (
  type:
    | "start"
    | "end"
    | "chime"
    | "ding"
    | "pop"
    | "marimba"
    | "success"
    | "double_chime"
    | "tick"
    | "bell"
    | "laser"
    | string
) => {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const fire = () => {
      try {
        const now = ctx.currentTime;

        const playTone = (
          freq: number,
          duration: number,
          waveType: OscillatorType = "sine",
          startGain = 0.2,
          freqEnd?: number,
          delay = 0
        ) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = waveType;
          osc.connect(gain);
          gain.connect(ctx.destination);

          const tStart = now + delay;
          const tEnd = tStart + duration;

          osc.frequency.setValueAtTime(freq, tStart);
          if (freqEnd !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 10), tEnd);
          }

          gain.gain.setValueAtTime(startGain, tStart);
          gain.gain.exponentialRampToValueAtTime(0.001, tEnd);

          osc.start(tStart);
          osc.stop(tEnd);
        };

        if (type === "start") {
          playTone(523.25, 0.25, "sine", 0.22, 659.25);
        } else if (type === "end") {
          playTone(659.25, 0.25, "sine", 0.22, 440);
        } else if (type === "ding") {
          playTone(1046.5, 0.3, "sine", 0.25);
        } else if (type === "pop") {
          playTone(600, 0.08, "sine", 0.25, 150);
        } else if (type === "marimba") {
          playTone(523.25, 0.18, "sine", 0.3);
          playTone(1046.5, 0.12, "triangle", 0.1, undefined, 0.01);
        } else if (type === "success") {
          playTone(523.25, 0.12, "sine", 0.2, undefined, 0);
          playTone(659.25, 0.12, "sine", 0.2, undefined, 0.08);
          playTone(783.99, 0.25, "sine", 0.22, undefined, 0.16);
        } else if (type === "double_chime") {
          playTone(880, 0.15, "triangle", 0.2, undefined, 0);
          playTone(1046.5, 0.25, "triangle", 0.2, undefined, 0.12);
        } else if (type === "tick") {
          playTone(1200, 0.03, "square", 0.12);
        } else if (type === "bell") {
          playTone(1318.51, 0.4, "sine", 0.22);
          playTone(2637, 0.2, "sine", 0.08);
        } else if (type === "laser") {
          playTone(900, 0.12, "sine", 0.22, 200);
        } else {
          // "chime" or fallback
          playTone(880, 0.35, "triangle", 0.18);
        }
      } catch (err) {
        console.warn("Could not play oscillator tone", err);
      }
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(fire).catch(fire);
    } else {
      fire();
    }
  } catch (err) {
    console.warn("Could not play audio note", err);
  }
};

interface ImageWithSkeletonProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  loading?: "lazy" | "eager";
  fetchPriority?: string;
  onError?: (url: string) => void;
}

export const ImageWithSkeleton: React.FC<ImageWithSkeletonProps> = ({
  src,
  alt,
  className = "",
  style,
  referrerPolicy = "no-referrer",
  loading,
  fetchPriority,
  onError,
}) => {
  const [prevSrc, setPrevSrc] = useState(src);
  const [forceDirectSrc, setForceDirectSrc] = useState(false);

  const currentResolved = (!forceDirectSrc && src && imageCache[src]) ? imageCache[src] : src;
  const [resolvedSrc, setResolvedSrc] = useState(currentResolved);

  const [loaded, setLoaded] = useState(() => {
    if (!resolvedSrc) return true;
    if (resolvedSrc.startsWith("data:") || globallyLoadedImages.has(resolvedSrc)) return true;
    return false;
  });
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // If the src is known to be broken, immediately trigger onError
  useEffect(() => {
    if (src && brokenImagesSet.has(src)) {
      if (onError) onError(src);
    }
  }, [src, onError]);

  // Synchronize state immediately in the render pass if src prop changes
  if (src !== prevSrc) {
    setPrevSrc(src);
    setForceDirectSrc(false);
    const nextResolved = (src && imageCache[src]) ? imageCache[src] : src;
    setResolvedSrc(nextResolved);
    const alreadyLoaded = !nextResolved || nextResolved.startsWith("data:") || globallyLoadedImages.has(nextResolved);
    setLoaded(alreadyLoaded);
    setError(false);
  }

  const handleImageError = () => {
    if (src && resolvedSrc !== src) {
      // Invalidate broken blob/cache and fallback immediately to direct original src
      invalidateImageCache(src);
      setForceDirectSrc(true);
      setResolvedSrc(src);
      setError(false);
      setLoaded(false);
    } else {
      if (src) {
        brokenImagesSet.add(src);
      }
      setError(true);
      if (onError && src) onError(src);
    }
  };

  useEffect(() => {
    if (src && !imageCache[src] && !forceDirectSrc && src.startsWith("http")) {
      preloadImage(src).then((blobUrl) => {
        if (blobUrl && blobUrl !== src) {
          setResolvedSrc(blobUrl);
        }
      }).catch(() => {});
    }
  }, [src, forceDirectSrc]);

  useEffect(() => {
    if (!resolvedSrc) return;

    // Check if browser DOM says it's already completely loaded and valid
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        globallyLoadedImages.add(resolvedSrc);
        setLoaded(true);
        return;
      } else {
        handleImageError();
        return;
      }
    }

    // Secondary instantaneous check using Image object
    const img = new Image();
    img.src = resolvedSrc;
    if (img.complete) {
      if (img.naturalWidth > 0) {
        globallyLoadedImages.add(resolvedSrc);
        setLoaded(true);
        return;
      } else {
        handleImageError();
        return;
      }
    }

    let isMounted = true;

    // Safety fallback timeout: if stuck on loading for > 4.5 seconds
    const timeoutId = setTimeout(() => {
      if (isMounted && !loaded) {
        if (src && resolvedSrc !== src) {
          invalidateImageCache(src);
          setForceDirectSrc(true);
          setResolvedSrc(src);
        } else {
          setLoaded(true);
        }
      }
    }, 4500);

    img.onload = () => {
      if (isMounted) {
        clearTimeout(timeoutId);
        if (img.naturalWidth > 0) {
          globallyLoadedImages.add(resolvedSrc);
          setLoaded(true);
        } else {
          handleImageError();
        }
      }
    };

    img.onerror = () => {
      if (isMounted) {
        clearTimeout(timeoutId);
        handleImageError();
      }
    };

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };
  }, [resolvedSrc, src]);

  return (
    <div className="absolute inset-0 w-full h-full bg-surface-container-low flex items-center justify-center overflow-hidden">
      {!loaded && !error && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-slate-100/90 dark:bg-slate-800/90 animate-pulse z-[2]">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary/60 mb-1.5">
            <span className="material-symbols-outlined text-lg animate-bounce">image</span>
          </div>
          <span className="text-[10px] text-outline/80 font-sans font-bold">جاري تحميل الصورة...</span>
        </div>
      )}

      {error ? (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-slate-100/30 dark:bg-slate-800/30 p-2 text-center z-[1] select-none">
          <span className="material-symbols-outlined text-3xl text-slate-400/40 dark:text-slate-500/40">style</span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={alt}
          className={`${className} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          style={style}
          referrerPolicy={referrerPolicy}
          loading={loading}
          {...(fetchPriority ? { fetchPriority: fetchPriority as any } : {})}
          onLoad={(e) => {
            const target = e.currentTarget;
            if (target.naturalWidth > 0) {
              globallyLoadedImages.add(resolvedSrc);
              setLoaded(true);
            } else {
              handleImageError();
            }
          }}
          onError={handleImageError}
        />
      )}
    </div>
  );
};

interface StudyCardProps {
  card: Flashcard;
  globalFlipped: boolean;
  onFlipToggle: () => void;
  hideFront: boolean;
  hideBack: boolean;
  onPlayPronunciation: (text: string, lang: string) => void;
  onPlaySecondaryPronunciation?: (text: string, lang: string) => void;
  getSafeImageStyle: (pos?: string) => React.CSSProperties;
  onClassicKnow: (correct: boolean) => void;
  showPluralOverride?: boolean;
  isSwipeImageEnabled?: boolean;
  swipeSensitivity?: number;
  reviewVoiceTarget?: "primary" | "secondary";
}

const StudyCard: React.FC<StudyCardProps> = ({
  card,
  globalFlipped,
  onFlipToggle,
  hideFront,
  hideBack,
  onPlayPronunciation,
  onPlaySecondaryPronunciation,
  getSafeImageStyle,
  onClassicKnow,
  showPluralOverride,
  isSwipeImageEnabled = true,
  swipeSensitivity = 40,
  reviewVoiceTarget = "primary",
}) => {
  // Capture card in local state so it stays exactly the same when unmounting/exiting
  const [localCard, setLocalCard] = useState(card);
  
  // Track flipping locally but synchronized with global state changes
  const [localFlipped, setLocalFlipped] = useState(globalFlipped);

  const [revealFrontTemp, setRevealFrontTemp] = useState(false);
  const [revealBackTemp, setRevealBackTemp] = useState(false);
  const [showPlural, setShowPlural] = useState(false);

  // --- SWIPE TO CHANGE IMAGE STATES & FUNCTIONS ---
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [imagePage, setImagePage] = useState(1);
  const [isCachingCard, setIsCachingCard] = useState(false);
  const [cacheSuccessMsg, setCacheSuccessMsg] = useState(false);

  // --- DESCRIPTION POPUP MODAL STATE & HANDLERS (LONG PRESS ONLY) ---
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startLongPress = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setIsDescriptionModalOpen(true);
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDescriptionClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card flip on click, do NOT open modal
    cancelLongPress();
  };

  const handleDescriptionContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDescriptionModalOpen(true);
  };

  // Check if night mode is enabled
  const isDark = (typeof window !== "undefined" && (
    localStorage.getItem("settings_review_night_mode") === "true" || 
    document.documentElement.classList.contains("dark") ||
    document.querySelector(".review-night-mode") !== null
  ));

  const handleCacheThisCardImages = async () => {
    if (isCachingCard) return;
    setIsCachingCard(true);
    setCacheSuccessMsg(false);

    try {
      let urlsToCache = [...extraImages];
      if (urlsToCache.length === 0 && localCard.autoImageCandidates && localCard.autoImageCandidates.length > 0) {
        urlsToCache = [...localCard.autoImageCandidates];
      }
      if (urlsToCache.length === 0) {
        try {
          const raw = localStorage.getItem(`auto_images_${localCard.id}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) urlsToCache = parsed;
          }
        } catch (e) {}
      }

      if (urlsToCache.length === 0) {
        const queryTerm = getCardSearchQuery(localCard);
        if (queryTerm) {
          const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
          const apiBase = isLocalhost ? "http://localhost:3000/api/images" : "/api/images";
          const res = await fetch(`${apiBase}?q=${encodeURIComponent(queryTerm)}&page=1&provider=duckduckgo`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.hits) {
              const fetchedUrls = data.hits.slice(0, 10)
                .map((h: any) => h.largeImageURL || h.webformatURL || h.image || h.url)
                .filter((u: string) => typeof u === "string" && u.startsWith("http"));
              
              fetchedUrls.forEach((u: string) => {
                if (!urlsToCache.includes(u)) urlsToCache.push(u);
              });
            }
          }
        }
      }

      // Save candidate list to localStorage for offline access
      try {
        localStorage.setItem(`auto_images_${localCard.id}`, JSON.stringify(urlsToCache));
      } catch (e) {}

      // Preload image binary into CacheStorage
      for (const url of urlsToCache) {
        if (url) {
          await preloadImage(url).catch(() => {});
        }
      }

      setExtraImages(urlsToCache);
      setCacheSuccessMsg(true);
      setTimeout(() => setCacheSuccessMsg(false), 3500);
    } catch (err) {
      console.error("Failed to cache card images:", err);
    } finally {
      setIsCachingCard(false);
    }
  };

  const handleImageError = (failedUrl: string) => {
    if (!failedUrl) return;
    brokenImagesSet.add(failedUrl);

    setExtraImages(prev => {
      const filtered = prev.filter(url => url !== failedUrl && !brokenImagesSet.has(url));
      
      // If remaining images are low, fetch next page seamlessly in background
      if (filtered.length < 3 && !isLoadingMore) {
        const nextPage = imagePage + 1;
        setImagePage(nextPage);
        const qTerm = getCardSearchQuery(localCard);
        if (qTerm) fetchDdgImages(qTerm, nextPage, false);
      }

      setCurrentImageIndex(prevIndex => {
        if (prevIndex >= filtered.length) {
          return Math.max(0, filtered.length - 1);
        }
        return prevIndex;
      });

      return filtered;
    });
  };

  const fetchDdgImages = async (query: string, pageNum: number, isInitial: boolean) => {
    if (!query) return;

    if (isInitial && ddgImagesCache[query]) {
      const cachedUrls = ddgImagesCache[query].filter(url => !brokenImagesSet.has(url));
      setExtraImages(prev => {
        const combined = [...prev];
        cachedUrls.forEach((url: string) => {
          if (url && !combined.includes(url) && !brokenImagesSet.has(url)) {
            combined.push(url);
          }
        });
        return combined;
      });
      return;
    }

    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/images?q=${encodeURIComponent(query)}&page=${pageNum}&provider=duckduckgo`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.hits && data.hits.length > 0) {
          const newImageUrls = data.hits.slice(0, 10)
            .map((h: any) => h.largeImageURL || h.webformatURL || h.image || h.url)
            .filter((url: string) => typeof url === "string" && url.startsWith("http") && !brokenImagesSet.has(url));
          
          if (isInitial) {
            ddgImagesCache[query] = newImageUrls;
          }

          // Preload and cache all new images in background asynchronously without blocking UI update
          newImageUrls.forEach((url: string) => {
            preloadImage(url).catch(() => {
              brokenImagesSet.add(url);
              handleImageError(url);
            });
          });

          setExtraImages(prev => {
            const combined = [...prev];
            newImageUrls.forEach((url: string) => {
              if (url && !combined.includes(url) && !brokenImagesSet.has(url)) {
                combined.push(url);
              }
            });
            return combined;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch swipe images:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!isSwipeImageEnabled) {
      setExtraImages([]);
      setCurrentImageIndex(0);
      return;
    }

    const initialList = (localCard.frontImage && !brokenImagesSet.has(localCard.frontImage)) ? [localCard.frontImage] : [];
    
    // Load pre-stored auto 10 images from offline cache if available
    try {
      const rawAuto = localStorage.getItem(`auto_images_${localCard.id}`);
      if (rawAuto) {
        const parsedAuto = JSON.parse(rawAuto);
        if (Array.isArray(parsedAuto)) {
          parsedAuto.forEach((url: string) => {
            if (url && typeof url === "string" && !initialList.includes(url) && !brokenImagesSet.has(url)) {
              initialList.push(url);
            }
          });
        }
      }
    } catch (e) {}

    if (Array.isArray(localCard.autoImageCandidates)) {
      localCard.autoImageCandidates.forEach((url: string) => {
        if (url && typeof url === "string" && !initialList.includes(url) && !brokenImagesSet.has(url)) {
          initialList.push(url);
        }
      });
    }

    setExtraImages(initialList);
    setCurrentImageIndex(0);
    setImagePage(1);

    // Only query server if we do NOT have cached auto images (less than 2 images in list)
    if (initialList.length < 2) {
      const qTerm = getCardSearchQuery(localCard);
      if (qTerm) fetchDdgImages(qTerm, 1, true);
    }
  }, [localCard.id, localCard.frontImage, localCard.frontText, isSwipeImageEnabled]);

  const handlePrevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(prev => prev - 1);
    }
  };

  const handleNextImage = () => {
    if (currentImageIndex < extraImages.length - 1) {
      const nextIdx = currentImageIndex + 1;
      setCurrentImageIndex(nextIdx);
      
      // Load next batch if we reach the end
      if (nextIdx >= extraImages.length - 1 && !isLoadingMore) {
        const nextPage = imagePage + 1;
        setImagePage(nextPage);
        fetchDdgImages(localCard.frontText, nextPage, false);
      }
    }
  };

  // Touch handlers for mobile swiping
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartInBottomHalf = useRef<boolean>(false);
  const isSwiping = useRef<boolean>(false);
  const swipeTriggered = useRef<boolean>(false);
  const inlineGestureDirection = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const [isFullScreen, setIsFullScreen] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isSwiping.current = true;
    swipeTriggered.current = false;
    inlineGestureDirection.current = 'none';

    // Determine if touch started in the bottom 50% of the image container
    const rect = e.currentTarget.getBoundingClientRect();
    const isBottom = touch.clientY >= rect.top + (rect.height / 2);
    touchStartInBottomHalf.current = isBottom;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchStartY.current || !isSwiping.current || swipeTriggered.current) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartX.current;
    const diffY = touch.clientY - touchStartY.current;

    if (inlineGestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 8 || absY > 8) {
        if (absX > absY) {
          inlineGestureDirection.current = 'horizontal';
        } else {
          inlineGestureDirection.current = 'vertical';
        }
      }
      return;
    }

    if (inlineGestureDirection.current === 'vertical') {
      // Check if user swiped from bottom to top (upward swipe) to enter full screen
      if (diffY < -swipeSensitivity) {
        e.stopPropagation();
        swipeTriggered.current = true;
        setIsFullScreen(true);
      }
    } else if (inlineGestureDirection.current === 'horizontal') {
      // Horizontal swipe for prev/next
      if (Math.abs(diffX) > swipeSensitivity) {
        e.stopPropagation();
        swipeTriggered.current = true;
        if (diffX > 0) {
          handlePrevImage();
        } else {
          handleNextImage();
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    isSwiping.current = false;
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Mouse handlers for desktop swiping
  const mouseStartX = useRef<number | null>(null);
  const mouseStartY = useRef<number | null>(null);
  const isMouseDown = useRef<boolean>(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseStartX.current = e.clientX;
    mouseStartY.current = e.clientY;
    isMouseDown.current = true;
    swipeTriggered.current = false;
    inlineGestureDirection.current = 'none';

    // Determine if click started in the bottom 50% of the image container
    const rect = e.currentTarget.getBoundingClientRect();
    const isBottom = e.clientY >= rect.top + (rect.height / 2);
    touchStartInBottomHalf.current = isBottom;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseStartX.current || !mouseStartY.current || !isMouseDown.current || swipeTriggered.current) return;
    const diffX = e.clientX - mouseStartX.current;
    const diffY = e.clientY - mouseStartY.current;

    if (inlineGestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 8 || absY > 8) {
        if (absX > absY) {
          inlineGestureDirection.current = 'horizontal';
        } else {
          inlineGestureDirection.current = 'vertical';
        }
      }
      return;
    }

    if (inlineGestureDirection.current === 'vertical') {
      // Check if user swiped from bottom to top (upward swipe) to enter full screen
      if (diffY < -swipeSensitivity) {
        e.stopPropagation();
        swipeTriggered.current = true;
        setIsFullScreen(true);
      }
    } else if (inlineGestureDirection.current === 'horizontal') {
      // Horizontal swipe for prev/next
      if (Math.abs(diffX) > swipeSensitivity) {
        e.stopPropagation();
        swipeTriggered.current = true;
        if (diffX > 0) {
          handlePrevImage();
        } else {
          handleNextImage();
        }
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    isMouseDown.current = false;
    mouseStartX.current = null;
    mouseStartY.current = null;
  };

  // Full screen gestures
  const fsTouchStartX = useRef<number | null>(null);
  const fsTouchStartY = useRef<number | null>(null);
  const isFsSwiping = useRef<boolean>(false);
  const fsSwipeTriggered = useRef<boolean>(false);
  const fsGestureDirection = useRef<'none' | 'horizontal' | 'vertical'>('none');

  const handleFsTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    fsTouchStartX.current = touch.clientX;
    fsTouchStartY.current = touch.clientY;
    isFsSwiping.current = true;
    fsSwipeTriggered.current = false;
    fsGestureDirection.current = 'none';
  };

  const handleFsTouchMove = (e: React.TouchEvent) => {
    if (!fsTouchStartX.current || !fsTouchStartY.current || !isFsSwiping.current || fsSwipeTriggered.current) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - fsTouchStartX.current;
    const diffY = touch.clientY - fsTouchStartY.current;

    if (fsGestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 8 || absY > 8) {
        if (absX > absY) {
          fsGestureDirection.current = 'horizontal';
        } else {
          fsGestureDirection.current = 'vertical';
        }
      }
      return;
    }

    if (fsGestureDirection.current === 'vertical') {
      // Swipe down to exit (deliberate swipe down, sensitive but locked)
      if (diffY > swipeSensitivity * 1.3) {
        e.stopPropagation();
        fsSwipeTriggered.current = true;
        setIsFullScreen(false);
      }
    } else if (fsGestureDirection.current === 'horizontal') {
      // Horizontal swipe to navigate
      if (Math.abs(diffX) > swipeSensitivity) {
        e.stopPropagation();
        fsSwipeTriggered.current = true;
        if (diffX > 0) {
          handlePrevImage();
        } else {
          handleNextImage();
        }
      }
    }
  };

  const handleFsTouchEnd = (e: React.TouchEvent) => {
    isFsSwiping.current = false;
    fsTouchStartX.current = null;
    fsTouchStartY.current = null;
  };

  const fsMouseStartX = useRef<number | null>(null);
  const fsMouseStartY = useRef<number | null>(null);
  const isFsMouseDown = useRef<boolean>(false);

  const handleFsMouseDown = (e: React.MouseEvent) => {
    fsMouseStartX.current = e.clientX;
    fsMouseStartY.current = e.clientY;
    isFsMouseDown.current = true;
    fsSwipeTriggered.current = false;
    fsGestureDirection.current = 'none';
  };

  const handleFsMouseMove = (e: React.MouseEvent) => {
    if (!fsMouseStartX.current || !fsMouseStartY.current || !isFsMouseDown.current || fsSwipeTriggered.current) return;
    const diffX = e.clientX - fsMouseStartX.current;
    const diffY = e.clientY - fsMouseStartY.current;

    if (fsGestureDirection.current === 'none') {
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);
      if (absX > 8 || absY > 8) {
        if (absX > absY) {
          fsGestureDirection.current = 'horizontal';
        } else {
          fsGestureDirection.current = 'vertical';
        }
      }
      return;
    }

    if (fsGestureDirection.current === 'vertical') {
      // Swipe down to exit
      if (diffY > swipeSensitivity * 1.3) {
        e.stopPropagation();
        fsSwipeTriggered.current = true;
        setIsFullScreen(false);
      }
    } else if (fsGestureDirection.current === 'horizontal') {
      // Horizontal swipe to navigate
      if (Math.abs(diffX) > swipeSensitivity) {
        e.stopPropagation();
        fsSwipeTriggered.current = true;
        if (diffX > 0) {
          handlePrevImage();
        } else {
          handleNextImage();
        }
      }
    }
  };

  const handleFsMouseUp = (e: React.MouseEvent) => {
    isFsMouseDown.current = false;
    fsMouseStartX.current = null;
    fsMouseStartY.current = null;
  };

  const handleImageContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid bubbling to the card which flips it
    if (swipeTriggered.current) {
      swipeTriggered.current = false;
    } else {
      // It was a click/tap, so let's flip!
      onFlipToggle();
    }
  };

  useEffect(() => {
    if (showPluralOverride !== undefined) {
      setShowPlural(showPluralOverride);
    }
  }, [showPluralOverride]);

  useEffect(() => {
    setLocalCard(card);
  }, [card]);

  useEffect(() => {
    setLocalFlipped(globalFlipped);
    setShowPlural(false);
  }, [globalFlipped]);

  useEffect(() => {
    setRevealFrontTemp(false);
    setRevealBackTemp(false);
    setShowPlural(false);
  }, [card]);

  return (
    <div
      onClick={() => {
        onFlipToggle();
      }}
      className={`w-full h-full flip-card cursor-pointer ${localFlipped ? "flipped" : ""}`}
    >
      <div className="w-full h-full relative flip-card-inner rounded-2xl sm:rounded-3xl shadow-elevation-3 bg-surface-container-lowest border border-outline-variant/30">
        
        {/* FRONT FACE */}
        <div className={`absolute inset-0 w-full h-full flip-card-front rounded-2xl sm:rounded-3xl flex flex-col p-4 sm:p-5 bg-surface-container-lowest overflow-hidden justify-between ${
          localFlipped ? "pointer-events-none select-none" : "pointer-events-auto"
        }`}>
          <div className="w-full aspect-square rounded-xl sm:rounded-2xl overflow-hidden relative mb-3 border border-outline-variant/10 flex items-center justify-center bg-surface-container-low select-none shadow-xs">
            {isSwipeImageEnabled && extraImages.length > 0 ? (
              <div 
                className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onClick={handleImageContainerClick}
              >
                <ImageWithSkeleton
                  src={extraImages[currentImageIndex]}
                  alt="Illustration"
                  className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                  style={currentImageIndex === 0 && localCard.frontImage ? getSafeImageStyle(localCard.frontImagePosition) : { objectFit: "cover" }}
                  referrerPolicy="no-referrer"
                  loading="eager"
                  fetchPriority="high"
                  onError={handleImageError}
                />
                
                {/* Space-saving, elegant micro image counter */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10 pointer-events-none select-none bg-black/50 backdrop-blur-md text-[10px] text-white/95 px-2 py-0.5 rounded-full font-mono shadow-xs border border-white/10">
                  {isLoadingMore && (
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-white/90" />
                  )}
                  <span>
                    {`${currentImageIndex + 1}/${extraImages.length}`}
                  </span>
                </div>
              </div>
            ) : isSwipeImageEnabled && isLoadingMore ? (
              <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
                <RefreshCw className="w-6 h-6 text-primary animate-spin mb-2" />
                <span className="text-[10px] text-slate-400 font-bold">جاري البحث عن صور...</span>
              </div>
            ) : localCard.frontImage ? (
              <ImageWithSkeleton
                src={localCard.frontImage}
                alt="Illustration"
                className="absolute inset-0 w-full h-full object-cover"
                style={getSafeImageStyle(localCard.frontImagePosition)}
                referrerPolicy="no-referrer"
                loading="eager"
                fetchPriority="high"
                onError={handleImageError}
              />
            ) : (
              <div className="text-primary/70 font-bold text-xs flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-4xl">style</span>
                <span>مفهوم تعليمي</span>
              </div>
            )}
            {/* Audio Buttons - Glassmorphic, neutral and non-distracting over image */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 z-30 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayPronunciation(localCard.frontText, localCard.frontLang);
                }}
                className="p-2.5 rounded-xl bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all shadow-xs cursor-pointer border border-white/20 flex items-center justify-center active:scale-95"
                title={reviewVoiceTarget === "secondary" ? "استمع للنطق المعتمد (الصوت الثانوي)" : "استمع للنطق المعتمد (الصوت الأساسي)"}
              >
                <Volume2 className="w-4.5 h-4.5" />
              </button>
              {onPlaySecondaryPronunciation && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlaySecondaryPronunciation(localCard.frontText, localCard.frontLang);
                  }}
                  className="p-2.5 rounded-xl bg-black/40 hover:bg-black/60 text-white/90 backdrop-blur-md transition-all shadow-xs cursor-pointer border border-white/20 flex items-center justify-center relative active:scale-95"
                  title={reviewVoiceTarget === "secondary" ? "استمع للنطق البديل (الصوت الأساسي)" : "استمع للنطق البديل (الصوت الثانوي)"}
                >
                  <Volume2 className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
          </div>
          <div className="text-center pb-2 flex-1 flex flex-col justify-center px-2">
            {hideFront && !revealFrontTemp ? (
              <div 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent card flip
                  setRevealFrontTemp(true);
                }}
                className="py-3 px-5 bg-slate-50/50 hover:bg-slate-100/80 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 duration-200 mx-auto w-fit"
              >
                <EyeOff className="w-4 h-4 text-slate-400" />
                <span className="text-[11px] text-slate-500 font-medium">مخفي • انقر للكشف</span>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-on-surface break-words whitespace-pre-wrap leading-snug px-2 flex flex-row items-center justify-center gap-2.5" dir="ltr">
                  {localCard.correctArticle && (
                    <span className={`text-xs sm:text-sm px-2.5 py-0.5 rounded-lg font-black shrink-0 ${
                      localCard.correctArticle === "der" ? "bg-blue-600 text-white shadow-xs" :
                      localCard.correctArticle === "die" ? "bg-rose-600 text-white shadow-xs" :
                      localCard.correctArticle === "das" ? "bg-emerald-600 text-white shadow-xs" :
                      localCard.correctArticle === "die-plural" ? "bg-amber-500 text-white shadow-xs" :
                      "bg-primary text-white"
                    }`}>
                    {localCard.correctArticle === "die-plural" ? "die" : localCard.correctArticle}
                    </span>
                  )}
                  <span className="whitespace-pre-wrap tracking-normal">{localCard.frontText}</span>
                  {hideFront && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevealFrontTemp(false);
                      }}
                      className="p-1 rounded-lg bg-slate-100/80 hover:bg-slate-200/80 text-slate-500 cursor-pointer transition-colors"
                      title="إخفاء النص مجدداً"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </h3>
                {localCard.translationHint && (
                  <p
                    onClick={handleDescriptionClick}
                    onMouseDown={startLongPress}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={startLongPress}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onContextMenu={handleDescriptionContextMenu}
                    className="text-xs sm:text-sm font-semibold text-on-surface-variant/70 hover:text-primary transition-colors cursor-pointer select-none"
                  >
                    {localCard.translationHint}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* BACK FACE */}
        <div className={`absolute inset-0 w-full h-full flip-card-back rounded-2xl sm:rounded-3xl flex flex-col p-4 sm:p-5 border border-outline-variant/30 bg-surface-container-lowest overflow-hidden justify-between ${
          localFlipped ? "pointer-events-auto" : "pointer-events-none select-none"
        }`}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (showPlural && localCard.pluralText) {
                    onPlayPronunciation(localCard.pluralText, localCard.pluralLang || "de");
                  } else {
                    onPlayPronunciation(localCard.backText, localCard.backLang);
                  }
                }}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700 flex items-center justify-center active:scale-95"
                title={reviewVoiceTarget === "secondary" ? "نطق النص الحالي (المعتمد - الصوت الثانوي)" : "نطق النص الحالي (المعتمد - الصوت الأساسي)"}
              >
                <Volume2 className="w-4.5 h-4.5" />
              </button>

              {onPlaySecondaryPronunciation && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showPlural && localCard.pluralText) {
                      onPlaySecondaryPronunciation(localCard.pluralText, localCard.pluralLang || "de");
                    } else {
                      onPlaySecondaryPronunciation(localCard.backText, localCard.backLang);
                    }
                  }}
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700 flex items-center justify-center relative active:scale-95"
                  title={reviewVoiceTarget === "secondary" ? "نطق النص الحالي (البديل - الصوت الأساسي)" : "نطق النص الحالي (البديل - الصوت الثانوي)"}
                >
                  <Volume2 className="w-4.5 h-4.5" />
                </button>
              )}

              {/* Plural Toggle Button */}
              {localCard.isPluralMode && localCard.pluralText && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextShow = !showPlural;
                    setShowPlural(nextShow);
                    if (nextShow) {
                      onPlayPronunciation(localCard.pluralText!, localCard.pluralLang || "de");
                    }
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer border active:scale-95 ${
                    showPlural 
                      ? "bg-purple-600 text-white shadow-xs border-purple-600" 
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200/60 dark:border-slate-700"
                  }`}
                  title={showPlural ? "العودة للترجمة" : "عرض صيغة الجمع للكلمة (+)"}
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
            <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg">
              الوجه الخلفي
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            {hideBack && !revealBackTemp ? (
              <div 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent action
                  setRevealBackTemp(true);
                }}
                className="py-3 px-5 bg-slate-50/50 hover:bg-slate-100/80 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 duration-200"
              >
                <EyeOff className="w-4 h-4 text-slate-400" />
                <span className="text-[11px] text-slate-500 font-medium">مخفي • انقر للكشف</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 whitespace-pre-wrap">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-on-surface leading-relaxed flex items-center justify-center gap-2 whitespace-pre-wrap">
                  {showPlural && localCard.pluralText ? (
                    <span className="whitespace-pre-wrap font-extrabold text-indigo-600 dark:text-indigo-300 animate-fadeIn">{localCard.pluralText}</span>
                  ) : (
                    <span className="whitespace-pre-wrap">{localCard.backText}</span>
                  )}
                  {hideBack && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevealBackTemp(false);
                      }}
                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer transition-colors mt-2"
                      title="إخفاء النص مجدداً"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </h3>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClassicKnow(false);
              }}
              className="flex-1 py-3.5 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 rounded-xl font-bold text-xs hover:bg-rose-100 dark:hover:bg-rose-950/50 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <ThumbsDown className="w-4 h-4" /> لم أعرفها
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClassicKnow(true);
              }}
              className="flex-1 py-3.5 bg-emerald-600 text-white border border-emerald-600 rounded-xl font-bold text-xs hover:bg-emerald-700 active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ThumbsUp className="w-4 h-4" /> عرفتها
            </button>
          </div>
        </div>

      </div>

      {/* Simple Description & Image Popup Modal Portal */}
      {createPortal(
        <AnimatePresence>
          {isDescriptionModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={`fixed inset-0 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 sm:p-6 select-none overflow-y-auto ${
                isDark ? "bg-slate-950/80 review-night-mode dark" : "bg-slate-900/60"
              }`}
              dir="rtl"
              onClick={(e) => {
                e.stopPropagation();
                setIsDescriptionModalOpen(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`w-full max-w-lg rounded-2xl p-6 flex flex-col items-center gap-5 relative overflow-hidden transition-colors ${
                  isDark
                    ? "bg-slate-900 text-slate-100 border border-slate-800 shadow-2xl"
                    : "bg-surface-container-lowest text-on-surface border border-outline-variant/40 shadow-elevation-4"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Top Header Toolbar: Exit on Right, Audio on Left */}
                <div className="w-full flex items-center justify-between z-10 shrink-0">
                  {/* Exit Button on Right (ع اليمين) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDescriptionModalOpen(false);
                    }}
                    className={`p-2.5 rounded-xl transition-all cursor-pointer shadow-3xs flex items-center justify-center ${
                      isDark
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/60"
                    }`}
                    title="إغلاق النافذة"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>

                  {/* Audio Buttons on Left (ع اليسار) */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayPronunciation(localCard.frontText, localCard.frontLang);
                      }}
                      className={`p-2.5 rounded-xl transition-all cursor-pointer shadow-3xs flex items-center justify-center ${
                        isDark
                          ? "bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 border border-slate-700"
                          : "bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                      }`}
                      title={reviewVoiceTarget === "secondary" ? "استمع للنطق المعتمد (الصوت الثانوي)" : "استمع للنطق المعتمد (الصوت الأساسي)"}
                    >
                      <Volume2 className="w-4.5 h-4.5" />
                    </button>
                    {onPlaySecondaryPronunciation && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlaySecondaryPronunciation(localCard.frontText, localCard.frontLang);
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer shadow-3xs flex items-center justify-center ${
                          isDark
                            ? "bg-indigo-950 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-800/60"
                            : "bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 border border-indigo-200"
                        }`}
                        title={reviewVoiceTarget === "secondary" ? "استمع للنطق البديل (الصوت الأساسي)" : "استمع للنطق البديل (الصوت الثانوي)"}
                      >
                        <Volume2 className="w-4.5 h-4.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Display Image (if present) */}
                {((isSwipeImageEnabled && extraImages.length > 0 && extraImages[currentImageIndex]) || localCard.frontImage || localCard.backImage) ? (
                  <div className={`w-full max-h-72 aspect-square rounded-xl overflow-hidden flex items-center justify-center relative shadow-3xs ${
                    isDark
                      ? "bg-slate-950/80 border border-slate-800"
                      : "bg-slate-50/80 border border-slate-100"
                  }`}>
                    <ImageWithSkeleton
                      src={
                        (isSwipeImageEnabled && extraImages.length > 0 && extraImages[currentImageIndex])
                          ? (imageCache[extraImages[currentImageIndex]] || extraImages[currentImageIndex])
                          : (localCard.frontImage || localCard.backImage || "")
                      }
                      alt="Illustration"
                      className="w-full h-full object-contain"
                      style={
                        currentImageIndex === 0 && localCard.frontImage
                          ? getSafeImageStyle(localCard.frontImagePosition)
                          : { objectFit: "contain" }
                      }
                      referrerPolicy="no-referrer"
                      onError={handleImageError}
                    />
                  </div>
                ) : null}

                {/* Description & Texts Content */}
                <div className="text-center w-full px-2 py-2 space-y-3">
                  {/* 1. الوصف (Translation Hint / Main Description) */}
                  <h2 className={`text-2xl sm:text-3xl font-black leading-relaxed break-words whitespace-pre-wrap ${
                    isDark ? "text-white" : "text-on-surface"
                  }`}>
                    {localCard.translationHint || localCard.frontText}
                  </h2>

                  {/* 2. النص الأمامي (Front Text - if translationHint exists) */}
                  {localCard.translationHint && localCard.frontText && localCard.frontText !== localCard.translationHint && (
                    <p className={`text-lg sm:text-xl font-extrabold leading-normal break-words whitespace-pre-wrap pt-2 border-t ${
                      isDark
                        ? "text-indigo-300 border-slate-800"
                        : "text-indigo-600 border-slate-100"
                    }`}>
                      {localCard.frontText}
                    </p>
                  )}

                  {/* 3. الكلمة الخلفية (Back Text) */}
                  {localCard.backText && localCard.backText !== localCard.translationHint && (
                    <p className={`text-base sm:text-lg font-bold leading-normal break-words whitespace-pre-wrap ${
                      localCard.translationHint ? "pt-1" : "pt-2 border-t border-slate-100"
                    } ${
                      isDark ? "text-slate-300 border-slate-800" : "text-slate-600 border-slate-100"
                    }`}>
                      {showPlural && localCard.pluralText ? localCard.pluralText : localCard.backText}
                    </p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Fullscreen Immersive Image Portal */}
      {createPortal(
        <AnimatePresence>
          {isFullScreen && extraImages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black z-[9999] flex items-center justify-center select-none overflow-hidden"
              onClick={(e) => {
                e.stopPropagation(); // Avoid triggering card flip
              }}
              onTouchStart={handleFsTouchStart}
              onTouchMove={handleFsTouchMove}
              onTouchEnd={handleFsTouchEnd}
              onMouseDown={handleFsMouseDown}
              onMouseMove={handleFsMouseMove}
              onMouseUp={handleFsMouseUp}
            >
              {/* Absolute Full Screen Image (takes up maximum available width/height dynamically) */}
              <img
                key={currentImageIndex} // Add a key to trigger snappy entry transition for new images
                src={imageCache[extraImages[currentImageIndex]] || extraImages[currentImageIndex]}
                alt="Full-screen Illustration"
                className="w-full h-full object-contain select-none pointer-events-none z-10 max-w-full max-h-full transition-all duration-150"
                referrerPolicy="no-referrer"
                onError={() => {
                  handleImageError(extraImages[currentImageIndex]);
                }}
              />

              {/* Overlay Header inside Fullscreen (Zero screen space impact) */}
              <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-5 pt-4 flex items-center justify-between z-20 pointer-events-none">
                {/* Fixed TTS Speaker Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayPronunciation(localCard.frontText, localCard.frontLang);
                  }}
                  className="w-11 h-11 rounded-full bg-black/50 text-white hover:bg-black/75 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg border border-white/10 pointer-events-auto"
                  title="نطق الكلمة"
                >
                  <Volume2 className="w-5.5 h-5.5" />
                </button>

                {/* Gesture instruction / info */}
                <div className="text-center bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/5 shadow-sm">
                  <p className="text-[10px] text-white/80 leading-tight font-medium">اسحب للأسفل للخروج • يمين/يسار للتنقل</p>
                </div>

                {/* Exit Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFullScreen(false);
                  }}
                  className="w-11 h-11 rounded-full bg-black/50 text-white hover:bg-black/75 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg border border-white/10 pointer-events-auto"
                  title="إغلاق العرض"
                >
                  <X className="w-5.5 h-5.5" />
                </button>
              </div>

              {/* Overlay Footer inside Fullscreen (Zero screen space impact) */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-5 pb-8 pt-16 text-center flex flex-col gap-2 z-20 pointer-events-none">
                <h4 className="text-xl font-bold text-white font-sans tracking-wide drop-shadow-md" dir="ltr">
                  {localCard.frontText}
                </h4>
                <div className="mx-auto flex items-center gap-1.5 bg-black/60 backdrop-blur-md text-[10px] font-mono text-white/95 px-3.5 py-1.5 rounded-full border border-white/10 shadow-lg w-fit">
                  {isLoadingMore && (
                    <RefreshCw className="w-3 h-3 animate-spin text-white/80" />
                  )}
                  <span className="font-bold">
                    {`صورة ${currentImageIndex + 1} من ${extraImages.length}`}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

interface ReviewSessionProps {
  method: ReviewMethod;
  cards: Flashcard[];
  folder?: Folder | null;
  folders?: Folder[];
  onClose: () => void;
  onUpdateStreak: (cardId: string, correct: boolean) => void;
  onEditCard?: (card: Flashcard) => void;
  chainMethods?: ReviewMethod[];
  chainIndex?: number;
  onCompleteChainStep?: (nextIndex: number) => void;
}

export const ReviewSession: React.FC<ReviewSessionProps> = React.memo(({
  method,
  cards,
  folder,
  folders,
  onClose,
  onUpdateStreak,
  onEditCard,
  chainMethods,
  chainIndex,
  onCompleteChainStep
}) => {
  const methodArabicLabels: Record<ReviewMethod, string> = {
    classic: "وجه وخلف",
    write: "كتابة",
    listen: "استماع",
    article: "ال أرتيكل",
    match: "ربط",
    challenge: "تحدي",
    puzzles: "تركيب الكلمات"
  };

  // Challenge Mode target state (moved up to use in filteredCards)
  const [challengeTarget, setChallengeTarget] = useState<'front' | 'back' | 'plural'>(() => {
    return (localStorage.getItem("challenge_target") as any) || "back";
  });

  // Challenge Question Source state (moved up to use in filteredCards)
  const [challengeQuestionSource, setChallengeQuestionSource] = useState<'front' | 'back' | 'plural'>(() => {
    return (localStorage.getItem("challenge_question_source") as any) || "front";
  });

  const [challengeAlwaysShowFrontImage, setChallengeAlwaysShowFrontImage] = useState<boolean>(() => {
    const saved = localStorage.getItem("settings_challenge_always_show_front_image");
    return saved === null ? false : saved === "true";
  });

  const [ultraLightMode, setUltraLightMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("settings_ultra_light_mode");
    return saved === "true";
  });

  // Keep Challenge settings persistent in localStorage
  useEffect(() => {
    localStorage.setItem("challenge_target", challengeTarget);
  }, [challengeTarget]);

  useEffect(() => {
    localStorage.setItem("challenge_question_source", challengeQuestionSource);
  }, [challengeQuestionSource]);

  useEffect(() => {
    localStorage.setItem("settings_challenge_always_show_front_image", String(challengeAlwaysShowFrontImage));
  }, [challengeAlwaysShowFrontImage]);

  useEffect(() => {
    localStorage.setItem("settings_ultra_light_mode", String(ultraLightMode));
  }, [ultraLightMode]);

  // Filter cards for article mode or challenge plural mode or challenge question source plural mode
  const filteredCards = React.useMemo(() => {
    if (method === "article") {
      const artCards = cards.filter(c => c.isArticleMode || c.correctArticle);
      if (artCards.length > 0) return artCards;
    } else if (method === "challenge") {
      if (challengeTarget === "plural" || challengeQuestionSource === "plural") {
        const pluralCards = cards.filter(c => c.isPluralMode && c.pluralText && c.pluralText.trim() !== "");
        if (pluralCards.length > 0) return pluralCards;
      }
    }
    return cards;
  }, [cards, method, challengeTarget, challengeQuestionSource]);

  // Main session states
  const [sessionCards, setSessionCards] = useState<Flashcard[]>(filteredCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasStartedStep, setHasStartedStep] = useState(false);
  const [isReviewChatOpen, setIsReviewChatOpen] = useState(false);

  // Derive folder info and surrounding cards for AI Context Awareness
  const derivedFolder = React.useMemo(() => {
    if (folder) return folder;
    const cardAtIdx = sessionCards[currentIndex];
    if (cardAtIdx && folders && folders.length > 0) {
      return folders.find(f => f.id === cardAtIdx.folderId) || null;
    }
    return null;
  }, [folder, folders, sessionCards, currentIndex]);

  const surroundingPrevCards = React.useMemo(() => {
    return sessionCards.slice(Math.max(0, currentIndex - 5), currentIndex);
  }, [sessionCards, currentIndex]);

  const surroundingNextCards = React.useMemo(() => {
    return sessionCards.slice(currentIndex + 1, Math.min(sessionCards.length, currentIndex + 6));
  }, [sessionCards, currentIndex]);

  // Sync session cards and reset index when filter/target or method changes
  // We compute a memoized string of all card IDs in filteredCards to detect when the card list structure actually changed (e.g. cards added/deleted or different list)
  const filteredIdsStr = React.useMemo(() => {
    return filteredCards.map((c) => c.id).join(",");
  }, [filteredCards]);

  const prevMethodRef = React.useRef(method);
  const prevChainIndexRef = React.useRef(chainIndex);
  const prevIdsRef = React.useRef<string[]>([]);

  // Sync session cards and reset index ONLY when the method, chain step, or card list structure changes.
  // This prevents resetting progress back to the first card when a card's content (like an image) is edited during review!
  // If it's a deletion, we adjust index gracefully to prevent disappearing cards or resetting index back to 0.
  useEffect(() => {
    const prevIds = prevIdsRef.current;
    const currentIds = filteredCards.map((c) => c.id);

    const isSameSession = prevMethodRef.current === method && prevChainIndexRef.current === chainIndex;
    const isDeletionOnly = isSameSession && 
      currentIds.length < prevIds.length && 
      currentIds.every(id => prevIds.includes(id));

    if (isDeletionOnly) {
      // It's a deletion! Do NOT reset everything. Just update cards and safely adjust index
      setSessionCards(filteredCards);
      
      const currentCardBefore = sessionCards[currentIndex];
      if (currentCardBefore) {
        const stillExists = filteredCards.some(c => c.id === currentCardBefore.id);
        if (!stillExists) {
          // The viewed card was deleted!
          if (currentIndex >= filteredCards.length) {
            setCurrentIndex(Math.max(0, filteredCards.length - 1));
          }
          setFlipped(false);
          setWriteAnswer("");
          setWriteResult(null);
          setArticleResult(null);
          setSelectedArticle("");
        } else {
          // A different card was deleted. Adjust to keep the current card selected.
          const newIdx = filteredCards.findIndex(c => c.id === currentCardBefore.id);
          if (newIdx !== -1) {
            setCurrentIndex(newIdx);
          }
        }
      } else {
        if (currentIndex >= filteredCards.length) {
          setCurrentIndex(Math.max(0, filteredCards.length - 1));
        }
      }
    } else {
      // Completely new session/method/chain. Reset everything.
      setSessionCards(filteredCards);
      setCurrentIndex(0);
      setFlipped(false);
      setCorrectIds([]);
      setIncorrectIds([]);
      setWriteAnswer("");
      setWriteResult(null);
      setArticleResult(null);
      setSelectedArticle("");
      setSelectedListenCardId("");
      setIsCompleted(false);
      setTime(0);
      setIsAutoPlaying(false);
      setHasStartedStep(false);
    }

    prevMethodRef.current = method;
    prevChainIndexRef.current = chainIndex;
    prevIdsRef.current = currentIds;
  }, [filteredIdsStr, method, chainIndex]);

  const [flipped, setFlipped] = useState(false);
  const [classicShowPlural, setClassicShowPlural] = useState(false);
  const [writeAnswer, setWriteAnswer] = useState("");
  const [writeResult, setWriteResult] = useState<"correct" | "incorrect" | null>(null);

  // Reset classicShowPlural on card index or flip change
  useEffect(() => {
    setClassicShowPlural(false);
  }, [currentIndex, flipped]);

  // Writing Mode settings states
  const [writeTestTarget, setWriteTestTarget] = useState<"front" | "back">(() => {
    return (localStorage.getItem("settings_write_test_target") as any) || "back";
  });
  const [writeQuestionFace, setWriteQuestionFace] = useState<"front" | "back">(() => {
    return (localStorage.getItem("settings_write_question_face") as any) || "front";
  });
  const [isWriteSettingsOpen, setIsWriteSettingsOpen] = useState(false);

  // Custom smart settings for Auto Flip and Audio Playback
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<"classic" | "challenge" | "write" | "listen" | "article" | "match" | "puzzles" | "sound">(() => {
    return method === "classic" ? "classic" : (method === "puzzles" ? "puzzles" : (method as any));
  });
  
  const [hideFront, setHideFront] = useState(() => {
    return localStorage.getItem("settings_hide_front") === "true";
  });
  
  const [hideBack, setHideBack] = useState(() => {
    return localStorage.getItem("settings_hide_back") === "true";
  });

  const [hidePromptText, setHidePromptText] = useState(() => {
    return localStorage.getItem("settings_hide_prompt_text") === "true";
  });

  const [hideImage, setHideImage] = useState(() => {
    return localStorage.getItem("settings_hide_image") === "true";
  });

  // Session Images Download & Cache Modal States
  const [isSessionImageModalOpen, setIsSessionImageModalOpen] = useState(false);
  const [isDownloadingSessionImages, setIsDownloadingSessionImages] = useState(false);
  const [sessionImageProgress, setSessionImageProgress] = useState<{ current: number; total: number; currentItem: string; currentPreview?: string }>({
    current: 0,
    total: 0,
    currentItem: "",
  });
  const [sessionImageSuccess, setSessionImageSuccess] = useState(false);

  const handleStartSessionImageDownload = async () => {
    if (isDownloadingSessionImages || sessionCards.length === 0) return;
    setIsDownloadingSessionImages(true);
    setSessionImageSuccess(false);

    const queue: { url: string; label: string; cardId: string }[] = [];

    // 1. Primary card images
    sessionCards.forEach((c) => {
      if (c.frontImage && c.frontImage.trim()) {
        queue.push({ url: c.frontImage, label: `الصورة الأساسية (وجه): ${c.frontText || "بدون عنوان"}`, cardId: c.id });
      }
      if (c.backImage && c.backImage.trim()) {
        queue.push({ url: c.backImage, label: `الصورة الأساسية (ظهر): ${c.backText || "بدون عنوان"}`, cardId: c.id });
      }
    });

    // 2. Candidate DDG images for each card in the review session
    setSessionImageProgress({
      current: 0,
      total: sessionCards.length * 10,
      currentItem: "جاري البحث عن الـ 10 صور التلقائية المقترحة لبطاقات الجلسة..."
    });

    for (let i = 0; i < sessionCards.length; i++) {
      const card = sessionCards[i];
      const queryTerm = getCardSearchQuery(card);

      setSessionImageProgress({
        current: i + 1,
        total: sessionCards.length,
        currentItem: `مرحلة 1/2 (جلب القوائم): تجهيز الـ 10 صور للبطاقة (${i + 1}/${sessionCards.length}): "${card.frontText || queryTerm || "بطاقة"}"...`
      });

      // 1. Check if candidate URLs are already stored on the card or in localStorage
      let storedUrls: string[] = [];
      try {
        const raw = localStorage.getItem(`auto_images_${card.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) storedUrls = parsed;
        }
      } catch (e) {}

      if (storedUrls.length === 0 && card.autoImageCandidates && Array.isArray(card.autoImageCandidates) && card.autoImageCandidates.length > 0) {
        storedUrls = card.autoImageCandidates;
      }

      if (storedUrls.length > 0) {
        try {
          localStorage.setItem(`auto_images_${card.id}`, JSON.stringify(storedUrls));
        } catch (e) {}

        storedUrls.forEach((u: string, uIdx: number) => {
          if (u && typeof u === "string" && !queue.some((q) => q.url === u)) {
            queue.push({
              url: u,
              label: `صورة تلقائية #${uIdx + 1} لـ "${card.frontText || queryTerm || "بطاقة"}"`,
              cardId: card.id
            });
          }
        });
        continue;
      }

      if (!queryTerm) continue;

      try {
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const apiBase = isLocalhost ? "http://localhost:3000/api/images" : "/api/images";
        const res = await fetch(`${apiBase}?q=${encodeURIComponent(queryTerm)}&page=1&provider=duckduckgo`);
        if (res.ok) {
          const data = await res.json();
          const hits = (data.hits || []).slice(0, 10);
          const urls = hits
            .map((h: any) => h.largeImageURL || h.webformatURL || h.image || h.url)
            .filter((u: string) => typeof u === "string" && u.startsWith("http"));

          try {
            localStorage.setItem(`auto_images_${card.id}`, JSON.stringify(urls));
          } catch (e) {}

          urls.forEach((u: string, uIdx: number) => {
            if (!queue.some((q) => q.url === u)) {
              queue.push({
                url: u,
                label: `صورة تلقائية #${uIdx + 1} لـ "${card.frontText || queryTerm}"`,
                cardId: card.id
              });
            }
          });
        }
      } catch (err) {
        console.warn("Failed fetching DDG candidate images for session card:", queryTerm, err);
      }

      // Polite delay between DDG requests
      await new Promise((r) => setTimeout(r, 120));
    }

    if (queue.length === 0) {
      setIsDownloadingSessionImages(false);
      setSessionImageSuccess(true);
      return;
    }

    setSessionImageProgress({
      current: 0,
      total: queue.length,
      currentItem: queue[0].label,
      currentPreview: queue[0].url
    });

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setSessionImageProgress({
        current: i + 1,
        total: queue.length,
        currentItem: item.label,
        currentPreview: item.url
      });

      try {
        await preloadImage(item.url);
      } catch (err) {}
    }

    setIsDownloadingSessionImages(false);
    setSessionImageSuccess(true);
  };

  // Repeat Sequence Audio Downloader States
  const [isRepeatAudioModalOpen, setIsRepeatAudioModalOpen] = useState(false);
  const [isDownloadingRepeatAudio, setIsDownloadingRepeatAudio] = useState(false);
  const [repeatAudioProgress, setRepeatAudioProgress] = useState<{
    current: number;
    total: number;
    currentItem: string;
    currentStepName: string;
    currentVoiceName: string;
  }>({
    current: 0,
    total: 0,
    currentItem: "",
    currentStepName: "",
    currentVoiceName: "",
  });
  const [repeatAudioSuccess, setRepeatAudioSuccess] = useState(false);
  const [repeatAudioTab, setRepeatAudioTab] = useState<
    "all" | "auto" | "with_article" | "indefinite" | "primary" | "secondary"
  >("all");

  const handleStartRepeatAudioDownload = async () => {
    if (isDownloadingRepeatAudio || sessionCards.length === 0) return;

    const speakSteps = repeatSequence.filter((s) => s.type === "speak");
    if (speakSteps.length === 0) {
      alert("لا توجد خطوات نطق صويتية في خطة التكرار الحالية لتنزيلها.");
      return;
    }

    setIsDownloadingRepeatAudio(true);
    setRepeatAudioSuccess(false);

    const deLang = "de";
    const primaryModel =
      localStorage.getItem(`settings_primary_piper_model_${deLang}`) ||
      localStorage.getItem("settings_primary_piper_model") ||
      "de_DE-thorsten-medium";
    const secondaryModel =
      localStorage.getItem(`settings_secondary_piper_model_${deLang}`) ||
      localStorage.getItem("settings_secondary_piper_model") ||
      "google";

    const queue: {
      cardId: string;
      cardFrontText: string;
      spokenText: string;
      lang: string;
      voiceKey: string;
      voiceName: string;
      stepIndex: number;
      includeArticleType: string;
      voiceType: string;
    }[] = [];

    sessionCards.forEach((card) => {
      speakSteps.forEach((step, sIdx) => {
        const stepLang = card.frontLang || "de";
        const formattedText = formatTextForArticleMode(
          card.frontText,
          step.includeArticle,
          card
        );

        let voiceKey = primaryModel;
        let voiceName = `الموديل الرئيسي (${primaryModel})`;
        let voiceType = "primary";

        if (step.voice === "secondary") {
          voiceKey = secondaryModel;
          voiceName = `الموديل الثاني (${secondaryModel})`;
          voiceType = "secondary";
        } else if (
          step.voice &&
          step.voice !== "default" &&
          step.voice !== "primary"
        ) {
          if (step.voice === "webspeech") {
            voiceKey = "webspeech";
            voiceName = "صوت المتصفح (WebSpeech)";
            voiceType = "webspeech";
          } else {
            voiceKey = step.voice;
            voiceName = `موديل مخصص (${step.voice})`;
            voiceType = "custom";
          }
        }

        const includeArticleType = step.includeArticle || "auto";

        // Filter tabs
        let allow = true;
        if (repeatAudioTab === "auto" && includeArticleType !== "auto")
          allow = false;
        if (repeatAudioTab === "with_article" && includeArticleType !== "with")
          allow = false;
        if (
          repeatAudioTab === "indefinite" &&
          includeArticleType !== "indefinite"
        )
          allow = false;
        if (repeatAudioTab === "primary" && voiceType !== "primary")
          allow = false;
        if (repeatAudioTab === "secondary" && voiceType !== "secondary")
          allow = false;

        if (allow && formattedText && formattedText.trim()) {
          const exists = queue.some(
            (q) =>
              q.cardId === card.id &&
              q.spokenText === formattedText.trim() &&
              q.voiceKey === voiceKey
          );
          if (!exists) {
            queue.push({
              cardId: card.id,
              cardFrontText: card.frontText,
              spokenText: formattedText.trim(),
              lang: stepLang,
              voiceKey,
              voiceName,
              stepIndex: sIdx + 1,
              includeArticleType,
              voiceType,
            });
          }
        }
      });
    });

    if (queue.length === 0) {
      setIsDownloadingRepeatAudio(false);
      alert("لا توجد ملفات صوتية مطابقة للتصفية المختارة.");
      return;
    }

    setRepeatAudioProgress({
      current: 0,
      total: queue.length,
      currentItem: queue[0].spokenText,
      currentStepName: `الخطوة ${queue[0].stepIndex} (${
        queue[0].includeArticleType === "with"
          ? "مع الارتيكل"
          : queue[0].includeArticleType === "indefinite"
          ? "مع التنكير"
          : "تلقائي"
      })`,
      currentVoiceName: queue[0].voiceName,
    });

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setRepeatAudioProgress({
        current: i + 1,
        total: queue.length,
        currentItem: item.spokenText,
        currentStepName: `الخطوة ${item.stepIndex} (${
          item.includeArticleType === "with"
            ? "مع الارتيكل"
            : item.includeArticleType === "indefinite"
            ? "مع التنكير"
            : "تلقائي"
        })`,
        currentVoiceName: item.voiceName,
      });

      try {
        if (
          item.voiceKey !== "webspeech" &&
          item.voiceKey !== "browser_speech"
        ) {
          await preloadTTS(item.spokenText, item.lang, item.voiceKey);
        }
      } catch (err) {
        console.warn("Error preloading repeat audio item:", item, err);
      }

      await new Promise((r) => setTimeout(r, 60));
    }

    setIsDownloadingRepeatAudio(false);
    setRepeatAudioSuccess(true);
  };

  const [isSwipeImageEnabled, setIsSwipeImageEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("settings_swipe_image_enabled");
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("settings_swipe_image_enabled", String(isSwipeImageEnabled));
  }, [isSwipeImageEnabled]);

  // Prefetch extra search images for the next 10 cards ahead (including the current card)
  useEffect(() => {
    if (!isSwipeImageEnabled || !sessionCards || sessionCards.length === 0) return;

    // Get the current card and next 10 cards to trigger prefetching
    const nextCards = sessionCards.slice(currentIndex, currentIndex + 11);
    
    // Trigger prefetching for each of these cards
    nextCards.forEach((card) => {
      prefetchDdgImagesForCard(card);
    });
  }, [currentIndex, sessionCards, isSwipeImageEnabled]);

  const [swipeSensitivity, setSwipeSensitivity] = useState<number>(() => {
    const saved = localStorage.getItem("settings_swipe_sensitivity");
    return saved ? parseInt(saved, 10) : 40;
  });

  useEffect(() => {
    localStorage.setItem("settings_swipe_sensitivity", String(swipeSensitivity));
  }, [swipeSensitivity]);

  const [listenChoiceType, setListenChoiceType] = useState<"image" | "front" | "back">(() => {
    return (localStorage.getItem("settings_listen_choice_type") as any) || "front";
  });

  const [listenChoices, setListenChoices] = useState<Flashcard[]>([]);
  const [selectedListenCardId, setSelectedListenCardId] = useState<string>("");
  
  const [revealPromptTemp, setRevealPromptTemp] = useState(false);
  const [revealBrowseFront, setRevealBrowseFront] = useState(false);
  const [revealBrowseBack, setRevealBrowseBack] = useState(false);

  // Challenge Mode states
  const [challengeSeconds, setChallengeSeconds] = useState<number>(() => {
    const saved = localStorage.getItem("challenge_seconds");
    return saved ? parseInt(saved, 10) : 3;
  });
  const [challengeTimeLeft, setChallengeTimeLeft] = useState<number>(3);
  const [challengeActive, setChallengeActive] = useState<boolean>(false);
  const [challengeRevealed, setChallengeRevealed] = useState<boolean>(false);
  const challengeIntervalRef = useRef<any>(null);

  const [challengeHideQuestionFace, setChallengeHideQuestionFace] = useState<boolean>(() => {
    const saved = localStorage.getItem("settings_challenge_hide_question_face");
    return saved === "true";
  });
  const [challengeQuestionRevealed, setChallengeQuestionRevealed] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem("settings_challenge_hide_question_face", String(challengeHideQuestionFace));
  }, [challengeHideQuestionFace]);

  useEffect(() => {
    localStorage.setItem("challenge_seconds", String(challengeSeconds));
  }, [challengeSeconds]);

  const playTickSound = () => {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = getSharedAudioContext();
      if (!audioCtx) return;
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, audioCtx.currentTime); // Quick high pitch tick
      
      // Very short decay
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.06);
    } catch (e) {
      console.error("Web Audio API not supported or blocked:", e);
    }
  };

  const startChallengeTimer = (card: Flashcard) => {
    if (challengeIntervalRef.current) {
      clearInterval(challengeIntervalRef.current);
    }
    
    setChallengeTimeLeft(challengeSeconds);
    setChallengeRevealed(false);
    setChallengeActive(true);
    
    let currentLeft = challengeSeconds;
    
    // Play initial tick
    playTickSound();

    // If speak question on start is enabled, pronounce the question text
    if (challengeSpeakQuestionStart) {
      const questionText = challengeQuestionSource === "front" 
        ? card.frontText 
        : challengeQuestionSource === "back" 
          ? card.backText 
          : (card.pluralText || "");
          
      const questionLang = challengeQuestionSource === "front" 
        ? (card.frontLang || "de") 
        : challengeQuestionSource === "back" 
          ? (card.backLang || "ar") 
          : (card.pluralLang || "de");
          
      if (questionText) {
        playPronunciation(questionText, questionLang);
      }
    }
    
    challengeIntervalRef.current = setInterval(() => {
      currentLeft -= 1;
      setChallengeTimeLeft(currentLeft);
      
      if (currentLeft <= 0) {
        if (challengeIntervalRef.current) {
          clearInterval(challengeIntervalRef.current);
        }
        setChallengeActive(false);
        setChallengeRevealed(true);
        
        // Speak the selected target value
        let textToSpeak = "";
        let langToSpeak = "de";
        
        if (challengeTarget === "front") {
          textToSpeak = card.frontText;
          langToSpeak = card.frontLang || "de";
        } else if (challengeTarget === "back") {
          textToSpeak = card.backText;
          langToSpeak = card.backLang || "de";
        } else if (challengeTarget === "plural") {
          textToSpeak = card.pluralText || "";
          langToSpeak = card.pluralLang || "de";
        }
        
        if (challengeAutoSpeakResult && textToSpeak) {
          playPronunciation(textToSpeak, langToSpeak);
        }
      } else {
        playTickSound();
      }
    }, 1000);
  };
  
  const [autoListenFront, setAutoListenFront] = useState(() => {
    const saved = localStorage.getItem("settings_auto_listen_front");
    return saved === null ? true : saved === "true";
  });
  
  const [autoListenBack, setAutoListenBack] = useState(() => {
    const saved = localStorage.getItem("settings_auto_listen_back");
    return saved === null ? true : saved === "true";
  });
  
  const [autoFlipMode, setAutoFlipMode] = useState<"front_only" | "back_only" | "default">(() => {
    return (localStorage.getItem("settings_auto_flip_mode") as any) || "default";
  });
  
  const [autoFlipTrigger, setAutoFlipTrigger] = useState<"seconds" | "tts_end">(() => {
    return (localStorage.getItem("settings_auto_flip_trigger") as any) || "seconds";
  });
  
  const [autoFlipSeconds, setAutoFlipSeconds] = useState(() => {
    const saved = localStorage.getItem("settings_auto_flip_seconds");
    return saved ? parseInt(saved, 10) : 1;
  });

  const [manualStartFace, setManualStartFace] = useState<"front" | "back">(() => {
    return (localStorage.getItem("settings_manual_start_face") as any) || "front";
  });

  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("settings_master_sound_enabled");
    return saved === null ? true : saved === "true";
  });

  const [isAudioFadeEnabled, setIsAudioFadeEnabled] = useState(() => {
    const saved = localStorage.getItem("settings_audio_fade_enabled");
    return saved === null ? true : saved === "true";
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("settings_review_night_mode");
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("settings_review_night_mode", String(isDarkMode));
  }, [isDarkMode]);

  const [isRepeatAudioEnabled, setIsRepeatAudioEnabled] = useState<boolean>(() => {
    return localStorage.getItem("settings_repeat_audio_review") === "true";
  });

  useEffect(() => {
    localStorage.setItem("settings_repeat_audio_review", String(isRepeatAudioEnabled));
  }, [isRepeatAudioEnabled]);

  const [isToolbarExpanded, setIsToolbarExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem("settings_review_toolbar_expanded");
    return saved === null ? false : saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("settings_review_toolbar_expanded", String(isToolbarExpanded));
  }, [isToolbarExpanded]);

  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);
  const [repeatSequence, setRepeatSequence] = useState<RepeatSequenceStep[]>(() => {
    try {
      const saved = localStorage.getItem("settings_repeat_sequence_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load repeat sequence", e);
    }
    return DEFAULT_REPEAT_SEQUENCE;
  });

  useEffect(() => {
    try {
      localStorage.setItem("settings_repeat_sequence_v1", JSON.stringify(repeatSequence));
    } catch (e) {
      console.warn("Failed to save repeat sequence", e);
    }
  }, [repeatSequence]);

  const [savedCustomPlans, setSavedCustomPlans] = useState<SavedCustomRepeatPlan[]>(() => {
    try {
      const raw = localStorage.getItem("settings_saved_custom_repeat_plans");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load saved custom repeat plans", e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("settings_saved_custom_repeat_plans", JSON.stringify(savedCustomPlans));
    } catch (e) {
      console.warn("Failed to save custom repeat plans", e);
    }
  }, [savedCustomPlans]);

  const [deletedPresetPlanIds, setDeletedPresetPlanIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("settings_deleted_preset_plan_ids");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load deleted preset plan ids", e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("settings_deleted_preset_plan_ids", JSON.stringify(deletedPresetPlanIds));
    } catch (e) {
      console.warn("Failed to save deleted preset plan ids", e);
    }
  }, [deletedPresetPlanIds]);

  const [selectedPlanId, setSelectedPlanId] = useState<string>("preset_balanced_2x");
  const [newPlanName, setNewPlanName] = useState<string>("");
  const [isSavingPlanUIOpen, setIsSavingPlanUIOpen] = useState<boolean>(false);
  const [insertingStepAtIndex, setInsertingStepAtIndex] = useState<number | null>(null);
  const [activePreviewStepIndex, setActivePreviewStepIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isRepeatModalOpen) {
      setActivePreviewStepIndex(null);
    }
  }, [isRepeatModalOpen]);

  const handleInsertStepAtPosition = (type: "speak" | "pause" | "note", targetIndex: number) => {
    const newStep: RepeatSequenceStep =
      type === "speak"
        ? {
            id: "step_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
            type: "speak",
            voice: "default",
            includeArticle: "auto",
          }
        : type === "pause"
        ? {
            id: "step_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
            type: "pause",
            pauseDuration: 1.0,
          }
        : {
            id: "step_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
            type: "note",
            noteType: "start",
          };

    const updated = [...repeatSequence];
    const safeIndex = Math.max(0, Math.min(updated.length, targetIndex));
    updated.splice(safeIndex, 0, newStep);
    setRepeatSequence(updated);
    setSelectedPlanId("custom");
    setInsertingStepAtIndex(null);
  };

  const activePresetPlans = PRESET_REPEAT_PLANS.filter((p) => !deletedPresetPlanIds.includes(p.id));
  const allActivePlans = [...activePresetPlans, ...savedCustomPlans];

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    if (planId === "custom") return;
    const foundPreset = activePresetPlans.find((p) => p.id === planId);
    if (foundPreset) {
      const newSeq = foundPreset.sequence.map((step, idx) => ({
        ...step,
        id: "step_" + Date.now() + "_" + idx,
      }));
      setRepeatSequence(newSeq);
      return;
    }
    const foundCustom = savedCustomPlans.find((p) => p.id === planId);
    if (foundCustom) {
      const newSeq = foundCustom.sequence.map((step, idx) => ({
        ...step,
        id: "step_" + Date.now() + "_" + idx,
      }));
      setRepeatSequence(newSeq);
      return;
    }
  };

  const handleConfirmSavePlan = () => {
    const finalName = newPlanName.trim() || `خطة مخصصة #${savedCustomPlans.length + 1}`;
    const newPlanId = "custom_plan_" + Date.now();
    const newPlanObj: SavedCustomRepeatPlan = {
      id: newPlanId,
      name: finalName,
      sequence: repeatSequence.map((step, idx) => ({
        ...step,
        id: "s_" + Date.now() + "_" + idx,
      })),
    };
    setSavedCustomPlans((prev) => [...prev, newPlanObj]);
    setSelectedPlanId(newPlanId);
    setNewPlanName("");
    setIsSavingPlanUIOpen(false);
  };

  const handleDeleteSavedPlan = (planIdToDelete: string) => {
    if (savedCustomPlans.some((p) => p.id === planIdToDelete)) {
      setSavedCustomPlans((prev) => prev.filter((p) => p.id !== planIdToDelete));
    } else if (PRESET_REPEAT_PLANS.some((p) => p.id === planIdToDelete)) {
      setDeletedPresetPlanIds((prev) => [...prev, planIdToDelete]);
    }

    const remainingPreset = activePresetPlans.filter((p) => p.id !== planIdToDelete);
    const remainingCustom = savedCustomPlans.filter((p) => p.id !== planIdToDelete);
    const remainingAll = [...remainingPreset, ...remainingCustom];

    if (remainingAll.length > 0) {
      const nextPlan = remainingAll[0];
      setSelectedPlanId(nextPlan.id);
      setRepeatSequence(
        nextPlan.sequence.map((step, idx) => ({
          ...step,
          id: "step_" + Date.now() + "_" + idx,
        }))
      );
    } else {
      setSelectedPlanId("custom");
    }
  };

  const repeatLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const repeatIsLongPressRef = useRef<boolean>(false);

  const handleRepeatTouchStart = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    repeatIsLongPressRef.current = false;
    if (repeatLongPressTimerRef.current) clearTimeout(repeatLongPressTimerRef.current);
    repeatLongPressTimerRef.current = setTimeout(() => {
      repeatIsLongPressRef.current = true;
      setIsRepeatModalOpen(true);
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 450);
  };

  const handleRepeatTouchEnd = () => {
    if (repeatLongPressTimerRef.current) {
      clearTimeout(repeatLongPressTimerRef.current);
      repeatLongPressTimerRef.current = null;
    }
  };

  const handleRepeatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (repeatIsLongPressRef.current) {
      repeatIsLongPressRef.current = false;
      return;
    }
    setIsRepeatAudioEnabled(prev => !prev);
  };

  const [manualListenFront, setManualListenFront] = useState(() => {
    const saved = localStorage.getItem("settings_manual_listen_front");
    return saved === null ? true : saved === "true";
  });

  const [manualListenBack, setManualListenBack] = useState(() => {
    const saved = localStorage.getItem("settings_manual_listen_back");
    return saved === null ? true : saved === "true";
  });

  // Customized auto-pronunciation / auto-flipping states for each review mode
  const [writeAutoListenQuestion, setWriteAutoListenQuestion] = useState(() => {
    const saved = localStorage.getItem("settings_write_auto_listen_question");
    return saved === null ? true : saved === "true";
  });
  const [writeAutoListenSuccess, setWriteAutoListenSuccess] = useState(() => {
    const saved = localStorage.getItem("settings_write_auto_listen_success");
    return saved === null ? true : saved === "true";
  });

  const [listenAutoListenPrompt, setListenAutoListenPrompt] = useState(() => {
    const saved = localStorage.getItem("settings_listen_auto_listen_prompt");
    return saved === null ? true : saved === "true";
  });
  const [listenAutoListenSuccess, setListenAutoListenSuccess] = useState(() => {
    const saved = localStorage.getItem("settings_listen_auto_listen_success");
    return saved === null ? true : saved === "true";
  });

  const [articleAutoListenQuestion, setArticleAutoListenQuestion] = useState(() => {
    const saved = localStorage.getItem("settings_article_auto_listen_question");
    return saved === null ? true : saved === "true";
  });
  const [articleAutoListenSuccess, setArticleAutoListenSuccess] = useState(() => {
    const saved = localStorage.getItem("settings_article_auto_listen_success");
    return saved === null ? true : saved === "true";
  });

  const [challengeAutoSpeakResult, setChallengeAutoSpeakResult] = useState(() => {
    const saved = localStorage.getItem("settings_challenge_auto_speak_result");
    return saved === null ? true : saved === "true";
  });
  const [challengeSpeakQuestionStart, setChallengeSpeakQuestionStart] = useState(() => {
    const saved = localStorage.getItem("settings_challenge_speak_question_start");
    return saved === null ? false : saved === "true";
  });

  const [matchAutoListenSelect, setMatchAutoListenSelect] = useState(() => {
    const saved = localStorage.getItem("settings_match_auto_listen_select");
    return saved === null ? true : saved === "true";
  });

  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const isAutoPlayingRef = useRef(isAutoPlaying);
  useEffect(() => {
    isAutoPlayingRef.current = isAutoPlaying;
  }, [isAutoPlaying]);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [direction, setDirection] = useState<number>(1);

  const transitionToNextCard = (onIndexChange: () => void, dir: number = 1) => {
    if (isTransitioning) return;
    
    // Stop any ongoing audio immediately when changing cards!
    stopCurrentAudio();
    setIsPronouncingCorrect(false);
    
    setDirection(dir);
    setIsTransitioning(true);
    
    const nextFlipped = isAutoPlaying 
      ? (autoFlipMode === "back_only") 
      : (manualStartFace === "back");
    setFlipped(nextFlipped);
    
    onIndexChange();
    
    setTimeout(() => {
      setIsTransitioning(false);
    }, 10);
  };

  const handlePrevCard = () => {
    const doPrev = () => {
      setCurrentIndex((p) => Math.max(0, p - 1));
    };
    transitionToNextCard(doPrev, -1);
  };

  // Keep settings persistent in localStorage
  useEffect(() => {
    localStorage.setItem("settings_write_test_target", writeTestTarget);
  }, [writeTestTarget]);

  useEffect(() => {
    localStorage.setItem("settings_write_question_face", writeQuestionFace);
  }, [writeQuestionFace]);

  useEffect(() => {
    localStorage.setItem("settings_hide_front", String(hideFront));
  }, [hideFront]);

  useEffect(() => {
    localStorage.setItem("settings_hide_back", String(hideBack));
  }, [hideBack]);

  useEffect(() => {
    localStorage.setItem("settings_hide_prompt_text", String(hidePromptText));
  }, [hidePromptText]);

  useEffect(() => {
    localStorage.setItem("settings_hide_image", String(hideImage));
  }, [hideImage]);

  useEffect(() => {
    localStorage.setItem("settings_listen_choice_type", listenChoiceType);
  }, [listenChoiceType]);

  // Reset temporary reveal states on card index change
  useEffect(() => {
    setRevealPromptTemp(false);
    setRevealBrowseFront(false);
    setRevealBrowseBack(false);
    setSelectedListenCardId("");
  }, [currentIndex]);

  useEffect(() => {
    localStorage.setItem("settings_auto_listen_front", String(autoListenFront));
  }, [autoListenFront]);

  useEffect(() => {
    localStorage.setItem("settings_auto_listen_back", String(autoListenBack));
  }, [autoListenBack]);

  useEffect(() => {
    localStorage.setItem("settings_auto_flip_mode", autoFlipMode);
  }, [autoFlipMode]);

  useEffect(() => {
    localStorage.setItem("settings_auto_flip_trigger", autoFlipTrigger);
  }, [autoFlipTrigger]);

  useEffect(() => {
    localStorage.setItem("settings_auto_flip_seconds", String(autoFlipSeconds));
  }, [autoFlipSeconds]);

  useEffect(() => {
    localStorage.setItem("settings_manual_start_face", manualStartFace);
  }, [manualStartFace]);

  useEffect(() => {
    localStorage.setItem("settings_master_sound_enabled", String(isSoundEnabled));
  }, [isSoundEnabled]);

  useEffect(() => {
    localStorage.setItem("settings_audio_fade_enabled", String(isAudioFadeEnabled));
  }, [isAudioFadeEnabled]);

  useEffect(() => {
    localStorage.setItem("settings_manual_listen_front", String(manualListenFront));
  }, [manualListenFront]);

  useEffect(() => {
    localStorage.setItem("settings_manual_listen_back", String(manualListenBack));
  }, [manualListenBack]);

  useEffect(() => {
    localStorage.setItem("settings_write_auto_listen_question", String(writeAutoListenQuestion));
  }, [writeAutoListenQuestion]);

  useEffect(() => {
    localStorage.setItem("settings_write_auto_listen_success", String(writeAutoListenSuccess));
  }, [writeAutoListenSuccess]);

  useEffect(() => {
    localStorage.setItem("settings_listen_auto_listen_prompt", String(listenAutoListenPrompt));
  }, [listenAutoListenPrompt]);

  useEffect(() => {
    localStorage.setItem("settings_listen_auto_listen_success", String(listenAutoListenSuccess));
  }, [listenAutoListenSuccess]);

  useEffect(() => {
    localStorage.setItem("settings_article_auto_listen_question", String(articleAutoListenQuestion));
  }, [articleAutoListenQuestion]);

  useEffect(() => {
    localStorage.setItem("settings_article_auto_listen_success", String(articleAutoListenSuccess));
  }, [articleAutoListenSuccess]);

  useEffect(() => {
    localStorage.setItem("settings_challenge_auto_speak_result", String(challengeAutoSpeakResult));
  }, [challengeAutoSpeakResult]);

  useEffect(() => {
    localStorage.setItem("settings_challenge_speak_question_start", String(challengeSpeakQuestionStart));
  }, [challengeSpeakQuestionStart]);

  useEffect(() => {
    localStorage.setItem("settings_match_auto_listen_select", String(matchAutoListenSelect));
  }, [matchAutoListenSelect]);

  const [reviewVoiceTarget, setReviewVoiceTarget] = useState<"primary" | "secondary">(
    () => (localStorage.getItem("settings_review_voice_target") === "secondary" ? "secondary" : "primary")
  );

  useEffect(() => {
    localStorage.setItem("settings_review_voice_target", reviewVoiceTarget);
  }, [reviewVoiceTarget]);

  const getVoiceDisplayName = (lang: string, target: "primary" | "secondary"): string => {
    const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
    if (target === "secondary") {
      const model = localStorage.getItem(`settings_secondary_piper_model_${langShort}`) || 
                    localStorage.getItem("settings_secondary_piper_model") || 
                    "google";
      if (model === "google") return "Google Translate TTS";
      if (model === "webspeech") return "Web Speech API";
      return model.replace(/\.onnx$/, "");
    } else {
      const defaultPrimary = langShort === "de" ? "de_DE-thorsten-medium" : langShort === "ar" ? "ar_JO-kareem-medium" : "en_US-lessac-medium";
      const model = localStorage.getItem(`settings_primary_piper_model_${langShort}`) || 
                    localStorage.getItem("settings_primary_piper_model") || 
                    defaultPrimary;
      if (model === "google") return "Google Translate TTS";
      if (model === "webspeech") return "Web Speech API";
      return model.replace(/\.onnx$/, "");
    }
  };

  const renderVoiceTargetSelector = (modeTitle = "هذا الوضع") => {
    const cardLang = currentCard?.frontLang || "de";
    const primaryName = getVoiceDisplayName(cardLang, "primary");
    const secondaryName = getVoiceDisplayName(cardLang, "secondary");

    return (
      <div className="p-3.5 bg-gradient-to-r from-primary/10 via-primary/5 to-amber-500/10 rounded-2xl border border-primary/20 space-y-2.5 my-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-slate-800">
              صوت النطق المعتمد في التقليب والمراجعة:
            </span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            reviewVoiceTarget === "secondary" ? "bg-amber-500/20 text-amber-700" : "bg-primary/20 text-primary"
          }`}>
            {reviewVoiceTarget === "secondary" ? "الصوت الثانوي" : "الصوت الأساسي"}
          </span>
        </div>
        <p className="text-[10.5px] text-slate-500 leading-relaxed">
          اختر الصوت المعتمد للنطق التلقائي واليدوي عند التقليب والمراجعة في {modeTitle}:
        </p>
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setReviewVoiceTarget("primary")}
            className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col gap-1 ${
              reviewVoiceTarget === "primary"
                ? "bg-primary text-white border-primary shadow-xs ring-2 ring-primary/30"
                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-bold flex items-center gap-1">
                الصوت الأساسي
              </span>
              {reviewVoiceTarget === "primary" && <Check className="w-3.5 h-3.5" />}
            </div>
            <span className="text-[9.5px] opacity-85 dir-ltr font-mono truncate max-w-full block">
              ({primaryName})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setReviewVoiceTarget("secondary")}
            className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col gap-1 ${
              reviewVoiceTarget === "secondary"
                ? "bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-500/30"
                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-bold flex items-center gap-1">
                <span>🥈</span> الصوت الثانوي
              </span>
              {reviewVoiceTarget === "secondary" && <Check className="w-3.5 h-3.5" />}
            </div>
            <span className="text-[9.5px] opacity-85 dir-ltr font-mono truncate max-w-full block">
              ({secondaryName})
            </span>
          </button>
        </div>
      </div>
    );
  };

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Statistics trackers
  const [correctIds, setCorrectIds] = useState<string[]>([]);
  const [incorrectIds, setIncorrectIds] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [time, setTime] = useState(0);

  const isFinalChainStep = chainMethods && chainIndex !== undefined && chainIndex === chainMethods.length - 1 && incorrectIds.length === 0;

  // Storyboard animation tracking
  const [storyboardProgressIdx, setStoryboardProgressIdx] = useState<number>(
    chainIndex !== undefined ? Math.max(0, chainIndex - 1) : 0
  );
  const [storyboardShowCheck, setStoryboardShowCheck] = useState<boolean>(false);

  // Final storyboard animation tracking
  const [finalProgressIdx, setFinalProgressIdx] = useState<number>(0);
  const [finalShowCheck, setFinalShowCheck] = useState<boolean>(false);

  useEffect(() => {
    if (isCompleted && isFinalChainStep && chainMethods && chainIndex !== undefined) {
      setFinalProgressIdx(chainIndex);
      setFinalShowCheck(false);

      const t1 = setTimeout(() => {
        setFinalShowCheck(true);
      }, 600);

      return () => clearTimeout(t1);
    }
  }, [isCompleted, isFinalChainStep, chainIndex, chainMethods]);

  useEffect(() => {
    if (isCompleted && chainIndex !== undefined && chainMethods) {
      // Start by displaying the state where we are on the current finished node (chainIndex)
      setStoryboardProgressIdx(chainIndex);
      setStoryboardShowCheck(false);

      // 1. Pop the checkmark after 400ms
      const t1 = setTimeout(() => {
        setStoryboardShowCheck(true);
      }, 400);

      // 2. Start walking the pin and drawing the line to the next node after 1200ms
      const t2 = setTimeout(() => {
        if (chainIndex < chainMethods.length - 1) {
          setStoryboardProgressIdx(chainIndex + 1);
        }
      }, 1200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isCompleted, chainIndex, chainMethods]);

  // Entrance slide and draw animation for storyboard when starting or entering a step
  useEffect(() => {
    if (!isCompleted && chainIndex !== undefined && chainMethods) {
      if (chainIndex === 0) {
        // For the very first stage, there is no previous step to show checkmark on or slide from.
        // It starts directly on step 0 in ready/preparation mode, without any checkmarks.
        setStoryboardProgressIdx(0);
        setStoryboardShowCheck(false);
        return;
      }

      // Start from the previous step so we see the pin slide and path draw to the current step!
      const startIdx = Math.max(0, chainIndex - 1);
      setStoryboardProgressIdx(startIdx);
      setStoryboardShowCheck(false);

      // 1. Pop the checkmark on the previous step after 400ms (representing completing it)
      const t1 = setTimeout(() => {
        setStoryboardShowCheck(true);
      }, 400);

      // 2. Slide the pin and draw path to current step after 1200ms
      const t2 = setTimeout(() => {
        setStoryboardProgressIdx(chainIndex);
        setStoryboardShowCheck(false);
      }, 1200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isCompleted, chainIndex, chainMethods]);

  // For Matching game
  const [matchingCards, setMatchingCards] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<{ id: string; pairId: string; text: string; type: string } | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [errorIds, setErrorIds] = useState<string[]>([]);

  // Timer Ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentCard = sessionCards[currentIndex];

  // Challenge Mode timer effect
  useEffect(() => {
    // Reset states when current index, method or challenge target changes to show start screen
    setChallengeActive(false);
    setChallengeRevealed(false);
    setChallengeQuestionRevealed(false);

    if (challengeIntervalRef.current) {
      clearInterval(challengeIntervalRef.current);
    }

    // Automatically start challenge for subsequent cards (currentIndex > 0)
    if (method === "challenge" && currentIndex > 0 && currentCard) {
      startChallengeTimer(currentCard);
    }

    return () => {
      if (challengeIntervalRef.current) {
        clearInterval(challengeIntervalRef.current);
      }
    };
  }, [currentIndex, method, challengeTarget, challengeSeconds]);

  // Ref to the input element for auto-focusing
  const writeInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the input field when the card, method, or writeResult changes (meaning the input becomes enabled)
  useEffect(() => {
    if ((method === "write" || method === "listen") && writeResult === null && writeInputRef.current) {
      const timer = setTimeout(() => {
        writeInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, method, writeResult]);

  // Synchronize session cards with latest card updates reactively
  useEffect(() => {
    setSessionCards((prev) =>
      prev.map((c) => {
        const found = filteredCards.find((fc) => fc.id === c.id);
        return found ? found : c;
      })
    );
  }, [filteredCards]);

  const handleOpenEditCard = () => {
    if (!currentCard) return;
    if (onEditCard) {
      onEditCard(currentCard);
    }
  };

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenKeyRef = useRef<string>("");
  const repeatAudioTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopCurrentAudio = () => {
    if (repeatAudioTimerRef.current) {
      clearTimeout(repeatAudioTimerRef.current);
      repeatAudioTimerRef.current = null;
    }

    setActivePreviewStepIndex(null);

    // Interrupt the shared active audio player from Modals
    stopActiveAudio();

    if (currentAudioRef.current) {
      fadeAndStopAudio(currentAudioRef.current);
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // Voice player helper for a single playback
  const playPronunciationSingle = (text: string, lang: string, onEnd?: () => void, bypassMute = false, voiceOverride?: string) => {
    if (!isSoundEnabled && !bypassMute) {
      if (onEnd) onEnd();
      return;
    }

    if (!text || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    const cleanText = text.trim();
    if (currentCard) {
      lastSpokenKeyRef.current = `${currentCard.id}_${cleanText}`;
    }

    // Resolve exact voice model (primary, secondary, or explicitly overridden voice)
    let effectiveVoice = voiceOverride;
    if (!effectiveVoice) {
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
      if (onEnd) onEnd();
      return;
    }

    const ttsExecutionMode = localStorage.getItem("settings_tts_execution_mode") || "local";
    if (ttsExecutionMode === "local" || effectiveVoice === "webspeech" || effectiveVoice === "browser_speech" || effectiveVoice === "local") {
      if (effectiveVoice === "webspeech" || effectiveVoice === "browser_speech") {
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
            utterance.onerror = () => onEnd();
          }
          window.speechSynthesis.speak(utterance);
        } else if (onEnd) {
          onEnd();
        }
      } else {
        playPiperLocalWasm(cleanText, lang, effectiveVoice, onEnd, onEnd);
      }
      return;
    }

    const cacheKey = effectiveVoice ? `${cleanText}_${lang}_${effectiveVoice}` : `${cleanText}_${lang}`;
    const voiceParam = effectiveVoice ? `&voice=${encodeURIComponent(effectiveVoice)}` : "";
    const ttsApiUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}${voiceParam}`;

    const playAudioElement = (url: string, isCache = false) => {
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      const handleFail = () => {
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null;
        }
        if (isCache) {
          delete ttsCache[cacheKey];
          if ("caches" in window) {
            caches.open("anki-voice-cache-v1").then((c) => c.delete(ttsApiUrl));
            caches.open("tts-audio-cache-v1").then((c) => c.delete(ttsApiUrl));
          }
          // Retry direct network URL for THAT EXACT VOICE ONLY (No cross-engine fallback)
          const fallbackUrl = `${ttsApiUrl}&_t=${Date.now()}`;
          playAudioElement(fallbackUrl, false);
        } else if (onEnd) {
          // Strict: Do not fall back to Google or browser speech if specified voice fails
          onEnd();
        }
      };

      if (onEnd) {
        audio.onended = () => {
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null;
          }
          onEnd();
        };
        audio.onerror = handleFail;
      }

      audio.play().catch((err) => {
        console.warn("Audio play catch block error for specified voice:", err);
        handleFail();
      });
    };

    const cachedUrl = ttsCache[cacheKey];

    if (cachedUrl) {
      playAudioElement(cachedUrl, true);
    } else {
      preloadTTS(cleanText, lang, effectiveVoice).then((url) => {
        playAudioElement(url || ttsApiUrl, false);
      });
    }
  };

  const executeSequenceSteps = (
    steps: RepeatSequenceStep[],
    text: string,
    lang: string,
    onEnd?: () => void,
    bypassMute = false,
    cardOverride?: Flashcard | null,
    onStepChange?: (index: number | null) => void
  ) => {
    stopCurrentAudio();
    onStepChange?.(null);

    if (!steps || steps.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    const targetCard = cardOverride !== undefined ? cardOverride : currentCard;
    let stepIdx = 0;

    const runNext = () => {
      if (stepIdx >= steps.length) {
        onStepChange?.(null);
        if (onEnd) onEnd();
        return;
      }

      const currentIdx = stepIdx;
      const step = steps[currentIdx];
      stepIdx++;
      onStepChange?.(currentIdx);

      if (step.type === "speak") {
        let voiceOverride: string | undefined = undefined;
        if (step.voice && step.voice !== "default") {
          if (step.voice === "primary") {
            const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
            const defaultPrimary = langShort === "de" ? "de_DE-thorsten-medium" : langShort === "ar" ? "ar_JO-kareem-medium" : "en_US-lessac-medium";
            voiceOverride = localStorage.getItem(`settings_primary_piper_model_${langShort}`) || localStorage.getItem("settings_primary_piper_model") || defaultPrimary;
          } else if (step.voice === "secondary") {
            const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
            voiceOverride = localStorage.getItem(`settings_secondary_piper_model_${langShort}`) || localStorage.getItem("settings_secondary_piper_model") || "google";
          } else {
            voiceOverride = step.voice;
          }
        }

        const textToSpeak = formatTextForArticleMode(text, step.includeArticle, targetCard);

        playPronunciationSingle(textToSpeak, lang, () => {
          runNext();
        }, bypassMute, voiceOverride);
      } else if (step.type === "pause") {
        const delayMs = Math.max(100, Math.round((step.pauseDuration || 1) * 1000));
        repeatAudioTimerRef.current = setTimeout(() => {
          repeatAudioTimerRef.current = null;
          runNext();
        }, delayMs);
      } else if (step.type === "note") {
        playAudioNote(step.noteType || "start");
        repeatAudioTimerRef.current = setTimeout(() => {
          repeatAudioTimerRef.current = null;
          runNext();
        }, 350);
      } else {
        runNext();
      }
    };

    runNext();
  };

  // Voice player helper for automatic & manual flip sequences with customizable repeat sequence & onEnd support
  const playPronunciationWithEnd = (text: string, lang: string, onEnd?: () => void, bypassMute = false, voiceOverride?: string) => {
    stopCurrentAudio();

    if (isRepeatAudioEnabled) {
      executeSequenceSteps(repeatSequence, text, lang, onEnd, bypassMute);
    } else {
      playPronunciationSingle(text, lang, onEnd, bypassMute, voiceOverride);
    }
  };

  const playBrowserSynthesisWithEnd = (text: string, lang: string, onEnd?: () => void) => {
    // Completely disabled to remove the un-advanced browser voice
    if (onEnd) onEnd();
  };

  const [isSecondaryAudioEnabled, setIsSecondaryAudioEnabled] = useState(() => {
    return localStorage.getItem("settings_enable_secondary_audio_review") === "true";
  });

  useEffect(() => {
    const handleSyncSecondaryAudio = () => {
      setIsSecondaryAudioEnabled(localStorage.getItem("settings_enable_secondary_audio_review") === "true");
    };
    window.addEventListener("focus", handleSyncSecondaryAudio);
    window.addEventListener("storage", handleSyncSecondaryAudio);
    return () => {
      window.removeEventListener("focus", handleSyncSecondaryAudio);
      window.removeEventListener("storage", handleSyncSecondaryAudio);
    };
  }, []);

  // Dedicated Single Primary Voice Model Player (EXCLUSIVELY plays the Primary Model once without repetition)
  const playPrimaryPronunciation = (text: string, lang: string, bypassMute = true) => {
    stopCurrentAudio();
    const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
    const defaultPrimary = langShort === "de" ? "de_DE-thorsten-medium" : langShort === "ar" ? "ar_JO-kareem-medium" : "en_US-lessac-medium";
    const primaryVoice = localStorage.getItem(`settings_primary_piper_model_${langShort}`) || 
                         localStorage.getItem("settings_primary_piper_model") || 
                         defaultPrimary;
    playPronunciationSingle(text, lang, undefined, bypassMute, primaryVoice);
  };

  // Dedicated Single Secondary Voice Model Player (EXCLUSIVELY plays the Secondary Model once without repetition)
  const playSecondaryPronunciation = (text: string, lang: string, bypassMute = true) => {
    stopCurrentAudio();
    const langShort = (lang || "de").toLowerCase().split("-")[0].split("_")[0];
    const secondaryVoice = localStorage.getItem(`settings_secondary_piper_model_${langShort}`) || 
                           localStorage.getItem("settings_secondary_piper_model") || 
                           "google";
    playPronunciationSingle(text, lang, undefined, bypassMute, secondaryVoice);
  };

  // General helper for single card pronunciation (plays once directly without repeat sequence)
  const playPronunciation = (text: string, lang: string, bypassMute = false, voiceOverride?: string) => {
    stopCurrentAudio();
    playPronunciationSingle(text, lang, undefined, bypassMute, voiceOverride);
  };

  // Unified Autoplay and Auto-flip state machine loop
  useEffect(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }

    if (chainMethods && chainIndex !== undefined && !hasStartedStep) return;
    if (!isAutoPlaying || isCompleted || !currentCard || isTransitioning) return;

    // Determine the current face based on autoFlipMode
    const isBackActive = (flipped || autoFlipMode === "back_only") && autoFlipMode !== "front_only";
    const activeText = isBackActive ? currentCard.backText : currentCard.frontText;
    const activeLang = isBackActive ? currentCard.backLang : currentCard.frontLang;
    const shouldAutoSpeak = isBackActive ? autoListenBack : autoListenFront;

    const proceedNext = () => {
      if (!isAutoPlayingRef.current) return;
      if (autoFlipMode === "front_only") {
        handleNextCard();
      } else if (autoFlipMode === "back_only") {
        handleNextCard();
      } else {
        // default mode: front -> back -> next card front
        if (!flipped) {
          setFlipped(true);
        } else {
          handleNextCard();
        }
      }
    };

    if (shouldAutoSpeak) {
      // Play audio and handle the completion callback
      playPronunciationWithEnd(activeText, activeLang, () => {
        if (!isAutoPlayingRef.current) return;
        if (autoFlipTrigger === "tts_end") {
          // Flip or advance immediately upon TTS completion
          proceedNext();
        } else {
          // If trigger is based on timer seconds, trigger timer AFTER TTS finishes to make it natural
          autoPlayTimerRef.current = setTimeout(() => {
            if (!isAutoPlayingRef.current) return;
            proceedNext();
          }, autoFlipSeconds * 1000);
        }
      });
    } else {
      // No voice auto-play is configured, so we rely solely on the timer
      const delay = autoFlipTrigger === "seconds" ? autoFlipSeconds : 3;
      autoPlayTimerRef.current = setTimeout(() => {
        if (!isAutoPlayingRef.current) return;
        proceedNext();
      }, delay * 1000);
    }

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [currentIndex, flipped, isAutoPlaying, autoFlipMode, autoFlipTrigger, autoFlipSeconds, autoListenFront, autoListenBack, currentCard, isCompleted, isTransitioning, hasStartedStep]);

  // Unified Manual Mode Audio Playback loop with 200ms debounce delay
  useEffect(() => {
    if (chainMethods && chainIndex !== undefined && !hasStartedStep) return;
    if (isAutoPlaying || !isSoundEnabled || !currentCard || isCompleted) return;
    if (method !== "classic") return;

    const activeText = flipped ? currentCard.backText : currentCard.frontText;
    const currentKey = `${currentCard.id}_${activeText ? activeText.trim() : ""}`;

    // Skip if this exact text on this card was already spoken (e.g., played during autoplay or prior action)
    if (lastSpokenKeyRef.current === currentKey) {
      return;
    }

    const timer = setTimeout(() => {
      if (flipped) {
        if (manualListenBack) {
          playPronunciationWithEnd(currentCard.backText, currentCard.backLang);
        }
      } else {
        if (manualListenFront) {
          playPronunciationWithEnd(currentCard.frontText, currentCard.frontLang);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [currentIndex, flipped, isAutoPlaying, isSoundEnabled, manualListenFront, manualListenBack, currentCard, isCompleted, method, hasStartedStep, isRepeatAudioEnabled, repeatSequence]);

  // German Article Game Selection
  const [articleResult, setArticleResult] = useState<"correct" | "incorrect" | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<string>("");
  const [isPronouncingCorrect, setIsPronouncingCorrect] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(() => {
    return localStorage.getItem("settings_article_auto_next") === "true";
  });
  const autoAdvanceRef = useRef(autoAdvance);
  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);

  // Keep tracking time for non-matching sessions too, only when step has started
  useEffect(() => {
    setTime(0);
    if (chainMethods && chainIndex !== undefined && !hasStartedStep) {
      return;
    }
    timerRef.current = setInterval(() => {
      setTime((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionCards, hasStartedStep, chainIndex]);

  const [imageCachedVersion, setImageCachedVersion] = useState(0);

  // Preload TTS Audio & Images in a sliding window to ensure instant playback and display without delay
  useEffect(() => {
    if (!sessionCards || sessionCards.length === 0) return;

    const preloadCardAssets = async (card: Flashcard) => {
      if (!card) return;
      // Preload front text
      if (card.frontText) {
        preloadTTS(card.frontText, card.frontLang || "de");
      }
      // Preload back text
      if (card.backText) {
        preloadTTS(card.backText, card.backLang || "ar");
      }
      // Preload plural text if plural mode is enabled
      if (card.isPluralMode && card.pluralText) {
        preloadTTS(card.pluralText, card.pluralLang || "de");
      }
      // Preload article variations if in article mode
      if (method === "article" || card.isArticleMode || card.correctArticle) {
        const articles = ["der", "die", "das"];
        articles.forEach((art) => {
          preloadTTS(`${art} ${card.frontText}`, card.frontLang || "de");
        });
      }
      // Preload front image for instant visual render
      if (card.frontImage) {
        preloadImage(card.frontImage).then(() => {
          setImageCachedVersion((v) => v + 1);
        });
      }
      // Preload back image for instant visual render
      if (card.backImage) {
        preloadImage(card.backImage).then(() => {
          setImageCachedVersion((v) => v + 1);
        });
      }
    };

    // Sliding Window Preloading: Preload current and the next 4 cards
    for (let i = 0; i < 5; i++) {
      const card = sessionCards[currentIndex + i];
      if (card) {
        preloadCardAssets(card);
      }
    }
  }, [currentIndex, sessionCards, method]);

  // Cleanup playing audio on component unmount
  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  // Reset card state immediately when current index, card, method, or starting face changes
  useEffect(() => {
    if (currentCard) {
      if (!isAutoPlaying) {
        if (manualStartFace === "back") {
          setFlipped(true);
        } else {
          setFlipped(false);
        }
      }
    }
    setWriteAnswer("");
    setWriteResult(null);
    setArticleResult(null);
    setSelectedArticle("");
    setIsPronouncingCorrect(false);
    setSelectedListenCardId("");
  }, [
    currentIndex,
    currentCard,
    method,
    manualStartFace
  ]);

  // Trigger sound automatically for new cards in other modes with 200ms debounce delay
  useEffect(() => {
    if (chainMethods && chainIndex !== undefined && !hasStartedStep) return;
    if (!currentCard || isCompleted || isAutoPlaying) return;

    const targetText = method === "write" && writeQuestionFace === "back" ? currentCard.backText : currentCard.frontText;
    const currentKey = `${currentCard.id}_${method}_${targetText ? targetText.trim() : ""}`;

    if (lastSpokenKeyRef.current === currentKey) {
      return;
    }

    const timer = setTimeout(() => {
      if (method === "listen") {
        if (listenAutoListenPrompt) {
          playPronunciation(currentCard.frontText, currentCard.frontLang);
        }
      } else if (method === "article") {
        if (articleAutoListenQuestion) {
          playPronunciation(currentCard.frontText, currentCard.frontLang);
        }
      } else if (method === "write") {
        if (writeAutoListenQuestion) {
          if (writeQuestionFace === "front") {
            playPronunciation(currentCard.frontText, currentCard.frontLang);
          } else {
            playPronunciation(currentCard.backText, currentCard.backLang);
          }
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [
    currentIndex,
    currentCard,
    method,
    writeQuestionFace,
    listenAutoListenPrompt,
    articleAutoListenQuestion,
    writeAutoListenQuestion,
    isCompleted,
    isAutoPlaying,
    hasStartedStep
  ]);

  // Generate 4 multiple choice options for listening review
  useEffect(() => {
    if (method !== "listen" || !currentCard) return;

    // High-quality Fisher-Yates shuffle to guarantee pure randomness and avoid repetition bias
    const shuffleArray = <T,>(array: T[]): T[] => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const pool = sessionCards.length >= 4 ? sessionCards : (cards.length >= 4 ? cards : sessionCards);
    let alternatives = pool.filter(c => c.id !== currentCard.id);

    // If choice type is "image", prioritize alternatives that actually have an image to ensure a rich visual grid
    if (listenChoiceType === "image") {
      const withImage = alternatives.filter(c => !!c.frontImage);
      const withoutImage = alternatives.filter(c => !c.frontImage);
      
      alternatives = [...shuffleArray(withImage), ...shuffleArray(withoutImage)];
    } else {
      alternatives = shuffleArray(alternatives);
    }

    const selectedAlts = alternatives.slice(0, 3);
    const combined = shuffleArray([...selectedAlts, currentCard]);

    setListenChoices(combined);
  }, [currentIndex, currentCard, sessionCards, cards, method, listenChoiceType]);

  // Initialize matching game
  useEffect(() => {
    if (method === "match" && sessionCards.length > 0) {
      resetMatchingGame();
    }
  }, [method, sessionCards]);

  const resetMatchingGame = () => {
    const list: any[] = [];
    // Shuffle and pick up to 6 cards for an engaging grid round
    const shuffledSource = [...sessionCards].sort(() => Math.random() - 0.5);
    const batch = shuffledSource.slice(0, 6);
    
    batch.forEach((c) => {
      list.push({ id: `term-${c.id}`, pairId: c.id, text: c.frontText, type: "term", lang: c.frontLang });
      list.push({ id: `def-${c.id}`, pairId: c.id, text: c.backText, type: "def", lang: c.backLang });
    });

    setMatchingCards(list.sort(() => Math.random() - 0.5));
    setMatchedIds([]);
    setErrorIds([]);
    setSelectedMatch(null);
  };

  const handleMatchClick = (item: any) => {
    if (matchedIds.includes(item.id) || errorIds.includes(item.id)) return;

    if (matchAutoListenSelect) {
      playPronunciation(item.text, item.lang || "de");
    }

    if (!selectedMatch) {
      setSelectedMatch(item);
      return;
    }

    if (selectedMatch.id === item.id) {
      setSelectedMatch(null);
      return;
    }

    // Checking match pair
    if (selectedMatch.pairId === item.pairId && selectedMatch.type !== item.type) {
      const nextMatched = [...matchedIds, selectedMatch.id, item.id];
      setMatchedIds(nextMatched);
      setSelectedMatch(null);
      onUpdateStreak(item.pairId, true);

      // Add to correct list
      if (!correctIds.includes(item.pairId)) {
        setCorrectIds((prev) => [...prev, item.pairId]);
      }

      // Check if all matched
      if (nextMatched.length === matchingCards.length) {
        // Delay completion screen slightly for delightful visual feedback
        setTimeout(() => {
          setIsCompleted(true);
        }, 1200);
      }
    } else {
      // Mismatch
      setErrorIds([selectedMatch.id, item.id]);
      setSelectedMatch(null);
      onUpdateStreak(item.pairId, false);
      if (!incorrectIds.includes(item.pairId)) {
        setIncorrectIds((prev) => [...prev, item.pairId]);
      }
      setTimeout(() => {
        setErrorIds([]);
      }, 800);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60).toString().padStart(2, "0");
    const seconds = (secs % 60).toString().padStart(2, "0");
    return `${mins}:${seconds}`;
  };

  // Smart check for translation answers (fuzzy & synonyms-aware)
  const checkAnswer = (userAns: string, correctAns: string): boolean => {
    const clean = (s: string) => s.trim().toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "") // remove common punctuations
      .replace(/\s+/g, " "); // collapse double spaces

    const u = clean(userAns);
    if (!u) return false;

    // Check directly
    const c = clean(correctAns);
    if (u === c) return true;

    // Support comma, semicolon, or slash separated multiple synonyms
    const synonyms = correctAns.split(/[,;\/]/).map(syn => clean(syn));
    if (synonyms.some(s => s === u && s.length > 0)) {
      return true;
    }

    return false;
  };

  // Classic Card Mode - Know / Didn't Know Handlers
  const handleClassicKnow = (correct: boolean) => {
    if (isTransitioning) return;

    onUpdateStreak(currentCard.id, correct);
    if (correct) {
      setCorrectIds(prev => [...prev, currentCard.id]);
    } else {
      setIncorrectIds(prev => [...prev, currentCard.id]);
    }

    const doAdvance = () => {
      if (currentIndex < sessionCards.length - 1) {
        setCurrentIndex((p) => p + 1);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsCompleted(true);
      }
    };

    transitionToNextCard(doAdvance);
  };

  // Writing Mode - Submit Check
  const handleCheckWrite = () => {
    if (!writeAnswer.trim()) return;
    
    // Check target: front text (German) or back text (Arabic)
    const correctTarget = method === "listen" 
      ? currentCard.frontText 
      : (writeTestTarget === "front" ? currentCard.frontText : currentCard.backText);
    const isCorrect = checkAnswer(writeAnswer, correctTarget);
    
    if (isCorrect) {
      setWriteResult("correct");
      onUpdateStreak(currentCard.id, true);
      setCorrectIds(prev => [...prev, currentCard.id]);
    } else {
      setWriteResult("incorrect");
      onUpdateStreak(currentCard.id, false);
      setIncorrectIds(prev => [...prev, currentCard.id]);
    }

    const spokenText = method === "listen" || writeTestTarget === "front"
      ? currentCard.frontText
      : currentCard.backText;
    const spokenLang = method === "listen" || writeTestTarget === "front"
      ? (currentCard.frontLang || "de")
      : (currentCard.backLang || "ar");

    setIsPronouncingCorrect(true);
    if (writeAutoListenSuccess) {
      playPronunciationWithEnd(spokenText, spokenLang, () => {
        setIsPronouncingCorrect(false);
        if (autoAdvanceRef.current && isCorrect) {
          setTimeout(() => {
            handleNextCard();
          }, 800);
        }
      });
    } else {
      setIsPronouncingCorrect(false);
      if (autoAdvanceRef.current && isCorrect) {
        setTimeout(() => {
          handleNextCard();
        }, 800);
      }
    }
  };

  // Handle choice selection in listening review
  const handleCheckListenChoice = (card: Flashcard) => {
    if (writeResult !== null) return; // Already checked
    
    setSelectedListenCardId(card.id);
    
    const isCorrect = card.id === currentCard.id;
    if (isCorrect) {
      setWriteResult("correct");
      onUpdateStreak(currentCard.id, true);
      setCorrectIds(prev => [...prev, currentCard.id]);
    } else {
      setWriteResult("incorrect");
      onUpdateStreak(currentCard.id, false);
      setIncorrectIds(prev => [...prev, currentCard.id]);
    }

    setIsPronouncingCorrect(true);
    if (listenAutoListenSuccess) {
      playPronunciationWithEnd(currentCard.frontText, currentCard.frontLang || "de", () => {
        setIsPronouncingCorrect(false);
        if (autoAdvanceRef.current && isCorrect) {
          setTimeout(() => {
            handleNextCard();
          }, 1200);
        }
      });
    } else {
      setIsPronouncingCorrect(false);
      if (autoAdvanceRef.current && isCorrect) {
        setTimeout(() => {
          handleNextCard();
        }, 1200);
      }
    }
  };

  // German Article - Option Selected Check
  const handleCheckArticle = (article: "der" | "die" | "das" | "die-plural") => {
    setSelectedArticle(article);
    const isCorrect = currentCard.correctArticle === article;

    if (isCorrect) {
      setArticleResult("correct");
      onUpdateStreak(currentCard.id, true);
      setCorrectIds(prev => [...prev, currentCard.id]);
    } else {
      setArticleResult("incorrect");
      onUpdateStreak(currentCard.id, false);
      setIncorrectIds(prev => [...prev, currentCard.id]);
    }

    // Always play pronunciation of the CORRECT article and noun combined!
    const correctArt = currentCard.correctArticle || "der";
    const spokenArticle = correctArt === "die-plural" ? "die" : correctArt;
    
    setIsPronouncingCorrect(true);
    if (articleAutoListenSuccess) {
      playPronunciationWithEnd(`${spokenArticle} ${currentCard.frontText}`, currentCard.frontLang || "de", () => {
        setIsPronouncingCorrect(false);
        if (autoAdvanceRef.current) {
          setTimeout(() => {
            handleNextCard();
          }, 800);
        }
      });
    } else {
      setIsPronouncingCorrect(false);
      if (autoAdvanceRef.current) {
        setTimeout(() => {
          handleNextCard();
        }, 800);
      }
    }
  };

  const handleShuffleSessionCards = () => {
    if (sessionCards.length <= 1) return;

    // Trigger visual shuffle state for animation
    setIsShuffling(true);
    setTimeout(() => setIsShuffling(false), 600);

    const shuffled = [...sessionCards];
    const currentId = sessionCards[currentIndex]?.id;

    // Fisher-Yates algorithm for high-quality, non-biased shuffling
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    // Force a different card at index 0 if possible, so user gets immediate visual feedback that it shuffled
    if (shuffled.length > 1 && shuffled[0].id === currentId) {
      const swapIndex = shuffled.findIndex((c) => c.id !== currentId);
      if (swapIndex !== -1) {
        const temp = shuffled[0];
        shuffled[0] = shuffled[swapIndex];
        shuffled[swapIndex] = temp;
      }
    }

    setSessionCards(shuffled);
    setCurrentIndex(0);
    const nextFlipped = isAutoPlaying 
      ? (autoFlipMode === "back_only") 
      : (manualStartFace === "back");
    setFlipped(nextFlipped);
  };

  const handleNextCard = () => {
    if (isTransitioning) return;

    // Any card skipped without manual decision (not in correctIds and not in incorrectIds) is counted as incorrect ("لم أعرفها") ONLY for the classic method
    if (method === "classic" && currentCard && !correctIds.includes(currentCard.id) && !incorrectIds.includes(currentCard.id)) {
      onUpdateStreak(currentCard.id, false);
      setIncorrectIds((prev) => [...prev, currentCard.id]);
    }

    const doAdvance = () => {
      if (currentIndex < sessionCards.length - 1) {
        setCurrentIndex((p) => p + 1);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsCompleted(true);
      }
    };

    transitionToNextCard(doAdvance);
  };

  const handleToggleAutoPlay = () => {
    setIsAutoPlaying((prev) => {
      const nextVal = !prev;
      if (nextVal) {
        // Autoplay is starting: set correct start face based on autoFlipMode
        if (autoFlipMode === "back_only") {
          setFlipped(true);
        } else {
          setFlipped(false);
        }
      } else {
        // Autoplay stopped: revert to manual start face
        if (manualStartFace === "back") {
          setFlipped(true);
        } else {
          setFlipped(false);
        }
      }
      return nextVal;
    });
  };

  // Restart the review session with only missed cards
  const handleReviewErrorsOnly = () => {
    const errorCards = filteredCards.filter(c => incorrectIds.includes(c.id));
    if (errorCards.length > 0) {
      setSessionCards(errorCards);
      setCurrentIndex(0);
      setCorrectIds([]);
      setIncorrectIds([]);
      setFlipped(false);
      setWriteAnswer("");
      setWriteResult(null);
      setArticleResult(null);
      setSelectedArticle("");
      setSelectedListenCardId("");
      setIsCompleted(false);
      setTime(0);
      setIsAutoPlaying(false);
      setHasStartedStep(true);
    }
  };

  // Restart full session
  const handleResetFullSession = () => {
    setSessionCards(filteredCards);
    setCurrentIndex(0);
    setCorrectIds([]);
    setIncorrectIds([]);
    setFlipped(false);
    setWriteAnswer("");
    setWriteResult(null);
    setArticleResult(null);
    setSelectedArticle("");
    setSelectedListenCardId("");
    setIsCompleted(false);
    setTime(0);
    setIsAutoPlaying(false);
    setHasStartedStep(true);
    if (method === "match") {
      resetMatchingGame();
    }
  };

  // Add Keyboard listeners for fluent learning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted || method === "match" || isReviewChatOpen) return;

      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

      // While typing, completely disable global hotkeys to avoid intercepting inputs, textareas, search boxes, and forms
      if (isTyping) {
        return;
      }

      switch (e.key) {
        case " ": // Space to flip card in classic mode
          if (method === "classic") {
            e.preventDefault();
            setFlipped(prev => !prev);
          }
          break;
        case "Enter": // Enter to submit or next
          e.preventDefault();
          if (method === "write" || method === "listen") {
            if (writeResult === "correct") {
              handleNextCard();
            } else {
              handleCheckWrite();
            }
          } else if (method === "article") {
            if (articleResult !== null) {
              handleNextCard();
            }
          } else if (method === "classic") {
            if (flipped) {
              handleClassicKnow(true);
            } else {
              setFlipped(true);
            }
          } else if (method === "challenge") {
            if (!challengeRevealed) {
              if (challengeIntervalRef.current) clearInterval(challengeIntervalRef.current);
              setChallengeActive(false);
              setChallengeRevealed(true);
              let textToSpeak = "";
              let langToSpeak = "de";
              if (challengeTarget === "front") {
                textToSpeak = currentCard.frontText;
                langToSpeak = currentCard.frontLang || "de";
              } else if (challengeTarget === "back") {
                textToSpeak = currentCard.backText;
                langToSpeak = currentCard.backLang || "de";
              } else if (challengeTarget === "plural") {
                textToSpeak = currentCard.pluralText || "";
                langToSpeak = currentCard.pluralLang || "de";
              }
              if (textToSpeak) {
                playPronunciation(textToSpeak, langToSpeak);
              }
            } else {
              handleClassicKnow(true);
            }
          }
          break;
        case "ArrowLeft": // Left arrow key for negative/prev or next in classic/challenge
          if (method === "challenge") {
            e.preventDefault();
            handleNextCard();
          } else if (method === "classic") {
            e.preventDefault();
            handleNextCard();
          }
          break;
        case "ArrowRight": // Right arrow key for positive/next or prev in classic/challenge
          if (method === "challenge") {
            e.preventDefault();
            handlePrevCard();
          } else if (method === "classic") {
            e.preventDefault();
            handlePrevCard();
          }
          break;
        case "ArrowUp": // Up arrow key to flip card in classic mode
          if (method === "classic") {
            e.preventDefault();
            setFlipped(prev => !prev);
          }
          break;
        case "ArrowDown": // Down arrow key to toggle/open plural in classic mode
          if (method === "classic") {
            e.preventDefault();
            const currentCard = sessionCards[currentIndex];
            if (currentCard && currentCard.isPluralMode && currentCard.pluralText) {
              const nextShow = !classicShowPlural;
              setClassicShowPlural(nextShow);
              if (nextShow) {
                playPronunciation(currentCard.pluralText!, currentCard.pluralLang || "de", true);
              }
            }
          }
          break;
        case "1":
          if (method === "article" && articleResult === null) {
            handleCheckArticle("der");
          }
          break;
        case "2":
          if (method === "article" && articleResult === null) {
            handleCheckArticle("die");
          }
          break;
        case "3":
          if (method === "article" && articleResult === null) {
            handleCheckArticle("das");
          }
          break;
        case "4":
          if (method === "article" && articleResult === null) {
            handleCheckArticle("die-plural");
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, sessionCards, flipped, writeAnswer, writeResult, articleResult, method, isCompleted, classicShowPlural, isTransitioning, isReviewChatOpen]);

  const renderStoryboardMap = (progressIdx: number, showCheck: boolean) => {
    if (!chainMethods || chainIndex === undefined) return null;

    const getMethodIcon = (methodVal: ReviewMethod) => {
      switch (methodVal) {
        case "challenge":
          return <Timer className="w-4 h-4 sm:w-5 sm:h-5" />;
        case "write":
          return <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />;
        case "listen":
          return <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />;
        case "article":
          return <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />;
        case "match":
          return <Layers className="w-4 h-4 sm:w-5 sm:h-5" />;
        case "classic":
        default:
          return <Layers className="w-4 h-4 sm:w-5 sm:h-5" />;
      }
    };

    // Determine layout points based on count of methods
    const points = chainMethods.map((_, idx) => {
      if (chainMethods.length === 1) {
        return { x: 50, y: 50 };
      }
      // Responsive wavy path points
      const x = 12 + idx * (76 / (chainMethods.length - 1));
      const y = 45 + (idx % 2 === 0 ? -15 : 15);
      return { x, y };
    });

    // Generate path connecting nodes
    let pathD = "";
    if (points.length > 1) {
      pathD = points.reduce((acc, p, i) => {
        return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
      }, "");
    }

    const currentPinPoint = points[progressIdx] || { x: 50, y: 50 };

    return (
      <div className="w-full bg-blue-50/20 dark:bg-blue-950/10 rounded-3xl p-5 sm:p-6 border border-blue-100/40 dark:border-blue-950/20 flex flex-col gap-4 text-right overflow-hidden">
        <div className="flex items-center justify-between text-xs font-bold text-blue-600/70 dark:text-blue-400/70">
          <span className="flex items-center gap-1.5 text-blue-900 dark:text-blue-100">
            <span>خريطة مسار المراجعة المتسلسلة 🗺️</span>
          </span>
          <span className="text-[#0056f6] font-extrabold bg-blue-50 dark:bg-blue-950/20 px-3 py-1 rounded-full select-none text-[10px] sm:text-xs">
            الخطوة {chainIndex + 1} من {chainMethods.length}
          </span>
        </div>

        {/* Interactive Road Stage Container */}
        <div className="relative w-full h-[140px] select-none mt-2">
          {/* SVG Connectors (Roads) */}
          {points.length > 1 && (
            <svg 
              className="absolute inset-0 w-full h-full" 
              viewBox="0 0 100 100" 
              preserveAspectRatio="none"
              style={{ pointerEvents: "none" }}
            >
              {/* Background Colored Track instead of boring Gray */}
              <path
                d={pathD}
                fill="none"
                stroke="#bfdbfe"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-blue-200 dark:stroke-blue-900/60"
              />
              {/* Animated Active Colored Path (drawn as user advances) */}
              <motion.path
                d={pathD}
                fill="none"
                stroke="#0056f6"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-[#0056f6] dark:stroke-blue-400"
                initial={{ pathLength: 0 }}
                animate={{
                  pathLength: chainMethods.length > 1 ? progressIdx / (chainMethods.length - 1) : 1
                }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            </svg>
          )}

          {/* Moving Player Pin Indicator */}
          <motion.div
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${currentPinPoint.x}%`,
              top: `${currentPinPoint.y}%`,
              transform: "translate(-50%, -100%)",
            }}
            animate={{
              left: `${currentPinPoint.x}%`,
              top: `${currentPinPoint.y}%`,
            }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          >
            {/* Jumping pointer body */}
            <motion.div
              className="relative flex flex-col items-center mb-3"
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            >
              {/* Outer Pulsing Shadow */}
              <span className="absolute -inset-1 rounded-full bg-blue-500/30 animate-ping" />
              <div className="bg-[#0056f6] text-white w-9 h-9 sm:w-10 sm:h-10 rounded-full shadow-lg border-2 border-white flex items-center justify-center relative z-10">
                <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
              </div>
              {/* Downward pointing triangle */}
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-[#0056f6] -mt-[1px] relative z-10" />
            </motion.div>
          </motion.div>

          {/* Level Node Circles */}
          {chainMethods.map((m, idx) => {
            const isPast = idx < progressIdx;
            const isCurrentNode = idx === progressIdx;
            const isNextNode = idx === progressIdx + 1;
            const label = methodArabicLabels[m];
            const pt = points[idx] || { x: 50, y: 50 };

            return (
              <div
                key={idx}
                className="absolute z-10 flex flex-col items-center"
                style={{
                  left: `${pt.x}%`,
                  top: `${pt.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {/* Circle Node Body */}
                <div className="relative">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black transition-all duration-500 shadow-sm border-2 ${
                    isPast
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : isCurrentNode
                        ? "bg-blue-50 border-[#0056f6] text-[#0056f6] ring-4 ring-blue-500/10 dark:bg-blue-950/20"
                        : isNextNode
                          ? "bg-white border-blue-200 text-blue-500 dark:bg-blue-950/30 dark:border-blue-900"
                          : "bg-blue-50/40 border-blue-100/50 text-blue-300 dark:bg-blue-950/10 dark:border-blue-950/30"
                  }`}>
                    {getMethodIcon(m)}
                  </div>

                  {/* Completed Green Checkmark overlay (Pops with Framer Motion scale) */}
                  <AnimatePresence>
                    {(isPast || (isCurrentNode && showCheck)) && (
                      <motion.div
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                        className="absolute inset-0 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md border-2 border-white"
                      >
                        <Check className="w-5 h-5 stroke-[3px]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Node Arabic Label at bottom - beautifully spaced with custom pill background */}
                <span className={`absolute top-11 sm:top-13 text-[10px] sm:text-xs font-bold whitespace-nowrap px-2.5 py-0.5 rounded-full transition-all duration-500 border ${
                  isPast
                    ? "text-emerald-700 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-900/30"
                    : isCurrentNode
                      ? "text-[#0056f6] bg-blue-50 border-blue-100 font-extrabold scale-105 shadow-sm dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-900/40"
                      : "text-blue-400/60 bg-blue-50/20 border-blue-100/20 dark:text-blue-500/50 dark:bg-blue-950/10 dark:border-blue-900/20"
                }`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const accuracyRate = sessionCards.length > 0 
    ? Math.round((correctIds.length / sessionCards.length) * 100) 
    : 0;

  return (
    <MotionConfig reducedMotion={ultraLightMode ? "always" : "user"}>
      <div className={`fixed inset-0 z-50 flex flex-col font-sans select-none transition-colors duration-300 ${ultraLightMode ? "ultra-light-mode" : ""} ${isDarkMode ? "review-night-mode bg-slate-950 text-slate-100" : "bg-surface text-on-surface"}`} dir="rtl">
      
      {/* Top Navigation Bar */}
      {isCompleted ? (
        <header className="relative w-full h-14 bg-white/85 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 z-10 shrink-0 select-none">
          {/* Left: Close Button */}
          <div className="w-16 flex items-center justify-start">
            <button 
              onClick={onClose} 
              aria-label="Close" 
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Center: Title */}
          <div className="flex-1 flex justify-center">
            <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">اكتملت المراجعة 🎉</span>
          </div>

          {/* Right: Timer */}
          <div className="w-16 flex items-center justify-end">
            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono text-xs font-semibold">
              <Timer className="w-3.5 h-3.5" />
              <span>{formatTimer(time)}</span>
            </div>
          </div>
        </header>
      ) : (chainMethods && chainIndex !== undefined && !hasStartedStep) ? (
        <header className="relative w-full h-14 bg-white/85 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 z-10 shrink-0 select-none">
          {/* Left: Close Button */}
          <div className="w-16 flex items-center justify-start">
            <button 
              onClick={onClose} 
              aria-label="Close" 
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Center: Title */}
          <div className="flex-1 flex justify-center">
            <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">خريطة مسار المراجعة المتسلسلة 🗺️</span>
          </div>

          {/* Right: Empty */}
          <div className="w-16" />
        </header>
      ) : (
        <header className="relative w-full h-14 bg-white/85 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 z-10 shrink-0 select-none">
          {/* Left: Close Button */}
          <div className="w-16 flex items-center justify-start">
            <button 
              onClick={onClose} 
              aria-label="Close" 
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Center: Title / Current Step Count */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {chainMethods && chainIndex !== undefined ? (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-extrabold text-primary bg-primary/10 dark:text-blue-400 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-full select-none">
                  سلسلة المراجعة: خطوة {chainIndex + 1} من {chainMethods.length} ({methodArabicLabels[method]})
                </span>
                {method !== "match" && sessionCards.length > 0 && (
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                    {currentIndex + 1} من {sessionCards.length}
                  </span>
                )}
              </div>
            ) : (
              method !== "match" && sessionCards.length > 0 ? (
                <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                  {currentIndex + 1} من {sessionCards.length}
                </span>
              ) : (
                <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                  {method === "match" ? "لعبة التوصيل" : "مراجعة"}
                </span>
              )
            )}
          </div>

          {/* Right: Timer */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-xs font-semibold bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
              <Timer className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatTimer(time)}</span>
            </div>
          </div>

          {/* Integrated thin progress line at the absolute bottom (acts as border) */}
          {method !== "match" && sessionCards.length > 0 && (
            <div className="absolute bottom-0 right-0 left-0 h-[2.5px] bg-slate-200/60 dark:bg-slate-800/80 overflow-hidden">
              <motion.div 
                className="absolute right-0 top-0 h-full bg-emerald-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${((currentIndex + 1) / sessionCards.length) * 100}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          )}
        </header>
      )}

      {/* Main Container Area */}
      <div className="flex-1 overflow-y-auto bg-surface-bright flex flex-col justify-start sm:justify-center items-center pt-5 sm:pt-9 pb-6 px-4">
        
        <AnimatePresence mode="wait">
          
          {/* COMPLETION SCREEN */}
          {isCompleted ? (
            isFinalChainStep ? (
              <motion.div 
                key="final-chain-completion"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="review-results-modal w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col items-center gap-5 text-center animate-fade-in"
              >
                {/* Visual Trophy Badge */}
                <div className="relative mt-2">
                  <div className="absolute -inset-2 bg-gradient-to-tr from-amber-400 to-yellow-300 rounded-full opacity-30 blur-md animate-pulse" />
                  <div className="w-18 h-18 rounded-full bg-amber-500 text-white flex items-center justify-center relative z-10 shadow-lg border-2 border-white">
                    <Trophy className="w-10 h-10 animate-bounce" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">ألف مبروك! لقد أكملت المسار بالكامل 🏆</h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold max-w-md mx-auto leading-relaxed">
                    يا لك من بطل! لقد أنهيت جميع مراحل مسار المراجعة المتسلسلة بنجاح تام وبدقة 100%. فخورون بإنجازك الرائع!
                  </p>
                </div>

                {/* Show the fully completed path map with beautiful progress animations */}
                {renderStoryboardMap(finalProgressIdx, finalShowCheck)}

                {/* Bento Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mt-1">
                  <div className="stat-box-blue bg-blue-50/80 dark:bg-blue-950/40 rounded-2xl p-3 flex flex-col justify-center items-center border border-blue-200/80 dark:border-blue-800/50">
                    <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase block mb-1">نسبة الدقة</span>
                    <span className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">100%</span>
                    <span className="text-[9px] text-blue-600/70 dark:text-blue-300/70 font-bold mt-0.5">إتقان كامل</span>
                  </div>

                  <div className="stat-box-green bg-emerald-50/80 dark:bg-emerald-950/40 rounded-2xl p-3 flex flex-col justify-center items-center border border-emerald-200/80 dark:border-emerald-800/50">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase block mb-1">الخطوات المكتملة</span>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{chainMethods.length} / {chainMethods.length}</span>
                    <span className="text-[9px] text-emerald-600/70 dark:text-emerald-300/70 font-bold mt-0.5">مسار كامل</span>
                  </div>

                  <div className="stat-box-green bg-emerald-50/80 dark:bg-emerald-950/40 rounded-2xl p-3 flex flex-col justify-center items-center border border-emerald-200/80 dark:border-emerald-800/50">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase block mb-1">إجمالي البطاقات</span>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{sessionCards.length}</span>
                    <span className="text-[9px] text-emerald-600/70 dark:text-emerald-300/70 font-bold mt-0.5">بطاقة تم إتقانها</span>
                  </div>

                  <div className="stat-box-purple bg-purple-50/80 dark:bg-purple-950/40 rounded-2xl p-3 flex flex-col justify-center items-center border border-purple-200/80 dark:border-purple-800/50">
                    <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase block mb-1">الوقت الإجمالي</span>
                    <span className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 font-mono">{formatTimer(time)}</span>
                    <span className="text-[9px] text-purple-600/70 dark:text-purple-300/70 font-bold mt-0.5">سرعة ممتازة</span>
                  </div>
                </div>

                {/* Closing Button */}
                <div className="w-full border-t border-slate-200/80 dark:border-slate-800 pt-4 mt-2">
                  <button
                    onClick={onClose}
                    className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <Check className="w-5 h-5 stroke-[3px]" />
                    <span>إغلاق وإنهاء المراجعة 🌟</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="completion"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="review-results-modal w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col items-center gap-6 text-center animate-fadeIn"
              >
                {/* Header Icon & Title */}
                <div className="flex flex-col items-center gap-2 mt-1">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md ${
                    incorrectIds.length === 0
                      ? "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/30"
                  }`}>
                    {incorrectIds.length === 0 ? (
                      <Award className="w-9 h-9 animate-bounce" />
                    ) : (
                      <RotateCcw className="w-8 h-8" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      {chainMethods && chainIndex !== undefined
                        ? (incorrectIds.length === 0 ? "أحسنت! أكملت هذه الخطوة بنجاح 🎯" : `انتهت محاولة الخطوة (${chainIndex + 1}) 🎯`)
                        : (incorrectIds.length === 0 ? "أحسنت! اكتملت المراجعة بنجاح 🎉" : "انتهت جلسة المراجعة 📊")}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold max-w-md mx-auto">
                      {chainMethods && chainIndex !== undefined
                        ? (incorrectIds.length === 0 ? "أداء ممتاز! يمكنك المتابعة إلى الخطوة القادمة." : "راجع أخطاءك لتصفيرها والتأهل للمرحلة القادمة.")
                        : `تمت مراجعة ${sessionCards.length} بطاقات بنجاح بدقة ${accuracyRate}%`}
                    </p>
                  </div>
                </div>

                {/* Show Storyboard Roadmap in chain mode */}
                {chainMethods && chainIndex !== undefined && renderStoryboardMap(storyboardProgressIdx, storyboardShowCheck)}

                {/* Prominent Actionable Status Banner (Chain Mode & Alerts) */}
                {chainMethods && chainIndex !== undefined && incorrectIds.length > 0 && (
                  <div className="w-full bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 dark:border-amber-700/60 rounded-2xl p-4 text-right flex items-start gap-3 text-amber-900 dark:text-amber-200">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs font-bold leading-relaxed">
                      <p className="text-amber-800 dark:text-amber-300 font-black text-sm">مطلوب إنهاء الخطوة بـ 0 أخطاء للمتابعة!</p>
                      <p className="mt-1 text-amber-700 dark:text-amber-400 font-medium">
                        لديك <span className="font-extrabold text-rose-600 dark:text-rose-400">{incorrectIds.length} بطاقات</span> بحاجة لتصحيح. اضغط على زر <strong className="text-amber-900 dark:text-amber-200">"مراجعة الأخطاء فقط"</strong> بالأسفل لتصفيرها والمتابعة.
                      </p>
                    </div>
                  </div>
                )}

                {chainMethods && chainIndex !== undefined && incorrectIds.length === 0 && chainIndex < chainMethods.length - 1 && (
                  <div className="w-full bg-blue-500/10 dark:bg-blue-950/40 border border-blue-500/30 dark:border-blue-700/60 rounded-2xl p-4 text-right flex items-start gap-3 text-blue-900 dark:text-blue-200">
                    <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 animate-pulse" />
                    <div className="flex-1 text-xs font-bold leading-relaxed">
                      <p className="text-blue-800 dark:text-blue-300 font-black text-sm">الاستعداد للخطوة التالية بالمسار 🎯</p>
                      <p className="mt-1 text-blue-700 dark:text-blue-400 font-medium">
                        المرحلة القادمة هي <strong className="text-blue-900 dark:text-blue-200 font-bold">"{methodArabicLabels[chainMethods[chainIndex + 1]]}"</strong> ({sessionCards.length} بطاقات). اضغط بالأسفل لبدئها فوراً!
                      </p>
                    </div>
                  </div>
                )}

                {/* Bento Stats Grid - 4 Balanced Clean Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                  {/* Accuracy Rate */}
                  <div className="stat-box-blue bg-blue-50/80 dark:bg-blue-950/40 rounded-2xl p-4 flex flex-col items-center justify-center border border-blue-200/80 dark:border-blue-800/50 relative overflow-hidden">
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase block mb-1">نسبة الدقة</span>
                    <div className="relative w-16 h-16 flex items-center justify-center my-1">
                      <svg className="w-16 h-16 -rotate-90 overflow-visible" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="32" stroke={isDarkMode ? "#1e3a8a" : "#dbeafe"} strokeWidth="7" fill="transparent" />
                        <circle 
                          cx="40" 
                          cy="40" 
                          r="32" 
                          stroke={isDarkMode ? "#60a5fa" : "#2563eb"} 
                          strokeWidth="7" 
                          fill="transparent" 
                          strokeDasharray={2 * Math.PI * 32}
                          strokeDashoffset={2 * Math.PI * 32 * (1 - accuracyRate / 100)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute text-base font-black text-blue-700 dark:text-blue-300">{accuracyRate}%</span>
                    </div>
                    <span className="text-[10px] text-blue-600/70 dark:text-blue-300/70 font-bold">معدل الإجابات</span>
                  </div>

                  {/* Correct Answers */}
                  <div className="stat-box-green bg-emerald-50/80 dark:bg-emerald-950/40 rounded-2xl p-4 flex flex-col justify-center items-center border border-emerald-200/80 dark:border-emerald-800/50">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase block mb-1">بطاقات صحيحة</span>
                    <span className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400 my-1">{correctIds.length}</span>
                    <span className="text-[10px] text-emerald-600/70 dark:text-emerald-300/70 font-bold">إجابة متقنة</span>
                  </div>

                  {/* Errors */}
                  <div className="stat-box-red bg-rose-50/80 dark:bg-rose-950/40 rounded-2xl p-4 flex flex-col justify-center items-center border border-rose-200/80 dark:border-rose-800/50">
                    <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 uppercase block mb-1">بحاجة لمراجعة</span>
                    <span className="text-3xl sm:text-4xl font-black text-rose-600 dark:text-rose-400 my-1">{incorrectIds.length}</span>
                    <span className="text-[10px] text-rose-600/70 dark:text-rose-300/70 font-bold">أخطاء للتحسين</span>
                  </div>

                  {/* Time & Total */}
                  <div className="stat-box-purple bg-purple-50/80 dark:bg-purple-950/40 rounded-2xl p-4 flex flex-col justify-center items-center border border-purple-200/80 dark:border-purple-800/50">
                    <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase block mb-1">وقت الجلسة</span>
                    <span className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 font-mono my-2">{formatTimer(time)}</span>
                    <span className="text-[10px] text-purple-600/70 dark:text-purple-300/70 font-bold">إجمالي: {sessionCards.length} بطاقات</span>
                  </div>
                </div>

                {/* Actions Grid */}
                <div className="flex flex-col sm:flex-row gap-3 w-full mt-2 border-t border-slate-200/80 dark:border-slate-800 pt-5">
                  {chainMethods && chainIndex !== undefined && onCompleteChainStep ? (
                    <>
                      {/* If there are errors, they MUST clear them */}
                      {incorrectIds.length > 0 ? (
                        <>
                          <button
                            onClick={handleReviewErrorsOnly}
                            className="flex-1 py-3.5 px-5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                          >
                            <RotateCcw className="w-4 h-4 shrink-0" />
                            مراجعة الأخطاء فقط ({incorrectIds.length})
                          </button>
                          <button
                            onClick={handleResetFullSession}
                            className="py-3.5 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-xl border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4 shrink-0" />
                            إعادة المحاولة كاملة
                          </button>
                        </>
                      ) : (
                        /* Zero errors! Proceed button */
                        <>
                          {chainIndex < chainMethods.length - 1 ? (
                            <button
                              onClick={() => onCompleteChainStep(chainIndex + 1)}
                              className="flex-1 py-3.5 px-6 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                            >
                              <span>الذهاب للخطوة التالية بالمسار 🎯 ({methodArabicLabels[chainMethods[chainIndex + 1]]})</span>
                              <ArrowLeft className="w-4 h-4 shrink-0" />
                            </button>
                          ) : (
                            <button
                              onClick={onClose}
                              className="flex-1 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                            >
                              <Check className="w-4 h-4 shrink-0 stroke-[3px]" />
                              <span>تهانينا! إكمال السلسلة بالكامل 🎉</span>
                            </button>
                          )}
                          <button
                            onClick={handleResetFullSession}
                            className="py-3.5 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-xl border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4 shrink-0" />
                            إعادة المحاولة كاملة
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    /* Standard review action buttons */
                    <>
                      {/* Practice Mistakes Only */}
                      {incorrectIds.length > 0 && (
                        <button
                          onClick={handleReviewErrorsOnly}
                          className="flex-1 py-3.5 px-5 bg-primary hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                        >
                          <RotateCcw className="w-4 h-4 shrink-0" />
                          مراجعة الأخطاء فقط ({incorrectIds.length})
                        </button>
                      )}

                      {/* Restart full session */}
                      <button
                        onClick={handleResetFullSession}
                        className="flex-1 py-3.5 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-xl border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4 shrink-0" />
                        إعادة المحاولة كاملة
                      </button>

                      {/* Return */}
                      <button
                        onClick={onClose}
                        className="py-3.5 px-6 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm rounded-xl transition-all cursor-pointer"
                      >
                        العودة للمجلد
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )) : (chainMethods && chainIndex !== undefined && !hasStartedStep) ? (
            /* INTRO STORYBOARD SCREEN */
            <motion.div
              key="storyboard-intro"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full max-w-2xl bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-elevation-3 border border-outline-variant/40 flex flex-col items-center gap-6 text-center animate-fade-in"
            >
              <div className="space-y-1">
                <span className="text-[10px] sm:text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-3.5 py-1.5 rounded-full select-none uppercase tracking-wider">
                  طريق مسارك التعليمي الممتع 🚀
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white mt-3">الخطوة القادمة: {methodArabicLabels[chainMethods[chainIndex]]} 🎯</h2>
                <p className="text-xs sm:text-sm text-blue-900/70 dark:text-blue-200/70 font-medium max-w-md mx-auto leading-relaxed mt-1">
                  أنت على وشك بدء مرحلة جديدة ممتعة لترسيخ الكلمات عبر <strong className="text-blue-700 dark:text-blue-400">"{methodArabicLabels[chainMethods[chainIndex]]}"</strong>. استعد للتركيز والتفاعل!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
                <button
                  type="button"
                  onClick={() => setHasStartedStep(true)}
                  className="w-full py-3.5 px-6 bg-[#0056f6] hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                >
                  <span>ابدأ الخطوة الآن 🚀</span>
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </motion.div>
          ) : (
            /* ACTIVE CARDS & REVIEW INTERFACE */
            <motion.div
              key="active-session-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center gap-4"
            >
              {/* Action Bar (Shuffle & Settings & Night Mode & Autoplay & Edit) with expandable distraction-free toggle */}
              {method !== "match" && method !== "article" && method !== "write" && method !== "listen" && currentCard && (
                <div className="flex flex-col items-center gap-1.5 mb-1 animate-fadeIn">
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2 bg-surface-container-low/70 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-full border border-outline-variant/20 shadow-2xs">
                    {/* Collapsed / Core Controls */}
                    {method === "classic" && (
                      <button
                        type="button"
                        onClick={handleToggleAutoPlay}
                        title={isAutoPlaying ? "إيقاف التشغيل التلقائي" : "بدء التشغيل التلقائي"}
                        className={`p-2 rounded-full transition-all cursor-pointer shadow-2xs active:scale-90 flex items-center justify-center ${
                          isAutoPlaying 
                            ? "bg-primary text-white hover:bg-primary-container" 
                            : "bg-emerald-600/90 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {isAutoPlaying ? (
                          <Pause className="w-4 h-4 animate-pulse" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* AI Chat / Discussion Tutor Button */}
                    <button
                      type="button"
                      onClick={() => setIsReviewChatOpen(true)}
                      title="مناقشة واستفسار بالذكاء الاصطناعي والمصحح اللغوي (محادثة ليلية AI)"
                      className="p-2 rounded-full bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-500 dark:text-indigo-400 border border-indigo-500/30 hover:border-indigo-500/60 transition-all cursor-pointer active:scale-90 flex items-center justify-center relative shadow-2xs"
                    >
                      <Bot className="w-4 h-4" />
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </button>

                    {/* Quick Sound Toggle */}
                    {/* Sound Mute/Unmute */}
                    <button
                      type="button"
                      onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                      title={isSoundEnabled ? "كتم الصوت العام" : "تشغيل الصوت العام"}
                      className={`p-2 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center ${
                        isSoundEnabled 
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200" 
                          : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200"
                      }`}
                    >
                      {isSoundEnabled ? (
                        <Volume2 className="w-4 h-4" />
                      ) : (
                        <VolumeX className="w-4 h-4" />
                      )}
                    </button>

                    {/* Quick Repeat Audio toggle (Classic) */}
                    {method === "classic" && (
                      <button
                        type="button"
                        onClick={handleRepeatClick}
                        onMouseDown={handleRepeatTouchStart}
                        onMouseUp={handleRepeatTouchEnd}
                        onMouseLeave={handleRepeatTouchEnd}
                        onTouchStart={handleRepeatTouchStart}
                        onTouchEnd={handleRepeatTouchEnd}
                        onTouchMove={handleRepeatTouchEnd}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsRepeatModalOpen(true);
                        }}
                        title={isRepeatAudioEnabled ? "إيقاف تكرار النطق المخصص (اضغط مطولاً للإعدادات)" : "تفعيل تكرار النطق المخصص (اضغط مطولاً للإعدادات)"}
                        className={`p-2 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center relative select-none ${
                          isRepeatAudioEnabled
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        <Repeat className="w-4 h-4" />
                        {isRepeatAudioEnabled && (
                          <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 flex items-center justify-center rounded-full bg-slate-200 text-[8px] font-black text-slate-950 border border-white shadow-3xs">
                            {repeatSequence.some(s => s.type === "note") ? "🎤" : `${repeatSequence.filter(s => s.type === "speak").length}x`}
                          </span>
                        )}
                      </button>
                    )}

                    {/* Divider */}
                    <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />

                    {/* Expanded Items (Rendered smoothly when isToolbarExpanded is true) */}
                    {isToolbarExpanded && (
                      <div className="flex items-center gap-1.5 animate-fadeIn">
                        {/* Edit Card */}
                        <button
                          type="button"
                          onClick={handleOpenEditCard}
                          title="تعديل البطاقة الحالية"
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {(method === "classic" || method === "challenge") && (
                          <button
                            type="button"
                            id="shuffle-btn"
                            onClick={handleShuffleSessionCards}
                            title="خلط البطاقات"
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                          >
                            <Shuffle className="w-4 h-4" />
                          </button>
                        )}
                        
                        {(method === "classic" || method === "challenge") && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSettingsTab(method === "classic" ? "classic" : "challenge");
                              setIsSettingsOpen(true);
                            }}
                            title={method === "classic" ? "إعدادات وضع البطاقات" : "إعدادات وضع التحدي"}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                        )}

                        {/* Night Mode toggle */}
                        <button
                          type="button"
                          onClick={() => setIsDarkMode(prev => !prev)}
                          title={isDarkMode ? "الوضع النهاري" : "الوضع الليلي"}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                        >
                          {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                        </button>
                      </div>
                    )}

                    {/* Expand / Collapse Button */}
                    <button
                      type="button"
                      onClick={() => setIsToolbarExpanded(prev => !prev)}
                      title={isToolbarExpanded ? "إخفاء باقي الأدوات" : "إظهار كافة الأدوات"}
                      className={`p-2 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center ${
                        isToolbarExpanded
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {isToolbarExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <MoreHorizontal className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Special Action Bar for Article Mode */}
              {method === "article" && currentCard && (
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-1 bg-surface-container-low/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-outline-variant/20 shadow-2xs w-fit animate-fadeIn">
                  {/* زر الإعدادات */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSettingsTab("article");
                      setIsSettingsOpen(true);
                    }}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                    title="إعدادات وضع أداة التعريف"
                  >
                    <Sliders className="w-4 h-4" />
                  </button>

                  {/* Night Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsDarkMode(prev => !prev)}
                    title={isDarkMode ? "الوضع النهاري" : "الوضع الليلي"}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                  >
                    {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                  </button>

                  {/* 1. زر الصوت */}
                  <button
                    type="button"
                    onClick={() => {
                      const correctArt = currentCard.correctArticle;
                      const spokenText = correctArt 
                        ? `${correctArt === "die-plural" ? "die" : correctArt} ${currentCard.frontText}`
                        : currentCard.frontText;
                      setIsPronouncingCorrect(true);
                      playPronunciationWithEnd(spokenText, currentCard.frontLang || "de", () => {
                        setIsPronouncingCorrect(false);
                      }, true);
                    }}
                    className={`p-2 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center ${
                      isPronouncingCorrect 
                        ? "bg-emerald-500 text-white shadow-2xs" 
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    title="نطق الكلمة الصحيحة ونبرتها"
                  >
                    <Volume2 className={`w-4 h-4 ${isPronouncingCorrect ? "animate-pulse" : ""}`} />
                  </button>

                  {/* 2. زر تلقائي التقليب */}
                  <button
                    type="button"
                    onClick={() => {
                      setAutoAdvance(prev => {
                        const next = !prev;
                        localStorage.setItem("settings_article_auto_next", String(next));
                        return next;
                      });
                    }}
                    className={`p-2 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center relative ${
                      autoAdvance 
                        ? "bg-amber-500 text-white shadow-2xs" 
                        : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700"
                    }`}
                    title={autoAdvance ? "إيقاف التقليب التلقائي" : "تفعيل التقليب التلقائي بعد السماع"}
                  >
                    <Timer className="w-4 h-4" />
                    {autoAdvance && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                    )}
                  </button>

                  {/* 3. زر الخلط */}
                  <button
                    type="button"
                    onClick={handleShuffleSessionCards}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                    title="خلط الكروت عشوائياً"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>

                  {/* 4. زر التعديل */}
                  {onEditCard && (
                    <button
                      type="button"
                      onClick={() => onEditCard(currentCard)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full transition-all cursor-pointer active:scale-90 flex items-center justify-center"
                      title="تعديل هذا الكرت"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              
              {/* 1. CLASSIC / 3D FLIP CARD MODE */}
              {method === "classic" && currentCard && (
                <div className="w-full flex flex-col items-center gap-5">

                  {/* Stable Deck Container with static size and overflow-hidden to prevent any layout shaking/scrollbars */}
                  <div className="relative w-full max-w-[356px] h-[466px] select-none mb-4 overflow-hidden rounded-[24px]">

                    {/* Active Card with gorgeous Framer Motion slide/swipe translation */}
                    <AnimatePresence initial={false} custom={direction} mode="popLayout">
                      <motion.div
                        key={currentCard.id}
                        custom={direction}
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
                              ease: [0.16, 1, 0.3, 1], // beautiful organic custom ease
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
                        className="absolute inset-0"
                      >
                        <StudyCard
                          card={currentCard}
                          globalFlipped={flipped}
                          onFlipToggle={() => {
                            if (isTransitioning) return;
                            setFlipped(!flipped);
                          }}
                          hideFront={hideFront}
                          hideBack={hideBack}
                          onPlayPronunciation={(t, l) => playPrimaryPronunciation(t, l)}
                          onPlaySecondaryPronunciation={isSecondaryAudioEnabled ? playSecondaryPronunciation : undefined}
                          getSafeImageStyle={getSafeImageStyle}
                          onClassicKnow={handleClassicKnow}
                          showPluralOverride={classicShowPlural}
                          isSwipeImageEnabled={isSwipeImageEnabled}
                          swipeSensitivity={swipeSensitivity}
                          reviewVoiceTarget={reviewVoiceTarget}
                        />
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Carousel manual paginations for classic mode */}
                  <div className="w-full max-w-[356px] flex items-center gap-3 mt-1">
                    {!isAutoPlaying ? (
                      <>
                        <button
                          onClick={handlePrevCard}
                          disabled={currentIndex === 0}
                          className="flex-1 h-13 sm:h-14 bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 rounded-2xl text-xs sm:text-sm font-bold text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-xs"
                        >
                          <ArrowRight className="w-4 h-4 shrink-0" />
                          <span>البطاقة السابقة</span>
                        </button>
                        <button
                          onClick={handleNextCard}
                          className="flex-1 h-13 sm:h-14 bg-primary text-white border border-primary/20 rounded-2xl text-xs sm:text-sm font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <span>البطاقة التالية</span>
                          <ArrowLeft className="w-4 h-4 shrink-0" />
                        </button>
                      </>
                    ) : (
                      <div className="w-full py-3 bg-surface-container/90 border border-outline-variant/20 rounded-2xl text-center shadow-xs">
                        <span className="text-xs font-bold text-on-surface-variant animate-pulse font-mono">
                          تشغيل تلقائي...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. WRITING / DICTATION MODE */}
              {(method === "write" || method === "listen") && currentCard && (
                <div className="w-full flex flex-col items-center gap-5">
                  {/* Core display card styled exactly like the Article Review standard */}
                  <div className="w-full bg-surface-container-lowest rounded-xl shadow-elevation-3 border border-outline-variant/30 overflow-hidden flex flex-col h-[260px]">
                    <div className="w-full h-3/5 relative bg-surface-container-high border-b border-outline-variant/20 flex items-center justify-center p-2">
                      
                      {/* Audio Pronunciation Button */}
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const t = writeQuestionFace === "front" || method === "listen" ? currentCard.frontText : currentCard.backText;
                          const l = writeQuestionFace === "front" || method === "listen" ? currentCard.frontLang || "de" : currentCard.backLang || "ar";
                          playPronunciation(t, l, true);
                        }}
                        className="absolute top-3 left-3 p-2.5 rounded-lg bg-white/95 text-slate-700 hover:bg-primary hover:text-white transition-all shadow-sm cursor-pointer z-10 border border-slate-100"
                        title="استمع للكلمة"
                      >
                        <Volume2 className="w-4.5 h-4.5" />
                      </button>

                      {currentCard.frontImage && 
                       ((method !== "listen" && writeQuestionFace === "front" && (!hideImage || writeResult === "correct")) || 
                        (method === "listen" && writeResult !== null)) ? (
                        <div className="h-full aspect-square relative rounded-lg overflow-hidden border border-outline-variant/10 animate-scaleUp">
                          <ImageWithSkeleton
                            src={currentCard.frontImage}
                            alt="visual illustration"
                            className="absolute inset-0 w-full h-full object-cover"
                            style={getSafeImageStyle(currentCard.frontImagePosition)}
                            referrerPolicy="no-referrer"
                            loading="eager"
                            fetchPriority="high"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-primary text-xs font-bold bg-primary/5">
                          {method === "listen" ? (
                            <div className="flex flex-col items-center gap-2">
                              {/* Pulse wave visualizers */}
                              <div className="flex gap-1.5 items-end justify-center h-10">
                                <span className="w-1.5 h-5 bg-primary rounded-full animate-bounce" />
                                <span className="w-1.5 h-9 bg-primary rounded-full animate-bounce [animation-delay:0.15s]" />
                                <span className="w-1.5 h-12 bg-primary rounded-full animate-bounce [animation-delay:0.3s]" />
                                <span className="w-1.5 h-7 bg-primary rounded-full animate-bounce [animation-delay:0.45s]" />
                                <span className="w-1.5 h-4 bg-primary rounded-full animate-bounce [animation-delay:0.6s]" />
                              </div>
                              <span className="text-[10px] text-primary/80 font-bold tracking-wider uppercase mt-1">Dictation Mode</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <span className="material-symbols-outlined text-4xl text-primary/30">
                                {writeTestTarget === "front" ? "translate" : "edit_note"}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {writeTestTarget === "front" ? "ترجم واكتب بالألمانية" : "اكتب المعنى بالعربية"}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 p-4 flex flex-col items-center justify-center text-center">


                      {method === "listen" ? (
                        writeResult !== null ? (
                          <div className="flex flex-col items-center gap-1 animate-scaleUp">
                            <h2 className="text-2xl font-bold text-on-surface" dir="ltr">
                              {currentCard.frontText}
                            </h2>
                            <p className="text-xs text-slate-400 font-bold" dir="rtl">
                              {currentCard.backText}
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-primary/80 flex items-center justify-center gap-1.5 bg-primary/5 px-4 py-2 rounded-full w-fit mx-auto shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-primary animate-ping shrink-0" />
                            <span>استمع جيداً واختر الإجابة الصحيحة من الخيارات بالأسفل</span>
                          </div>
                        )
                      ) : (
                        // Writing Mode
                        hidePromptText && !revealPromptTemp && writeResult === null ? (
                          <div 
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setRevealPromptTemp(true)}
                            className="py-3 px-6 bg-slate-50/50 hover:bg-slate-100/80 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 duration-200 mx-auto w-fit"
                          >
                            <EyeOff className="w-4.5 h-4.5 text-slate-400" />
                            <span className="text-[11px] text-slate-500 font-medium">وجه السؤال مخفي • انقر للكشف</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            {writeQuestionFace === "back" ? (
                              <h2 className="text-xl font-bold text-on-surface animate-scaleUp" dir="rtl">
                                {currentCard.backText}
                              </h2>
                            ) : (
                              <h2 className="text-2xl font-bold text-on-surface animate-scaleUp" dir="ltr">
                                {currentCard.frontText}
                              </h2>
                            )}
                            {hidePromptText && writeResult === null && (
                              <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setRevealPromptTemp(false)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                                title="إخفاء النص مجدداً"
                              >
                                <EyeOff className="w-3.5 h-3.5" /> إخفاء وجه السؤال
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* Input and Actions form or Listening Choices */}
                  {method === "listen" ? (
                    <div className="w-full flex flex-col gap-4">
                      {/* 4 grid options */}
                      <div className="w-full grid grid-cols-2 gap-3">
                        {listenChoices.map((choice) => {
                          const isSelected = selectedListenCardId === choice.id;
                          const isCorrect = choice.id === currentCard.id;
                          
                          let btnStyle = "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300";
                          
                          if (writeResult !== null) {
                            if (isSelected) {
                              btnStyle = isCorrect
                                ? "border-green-600 bg-green-600 text-white shadow-md scale-95"
                                : "border-red-600 bg-red-600 text-white shadow-md scale-95";
                            } else if (isCorrect) {
                              btnStyle = "border-green-600 bg-green-50 text-green-700 border-dashed animate-pulse ring-2 ring-green-500/30";
                            } else {
                              btnStyle = "opacity-30 border-slate-100 bg-slate-50 text-slate-400";
                            }
                          } else {
                            if (isSelected) {
                              btnStyle = "border-primary bg-primary/10 text-primary";
                            }
                          }
                          
                          return (
                            <button
                              key={choice.id}
                              disabled={writeResult !== null}
                              onClick={() => handleCheckListenChoice(choice)}
                              className={`rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center cursor-pointer min-h-[140px] relative overflow-hidden shadow-sm hover:shadow-md ${
                                listenChoiceType === "image" && choice.frontImage ? "p-0" : "p-4"
                              } ${btnStyle}`}
                            >
                              {listenChoiceType === "image" ? (
                                choice.frontImage ? (
                                  <div className="absolute inset-0 w-full h-full">
                                    <ImageWithSkeleton
                                      src={imageCache[choice.frontImage] || choice.frontImage}
                                      alt="Illustration"
                                      className="w-full h-full object-cover"
                                      style={getSafeImageStyle(choice.frontImagePosition)}
                                      referrerPolicy="no-referrer"
                                      loading="eager"
                                      fetchPriority="low"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="material-symbols-outlined text-2xl text-slate-300">image_not_supported</span>
                                    <span className="text-xs font-bold leading-tight text-slate-500" dir="ltr">{choice.frontText}</span>
                                  </div>
                                )
                              ) : listenChoiceType === "back" ? (
                                <span className="text-sm font-extrabold leading-relaxed text-slate-800" dir="rtl">
                                  {choice.backText}
                                </span>
                              ) : (
                                <span className="text-base font-black leading-relaxed text-slate-800" dir="ltr">
                                  {choice.frontText}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Unified button/feedback container with stable h-[72px] height */}
                      <div className="w-full h-[72px] mt-2">
                        {writeResult === "correct" && autoAdvance ? (
                          <div className="w-full h-full flex items-center justify-center text-green-600 font-bold bg-green-50/50 rounded-xl border border-green-200">
                            <span>إجابة صحيحة! جاري الانتقال تلقائياً... ✨</span>
                          </div>
                        ) : writeResult !== null ? (
                          <button
                            onClick={handleNextCard}
                            className="w-full h-full rounded-xl font-black text-lg bg-primary text-white hover:opacity-90 shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer animate-scaleUp"
                          >
                            <span>التالي</span>
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col gap-3">
                      <div className="relative w-full">
                        <input
                          ref={writeInputRef}
                          type="text"
                          value={writeAnswer}
                          disabled={writeResult === "correct"}
                          onChange={(e) => {
                            setWriteAnswer(e.target.value);
                            if (writeResult === "incorrect") {
                              setWriteResult(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              if (writeResult === "correct") {
                                handleNextCard();
                              } else {
                                handleCheckWrite();
                              }
                            }
                          }}
                          placeholder={
                            writeTestTarget === "front"
                              ? "اكتب الكلمة الألمانية المقابلة..."
                              : "اكتب الترجمة العربية المطلوبة..."
                          }
                          className={`w-full h-[72px] bg-white border-2 rounded-xl text-center font-black text-lg text-on-surface focus:outline-none focus:ring-4 focus:ring-primary/10 shadow-sm transition-all duration-300 px-4 ${
                            writeResult === "correct"
                              ? "border-green-500 bg-green-50/20"
                              : writeResult === "incorrect"
                              ? "border-red-500 bg-red-50/20"
                              : "border-slate-200 hover:border-slate-300 focus:border-primary"
                          }`}
                        />
                      </div>

                      {/* Unified button with stable h-[72px] height and full width, matching Article Review standard */}
                      <div className="w-full">
                        {writeResult !== "correct" ? (
                          <button
                            onClick={handleCheckWrite}
                            disabled={!writeAnswer.trim()}
                            className={`w-full h-[72px] rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              !writeAnswer.trim()
                                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50"
                                : "bg-primary text-white hover:opacity-90 shadow-md"
                            }`}
                          >
                            <span>التحقق</span>
                          </button>
                        ) : !autoAdvance ? (
                          <button
                            onClick={handleNextCard}
                            className="w-full h-[72px] rounded-xl font-black text-lg bg-primary text-white hover:opacity-90 shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer animate-scaleUp"
                          >
                            <span>التالي</span>
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        ) : (
                          <div className="w-full h-[72px] flex items-center justify-center text-green-600 font-bold bg-green-50/50 rounded-xl border border-green-200">
                            <span>إجابة صحيحة! جاري الانتقال تلقائياً... ✨</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. GERMAN ARTICLE MODE (der/die/das check) */}
              {method === "article" && currentCard && (
                <div className="w-full flex flex-col items-center gap-5">
                  {/* Core Card */}
                  <div className="w-full bg-surface-container-lowest rounded-2xl shadow-elevation-3 border border-outline-variant/30 overflow-hidden flex flex-col h-[260px]">
                    <div className="w-full h-3/5 relative bg-surface-container-high border-b border-outline-variant/20 flex items-center justify-center p-2">
                      {/* زر الاستماع الافتراضي للكلمة فقط بدون أداة التعريف */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPronunciation(currentCard.frontText, currentCard.frontLang || "de", true);
                        }}
                        className="absolute top-3 left-3 p-2.5 rounded-full bg-white/95 text-slate-700 hover:bg-primary hover:text-white transition-all shadow-sm cursor-pointer z-10 border border-slate-100"
                        title="استمع لنطق الكلمة فقط بدون أداة التعريف"
                      >
                        <Volume2 className="w-4.5 h-4.5" />
                      </button>

                      {currentCard.frontImage ? (
                        <div className="h-full aspect-square relative rounded-lg overflow-hidden border border-outline-variant/10">
                          <ImageWithSkeleton
                            src={currentCard.frontImage}
                            alt="Word illustration"
                            className="absolute inset-0 w-full h-full object-cover"
                            style={getSafeImageStyle(currentCard.frontImagePosition)}
                            referrerPolicy="no-referrer"
                            loading="eager"
                            fetchPriority="high"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-primary text-xs font-bold bg-primary/5">
                          تعلم قواعد اللغة الألمانية
                        </div>
                      )}
                    </div>
 
                     <div className="flex-1 p-4 flex flex-col items-center justify-center text-center">
                       {/* خط لونه أبيض غير ظاهر لا يحتوي على كلام ولكن يظهر بلون أداة التعريف الصحيحة عند الإجابة الخاطئة بالتزامن مع النطق */}
                       <div 
                         className={`w-24 h-1.5 rounded-full transition-all duration-500 mb-2.5 mx-auto ${
                           articleResult === "incorrect" && isPronouncingCorrect
                             ? currentCard.correctArticle === "der"
                               ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)] scale-110 animate-pulse"
                               : currentCard.correctArticle === "die"
                               ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] scale-110 animate-pulse"
                               : currentCard.correctArticle === "das"
                               ? "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)] scale-110 animate-pulse"
                               : "bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.8)] scale-110 animate-pulse"
                             : "bg-white"
                         }`}
                       />
                       <h2 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight" dir="ltr">{currentCard.frontText}</h2>
                     </div>
                   </div>
 
                   {/* Tactile interactive article choices */}
                   <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3">
                     {([
                       { value: "der", label: "der", subLabel: "مذكر (1)", activeCls: "border-blue-500 bg-blue-500 text-white shadow-sm", normalCls: "border-blue-100 bg-blue-50/40 text-blue-700 hover:bg-blue-50 hover:border-blue-300" },
                       { value: "die", label: "die", subLabel: "مؤنث (2)", activeCls: "border-rose-500 bg-rose-500 text-white shadow-sm", normalCls: "border-rose-100 bg-rose-50/40 text-rose-700 hover:bg-rose-50 hover:border-rose-300" },
                       { value: "das", label: "das", subLabel: "محايد (3)", activeCls: "border-emerald-500 bg-emerald-500 text-white shadow-sm", normalCls: "border-emerald-100 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300" },
                       { value: "die-plural", label: "die (جمع)", subLabel: "جمع (4)", activeCls: "border-amber-500 bg-amber-500 text-white shadow-sm", normalCls: "border-amber-100 bg-amber-50/40 text-amber-700 hover:bg-amber-50 hover:border-amber-300" }
                     ] as const).map((opt) => {
                       const art = opt.value;
                       const isSelected = selectedArticle === art;
                       const isCorrect = currentCard.correctArticle === art;
                       let btnStyle: string = opt.normalCls;
                       
                       if (articleResult !== null) {
                         if (isSelected) {
                           btnStyle = isCorrect
                             ? "border-green-600 bg-green-600 text-white shadow-md scale-95"
                             : "border-red-600 bg-red-600 text-white shadow-md scale-95";
                         } else if (isCorrect) {
                           btnStyle = "border-green-600 bg-green-50 text-green-700 border-dashed animate-pulse";
                         } else {
                           btnStyle = "opacity-30 border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant";
                         }
                       } else {
                         if (isSelected) {
                           btnStyle = opt.activeCls;
                         }
                       }
 
                       // Apply extra premium glow highlight while pronouncing the correct article!
                       if (isPronouncingCorrect && isCorrect) {
                         btnStyle = "border-emerald-500 bg-emerald-50 text-emerald-800 ring-4 ring-emerald-400 ring-offset-2 scale-105 shadow-xl animate-pulse z-10 transition-all duration-300";
                       }
 
                       return (
                         <button
                          key={art}
                          onClick={() => handleCheckArticle(art)}
                          disabled={articleResult !== null}
                          className={`h-[72px] rounded-xl border-2 text-base font-black transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${btnStyle}`}
                        >
                          <span className="text-lg font-black">{opt.label}</span>
                          <span className="text-[10px] opacity-80 font-bold">{opt.subLabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions under selection */}
                  <div className="flex justify-center w-full items-center px-1">
                    <button
                      onClick={() => alert(`تلميح: هذه الكلمة تعني "${currentCard.translationHint || currentCard.backText}" ولها جنس نحوي محدد بالألمانية.`)}
                      className="hidden"
                    >
                      <HelpCircle className="w-4 h-4" /> تلميح
                    </button>

                    {!autoAdvance && (
                      <button
                        onClick={handleNextCard}
                        className={`w-full h-[72px] rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          articleResult === null
                            ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50"
                            : "bg-primary text-white hover:opacity-90 shadow-md"
                        }`}
                        disabled={articleResult === null}
                      >
                        <span>التالي</span>
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {/* Result alerts */}
                  {false && articleResult === "correct" && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-xs font-bold text-center w-full flex items-center justify-center gap-2 shadow-sm animate-scaleUp">
                      <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                      أحسنت! إجابة صحيحة: <span className="font-extrabold" dir="ltr">{currentCard.correctArticle === "die-plural" ? "die" : currentCard.correctArticle} {currentCard.frontText}</span>
                    </div>
                  )}
                  {false && articleResult === "incorrect" && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-bold text-center w-full flex items-center justify-center gap-2 shadow-sm animate-scaleUp">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                      أداة التعريف الصحيحة هي: <span className="font-extrabold" dir="ltr">{currentCard.correctArticle === "die-plural" ? "die" : currentCard.correctArticle}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 4. MATCHING GAME MODE (تحدي الربط التفاعلي) */}
              {method === "match" && (
                <div className="w-full max-w-2xl flex flex-col gap-5">
                  {/* Game grid board */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/30 min-h-[220px]">
                    {matchingCards.map((item) => {
                      const isMatched = matchedIds.includes(item.id);
                      const isError = errorIds.includes(item.id);
                      const isSelected = selectedMatch?.id === item.id;

                      let cardStyle = "bg-surface-container-lowest border-transparent shadow-elevation-1 hover:shadow-md hover:-translate-y-0.5";
                      if (isMatched) {
                        cardStyle = "opacity-0 scale-90 pointer-events-none transition-all duration-700";
                      } else if (isError) {
                        cardStyle = "border-red-500 bg-red-100 text-red-700 animate-shake";
                      } else if (isSelected) {
                        cardStyle = "border-primary bg-primary/10 text-primary scale-[0.98] ring-2 ring-primary/20";
                      }

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleMatchClick(item)}
                          className={`h-24 rounded-xl border-2 p-3.5 flex items-center justify-center cursor-pointer text-center select-none font-bold text-xs sm:text-sm transition-all duration-300 ${cardStyle}`}
                        >
                          <span dir={item.type === "def" && item.lang === "en" ? "ltr" : "rtl"}>
                            {item.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Complete state check */}
                  {matchedIds.length === matchingCards.length && matchingCards.length > 0 && (
                    <div className="p-6 bg-green-50/80 border border-green-200 rounded-2xl flex flex-col items-center justify-center text-center gap-3 animate-scaleUp">
                      <Award className="w-12 h-12 text-green-600 animate-bounce" />
                      <div>
                        <h2 className="text-base font-extrabold text-green-800">عمل رائع! تم إنجاز التوصيل</h2>
                        <p className="text-xs font-semibold text-green-700 mt-1">
                          لقد قمت بربط جميع المصطلحات بنجاح في غضون <span className="font-mono font-bold text-sm bg-green-100 px-2 py-0.5 rounded text-green-800">{time} ثانية!</span>
                        </p>
                      </div>
                      <button
                        onClick={resetMatchingGame}
                        className="px-5 py-2 rounded-full bg-green-600 text-white font-bold text-xs hover:bg-green-700 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" /> لعب مجدداً مع مجموعة أخرى
                      </button>
                    </div>
                  )}

                  {/* Manual trigger retry */}
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={resetMatchingGame}
                      className="px-5 py-2.5 rounded-full border border-primary/20 text-primary font-bold text-[11px] bg-surface-container-lowest hover:bg-primary/5 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> إعادة خلط وتوزيع البطاقات
                    </button>
                  </div>
                </div>
              )}

              {/* 5. CHALLENGE MODE (وضع التحدي) */}
              {method === "challenge" && currentCard && (() => {
                const isTargetFront = challengeTarget === "front";
                const isTargetBack = challengeTarget === "back";
                const isTargetPlural = challengeTarget === "plural";

                // Question details based on challengeQuestionSource state:
                const questionText = challengeQuestionSource === "front" 
                  ? currentCard.frontText 
                  : challengeQuestionSource === "back" 
                    ? currentCard.backText 
                    : (currentCard.pluralText || "");
                    
                const questionLang = challengeQuestionSource === "front" 
                  ? (currentCard.frontLang || "de") 
                  : challengeQuestionSource === "back" 
                    ? (currentCard.backLang || "ar") 
                    : (currentCard.pluralLang || "de");

                const imageSrc = challengeAlwaysShowFrontImage
                  ? currentCard.frontImage
                  : (challengeQuestionSource === "front" 
                    ? currentCard.frontImage 
                    : challengeQuestionSource === "back" 
                      ? currentCard.backImage 
                      : currentCard.frontImage); // default to front image for plural

                const hasImage = !!imageSrc;
                const imagePos = challengeAlwaysShowFrontImage
                  ? currentCard.frontImagePosition
                  : (challengeQuestionSource === "front" 
                    ? currentCard.frontImagePosition 
                    : challengeQuestionSource === "back" 
                      ? currentCard.backImagePosition 
                      : currentCard.frontImagePosition);

                const questionLabel = challengeQuestionSource === "front"
                  ? "الوجه الأمامي"
                  : challengeQuestionSource === "back"
                    ? "الوجه الخلفي (المعنى)"
                    : "صيغة الجمع 👥";

                return (
                  <div className="w-full flex flex-col items-center gap-5">
                    
                    {/* Main Card with beautiful countdown or revealed result - Styled EXACTLY like StudyCard */}
                    <div className="relative w-full max-w-[356px] min-h-[466px] bg-surface-container-lowest rounded-[24px] border border-outline-variant/40 shadow-elevation-3 p-5 flex flex-col justify-between select-none mb-4 overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/2.5 rounded-full blur-2xl pointer-events-none" />

                      {/* If ready to start, show a blurred overlay over the whole card with a green start button */}
                      {currentIndex === 0 && !challengeActive && !challengeRevealed && (
                        <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[8px] z-20 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                          {/* A subtle glowing circle behind the button */}
                          <div className="absolute w-36 h-36 rounded-full bg-emerald-500/20 blur-xl pointer-events-none" />
                          
                          <div className="relative flex flex-col items-center gap-4">
                            {/* Swords / Challenge Icon */}
                            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                              <span className="material-symbols-outlined text-4xl animate-pulse">swords</span>
                            </div>
                            
                            <div>
                              <h4 className="text-white text-base font-extrabold font-sans">تحدي الذاكرة السريع</h4>
                              <p className="text-white/70 text-[11px] font-sans mt-1 max-w-[200px] leading-relaxed">
                                تذكر الإجابة والنطق الصحيح قبل نفاد الوقت!
                              </p>
                            </div>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startChallengeTimer(currentCard);
                              }}
                              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 cursor-pointer transition-all flex items-center gap-2 font-sans active:scale-95 border border-emerald-400/20 hover:scale-105"
                            >
                              <Play className="w-4 h-4 fill-current" /> ابدأ التحدي الآن
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TOP HALF - THE QUESTION (Styled precisely like StudyCard front face) */}
                      <div className="flex flex-col flex-1 justify-start relative">

                        {/* Image section */}
                        <div className="w-full aspect-square rounded-xl overflow-hidden relative mb-4 border border-outline-variant/10 flex items-center justify-center bg-surface-container-low">
                          {hasImage ? (
                            <ImageWithSkeleton
                              src={imageSrc!}
                              alt="challenge question illustration"
                              className="absolute inset-0 w-full h-full object-cover"
                              style={getSafeImageStyle(imagePos)}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="text-primary/70 font-bold text-xs flex flex-col items-center gap-2">
                              <span className="material-symbols-outlined text-4xl">psychology</span>
                              <span className="font-sans">سؤال التحدي</span>
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playPronunciation(questionText, questionLang, true);
                            }}
                            className="absolute top-3 left-3 p-2.5 rounded-full bg-white/90 backdrop-blur-sm text-primary hover:bg-primary hover:text-white transition-all shadow-sm cursor-pointer z-10"
                            title="استمع لسؤال التحدي"
                          >
                            <Volume2 className="w-4.5 h-4.5" />
                          </button>
                        </div>

                        {/* Question text */}
                        <div className="text-center pb-2">
                          <span className="text-[10px] font-bold text-primary bg-primary/5 px-2.5 py-1 rounded-full font-sans inline-block mb-2">
                            {questionLabel}
                          </span>
                          
                          {challengeHideQuestionFace && !challengeQuestionRevealed ? (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                setChallengeQuestionRevealed(true);
                              }}
                              className="mx-auto max-w-[280px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-xl border border-dashed border-slate-300 transition-all cursor-pointer flex items-center justify-center gap-1.5 font-semibold text-xs font-sans active:scale-98 shadow-sm group"
                            >
                              <EyeOff className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                              <span>انقر هنا لإظهار نص السؤال</span>
                            </div>
                          ) : (
                            <h3 className="text-2xl sm:text-3xl font-extrabold text-on-surface break-words whitespace-pre-wrap leading-snug px-2 flex flex-row items-center justify-center gap-2.5" dir={challengeQuestionSource === "back" ? "rtl" : "ltr"}>
                              {challengeQuestionSource === "front" && currentCard.correctArticle && (
                                <span className={`text-xs px-2.5 py-1 rounded-lg font-black shrink-0 ${
                                  currentCard.correctArticle === "der" ? "bg-blue-600 text-white shadow-sm" :
                                  currentCard.correctArticle === "die" ? "bg-rose-600 text-white shadow-sm" :
                                  currentCard.correctArticle === "das" ? "bg-emerald-600 text-white shadow-sm" :
                                  currentCard.correctArticle === "die-plural" ? "bg-amber-500 text-white shadow-sm" :
                                  "bg-primary text-white"
                                }`}>
                                  {currentCard.correctArticle === "die-plural" ? "die" : currentCard.correctArticle}
                                </span>
                              )}
                              <span className="whitespace-pre-wrap">{questionText}</span>
                            </h3>
                          )}
                        </div>
                      </div>

                      {/* BOTTOM HALF - INTERACTIVE (TIMER / REVEAL / ACTIONS) */}
                      <div className="flex flex-col justify-end border-t border-dashed border-outline-variant/30 pt-4 mt-2">
                        {challengeActive ? (
                          /* COUNTDOWN TICKING */
                          <div className="flex flex-col items-center gap-3 animate-fadeIn">
                            {/* Pulsing countdown circle */}
                            <div className="relative w-20 h-20 flex items-center justify-center rounded-full border-4 border-primary/20 bg-primary/2.5 animate-pulse">
                              <span className="text-3xl font-extrabold text-primary select-none font-mono tracking-tight">
                                {challengeTimeLeft}
                              </span>
                              <div className="absolute inset-[-4px] rounded-full border-4 border-transparent border-t-primary animate-spin" style={{ animationDuration: '1s' }} />
                            </div>
                            
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 font-sans">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                                جاري التحدي... استعد للنطق!
                              </span>
                              <button
                                onClick={() => {
                                  if (challengeIntervalRef.current) clearInterval(challengeIntervalRef.current);
                                  setChallengeActive(false);
                                  setChallengeRevealed(true);
                                  
                                  // Speak the selected target value
                                  let textToSpeak = "";
                                  let langToSpeak = "de";
                                  const actualTarget = challengeTarget;
                                  
                                  if (actualTarget === "front") {
                                    textToSpeak = currentCard.frontText;
                                    langToSpeak = currentCard.frontLang || "de";
                                  } else if (actualTarget === "back") {
                                    textToSpeak = currentCard.backText;
                                    langToSpeak = currentCard.backLang || "de";
                                  } else if (actualTarget === "plural") {
                                    textToSpeak = currentCard.pluralText || "";
                                    langToSpeak = currentCard.pluralLang || "de";
                                  }
                                  if (textToSpeak) {
                                    playPronunciation(textToSpeak, langToSpeak, true);
                                  }
                                }}
                                className="text-[10px] font-bold text-primary hover:underline mt-1 cursor-pointer font-sans"
                              >
                                الكشف الآن (تخطي المؤقت)
                              </button>
                            </div>
                          </div>
                        ) : challengeRevealed ? (
                          /* REVEALED ANSWER SCREEN */
                          <div className="w-full flex flex-col items-center gap-3 text-center animate-scaleUp">
                            <div className="flex flex-row items-center justify-center gap-2 mt-2">
                              {/* The Revealed Value */}
                              <h2 className="text-2xl font-extrabold text-on-surface break-all" dir={isTargetBack ? "rtl" : "ltr"}>
                                {(isTargetPlural && currentCard.isPluralMode && currentCard.pluralText)
                                  ? currentCard.pluralText
                                  : (isTargetFront ? currentCard.frontText : currentCard.backText)}
                              </h2>

                              <button
                                onClick={() => {
                                  let textToSpeak = "";
                                  let langToSpeak = "de";
                                  const actualTarget = challengeTarget;
                                  if (actualTarget === "front") {
                                    textToSpeak = currentCard.frontText;
                                    langToSpeak = currentCard.frontLang || "de";
                                  } else if (actualTarget === "back") {
                                    textToSpeak = currentCard.backText;
                                    langToSpeak = currentCard.backLang || "de";
                                  } else if (actualTarget === "plural") {
                                    textToSpeak = currentCard.pluralText || "";
                                    langToSpeak = currentCard.pluralLang || "de";
                                  }
                                  if (textToSpeak) {
                                    playPronunciation(textToSpeak, langToSpeak, true);
                                  }
                                }}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-primary rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0"
                                title="إعادة النطق"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* ACTION BUTTONS: KNEW IT / DIDN'T KNOW IT */}
                            <div className="grid grid-cols-2 gap-3 w-full mt-3 pt-3 border-t border-slate-100">
                              <button
                                onClick={() => handleClassicKnow(false)}
                                className="flex items-center justify-center gap-1.5 py-3 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl transition-all cursor-pointer group active:scale-95"
                              >
                                <ThumbsDown className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
                                <span className="text-[11px] font-bold font-sans">لم أعرفها</span>
                              </button>
                              <button
                                onClick={() => handleClassicKnow(true)}
                                className="flex items-center justify-center gap-1.5 py-3 px-4 bg-primary text-white rounded-xl transition-all cursor-pointer group active:scale-95 shadow-md hover:opacity-95"
                              >
                                <ThumbsUp className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
                                <span className="text-[11px] font-bold font-sans">عرفتها</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* PAUSED / READY TO START */
                          <div className="flex flex-col items-center gap-3 animate-fadeIn py-2">
                            <span className="text-xs font-bold text-slate-400 font-sans">التحدي جاهز للبدء</span>
                            <button
                              onClick={() => startChallengeTimer(currentCard)}
                              className="px-6 py-2.5 bg-[#0056f6] hover:bg-[#004bd7] text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors flex items-center gap-1.5 font-sans active:scale-95"
                            >
                              <Play className="w-4 h-4 fill-current" /> ابدأ مؤقت التحدي الآن
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Carousel manual paginations */}
                    <div className="w-full max-w-[356px] flex items-center gap-3 mt-1">
                      <button
                        onClick={handlePrevCard}
                        disabled={currentIndex === 0}
                        className="flex-1 h-13 sm:h-14 bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 rounded-2xl text-xs sm:text-sm font-bold text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-xs font-sans"
                      >
                        <ArrowRight className="w-4 h-4 shrink-0" />
                        <span>السابق</span>
                      </button>
                      <button
                        onClick={handleNextCard}
                        className="flex-1 h-13 sm:h-14 bg-primary text-white border border-primary/20 rounded-2xl text-xs sm:text-sm font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none font-sans"
                      >
                        <span>التالي</span>
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                      </button>
                    </div>
                  </div>
                );
              })()}

            </motion.div>
          )}

        </AnimatePresence>

      </div>

      {/* Settings Modal Overlay */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999]" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-scaleUp">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-sm text-slate-800">إعدادات التقليب والاستماع التلقائي</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Horizontal Scrollable Mode Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto scrollbar-none scroll-smooth">
              {[
                ...(method === "classic" ? [
                  { id: "classic", label: "التقليدي 🃏" },
                  { id: "puzzles", label: "الألغاز 🧩" }
                ] : []),
                ...(method === "challenge" ? [{ id: "challenge", label: "التحدي ⏱️" }] : []),
                ...(method === "write" ? [{ id: "write", label: "الكتابة ✍️" }] : []),
                ...(method === "listen" ? [{ id: "listen", label: "الاستماع 🎧" }] : []),
                ...(method === "article" ? [{ id: "article", label: "الأداة 🇩🇪" }] : []),
                ...(method === "match" ? [{ id: "match", label: "التوصيل 🔗" }] : []),
                { id: "sound", label: "الصوت والأداء ⚙️" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSettingsTab(tab.id as any)}
                  className={`px-4 py-2.5 text-[11px] font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                    activeSettingsTab === tab.id
                      ? "border-primary text-primary bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-600 max-h-[60vh]">

              {/* Tab 2: Classic Settings */}
              {activeSettingsTab === "classic" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">إعدادات وضع البطاقات التقليدي</span>
                  </div>

                  {renderVoiceTargetSelector("وضع البطاقات التقليدي")}

                  {/* default card start face */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">الوجه الافتراضي لبداية البطاقة:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setManualStartFace("front");
                          if (!isAutoPlaying) setFlipped(false);
                        }}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          manualStartFace === "front"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الأمامي 🇩🇪
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setManualStartFace("back");
                          if (!isAutoPlaying) setFlipped(true);
                        }}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          manualStartFace === "back"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الخلفي 🇸🇦
                      </button>
                    </div>
                  </div>

                  {/* automatic manual sound */}
                  <div className="flex flex-col gap-3 pt-1">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">نطق الأمامي تلقائياً عند عرض الوجه</span>
                      <button
                        type="button"
                        onClick={() => setManualListenFront(!manualListenFront)}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${manualListenFront ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${manualListenFront ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">نطق الخلفي تلقائياً عند الكشف</span>
                      <button
                        type="button"
                        onClick={() => setManualListenBack(!manualListenBack)}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${manualListenBack ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${manualListenBack ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>

                  {/* swipe to change image toggle */}
                  <div className="flex flex-col gap-2 pt-1 border-b border-slate-50 pb-2">
                    <div className="flex items-center justify-between py-1.5">
                      <div className="flex flex-col gap-0.5 text-right pl-2">
                        <span className="text-xs font-bold text-slate-700">تفعيل تمرير الصور الإضافية للكلمة 🖼️</span>
                        <span className="text-[10px] text-slate-400 leading-normal">مرر لليمين واليسار على صورة البطاقة لعرض صور توضيحية من DuckDuckGo لتشرب معنى الكلمة أكثر.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSwipeImageEnabled(!isSwipeImageEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${isSwipeImageEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${isSwipeImageEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {isSwipeImageEnabled && (
                      <div className="flex flex-col gap-1.5 pt-1 px-1">
                        <div className="flex items-center justify-between text-right">
                          <span className="text-xs font-bold text-slate-600">حساسية التمرير للصور ⚡</span>
                          <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-bold">
                            {swipeSensitivity <= 15 ? 'عالية جداً (١٥ بكسل)' :
                             swipeSensitivity <= 30 ? 'عالية (٣٠ بكسل)' :
                             swipeSensitivity <= 45 ? 'متوسطة (٤٥ بكسل)' :
                             swipeSensitivity <= 65 ? 'منخفضة (٦٠ بكسل)' : 'منخفضة جداً'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="10"
                            max="80"
                            step="5"
                            value={swipeSensitivity}
                            onChange={(e) => setSwipeSensitivity(parseInt(e.target.value, 10))}
                            className="w-full accent-emerald-500 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 leading-relaxed">
                          * القيمة الأقل تعني حساسية أعلى وسحب أقصر، والقيمة الأعلى تتطلب حركة سحب أطول لتغيير الصورة.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 border-b border-slate-100 pt-2 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">التشغيل التلقائي المستمر (Autoplay)</span>
                  </div>

                  {/* Auto flip mode */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">الأوجه المعروضة:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAutoFlipMode("front_only");
                          setAutoListenFront(true);
                          setAutoListenBack(false);
                          if (isAutoPlaying) setFlipped(false);
                        }}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          autoFlipMode === "front_only"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        أمامي فقط 🇩🇪
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAutoFlipMode("back_only");
                          setAutoListenFront(false);
                          setAutoListenBack(true);
                          if (isAutoPlaying) setFlipped(true);
                        }}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          autoFlipMode === "back_only"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        خلفي فقط 🇸🇦
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAutoFlipMode("default");
                          if (isAutoPlaying) setFlipped(false);
                        }}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          autoFlipMode === "default"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الوجهين معاً
                      </button>
                    </div>
                  </div>

                  {/* Auto advance type */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">نوع تقدم الصفحات:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => setAutoFlipTrigger("seconds")}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          autoFlipTrigger === "seconds"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        مؤقت زمني ⏱️
                      </button>
                      <button
                        type="button"
                        onClick={() => setAutoFlipTrigger("tts_end")}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          autoFlipTrigger === "tts_end"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        انتهاء نطق الكلمة 🗣️
                      </button>
                    </div>
                  </div>

                  {/* Auto flip seconds slider */}
                  {autoFlipTrigger === "seconds" && (
                    <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                        <span>فترة الوقوف على كل وجه:</span>
                        <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md">{autoFlipSeconds} ثانية</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="15"
                        value={autoFlipSeconds}
                        onChange={(e) => setAutoFlipSeconds(parseInt(e.target.value, 10))}
                        className="w-full accent-primary cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Autoplay toggles */}
                  <div className="flex flex-col gap-3 pt-1">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">نطق الأمامي تلقائياً في التشغيل المستمر</span>
                      <button
                        type="button"
                        onClick={() => setAutoListenFront(!autoListenFront)}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${autoListenFront ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${autoListenFront ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-xs font-bold text-slate-700">نطق الخلفي تلقائياً في التشغيل المستمر</span>
                      <button
                        type="button"
                        onClick={() => setAutoListenBack(!autoListenBack)}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${autoListenBack ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${autoListenBack ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-1 pt-2 border-t border-slate-100">
                      <div className="flex flex-col text-right">
                        <span className="text-xs font-bold text-slate-700">تكرار نطق الكلمة مرتين 🔁</span>
                        <span className="text-[10px] text-slate-400">سماع النطق مرتين بينهما ثانية سكوت (يدوي وتلقائي)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsRepeatAudioEnabled(!isRepeatAudioEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${isRepeatAudioEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${isRepeatAudioEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Challenge Settings */}
              {activeSettingsTab === "challenge" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">إعدادات وضع التحدي التفاعلي</span>
                  </div>

                  {renderVoiceTargetSelector("وضع التحدي التفاعلي")}

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق السؤال عند عرض البطاقة</span>
                      <span className="text-[10px] text-slate-400">تسهيل الحفظ بالاستماع الفوري</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChallengeSpeakQuestionStart(!challengeSpeakQuestionStart)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${challengeSpeakQuestionStart ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${challengeSpeakQuestionStart ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق الإجابة تلقائياً بعد انتهاء الوقت</span>
                      <span className="text-[10px] text-slate-400">سماع الكلمة الصحيحة بعد نهاية التحدي</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChallengeAutoSpeakResult(!challengeAutoSpeakResult)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${challengeAutoSpeakResult ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${challengeAutoSpeakResult ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">عرض صورة الوجه الأمامي دائماً</span>
                      <span className="text-[10px] text-slate-400">إظهار صورة الوجه الأمامي بدلاً من صورة الوجه المعاكس</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChallengeAlwaysShowFrontImage(!challengeAlwaysShowFrontImage)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${challengeAlwaysShowFrontImage ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${challengeAlwaysShowFrontImage ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">إخفاء واجهة السؤال</span>
                      <span className="text-[10px] text-slate-400">إخفاء نص وصورة السؤال حتى تقوم بالنقر عليها لإظهارها</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChallengeHideQuestionFace(!challengeHideQuestionFace)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${challengeHideQuestionFace ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${challengeHideQuestionFace ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">مدة العد التنازلي للتحدي:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-4 gap-1">
                      {[2, 3, 5, 10].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setChallengeSeconds(sec)}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            challengeSeconds === sec
                              ? "bg-white text-slate-800 shadow-sm"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {sec}ث
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">وجه التحدي المستهدف:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => setChallengeTarget("front")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          challengeTarget === "front"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        ألماني 🇩🇪
                      </button>
                      <button
                        type="button"
                        onClick={() => setChallengeTarget("back")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          challengeTarget === "back"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        عربي 🇸🇦
                      </button>
                      <button
                        type="button"
                        onClick={() => setChallengeTarget("plural")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          challengeTarget === "plural"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الجمع 👥
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-xs font-bold text-slate-500">نص السؤال المعروض:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => setChallengeQuestionSource("front")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          challengeQuestionSource === "front"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الوجه الأمامي 🇩🇪
                      </button>
                      <button
                        type="button"
                        onClick={() => setChallengeQuestionSource("back")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          challengeQuestionSource === "back"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الوجه الخلفي 🇸🇦
                      </button>
                      <button
                        type="button"
                        onClick={() => setChallengeQuestionSource("plural")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          challengeQuestionSource === "plural"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الجمع 👥
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Writing Settings */}
              {activeSettingsTab === "write" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">إعدادات مراجعة الكتابة والاملاء</span>
                  </div>

                  {renderVoiceTargetSelector("وضع الكتابة والإملاء")}

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق السؤال تلقائياً</span>
                      <span className="text-[10px] text-slate-400">عند ظهور بطاقة الكتابة الجديدة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWriteAutoListenQuestion(!writeAutoListenQuestion)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${writeAutoListenQuestion ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${writeAutoListenQuestion ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق الإجابة عند نجاح التحقق</span>
                      <span className="text-[10px] text-slate-400">سماع اللفظ الصحيح للإجابة تلقائياً</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWriteAutoListenSuccess(!writeAutoListenSuccess)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${writeAutoListenSuccess ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${writeAutoListenSuccess ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Switch 1: Show Prompt Text */}
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">عرض وجه السؤال</span>
                      <span className="text-[10px] text-slate-400">إظهار أو إخفاء نص السؤال المساعد</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHidePromptText(!hidePromptText)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${!hidePromptText ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${!hidePromptText ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Switch 2: Show Image */}
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">عرض الصورة التوضيحية</span>
                      <span className="text-[10px] text-slate-400">إظهار أو إخفاء الصور المساعدة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHideImage(!hideImage)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${!hideImage ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${!hideImage ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Switch 3: Auto Advance */}
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">التقليب التلقائي (Auto)</span>
                      <span className="text-[10px] text-slate-400">المرور للبطاقة التالية تلقائياً بعد التحقق</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoAdvance(prev => {
                          const next = !prev;
                          localStorage.setItem("settings_article_auto_next", String(next));
                          return next;
                        });
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${autoAdvance ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${autoAdvance ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">وجه السؤال المعروض:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setWriteQuestionFace("front");
                          setWriteAnswer("");
                          setWriteResult(null);
                        }}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          writeQuestionFace === "front"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        ألماني 🇩🇪
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWriteQuestionFace("back");
                          setWriteAnswer("");
                          setWriteResult(null);
                        }}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          writeQuestionFace === "back"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        عربي 🇸🇦
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">لغة الإجابة المطلوبة:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setWriteTestTarget("front");
                          setWriteAnswer("");
                          setWriteResult(null);
                        }}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          writeTestTarget === "front"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        ألماني 🇩🇪
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWriteTestTarget("back");
                          setWriteAnswer("");
                          setWriteResult(null);
                        }}
                        className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          writeTestTarget === "back"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        عربي 🇸🇦
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: Listening Settings */}
              {activeSettingsTab === "listen" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">إعدادات وضع مراجعة الاستماع</span>
                  </div>

                  {renderVoiceTargetSelector("وضع مراجعة الاستماع")}

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق الملف الصوتي تلقائياً</span>
                      <span className="text-[10px] text-slate-400">سماع الكلمة فور الانتقال للبطاقة الجديدة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setListenAutoListenPrompt(!listenAutoListenPrompt)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${listenAutoListenPrompt ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${listenAutoListenPrompt ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">إعادة نطق الإجابة عند النجاح</span>
                      <span className="text-[10px] text-slate-400">سماع الكلمة الصحيحة مرة أخرى عند اختيارها</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setListenAutoListenSuccess(!listenAutoListenSuccess)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${listenAutoListenSuccess ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${listenAutoListenSuccess ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Switch: Auto Advance */}
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">التقليب التلقائي (Auto)</span>
                      <span className="text-[10px] text-slate-400">المرور للبطاقة التالية تلقائياً بعد السماع والاختيار</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoAdvance(prev => {
                          const next = !prev;
                          localStorage.setItem("settings_article_auto_next", String(next));
                          return next;
                        });
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${autoAdvance ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${autoAdvance ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-slate-500">نوع الخيارات المعروضة للمطابقة:</span>
                    <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => setListenChoiceType("image")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          listenChoiceType === "image"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الصور 🖼️
                      </button>
                      <button
                        type="button"
                        onClick={() => setListenChoiceType("front")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          listenChoiceType === "front"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الأمامي 🇩🇪
                      </button>
                      <button
                        type="button"
                        onClick={() => setListenChoiceType("back")}
                        className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          listenChoiceType === "back"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        الخلفي 🇸🇦
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 6: Article Settings */}
              {activeSettingsTab === "article" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">إعدادات وضع أداة التعريف الألمانية</span>
                  </div>

                  {renderVoiceTargetSelector("وضع أداة التعريف الألمانية")}

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق الكلمة تلقائياً بدون أداة</span>
                      <span className="text-[10px] text-slate-400">سماع الاسم مجرداً عند البداية</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setArticleAutoListenQuestion(!articleAutoListenQuestion)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${articleAutoListenQuestion ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${articleAutoListenQuestion ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق الأداة مع الكلمة عند الاختيار الصحيح</span>
                      <span className="text-[10px] text-slate-400">سماع الأداة مدمجة مع الاسم لتثبيت اللفظ</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setArticleAutoListenSuccess(!articleAutoListenSuccess)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${articleAutoListenSuccess ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${articleAutoListenSuccess ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">الانتقال التلقائي للبطاقة التالية</span>
                      <span className="text-[10px] text-slate-400">المرور الفوري بعد اختيار الأداة الصحيحة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !autoAdvance;
                        setAutoAdvance(next);
                        localStorage.setItem("settings_article_auto_next", String(next));
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${autoAdvance ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${autoAdvance ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 7: Match Settings */}
              {activeSettingsTab === "match" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">إعدادات وضع لعبة التوصيل</span>
                  </div>

                  {renderVoiceTargetSelector("وضع لعبة التوصيل")}

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">نطق الكلمة عند النقر عليها للتوصيل</span>
                      <span className="text-[10px] text-slate-400">سماع صوت الكلمة بمجرد اختيار البطاقة المبعثرة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMatchAutoListenSelect(!matchAutoListenSelect)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${matchAutoListenSelect ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${matchAutoListenSelect ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 8: Puzzles Settings */}
              {activeSettingsTab === "puzzles" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">الألغاز (إخفاء العناصر)</span>
                  </div>

                  {renderVoiceTargetSelector("وضع الألغاز")}

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <span className="text-xs font-bold text-slate-700">إخفاء النص الأمامي (ألماني)</span>
                    <button
                      type="button"
                      onClick={() => setHideFront(!hideFront)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${hideFront ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${hideFront ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <span className="text-xs font-bold text-slate-700">إخفاء النص الخلفي (عربي)</span>
                    <button
                      type="button"
                      onClick={() => setHideBack(!hideBack)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${hideBack ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${hideBack ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs font-bold text-slate-700">إخفاء وجه السؤال بالكامل</span>
                    <button
                      type="button"
                      onClick={() => setHidePromptText(!hidePromptText)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${hidePromptText ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${hidePromptText ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 9: Sound Settings */}
              {activeSettingsTab === "sound" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                    <span className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block">إعدادات الصوت وأداء الأجهزة العامة</span>
                  </div>

                  {renderVoiceTargetSelector("جميع أوضاع المراجعة")}

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">تفعيل الصوت العام</span>
                      <span className="text-[10px] text-slate-400">تشغيل أو كتم جميع الأصوات ونطق الكلمات في الموقع</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${isSoundEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${isSoundEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">التلاشي الصوتي الناعم (Fade-Out)</span>
                      <span className="text-[10px] text-slate-400">تلاشي الصوت بلطف عند الانتقال أو قطع الصوت لمنع الأصوات المفاجئة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAudioFadeEnabled(!isAudioFadeEnabled)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${isAudioFadeEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${isAudioFadeEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-xs font-bold text-slate-700">تفعيل الوضع فائق الخفة 🚀</span>
                      <span className="text-[10px] text-slate-400">إلغاء جميع تأثيرات الحركة (Animations) والتقليب لتسريع الأداء للأجهزة الضعيفة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUltraLightMode(!ultraLightMode)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${ultraLightMode ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ${ultraLightMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 gap-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-5 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary-container cursor-pointer transition-all text-xs"
              >
                حفظ وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Images Download & Cache Modal */}
      {isSessionImageModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col dir-rtl">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
                  <DownloadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">تنزيل وتخزين صور المراجعة</h3>
                  <p className="text-[11px] text-slate-500 font-semibold">تخزين كافة صور بطاقات الجلسة مع الصور المقترحة أوفلاين</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isDownloadingSessionImages && (
                  <button
                    type="button"
                    onClick={() => setIsSessionImageModalOpen(false)}
                    title="تصغير النافذة والمتابعة بالخلفية"
                    className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">تصغير</span>
                  </button>
                )}
                <button
                  onClick={() => setIsSessionImageModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title="إغلاق النافذة"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                  <span>بطاقات هذه الجلسة:</span>
                  <span className="font-black text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    {sessionCards.length} بطاقة
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                  <span>إجمالي الصور المتوقع جلبها وتخزينها:</span>
                  <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                    ~{sessionCards.length * 10} صورة أوفلاين
                  </span>
                </div>
              </div>

              {/* Progress UI */}
              {isDownloadingSessionImages ? (
                <div className="space-y-3 bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/80 text-center">
                  <div className="flex justify-between items-center text-xs font-black text-emerald-800">
                    <span>جاري تحميل وتخزين الصور...</span>
                    <span className="font-mono text-emerald-600">
                      {sessionImageProgress.current} / {sessionImageProgress.total}
                    </span>
                  </div>

                  <div className="w-full bg-emerald-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-200"
                      style={{
                        width: sessionImageProgress.total > 0
                          ? `${(sessionImageProgress.current / sessionImageProgress.total) * 100}%`
                          : "0%"
                      }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-600 font-bold truncate">
                    {sessionImageProgress.currentItem}
                  </p>

                  {sessionImageProgress.currentPreview && (
                    <div className="w-20 h-20 mx-auto rounded-xl overflow-hidden border border-emerald-200 shadow-sm relative bg-slate-100">
                      <img
                        src={sessionImageProgress.currentPreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                </div>
              ) : sessionImageSuccess ? (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-1.5">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto animate-bounce" />
                  <h4 className="font-black text-emerald-800 text-sm">تم التخزين بنجاح! 🖼️</h4>
                  <p className="text-xs text-emerald-700 font-bold">
                    تم تنزيل وتخزين كافة صور بطاقات هذه الجلسة وتصبح جميع خيارات تقليب الصور متاحة بدون إنترنت!
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-bold leading-relaxed text-center">
                  سيتم تنزيل الصور الأساسية للبطاقات بالإضافة إلى استخراج أول 10 صور نتائج متطابقة من محرك البحث لكل كلمة وتخزينها في ذاكرة الجهاز المحلية (Cache Storage)، حتى تعمل ميزة تقليب وتصفح الصور بالكامل أوفلاين.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsSessionImageModalOpen(false)}
                className="px-4 py-2 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-100 text-xs transition-all cursor-pointer"
              >
                إغلاق
              </button>
              <button
                onClick={handleStartSessionImageDownload}
                disabled={isDownloadingSessionImages}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isDownloadingSessionImages ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التخزين...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    <span>ابدأ التنزيل والتخزين</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Session Image Download Widget */}
      {!isSessionImageModalOpen && isDownloadingSessionImages && (() => {
        const progressPercent = sessionImageProgress.total > 0
          ? Math.min(100, Math.max(0, Math.round((sessionImageProgress.current / sessionImageProgress.total) * 100)))
          : 0;
        const strokeDashoffset = 138.23 - (138.23 * progressPercent) / 100;

        return (
          <div
            dir="rtl"
            className="fixed bottom-6 left-6 z-[200] animate-bounce-in cursor-pointer group select-none"
            onClick={() => setIsSessionImageModalOpen(true)}
            title="انقر لإعادة فتح نافذة تنزيل صور المراجعة"
          >
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-2 border-emerald-500/40 hover:border-emerald-500 shadow-2xl rounded-2xl p-3 pr-4 flex items-center gap-3.5 transition-all duration-300 hover:scale-105 active:scale-95 group-hover:shadow-emerald-500/25">
              {/* Animated Circular Progress Ring */}
              <div className="relative w-13 h-13 flex items-center justify-center shrink-0">
                <svg className="w-13 h-13 -rotate-90 transform" viewBox="0 0 52 52">
                  <circle
                    cx="26"
                    cy="26"
                    r="22"
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  <circle
                    cx="26"
                    cy="26"
                    r="22"
                    className="text-emerald-500 transition-all duration-300 ease-out"
                    strokeWidth="4.5"
                    strokeDasharray="138.23"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-600 dark:text-emerald-400 font-black text-[11px] leading-none">
                  <ImageIcon className="w-3.5 h-3.5 animate-bounce mb-0.5 text-emerald-500" />
                  <span>{progressPercent}%</span>
                </div>
              </div>

              {/* Details & Reopen Badge */}
              <div className="flex flex-col text-right min-w-[150px] max-w-[220px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    تنزيل صور المراجعة
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0 flex items-center gap-1">
                    <DownloadCloud className="w-3 h-3" />
                    <span>{sessionImageProgress.current}/{sessionImageProgress.total}</span>
                  </span>
                </div>

                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {sessionImageProgress.currentItem || "جاري المعالجة..."}
                </p>

                <div className="flex items-center gap-1 mt-1 text-[10.5px] font-extrabold text-emerald-600 dark:text-emerald-400 group-hover:underline">
                  <Maximize2 className="w-3 h-3 text-emerald-600 group-hover:scale-125 transition-transform" />
                  <span>انقر للرجوع للنافذة ↗</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Repeat Sequence Audio Download & Cache Modal */}
      {isRepeatAudioModalOpen && (() => {
        const speakSteps = repeatSequence.filter((s) => s.type === "speak");
        const totalSpeakItemsCount = sessionCards.length * speakSteps.length;

        const deLang = "de";
        const primaryModelName =
          localStorage.getItem(`settings_primary_piper_model_${deLang}`) ||
          localStorage.getItem("settings_primary_piper_model") ||
          "de_DE-thorsten-medium";
        const secondaryModelName =
          localStorage.getItem(`settings_secondary_piper_model_${deLang}`) ||
          localStorage.getItem("settings_secondary_piper_model") ||
          "google";

        // Calculate counts for each filter tab
        let autoCount = 0;
        let withArticleCount = 0;
        let indefiniteCount = 0;
        let primaryModelCount = 0;
        let secondaryModelCount = 0;

        sessionCards.forEach((card) => {
          speakSteps.forEach((step) => {
            const inc = step.includeArticle || "auto";
            if (inc === "auto") autoCount++;
            if (inc === "with") withArticleCount++;
            if (inc === "indefinite") indefiniteCount++;

            if (step.voice === "secondary") {
              secondaryModelCount++;
            } else {
              primaryModelCount++;
            }
          });
        });

        return (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col dir-rtl max-h-[92vh]">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-indigo-50/60 dark:bg-indigo-950/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      تنزيل وتخزين صوتيات التكرار
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                      تخزين ونطق كافة خطوات التكرار والموديلات أوفلاين بدون إنترنت
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isDownloadingRepeatAudio && (
                    <button
                      type="button"
                      onClick={() => setIsRepeatAudioModalOpen(false)}
                      title="تصغير النافذة والمتابعة بالخلفية"
                      className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/60 hover:bg-indigo-200 text-indigo-800 dark:text-indigo-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">تصغير</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsRepeatAudioModalOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="إغلاق النافذة"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">
                {/* Voice Models & Details Box */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span>بطاقات الجلسة:</span>
                      <span className="font-black text-slate-900 dark:text-white bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
                        {sessionCards.length} بطاقة
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span>خطوات النطق:</span>
                      <span className="font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
                        {speakSteps.length} خطوات
                      </span>
                    </div>
                  </div>

                  {/* Voice Model Names Display */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        صوت الموديل الرئيسي:
                      </span>
                      <span className="font-black text-indigo-700 dark:text-indigo-300 font-mono text-[10.5px] truncate max-w-[180px]">
                        {primaryModelName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        صوت الموديل الثاني:
                      </span>
                      <span className="font-black text-purple-700 dark:text-purple-300 font-mono text-[10.5px] truncate max-w-[180px]">
                        {secondaryModelName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interactive Filter Switcher / Tab Bar (زر متنقل وتصفية) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>اختر نغمة ونوع الصوت المراد تنزيله:</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      (تحديد نوع الصوت المطلوب تنزيله أوفلاين)
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setRepeatAudioTab("all")}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                        repeatAudioTab === "all"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      الكل ({totalSpeakItemsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepeatAudioTab("auto")}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                        repeatAudioTab === "auto"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      تلقائي ({autoCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepeatAudioTab("with_article")}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                        repeatAudioTab === "with_article"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      مع الارتيكل ({withArticleCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepeatAudioTab("indefinite")}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                        repeatAudioTab === "indefinite"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      مع التنكير ({indefiniteCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepeatAudioTab("primary")}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                        repeatAudioTab === "primary"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      الموديل الأول ({primaryModelCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepeatAudioTab("secondary")}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                        repeatAudioTab === "secondary"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      الموديل الثاني ({secondaryModelCount})
                    </button>
                  </div>
                </div>

                {/* Repeat Sequence Breakdown List */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    خطوات خطة التكرار الحالية ({repeatSequence.length} خطوات):
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar p-1">
                    {repeatSequence.map((st, idx) => (
                      <div
                        key={st.id || idx}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                      >
                        <span className="flex items-center gap-1.5 font-black">
                          <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          {st.type === "speak"
                            ? "نطق صوتي"
                            : st.type === "pause"
                            ? "سكوت / صمت"
                            : "نغمة تنبيه"}
                        </span>

                        <div className="flex items-center gap-1.5 text-[11px]">
                          {st.type === "speak" && (
                            <>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 font-semibold">
                                {st.includeArticle === "with"
                                  ? "مع الارتيكل (der/die/das)"
                                  : st.includeArticle === "indefinite"
                                  ? "مع التنكير (ein/eine)"
                                  : st.includeArticle === "without"
                                  ? "مجرد بدون أداة"
                                  : "صوت تلقائي"}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60 font-semibold">
                                {st.voice === "secondary"
                                  ? "الموديل الثاني"
                                  : "الموديل الرئيسي"}
                              </span>
                            </>
                          )}
                          {st.type === "pause" && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-semibold">
                              ⏱️ {st.pauseDuration || 1} ثانية
                            </span>
                          )}
                          {st.type === "note" && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold">
                              🔔 {st.noteType || "start"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Downloading Progress or Success Message */}
                {isDownloadingRepeatAudio ? (
                  <div className="space-y-3 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 text-center">
                    <div className="flex justify-between items-center text-xs font-black text-indigo-800 dark:text-indigo-200">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                        جاري جلب وتخزين الملفات الصوتية أوفلاين...
                      </span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">
                        {repeatAudioProgress.current} / {repeatAudioProgress.total}
                      </span>
                    </div>

                    <div className="w-full bg-indigo-100 dark:bg-indigo-950 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-200"
                        style={{
                          width:
                            repeatAudioProgress.total > 0
                              ? `${(repeatAudioProgress.current / repeatAudioProgress.total) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 text-right text-xs font-bold space-y-1">
                      <p className="text-slate-800 dark:text-slate-100 truncate flex items-center justify-between">
                        <span>النص الصوتي الحالي:</span>
                        <span className="text-indigo-600 dark:text-indigo-300 font-black">
                          "{repeatAudioProgress.currentItem}"
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center justify-between">
                        <span>الخطوة والنمط:</span>
                        <span>{repeatAudioProgress.currentStepName}</span>
                      </p>
                      <p className="text-[11px] text-purple-600 dark:text-purple-300 truncate flex items-center justify-between">
                        <span>الموديل المستخدم:</span>
                        <span>{repeatAudioProgress.currentVoiceName}</span>
                      </p>
                    </div>
                  </div>
                ) : repeatAudioSuccess ? (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-center space-y-1.5">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto animate-bounce" />
                    <h4 className="font-black text-emerald-800 dark:text-emerald-200 text-sm">
                      تم تنزيل وتخزين كافة صويتات التكرار بنجاح! 🎧✨
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold leading-relaxed">
                      جميع الأصوات والموديلات لخطوات التكرار أصبحت محفوظة
                      أوفلاين في ذاكرة الجهاز وتعمل فورياً بدون أي تأخير!
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed text-center bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700">
                    💡 انقر على "ابدأ التنزيل والتخزين" لتأكيد وتوليد كافة الأصوات المحددة في التكرار لكافة بطاقات الجلسة لتعمل أوفلاين بسرعة فائقة!
                  </p>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2">
                <button
                  onClick={() => setIsRepeatAudioModalOpen(false)}
                  className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs transition-all cursor-pointer"
                >
                  إغلاق
                </button>

                <button
                  onClick={handleStartRepeatAudioDownload}
                  disabled={isDownloadingRepeatAudio}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold rounded-xl shadow-md text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isDownloadingRepeatAudio ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري التخزين...</span>
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4" />
                      <span>ابدأ التنزيل والتخزين 📥</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Repeat Audio Download Widget */}
      {!isRepeatAudioModalOpen && isDownloadingRepeatAudio && (() => {
        const progressPercent =
          repeatAudioProgress.total > 0
            ? Math.min(
                100,
                Math.max(
                  0,
                  Math.round(
                    (repeatAudioProgress.current / repeatAudioProgress.total) * 100
                  )
                )
              )
            : 0;
        const strokeDashoffset = 138.23 - (138.23 * progressPercent) / 100;

        return (
          <div
            dir="rtl"
            className="fixed bottom-6 right-6 z-[200] animate-bounce-in cursor-pointer group select-none"
            onClick={() => setIsRepeatAudioModalOpen(true)}
            title="انقر لإعادة فتح نافذة تنزيل صوتيات التكرار"
          >
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-2 border-indigo-500/40 hover:border-indigo-500 shadow-2xl rounded-2xl p-3 pr-4 flex items-center gap-3.5 transition-all duration-300 hover:scale-105 active:scale-95 group-hover:shadow-indigo-500/25">
              {/* Circular Progress Ring */}
              <div className="relative w-13 h-13 flex items-center justify-center shrink-0">
                <svg className="w-13 h-13 -rotate-90 transform" viewBox="0 0 52 52">
                  <circle
                    cx="26"
                    cy="26"
                    r="22"
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  <circle
                    cx="26"
                    cy="26"
                    r="22"
                    className="text-indigo-500 transition-all duration-300 ease-out"
                    strokeWidth="4.5"
                    strokeDasharray="138.23"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-[11px] leading-none">
                  <Volume2 className="w-3.5 h-3.5 animate-bounce mb-0.5 text-indigo-500" />
                  <span>{progressPercent}%</span>
                </div>
              </div>

              {/* Details */}
              <div className="flex flex-col text-right min-w-[150px] max-w-[220px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    تنزيل صوتيات التكرار
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 shrink-0 flex items-center gap-1">
                    <Volume2 className="w-3 h-3" />
                    <span>
                      {repeatAudioProgress.current}/{repeatAudioProgress.total}
                    </span>
                  </span>
                </div>

                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {repeatAudioProgress.currentItem || "جاري التخزين..."}
                </p>

                <div className="flex items-center gap-1 mt-1 text-[10.5px] font-extrabold text-indigo-600 dark:text-indigo-400 group-hover:underline">
                  <Maximize2 className="w-3 h-3 text-indigo-600 group-hover:scale-125 transition-transform" />
                  <span>انقر للرجوع للنافذة ↗</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Repeat Sequence Settings Modal Portal */}
      {createPortal(
        <AnimatePresence>
          {isRepeatModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={`fixed inset-0 backdrop-blur-xs z-[9999] flex items-center justify-center p-3 sm:p-5 select-none overflow-y-auto ${
                isDarkMode ? "bg-slate-950/85 review-night-mode dark" : "bg-slate-900/65"
              }`}
              dir="rtl"
              onClick={(e) => {
                e.stopPropagation();
                setIsRepeatModalOpen(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`w-full max-w-xl rounded-3xl p-5 sm:p-6 flex flex-col gap-4 relative overflow-hidden transition-colors max-h-[92vh] ${
                  isDarkMode
                    ? "bg-slate-900 text-slate-100 border border-slate-800 shadow-2xl"
                    : "bg-white text-slate-800 border border-slate-200/80 shadow-2xl"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/70 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                      <Repeat className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                          إعدادات وتخصيص التكرار الصوتي
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                          {repeatSequence.length} خطوات
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 mt-0.5">
                        تحكم في ترتيب وتسلسل نطق الكلمات، فترات السكوت ونغمات التنبيه
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRepeatModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title="إغلاق"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-y-auto space-y-4 pl-1 pr-1 custom-scrollbar my-0.5">
                  {/* Select Plan Dropdown & Management Bar */}
                  <div className="space-y-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                    {/* Header with Title & Quick Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>خطة التكرار الحالية:</span>
                      </label>

                      <div className="flex items-center gap-1.5">
                        {!isSavingPlanUIOpen ? (
                          <button
                            type="button"
                            onClick={() => setIsSavingPlanUIOpen(true)}
                            disabled={repeatSequence.length === 0}
                            className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 text-[11px] font-black cursor-pointer transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
                            title="حفظ التسلسل الحالي كخطة مخصصة جديدة"
                          >
                            <Save className="w-3 h-3" />
                            <span>حفظ كخطة جديدة</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            setRepeatSequence([]);
                            setSelectedPlanId("custom");
                          }}
                          disabled={repeatSequence.length === 0}
                          className="px-2.5 py-1 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-30 text-[11px] font-black cursor-pointer transition-all flex items-center gap-1 active:scale-95"
                          title="مسح إزالة جميع خطوات الخطة الحالية"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>مسح الخطة</span>
                        </button>
                      </div>
                    </div>

                    {/* Quick Plan Pills Selector */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {activePresetPlans.map((p) => {
                        const isSelected = selectedPlanId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectPlan(p.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-indigo-600 text-white shadow-xs scale-100 ring-2 ring-indigo-400/40"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                            }`}
                          >
                            <span>{p.name}</span>
                          </button>
                        );
                      })}

                      {savedCustomPlans.map((p) => {
                        const isSelected = selectedPlanId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectPlan(p.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-purple-600 text-white shadow-xs scale-100 ring-2 ring-purple-400/40"
                                : "bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                            }`}
                          >
                            <span>⭐ {p.name}</span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setSelectedPlanId("custom")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                          selectedPlanId === "custom"
                            ? "bg-slate-800 dark:bg-slate-700 text-white shadow-xs ring-2 ring-slate-400/40"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                        }`}
                      >
                        <span>⚙️ مخصصة</span>
                      </button>
                    </div>

                    {/* Select Dropdown & Delete Plan Button */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <select
                        value={selectedPlanId}
                        onChange={(e) => handleSelectPlan(e.target.value)}
                        className="flex-1 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer outline-none shadow-2xs"
                      >
                        {activePresetPlans.length > 0 && (
                          <optgroup label="📋 الخطط المسبقة الجاهزة">
                            {activePresetPlans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {savedCustomPlans.length > 0 && (
                          <optgroup label="⭐ الخطط المخصصة المحفوظة">
                            {savedCustomPlans.map((p) => (
                              <option key={p.id} value={p.id}>
                                ⭐ {p.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <option value="custom">⚙️ خطة مخصصة حرة</option>
                      </select>

                      {/* Delete Selected Plan Button (Works for both preset & custom) */}
                      {selectedPlanId !== "custom" && allActivePlans.some((p) => p.id === selectedPlanId) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedPlan(selectedPlanId)}
                          className="px-3 py-2 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-xs font-black cursor-pointer transition-all shrink-0 flex items-center gap-1 active:scale-95"
                          title="حذف هذه الخطة نهائياً من القائمة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف الخطة</span>
                        </button>
                      )}
                    </div>

                    {/* Restore Deleted Default Plans link if any */}
                    {deletedPresetPlanIds.length > 0 && (
                      <div className="pt-0.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setDeletedPresetPlanIds([]);
                            setSelectedPlanId("preset_balanced_2x");
                            const def = PRESET_REPEAT_PLANS[0];
                            if (def) {
                              setRepeatSequence(
                                def.sequence.map((step, idx) => ({
                                  ...step,
                                  id: "step_" + Date.now() + "_" + idx,
                                }))
                              );
                            }
                          }}
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          🔄 استعادة الخطط الافتراضية المحذوفة ({deletedPresetPlanIds.length})
                        </button>
                      </div>
                    )}

                    {/* Inline Save Plan Form */}
                    {isSavingPlanUIOpen && (
                      <div className="pt-2 flex items-center gap-2 animate-fadeIn bg-indigo-50/70 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60">
                        <input
                          type="text"
                          placeholder="أدخل اسم الخطة (مثال: تكرار بطيء)..."
                          value={newPlanName}
                          onChange={(e) => setNewPlanName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleConfirmSavePlan();
                          }}
                          className="flex-1 text-xs font-extrabold px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleConfirmSavePlan}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 cursor-pointer transition-all active:scale-95 shadow-2xs"
                        >
                          حفظ
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSavingPlanUIOpen(false);
                            setNewPlanName("");
                          }}
                          className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sequence Steps Section with Floating Plus Insertions */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between pb-1">
                      <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span>تسلسل خطوات التكرار:</span>
                        <span className="text-[11px] font-bold text-slate-400">({repeatSequence.length} خطوات مرتبة بالتسلسل)</span>
                      </label>
                      <span className="text-[10px] font-bold text-slate-400">
                        اضغط (+) بين الخطوات لإدراج خطوة جديدة
                      </span>
                    </div>

                    {/* Steps Container */}
                    {repeatSequence.length === 0 ? (
                      <div className="p-6 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                        <Repeat className="w-8 h-8 text-slate-400 mx-auto opacity-60" />
                        <p className="text-xs font-black text-slate-600 dark:text-slate-400">
                          لا توجد أي خطوات في الخطة حالياً
                        </p>
                        <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleInsertStepAtPosition("speak", 0)}
                            className="px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>+ نطق صوتي</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleInsertStepAtPosition("pause", 0)}
                            className="px-3.5 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>+ فترة سكوت</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleInsertStepAtPosition("note", 0)}
                            className="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                          >
                            <Music className="w-3.5 h-3.5" />
                            <span>+ نغمة تنبيه</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {/* Initial Insert Slot at Index 0 (Before first step) */}
                        <div className="py-1 flex flex-col items-center justify-center relative">
                          <AnimatePresence mode="wait">
                            {insertingStepAtIndex === 0 ? (
                              <motion.div
                                key="floating_menu_0"
                                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                transition={{ duration: 0.15 }}
                                className={`flex items-center justify-center gap-1.5 p-1.5 rounded-full shadow-2xl backdrop-blur-md z-20 my-1 border ${
                                  isDarkMode
                                    ? "bg-slate-900/95 text-slate-100 border-slate-700/90 shadow-black/60"
                                    : "bg-slate-900/95 text-white border-slate-800 shadow-slate-900/30"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleInsertStepAtPosition("speak", 0)}
                                  className="px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                                  title="إدراج نطق صوتي في البداية"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>نطق صوتي</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleInsertStepAtPosition("pause", 0)}
                                  className="px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                                  title="إدراج فترة سكوت في البداية"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>فترة سكوت</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleInsertStepAtPosition("note", 0)}
                                  className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                                  title="إدراج نغمة تنبيه في البداية"
                                >
                                  <Music className="w-3.5 h-3.5" />
                                  <span>نغمة تنبيه</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setInsertingStepAtIndex(null)}
                                  className="p-1.5 rounded-full hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer transition-colors"
                                  title="إلغاء"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </motion.div>
                            ) : (
                              <div className="w-full flex items-center justify-center relative group/divider py-0.5">
                                <div className="absolute inset-x-8 h-[1px] bg-slate-200/50 dark:bg-slate-800/80 group-hover/divider:bg-indigo-300 dark:group-hover/divider:bg-indigo-800 transition-colors" />
                                <button
                                  type="button"
                                  onClick={() => setInsertingStepAtIndex(0)}
                                  className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs group-hover/divider:scale-110 active:scale-95 ${
                                    isDarkMode
                                      ? "bg-slate-800 text-slate-400 group-hover/divider:bg-indigo-600 group-hover/divider:text-white border border-slate-700"
                                      : "bg-slate-100 text-slate-400 group-hover/divider:bg-indigo-600 group-hover/divider:text-white border border-slate-200"
                                  }`}
                                  title="إضافة خطوة في بداية التسلسل (+)"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </AnimatePresence>
                        </div>

                        {repeatSequence.map((step, idx) => {
                          const isStepActive = activePreviewStepIndex === idx;

                          const moveUp = () => {
                            if (idx === 0) return;
                            const updated = [...repeatSequence];
                            const temp = updated[idx - 1];
                            updated[idx - 1] = updated[idx];
                            updated[idx] = temp;
                            setRepeatSequence(updated);
                          };

                          const moveDown = () => {
                            if (idx === repeatSequence.length - 1) return;
                            const updated = [...repeatSequence];
                            const temp = updated[idx + 1];
                            updated[idx + 1] = updated[idx];
                            updated[idx] = temp;
                            setRepeatSequence(updated);
                          };

                          const removeStep = () => {
                            setRepeatSequence(repeatSequence.filter((_, i) => i !== idx));
                          };

                          return (
                            <React.Fragment key={step.id}>
                              <div
                                className={`p-3.5 rounded-2xl border transition-all shadow-xs flex flex-col gap-2.5 ${
                                  isStepActive
                                    ? "ring-2 ring-emerald-600 dark:ring-emerald-500 shadow-md shadow-emerald-600/25 bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500"
                                    : step.type === "speak"
                                    ? "bg-indigo-50/35 dark:bg-indigo-950/20 border-indigo-200/70 dark:border-indigo-900/60"
                                    : step.type === "pause"
                                    ? "bg-amber-50/35 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900/60"
                                    : "bg-emerald-50/35 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/60"
                                }`}
                              >
                                {/* Step Top Bar: Index Badge + Type Name + Move & Delete Controls */}
                                <div className="flex items-center justify-between pb-1 border-b border-black/5 dark:border-white/5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`w-6 h-6 rounded-xl font-black text-xs flex items-center justify-center shadow-2xs transition-all ${
                                        step.type === "speak"
                                          ? "bg-indigo-600 text-white"
                                          : step.type === "pause"
                                          ? "bg-amber-600 text-white"
                                          : "bg-emerald-600 text-white"
                                      }`}
                                    >
                                      {idx + 1}
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                      {step.type === "speak" && (
                                        <span className="text-xs font-black text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                                          <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                          <span>خطوة نطق صوتي</span>
                                        </span>
                                      )}
                                      {step.type === "pause" && (
                                        <span className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1">
                                          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                          <span>فترة سكوت (صمت)</span>
                                        </span>
                                      )}
                                      {step.type === "note" && (
                                        <span className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                                          <Music className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                          <span>نغمة تنبيه صوتية</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Controls: Reorder & Delete */}
                                  <div className="flex items-center gap-1">
                                    <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-0.5">
                                      <button
                                        type="button"
                                        onClick={moveUp}
                                        disabled={idx === 0}
                                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 cursor-pointer text-slate-600 dark:text-slate-400 transition-colors"
                                        title="تحريك لأعلى"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={moveDown}
                                        disabled={idx === repeatSequence.length - 1}
                                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 cursor-pointer text-slate-600 dark:text-slate-400 transition-colors"
                                        title="تحريك لأسفل"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={removeStep}
                                      className="p-1.5 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors cursor-pointer shrink-0"
                                      title="حذف هذه الخطوة"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* Step Details & Selectors */}
                                <div className="w-full">
                                  {step.type === "speak" && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                                          اختيار صوت النطق:
                                        </label>
                                        <select
                                          value={step.voice || "default"}
                                          onChange={(e) => {
                                            const updated = [...repeatSequence];
                                            updated[idx].voice = e.target.value;
                                            setRepeatSequence(updated);
                                          }}
                                          className="w-full text-xs font-bold px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer outline-none shadow-2xs"
                                        >
                                          <option value="default">🔊 الصوت الافتراضي للنظام</option>
                                          <option value="primary">🎙️ الصوت الرئيسي (Primary)</option>
                                          <option value="secondary">🗣️ الصوت الثانوي (Secondary)</option>
                                          <option value="webspeech">🌐 WebSpeech (المتصفح)</option>
                                        </select>
                                      </div>

                                      <div className="flex flex-col gap-1">
                                        <label className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                                          نمط أداة التعريف:
                                        </label>
                                        <select
                                          value={step.includeArticle || "auto"}
                                          onChange={(e) => {
                                            const updated = [...repeatSequence];
                                            updated[idx].includeArticle = e.target.value as "auto" | "with" | "indefinite" | "without";
                                            setRepeatSequence(updated);
                                          }}
                                          className="w-full text-xs font-bold px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer outline-none shadow-2xs"
                                        >
                                          <option value="auto">💬 النص التلقائي للبطاقة</option>
                                          <option value="with">🔤 مع أداة التعريف (der/die/das)</option>
                                          <option value="indefinite">🎲 مع أداة التنكير (ein/eine)</option>
                                          <option value="without">✂️ بدون أداة التعريف (ohne Artikel)</option>
                                        </select>
                                      </div>
                                    </div>
                                  )}

                                  {step.type === "pause" && (
                                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
                                      {/* Custom Exact Pause Duration Input */}
                                      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 rounded-xl px-2.5 py-1.5 shrink-0 shadow-2xs">
                                        <span className="text-xs font-black text-slate-600 dark:text-slate-300">المدة:</span>
                                        <input
                                          type="number"
                                          min="0.1"
                                          max="60"
                                          step="0.1"
                                          value={step.pauseDuration ?? 1.0}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            const updated = [...repeatSequence];
                                            updated[idx].pauseDuration = isNaN(val) ? 0.5 : Math.max(0.1, Math.min(60, val));
                                            setRepeatSequence(updated);
                                          }}
                                          className="w-12 text-xs font-black text-amber-900 dark:text-amber-200 bg-transparent outline-none text-center"
                                        />
                                        <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-400">ثانية</span>
                                      </div>

                                      {/* Quick Presets */}
                                      <div className="flex flex-wrap items-center gap-1">
                                        {[0.3, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0].map((dur) => (
                                          <button
                                            key={dur}
                                            type="button"
                                            onClick={() => {
                                              const updated = [...repeatSequence];
                                              updated[idx].pauseDuration = dur;
                                              setRepeatSequence(updated);
                                            }}
                                            className={`px-2 py-1 rounded-lg text-[10.5px] font-black cursor-pointer border transition-all ${
                                              (step.pauseDuration || 1) === dur
                                                ? "bg-amber-500 text-white border-amber-500 shadow-2xs scale-105"
                                                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-amber-200 dark:border-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                                            }`}
                                          >
                                            {dur}ث
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {step.type === "note" && (
                                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                      <select
                                        value={step.noteType || "start"}
                                        onChange={(e) => {
                                          const updated = [...repeatSequence];
                                          updated[idx].noteType = e.target.value as any;
                                          setRepeatSequence(updated);
                                        }}
                                        className="flex-1 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer outline-none shadow-2xs"
                                      >
                                        <option value="start">🟢 نغمة بداية التحدث (Start Sweep)</option>
                                        <option value="end">🔴 نغمة انتهاء التحدث (End Sweep)</option>
                                        <option value="chime">🔔 نغمة جرس ناعمة (Soft Chime)</option>
                                        <option value="ding">🛎️ جرس تنبيه حاد (Crisp Ding)</option>
                                        <option value="pop">🎈 نغمة بوب خفيفة (Pop Tone)</option>
                                        <option value="marimba">🪵 ماريمبا خشبية (Marimba)</option>
                                        <option value="success">✨ نغمة نجاح ثلاثية (Success Chord)</option>
                                        <option value="double_chime">🔔🔔 جرس مزدوج (Double Chime)</option>
                                        <option value="tick">⏱️ تكـة خفيفة (Subtle Tick)</option>
                                        <option value="bell">🎐 ناقوس كريستالي (Crystal Bell)</option>
                                        <option value="laser">⚡ نغمة ليزر خفيفة (Soft Laser)</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => playAudioNote(step.noteType || "start")}
                                        className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-all cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 shadow-2xs"
                                        title="استماع للنغمة"
                                      >
                                        <Play className="w-3 h-3 fill-current" />
                                        <span>استماع</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Floating Insert Slot between step idx and idx+1 */}
                              <div className="py-1 flex flex-col items-center justify-center relative">
                                <AnimatePresence mode="wait">
                                  {insertingStepAtIndex === idx + 1 ? (
                                    <motion.div
                                      key={`floating_menu_${idx + 1}`}
                                      initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                      transition={{ duration: 0.15 }}
                                      className={`flex items-center justify-center gap-1.5 p-1.5 rounded-full shadow-2xl backdrop-blur-md z-20 my-1 border ${
                                        isDarkMode
                                          ? "bg-slate-900/95 text-slate-100 border-slate-700/90 shadow-black/60"
                                          : "bg-slate-900/95 text-white border-slate-800 shadow-slate-900/30"
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleInsertStepAtPosition("speak", idx + 1)}
                                        className="px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                                        title="إدراج نطق صوتي هنا"
                                      >
                                        <Volume2 className="w-3.5 h-3.5" />
                                        <span>نطق صوتي</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleInsertStepAtPosition("pause", idx + 1)}
                                        className="px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                                        title="إدراج فترة سكوت هنا"
                                      >
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>فترة سكوت</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleInsertStepAtPosition("note", idx + 1)}
                                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                                        title="إدراج نغمة تنبيه هنا"
                                      >
                                        <Music className="w-3.5 h-3.5" />
                                        <span>نغمة تنبيه</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setInsertingStepAtIndex(null)}
                                        className="p-1.5 rounded-full hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer transition-colors"
                                        title="إلغاء"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </motion.div>
                                  ) : (
                                    <div className="w-full flex items-center justify-center relative group/divider py-0.5">
                                      <div className="absolute inset-x-8 h-[1px] bg-slate-200/50 dark:bg-slate-800/80 group-hover/divider:bg-indigo-300 dark:group-hover/divider:bg-indigo-800 transition-colors" />
                                      <button
                                        type="button"
                                        onClick={() => setInsertingStepAtIndex(idx + 1)}
                                        className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs group-hover/divider:scale-110 active:scale-95 ${
                                          isDarkMode
                                            ? "bg-slate-800 text-slate-400 group-hover/divider:bg-indigo-600 group-hover/divider:text-white border border-slate-700"
                                            : "bg-slate-100 text-slate-400 group-hover/divider:bg-indigo-600 group-hover/divider:text-white border border-slate-200"
                                        }`}
                                        title={`إضافة خطوة بين خطوة ${idx + 1} و ${idx + 2} (+)`}
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Download All Repeat Audio CTA Banner */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRepeatModalOpen(false);
                        setIsRepeatAudioModalOpen(true);
                        setRepeatAudioSuccess(false);
                      }}
                      className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-800 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                      <DownloadCloud className="w-4 h-4" />
                      <span>تنزيل وتأكيد كل أصوات خطوات التكرار أوفلاين 📥🎧</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (activePreviewStepIndex !== null) {
                        stopCurrentAudio();
                        setActivePreviewStepIndex(null);
                      } else {
                        executeSequenceSteps(
                          repeatSequence,
                          currentCard ? currentCard.frontText : "der Tisch",
                          currentCard ? (currentCard.frontLang || "de") : "de",
                          () => setActivePreviewStepIndex(null),
                          true,
                          currentCard || ({ frontText: "der Tisch", correctArticle: "der", isArticleMode: true } as any),
                          (sIdx) => setActivePreviewStepIndex(sIdx)
                        );
                      }
                    }}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black cursor-pointer transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs ${
                      activePreviewStepIndex !== null
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-2 ring-emerald-400/50"
                        : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {activePreviewStepIndex !== null ? (
                      <Square className="w-3.5 h-3.5 fill-current text-white" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-indigo-600 fill-current" />
                    )}
                    <span>تجربة التسلسل</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRepeatSequence(DEFAULT_REPEAT_SEQUENCE)}
                      className="px-3 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      إعادة للافتراضي
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRepeatModalOpen(false)}
                      className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>حفظ وإغلاق</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Interactive AI Review Mode Chat & Corrector Modal */}
      {isReviewChatOpen && currentCard && (
        <ReviewChatModal
          isOpen={isReviewChatOpen}
          onClose={() => setIsReviewChatOpen(false)}
          card={currentCard}
          previousCards={surroundingPrevCards}
          nextCards={surroundingNextCards}
          folderInfo={{
            name: derivedFolder?.name || "مجموعة البطاقات",
            description: derivedFolder?.description || "",
            targetLanguage: currentCard.frontLang || derivedFolder?.frontLang || "de",
            sourceLanguage: currentCard.backLang || derivedFolder?.backLang || "ar"
          }}
          onPlayPronunciation={(text, lang) => {
            playPronunciation(text, lang || currentCard.frontLang || "de");
          }}
        />
      )}

      </div>
    </MotionConfig>
  );
});
