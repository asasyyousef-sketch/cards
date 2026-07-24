import React, { useState, useEffect, useMemo, useRef } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
// Import language definitions safely
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";

import {
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Download,
  Search,
  WrapText,
  Code,
  FileText,
  X,
  Play,
  HelpCircle,
  Braces,
  Settings,
  ChevronRight,
  ChevronDown,
  Sparkles,
  ArrowRightLeft
} from "lucide-react";

interface CodeViewerProps {
  code: string;
  title: string;
  language?: "json" | "markdown" | "javascript" | "html";
  badge?: string;
  compactHeight?: string;
  tokenCount?: number;
}

// Interactive JSON Tree Node Component
const JsonTreeNode: React.FC<{
  nodeKey: string | number;
  value: any;
  level: number;
  isLast?: boolean;
}> = ({ nodeKey, value, level, isLast = true }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels
  const isObject = value !== null && typeof value === "object";
  const indent = level * 16;

  const renderValue = () => {
    if (value === null) return <span className="text-gray-400 font-mono">null</span>;
    if (typeof value === "boolean") {
      return <span className="text-purple-400 font-mono font-bold">{value ? "true" : "false"}</span>;
    }
    if (typeof value === "number") {
      return <span className="text-amber-400 font-mono">{value}</span>;
    }
    if (typeof value === "string") {
      // Check if it's a URL
      const isUrl = value.startsWith("http://") || value.startsWith("https://");
      if (isUrl) {
        return (
          <a
            href={value}
            target="_blank"
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            className="text-emerald-400 underline font-mono break-all hover:text-emerald-300"
          >
            "{value}"
          </a>
        );
      }
      return <span className="text-emerald-400 font-mono break-words">"{value}"</span>;
    }
    return <span className="text-slate-300 font-mono">{String(value)}</span>;
  };

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  if (isObject) {
    const isArray = Array.isArray(value);
    const keys = Object.keys(value);
    const isEmpty = keys.length === 0;

    const openingBrace = isArray ? "[" : "{";
    const closingBrace = isArray ? "]" : "}";

    return (
      <div className="font-mono text-[11px] leading-relaxed select-text text-left">
        <div
          className={`flex items-start py-0.5 hover:bg-slate-800/40 rounded px-1 group cursor-pointer`}
          style={{ paddingLeft: `${indent}px` }}
          onClick={toggleExpand}
        >
          {!isEmpty && (
            <button
              type="button"
              className="mt-0.5 mr-1 text-slate-500 hover:text-slate-300 focus:outline-none transition-transform"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          )}
          {isEmpty && <span className="w-4" />}

          {nodeKey !== "" && (
            <span className="text-sky-300 font-semibold mr-1.5">
              "{nodeKey}":
            </span>
          )}

          <span className="text-slate-400">
            {openingBrace}
            {!isExpanded && (
              <span className="text-amber-400 px-1 font-bold text-[10px] bg-slate-800 rounded mx-1">
                {isArray ? `${value.length} items` : `${keys.length} keys`}
              </span>
            )}
            {!isExpanded && closingBrace}
            {!isExpanded && !isLast && ","}
          </span>
        </div>

        {isExpanded && !isEmpty && (
          <div className="border-l border-slate-700/50 ml-2 pl-2">
            {keys.map((k, index) => (
              <JsonTreeNode
                key={k}
                nodeKey={isArray ? index : k}
                value={value[k]}
                level={level + 1}
                isLast={index === keys.length - 1}
              />
            ))}
          </div>
        )}

        {isExpanded && (
          <div className="text-slate-400" style={{ paddingLeft: `${indent + 16}px` }}>
            {closingBrace}
            {!isLast && ","}
          </div>
        )}
      </div>
    );
  }

  // Primitive leaf node
  return (
    <div
      className="flex items-start py-0.5 font-mono text-[11px] hover:bg-slate-800/20 rounded px-1 text-left"
      style={{ paddingLeft: `${indent + 16}px` }}
    >
      {nodeKey !== "" && (
        <span className="text-sky-300 font-semibold mr-1.5">
          "{nodeKey}":
        </span>
      )}
      {renderValue()}
      {!isLast && <span className="text-slate-400">,</span>}
    </div>
  );
};

export const CodeViewer: React.FC<CodeViewerProps> = ({
  code,
  title,
  language = "json",
  badge = "Payload",
  compactHeight = "max-h-[160px]",
  tokenCount
}) => {
  const [activeTab, setActiveTab] = useState<"highlighted" | "tree" | "raw">(
    language === "json" ? "highlighted" : "highlighted"
  );
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWrapped, setIsWrapped] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  
  const codePreRef = useRef<HTMLPreElement>(null);

  // Parse code for interactive tree view
  const parsedJson = useMemo(() => {
    if (language !== "json") return null;
    try {
      return JSON.parse(code);
    } catch (e) {
      // Try cleaning JSON if it's an ndjson or text with JSON inside
      try {
        const firstBrace = code.indexOf("{");
        const lastBrace = code.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          const cleaned = code.substring(firstBrace, lastBrace + 1);
          return JSON.parse(cleaned);
        }
      } catch (_) {}
      return null;
    }
  }, [code, language]);

  // Handle Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  // Handle File Download
  const handleDownload = () => {
    const ext = language === "json" ? "json" : "txt";
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/\s+/g, "_")}_raw.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Syntax highlighting using Prism
  const highlightedHtml = useMemo(() => {
    try {
      const langDef = Prism.languages[language] || Prism.languages.clike;
      return Prism.highlight(code, langDef, language);
    } catch (e) {
      return code;
    }
  }, [code, language]);

  // Search functionality in highlight/raw tab
  useEffect(() => {
    if (!searchQuery) {
      setSearchMatches([]);
      setSearchIndex(0);
      return;
    }

    const matches: number[] = [];
    const regex = new RegExp(searchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "gi");
    let match;
    const textContent = code;

    while ((match = regex.exec(textContent)) !== null) {
      matches.push(match.index);
    }

    setSearchMatches(matches);
    setSearchIndex(matches.length > 0 ? 1 : 0);
  }, [searchQuery, code]);

  const handleNextSearch = () => {
    if (searchMatches.length === 0) return;
    setSearchIndex((prev) => (prev % searchMatches.length) + 1);
  };

  const handlePrevSearch = () => {
    if (searchMatches.length === 0) return;
    setSearchIndex((prev) => (prev === 1 ? searchMatches.length : prev - 1));
  };

  // Scroll current match into view
  useEffect(() => {
    if (searchMatches.length > 0 && searchIndex > 0 && codePreRef.current) {
      const matchPos = searchMatches[searchIndex - 1];
      const text = code;
      const linesBefore = text.slice(0, matchPos).split("\n").length - 1;
      
      const preEl = codePreRef.current;
      const charHeight = 16; // approximate line height
      preEl.scrollTop = linesBefore * charHeight - 60;
    }
  }, [searchIndex, searchMatches]);

  // Bind Escape key to close fullscreen
  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  const elementContent = (
    <div
      className={`flex flex-col bg-[#111625] text-slate-100 rounded-2xl border border-slate-800/85 overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "w-full h-full max-w-6xl max-h-[85vh] shadow-2xl border-slate-700"
          : "relative w-full shadow-elevation-1"
      }`}
      dir="ltr"
    >
      {/* Top Header Controls bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0b0e1a] border-b border-slate-800 select-none">
        <div className="flex items-center gap-2">
          {/* Badge */}
          <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
            {badge}
          </span>
          {tokenCount !== undefined && tokenCount > 0 && (
            <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25 font-mono flex items-center gap-1">
              <span className="text-[8px] opacity-75">TOKENS:</span> {tokenCount.toLocaleString()}
            </span>
          )}
          <h3 className="text-xs font-black text-slate-200" dir="rtl">
            {title}
          </h3>
          {isFullscreen && (
            <span className="text-[9px] text-slate-500 font-mono hidden sm:inline ml-2">
              (اضغط ESC للخروج)
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Word wrap toggle */}
          <button
            onClick={() => setIsWrapped(!isWrapped)}
            title="التفاف الأسطر"
            className={`p-1.5 rounded-lg transition-colors duration-150 ${
              isWrapped
                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            title="نسخ بالكامل"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors duration-150"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            title="تحميل كملف"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors duration-150"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Full Screen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "تصغير النافذة" : "ملء الشاشة"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors duration-150 border border-slate-800"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Tabs / Submenu */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#141b2e] border-b border-slate-800/80">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("highlighted")}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 ${
              activeTab === "highlighted"
                ? "bg-slate-800 text-sky-400 font-extrabold shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code className="w-3 h-3" />
            تنسيق ملون (Code)
          </button>

          {parsedJson && (
            <button
              onClick={() => setActiveTab("tree")}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 ${
                activeTab === "tree"
                  ? "bg-slate-800 text-emerald-400 font-extrabold shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Braces className="w-3 h-3" />
              شجرة تفاعلية (Interactive Tree)
            </button>
          )}

          <button
            onClick={() => setActiveTab("raw")}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 ${
              activeTab === "raw"
                ? "bg-slate-800 text-amber-400 font-extrabold shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3 h-3" />
            نص خام (Raw Text)
          </button>
        </div>

        {/* Real-time search inputs */}
        {activeTab !== "tree" && (
          <div className="flex items-center gap-1">
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
              <input
                type="text"
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2 py-0.5 text-[9px] font-bold text-slate-200 bg-slate-900 border border-slate-800 rounded focus:outline-none focus:border-sky-500/50 w-[110px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 p-0.5 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {searchMatches.length > 0 && (
              <div className="flex items-center gap-0.5 text-[8px] text-slate-400 font-mono">
                <span>
                  {searchIndex}/{searchMatches.length}
                </span>
                <button
                  onClick={handlePrevSearch}
                  className="p-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                >
                  ▲
                </button>
                <button
                  onClick={handleNextSearch}
                  className="p-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                >
                  ▼
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div
        className={`flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed transition-all duration-150 ${
          isFullscreen ? "h-[calc(100vh-280px)] min-h-[400px]" : compactHeight
        }`}
        ref={codePreRef}
      >
        {activeTab === "highlighted" && (
          <pre
            className={`font-mono text-[10.5px] text-left text-slate-300 ${
              isWrapped ? "whitespace-pre-wrap break-all" : "whitespace-pre overflow-x-auto"
            }`}
          >
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        )}

        {activeTab === "tree" && parsedJson && (
          <div className="p-1 overflow-x-auto">
            <JsonTreeNode nodeKey="" value={parsedJson} level={0} isLast={true} />
          </div>
        )}

        {activeTab === "raw" && (
          <pre
            className={`font-mono text-[10.5px] text-left text-slate-300 ${
              isWrapped ? "whitespace-pre-wrap break-all" : "whitespace-pre overflow-x-auto"
            }`}
          >
            {code}
          </pre>
        )}
      </div>

      {/* Code summary info footer */}
      <div className="bg-[#0b0e1a] px-3.5 py-1.5 border-t border-slate-800/80 text-[8.5px] font-mono text-slate-500 flex justify-between items-center select-none">
        <div>
          حجم البيانات: <span className="text-slate-400 font-bold">{(code.length / 1024).toFixed(2)} KB</span> • أسطر الكود: <span className="text-slate-400 font-bold">{code.split("\n").length}</span>
        </div>
        <div>
          تنسيق ملوّن عبر <span className="text-sky-500 font-bold">Prism.js</span>
        </div>
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <div 
        className="fixed inset-0 bg-[#060814]/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4 md:p-8"
        onClick={() => setIsFullscreen(false)}
      >
        <div 
          className="w-full h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking card
        >
          {elementContent}
        </div>
      </div>
    );
  }

  return elementContent;
};
