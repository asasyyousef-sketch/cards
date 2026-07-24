import { useState, useEffect, useMemo, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Explorer } from "./components/Explorer";
import { AIWorkspace, AIFolder, AICard } from "./components/AIWorkspace";
import { RecycleBin } from "./components/RecycleBin";
import { YoutubeWorkspace } from "./components/YoutubeWorkspace";
import {
  CreateFolderModal,
  AddCardModal,
  ImagePickerModal,
  ReviewSetupModal,
  SettingsModal,
  EditFolderModal,
  EditCardModal
} from "./components/Modals";
import { ReviewSession } from "./components/ReviewSession";
import { Folder, Flashcard, ReviewMethod, DbStatus, TranscriptDocument } from "./types";

export default function App() {
  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const cached = localStorage.getItem("cached_folders");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [cards, setCards] = useState<Flashcard[]>(() => {
    try {
      const cached = localStorage.getItem("cached_cards");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [activeFolderId, setActiveFolderId] = useState<string>(() => {
    try {
      return localStorage.getItem("active_folder_id") || "";
    } catch {
      return "";
    }
  });

  // Track and save activeFolderId to localStorage for seamless refresh persistence
  useEffect(() => {
    try {
      localStorage.setItem("active_folder_id", activeFolderId);
    } catch (e) {
      console.error("Failed to save active_folder_id to localStorage:", e);
    }
  }, [activeFolderId]);

  const [hasFetched, setHasFetched] = useState(false);

  // Automatically return to the root Library if the current active folder has been deleted (e.g., from another device)
  useEffect(() => {
    if (activeFolderId && hasFetched) {
      const folderExists = folders.some((f) => f.id === activeFolderId);
      if (!folderExists) {
        setActiveFolderId("");
      }
    }
  }, [activeFolderId, folders, hasFetched]);

  const [searchQuery, setSearchQuery] = useState<string>("");

  // DB Sync Status state
  const [dbStatus, setDbStatus] = useState<DbStatus>({
    supabaseActive: false,
    tablesExist: false,
    error: null
  });

  // Modals state
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [isReviewSetupOpen, setIsReviewSetupOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  
  // Image picker callback channel
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [imagePickerCallback, setImagePickerCallback] = useState<((url: string) => void) | null>(null);
  const [imagePickerInitialQuery, setImagePickerInitialQuery] = useState("");

  // Active review session state
  const [activeReview, setActiveReview] = useState<{
    method: ReviewMethod;
    cards: Flashcard[];
    chainMethods?: ReviewMethod[];
    chainIndex?: number;
  } | null>(null);

  // Mobile sidebar visibility state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Tab navigation view state: "library" or "ai" or "trash" or "youtube"
  const [viewMode, setViewMode] = useState<"library" | "ai" | "trash" | "youtube">("library");

  // YouTube transcripts (spT) state
  const [transcripts, setTranscripts] = useState<TranscriptDocument[]>(() => {
    try {
      const cached = localStorage.getItem("cached_transcripts");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Selected transcript Lego piece when navigating to AI Workspace
  const [initialSelectedTranscriptId, setInitialSelectedTranscriptId] = useState<string | null>(null);

  // Recycle Bin / Trash states
  const [trashFolders, setTrashFolders] = useState<Folder[]>(() => {
    try {
      const saved = localStorage.getItem("trash_folders");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [trashCards, setTrashCards] = useState<Flashcard[]>(() => {
    try {
      const saved = localStorage.getItem("trash_cards");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [trashAiFolders, setTrashAiFolders] = useState<AIFolder[]>(() => {
    try {
      const saved = localStorage.getItem("trash_ai_folders");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [trashAiCards, setTrashAiCards] = useState<AICard[]>(() => {
    try {
      const saved = localStorage.getItem("trash_ai_cards");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync Trash states to localStorage
  useEffect(() => {
    localStorage.setItem("trash_folders", JSON.stringify(trashFolders));
  }, [trashFolders]);

  useEffect(() => {
    localStorage.setItem("trash_cards", JSON.stringify(trashCards));
  }, [trashCards]);

  useEffect(() => {
    localStorage.setItem("trash_ai_folders", JSON.stringify(trashAiFolders));
  }, [trashAiFolders]);

  useEffect(() => {
    localStorage.setItem("trash_ai_cards", JSON.stringify(trashAiCards));
  }, [trashAiCards]);

  // AI Refinement of an existing library folder
  const [aiRefineFolderId, setAiRefineFolderId] = useState<string | null>(null);

  // Apply persistent UI Scale / Zoom on mount
  useEffect(() => {
    const savedScale = localStorage.getItem("settings_site_scale");
    if (savedScale) {
      const scaleVal = parseInt(savedScale, 10);
      if (!isNaN(scaleVal)) {
        const baseFontSize = 12.65;
        document.documentElement.style.fontSize = `${baseFontSize * (scaleVal / 100)}px`;
      }
    }
  }, []);

  // Fetch initial database items from Express Node backend
  useEffect(() => {
    fetch("/api/data")
      .then((res) => {
        if (!res.ok) throw new Error("Server database error");
        return res.json();
      })
      .then((data) => {
        if (data.folders) {
          setFolders(data.folders);
          try {
            localStorage.setItem("cached_folders", JSON.stringify(data.folders));
          } catch (e) {
            console.error(e);
          }
        }
        if (data.cards) {
          setCards(data.cards);
          try {
            localStorage.setItem("cached_cards", JSON.stringify(data.cards));
          } catch (e) {
            console.error(e);
          }
        }
        if (data.transcripts) {
          setTranscripts(data.transcripts);
          try {
            localStorage.setItem("cached_transcripts", JSON.stringify(data.transcripts));
          } catch (e) {
            console.error(e);
          }
        }
        if (data.dbStatus) setDbStatus(data.dbStatus);
        setHasFetched(true);
      })
      .catch((err) => {
        console.error("Failed to load initial workspace data. Running with seeded memory database.", err);
        setHasFetched(true);
      });
  }, []);

  // Sync state modifications directly to disk
  const persistDB = (updatedFolders: Folder[], updatedCards: Flashcard[]) => {
    // Save to local cache immediately to ensure zero-latency interface updates
    try {
      localStorage.setItem("cached_folders", JSON.stringify(updatedFolders));
      localStorage.setItem("cached_cards", JSON.stringify(updatedCards));
    } catch (e) {
      console.error("Failed to write local cache:", e);
    }

    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folders: updatedFolders, cards: updatedCards, transcripts })
    })
      .then((res) => {
        if (!res.ok) throw new Error("Server save error");
        return res.json();
      })
      .then((data) => {
        if (data.dbStatus) setDbStatus(data.dbStatus);
      })
      .catch((err) => {
        console.error("Failed to commit database transaction:", err);
      });
  };

  // Helper to persist only transcripts
  const persistTranscripts = (updatedTranscripts: TranscriptDocument[]) => {
    try {
      localStorage.setItem("cached_transcripts", JSON.stringify(updatedTranscripts));
    } catch (e) {
      console.error("Failed to write local transcripts cache:", e);
    }

    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folders, cards, transcripts: updatedTranscripts })
    })
      .then((res) => {
        if (!res.ok) throw new Error("Server save error");
        return res.json();
      })
      .then((data) => {
        if (data.dbStatus) setDbStatus(data.dbStatus);
      })
      .catch((err) => {
        console.error("Failed to commit database transaction:", err);
      });
  };

  // Create folder action handler
  const handleCreateFolder = (folderData: Omit<Folder, "id" | "createdAt" | "updatedAt">) => {
    const newFolder: Folder = {
      ...folderData,
      parentId: activeFolderId || undefined,
      id: `folder-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [newFolder, ...folders];
    setFolders(updated);
    persistDB(updated, cards);
  };

  // Reorder and sort persistence handlers
  const handleReorderFolders = (newFolders: Folder[]) => {
    setFolders(newFolders);
    persistDB(newFolders, cards);
  };

  const handleReorderCards = (newCards: Flashcard[]) => {
    setCards(newCards);
    persistDB(folders, newCards);
  };

  // Add card action handler
  const handleAddCard = (cardData: Omit<Flashcard, "id" | "createdAt">) => {
    const newCard: Flashcard = {
      ...cardData,
      id: `card-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    const updated = [newCard, ...cards];
    setCards(updated);
    persistDB(folders, updated);
  };

  // Delete folder action handler - moves folders and all nested cards to trash
  const handleDeleteFolder = (id: string) => {
    const idsToDelete = new Set<string>([id]);
    
    // Find all descendants of folder with id recursively
    const findDescendants = (parentId: string) => {
      folders.forEach((f) => {
        if (f.parentId === parentId && !idsToDelete.has(f.id)) {
          idsToDelete.add(f.id);
          findDescendants(f.id);
        }
      });
    };
    findDescendants(id);

    const deletedFoldersList = folders.filter((f) => idsToDelete.has(f.id));
    const deletedCardsList = cards.filter((c) => idsToDelete.has(c.folderId));

    setTrashFolders((prev) => [...prev, ...deletedFoldersList]);
    setTrashCards((prev) => [...prev, ...deletedCardsList]);

    const filteredFolders = folders.filter((f) => !idsToDelete.has(f.id));
    const filteredCards = cards.filter((c) => !idsToDelete.has(c.folderId));
    
    setFolders(filteredFolders);
    setCards(filteredCards);
    if (idsToDelete.has(activeFolderId)) {
      setActiveFolderId("");
    }
    persistDB(filteredFolders, filteredCards);
  };

  // Delete card action handler - moves single card to trash
  const handleDeleteCard = (id: string) => {
    const cardToDelete = cards.find((c) => c.id === id);
    if (cardToDelete) {
      setTrashCards((prev) => [...prev, cardToDelete]);
    }
    const filteredCards = cards.filter((c) => c.id !== id);
    setCards(filteredCards);
    persistDB(folders, filteredCards);

    // Propagate changes to the active review session cards snapshot
    if (activeReview) {
      setActiveReview((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          cards: prev.cards.filter((c) => c.id !== id)
        };
      });
    }
  };

  // Trash callbacks from AI Assistant Workspace
  const handleTrashAiFolder = (folder: AIFolder, folderCardsList: AICard[]) => {
    setTrashAiFolders((prev) => [folder, ...prev]);
    setTrashAiCards((prev) => [...folderCardsList, ...prev]);
  };

  const handleTrashAiCard = (card: AICard) => {
    setTrashAiCards((prev) => [card, ...prev]);
  };

  const handleTrashAiCards = (cardsList: AICard[]) => {
    setTrashAiCards((prev) => [...cardsList, ...prev]);
  };

  // Restore Handlers for library and AI assistant
  const handleRestoreFolder = (folderId: string) => {
    const idsToRestore = new Set<string>([folderId]);
    const findDescendantsInTrash = (parentId: string) => {
      trashFolders.forEach((f) => {
        if (f.parentId === parentId && !idsToRestore.has(f.id)) {
          idsToRestore.add(f.id);
          findDescendantsInTrash(f.id);
        }
      });
    };
    findDescendantsInTrash(folderId);

    const findParentsInTrash = (childId: string) => {
      const child = trashFolders.find(f => f.id === childId);
      if (child && child.parentId) {
        const parent = trashFolders.find(f => f.id === child.parentId);
        if (parent && !idsToRestore.has(parent.id)) {
          idsToRestore.add(parent.id);
          findParentsInTrash(parent.id);
        }
      }
    };
    findParentsInTrash(folderId);

    const restoredFolders = trashFolders.filter((f) => idsToRestore.has(f.id));
    const restoredCards = trashCards.filter((c) => idsToRestore.has(c.folderId));

    const nextFolders = [...folders, ...restoredFolders];
    const nextCards = [...cards, ...restoredCards];

    setFolders(nextFolders);
    setCards(nextCards);

    setTrashFolders((prev) => prev.filter((f) => !idsToRestore.has(f.id)));
    setTrashCards((prev) => prev.filter((c) => !idsToRestore.has(c.folderId)));

    persistDB(nextFolders, nextCards);
  };

  const handleRestoreCard = (cardId: string) => {
    const cardToRestore = trashCards.find((c) => c.id === cardId);
    if (!cardToRestore) return;

    const isFolderInTrash = trashFolders.some((f) => f.id === cardToRestore.folderId);
    let nextFolders = [...folders];
    let nextTrashFolders = [...trashFolders];

    if (isFolderInTrash) {
      const idsToRestore = new Set<string>([cardToRestore.folderId]);
      const findParentsInTrash = (childId: string) => {
        const child = trashFolders.find(f => f.id === childId);
        if (child && child.parentId) {
          const parent = trashFolders.find(f => f.id === child.parentId);
          if (parent && !idsToRestore.has(parent.id)) {
            idsToRestore.add(parent.id);
            findParentsInTrash(parent.id);
          }
        }
      };
      findParentsInTrash(cardToRestore.folderId);

      const restoredFolders = trashFolders.filter((f) => idsToRestore.has(f.id));
      nextFolders = [...folders, ...restoredFolders];
      nextTrashFolders = trashFolders.filter((f) => !idsToRestore.has(f.id));
      
      setFolders(nextFolders);
      setTrashFolders(nextTrashFolders);
    }

    const nextCards = [...cards, cardToRestore];
    setCards(nextCards);
    setTrashCards((prev) => prev.filter((c) => c.id !== cardId));

    persistDB(nextFolders, nextCards);
  };

  const handleRestoreAiFolder = (folderId: string) => {
    const folderToRestore = trashAiFolders.find((f) => f.id === folderId);
    if (!folderToRestore) return;

    const restoredCards = trashAiCards.filter((c) => c.folderId === folderId);

    let currentAiFolders: AIFolder[] = [];
    let currentAiCards: AICard[] = [];
    try {
      currentAiFolders = JSON.parse(localStorage.getItem("ai_workspace_folders") || "[]");
      currentAiCards = JSON.parse(localStorage.getItem("ai_workspace_cards") || "[]");
    } catch (e) {
      console.error(e);
    }

    // Restore to main list if not there
    if (!currentAiFolders.some((f) => f.id === folderId)) {
      currentAiFolders = [folderToRestore, ...currentAiFolders];
    }
    restoredCards.forEach((rc) => {
      if (!currentAiCards.some((c) => c.id === rc.id)) {
        currentAiCards.push(rc);
      }
    });

    localStorage.setItem("ai_workspace_folders", JSON.stringify(currentAiFolders));
    localStorage.setItem("ai_workspace_cards", JSON.stringify(currentAiCards));

    setTrashAiFolders((prev) => prev.filter((f) => f.id !== folderId));
    setTrashAiCards((prev) => prev.filter((c) => c.folderId !== folderId));
  };

  const handleRestoreAiCard = (cardId: string) => {
    const cardToRestore = trashAiCards.find((c) => c.id === cardId);
    if (!cardToRestore) return;

    const isFolderInTrash = trashAiFolders.some((f) => f.id === cardToRestore.folderId);
    let nextAiFolders: AIFolder[] = [];
    try {
      nextAiFolders = JSON.parse(localStorage.getItem("ai_workspace_folders") || "[]");
    } catch (e) {
      console.error(e);
    }

    if (isFolderInTrash) {
      const folderToRestore = trashAiFolders.find((f) => f.id === cardToRestore.folderId);
      if (folderToRestore && !nextAiFolders.some((f) => f.id === folderToRestore.id)) {
        nextAiFolders = [folderToRestore, ...nextAiFolders];
        localStorage.setItem("ai_workspace_folders", JSON.stringify(nextAiFolders));
        setTrashAiFolders((prev) => prev.filter((f) => f.id !== cardToRestore.folderId));
      }
    }

    let nextAiCards: AICard[] = [];
    try {
      nextAiCards = JSON.parse(localStorage.getItem("ai_workspace_cards") || "[]");
    } catch (e) {
      console.error(e);
    }
    if (!nextAiCards.some((c) => c.id === cardId)) {
      nextAiCards = [cardToRestore, ...nextAiCards];
    }
    localStorage.setItem("ai_workspace_cards", JSON.stringify(nextAiCards));

    setTrashAiCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  // Permanent Delete Handlers (Erase completely)
  const handleDeletePermanentlyFolder = (folderId: string) => {
    setTrashFolders((prev) => prev.filter((f) => f.id !== folderId));
    setTrashCards((prev) => prev.filter((c) => c.folderId !== folderId));
  };

  const handleDeletePermanentlyCard = (cardId: string) => {
    setTrashCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleDeletePermanentlyAiFolder = (folderId: string) => {
    setTrashAiFolders((prev) => prev.filter((f) => f.id !== folderId));
    setTrashAiCards((prev) => prev.filter((c) => c.folderId !== folderId));
  };

  const handleDeletePermanentlyAiCard = (cardId: string) => {
    setTrashAiCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleEmptyTrash = () => {
    setTrashFolders([]);
    setTrashCards([]);
    setTrashAiFolders([]);
    setTrashAiCards([]);
  };

  // Edit folder action handler
  const handleEditFolder = (id: string, folderData: Omit<Folder, "id" | "createdAt" | "updatedAt">) => {
    const updatedFolders = folders.map((f) => {
      if (f.id === id) {
        return {
          ...f,
          ...folderData,
          updatedAt: new Date().toISOString()
        };
      }
      return f;
    });
    setFolders(updatedFolders);
    persistDB(updatedFolders, cards);
  };

  // Edit card action handler
  const handleEditCard = (id: string, cardData: Omit<Flashcard, "id" | "createdAt">) => {
    const updatedCards = cards.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          ...cardData
        };
      }
      return c;
    });
    setCards(updatedCards);
    persistDB(folders, updatedCards);

    // Propagate changes to the active review session cards snapshot
    if (activeReview) {
      setActiveReview((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          cards: prev.cards.map((c) => {
            if (c.id === id) {
              return {
                ...c,
                ...cardData
              };
            }
            return c;
          })
        };
      });
    }
  };

  // Update study progress and streaks
  const handleUpdateStreak = (cardId: string, correct: boolean) => {
    const updatedCards = cards.map((c) => {
      if (c.id === cardId) {
        return {
          ...c,
          streak: correct ? (c.streak || 0) + 1 : 0
        };
      }
      return c;
    });
    setCards(updatedCards);
    persistDB(folders, updatedCards);
  };

  // Bulk delete action handler - directs selected items to trash
  const handleBulkDelete = (folderIds: string[], cardIds: string[]) => {
    const idsToDelete = new Set<string>(folderIds);
    
    // Find all descendants recursively
    const findDescendants = (parentId: string) => {
      folders.forEach((f) => {
        if (f.parentId === parentId && !idsToDelete.has(f.id)) {
          idsToDelete.add(f.id);
          findDescendants(f.id);
        }
      });
    };
    folderIds.forEach(id => findDescendants(id));

    const deletedFoldersList = folders.filter((f) => idsToDelete.has(f.id));
    const deletedCardsList = cards.filter((c) => idsToDelete.has(c.folderId) || cardIds.includes(c.id));

    setTrashFolders((prev) => [...prev, ...deletedFoldersList]);
    setTrashCards((prev) => [...prev, ...deletedCardsList]);

    const filteredFolders = folders.filter((f) => !idsToDelete.has(f.id));
    const filteredCards = cards.filter((c) => !idsToDelete.has(c.folderId) && !cardIds.includes(c.id));
    
    setFolders(filteredFolders);
    setCards(filteredCards);
    if (idsToDelete.has(activeFolderId)) {
      setActiveFolderId("");
    }
    persistDB(filteredFolders, filteredCards);
  };

  // Bulk move action handler (cut-paste)
  const handleBulkMove = (folderIds: string[], cardIds: string[], destFolderId: string | null) => {
    const updatedFolders = folders.map((f) => {
      if (folderIds.includes(f.id)) {
        return {
          ...f,
          parentId: destFolderId || undefined,
          updatedAt: new Date().toISOString()
        };
      }
      return f;
    });

    const updatedCards = cards.map((c) => {
      if (cardIds.includes(c.id)) {
        return {
          ...c,
          folderId: destFolderId || ""
        };
      }
      return c;
    });

    setFolders(updatedFolders);
    setCards(updatedCards);
    persistDB(updatedFolders, updatedCards);
  };

  // Bulk copy action handler (copy-paste)
  const handleBulkCopy = (folderIds: string[], cardIds: string[], destFolderId: string | null) => {
    const newFoldersList = [...folders];
    const newCardsList = [...cards];
    
    // Map to keep track of oldFolderId -> newFolderId to correctly preserve parent/child hierarchy on copy
    const folderIdMapping: Record<string, string> = {};

    // First clone the explicitly copied folders, and then clone their children recursively
    const cloneFolderWithChildren = (oldFolderId: string, targetParentId: string | undefined) => {
      const folderToClone = folders.find(f => f.id === oldFolderId);
      if (!folderToClone) return;

      const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      folderIdMapping[oldFolderId] = newFolderId;

      const clonedFolder: Folder = {
        ...folderToClone,
        id: newFolderId,
        parentId: targetParentId,
        name: folderToClone.parentId === targetParentId ? `${folderToClone.name} - نسخة` : folderToClone.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      newFoldersList.push(clonedFolder);

      // Clone direct cards under this folder
      const cardsInFolder = cards.filter(c => c.folderId === oldFolderId);
      cardsInFolder.forEach(c => {
        const clonedCard: Flashcard = {
          ...c,
          id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          folderId: newFolderId,
          createdAt: new Date().toISOString()
        };
        newCardsList.push(clonedCard);
      });

      // Clone subfolders recursively
      const subfolders = folders.filter(f => f.parentId === oldFolderId);
      subfolders.forEach(sf => {
        cloneFolderWithChildren(sf.id, newFolderId);
      });
    };

    // 1. Process explicit folders
    folderIds.forEach(id => {
      cloneFolderWithChildren(id, destFolderId || undefined);
    });

    // 2. Process explicit cards that are copied directly
    cardIds.forEach(id => {
      const cardToClone = cards.find(c => c.id === id);
      if (cardToClone) {
        const clonedCard: Flashcard = {
          ...cardToClone,
          id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          folderId: destFolderId || "",
          createdAt: new Date().toISOString()
        };
        newCardsList.push(clonedCard);
      }
    });

    setFolders(newFoldersList);
    setCards(newCardsList);
    persistDB(newFoldersList, newCardsList);
  };

  // Open general image picker
  const handleOpenImageSearch = (onSelect: (url: string) => void, initialQuery?: string) => {
    setImagePickerCallback(() => onSelect);
    setImagePickerInitialQuery(initialQuery || "");
    setIsImagePickerOpen(true);
  };

  // Trigger select image from picker
  const handleSelectImage = (url: string) => {
    if (imagePickerCallback) {
      imagePickerCallback(url);
    }
    setIsImagePickerOpen(false);
    setImagePickerCallback(null);
  };



  const handleStartReviewSession = (
    method: ReviewMethod,
    selectedCards: Flashcard[],
    chainMethods?: ReviewMethod[],
    chainIndex?: number
  ) => {
    setActiveReview({ method, cards: selectedCards, chainMethods, chainIndex });
  };

  const handleImportGenerated = (
    generatedFolder: Omit<Folder, "id" | "createdAt" | "updatedAt"> | null,
    generatedCards: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak">[],
    targetFolderId: string | null
  ) => {
    let finalFolderId = targetFolderId || "";
    let updatedFolders = [...folders];
    
    if (generatedFolder) {
      const newFolderId = `folder-${Date.now()}`;
      finalFolderId = newFolderId;
      const newFolder: Folder = {
        ...generatedFolder,
        id: newFolderId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      updatedFolders = [newFolder, ...folders];
    }

    const newCards: Flashcard[] = generatedCards.map((c: any, idx) => {
      const newCardId = `card-${Date.now()}-${idx}`;
      const candidates = c.autoImageCandidates || (c.oldCardId ? (() => {
        try {
          const raw = localStorage.getItem(`auto_images_${c.oldCardId}`);
          return raw ? JSON.parse(raw) : undefined;
        } catch { return undefined; }
      })() : undefined);

      if (candidates && Array.isArray(candidates) && candidates.length > 0) {
        try {
          localStorage.setItem(`auto_images_${newCardId}`, JSON.stringify(candidates));
        } catch (e) {}
      }

      return {
        ...c,
        id: newCardId,
        folderId: finalFolderId,
        createdAt: new Date().toISOString(),
        streak: 0,
        autoImageCandidates: candidates
      };
    });

    const updatedCards = [...newCards, ...cards];

    setFolders(updatedFolders);
    setCards(updatedCards);
    persistDB(updatedFolders, updatedCards);

    setActiveFolderId(finalFolderId);
    setViewMode("library");
  };

  const handleSaveRefinedFolder = (
    folderId: string,
    updatedFolder: { name: string; description?: string; color: string; coverImage?: string; coverImagePosition?: string },
    updatedCards: Omit<Flashcard, "id" | "folderId" | "createdAt" | "streak">[]
  ) => {
    const updatedFolders = folders.map(f => {
      if (f.id === folderId) {
        return {
          ...f,
          name: updatedFolder.name,
          description: updatedFolder.description,
          color: updatedFolder.color,
          coverImage: updatedFolder.coverImage,
          coverImagePosition: updatedFolder.coverImagePosition,
          updatedAt: new Date().toISOString()
        };
      }
      return f;
    });

    const otherCards = cards.filter(c => c.folderId !== folderId);
    const newCards: Flashcard[] = updatedCards.map((c: any, idx) => {
      const newCardId = c.id || `card-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
      const candidates = c.autoImageCandidates || (c.oldCardId ? (() => {
        try {
          const raw = localStorage.getItem(`auto_images_${c.oldCardId}`);
          return raw ? JSON.parse(raw) : undefined;
        } catch { return undefined; }
      })() : undefined);

      if (candidates && Array.isArray(candidates) && candidates.length > 0) {
        try {
          localStorage.setItem(`auto_images_${newCardId}`, JSON.stringify(candidates));
        } catch (e) {}
      }

      return {
        ...c,
        id: newCardId,
        folderId: folderId,
        createdAt: c.createdAt || new Date().toISOString(),
        streak: c.streak || 0,
        autoImageCandidates: candidates
      };
    });

    const finalCards = [...otherCards, ...newCards];

    setFolders(updatedFolders);
    setCards(finalCards);
    persistDB(updatedFolders, finalCards);

    setAiRefineFolderId(null);
    setActiveFolderId(folderId);
    setViewMode("library");
  };

  const handleSelectFolder = useCallback((id: string) => {
    setActiveFolderId(id);
    setViewMode("library");
  }, []);

  const handleHomeClick = useCallback(() => {
    setActiveFolderId("");
    setViewMode("library");
  }, []);

  const handleSettingsClick = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  const handleSelectAI = useCallback(() => {
    setViewMode("ai");
  }, []);

  const handleSelectTrash = useCallback(() => {
    setViewMode("trash");
  }, []);

  const handleSelectYoutube = useCallback(() => {
    setViewMode("youtube");
  }, []);

  const handleDataReloaded = useCallback((newFolders: Folder[], newCards: Flashcard[]) => {
    setFolders(newFolders);
    setCards(newCards);
    try {
      localStorage.setItem("cached_folders", JSON.stringify(newFolders));
      localStorage.setItem("cached_cards", JSON.stringify(newCards));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleAiBackToLibrary = useCallback(() => {
    setAiRefineFolderId(null);
    setViewMode("library");
  }, []);

  const handleClearAiRefineFolderId = useCallback(() => {
    setAiRefineFolderId(null);
  }, []);

  const handleClearInitialSelectedTranscriptId = useCallback(() => {
    setInitialSelectedTranscriptId(null);
  }, []);

  const handleSaveTranscripts = useCallback((updatedTranscripts: TranscriptDocument[]) => {
    setTranscripts(updatedTranscripts);
    persistTranscripts(updatedTranscripts);
  }, [folders, cards, transcripts]);

  const handleSendToAI = useCallback((transcript: TranscriptDocument) => {
    setInitialSelectedTranscriptId(transcript.id);
    setViewMode("ai");
  }, []);

  const handleOpenAddCard = useCallback(() => {
    setIsAddCardOpen(true);
  }, []);

  const handleOpenCreateFolder = useCallback(() => {
    setIsCreateFolderOpen(true);
  }, []);

  const handleOpenEditFolder = useCallback((folder: Folder) => {
    setEditingFolder(folder);
  }, []);

  const handleOpenEditCard = useCallback((card: Flashcard) => {
    setEditingCard(card);
  }, []);

  const handleRefineFolderWithAI = useCallback((folderId: string) => {
    setAiRefineFolderId(folderId);
    setViewMode("ai");
  }, []);

  const handleOpenReviewSetup = useCallback((folder: Folder) => {
    if (folder.id === "root-library") {
      setActiveFolderId("");
    } else {
      setActiveFolderId(folder.id);
    }
    setIsReviewSetupOpen(true);
  }, []);

  const activeFolderObject = useMemo(() => {
    return folders.find((f) => f.id === activeFolderId) || (activeFolderId === "" && isReviewSetupOpen ? {
      id: "root-library",
      name: "المكتبة",
      color: "#0056f6",
      frontLang: "de",
      backLang: "ar",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } : undefined);
  }, [folders, activeFolderId, isReviewSetupOpen]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface text-on-surface" dir="rtl">
      {/* 1. Main Body Split Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Drawer (Arabic Right-aligned Sidebar) */}
        <Sidebar
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={handleSelectFolder}
          onHomeClick={handleHomeClick}
          onSettingsClick={handleSettingsClick}
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
          dbStatus={dbStatus}
          activeTab={viewMode}
          onSelectAI={handleSelectAI}
          onSelectTrash={handleSelectTrash}
          onSelectYoutube={handleSelectYoutube}
          onDataReloaded={handleDataReloaded}
        />

        {/* Center Canvas Workspace */}
        {viewMode === "trash" ? (
          <RecycleBin
            folders={folders}
            trashFolders={trashFolders}
            trashCards={trashCards}
            trashAiFolders={trashAiFolders}
            trashAiCards={trashAiCards}
            onRestoreFolder={handleRestoreFolder}
            onRestoreCard={handleRestoreCard}
            onRestoreAiFolder={handleRestoreAiFolder}
            onRestoreAiCard={handleRestoreAiCard}
            onDeletePermanentlyFolder={handleDeletePermanentlyFolder}
            onDeletePermanentlyCard={handleDeletePermanentlyCard}
            onDeletePermanentlyAiFolder={handleDeletePermanentlyAiFolder}
            onDeletePermanentlyAiCard={handleDeletePermanentlyAiCard}
            onEmptyTrash={handleEmptyTrash}
            onBackToLibrary={handleHomeClick}
            onToggleSidebar={handleToggleSidebar}
          />
        ) : viewMode === "ai" ? (
          <AIWorkspace
            folders={folders}
            cards={cards}
            activeFolderId={activeFolderId}
            onSelectFolder={handleSelectFolder}
            onImportGenerated={handleImportGenerated}
            onBackToLibrary={handleAiBackToLibrary}
            aiRefineFolderId={aiRefineFolderId}
            onClearAiRefineFolderId={handleClearAiRefineFolderId}
            onSaveRefinedFolder={handleSaveRefinedFolder}
            onTrashAiFolder={handleTrashAiFolder}
            onTrashAiCard={handleTrashAiCard}
            onTrashAiCards={handleTrashAiCards}
            onToggleSidebar={handleToggleSidebar}
            transcripts={transcripts}
            initialSelectedTranscriptId={initialSelectedTranscriptId}
            onClearInitialSelectedTranscriptId={handleClearInitialSelectedTranscriptId}
          />
        ) : viewMode === "youtube" ? (
          <YoutubeWorkspace
            transcripts={transcripts}
            onSaveTranscripts={handleSaveTranscripts}
            onSendToAI={handleSendToAI}
            onToggleSidebar={handleToggleSidebar}
            onBackToLibrary={handleHomeClick}
          />
        ) : (
          <Explorer
            folders={folders}
            cards={cards}
            activeFolderId={activeFolderId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectFolder={handleSelectFolder}
            onDeleteFolder={handleDeleteFolder}
            onDeleteCard={handleDeleteCard}
            onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove}
            onBulkCopy={handleBulkCopy}
            onAddCardClick={handleOpenAddCard}
            onCreateFolderClick={handleOpenCreateFolder}
            onEditFolder={handleOpenEditFolder}
            onEditCard={handleOpenEditCard}
            onToggleSidebar={handleToggleSidebar}
            onRefineFolderWithAI={handleRefineFolderWithAI}
            onOpenReviewSetup={handleOpenReviewSetup}
            onReorderFolders={handleReorderFolders}
            onReorderCards={handleReorderCards}
          />
        )}
      </div>

      {/* 3. MODALS AND STUDY INTERACTIVE OVERLAYS */}
      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        onSave={handleCreateFolder}
        onOpenImageSearch={handleOpenImageSearch}
      />

      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => setIsAddCardOpen(false)}
        folders={folders}
        activeFolderId={activeFolderId || (folders[0]?.id || "")}
        onSave={handleAddCard}
        onOpenImageSearch={handleOpenImageSearch}
      />

      {editingFolder && (
        <EditFolderModal
          isOpen={!!editingFolder}
          onClose={() => setEditingFolder(null)}
          folder={editingFolder}
          onSave={handleEditFolder}
          onOpenImageSearch={handleOpenImageSearch}
        />
      )}

      {editingCard && (
        <EditCardModal
          isOpen={!!editingCard}
          onClose={() => setEditingCard(null)}
          card={editingCard}
          folders={folders}
          onSave={handleEditCard}
          onOpenImageSearch={handleOpenImageSearch}
          onDelete={handleDeleteCard}
        />
      )}

      <ImagePickerModal
        isOpen={isImagePickerOpen}
        onClose={() => setIsImagePickerOpen(false)}
        onSelect={handleSelectImage}
        initialQuery={imagePickerInitialQuery}
      />

      {activeFolderObject && (
        <ReviewSetupModal
          isOpen={isReviewSetupOpen}
          onClose={() => setIsReviewSetupOpen(false)}
          folder={activeFolderObject}
          folders={folders}
          cards={cards}
          onStartReview={handleStartReviewSession}
        />
      )}

      {activeReview && (
        <ReviewSession
          key={`${activeReview.method}-${activeReview.chainIndex ?? ""}`}
          method={activeReview.method}
          cards={activeReview.cards}
          chainMethods={activeReview.chainMethods}
          chainIndex={activeReview.chainIndex}
          onCompleteChainStep={(nextIndex) => {
            if (activeReview.chainMethods) {
              const nextMethod = activeReview.chainMethods[nextIndex];
              if (nextMethod) {
                setActiveReview({
                  ...activeReview,
                  method: nextMethod,
                  chainIndex: nextIndex
                });
              } else {
                setActiveReview(null);
              }
            }
          }}
          onClose={() => setActiveReview(null)}
          onUpdateStreak={handleUpdateStreak}
          onEditCard={(card) => setEditingCard(card)}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
