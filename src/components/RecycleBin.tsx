import React, { useState } from "react";
import { 
  Trash2, 
  RefreshCw, 
  Folder as FolderIcon, 
  Volume2, 
  X, 
  Layers, 
  RectangleVertical, 
  Check, 
  AlertTriangle, 
  Info,
  ChevronLeft,
  Home,
  Menu,
  Plus
} from "lucide-react";
import { Folder, Flashcard, getSafeImageStyle } from "../types";
import { AIFolder, AICard } from "./AIWorkspace";
import { speakClient } from "./Modals";
import { ImageWithSkeleton } from "./ReviewSession";

interface RecycleBinProps {
  folders?: Folder[];
  trashFolders: Folder[];
  trashCards: Flashcard[];
  trashAiFolders: AIFolder[];
  trashAiCards: AICard[];
  onRestoreFolder: (id: string) => void;
  onRestoreCard: (id: string) => void;
  onRestoreAiFolder: (id: string) => void;
  onRestoreAiCard: (id: string) => void;
  onDeletePermanentlyFolder: (id: string) => void;
  onDeletePermanentlyCard: (id: string) => void;
  onDeletePermanentlyAiFolder: (id: string) => void;
  onDeletePermanentlyAiCard: (id: string) => void;
  onEmptyTrash: () => void;
  onBackToLibrary: () => void;
  onToggleSidebar?: () => void;
}

export const RecycleBin: React.FC<RecycleBinProps> = React.memo(({
  folders = [],
  trashFolders,
  trashCards,
  trashAiFolders,
  trashAiCards,
  onRestoreFolder,
  onRestoreCard,
  onRestoreAiFolder,
  onRestoreAiCard,
  onDeletePermanentlyFolder,
  onDeletePermanentlyCard,
  onDeletePermanentlyAiFolder,
  onDeletePermanentlyAiCard,
  onEmptyTrash,
  onBackToLibrary,
  onToggleSidebar
}) => {
  const [activeTab, setActiveTab] = useState<"library" | "ai">("library");
  const [previewCard, setPreviewCard] = useState<{
    id: string;
    frontText: string;
    backText: string;
    frontLang: string;
    backLang: string;
    translationHint?: string;
    correctArticle?: string;
    frontImage?: string;
    frontImagePosition?: string;
    backImage?: string;
    backImagePosition?: string;
    folderName?: string;
    isPluralMode?: boolean;
    pluralText?: string;
    pluralLang?: string;
  } | null>(null);
  
  const [isPreviewFlipped, setIsPreviewFlipped] = useState(false);
  const [showPreviewPlural, setShowPreviewPlural] = useState(false);

  React.useEffect(() => {
    setShowPreviewPlural(false);
  }, [previewCard, isPreviewFlipped]);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);

  const [activeFolderId, setActiveFolderId] = useState<string>("");
  const [activeAiFolderId, setActiveAiFolderId] = useState<string>("");

  React.useEffect(() => {
    if (activeFolderId && !trashFolders.some((f) => f.id === activeFolderId)) {
      const current = trashFolders.find((f) => f.id === activeFolderId);
      if (current && current.parentId && trashFolders.some((f) => f.id === current.parentId)) {
        setActiveFolderId(current.parentId);
      } else {
        setActiveFolderId("");
      }
    }
  }, [trashFolders, activeFolderId]);

  React.useEffect(() => {
    if (activeAiFolderId && !trashAiFolders.some((f) => f.id === activeAiFolderId)) {
      setActiveAiFolderId("");
    }
  }, [trashAiFolders, activeAiFolderId]);

  // Roots of the trash
  const displayedFolders = trashFolders.filter((f) => {
    if (activeFolderId === "") {
      return !f.parentId || !trashFolders.some((p) => p.id === f.parentId);
    } else {
      return f.parentId === activeFolderId;
    }
  });

  const displayedCards = trashCards.filter((c) => {
    if (activeFolderId === "") {
      return !c.folderId || !trashFolders.some((f) => f.id === c.folderId);
    } else {
      return c.folderId === activeFolderId;
    }
  });

  const displayedAiFolders = trashAiFolders.filter((f) => {
    if (activeAiFolderId === "") {
      return true;
    } else {
      return false; // AI folders have no subfolders
    }
  });

  const displayedAiCards = trashAiCards.filter((c) => {
    if (activeAiFolderId === "") {
      return !c.folderId || !trashAiFolders.some((f) => f.id === c.folderId);
    } else {
      return c.folderId === activeAiFolderId;
    }
  });

  const isTabEmpty = activeTab === "library"
    ? (trashFolders.length === 0 && trashCards.length === 0)
    : (trashAiFolders.length === 0 && trashAiCards.length === 0);

  const isCurrentFolderEmpty = activeTab === "library"
    ? (activeFolderId !== "" && displayedFolders.length === 0 && displayedCards.length === 0)
    : (activeAiFolderId !== "" && displayedAiCards.length === 0);

  const getTrashFolderPath = (folderId: string): { id: string; name: string }[] => {
    const path: { id: string; name: string }[] = [];
    let currentId = folderId;
    while (currentId) {
      const f = trashFolders.find((x) => x.id === currentId) || folders.find((x) => x.id === currentId);
      if (f) {
        path.unshift({ id: f.id, name: f.name });
        currentId = f.parentId || "";
      } else {
        break;
      }
    }
    return path;
  };

  const hasItems = 
    trashFolders.length > 0 || 
    trashCards.length > 0 || 
    trashAiFolders.length > 0 || 
    trashAiCards.length > 0;

  const playPronunciation = (text: string, langCode: string) => {
    speakClient(text, langCode);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 md:p-8 text-right" dir="rtl">
      {/* Header Panel */}
      <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between border-b border-slate-100 pb-4">
        {/* Right side: Hamburger, Empty Trash, and Back buttons */}
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

          {hasItems && (
            <button
              onClick={() => setConfirmEmptyOpen(true)}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-rose-100 bg-rose-50/50 hover:bg-rose-50 text-[10px] font-bold text-rose-600 transition-all cursor-pointer active:scale-95 animate-fade-in"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>تفريغ السلة</span>
            </button>
          )}
          
          <button
            onClick={onBackToLibrary}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-700 transition-all cursor-pointer active:scale-95"
          >
            <span>العودة للمكتبة</span>
          </button>
        </div>

        {/* Left side: Simple Icon + Title */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">سلة المهملات</span>
          <Trash2 className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Toggle Origin Tabs */}
        <div className="flex bg-slate-200/50 p-1 rounded-2xl max-w-md border border-slate-200/60">
          <button
            onClick={() => setActiveTab("library")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all cursor-pointer text-center ${
              activeTab === "library"
                ? "bg-white text-[#0056f6] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📚 عناصر المكتبة ({trashFolders.length + trashCards.length})
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all cursor-pointer text-center ${
              activeTab === "ai"
                ? "bg-white text-[#0056f6] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚡ عناصر المساعد ({trashAiFolders.length + trashAiCards.length})
          </button>
        </div>

        {/* Empty state check */}
        {isTabEmpty ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-xs flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 text-3xl">
              🍃
            </div>
            <h3 className="font-black text-slate-700 text-sm">سلة المهملات فارغة هنا!</h3>
            <p className="text-xs text-slate-400 font-semibold max-w-sm leading-relaxed">
              عند حذف مجلدات أو بطاقات دراسية مؤقتاً، ستظهر هنا في هذه السلة لمراجعتها أو استعادتها لاحقاً.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* Breadcrumbs for Recycle Bin folder tree navigation */}
            {activeTab === "library" && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-100 px-4 py-2 rounded-2xl shadow-3xs max-w-full">
                <span 
                  onClick={() => setActiveFolderId("")} 
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] shrink-0 font-black"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>سلة المهملات</span>
                </span>

                {activeFolderId && (() => {
                  const path = getTrashFolderPath(activeFolderId);
                  return path.map((f, index) => {
                    const isLast = index === path.length - 1;
                    return (
                      <React.Fragment key={`trash-breadcrumb-${f.id}`}>
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span
                          onClick={isLast ? undefined : () => setActiveFolderId(f.id)}
                          className={isLast 
                            ? "px-2.5 py-1 rounded-lg font-extrabold shadow-3xs text-[#0056f6] bg-[#0056f6]/10 border border-[#0056f6]/20 shrink-0"
                            : "px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] shrink-0"
                          }
                        >
                          {f.name}
                        </span>
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
            )}

            {activeTab === "ai" && activeAiFolderId && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-100 px-4 py-2 rounded-2xl shadow-3xs max-w-full">
                <span 
                  onClick={() => setActiveAiFolderId("")} 
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg transition-all cursor-pointer hover:text-[#0056f6] shrink-0 font-black"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>سلة المهملات (المساعد)</span>
                </span>

                <ChevronLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <span className="px-2.5 py-1 rounded-lg font-extrabold shadow-3xs text-[#0056f6] bg-[#0056f6]/10 border border-[#0056f6]/20 shrink-0">
                  {trashAiFolders.find((f) => f.id === activeAiFolderId)?.name || "مجلد مساعد"}
                </span>
              </div>
            )}

            {isCurrentFolderEmpty ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-3xs flex flex-col items-center justify-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 text-2xl">
                  📂
                </div>
                <h3 className="font-black text-slate-700 text-sm">هذا المجلد فارغ حالياً في سلة المهملات</h3>
                <p className="text-xs text-slate-400 font-semibold max-w-sm leading-relaxed">
                  لا توجد بطاقات أو مجلدات فرعية محذوفة داخل هذا المجلد.
                </p>
                <button
                  onClick={() => {
                    if (activeTab === "library") setActiveFolderId("");
                    else setActiveAiFolderId("");
                  }}
                  className="py-1.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 transition-all cursor-pointer active:scale-95"
                >
                  العودة للجذر
                </button>
              </div>
            ) : (
              <>
                {/* Deleted Folders Grid Section */}
                {((activeTab === "library" && displayedFolders.length > 0) || (activeTab === "ai" && displayedAiFolders.length > 0)) && (
                  <div className="space-y-3">
                    <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider block">المجلدات المحذوفة:</h3>
                    <div className="flex flex-col gap-3">
                      {activeTab === "library" ? (
                        displayedFolders.map((f) => {
                          const associatedCards = trashCards.filter(c => c.folderId === f.id);
                          return (
                            <div 
                              key={f.id}
                              onClick={() => setActiveFolderId(f.id)}
                              className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg hover:shadow-xs transition-all group hover:bg-slate-50/40 cursor-pointer"
                            >
                              <div className="flex items-center gap-4 text-right">
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
                                        {/* Main Cover Image */}
                                        <img
                                          src={f.coverImage}
                                          alt=""
                                          className="absolute inset-0 w-full h-full object-cover opacity-95 transition-all"
                                          style={getSafeImageStyle(f.coverImagePosition)}
                                          referrerPolicy="no-referrer"
                                        />
                                        {/* Soft faded black gradient covering the bottom 30% */}
                                        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/10 via-black/5 to-transparent pointer-events-none z-10" />
                                        
                                        {/* Notebook Binder Spine Overlay */}
                                        <div 
                                          className="absolute right-0 top-0 bottom-0 w-1.5 shadow-xs flex flex-col justify-around py-1.5 items-center z-20"
                                          style={{ backgroundColor: f.color || "#0056f6", filter: "brightness(0.9)" }}
                                        >
                                          <div className="w-0.5 h-0.5 bg-white/50 rounded-full" />
                                          <div className="w-0.5 h-0.5 bg-white/50 rounded-full" />
                                        </div>

                                        {/* Ultra-light, high-contrast Folder Indicator Badge */}
                                        <div 
                                          className="absolute left-1 bottom-1 bg-white/95 p-0.5 rounded-xs z-20 border border-slate-100 flex items-center justify-center"
                                          style={{ 
                                            borderColor: `${f.color || '#0056f6'}20`,
                                            boxShadow: "0 2px 5px rgba(0,0,0,0.18), 0 0 3px rgba(255,255,255,0.7)"
                                          }}
                                        >
                                          <FolderIcon className="w-2.5 h-2.5 fill-current" style={{ color: f.color || '#0056f6' }} />
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
                                        
                                        {/* Notebook Binder Spine (RTL Book layout) representing a notebook/folder */}
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
                                          <FolderIcon className="w-2.5 h-2.5 fill-current" style={{ color: f.color || '#0056f6' }} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Text block */}
                                <div>
                                  <h4 className="font-bold text-[#202124] text-base group-hover:text-[#0056f6] transition-colors flex items-center gap-2">
                                    <span>{f.name}</span>
                                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">فتح 📂</span>
                                  </h4>
                                  <p className="text-xs text-[#5f6368] font-medium mt-1">
                                    {associatedCards.length} بطاقات بالداخل • من {f.frontLang.toUpperCase()} إلى {f.backLang.toUpperCase()}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRestoreFolder(f.id);
                                  }}
                                  className="p-2 text-[#5f6368] hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
                                  title="استعادة المجلد والبطاقات التابعة له"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeletePermanentlyFolder(f.id);
                                  }}
                                  className="p-2 text-[#5f6368] hover:text-error hover:bg-error-container/15 rounded-xl transition-all cursor-pointer border border-transparent hover:border-error-container/10"
                                  title="حذف نهائي"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        displayedAiFolders.map((f) => {
                          const associatedCards = trashAiCards.filter(c => c.folderId === f.id);
                          return (
                            <div 
                              key={f.id}
                              onClick={() => setActiveAiFolderId(f.id)}
                              className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg hover:shadow-xs transition-all group hover:bg-slate-50/40 cursor-pointer"
                            >
                              <div className="flex items-center gap-4 text-right">
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
                                        {/* Main Cover Image */}
                                        <img
                                          src={f.coverImage}
                                          alt=""
                                          className="absolute inset-0 w-full h-full object-cover opacity-95 transition-all"
                                          style={getSafeImageStyle(f.coverImagePosition)}
                                          referrerPolicy="no-referrer"
                                        />
                                        {/* Soft faded black gradient covering the bottom 30% */}
                                        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/10 via-black/5 to-transparent pointer-events-none z-10" />
                                        
                                        {/* Notebook Binder Spine Overlay */}
                                        <div 
                                          className="absolute right-0 top-0 bottom-0 w-1.5 shadow-xs flex flex-col justify-around py-1.5 items-center z-20"
                                          style={{ backgroundColor: f.color || "#0056f6", filter: "brightness(0.9)" }}
                                        >
                                          <div className="w-0.5 h-0.5 bg-white/50 rounded-full" />
                                          <div className="w-0.5 h-0.5 bg-white/50 rounded-full" />
                                        </div>

                                        {/* Ultra-light, high-contrast Folder Indicator Badge */}
                                        <div 
                                          className="absolute left-1 bottom-1 bg-white/95 p-0.5 rounded-xs z-20 border border-slate-100 flex items-center justify-center"
                                          style={{ 
                                            borderColor: `${f.color || '#0056f6'}20`,
                                            boxShadow: "0 2px 5px rgba(0,0,0,0.18), 0 0 3px rgba(255,255,255,0.7)"
                                          }}
                                        >
                                          <FolderIcon className="w-2.5 h-2.5 fill-current" style={{ color: f.color || '#0056f6' }} />
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
                                        
                                        {/* Notebook Binder Spine (RTL Book layout) representing a notebook/folder */}
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
                                          <FolderIcon className="w-2.5 h-2.5 fill-current" style={{ color: f.color || '#0056f6' }} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Text block */}
                                <div>
                                  <h4 className="font-bold text-[#202124] text-base group-hover:text-[#0056f6] transition-colors flex items-center gap-2">
                                    <span>{f.name}</span>
                                    <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-150 px-1.5 py-0.5 rounded-full font-bold">ذكائي</span>
                                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">فتح 📂</span>
                                  </h4>
                                  <p className="text-xs text-[#5f6368] font-medium mt-1">
                                    {associatedCards.length} بطاقات بالداخل • من {f.frontLang.toUpperCase()} إلى {f.backLang.toUpperCase()}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRestoreAiFolder(f.id);
                                  }}
                                  className="p-2 text-[#5f6368] hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
                                  title="استعادة المجلد"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeletePermanentlyAiFolder(f.id);
                                  }}
                                  className="p-2 text-[#5f6368] hover:text-error hover:bg-error-container/15 rounded-xl transition-all cursor-pointer border border-transparent hover:border-error-container/10"
                                  title="حذف نهائي"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Deleted Individual Cards Section */}
                {((activeTab === "library" && displayedCards.length > 0) || (activeTab === "ai" && displayedAiCards.length > 0)) && (
                  <div className="space-y-3">
                    <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider block">البطاقات المحذوفة:</h3>
                    <div className="flex flex-col gap-3">
                      {activeTab === "library" ? (
                        displayedCards.map((c) => {
                          const cardFolder = (folders || []).find((f) => f.id === c.folderId) || trashFolders.find((f) => f.id === c.folderId);
                          const cardColor = cardFolder?.color || "#0056f6";
                          const folderName = cardFolder?.name || "مجلد مفقود";
                          return (
                            <div 
                              key={c.id}
                              onClick={() => {
                                setPreviewCard({
                                  id: c.id,
                                  frontText: c.frontText,
                                  backText: c.backText,
                                  frontLang: c.frontLang,
                                  backLang: c.backLang,
                                  translationHint: c.translationHint,
                                  correctArticle: c.correctArticle,
                                  frontImage: c.frontImage,
                                  frontImagePosition: c.frontImagePosition,
                                  backImage: c.backImage,
                                  backImagePosition: c.backImagePosition,
                                  isPluralMode: c.isPluralMode,
                                  pluralText: c.pluralText,
                                  pluralLang: c.pluralLang,
                                  folderName: "بطاقة مكتبة"
                                });
                                setIsPreviewFlipped(false);
                              }}
                              className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg hover:shadow-xs transition-all group cursor-pointer hover:bg-slate-50/40"
                            >
                              <div className="flex items-center gap-4 text-right">
                                {/* Unified Card Icon: Physical Card Stack design */}
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
                                      backgroundColor: c.frontImage ? "#ffffff" : `${cardColor}10`,
                                      borderColor: c.frontImage ? "rgba(192, 132, 252, 0.4)" : `${cardColor}30`,
                                      borderWidth: "1.5px"
                                    }}
                                  >
                                    {c.frontImage ? (
                                      <>
                                        <ImageWithSkeleton
                                          src={c.frontImage}
                                          alt=""
                                          className="absolute inset-0 w-full h-full object-cover opacity-95 transition-all"
                                          style={getSafeImageStyle(c.frontImagePosition)}
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/10 via-black/5 to-transparent pointer-events-none z-10" />

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
                                        <div className="absolute inset-0 bg-white flex flex-col justify-center gap-1 p-1 px-1.5 overflow-hidden">
                                          <div className="h-0.5 w-[85%] bg-slate-100 rounded-full" />
                                          <div className="h-0.5 w-[70%] bg-slate-100 rounded-full" />
                                          <div className="h-0.5 w-[80%] bg-slate-100 rounded-full" />
                                          <div className="absolute right-2 top-0 bottom-0 w-[1px] bg-rose-200" />
                                        </div>

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
                                    {c.frontText}
                                  </h4>
                                  <p className="text-xs text-[#5f6368] font-medium mt-1">
                                    {c.translationHint || c.backText || "بطاقة دراسة جاهزة للمراجعة"} • {folderName}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => playPronunciation(c.frontText, c.frontLang)}
                                  className="p-2 text-[#5f6368] hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
                                  title="استمع للنطق"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onRestoreCard(c.id)}
                                  className="p-2 text-[#5f6368] hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
                                  title="استعادة البطاقة"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onDeletePermanentlyCard(c.id)}
                                  className="p-2 text-[#5f6368] hover:text-error hover:bg-error-container/15 rounded-xl transition-all cursor-pointer border border-transparent hover:border-error-container/10"
                                  title="حذف نهائي"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        displayedAiCards.map((c) => {
                          const cardFolder = trashAiFolders.find((f) => f.id === c.folderId);
                          const cardColor = cardFolder?.color || "#0056f6";
                          const folderName = cardFolder?.name || "مجلد مساعد";
                          const frontLang = cardFolder?.frontLang || "de";
                          return (
                            <div 
                              key={c.id}
                              onClick={() => {
                                setPreviewCard({
                                  id: c.id,
                                  frontText: c.frontText,
                                  backText: c.backText,
                                  frontLang: frontLang,
                                  backLang: "ar",
                                  translationHint: c.translationHint,
                                  correctArticle: c.correctArticle,
                                  frontImage: c.frontImage,
                                  frontImagePosition: c.frontImagePosition,
                                  isPluralMode: c.isPluralMode,
                                  pluralText: c.pluralText,
                                  pluralLang: c.pluralLang,
                                  folderName: "بطاقة مساعد"
                                });
                                setIsPreviewFlipped(false);
                              }}
                              className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg hover:shadow-xs transition-all group cursor-pointer hover:bg-slate-50/40"
                            >
                              <div className="flex items-center gap-4 text-right">
                                {/* Unified Card Icon: Physical Card Stack design */}
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
                                      backgroundColor: c.frontImage ? "#ffffff" : `${cardColor}10`,
                                      borderColor: c.frontImage ? "rgba(192, 132, 252, 0.4)" : `${cardColor}30`,
                                      borderWidth: "1.5px"
                                    }}
                                  >
                                    {c.frontImage ? (
                                      <>
                                        <ImageWithSkeleton
                                          src={c.frontImage}
                                          alt=""
                                          className="absolute inset-0 w-full h-full object-cover opacity-95 transition-all"
                                          style={getSafeImageStyle(c.frontImagePosition)}
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/10 via-black/5 to-transparent pointer-events-none z-10" />

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
                                        <div className="absolute inset-0 bg-white flex flex-col justify-center gap-1 p-1 px-1.5 overflow-hidden">
                                          <div className="h-0.5 w-[85%] bg-slate-100 rounded-full" />
                                          <div className="h-0.5 w-[70%] bg-slate-100 rounded-full" />
                                          <div className="h-0.5 w-[80%] bg-slate-100 rounded-full" />
                                          <div className="absolute right-2 top-0 bottom-0 w-[1px] bg-rose-200" />
                                        </div>

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
                                    {c.frontText}
                                  </h4>
                                  <p className="text-xs text-[#5f6368] font-medium mt-1">
                                    {c.translationHint || c.backText || "بطاقة دراسة جاهزة للمراجعة"} • {folderName}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => playPronunciation(c.frontText, frontLang)}
                                  className="p-2 text-[#5f6368] hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
                                  title="استمع للنطق"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onRestoreAiCard(c.id)}
                                  className="p-2 text-[#5f6368] hover:text-[#0056f6] hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-100"
                                  title="استعادة البطاقة"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onDeletePermanentlyAiCard(c.id)}
                                  className="p-2 text-[#5f6368] hover:text-error hover:bg-error-container/15 rounded-xl transition-all cursor-pointer border border-transparent hover:border-error-container/10"
                                  title="حذف نهائي"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* CARD PREVIEW MODAL */}
      {previewCard && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs select-none" 
          dir="rtl"
          onClick={() => setPreviewCard(null)}
        >
          <div 
            className="w-full max-w-sm flex flex-col items-center gap-4 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Flip Card Wrapper */}
            <div 
              className={`w-full aspect-[3/4] cursor-pointer perspective-1000 ${
                isPreviewFlipped ? "flipped" : ""
              }`}
              onClick={() => setIsPreviewFlipped(!isPreviewFlipped)}
            >
              <div className="relative w-full h-full duration-500 transform-style-3d text-center">
                
                {/* FRONT FACE */}
                <div className="absolute inset-0 w-full h-full flip-card-front rounded-2xl flex flex-col p-6 border border-slate-100 bg-white overflow-hidden justify-between shadow-2xl">
                  {/* Top bar */}
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-extrabold px-3 py-1 rounded-full border text-slate-700 bg-slate-50">
                      {previewCard.folderName || "بطاقة محذوفة"}
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
                      <div className="w-full h-24 relative mb-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200/80 flex flex-col justify-center gap-2 p-3 overflow-hidden">
                        <div className="h-0.5 w-[85%] bg-slate-200/60 rounded-full" />
                        <div className="h-0.5 w-[65%] bg-slate-200/60 rounded-full" />
                        <div className="h-0.5 w-[75%] bg-slate-200/60 rounded-full" />
                        <div className="absolute right-3 top-0 bottom-0 w-[1px] bg-rose-200/60" />
                      </div>
                    )}

                    {/* Main Text & Translation Hint */}
                    <div className="text-center w-full px-2">
                      <h3 className="text-2xl font-extrabold text-[#202124] tracking-tight leading-snug break-words" dir="ltr">
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
                    <span>اضغط لقلب البطاقة 🔄</span>
                    <span>الوجه الأمامي</span>
                  </div>
                </div>

                {/* BACK FACE */}
                <div className="absolute inset-0 w-full h-full flip-card-back rounded-2xl flex flex-col p-6 border-2 border-[#0056f6]/20 bg-white overflow-hidden justify-between shadow-2xl">
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
                        <img
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
                      <h3 className="text-xl font-bold text-slate-900 leading-relaxed break-words">
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
                    <span>اضغط لقلب البطاقة 🔄</span>
                    <span>الوجه الخلفي</span>
                  </div>
                </div>

              </div>
            </div>
            
            {/* Close Button beneath Card */}
            <button
              onClick={() => setPreviewCard(null)}
              className="bg-white/90 hover:bg-white text-slate-800 font-extrabold text-xs px-5 py-2.5 rounded-full border border-slate-200/80 shadow-md flex items-center gap-1.5 cursor-pointer hover:shadow-lg transition-all"
            >
              <X className="w-4 h-4" />
              <span>إغلاق الاستعراض</span>
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM EMPTY MODAL */}
      {confirmEmptyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="text-base font-bold text-slate-800">تأكيد تفريغ سلة المهملات</h4>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              هل أنت متأكد من رغبتك في تفريغ سلة المهملات بالكامل؟ سيتم حذف جميع المجلدات والبطاقات الدراسية المدرجة هنا بشكل نهائي ولا يمكن استعادتها أبداً!
            </p>
            
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  onEmptyTrash();
                  setConfirmEmptyOpen(false);
                }}
                className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                تفريغ نهائي 🧹
              </button>
              <button
                onClick={() => setConfirmEmptyOpen(false)}
                className="flex-1 py-2 px-4 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
