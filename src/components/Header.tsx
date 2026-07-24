import React from "react";
import { Search, FolderPlus, PlusCircle, Play, Sparkles } from "lucide-react";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange
}) => {
  return (
    <header className="z-10 bg-surface-bright border-b border-outline-variant/30 px-6 py-3 shrink-0 flex flex-col md:flex-row items-center justify-between gap-4 font-sans" dir="rtl">
      {/* Brand Logo */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface tracking-tight font-display">StudySmarter</h1>
          <p className="text-[10px] font-semibold text-on-surface-variant/70 leading-none">تكنولوجيا التكرار المتباعد الذكي</p>
        </div>
      </div>

      {/* Global Search Input */}
      <div className="flex-1 max-w-md w-full relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ابحث عن بطاقات أو مجلدات..."
          className="w-full bg-surface-container-low border border-outline-variant rounded-full py-2 pr-12 pl-4 text-xs font-semibold text-on-surface placeholder-on-surface-variant/40 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
        <Search className="w-4 h-4 text-outline absolute right-4 top-1/2 -translate-y-1/2" />
      </div>
    </header>
  );
};
