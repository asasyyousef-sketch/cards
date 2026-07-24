import React, { useState } from "react";
import { Home, Folder, FolderOpen, History, Star, Settings, ChevronLeft, ChevronDown, BookOpen, X, Database, AlertTriangle, CheckCircle, Copy, Check, Sparkles, Trash2, Youtube } from "lucide-react";
import { Folder as FolderType, DbStatus } from "../types";

interface SidebarProps {
  folders: FolderType[];
  activeFolderId: string;
  onSelectFolder: (id: string) => void;
  onHomeClick: () => void;
  onSettingsClick?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  dbStatus?: DbStatus;
  activeTab?: "library" | "ai" | "trash" | "youtube";
  onSelectAI?: () => void;
  onSelectTrash?: () => void;
  onSelectYoutube?: () => void;
  onDataReloaded?: (folders: any[], cards: any[]) => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  folders,
  activeFolderId,
  onSelectFolder,
  onHomeClick,
  onSettingsClick,
  isOpen = false,
  onClose,
  dbStatus,
  activeTab = "library",
  onSelectAI,
  onSelectTrash,
  onSelectYoutube,
  onDataReloaded
}) => {
  // Keep track of expanded state for collapsible folders
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    "folder-chemistry-root": true,
    "folder-organic": true,
  });

  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Manual Sync states
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleForcePush = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync/push", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "حدث خطأ أثناء رفع الملفات");
      setSyncMessage({ text: data.message || "تم الرفع والمزامنة بنجاح!", isError: false });
    } catch (err: any) {
      setSyncMessage({ text: err.message || "فشل الرفع", isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleForcePull = async () => {
    if (!window.confirm("تنبيه هام جداً:\nسيقوم هذا الإجراء باستبدال كافة المجلدات والبطاقات المحلية الحالية واسترجاع البيانات المحفوظة في السحابة فقط.\nهل أنت متأكد من رغبتك بالاستمرار؟")) {
      return;
    }
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync/pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "حدث خطأ أثناء جلب البيانات");
      if (onDataReloaded && data.folders && data.cards) {
        onDataReloaded(data.folders, data.cards);
      }
      setSyncMessage({ text: data.message || "تم سحب واستعادة البيانات السحابية بنجاح!", isError: false });
    } catch (err: any) {
      setSyncMessage({ text: err.message || "فشل سحب البيانات", isError: true });
    } finally {
      setSyncLoading(false);
    }
  };

  // Helper to check if a folder is active or has an active descendant
  const isFolderActiveOrDescendantActive = (folderId: string): boolean => {
    if (activeFolderId === folderId) return true;
    const children = folders.filter((f) => f.parentId === folderId);
    return children.some((child) => isFolderActiveOrDescendantActive(child.id));
  };

  // Find all root-level folders (folders with no parent or whose parent is missing)
  const rootFolders = folders.filter(
    (f) => !f.parentId || !folders.some((p) => p.id === f.parentId)
  );

  // Consistent sorting: predefined folders first, then custom folders by creation date
  const sortedRootFolders = [...rootFolders].sort((a, b) => {
    const predefinedOrder = ["folder-math", "folder-chemistry-root", "folder-physics"];
    const indexA = predefinedOrder.indexOf(a.id);
    const indexB = predefinedOrder.indexOf(b.id);
    
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Sort subfolders
  const getSortedChildren = (parentId: string) => {
    const children = folders.filter((f) => f.parentId === parentId);
    return [...children].sort((a, b) => {
      const predefinedOrder = ["folder-organic", "folder-inorganic", "folder-alkanes"];
      const indexA = predefinedOrder.indexOf(a.id);
      const indexB = predefinedOrder.indexOf(b.id);
      
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  };

  const isLibraryActive = activeFolderId !== "";

  // Recursive dynamic folder tree renderer
  const renderFolderTree = (folder: FolderType, depth: number) => {
    const children = getSortedChildren(folder.id);
    const hasKids = children.length > 0;
    const isExpanded = !!expandedFolders[folder.id];
    const isActive = activeFolderId === folder.id;
    const isHighlight = isFolderActiveOrDescendantActive(folder.id);

    return (
      <div key={folder.id} className="flex flex-col">
        {/* Folder Item Row */}
        <button
          onClick={() => {
            onSelectFolder(folder.id);
            onClose?.();
            if (hasKids && !isExpanded) {
              setExpandedFolders((prev) => ({ ...prev, [folder.id]: true }));
            }
          }}
          className={`flex items-center justify-between px-3 py-2 mr-6 ml-3 rounded-xl text-right transition-all text-xs cursor-pointer ${
            isActive
              ? "bg-[#e2ecf9] text-[#0056f6] font-black"
              : isHighlight
              ? "text-[#0056f6] font-bold hover:bg-slate-100"
              : "text-on-surface hover:bg-slate-100 font-semibold"
          }`}
          style={{ width: "calc(100% - 36px)" }}
        >
          <div className="flex items-center gap-3">
            <Folder
              className="w-4 h-4 shrink-0"
              style={{ color: isActive || isHighlight ? "#0056f6" : folder.color || "#64748b" }}
            />
            <span>{folder.name}</span>
          </div>

          {hasKids && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setExpandedFolders((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }));
              }}
              className="p-1 hover:bg-black/5 rounded-md transition-colors cursor-pointer"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 text-outline transition-transform ${
                  isExpanded ? "transform rotate-0" : "transform -rotate-90"
                }`}
              />
            </div>
          )}
        </button>

        {/* Nested Children (indented dynamically with a visual tree line) */}
        {hasKids && isExpanded && (
          <div className="flex flex-col mr-4 border-r border-slate-200/50 pr-1 mt-0.5 mb-1">
            {children.map((child) => renderFolderTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/45 backdrop-blur-xs z-40 md:hidden transition-all duration-300 animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Sidebar aside */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 bg-[#f3f6fc] font-sans text-sm w-64 flex flex-col border-l border-outline-variant/30 shrink-0 h-full overflow-y-auto transition-transform duration-300 ease-in-out md:translate-x-0 md:relative md:flex ${
          isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
        dir="rtl"
      >
        {/* Sidebar Header Brand Logo */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#0056f6] tracking-tight font-sans">
            StudySmarter
          </h1>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 text-outline hover:text-on-surface hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          )}
        </div>

        <nav className="py-2 flex flex-col flex-1">
          {/* Section: Main Folders Label */}
          <div className="px-6 py-2 text-[11px] font-bold text-outline uppercase tracking-wider">
            المكتبة التعليمية
          </div>

          {/* المكتبة / Library (Clickable to select root and toggle hierarchy) */}
          <div className="mt-1">
            <button
              onClick={() => {
                onSelectFolder("");
                onClose?.();
                setIsLibraryExpanded(true);
              }}
              className={`w-[calc(100%-24px)] flex items-center justify-between px-4 py-2 mx-3 rounded-xl text-right transition-all font-bold text-xs cursor-pointer ${
                activeFolderId === ""
                  ? "bg-[#e2ecf9] text-[#0056f6]"
                  : "text-on-surface hover:bg-surface-container-low"
              }`}
            >
              <div className="flex items-center gap-3">
                <FolderOpen className={`w-4 h-4 shrink-0 ${activeFolderId === "" ? "text-[#0056f6]" : "text-outline"}`} style={{ color: activeFolderId === "" ? "#0056f6" : "#64748b" }} />
                <span>المكتبة</span>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLibraryExpanded(!isLibraryExpanded);
                }}
                className="p-1 hover:bg-black/5 rounded-md transition-colors cursor-pointer"
              >
                {isLibraryExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-outline transition-transform" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5 text-outline transition-transform" />
                )}
              </div>
            </button>

            {/* Collapsible content of Library */}
            {isLibraryExpanded && (
              <div className="flex flex-col mr-2">
                {sortedRootFolders.map((rootFolder) => renderFolderTree(rootFolder, 0))}
              </div>
            )}
          </div>

          {/* Section: AI Assistant */}
          <div className="px-6 py-2 text-[11px] font-bold text-outline uppercase tracking-wider mt-4">
            الذكاء الاصطناعي
          </div>

          <button
            onClick={() => {
              onSelectAI?.();
              onClose?.();
            }}
            className={`flex items-center gap-3 px-4 py-2 mx-3 rounded-xl text-right transition-all font-bold text-xs cursor-pointer w-[calc(100%-24px)] ${
              activeTab === "ai"
                ? "bg-[#e2ecf9] text-[#0056f6]"
                : "text-on-surface hover:bg-surface-container-low"
            }`}
          >
            <Sparkles className="w-4 h-4 text-violet-600 animate-pulse" />
            <span>المساعد الذكي ⚡</span>
          </button>

          <button
            onClick={() => {
              onSelectYoutube?.();
              onClose?.();
            }}
            className={`flex items-center gap-3 px-4 py-2 mx-3 rounded-xl text-right transition-all font-bold text-xs cursor-pointer w-[calc(100%-24px)] mt-1.5 ${
              activeTab === "youtube"
                ? "bg-[#e2ecf9] text-[#0056f6]"
                : "text-on-surface hover:bg-surface-container-low"
            }`}
          >
            <Youtube className="w-4 h-4 text-rose-600" />
            <span>تفريغ اليوتيوب (spT) 🎥</span>
          </button>

          {/* Section: Trash */}
          <div className="px-6 py-2 text-[11px] font-bold text-outline uppercase tracking-wider mt-4">
            المهملات
          </div>

          <button
            onClick={() => {
              onSelectTrash?.();
              onClose?.();
            }}
            className={`flex items-center gap-3 px-4 py-2 mx-3 rounded-xl text-right transition-all font-bold text-xs cursor-pointer w-[calc(100%-24px)] ${
              activeTab === "trash"
                ? "bg-rose-50 text-rose-700 border border-rose-100"
                : "text-on-surface hover:bg-surface-container-low"
            }`}
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            <span>سلة المهملات 🗑️</span>
          </button>

          {/* Section: Quick Access */}
          <div className="px-6 py-2 text-[11px] font-bold text-outline uppercase tracking-wider mt-4">
            وصول سريع
          </div>

          <button
            onClick={() => {
              onSelectFolder("");
              onClose?.();
            }}
            className="flex items-center gap-3 px-4 py-2 mx-3 rounded-xl text-right text-on-surface hover:bg-surface-container-low transition-colors font-semibold text-xs cursor-pointer"
          >
            <History className="w-4 h-4 text-outline" />
            <span>العناصر الأخيرة</span>
          </button>

          <button
            onClick={() => {
              onSelectFolder("");
              onClose?.();
            }}
            className="flex items-center gap-3 px-4 py-2 mx-3 rounded-xl text-right text-on-surface hover:bg-surface-container-low transition-colors font-semibold text-xs cursor-pointer"
          >
            <Star className="w-4 h-4 text-outline" />
            <span>المفضلة</span>
          </button>
        </nav>

        {/* Database Sync Status Component */}
        {dbStatus && dbStatus.supabaseActive && (
          <div className="mx-4 my-2 p-3 bg-[#f8fafc] border border-slate-200/80 rounded-xl text-right">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">مزامنة البيانات السحابية</span>
            </div>
            
            {dbStatus.tablesExist ? (
              <div className="flex items-start gap-2 mt-1.5 text-emerald-800">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold leading-tight">قاعدة البيانات نشطة</span>
                  <span className="text-[9px] text-emerald-600 leading-snug">تتم مزامنة بطاقاتك ومجلداتك مع Supabase بنجاح!</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-1.5">
                <div className="flex items-start gap-2 text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold leading-tight">الجداول مفقودة</span>
                    <span className="text-[9px] text-amber-600 leading-snug">الجداول غير منشأة في Supabase. اضغط أدناه للتهيئة:</span>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsSqlModalOpen(true)}
                  className="w-full py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-[10px] rounded-lg transition-colors cursor-pointer text-center"
                >
                  عرض كود SQL للإعداد 📋
                </button>
              </div>
            )}
          </div>
        )}

        {/* Settings Bottom Option */}
        <div className="mt-auto py-3 border-t border-outline-variant/20">
          <button
            onClick={() => {
              onSettingsClick?.();
              onClose?.();
            }}
            className="flex items-center gap-3 px-4 py-2.5 mx-3 rounded-xl text-right text-on-surface hover:bg-surface-container-low transition-colors font-semibold text-xs cursor-pointer w-[calc(100%-24px)]"
          >
            <Settings className="w-4 h-4 text-outline" />
            <span>إعدادات النظام</span>
          </button>
        </div>
      </aside>

      {/* SQL SCHEMA GENERATOR MODAL */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]" dir="rtl">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-[#0056f6]" />
                <h3 className="font-bold text-sm text-slate-800">تهيئة قاعدة بيانات Supabase</h3>
              </div>
              <button 
                onClick={() => setIsSqlModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                مرحباً! لحل مشكلة عدم وجود جداول (<span className="text-rose-600 font-mono text-[11px]">Could not find table public.decks</span>)، يرجى نسخ هذا الكود البرمجي ولصقه في لوحة تحكم Supabase الخاصة بك:
              </p>

              <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl space-y-2">
                <span className="font-bold text-blue-900 block">💡 خطوات الإعداد السريعة:</span>
                <ol className="list-decimal list-inside space-y-1 text-slate-700 leading-relaxed pr-2">
                  <li>افتح لوحة تحكم <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold">Supabase Dashboard</a> وانتقل إلى مشروعك.</li>
                  <li>من القائمة الجانبية اليسرى، انتقل إلى <strong>SQL Editor</strong>.</li>
                  <li>اضغط على <strong>New Query</strong> لفتح محرر جديد.</li>
                  <li>قم بلصق كود الـ SQL المنسوخ أدناه ثم اضغط على زر <strong>Run</strong> (أو اضغط CMD/Ctrl + Enter).</li>
                </ol>
              </div>

              {/* Code Container */}
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-900">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 text-[10px] font-mono text-slate-400">
                  <span>supabase_schema.sql</span>
                  <button
                    onClick={() => {
                      const sql = `
-- 1. Create decks table
CREATE TABLE IF NOT EXISTS public.decks (
  id TEXT PRIMARY KEY,
  "parentId" TEXT REFERENCES public.decks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  "coverImage" TEXT,
  "coverImagePosition" TEXT DEFAULT '50% 50%',
  "frontLang" TEXT NOT NULL,
  "backLang" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist to avoid errors
DROP POLICY IF EXISTS "Allow public read access" ON public.decks;
DROP POLICY IF EXISTS "Allow public write access" ON public.decks;

CREATE POLICY "Allow public read access" ON public.decks FOR SELECT USING (true);
CREATE POLICY "Allow public write access" ON public.decks FOR ALL USING (true);

-- 2. Create cards table
CREATE TABLE IF NOT EXISTS public.cards (
  id TEXT PRIMARY KEY,
  "folderId" TEXT REFERENCES public.decks(id) ON DELETE CASCADE NOT NULL,
  "frontText" TEXT NOT NULL,
  "frontLang" TEXT NOT NULL,
  "frontImage" TEXT,
  "frontImagePosition" TEXT DEFAULT '50% 50%',
  "frontAudioUrl" TEXT,
  "backText" TEXT NOT NULL,
  "backLang" TEXT NOT NULL,
  "backImage" TEXT,
  "backImagePosition" TEXT DEFAULT '50% 50%',
  "backAudioUrl" TEXT,
  "isArticleMode" BOOLEAN DEFAULT false,
  "correctArticle" TEXT DEFAULT '',
  "isPluralMode" BOOLEAN DEFAULT false,
  "pluralText" TEXT DEFAULT '',
  "pluralLang" TEXT DEFAULT 'de',
  "translationHint" TEXT,
  streak INTEGER DEFAULT 0 NOT NULL,
  difficulty TEXT DEFAULT 'medium',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist to avoid errors
DROP POLICY IF EXISTS "Allow public read access" ON public.cards;
DROP POLICY IF EXISTS "Allow public write access" ON public.cards;

CREATE POLICY "Allow public read access" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Allow public write access" ON public.cards FOR ALL USING (true);

-- 3. MIGRATION FOR EXISTING TABLES (Run this if you already have the tables to add plural features!)
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS "isPluralMode" BOOLEAN DEFAULT false;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS "pluralText" TEXT DEFAULT '';
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS "pluralLang" TEXT DEFAULT 'de';
`.trim();
                      navigator.clipboard.writeText(sql);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-700 text-slate-200 rounded transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">تم النسخ!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-300" />
                        <span>نسخ الكود</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 text-[10px] font-mono text-slate-300 overflow-x-auto overflow-y-auto max-h-[160px] leading-relaxed text-left ltr select-all">
{`-- 1. Create decks table (folders)
CREATE TABLE IF NOT EXISTS public.decks (
  id TEXT PRIMARY KEY,
  "parentId" TEXT REFERENCES public.decks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  "coverImage" TEXT,
  "coverImagePosition" TEXT DEFAULT '50% 50%',
  "frontLang" TEXT NOT NULL,
  "backLang" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist to avoid errors
DROP POLICY IF EXISTS "Allow public read access" ON public.decks;
DROP POLICY IF EXISTS "Allow public write access" ON public.decks;

CREATE POLICY "Allow public read access" ON public.decks FOR SELECT USING (true);
CREATE POLICY "Allow public write access" ON public.decks FOR ALL USING (true);

-- 2. Create cards table (flashcards)
CREATE TABLE IF NOT EXISTS public.cards (
  id TEXT PRIMARY KEY,
  "folderId" TEXT REFERENCES public.decks(id) ON DELETE CASCADE NOT NULL,
  "frontText" TEXT NOT NULL,
  "frontLang" TEXT NOT NULL,
  "frontImage" TEXT,
  "frontImagePosition" TEXT DEFAULT '50% 50%',
  "frontAudioUrl" TEXT,
  "backText" TEXT NOT NULL,
  "backLang" TEXT NOT NULL,
  "backImage" TEXT,
  "backImagePosition" TEXT DEFAULT '50% 50%',
  "backAudioUrl" TEXT,
  "isArticleMode" BOOLEAN DEFAULT false,
  "correctArticle" TEXT DEFAULT '',
  "isPluralMode" BOOLEAN DEFAULT false,
  "pluralText" TEXT DEFAULT '',
  "pluralLang" TEXT DEFAULT 'de',
  "translationHint" TEXT,
  streak INTEGER DEFAULT 0 NOT NULL,
  difficulty TEXT DEFAULT 'medium',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist to avoid errors
DROP POLICY IF EXISTS "Allow public read access" ON public.cards;
DROP POLICY IF EXISTS "Allow public write access" ON public.cards;

CREATE POLICY "Allow public read access" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Allow public write access" ON public.cards FOR ALL USING (true);

-- 3. MIGRATION FOR EXISTING TABLES (Run if you have existing tables!)
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS "isPluralMode" BOOLEAN DEFAULT false;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS "pluralText" TEXT DEFAULT '';
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS "pluralLang" TEXT DEFAULT 'de';`}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer transition-all"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
