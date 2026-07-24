import React from "react";
import { ChevronLeft, Folder, Volume2, Trash2, FolderPlus, Bell, User, Play, Plus, Search, Pencil, Menu, Home, Layers, BookOpen, RectangleVertical, CheckSquare, Scissors, Copy, X, Check, Clipboard, ListChecks, Sparkles, History, Headphones, DownloadCloud, Download, CheckCircle2, Loader2, VolumeX, FileAudio, Image as ImageIcon, FileImage } from "lucide-react";
import { Folder as FolderType, Flashcard, getSafeImageStyle, getCardSearchQuery } from "../types";
import { speakClient, preloadTTS, preloadImage } from "./Modals";
import { ImageWithSkeleton } from "./ReviewSession";
import { motion } from "motion/react";

let memoCanvas: HTMLCanvasElement | null = null;
let memoContext: CanvasRenderingContext2D | null = null;

const getTextWidth = (text: string, font: string) => {
  if (typeof document === "undefined") return text.length * 7;
  if (!memoCanvas) {
    memoCanvas = document.createElement("canvas");
    memoContext = memoCanvas.getContext("2d");
  }
  if (memoContext) {
    memoContext.font = font;
    return memoContext.measureText(text).width;
  }
  return text.length * 7;
};

const HighlightText: React.FC<{ text: string; search: string }> = ({ text, search }) => {
  if (!search || !search.trim()) return <>{text}</>;

  const cleanSearch = search.trim();
  const escapedSearch = cleanSearch.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const regex = new RegExp(`(${escapedSearch})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className="inline">
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === cleanSearch.toLowerCase();
        if (isMatch) {
          const prevPart = index > 0 ? parts[index - 1] : "";
          const nextPart = index < parts.length - 1 ? parts[index + 1] : "";

          const needsZwjBefore = prevPart && !prevPart.endsWith(" ") && !part.startsWith(" ");
          const needsZwjAfter = nextPart && !nextPart.startsWith(" ") && !part.endsWith(" ");

          const renderedPart = (needsZwjBefore ? "\u200D" : "") + part + (needsZwjAfter ? "\u200D" : "");

          return (
            <span
              key={index}
              className="bg-amber-100/95 text-[#0056f6] px-px rounded-xs inline m-0 shadow-[0_1.5px_0_0_#f59e0b]"
            >
              {renderedPart}
            </span>
          );
        } else {
          const nextPartIsMatch = index < parts.length - 1 && parts[index + 1].toLowerCase() === cleanSearch.toLowerCase();
          const prevPartIsMatch = index > 0 && parts[index - 1].toLowerCase() === cleanSearch.toLowerCase();

          const needsZwjBefore = prevPartIsMatch && !part.startsWith(" ") && !parts[index - 1].endsWith(" ");
          const needsZwjAfter = nextPartIsMatch && !part.endsWith(" ") && !parts[index + 1].startsWith(" ");

          const renderedPart = (needsZwjBefore ? "\u200D" : "") + part + (needsZwjAfter ? "\u200D" : "");

          return <span key={index}>{renderedPart}</span>;
        }
      })}
    </span>
  );
};

interface ExplorerProps {
  folders: FolderType[];
  cards: Flashcard[];
  activeFolderId: string;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onSelectFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onDeleteCard: (id: string) => void;
  onAddCardClick: () => void;
  onOpenReviewSetup: (folder: FolderType) => void;
  onCreateFolderClick: () => void;
  onEditFolder: (folder: FolderType) => void;
  onEditCard: (card: Flashcard) => void;
  onToggleSidebar?: () => void;
  onBulkDelete?: (folderIds: string[], cardIds: string[]) => void;
  onBulkMove?: (folderIds: string[], cardIds: string[], targetFolderId: string) => void;
  onBulkCopy?: (folderIds: string[], cardIds: string[], targetFolderId: string) => void;
  onRefineFolderWithAI?: (folderId: string) => void;
  onReorderFolders?: (newFolders: FolderType[]) => void;
  onReorderCards?: (newCards: Flashcard[]) => void;
}

export const Explorer: React.FC<ExplorerProps> = React.memo(({
  folders,
  cards,
  activeFolderId,
  searchQuery,
  onSearchChange,
  onSelectFolder,
  onDeleteFolder,
  onDeleteCard,
  onAddCardClick,
  onOpenReviewSetup,
  onCreateFolderClick,
  onEditFolder,
  onEditCard,
  onToggleSidebar,
  onBulkDelete,
  onBulkMove,
  onBulkCopy,
  onRefineFolderWithAI,
  onReorderFolders,
  onReorderCards
}) => {
  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const folderColor = activeFolder?.color || "#0056f6";
  const [confirmDelete, setConfirmDelete] = React.useState<{
    type: "folder" | "card";
    id: string;
    title: string;
  } | null>(null);

  // Audio Download & Offline Cache States
  const [isAudioModalOpen, setIsAudioModalOpen] = React.useState(false);
  const [isDownloadingAudio, setIsDownloadingAudio] = React.useState(false);
  const [audioProgress, setAudioProgress] = React.useState<{ current: number; total: number; currentItem: string }>({
    current: 0,
    total: 0,
    currentItem: ""
  });
  const [audioDownloadedSuccess, setAudioDownloadedSuccess] = React.useState(false);

  // Image Download & Offline Cache States
  const [isImageModalOpen, setIsImageModalOpen] = React.useState(false);
  const [isDownloadingImages, setIsDownloadingImages] = React.useState(false);
  const [includeAuto10Images, setIncludeAuto10Images] = React.useState(true);
  const [imageProgress, setImageProgress] = React.useState<{ current: number; total: number; currentItem: string; currentPreview?: string }>({
    current: 0,
    total: 0,
    currentItem: "",
    currentPreview: undefined
  });
  const [imageDownloadedSuccess, setImageDownloadedSuccess] = React.useState(false);

  // Search History States
  const [searchHistory, setSearchHistory] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("study_search_history") || "[]");
    } catch {
      return [];
    }
  });
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);

  const handleAddSearchHistory = (query: string) => {
    if (!query || !query.trim()) return;
    const trimmed = query.trim();
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== trimmed);
      const next = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem("study_search_history", JSON.stringify(next));
      return next;
    });
  };

  // List Virtualization & Progressive Loading state for handling huge lists of cards/folders
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(35);

  // Reset visible items count when searchQuery or activeFolderId changes to keep rendering light
  React.useEffect(() => {
    setVisibleCount(35);
  }, [searchQuery, activeFolderId]);

  // Infinite scroll listener to render more elements as the user scrolls down
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      // When scrolling near the bottom (less than 200px remaining), render more items
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        setVisibleCount((prev) => prev + 35);
      }
    };

    el.addEventListener("scroll", handleScroll);
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleRemoveHistoryItem = (itemToRemove: string) => {
    setSearchHistory(prev => {
      const next = prev.filter(item => item !== itemToRemove);
      localStorage.setItem("study_search_history", JSON.stringify(next));
      return next;
    });
  };

  const handleClearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("study_search_history");
  };

  // Drag and Drop States
  const [draggedFolderId, setDraggedFolderId] = React.useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = React.useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = React.useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = React.useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = React.useState<"before" | "after" | "inside" | null>(null);

  // Dragging helper
  const isDraggingAny = draggedFolderId !== null || draggedCardId !== null;

  const isDescendantFolder = (folderId: string, potentialChildId: string): boolean => {
    const child = folders.find(f => f.id === potentialChildId);
    if (!child) return false;
    if (child.parentId === folderId) return true;
    if (child.parentId) return isDescendantFolder(folderId, child.parentId);
    return false;
  };

  const handleFolderDragStart = (e: React.DragEvent, id: string) => {
    setDraggedFolderId(id);
    setDraggedCardId(null);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedFolderId === targetId) return;
    if (draggedFolderId && isDescendantFolder(draggedFolderId, targetId)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    
    let position: "before" | "after" | "inside" = "inside";
    if (draggedFolderId) {
      if (relativeY < rect.height * 0.25) {
        position = "before";
      } else if (relativeY > rect.height * 0.75) {
        position = "after";
      }
    } else if (draggedCardId) {
      position = "inside";
    }

    setDragOverFolderId(targetId);
    setDragOverPosition(position);

    if (position === "inside") {
      handleDragEnterSpringLoad(targetId);
    } else {
      handleDragLeaveSpringLoad();
    }
  };

  const handleFolderDragLeave = () => {
    setDragOverFolderId(null);
    setDragOverPosition(null);
    handleDragLeaveSpringLoad();
  };

  const handleFolderDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedFolderId) {
      if (draggedFolderId === targetId) return;
      if (isDescendantFolder(draggedFolderId, targetId)) return;

      const draggedFolder = folders.find(f => f.id === draggedFolderId);
      const targetFolder = folders.find(f => f.id === targetId);
      if (!draggedFolder || !targetFolder) return;

      let updatedFolders = [...folders];

      if (dragOverPosition === "inside") {
        updatedFolders = folders.map(f => {
          if (f.id === draggedFolderId) {
            return { ...f, parentId: targetId, updatedAt: new Date().toISOString() };
          }
          return f;
        });
      } else {
        const parentId = targetFolder.parentId;
        updatedFolders = updatedFolders.map(f => {
          if (f.id === draggedFolderId) {
            return { ...f, parentId, updatedAt: new Date().toISOString() };
          }
          return f;
        });

        const draggedIndex = updatedFolders.findIndex(f => f.id === draggedFolderId);
        const folderItem = updatedFolders[draggedIndex];
        updatedFolders.splice(draggedIndex, 1);

        const targetIndex = updatedFolders.findIndex(f => f.id === targetId);
        const insertIndex = dragOverPosition === "before" ? targetIndex : targetIndex + 1;
        updatedFolders.splice(insertIndex, 0, folderItem);
      }

      onReorderFolders?.(updatedFolders);
    } else if (draggedCardId) {
      const updatedCards = cards.map(c => {
        if (c.id === draggedCardId) {
          return { ...c, folderId: targetId };
        }
        return c;
      });
      onReorderCards?.(updatedCards);
    }

    clearAllDragStates();
  };

  const handleCardDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCardId(id);
    setDraggedFolderId(null);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleCardDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedCardId === targetId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const position = relativeY < rect.height * 0.5 ? "before" : "after";

    setDragOverCardId(targetId);
    setDragOverPosition(position);
  };

  const handleCardDragLeave = () => {
    setDragOverCardId(null);
    setDragOverPosition(null);
    handleDragLeaveSpringLoad();
  };

  const handleCardDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedCardId && draggedCardId !== targetId) {
      const draggedCard = cards.find(c => c.id === draggedCardId);
      const targetCard = cards.find(c => c.id === targetId);
      if (!draggedCard || !targetCard) return;

      let updatedCards = cards.map(c => {
        if (c.id === draggedCardId) {
          return { ...c, folderId: targetCard.folderId };
        }
        return c;
      });

      const draggedIndex = updatedCards.findIndex(c => c.id === draggedCardId);
      const cardItem = updatedCards[draggedIndex];
      updatedCards.splice(draggedIndex, 1);

      const targetIndex = updatedCards.findIndex(c => c.id === targetId);
      const insertIndex = dragOverPosition === "before" ? targetIndex : targetIndex + 1;
      updatedCards.splice(insertIndex, 0, cardItem);

      onReorderCards?.(updatedCards);
    }

    clearAllDragStates();
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedFolderId) {
      const draggedFolder = folders.find(f => f.id === draggedFolderId);
      if (!draggedFolder) return;
      
      const updatedFolders = folders.map(f => {
        if (f.id === draggedFolderId) {
          return { ...f, parentId: activeFolderId, updatedAt: new Date().toISOString() };
        }
        return f;
      });

      const folderItemIndex = updatedFolders.findIndex(f => f.id === draggedFolderId);
      if (folderItemIndex !== -1) {
        const [folderItem] = updatedFolders.splice(folderItemIndex, 1);
        updatedFolders.push(folderItem);
      }

      onReorderFolders?.(updatedFolders);
    } else if (draggedCardId) {
      const updatedCards = cards.map(c => {
        if (c.id === draggedCardId) {
          return { ...c, folderId: activeFolderId };
        }
        return c;
      });

      const cardItemIndex = updatedCards.findIndex(c => c.id === draggedCardId);
      if (cardItemIndex !== -1) {
        const [cardItem] = updatedCards.splice(cardItemIndex, 1);
        updatedCards.push(cardItem);
      }

      onReorderCards?.(updatedCards);
    }

    clearAllDragStates();
  };

  // Spring-loading (Auto-open on drag hover) Timer Ref
  const springLoadTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const springLoadTargetRef = React.useRef<string | null>(null);

  const handleDragEnterSpringLoad = (targetFolderId: string) => {
    if (!draggedFolderId && !draggedCardId) return;
    if (draggedFolderId === targetFolderId) return;
    if (springLoadTargetRef.current === targetFolderId) return;

    if (springLoadTimeoutRef.current) {
      clearTimeout(springLoadTimeoutRef.current);
    }

    springLoadTargetRef.current = targetFolderId;
    springLoadTimeoutRef.current = setTimeout(() => {
      onSelectFolder(targetFolderId);
      springLoadTargetRef.current = null;
      springLoadTimeoutRef.current = null;
    }, 1200); // 1.2s delay
  };

  const handleDragLeaveSpringLoad = () => {
    if (springLoadTimeoutRef.current) {
      clearTimeout(springLoadTimeoutRef.current);
      springLoadTimeoutRef.current = null;
    }
    springLoadTargetRef.current = null;
  };

  const clearAllDragStates = React.useCallback(() => {
    setDraggedFolderId(null);
    setDraggedCardId(null);
    setDragOverFolderId(null);
    setDragOverCardId(null);
    setDragOverPosition(null);
    handleDragLeaveSpringLoad();
  }, []);

  React.useEffect(() => {
    const handleGlobalDragEnd = () => {
      clearAllDragStates();
    };
    document.addEventListener("dragend", handleGlobalDragEnd);
    return () => {
      document.removeEventListener("dragend", handleGlobalDragEnd);
    };
  }, [clearAllDragStates]);

  const handleDragEnd = () => {
    clearAllDragStates();
  };
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);
  const [previewCard, setPreviewCard] = React.useState<Flashcard | null>(null);
  const [isPreviewFlipped, setIsPreviewFlipped] = React.useState(false);
  const [showPreviewPlural, setShowPreviewPlural] = React.useState(false);
  const [isPathExpanded, setIsPathExpanded] = React.useState(false);

  React.useEffect(() => {
    setShowPreviewPlural(false);
  }, [previewCard, isPreviewFlipped]);
  const [windowWidth, setWindowWidth] = React.useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  const hiddenBreadcrumbsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Bulk Selection States
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = React.useState<string[]>([]);
  const [selectedCardIds, setSelectedCardIds] = React.useState<string[]>([]);
  
  // Clipboard state for Cut/Copy/Paste operations
  const [clipboard, setClipboard] = React.useState<{
    type: "copy" | "cut";
    folderIds: string[];
    cardIds: string[];
  } | null>(() => {
    try {
      const saved = localStorage.getItem("workspace_clipboard");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persist clipboard to localStorage to survive page refreshes
  React.useEffect(() => {
    try {
      if (clipboard) {
        localStorage.setItem("workspace_clipboard", JSON.stringify(clipboard));
      } else {
        localStorage.removeItem("workspace_clipboard");
      }
    } catch (e) {
      console.error("Failed to save clipboard to localStorage:", e);
    }
  }, [clipboard]);

  React.useEffect(() => {
    setIsPathExpanded(false);
  }, [activeFolderId]);

  const breadcrumbsRef = React.useRef<HTMLDivElement>(null);

  // Dynamically resolve parent folders for breadcrumbs
  const getFolderPath = React.useCallback((folderId: string): FolderType[] => {
    const path: FolderType[] = [];
    let current = folders.find((f) => f.id === folderId);
    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = folders.find((f) => f.id === current.parentId);
      } else {
        break;
      }
    }
    return path;
  }, [folders]);

  // Synchronous, bulletproof Breadcrumbs Width & Collapse Calculator
  const getDynamicCollapseCount = () => {
    if (!activeFolderId) return 0;
    const path = getFolderPath(activeFolderId);
    const pathLength = path.length;
    if (pathLength <= 1) return 0;

    // Detect screen mode
    const isDesktop = windowWidth >= 1024;
    const isTablet = windowWidth >= 768 && windowWidth < 1024;

    // Define constants based on screen mode
    const font = isDesktop || isTablet ? "bold 12px Inter, sans-serif" : "bold 10px Inter, sans-serif";
    const folderPadding = isDesktop || isTablet ? 20 : 16;
    const gap = isDesktop || isTablet ? 6 : 4;
    
    const maxFolderWidth = isDesktop ? 140 : isTablet ? 100 : 85;
    const maxLastFolderWidth = isDesktop ? 250 : isTablet ? 140 : 120;
    
    const chevronWidth = (isDesktop || isTablet ? 14 : 12) + gap;
    const libraryWidth = (isDesktop || isTablet ? 85 : 70) + gap;
    const ellipsisWidth = (isDesktop || isTablet ? 28 : 22) + gap + chevronWidth;

    // Calculate full width of the path
    let totalFullWidth = libraryWidth;
    const individualFolderWidths = path.map((f, index) => {
      const isLast = index === pathLength - 1;
      const textW = getTextWidth(f.name, font);
      const limit = isLast ? maxLastFolderWidth : maxFolderWidth;
      const width = Math.min(textW + folderPadding, limit);
      totalFullWidth += width + chevronWidth;
      return width;
    });

    const parent = breadcrumbsRef.current?.parentElement;
    const containerWidth = parent ? parent.clientWidth : windowWidth;
    const availableWidth = (containerWidth > 0 ? containerWidth : windowWidth) - 32; // safe margin

    if (totalFullWidth <= availableWidth) {
      return 0; // fits fully, no collapse needed
    }

    // Find the smallest k (1 <= k < pathLength) such that the collapsed path fits
    let optimalK = pathLength - 1; // Default to maximum collapse
    for (let k = 1; k < pathLength; k++) {
      // Sum the width of the collapsed folders (first k folders)
      let sumCollapsedWidth = 0;
      for (let i = 0; i < k; i++) {
        sumCollapsedWidth += individualFolderWidths[i] + chevronWidth;
      }

      const collapsedWidth = totalFullWidth - sumCollapsedWidth + ellipsisWidth;
      if (collapsedWidth <= availableWidth) {
        optimalK = k;
        break;
      }
    }

    // Cap optimalK to ensure we always maintain an elegant, dynamic tree structure.
    // - On Desktop: Keep at least 3 folders visible if path length allows (showing a rich hierarchy).
    // - On Tablet & Mobile: Keep at least 2 folders visible (showing 'Parent > Active Folder' instead of a single folder).
    const minVisibleFolders = isDesktop ? 3 : 2;
    const maxCollapseLimit = Math.max(0, pathLength - minVisibleFolders);
    if (optimalK > maxCollapseLimit) {
      optimalK = maxCollapseLimit;
    }

    return optimalK;
  };

  const collapsedCount = getDynamicCollapseCount();
  const needsCollapse = collapsedCount > 0;

  React.useEffect(() => {
    if (breadcrumbsRef.current) {
      // In RTL, the active folder is on the far left.
      // To ensure it is fully visible, we scroll all the way to the left.
      // Setting scrollLeft to a very large negative value will scroll to the leftmost edge.
      breadcrumbsRef.current.scrollTo({
        left: -99999,
        behavior: "smooth"
      });
    }
  }, [activeFolderId, isPathExpanded, needsCollapse]);

  // Filter list based on search and selected folder
  const displayedFolders = folders.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;

    const matchesParent = activeFolderId ? f.parentId === activeFolderId : !f.parentId;
    return matchesParent;
  });

  const displayedCards = cards.filter((c) => {
    const matchesSearch = c.frontText.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.backText.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const matchesFolder = c.folderId === activeFolderId || (!activeFolderId && !c.folderId);
    return matchesFolder;
  });

  // Helper to get recursive card count for a folder (including all nested subfolders)
  const getRecursiveCardCount = React.useCallback((folderId: string): number => {
    const subfolderIds = new Set<string>();
    const queue = [folderId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (let i = 0; i < folders.length; i++) {
        const f = folders[i];
        if (f.parentId === currentId && !subfolderIds.has(f.id)) {
          subfolderIds.add(f.id);
          queue.push(f.id);
        }
      }
    }
    const allFolderIds = [folderId, ...Array.from(subfolderIds)];
    return cards.filter(c => allFolderIds.includes(c.folderId)).length;
  }, [folders, cards]);

  // Helper to retrieve all cards inside folder (including subfolders recursively) or all cards if at root
  const getFolderCardsRecursive = React.useCallback((folderId?: string): Flashcard[] => {
    if (!folderId) {
      return cards;
    }
    const subfolderIds = new Set<string>();
    const queue = [folderId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (let i = 0; i < folders.length; i++) {
        const f = folders[i];
        if (f.parentId === currentId && !subfolderIds.has(f.id)) {
          subfolderIds.add(f.id);
          queue.push(f.id);
        }
      }
    }
    const allFolderIds = [folderId, ...Array.from(subfolderIds)];
    return cards.filter(c => allFolderIds.includes(c.folderId));
  }, [folders, cards]);

  const handleStartAudioDownload = React.useCallback(async () => {
    const targetCards = getFolderCardsRecursive(activeFolderId);
    if (targetCards.length === 0) return;

    setIsDownloadingAudio(true);
    setAudioDownloadedSuccess(false);

    // Build items queue
    const queue: { text: string; lang: string; label: string; customUrl?: string }[] = [];

    targetCards.forEach((card) => {
      const fLang = card.frontLang || activeFolder?.frontLang || "de";
      const bLang = card.backLang || activeFolder?.backLang || "ar";

      if (card.frontAudioUrl) {
        queue.push({ text: card.frontText, lang: fLang, label: `صوت ${card.frontText}`, customUrl: card.frontAudioUrl });
      } else if (card.frontText && card.frontText.trim()) {
        queue.push({ text: card.frontText, lang: fLang, label: card.frontText });
      }

      if (card.backAudioUrl) {
        queue.push({ text: card.backText, lang: bLang, label: `صوت ${card.backText}`, customUrl: card.backAudioUrl });
      } else if (card.backText && card.backText.trim()) {
        queue.push({ text: card.backText, lang: bLang, label: card.backText });
      }

      if (card.isPluralMode && card.pluralText && card.pluralText.trim()) {
        queue.push({ text: card.pluralText, lang: card.pluralLang || fLang, label: `جمع ${card.pluralText}` });
      }
    });

    setAudioProgress({ current: 0, total: queue.length, currentItem: "" });

    const concurrency = 3;
    let completed = 0;

    for (let i = 0; i < queue.length; i += concurrency) {
      const chunk = queue.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            if (item.customUrl) {
              const res = await fetch(item.customUrl);
              if (res.ok && "caches" in window) {
                const cache = await caches.open("tts-audio-cache-v1");
                await cache.put(item.customUrl, res);
              }
            } else {
              await preloadTTS(item.text, item.lang);
            }
          } catch (err) {
            console.warn("Failed to download/cache audio:", item.text, err);
          } finally {
            completed++;
            setAudioProgress({
              current: completed,
              total: queue.length,
              currentItem: item.label
            });
          }
        })
      );
    }

    setIsDownloadingAudio(false);
    setAudioDownloadedSuccess(true);
  }, [activeFolderId, activeFolder, cards, getFolderCardsRecursive]);

  const handleDownloadMp3Single = React.useCallback(async (text: string, lang: string, filename: string) => {
    try {
      const url = `/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`;
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${filename || "audio"}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      console.error("Failed to download mp3:", e);
    }
  }, []);

  const handleStartImageDownload = React.useCallback(async () => {
    const targetCards = getFolderCardsRecursive(activeFolderId);
    if (targetCards.length === 0 && !activeFolder?.coverImage) return;

    setIsDownloadingImages(true);
    setImageDownloadedSuccess(false);

    // Build image queue
    const queue: { url: string; label: string; cardId: string }[] = [];

    const secondaryStorageMode = localStorage.getItem("settings_secondary_images_storage") || "data_urls";
    const primaryStorageMode = localStorage.getItem("settings_primary_image_storage") || "data_url";

    if (primaryStorageMode === "data_url" && activeFolder?.coverImage) {
      queue.push({ url: activeFolder.coverImage, label: `غلاف المجلد: ${activeFolder.name}`, cardId: "folder-cover" });
    }

    if (primaryStorageMode === "data_url") {
      targetCards.forEach((card) => {
        if (card.frontImage && card.frontImage.trim()) {
          queue.push({ url: card.frontImage, label: `الصورة الأساسية (وجه): ${card.frontText || "بدون عنوان"}`, cardId: card.id });
        }
        if (card.backImage && card.backImage.trim()) {
          queue.push({ url: card.backImage, label: `الصورة الأساسية (ظهر): ${card.backText || "بدون عنوان"}`, cardId: card.id });
        }
      });
    }

    // If auto 10 images option is enabled, fetch and cache up to 10 automatic image candidates for each card
    if (includeAuto10Images) {
      for (let idx = 0; idx < targetCards.length; idx++) {
        const card = targetCards[idx];
        const queryTerm = getCardSearchQuery(card);

        setImageProgress({
          current: idx + 1,
          total: targetCards.length,
          currentItem: `مرحلة 1/2 (جلب القوائم): تجهيز الـ 10 صور للبطاقة (${idx + 1}/${targetCards.length}): "${card.frontText || queryTerm || "بطاقة"}"...`
        });

        // 1. Check if candidate URLs are already stored on card or in localStorage
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

          if (secondaryStorageMode === "data_urls") {
            storedUrls.forEach((imgUrl: string, imgIdx: number) => {
              if (imgUrl && !queue.some(q => q.url === imgUrl)) {
                queue.push({
                  url: imgUrl,
                  label: `صورة تلقائية #${imgIdx + 1} لـ "${card.frontText || queryTerm || "بطاقة"}"`,
                  cardId: card.id
                });
              }
            });
          }
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

            // Save candidate images list for this card in localStorage for offline access
            try {
              localStorage.setItem(`auto_images_${card.id}`, JSON.stringify(urls));
            } catch (e) {}

            // Only push to download queue if memory cache mode is selected (data_urls)
            if (secondaryStorageMode === "data_urls") {
              urls.forEach((imgUrl: string, imgIdx: number) => {
                if (imgUrl && !queue.some(q => q.url === imgUrl)) {
                  queue.push({
                    url: imgUrl,
                    label: `صورة تلقائية #${imgIdx + 1} لـ "${card.frontText || queryTerm}"`,
                    cardId: card.id
                  });
                }
              });
            }
          }
        } catch (err) {
          console.warn("Failed to fetch auto 10 images for card:", queryTerm, err);
        }

        // Polite delay between search requests
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (queue.length === 0) {
      setIsDownloadingImages(false);
      setImageDownloadedSuccess(true);
      return;
    }

    setImageProgress({ current: 0, total: queue.length, currentItem: "مرحلة 2/2: التنزيل والتخزين المحلي...", currentPreview: undefined });

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
            setImageProgress({
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

    setIsDownloadingImages(false);
    setImageDownloadedSuccess(true);
  }, [activeFolderId, activeFolder, getFolderCardsRecursive, includeAuto10Images]);

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

  // progressive/virtual slice of folders and cards based on visibleCount to minimize DOM nodes and optimize rendering performance
  const visibleFolders = displayedFolders.slice(0, visibleCount);
  const remainingCount = Math.max(0, visibleCount - displayedFolders.length);
  const visibleCards = displayedCards.slice(0, remainingCount);

  const playPronunciation = (text: string, lang: string) => {
    speakClient(text, lang);
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    );
  };

  const toggleCardSelection = (cardId: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  // Helpers to select/deselect all displayed items in the current view/folder
  const isAllSelectedInView = React.useMemo(() => {
    const allFolderIdsInView = displayedFolders.map(f => f.id);
    const allCardIdsInView = displayedCards.map(c => c.id);
    if (allFolderIdsInView.length === 0 && allCardIdsInView.length === 0) return false;
    const areAllFoldersSelected = allFolderIdsInView.every(id => selectedFolderIds.includes(id));
    const areAllCardsSelected = allCardIdsInView.every(id => selectedCardIds.includes(id));
    return areAllFoldersSelected && areAllCardsSelected;
  }, [displayedFolders, displayedCards, selectedFolderIds, selectedCardIds]);

  const handleSelectAll = React.useCallback(() => {
    const allFolderIdsInView = displayedFolders.map(f => f.id);
    const allCardIdsInView = displayedCards.map(c => c.id);
    if (allFolderIdsInView.length === 0 && allCardIdsInView.length === 0) return;

    const areAllFoldersSelected = allFolderIdsInView.every(id => selectedFolderIds.includes(id));
    const areAllCardsSelected = allCardIdsInView.every(id => selectedCardIds.includes(id));

    if (areAllFoldersSelected && areAllCardsSelected) {
      // Deselect all items of this view
      setSelectedFolderIds(prev => prev.filter(id => !allFolderIdsInView.includes(id)));
      setSelectedCardIds(prev => prev.filter(id => !allCardIdsInView.includes(id)));
    } else {
      // Select all items of this view
      setSelectedFolderIds(prev => {
        const union = new Set([...prev, ...allFolderIdsInView]);
        return Array.from(union);
      });
      setSelectedCardIds(prev => {
        const union = new Set([...prev, ...allCardIdsInView]);
        return Array.from(union);
      });
    }
  }, [displayedFolders, displayedCards, selectedFolderIds, selectedCardIds]);

  const handleStartCopy = () => {
    setClipboard({
      type: "copy",
      folderIds: [...selectedFolderIds],
      cardIds: [...selectedCardIds]
    });
    setIsSelectionMode(false);
    setSelectedFolderIds([]);
    setSelectedCardIds([]);
  };

  const handleStartCut = () => {
    setClipboard({
      type: "cut",
      folderIds: [...selectedFolderIds],
      cardIds: [...selectedCardIds]
    });
    setIsSelectionMode(false);
    setSelectedFolderIds([]);
    setSelectedCardIds([]);
  };

  const handleExecutePaste = () => {
    if (!clipboard) return;
    if (clipboard.type === "cut" && onBulkMove) {
      onBulkMove(clipboard.folderIds, clipboard.cardIds, activeFolderId);
    } else if (clipboard.type === "copy" && onBulkCopy) {
      onBulkCopy(clipboard.folderIds, clipboard.cardIds, activeFolderId);
    }
    setClipboard(null);
  };

  const handleBulkDeleteConfirm = () => {
    if (onBulkDelete) {
      onBulkDelete(selectedFolderIds, selectedCardIds);
    }
    setIsSelectionMode(false);
    setSelectedFolderIds([]);
    setSelectedCardIds([]);
    setConfirmBulkDelete(false);
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 space-y-4 md:space-y-6 font-sans bg-white" dir="rtl">
      
      {/* 1. Global Navigation Top Header within Explorer */}
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant/10 gap-3">
        
        {/* Top Row: Menu Toggle, Search */}
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 text-[#5f6368] hover:bg-slate-100 rounded-xl cursor-pointer"
              title="القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          
          {/* Enhanced Search Input */}
          <div className="relative flex items-center">
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/60 focus-within:border-[#0056f6] focus-within:bg-white transition-all focus-within:ring-2 focus-within:ring-[#0056f6]/10">
              <Search className="w-4 h-4 text-[#5f6368] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => {
                  setTimeout(() => setIsSearchFocused(false), 200);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    handleAddSearchHistory(searchQuery.trim());
                  }
                }}
                placeholder="ابحث عن بطاقات ومجلدات..."
                className="bg-transparent border-none text-xs outline-none w-36 sm:w-48 md:w-56 transition-all text-right text-on-surface placeholder-[#5f6368]/50 focus:ring-0"
                dir="rtl"
              />
              
              {searchQuery && (
                <span className="bg-slate-200/80 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                  {displayedFolders.length + displayedCards.length}
                </span>
              )}

              {searchQuery && (
                <button
                  onClick={() => onSearchChange("")}
                  className="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {isSearchFocused && searchHistory.length > 0 && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-slate-200/60 rounded-xl shadow-lg p-2 z-50 flex flex-col gap-1 text-right animate-fade-in" dir="rtl">
                <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400">عمليات البحث الأخيرة</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearSearchHistory();
                    }}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                  >
                    مسح السجل
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto py-1 flex flex-col">
                  {searchHistory.map((hist, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      onMouseDown={() => {
                        onSearchChange(hist);
                      }}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <History className="w-3.5 h-3.5 text-slate-400" />
                        <span>{hist}</span>
                      </div>
                      <button
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleRemoveHistoryItem(hist);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User profile */}
        <div className="flex items-center gap-1">
          <button className="text-outline hover:text-on-surface transition-colors p-2 rounded-full hover:bg-slate-100 cursor-pointer">
            <Bell className="w-5 h-5 text-[#5f6368]" />
          </button>
          <div className="w-8 h-8 rounded-full bg-[#f1f3f4] border border-outline-variant/20 flex items-center justify-center font-bold text-xs text-[#5f6368] cursor-pointer hover:bg-slate-200">
            <User className="w-4 h-4 text-[#5f6368]" />
          </div>
        </div>

      </div>

      {/* 2. Separated Elegant Folder Path (مسار المجلد بشكل مستقل وجميل) */}
      <div 
        className="flex items-center justify-start w-full mb-1.5 md:mb-2 max-w-full overflow-hidden relative" 
        dir="rtl"
      >
        {/* Hidden full path replica used to measure if it overflows on the current screen width */}
        {activeFolderId && (() => {
          const path = getFolderPath(activeFolderId);
          const isDesktop = windowWidth >= 1024;
          const isTablet = windowWidth >= 768 && windowWidth < 1024;
          
          let folderClass = "";
          if (isDesktop) {
            folderClass = "px-2.5 py-1 text-xs font-bold max-w-[140px] truncate shrink-0 inline-block";
          } else if (isTablet) {
            folderClass = "px-2.5 py-1 text-xs font-bold max-w-[100px] truncate shrink-0 inline-block";
          } else {
            folderClass = "px-2 py-0.5 text-[10px] font-bold max-w-[85px] truncate shrink-0 inline-block";
          }

          let lastFolderClass = "";
          if (isDesktop) {
            lastFolderClass = "px-2.5 py-1 text-xs font-bold max-w-[250px] truncate shrink-0 inline-block";
          } else if (isTablet) {
            lastFolderClass = "px-2.5 py-1 text-xs font-bold max-w-[140px] truncate shrink-0 inline-block";
          } else {
            lastFolderClass = "px-2 py-0.5 text-[10px] font-bold max-w-[120px] truncate shrink-0 inline-block";
          }

          return (
            <div
              ref={hiddenBreadcrumbsRef}
              className="absolute pointer-events-none opacity-0 flex flex-nowrap items-center gap-1.5 px-4 py-1.5"
              style={{ left: -9999, top: -9999, width: "max-content" }}
            >
              <span className="flex items-center gap-1.5 px-2.5 py-1 shrink-0 text-xs">
                <Home className="w-3.5 h-3.5" />
                <span>المكتبة</span>
              </span>
              {path.map((f, index) => {
                const isLast = index === path.length - 1;
                return (
                  <React.Fragment key={`hidden-${f.id}`}>
                    <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className={isLast ? lastFolderClass : folderClass}>
                      {f.name}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}

        <div 
          ref={breadcrumbsRef}
          className="flex flex-nowrap overflow-x-auto scrollbar-none items-center gap-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-100 px-4 py-1.5 rounded-2xl shadow-3xs transition-all duration-300 max-w-full"
          style={{
            borderRight: activeFolder ? `3px solid ${folderColor}` : "3px solid #e2e8f0"
          }}
        >
          <span 
            onClick={() => onSelectFolder("")} 
            onDragOver={(e) => {
              e.preventDefault();
              handleDragEnterSpringLoad("");
            }}
            onDragLeave={handleDragLeaveSpringLoad}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] shrink-0"
          >
            <Home className="w-3.5 h-3.5 text-slate-400" />
            <span>المكتبة</span>
          </span>
          
          {activeFolderId && (() => {
            const path = getFolderPath(activeFolderId);
            
            return (
              <>
                {/* 1. Desktop Breadcrumbs (Hidden on Mobile and Tablet) */}
                <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                  {(() => {
                    const actualCollapseCount = isPathExpanded ? 0 : collapsedCount;
                    if (actualCollapseCount > 0) {
                      const visibleFolders = path.slice(actualCollapseCount);
                      return (
                        <>
                          <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          {/* Clickable Ellipsis to expand the path */}
                          <span
                            onClick={() => setIsPathExpanded(true)}
                            className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-[#0056f6] rounded-md transition-all cursor-pointer font-extrabold flex items-center justify-center shrink-0 border border-slate-100 hover:border-slate-200"
                            title="توسيع المسار بالكامل"
                          >
                            ...
                          </span>

                          {visibleFolders.map((f, index) => {
                            const isLast = index === visibleFolders.length - 1;
                            return (
                              <React.Fragment key={`desktop-collapsed-${f.id}`}>
                                <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                <span
                                  dir="auto"
                                  onClick={isLast ? undefined : () => onSelectFolder(f.id)}
                                  onDragOver={isLast ? undefined : (e) => {
                                    e.preventDefault();
                                    handleDragEnterSpringLoad(f.id);
                                  }}
                                  onDragLeave={isLast ? undefined : handleDragLeaveSpringLoad}
                                  className={isLast 
                                    ? "px-2.5 py-1 rounded-lg font-extrabold max-w-[250px] truncate shadow-3xs shrink-0 text-start inline-block"
                                    : "px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] max-w-[140px] truncate shrink-0 text-start inline-block"
                                  }
                                  style={isLast ? { 
                                    backgroundColor: `${f.color || '#0056f6'}10`, 
                                    color: f.color || '#0056f6',
                                    border: `1px solid ${f.color || '#0056f6'}20`
                                  } : undefined}
                                  title={f.name}
                                >
                                  {f.name}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </>
                      );
                    }

                    // Desktop Full Path View
                    return (
                      <>
                        {path.map((f, index) => {
                          const isLast = index === path.length - 1;
                          return (
                            <React.Fragment key={`desktop-full-${f.id}`}>
                              <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                              <span
                                dir="auto"
                                onClick={isLast ? undefined : () => onSelectFolder(f.id)}
                                onDragOver={isLast ? undefined : (e) => {
                                  e.preventDefault();
                                  handleDragEnterSpringLoad(f.id);
                                }}
                                onDragLeave={isLast ? undefined : handleDragLeaveSpringLoad}
                                className={isLast 
                                  ? "px-2.5 py-1 rounded-lg font-extrabold max-w-[250px] truncate shadow-3xs shrink-0 text-start inline-block"
                                  : "px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] max-w-[140px] truncate shrink-0 text-start inline-block"
                                }
                                style={isLast ? { 
                                  backgroundColor: `${f.color || '#0056f6'}10`, 
                                  color: f.color || '#0056f6',
                                  border: `1px solid ${f.color || '#0056f6'}20`
                                } : undefined}
                                title={f.name}
                              >
                                {f.name}
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>

                {/* 2. Tablet Breadcrumbs (Visible on Tablet only - md to lg) */}
                <div className="hidden md:flex lg:hidden items-center gap-1.5 shrink-0">
                  {(() => {
                    const actualCollapseCount = isPathExpanded ? 0 : collapsedCount;
                    if (actualCollapseCount > 0) {
                      const visibleFolders = path.slice(actualCollapseCount);
                      return (
                        <>
                          <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          {/* Clickable Ellipsis to expand the path */}
                          <span
                            onClick={() => setIsPathExpanded(true)}
                            className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-[#0056f6] rounded-md transition-all cursor-pointer font-extrabold flex items-center justify-center shrink-0 border border-slate-100 hover:border-slate-200"
                            title="توسيع المسار بالكامل"
                          >
                            ...
                          </span>

                          {visibleFolders.map((f, index) => {
                            const isLast = index === visibleFolders.length - 1;
                            return (
                              <React.Fragment key={`tablet-collapsed-${f.id}`}>
                                <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                <span
                                  dir="auto"
                                  onClick={isLast ? undefined : () => onSelectFolder(f.id)}
                                  onDragOver={isLast ? undefined : (e) => {
                                    e.preventDefault();
                                    handleDragEnterSpringLoad(f.id);
                                  }}
                                  onDragLeave={isLast ? undefined : handleDragLeaveSpringLoad}
                                  className={isLast 
                                    ? "px-2.5 py-1 rounded-lg font-extrabold max-w-[140px] truncate shadow-3xs shrink-0 text-start inline-block"
                                    : "px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] max-w-[100px] truncate shrink-0 text-start inline-block"
                                  }
                                  style={isLast ? { 
                                    backgroundColor: `${f.color || '#0056f6'}10`, 
                                    color: f.color || '#0056f6',
                                    border: `1px solid ${f.color || '#0056f6'}20`
                                  } : undefined}
                                  title={f.name}
                                >
                                  {f.name}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </>
                      );
                    }

                    // Tablet Full Path View
                    return (
                      <>
                        {path.map((f, index) => {
                          const isLast = index === path.length - 1;
                          return (
                            <React.Fragment key={`tablet-full-${f.id}`}>
                              <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                              <span
                                dir="auto"
                                onClick={isLast ? undefined : () => onSelectFolder(f.id)}
                                onDragOver={isLast ? undefined : (e) => {
                                  e.preventDefault();
                                  handleDragEnterSpringLoad(f.id);
                                }}
                                onDragLeave={isLast ? undefined : handleDragLeaveSpringLoad}
                                className={isLast 
                                  ? "px-2.5 py-1 rounded-lg font-extrabold max-w-[140px] truncate shadow-3xs shrink-0 text-start inline-block"
                                  : "px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] max-w-[100px] truncate shrink-0 text-start inline-block"
                                }
                                style={isLast ? { 
                                  backgroundColor: `${f.color || '#0056f6'}10`, 
                                  color: f.color || '#0056f6',
                                  border: `1px solid ${f.color || '#0056f6'}20`
                                } : undefined}
                                title={f.name}
                              >
                                {f.name}
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>

                {/* 3. Mobile Breadcrumbs (Hidden on Desktop and Tablet) */}
                <div className="flex md:hidden items-center gap-1 shrink-0">
                  {(() => {
                    const actualCollapseCount = isPathExpanded ? 0 : collapsedCount;
                    if (actualCollapseCount > 0) {
                      const visibleFolders = path.slice(actualCollapseCount);
                      return (
                        <>
                          <ChevronLeft className="w-3 h-3 text-slate-300 shrink-0" />
                          {/* Ellipsis to expand */}
                          <span
                            onClick={() => setIsPathExpanded(true)}
                            className="px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-md transition-all cursor-pointer font-extrabold flex items-center justify-center shrink-0 text-[10px] border border-slate-100"
                            title="توسيع المسار بالكامل"
                          >
                            ...
                          </span>

                          {visibleFolders.map((f, index) => {
                            const isLast = index === visibleFolders.length - 1;
                            return (
                              <React.Fragment key={`mobile-collapsed-${f.id}`}>
                                <ChevronLeft className="w-3 h-3 text-slate-300 shrink-0" />
                                <span
                                  dir="auto"
                                  onClick={isLast ? undefined : () => onSelectFolder(f.id)}
                                  onDragOver={isLast ? undefined : (e) => {
                                    e.preventDefault();
                                    handleDragEnterSpringLoad(f.id);
                                  }}
                                  onDragLeave={isLast ? undefined : handleDragLeaveSpringLoad}
                                  className={isLast 
                                    ? "px-2 py-0.5 rounded-md font-extrabold max-w-[120px] truncate text-[10px] shrink-0 shadow-3xs text-start inline-block" 
                                    : "px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md text-[10px] truncate max-w-[85px] shrink-0 text-start inline-block"
                                  }
                                  style={isLast ? { 
                                    backgroundColor: `${f.color || '#0056f6'}10`, 
                                    color: f.color || '#0056f6',
                                    border: `1px solid ${f.color || '#0056f6'}15`
                                  } : undefined}
                                  title={f.name}
                                >
                                  {f.name}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </>
                      );
                    }

                    // Mobile Full Path View
                    return (
                      <>
                        {path.map((f, index) => {
                          const isLast = index === path.length - 1;
                          return (
                            <React.Fragment key={`mobile-full-${f.id}`}>
                              <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                              <span
                                dir="auto"
                                onClick={isLast ? undefined : () => onSelectFolder(f.id)}
                                onDragOver={isLast ? undefined : (e) => {
                                  e.preventDefault();
                                  handleDragEnterSpringLoad(f.id);
                                }}
                                onDragLeave={isLast ? undefined : handleDragLeaveSpringLoad}
                                className={isLast 
                                  ? "px-2 py-0.5 rounded-md font-extrabold max-w-[120px] truncate text-[10px] shrink-0 shadow-3xs text-start inline-block" 
                                  : "px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md text-[10px] truncate max-w-[85px] shrink-0 text-start inline-block"
                                }
                                style={isLast ? { 
                                  backgroundColor: `${f.color || '#0056f6'}10`, 
                                  color: f.color || '#0056f6',
                                  border: `1px solid ${f.color || '#0056f6'}15`
                                } : undefined}
                                title={f.name}
                              >
                                {f.name}
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* 3. Elegant Folder Banner (Clean details only, no tools clogging it) */}
      <div 
        className={`relative overflow-hidden p-6 md:p-8 rounded-3xl border shadow-sm mb-1.5 md:mb-2 ${
          activeFolder ? "pl-28 md:pl-56" : ""
        }`}
        style={{
          borderRight: activeFolder ? `5px solid ${folderColor}` : "4px solid #e2e8f0",
          backgroundColor: activeFolder ? folderColor : "#ffffff",
          backgroundImage: activeFolder 
            ? "none" 
            : "linear-gradient(135deg, #f8fafc, #ffffff)",
          borderColor: activeFolder ? folderColor : "#e2e8f0"
        }}
      >
        {/* Full-width Cover Image Backdrop at 15% opacity with 5px blur */}
        {activeFolder?.coverImage && (
          <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <img
              src={activeFolder.coverImage}
              alt=""
              className="w-full h-full object-cover"
              style={{
                ...getSafeImageStyle(activeFolder.coverImagePosition),
                opacity: 0.15,
                filter: "blur(5px)"
              }}
              referrerPolicy="no-referrer"
            />
            {/* Subtle gradient overlay to make sure the edges blend softly with the solid color */}
            <div className="absolute inset-0 bg-gradient-to-l from-black/5 to-transparent" />
          </div>
        )}

        {/* Subtle Ambient Theme Glow */}
        <div 
          className="absolute -top-20 -left-20 w-44 h-44 rounded-full blur-3xl pointer-events-none z-0"
          style={{ 
            backgroundColor: activeFolder ? '#ffffff' : folderColor,
            opacity: activeFolder ? 0.15 : 0.08
          }}
        />

        {/* Content Row: Title & description at the bottom */}
        <div className="flex flex-col gap-2 w-full z-10 relative text-right">
          {/* Title & Description Block */}
          <div className="space-y-1">
            <h2 
              className={`text-xl md:text-3.5xl font-black tracking-tight leading-tight flex items-center gap-2 flex-wrap ${
                activeFolder 
                  ? "text-white drop-shadow-sm" 
                  : "text-slate-800"
              }`}
            >
              {activeFolder ? activeFolder.name : "المكتبة"}
            </h2>
            {activeFolder?.description && (
              <p className={`text-[11px] md:text-xs font-semibold max-w-2xl leading-relaxed mt-1 pr-1 ${activeFolder ? "text-white/85" : "text-slate-500"}`}>
                {activeFolder.description}
              </p>
            )}
          </div>

          {/* Info Stats Badges */}
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2 pt-0.5">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 md:px-3 md:py-1 text-[10px] md:text-[11px] font-bold rounded-lg border ${
              activeFolder 
                ? "bg-white/10 text-white border-white/10" 
                : "bg-slate-100 text-slate-600 border-slate-200/40"
            }`}>
              <Layers className={`w-3 h-3 md:w-3.5 md:h-3.5 ${activeFolder ? "text-white/70" : "text-slate-400"}`} />
              <span>{displayedFolders.length} مجلدات</span>
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 md:px-3 md:py-1 text-[10px] md:text-[11px] font-bold rounded-lg border ${
              activeFolder 
                ? "bg-white/10 text-white border-white/10" 
                : "bg-slate-100 text-slate-600 border-slate-200/40"
            }`}>
              <BookOpen className={`w-3 h-3 md:w-3.5 md:h-3.5 ${activeFolder ? "text-white/70" : "text-slate-400"}`} />
              <span>{activeFolderId ? getRecursiveCardCount(activeFolderId) : displayedCards.length} بطاقات</span>
            </span>
          </div>
        </div>

        {/* Left Side: Fully Integrated full-height Cover Panel (غلاف المجلد متكامل تماماً) */}
        {activeFolder && (
          <div 
            className="absolute left-0 top-0 bottom-0 w-24 md:w-48 border-r md:border-r-0 md:border-l border-slate-100/10 overflow-hidden flex items-center justify-center shrink-0 z-10"
            style={{
              backgroundColor: `${folderColor}15`,
            }}
          >
            {activeFolder.coverImage ? (
              <>
                <ImageWithSkeleton
                  src={activeFolder.coverImage}
                  alt="غلاف المجلد"
                  className="absolute inset-0 w-full h-full object-cover opacity-95"
                  style={getSafeImageStyle(activeFolder.coverImagePosition)}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
              </>
            ) : (
              // Premium fallback folder/notebook design using its color
              <div 
                className="absolute inset-0 flex flex-col justify-between p-4 text-white"
                style={{
                  background: `linear-gradient(135deg, ${folderColor}, ${folderColor}cc)`
                }}
              >
                <div className="flex justify-between items-start">
                  <Folder className="w-6 h-6 fill-white/10 text-white" />
                </div>
              </div>
            )}
            
            {/* Notebook binder/spine decoration (on the right for Arabic RTL books) */}
            <div 
              className="absolute right-0 top-0 bottom-0 w-3 flex flex-col justify-around py-2 items-center"
              style={{ backgroundColor: folderColor, filter: "brightness(0.85)" }}
            >
              <div className="w-1.5 h-1 bg-black/20 rounded-full" />
              <div className="w-1.5 h-1 bg-black/20 rounded-full" />
              <div className="w-1.5 h-1 bg-black/20 rounded-full" />
              <div className="w-1.5 h-1 bg-black/20 rounded-full" />
              <div className="w-1.5 h-1 bg-black/20 rounded-full" />
            </div>
            {/* Subtle line to simulate page thickness on the left edge */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/20" />
          </div>
        )}
      </div>

      {/* 4. Top Action Toolbar (شريط الإجراءات السريعة ومجموعة الأزرار المتناسقة) */}
      <div 
        className="flex items-center justify-between gap-3 w-full bg-slate-50/45 p-1.5 rounded-2xl border border-slate-100/70 shadow-3xs" 
        dir="rtl"
      >
        <div className="flex items-center gap-1.5">
          {isSelectionMode || clipboard ? (
            <button
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedFolderIds([]);
                setSelectedCardIds([]);
                setClipboard(null);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 outline-none"
              title="إلغاء التحديد أو الحافظة"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => {
                setIsSelectionMode(true);
                setSelectedFolderIds([]);
                setSelectedCardIds([]);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 hover:bg-slate-100/80 text-slate-600 outline-none"
              title="تحديد عناصر"
            >
              <ListChecks className="w-4 h-4 text-slate-500" />
            </button>
          )}

          {isSelectionMode && (
            <button
              onClick={handleSelectAll}
              disabled={displayedFolders.length === 0 && displayedCards.length === 0}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 border outline-none ${
                displayedFolders.length === 0 && displayedCards.length === 0
                  ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                  : isAllSelectedInView
                    ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
              }`}
              title={isAllSelectedInView ? "إلغاء تحديد الكل" : "تحديد الكل"}
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Premium Modern Action Toolbar (متناسق مع حجم المسار) */}
        <div dir="ltr" className="flex items-center gap-1.5 p-1 bg-white border border-slate-100 rounded-full shadow-3xs shrink-0">
          {isSelectionMode ? (
            <>
              {/* Delete */}
              <button
                onClick={() => setConfirmBulkDelete(true)}
                disabled={selectedFolderIds.length === 0 && selectedCardIds.length === 0}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 outline-none bg-rose-50 text-rose-700 ${
                  selectedFolderIds.length === 0 && selectedCardIds.length === 0
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-rose-100"
                }`}
                title="حذف العناصر المحددة"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Divider */}
              <div className="w-[1px] h-4 bg-slate-200" />

              {/* Copy */}
              <button
                onClick={handleStartCopy}
                disabled={selectedFolderIds.length === 0 && selectedCardIds.length === 0}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 outline-none bg-blue-50 text-blue-700 ${
                  selectedFolderIds.length === 0 && selectedCardIds.length === 0
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-blue-100"
                }`}
                title="نسخ العناصر المحددة"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              {/* Cut */}
              <button
                onClick={handleStartCut}
                disabled={selectedFolderIds.length === 0 && selectedCardIds.length === 0}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 outline-none bg-amber-50 text-amber-700 ${
                  selectedFolderIds.length === 0 && selectedCardIds.length === 0
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-amber-100"
                }`}
                title="قص العناصر المحددة"
              >
                <Scissors className="w-3.5 h-3.5" />
              </button>
            </>
          ) : clipboard ? (
            <>
              {/* Paste - Same design style as Review button */}
              <button
                onClick={handleExecutePaste}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs hover:scale-105 hover:brightness-110 active:scale-95 shrink-0 text-white outline-none"
                style={{ backgroundColor: folderColor }}
                title={`لصق العناصر (${clipboard.folderIds.length + clipboard.cardIds.length})`}
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>

              {/* Divider */}
              <div className="w-[1px] h-4 bg-slate-200" />

              {/* Create Folder */}
              <button
                onClick={onCreateFolderClick}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 outline-none"
                title="إنشاء مجلد جديد"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>

              {/* Download / Cache Audio */}
              <button
                onClick={() => {
                  setIsAudioModalOpen(true);
                  setAudioDownloadedSuccess(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-[#0056f6] hover:bg-blue-50/80 outline-none"
                title="تنزيل وتخزين الصوتيات مسبقاً"
              >
                <Headphones className="w-3.5 h-3.5" />
              </button>

              {/* Download / Cache Primary Images */}
              <button
                onClick={() => {
                  setIsImageModalOpen(true);
                  setIncludeAuto10Images(false);
                  setImageDownloadedSuccess(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-emerald-600 hover:bg-emerald-50/80 outline-none"
                title="تنزيل وتخزين الصور الأساسية مسبقاً"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>

              {/* Dedicated Button: Download / Cache 10 Auto Images per card */}
              <button
                onClick={() => {
                  setIsImageModalOpen(true);
                  setIncludeAuto10Images(true);
                  setImageDownloadedSuccess(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-amber-50/80 hover:bg-amber-100/80 text-amber-700 hover:text-amber-800 outline-none border border-amber-200/50"
                title="تنزيل وتخزين الـ 10 صور التلقائية المقترحة لكل بطاقة 🖼️"
              >
                <Layers className="w-3.5 h-3.5 text-amber-600" />
              </button>

              {/* Create Card */}
              <button
                onClick={onAddCardClick}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 outline-none"
                title="إنشاء بطاقة جديدة"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              {/* Play/Review Action Button - Prominent Accent */}
              <button
                onClick={() => {
                  if (activeFolder) {
                    onOpenReviewSetup(activeFolder);
                  } else {
                    onOpenReviewSetup({
                      id: "root-library",
                      name: "المكتبة",
                      color: "#0056f6",
                      frontLang: "de",
                      backLang: "ar",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs hover:scale-105 hover:brightness-110 active:scale-95 shrink-0 text-white outline-none"
                style={{ backgroundColor: folderColor }}
                title="بدء المراجعة"
              >
                <Play className="w-3.5 h-3.5 fill-current mr-0.5" />
              </button>

              {/* AI Refinement Action Button */}
              {activeFolder && onRefineFolderWithAI && (
                <button
                  onClick={() => {
                    onRefineFolderWithAI(activeFolder.id);
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs hover:scale-105 hover:brightness-110 active:scale-95 shrink-0 text-white outline-none bg-gradient-to-tr from-[#0056f6] to-violet-600 border border-violet-400/20"
                  title="تعديل وتنقيح جماعي بالذكاء الاصطناعي 🪄"
                >
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </button>
              )}

              {/* Edit Current Folder Action Button */}
              {activeFolder && (
                <button
                  onClick={() => onEditFolder(activeFolder)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs hover:scale-105 active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 outline-none border border-slate-100 shrink-0"
                  title="تعديل هذا المجلد"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Divider */}
              <div className="w-[1px] h-4 bg-slate-200" />

              {/* Create Folder */}
              <button
                onClick={onCreateFolderClick}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 outline-none"
                title="إنشاء مجلد جديد"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>

              {/* Download / Cache Audio */}
              <button
                onClick={() => {
                  setIsAudioModalOpen(true);
                  setAudioDownloadedSuccess(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-[#0056f6] hover:bg-blue-50/80 outline-none"
                title="تنزيل وتخزين الصوتيات مسبقاً"
              >
                <Headphones className="w-3.5 h-3.5" />
              </button>

              {/* Download / Cache Primary Images */}
              <button
                onClick={() => {
                  setIsImageModalOpen(true);
                  setIncludeAuto10Images(false);
                  setImageDownloadedSuccess(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-emerald-600 hover:bg-emerald-50/80 outline-none"
                title="تنزيل وتخزين الصور الأساسية مسبقاً"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>

              {/* Dedicated Button: Download / Cache 10 Auto Images per card */}
              <button
                onClick={() => {
                  setIsImageModalOpen(true);
                  setIncludeAuto10Images(true);
                  setImageDownloadedSuccess(false);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-amber-50/80 hover:bg-amber-100/80 text-amber-700 hover:text-amber-800 outline-none border border-amber-200/50"
                title="تنزيل وتخزين الـ 10 صور التلقائية المقترحة لكل بطاقة 🖼️"
              >
                <Layers className="w-3.5 h-3.5 text-amber-600" />
              </button>

              {/* Create Card */}
              <button
                onClick={onAddCardClick}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 bg-slate-50 hover:bg-slate-100 text-slate-700 outline-none"
                title="إنشاء بطاقة جديدة"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. Unified Items List (Folders first, then Cards) */}
      <div 
        className="pt-1 min-h-[300px] pb-20"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        {displayedFolders.length === 0 && displayedCards.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-outline-variant/30 flex flex-col items-center justify-center p-6" dir="rtl">
            <Folder className="w-12 h-12 text-outline-variant/40 mb-3" />
            <h4 className="font-bold text-on-surface text-sm">لا توجد عناصر مضافة بعد</h4>
            <p className="text-xs text-on-surface-variant mt-1 max-w-sm leading-relaxed font-semibold">
              هذا المجلد فارغ حالياً. اضغط على أزرار الإضافة في الأعلى لإنشاء مجلدات فرعية أو بطاقات دراسية جديدة!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            
            {/* Folder list items */}
            {visibleFolders.map((f) => {
              const fCards = cards.filter((c) => c.folderId === f.id);
              const fRecursiveCardCount = getRecursiveCardCount(f.id);
              const isSelected = selectedFolderIds.includes(f.id);

              const isBeingDragged = f.id === draggedFolderId;
              const isDragOverThis = f.id === dragOverFolderId;
              
              let dragStyle = "";
              if (isBeingDragged) {
                dragStyle = "opacity-30 border-dashed border-[#0056f6] scale-98";
              }

              const showGapBefore = isDragOverThis && dragOverPosition === "before";
              const showGapAfter = isDragOverThis && dragOverPosition === "after";
              const showInsideHighlight = isDragOverThis && dragOverPosition === "inside";

              return (
                <div
                  key={f.id}
                  className="py-1.5 w-full relative"
                  onDragOver={(e) => handleFolderDragOver(e, f.id)}
                  onDragLeave={handleFolderDragLeave}
                  onDrop={(e) => handleFolderDrop(e, f.id)}
                >
                  {/* Absolute Zero-layout-displacement GAP coloring */}
                  {showGapBefore && (
                    <div className="absolute top-0 inset-x-2 h-1.5 bg-[#0056f6]/20 rounded-full pointer-events-none z-20" />
                  )}
                  {showGapAfter && (
                    <div className="absolute bottom-0 inset-x-2 h-1.5 bg-[#0056f6]/20 rounded-full pointer-events-none z-20" />
                  )}

                  <div
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleFolderSelection(f.id);
                      } else {
                        onSelectFolder(f.id);
                      }
                    }}
                    draggable={!isSelectionMode}
                    onDragStart={(e) => handleFolderDragStart(e, f.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-xs transition-all cursor-pointer group select-none relative ${
                      isSelectionMode && isSelected
                        ? "border-[#0056f6] bg-blue-50/25 shadow-2xs"
                        : `border-slate-100 hover:bg-slate-50/40 ${dragStyle}`
                    } ${isDraggingAny ? "[&_*]:pointer-events-none" : ""}`}
                  >
                    {/* Absolute visual overlay for dropping inside a folder - clear solid colored boundaries with soft blue tint */}
                    {showInsideHighlight && (
                      <div className="absolute inset-0 border-2 border-[#0056f6] bg-[#0056f6]/8 rounded-lg pointer-events-none z-30 animate-pulse" />
                    )}

                  {/* Right Side: Blue Folder icon + Text (renders on right in RTL) */}
                  <div className="flex items-center gap-4 text-right">
                    {/* Checkbox for Selection Mode */}
                    {isSelectionMode && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFolderSelection(f.id);
                        }}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                          isSelected
                            ? "bg-[#0056f6] border-[#0056f6] text-white"
                            : "border-slate-300 hover:border-slate-400 bg-white"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                      </div>
                    )}

                    {/* Stylized Folder/Notebook Icon with a real folder tab shape */}
                    <div className="relative w-14 h-14 shrink-0">
                      {/* Folder Tab (always visible, indicating a folder/notebook) */}
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
                          backgroundColor: f.coverImage ? "#ffffff" : `${f.color || '#0056f6'}15`,
                          borderColor: f.color ? `${f.color}50` : "#e2e8f0",
                          borderWidth: "1.5px"
                        }}
                      >
                        {f.coverImage ? (
                          <>
                            {/* Main Cover Image (100% visible, no heavy badges blocking it) */}
                            <ImageWithSkeleton
                              src={f.coverImage}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover opacity-95 transition-all"
                              style={getSafeImageStyle(f.coverImagePosition)}
                              referrerPolicy="no-referrer"
                            />
                            {/* Soft faded black gradient covering the bottom 30% for badge contrast - very subtle (10% depth) */}
                            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/10 via-black/5 to-transparent pointer-events-none z-10" />
                            
                            {/* Notebook Binder Spine Overlay (very thin, styled perfectly, no heavy icons blocking the view) */}
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-1.5 shadow-xs flex flex-col justify-around py-1.5 items-center z-20"
                              style={{ backgroundColor: f.color || "#0056f6", filter: "brightness(0.9)" }}
                            >
                              <div className="w-0.5 h-0.5 bg-white/50 rounded-full" />
                              <div className="w-0.5 h-0.5 bg-white/50 rounded-full" />
                            </div>

                            {/* Ultra-light, high-contrast Folder Indicator Badge that doesn't block the cover image (only 14px size) */}
                            <div 
                              className="absolute left-1 bottom-1 bg-white/95 p-0.5 rounded-xs z-20 border border-slate-100 flex items-center justify-center"
                              style={{ 
                                borderColor: `${f.color || '#0056f6'}20`,
                                boxShadow: "0 2px 5px rgba(0,0,0,0.18), 0 0 3px rgba(255,255,255,0.7)"
                              }}
                            >
                              <Folder className="w-2.5 h-2.5 fill-current" style={{ color: f.color || '#0056f6' }} />
                            </div>
                          </>
                        ) : (
                          <>
                            <div 
                              className="absolute inset-0 transition-all duration-300 group-hover:brightness-105"
                              style={{
                                background: `linear-gradient(135deg, ${f.color || '#0056f6'}, ${f.color ? f.color + "dd" : "#0047cc"})`
                              }}
                            />
                            
                            {/* Notebook Binder Spine (RTL Book layout) representing a notebook/folder - only shown on solid folder layout */}
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-2 shadow-sm transition-all flex flex-col justify-around py-1.5 items-center z-10"
                              style={{ backgroundColor: f.color || "#0056f6", filter: "brightness(0.82)" }}
                            >
                              <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                              <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                              <div className="w-0.5 h-0.5 bg-black/25 rounded-full" />
                            </div>

                            {/* Small Folder Indicator Badge */}
                            <div 
                              className="absolute left-1 bottom-1 bg-white p-0.5 rounded-xs z-10 border shadow-xs flex items-center justify-center"
                              style={{ borderColor: `${f.color || '#0056f6'}15` }}
                            >
                              <Folder className="w-2.5 h-2.5 fill-current" style={{ color: f.color || '#0056f6' }} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Text block */}
                    <div>
                      <h4 className="font-bold text-[#202124] text-base group-hover:text-[#0056f6] transition-colors">
                        <HighlightText text={f.name} search={searchQuery} />
                      </h4>
                      <p className="text-xs text-[#5f6368] font-medium mt-1">
                        {fRecursiveCardCount} بطاقات • اليوم، ١٠:٣٠ ص
                      </p>
                    </div>
                  </div>

                  {/* Left Side: Metadata & Delete Action (renders on left in RTL) */}
                  {!isSelectionMode && (
                    <div className="flex items-center gap-3">

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditFolder(f);
                        }}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-outline hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
                        title="تعديل المجلد"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({
                            type: "folder",
                            id: f.id,
                            title: f.name
                          });
                        }}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-outline hover:text-error hover:bg-error-container/15 rounded-xl transition-all cursor-pointer"
                        title="حذف المجلد"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              );
            })}

            {/* Card list items */}
            {visibleCards.map((card) => {
              const cardFolder = folders.find((f) => f.id === card.folderId);
              const cardColor = cardFolder?.color || "#0056f6";
              const isSelected = selectedCardIds.includes(card.id);

              const isBeingDragged = card.id === draggedCardId;
              const isDragOverThis = card.id === dragOverCardId;
              
              let dragStyle = "";
              if (isBeingDragged) {
                dragStyle = "opacity-30 border-dashed border-[#0056f6] scale-98";
              }

              const showGapBefore = isDragOverThis && dragOverPosition === "before";
              const showGapAfter = isDragOverThis && dragOverPosition === "after";

              return (
                <div
                  key={card.id}
                  className="py-1.5 w-full relative"
                  onDragOver={(e) => handleCardDragOver(e, card.id)}
                  onDragLeave={handleCardDragLeave}
                  onDrop={(e) => handleCardDrop(e, card.id)}
                >
                  {/* Absolute Zero-layout-displacement GAP coloring */}
                  {showGapBefore && (
                    <div className="absolute top-0 inset-x-2 h-1.5 bg-[#0056f6]/20 rounded-full pointer-events-none z-20" />
                  )}
                  {showGapAfter && (
                    <div className="absolute bottom-0 inset-x-2 h-1.5 bg-[#0056f6]/20 rounded-full pointer-events-none z-20" />
                  )}

                  <div
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleCardSelection(card.id);
                      } else {
                        setPreviewCard(card);
                        setIsPreviewFlipped(false);
                      }
                    }}
                    draggable={!isSelectionMode}
                    onDragStart={(e) => handleCardDragStart(e, card.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-xs transition-all group cursor-pointer relative select-none ${
                      isSelectionMode && isSelected
                        ? "border-[#0056f6] bg-blue-50/25 shadow-2xs"
                        : `border-slate-100 hover:bg-slate-50/40 ${dragStyle}`
                    } ${isDraggingAny ? "[&_*]:pointer-events-none" : ""}`}
                  >
                  {/* Right Side: Card Icon + Text (renders on right in RTL) */}
                  <div className="flex items-center gap-4 text-right">
                    {/* Checkbox for Selection Mode */}
                    {isSelectionMode && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCardSelection(card.id);
                        }}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                          isSelected
                            ? "bg-[#0056f6] border-[#0056f6] text-white"
                            : "border-slate-300 hover:border-slate-400 bg-white"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                      </div>
                    )}

                    {/* Unified Card Icon: Physical Card Stack design (distinctive study card design, no side spine, no overlay blocking images) */}
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
                          borderColor: card.frontImage ? "rgba(192, 132, 252, 0.4)" : `${cardColor}30`, // Soft high-contrast purple border indicating flashcard
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
                            {/* Soft faded black gradient covering the bottom 30% for badge contrast - very subtle (10% depth) */}
                            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/10 via-black/5 to-transparent pointer-events-none z-10" />

                            {/* Ultra-light, high-contrast Card Indicator Badge that doesn't block the front image (only 14px size) */}
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
                              {/* Horizontal lines */}
                              <div className="h-0.5 w-[85%] bg-slate-100 rounded-full" />
                              <div className="h-0.5 w-[70%] bg-slate-100 rounded-full" />
                              <div className="h-0.5 w-[80%] bg-slate-100 rounded-full" />
                              {/* Red vertical margin line for index card look */}
                              <div className="absolute right-2 top-0 bottom-0 w-[1px] bg-rose-200" />
                            </div>

                            {/* Small Card Indicator Badge in Solid White with a Vivid Purple Icon for maximum contrast - ONLY when there is no cover image */}
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

                    {/* Text block */}
                    <div>
                      <h4 className="font-bold text-[#202124] text-base group-hover:text-[#0056f6] transition-colors">
                        <HighlightText text={card.frontText} search={searchQuery} />
                      </h4>
                      <p className="text-xs text-[#5f6368] font-medium mt-1 flex flex-wrap items-center gap-1.5">
                        {card.translationHint || card.backText ? (
                          <HighlightText text={card.translationHint || card.backText} search={searchQuery} />
                        ) : (
                          <span>بطاقة دراسة جاهزة للمراجعة</span>
                        )}
                        {card.isPluralMode && card.pluralText && (
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 shrink-0">
                            الجمع: <HighlightText text={card.pluralText} search={searchQuery} />
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Left Side: Actions (renders on left in RTL) */}
                  <div className="flex items-center gap-1.5">
                    {!isSelectionMode && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditCard(card);
                          }}
                          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-[#5f6368] hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
                          title="تعديل البطاقة"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete({
                              type: "card",
                              id: card.id,
                              title: card.frontText
                            });
                          }}
                          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-[#5f6368] hover:text-error hover:bg-error-container/15 rounded-xl transition-all cursor-pointer border border-transparent hover:border-error-container/10"
                          title="حذف البطاقة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              );
            })}

            {/* Show progressive loading indicator if some elements are hidden */}
            {displayedFolders.length + displayedCards.length > visibleCount && (
              <div className="text-center py-5 text-xs text-slate-400 font-bold bg-slate-50/50 rounded-2xl border border-dashed border-slate-200/50 mt-4 animate-pulse">
                جاري عرض {visibleCount} من أصل {displayedFolders.length + displayedCards.length} عنصر... مرر لأسفل لعرض المزيد ✨
              </div>
            )}

          </div>
        )}
      </div>

      {/* Confirmation Dialog overlay */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-outline-variant/30 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-3 text-error">
              <div className="w-10 h-10 rounded-full bg-error-container/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h4 className="text-base font-bold text-on-surface">تأكيد عملية الحذف</h4>
            </div>
            
            <p className="text-xs text-on-surface-variant leading-relaxed font-semibold">
              {confirmDelete.type === "folder" ? (
                <>
                  هل أنت متأكد تمامًا من حذف المجلد <span className="text-red-600 font-bold font-sans">"{confirmDelete.title}"</span>؟ سيتم حذف جميع البطاقات التعليمية التابعة له بشكل نهائي.
                </>
              ) : (
                <>
                  هل أنت متأكد من حذف البطاقة التعليمية <span className="text-red-600 font-bold font-sans">"{confirmDelete.title}"</span> بشكل نهائي من هذا المجلد؟
                </>
              )}
            </p>
            
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  if (confirmDelete.type === "folder") {
                    onDeleteFolder(confirmDelete.id);
                  } else {
                    onDeleteCard(confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                حذف نهائي
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 px-4 bg-slate-100 text-on-surface font-bold text-xs rounded-xl border border-outline-variant/20 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Flashcard Preview Modal Overlay */}
      {previewCard && (
        <div 
          onClick={() => setPreviewCard(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in text-right cursor-default"
          dir="rtl"
        >
          {/* Interactive Card Container */}
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm h-[520px] flex items-center justify-center"
          >
            <div
              onClick={() => setIsPreviewFlipped(!isPreviewFlipped)}
              className={`w-full h-full flip-card cursor-pointer select-none ${isPreviewFlipped ? "flipped" : ""}`}
            >
              <div className="w-full h-full relative flip-card-inner rounded-2xl shadow-2xl transition-all duration-300">
                
                {/* FRONT FACE */}
                <div className="absolute inset-0 w-full h-full flip-card-front rounded-2xl flex flex-col p-6 border border-slate-100 bg-white overflow-hidden justify-between">
                  {/* Top bar */}
                  <div className="flex justify-between items-center w-full">
                    <span 
                      className="text-[10px] font-extrabold px-3 py-1 rounded-full border text-slate-700 bg-slate-50"
                      style={{ borderColor: `${folders.find(f => f.id === previewCard.folderId)?.color || '#0056f6'}30` }}
                    >
                      {folders.find(f => f.id === previewCard.folderId)?.name || "بطاقة دراسة"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playPronunciation(previewCard.frontText, previewCard.frontLang);
                      }}
                      className="w-9 h-9 rounded-full bg-slate-50 text-slate-700 border border-slate-100 flex items-center justify-center hover:bg-[#0056f6]/10 hover:text-[#0056f6] transition-all cursor-pointer"
                      title="استمع للنطق"
                    >
                      <Volume2 className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  {/* Image/Visual if present */}
                  <div className="flex-1 flex flex-col items-center justify-center py-4">
                    {previewCard.frontImage ? (
                      <div className="w-full aspect-square rounded-xl overflow-hidden relative mb-4 border border-slate-100 flex items-center justify-center bg-slate-50 shrink-0">
                        <ImageWithSkeleton
                          src={previewCard.frontImage}
                          alt="Front Illustration"
                          className="absolute inset-0 w-full h-full object-cover"
                          style={getSafeImageStyle(previewCard.frontImagePosition)}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      // Classic lined index card background lines for clean academic feel if no image
                      <div className="w-full h-24 relative mb-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200/80 flex flex-col justify-center gap-2 p-3 overflow-hidden">
                        <div className="h-0.5 w-[85%] bg-slate-200/60 rounded-full" />
                        <div className="h-0.5 w-[65%] bg-slate-200/60 rounded-full" />
                        <div className="h-0.5 w-[75%] bg-slate-200/60 rounded-full" />
                        <div className="absolute right-3 top-0 bottom-0 w-[1px] bg-rose-200/60" />
                      </div>
                    )}

                    {/* Main Text & Translation Hint */}
                    <div className="text-center w-full px-2">
                      <h3 className="text-2xl font-extrabold text-[#202124] tracking-tight leading-snug break-words whitespace-pre-wrap" dir="ltr">
                        {previewCard.frontText}
                      </h3>
                      {previewCard.translationHint && (
                        <p className="text-xs font-bold text-[#5f6368] mt-2 bg-slate-50 py-1 px-2.5 rounded-lg inline-block border border-slate-100">
                          {previewCard.translationHint}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bottom bar */}
                  <div className="flex justify-between items-center w-full border-t border-slate-100 pt-3 text-slate-400 text-[10px] font-bold">
                    <span>مفهوم تعليمي</span>
                    <span>الوجه الأمامي</span>
                  </div>
                </div>

                {/* BACK FACE */}
                <div className="absolute inset-0 w-full h-full flip-card-back rounded-2xl flex flex-col p-6 border-2 border-[#0056f6]/20 bg-white overflow-hidden justify-between">
                  {/* Top bar */}
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-extrabold bg-[#0056f6]/10 text-[#0056f6] px-3 py-1 rounded-full">
                      {showPreviewPlural ? "صيغة الجمع" : "الإجابة / الترجمة"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (showPreviewPlural && previewCard.pluralText) {
                            playPronunciation(previewCard.pluralText, previewCard.pluralLang || "de");
                          } else {
                            playPronunciation(previewCard.backText, previewCard.backLang);
                          }
                        }}
                        className="w-9 h-9 rounded-full bg-[#0056f6]/5 text-[#0056f6] border border-[#0056f6]/10 flex items-center justify-center hover:bg-[#0056f6]/15 transition-all cursor-pointer"
                        title="استمع للنطق"
                      >
                        <Volume2 className="w-4.5 h-4.5" />
                      </button>

                      {/* Plural Toggle Button */}
                      {previewCard.isPluralMode && previewCard.pluralText && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextShow = !showPreviewPlural;
                            setShowPreviewPlural(nextShow);
                            if (nextShow) {
                              playPronunciation(previewCard.pluralText!, previewCard.pluralLang || "de");
                            } else {
                              playPronunciation(previewCard.backText, previewCard.backLang);
                            }
                          }}
                          className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                            showPreviewPlural 
                              ? "bg-purple-600 text-white border-purple-600 shadow-sm hover:bg-purple-700" 
                              : "bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100"
                          }`}
                          title={showPreviewPlural ? "العودة للترجمة" : "عرض صيغة الجمع للكلمة (+)"}
                        >
                          <Plus className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Image/Visual if present */}
                  <div className="flex-1 flex flex-col items-center justify-center py-4">
                    {previewCard.backImage && (
                      <div className="w-full aspect-square rounded-xl overflow-hidden relative mb-4 border border-slate-100 flex items-center justify-center bg-slate-50 shrink-0">
                        <ImageWithSkeleton
                          src={previewCard.backImage}
                          alt="Back Illustration"
                          className="absolute inset-0 w-full h-full object-cover"
                          style={getSafeImageStyle(previewCard.backImagePosition)}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {/* Main Back Text */}
                    <div className="text-center w-full px-2">
                      <h3 className="text-xl font-bold text-slate-900 leading-relaxed break-words whitespace-pre-wrap">
                        {showPreviewPlural && previewCard.pluralText ? (
                          <div className="flex flex-col items-center gap-1.5 animate-fadeIn">
                            <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full">صيغة الجمع (Plural)</span>
                            <span className="whitespace-pre-wrap font-extrabold text-purple-950">{previewCard.pluralText}</span>
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap">{previewCard.backText}</span>
                        )}
                      </h3>
                      {previewCard.correctArticle && (
                        <div className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 border border-purple-100 rounded-full font-bold text-xs">
                          <span>أداة التعريف:</span>
                          <span className="font-sans font-extrabold text-sm uppercase">{previewCard.correctArticle === "die-plural" ? "die" : previewCard.correctArticle}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom bar */}
                  <div className="flex justify-between items-center w-full border-t border-slate-100 pt-3 text-slate-400 text-[10px] font-bold">
                    <span />
                    <span>الوجه الخلفي</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Deletion Confirmation Overlay */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-outline-variant/30 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-3 text-error">
              <div className="w-10 h-10 rounded-full bg-error-container/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h4 className="text-base font-bold text-on-surface">تأكيد حذف العناصر المحددة</h4>
            </div>
            
            <p className="text-xs text-on-surface-variant leading-relaxed font-semibold">
              هل أنت متأكد من حذف {selectedFolderIds.length} مجلدات و {selectedCardIds.length} بطاقات دراسية بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء!
            </p>
            
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={handleBulkDeleteConfirm}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                حذف نهائي
              </button>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="flex-1 py-2 px-4 bg-slate-100 text-on-surface font-bold text-xs rounded-xl border border-outline-variant/20 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Download & Cache Modal */}
      {isAudioModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-100 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-right relative overflow-hidden">
            {/* Top Close Button */}
            <button
              onClick={() => {
                if (!isDownloadingAudio) setIsAudioModalOpen(false);
              }}
              disabled={isDownloadingAudio}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-all cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Title */}
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
                style={{ backgroundColor: folderColor }}
              >
                <Headphones className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 leading-tight">
                  تنزيل وتخزين الصوتيات مسبقاً
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  تخزين مقاطع النطق والصوت للبطاقات في الذاكرة للعمل بدون إنترنت
                </p>
              </div>
            </div>

            {/* Target Scope Badge */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-500">نطاق التنزيل:</span>
                <span className="font-black text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-3xs">
                  {activeFolder ? activeFolder.name : "المكتبة كاملة"}
                </span>
              </div>

              {(() => {
                const targetCards = getFolderCardsRecursive(activeFolderId);
                let totalAudioClips = 0;
                targetCards.forEach((c) => {
                  if (c.frontText?.trim()) totalAudioClips++;
                  if (c.backText?.trim()) totalAudioClips++;
                  if (c.isPluralMode && c.pluralText?.trim()) totalAudioClips++;
                });

                return (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/50">
                    <span className="font-bold text-slate-500">إجمالي العناصر الصوتية:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#0056f6] bg-blue-50 px-2 py-0.5 rounded-md">
                        {targetCards.length} بطاقات
                      </span>
                      <span className="font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                        {totalAudioClips} مقطع صوتي
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Progress Section */}
            {isDownloadingAudio && (
              <div className="space-y-2 bg-blue-50/60 p-4 rounded-2xl border border-blue-100">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-[#0056f6]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#0056f6]" />
                    جاري تنزيل وتخزين الصوتيات...
                  </span>
                  <span>{audioProgress.current} من {audioProgress.total}</span>
                </div>

                <div className="w-full bg-slate-200/70 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-[#0056f6] to-purple-600 h-full transition-all duration-300 rounded-full"
                    style={{ 
                      width: audioProgress.total > 0 
                        ? `${Math.round((audioProgress.current / audioProgress.total) * 100)}%` 
                        : "0%" 
                    }}
                  />
                </div>

                {audioProgress.currentItem && (
                  <p className="text-[11px] font-semibold text-slate-500 truncate pt-0.5">
                    الآن: <span className="text-slate-800 font-bold">{audioProgress.currentItem}</span>
                  </p>
                )}
              </div>
            )}

            {/* Success Message */}
            {audioDownloadedSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-emerald-900">
                    تم تنزيل وتخزين كافة الصوتيات بنجاح! 🎉
                  </h4>
                  <p className="text-[11px] font-semibold text-emerald-700 leading-relaxed">
                    جميع الملفات الصوتية محفوظة الآن في ذاكرة التخزين المحلية. يمكنك الاستماع للبطاقات فورياً وبدون اتصال بالإنترنت!
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleStartAudioDownload}
                disabled={isDownloadingAudio || getFolderCardsRecursive(activeFolderId).length === 0}
                className="w-full py-3 px-4 rounded-2xl font-black text-xs text-white shadow-md hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: folderColor }}
              >
                {isDownloadingAudio ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري المعالجة والتخزين ({audioProgress.current}/{audioProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    <span>تنزيل وتخزين كافة الصوتيات فوراً 🎧</span>
                  </>
                )}
              </button>

              {/* Individual / MP3 Download List */}
              {getFolderCardsRecursive(activeFolderId).length > 0 && !isDownloadingAudio && (
                <div className="pt-2 border-t border-slate-100 max-h-48 overflow-y-auto pr-1 space-y-1.5 text-xs">
                  <p className="text-[11px] font-bold text-slate-500 mb-2">تنزيل مقاطع الصوت كملفات MP3 مباشرة للجهاز:</p>
                  {getFolderCardsRecursive(activeFolderId).slice(0, 15).map((card) => {
                    const fLang = card.frontLang || activeFolder?.frontLang || "de";
                    const bLang = card.backLang || activeFolder?.backLang || "ar";
                    return (
                      <div key={`dl-${card.id}`} className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 rounded-xl transition-all">
                        <span className="font-bold text-slate-700 truncate max-w-[220px]" title={card.frontText}>
                          {card.frontText}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleDownloadMp3Single(card.frontText, fLang, card.frontText)}
                            className="px-2 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-[#0056f6] border border-slate-200/80 rounded-lg font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                            title="تنزيل الوجه MP3"
                          >
                            <Download className="w-3 h-3" />
                            <span>وجه ({fLang.toUpperCase()})</span>
                          </button>
                          <button
                            onClick={() => handleDownloadMp3Single(card.backText, bLang, card.backText)}
                            className="px-2 py-1 bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200/80 rounded-lg font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                            title="تنزيل الظهر MP3"
                          >
                            <Download className="w-3 h-3" />
                            <span>ظهر ({bLang.toUpperCase()})</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {getFolderCardsRecursive(activeFolderId).length > 15 && (
                    <p className="text-[10px] text-slate-400 font-semibold text-center pt-1">
                      وأكثر من {getFolderCardsRecursive(activeFolderId).length - 15} بطاقة أخرى... (استخدم زر "تنزيل وتخزين كافة الصوتيات فوراً" في الأعلى لتخزين كل الصوتيات بضغطة واحدة).
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => setIsAudioModalOpen(false)}
                disabled={isDownloadingAudio}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer disabled:opacity-40"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Download & Cache Modal */}
      {isImageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-100 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-right relative overflow-hidden">
            {/* Top Close Button */}
            <button
              onClick={() => {
                if (!isDownloadingImages) setIsImageModalOpen(false);
              }}
              disabled={isDownloadingImages}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-all cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Title */}
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 bg-emerald-600"
              >
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
                  {activeFolder ? activeFolder.name : "المكتبة كاملة"}
                </span>
              </div>

              {/* Checkbox for 10 Auto Images Option */}
              <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-xl border border-emerald-100 cursor-pointer hover:bg-emerald-50/40 transition-all select-none">
                <input
                  type="checkbox"
                  checked={includeAuto10Images}
                  onChange={(e) => setIncludeAuto10Images(e.target.checked)}
                  disabled={isDownloadingImages}
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
                const targetCards = getFolderCardsRecursive(activeFolderId);
                let primaryImages = 0;
                let cardsWithImages = 0;
                if (activeFolder?.coverImage) primaryImages++;

                targetCards.forEach((c) => {
                  let hasImg = false;
                  if (c.frontImage?.trim()) { primaryImages++; hasImg = true; }
                  if (c.backImage?.trim()) { primaryImages++; hasImg = true; }
                  if (hasImg) cardsWithImages++;
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
            {isDownloadingImages && (
              <div className="space-y-2 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    جاري تنزيل وتخزين الصور...
                  </span>
                  <span>{imageProgress.current} من {imageProgress.total}</span>
                </div>

                <div className="w-full bg-slate-200/70 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full transition-all duration-300 rounded-full"
                    style={{ 
                      width: imageProgress.total > 0 
                        ? `${Math.round((imageProgress.current / imageProgress.total) * 100)}%` 
                        : "0%" 
                    }}
                  />
                </div>

                {imageProgress.currentItem && (
                  <div className="flex items-center gap-2 pt-1">
                    {imageProgress.currentPreview && (
                      <img 
                        src={imageProgress.currentPreview} 
                        alt="preview" 
                        className="w-8 h-8 rounded-lg object-cover border border-emerald-200 shrink-0" 
                      />
                    )}
                    <p className="text-[11px] font-semibold text-slate-500 truncate">
                      الآن: <span className="text-slate-800 font-bold">{imageProgress.currentItem}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Success Message */}
            {imageDownloadedSuccess && (
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

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleStartImageDownload}
                disabled={isDownloadingImages || (() => {
                  const targetCards = getFolderCardsRecursive(activeFolderId);
                  let totalImgs = activeFolder?.coverImage ? 1 : 0;
                  targetCards.forEach(c => { if (c.frontImage) totalImgs++; if (c.backImage) totalImgs++; });
                  return totalImgs === 0;
                })()}
                className="w-full py-3 px-4 rounded-2xl font-black text-xs text-white shadow-md hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloadingImages ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التخزين ({imageProgress.current}/{imageProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    <span>تنزيل وتخزين كافة الصور فوراً 🖼️</span>
                  </>
                )}
              </button>

              {/* Individual Image Download List */}
              {getFolderCardsRecursive(activeFolderId).filter(c => c.frontImage || c.backImage).length > 0 && !isDownloadingImages && (
                <div className="pt-2 border-t border-slate-100 max-h-48 overflow-y-auto pr-1 space-y-1.5 text-xs">
                  <p className="text-[11px] font-bold text-slate-500 mb-2">تنزيل صور البطاقات للجهاز مباشرة:</p>
                  {getFolderCardsRecursive(activeFolderId)
                    .filter(c => c.frontImage || c.backImage)
                    .slice(0, 15)
                    .map((card) => {
                      return (
                        <div key={`img-dl-${card.id}`} className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100/80 rounded-xl transition-all">
                          <div className="flex items-center gap-2 truncate max-w-[200px]">
                            {card.frontImage && (
                              <img src={card.frontImage} alt="" className="w-7 h-7 rounded-md object-cover border border-slate-200 shrink-0" />
                            )}
                            <span className="font-bold text-slate-700 truncate" title={card.frontText}>
                              {card.frontText || card.backText}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {card.frontImage && (
                              <button
                                onClick={() => handleDownloadSingleImageFile(card.frontImage!, card.frontText || "front-image")}
                                className="px-2 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 rounded-lg font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                                title="تنزيل صورة الوجه"
                              >
                                <Download className="w-3 h-3" />
                                <span>الوجه</span>
                              </button>
                            )}
                            {card.backImage && (
                              <button
                                onClick={() => handleDownloadSingleImageFile(card.backImage!, card.backText || "back-image")}
                                className="px-2 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 rounded-lg font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                                title="تنزيل صورة الظهر"
                              >
                                <Download className="w-3 h-3" />
                                <span>الظهر</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              <button
                onClick={() => setIsImageModalOpen(false)}
                disabled={isDownloadingImages}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer disabled:opacity-40"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
