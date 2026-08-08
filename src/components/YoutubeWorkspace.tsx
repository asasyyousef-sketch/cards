import React, { useState } from "react";
import { 
  Youtube, 
  Search, 
  Trash2, 
  Edit3, 
  Sparkles, 
  ArrowRight, 
  Clock, 
  Save, 
  Plus, 
  CheckCircle2, 
  Languages, 
  FileText, 
  Play, 
  Loader2, 
  Video, 
  Maximize2,
  Menu,
  Compass
} from "lucide-react";
import { TranscriptDocument, TranscriptSegment } from "../types";

// Format seconds into MM:SS format
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const mStr = m.toString().padStart(2, "0");
  const sStr = s.toString().padStart(2, "0");
  
  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

interface YoutubeWorkspaceProps {
  transcripts: TranscriptDocument[];
  onSaveTranscripts: (updatedTranscripts: TranscriptDocument[]) => void;
  onSendToAI: (transcript: TranscriptDocument) => void;
  onToggleSidebar: () => void;
  onBackToLibrary?: () => void;
}

export const YoutubeWorkspace: React.FC<YoutubeWorkspaceProps> = React.memo(({
  transcripts,
  onSaveTranscripts,
  onSendToAI,
  onToggleSidebar,
  onBackToLibrary
}) => {
  // Navigation states: "list" or "view"
  const [activeDoc, setActiveDoc] = useState<TranscriptDocument | null>(null);
  
  // Extraction states
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<"youtube" | "direct">("direct");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [checkingUrl, setCheckingUrl] = useState(false);
  const [checkingError, setCheckingError] = useState<string | null>(null);
  
  // Video Metadata returned from API
  const [videoInfo, setVideoInfo] = useState<{
    videoId: string;
    title: string;
    thumbnailUrl: string;
    captionTracks: { label: string; langCode: string; baseUrl: string }[];
  } | null>(null);
  
  const [selectedTrackUrl, setSelectedTrackUrl] = useState("");
  const [selectedTrackLabel, setSelectedTrackLabel] = useState("");
  const [selectedTrackLang, setSelectedTrackLang] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractSuccess, setExtractSuccess] = useState(false);

  // File upload states
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedText, setUploadedText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [shouldSplit, setShouldSplit] = useState(true);

  // File change handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".txt")) {
        setCheckingError("الرجاء اختيار ملف نصي بصيغة .txt فقط.");
        return;
      }
      setUploadedFile(file);
      setCheckingError(null);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setUploadedText(text);
      };
      reader.onerror = () => {
        setCheckingError("فشل في قراءة محتوى الملف.");
      };
      reader.readAsText(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.endsWith(".txt")) {
        setCheckingError("الرجاء اختيار ملف نصي بصيغة .txt فقط.");
        return;
      }
      setUploadedFile(file);
      setCheckingError(null);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setUploadedText(text);
      };
      reader.onerror = () => {
        setCheckingError("فشل في قراءة محتوى الملف.");
      };
      reader.readAsText(file);
    }
  };

  // Global search in Library list
  const [listSearch, setListSearch] = useState("");
  
  // Search within active document transcript segments
  const [docSearch, setDocSearch] = useState("");
  
  // Editing state for active document
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editingSegmentText, setEditingSegmentText] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Extract video ID helper
  const getYTId = (url: string) => {
    const p = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([^#\?&"'>]+)/;
    const match = url.match(p);
    return match ? match[1] : null;
  };

  // Step 1: Check YouTube URL info
  const handleCheckUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;

    setCheckingUrl(true);
    setCheckingError(null);
    setVideoInfo(null);
    setSelectedTrackUrl("");
    setSelectedTrackLabel("");
    setSelectedTrackLang("");
    setUploadedFile(null);
    setUploadedText("");

    try {
      const response = await fetch(`/api/youtube/info?url=${encodeURIComponent(youtubeUrl.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "فشل التحقق من الفيديو. يرجى التأكد من الرابط.");
      }

      setVideoInfo(data);
      if (data.captionTracks && data.captionTracks.length > 0) {
        // Pre-select first available caption track (prefer Arabic or English if found)
        const arTrack = data.captionTracks.find((t: any) => t.langCode === "ar");
        const enTrack = data.captionTracks.find((t: any) => t.langCode === "en");
        const defaultTrack = arTrack || enTrack || data.captionTracks[0];
        
        setSelectedTrackUrl(defaultTrack.baseUrl);
        setSelectedTrackLabel(defaultTrack.label);
        setSelectedTrackLang(defaultTrack.langCode);
      }
    } catch (err: any) {
      setCheckingError(err.message || "حدث خطأ أثناء التحقق من الرابط.");
    } finally {
      setCheckingUrl(false);
    }
  };

  // Automatic splitting helper
  const splitTextAutomatically = (text: string): { segments: TranscriptSegment[]; isUnsplit: boolean } => {
    const rawText = text.trim();
    if (!rawText) {
      return { segments: [], isUnsplit: false };
    }

    // If split option is disabled, treat the entire text as a single piece (unsplit)
    if (!shouldSplit) {
      const segments: TranscriptSegment[] = [{
        start: 0,
        duration: 10,
        text: rawText
      }];
      return { segments, isUnsplit: true };
    }

    // Try splitting by newlines first
    const newlineLines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (newlineLines.length > 1) {
      // Naturally split by newlines
      const segments = newlineLines.map((line, index) => ({
        start: index * 5,
        duration: 5,
        text: line
      }));
      return { segments, isUnsplit: false };
    }

    // Single block of text. Check for sentence punctuation: . ! ? ، ؟
    // Match clauses ending with . or ! or ? or ، or ؟
    const sentenceRegex = /([^.!?،؟]+[.!?،؟]*)/g;
    const matches = rawText.match(sentenceRegex);
    const sentenceSegments = matches
      ? matches.map((s) => s.trim()).filter((s) => s.length > 0)
      : [];

    if (sentenceSegments.length > 1) {
      // Naturally split by sentence punctuation
      const segments = sentenceSegments.map((sentence, index) => ({
        start: index * 5,
        duration: 5,
        text: sentence
      }));
      return { segments, isUnsplit: false };
    }

    // Could not split naturally (no newlines and no punctuation) -> Treat as unsplit spTT containing the entire text as a single piece
    const segments: TranscriptSegment[] = [{
      start: 0,
      duration: 10,
      text: rawText
    }];

    return { segments, isUnsplit: true };
  };

  // Step 2: Fetch and Parse Uploaded/Transcript segments
  const handleExtractTranscript = async () => {
    if (!uploadedText.trim()) {
      setCheckingError("الرجاء رفع ملف نصي .txt يحتوي على النص الدراسي أولاً.");
      return;
    }

    setExtracting(true);
    setCheckingError(null);

    try {
      const fileName = uploadedFile?.name || "ملف نصي";
      const cleanFileName = fileName.replace(/\.txt$/i, "");
      
      const { segments, isUnsplit } = splitTextAutomatically(uploadedText);

      if (segments.length === 0) {
        throw new Error("الملف النصي المرفوع فارغ أو لا يحتوي على أسطر صالحة.");
      }

      // Determine the document title
      const title = addMode === "direct" 
        ? (isUnsplit ? `spTT - ${cleanFileName}` : cleanFileName)
        : (videoInfo?.title || cleanFileName);

      const isSpTT = isUnsplit;

      // Create new spT/spTT document
      const newDoc: TranscriptDocument = {
        id: `spt-${Date.now()}`,
        title: title,
        videoId: addMode === "youtube" ? (videoInfo?.videoId || getYTId(youtubeUrl) || undefined) : undefined,
        videoUrl: addMode === "youtube" && youtubeUrl.trim() ? `https://www.youtube.com/watch?v=${videoInfo?.videoId}` : undefined,
        thumbnailUrl: addMode === "youtube" 
          ? (videoInfo?.thumbnailUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=400")
          : (isSpTT 
              ? "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=400" // Book image for unsplit
              : "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=400" // Standard study image for split
            ),
        languageCode: isSpTT ? "spTT" : "uploaded",
        languageLabel: isSpTT ? "spTT (غير مقسم)" : "ملف مرفوع",
        segments: segments,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const updatedList = [newDoc, ...transcripts];
      onSaveTranscripts(updatedList);
      
      setExtractSuccess(true);
      setTimeout(() => {
        setExtractSuccess(false);
        setShowAddForm(false);
        setYoutubeUrl("");
        setVideoInfo(null);
        setUploadedFile(null);
        setUploadedText("");
        setActiveDoc(newDoc);
        setDocTitle(newDoc.title);
        setHasChanges(false);
      }, 1500);

    } catch (err: any) {
      setCheckingError(err.message || "حدث خطأ أثناء استخراج النص.");
    } finally {
      setExtracting(false);
    }
  };

  // Edit segment handler
  const handleStartEditSegment = (index: number, text: string) => {
    setEditingSegmentIndex(index);
    setEditingSegmentText(text);
  };

  const handleSaveSegmentEdit = (index: number) => {
    if (!activeDoc) return;
    
    const updatedSegments = [...activeDoc.segments];
    updatedSegments[index] = {
      ...updatedSegments[index],
      text: editingSegmentText
    };

    setActiveDoc({
      ...activeDoc,
      segments: updatedSegments
    });
    
    setEditingSegmentIndex(null);
    setHasChanges(true);
  };

  // Save changes to active spT Document
  const handleSaveDocChanges = () => {
    if (!activeDoc) return;

    const updatedDoc: TranscriptDocument = {
      ...activeDoc,
      title: docTitle,
      updatedAt: new Date().toISOString()
    };

    const updatedList = transcripts.map(doc => doc.id === doc.id && doc.id === activeDoc.id ? updatedDoc : doc);
    onSaveTranscripts(updatedList);
    
    setActiveDoc(updatedDoc);
    setHasChanges(false);
  };

  // Delete an spT document
  const handleDeleteDoc = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("هل أنت متأكد من رغبتك في حذف هذا الملف النصي بشكل نهائي؟")) {
      return;
    }

    const updatedList = transcripts.filter(doc => doc.id !== id);
    onSaveTranscripts(updatedList);
    
    if (activeDoc && activeDoc.id === id) {
      setActiveDoc(null);
    }
  };

  // Search filtered library lists
  const filteredDocs = transcripts.filter(doc => 
    doc.title.toLowerCase().includes(listSearch.toLowerCase())
  );

  // Search filtered active doc segments
  const filteredSegments = activeDoc ? activeDoc.segments.map((seg, origIdx) => ({
    ...seg,
    origIdx
  })).filter(seg => 
    seg.text.toLowerCase().includes(docSearch.toLowerCase())
  ) : [];

  return (
    <main className="flex-1 flex flex-col h-full bg-[#f8fafc] overflow-hidden" dir="rtl">
      {/* HEADER SECTION */}
      <header className="px-6 md:px-8 py-4 bg-[#f8fafc] border-b border-slate-100 flex items-center justify-between shrink-0">
        {/* Right side: Navigation & Action Buttons */}
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

          {activeDoc ? (
            <button
              onClick={() => setActiveDoc(null)}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-700 transition-all cursor-pointer active:scale-95"
            >
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span>العودة للمقاطع</span>
            </button>
          ) : (
            <>
              {onBackToLibrary && (
                <button
                  onClick={onBackToLibrary}
                  className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-700 transition-all cursor-pointer active:scale-95"
                >
                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                  <span>الرجوع للمكتبة</span>
                </button>
              )}

              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-[10px] font-bold transition-all cursor-pointer active:scale-95 ${
                  showAddForm 
                    ? "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-150" 
                    : "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100"
                }`}
              >
                <span>{showAddForm ? "عرض المقاطع المحفوظة" : "سحب ملف أو فيديو جديد"}</span>
              </button>
            </>
          )}
        </div>

        {/* Left side: Simple Icon + Title */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">تفريغ اليوتيوب الدراسي (spT)</span>
          <Youtube className="w-4 h-4 text-rose-600 animate-pulse" />
        </div>
      </header>

      {/* DETAILED WORKSPACE CANVAS */}
      <div className="flex-1 overflow-hidden relative">
        {activeDoc ? (
          /* ACTIVE DOCUMENT TRANSCRIPT VIEW & EDITOR */
          <div className="h-full flex flex-col md:flex-row overflow-hidden">
            
            {/* Right side panel: Document Details & Video Metadata */}
            <div className="w-full md:w-80 bg-white border-l border-slate-100 p-5 overflow-y-auto flex flex-col gap-5 shrink-0">
              {/* Cover Banner */}
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-xs border border-slate-100">
                <img 
                  src={activeDoc.thumbnailUrl || `https://img.youtube.com/vi/${activeDoc.videoId}/0.jpg`} 
                  alt={activeDoc.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                  <a 
                    href={activeDoc.videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-3 bg-white/90 hover:bg-white hover:scale-110 transition-all rounded-full text-rose-600 shadow-md cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-rose-600 shrink-0" />
                  </a>
                </div>
              </div>

              {/* Editable Title */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">اسم الملف النصي (spT):</label>
                <input 
                  type="text" 
                  value={docTitle} 
                  onChange={(e) => {
                    setDocTitle(e.target.value);
                    setHasChanges(true);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 focus:border-rose-500 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              {/* Status and Details */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">اللغة المصحوبة:</span>
                  <span className="px-2 py-0.5 bg-rose-50 border border-rose-100 rounded-md text-[10px] font-black text-rose-600">
                    {activeDoc.languageLabel || activeDoc.languageCode || "غير محدد"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">عدد الأسطر:</span>
                  <span className="font-bold text-slate-700">{activeDoc.segments.length} سطر</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">تاريخ السحب:</span>
                  <span className="font-bold text-slate-500 text-[10px]" dir="ltr">
                    {new Date(activeDoc.createdAt).toLocaleDateString("ar-EG")}
                  </span>
                </div>
              </div>

              {/* Control Actions */}
              <div className="mt-auto space-y-2 pt-4">
                {hasChanges && (
                  <button
                    onClick={handleSaveDocChanges}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-emerald-100 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ كافة التعديلات</span>
                  </button>
                )}

                <button
                  onClick={() => onSendToAI(activeDoc)}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-violet-100 cursor-pointer animate-pulse"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>توليد فلاش كارد بالذكاء ⚡</span>
                </button>

                <button
                  onClick={() => handleDeleteDoc(activeDoc.id)}
                  className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف الملف نهائياً</span>
                </button>
              </div>
            </div>

            {/* Left Main Pane: Interactive Subtitles List */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Document Search Bar */}
              <div className="p-4 bg-white border-b border-slate-100 shrink-0">
                <div className="relative">
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ابحث عن كلمة أو فكرة معينة داخل المحاضرة..."
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-rose-500/10 transition-all font-semibold"
                  />
                </div>
              </div>

              {/* Transcript list container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/50">
                {filteredSegments.length > 0 ? (
                  filteredSegments.map((seg) => {
                    const isEditing = editingSegmentIndex === seg.origIdx;
                    return (
                      <div 
                        key={seg.origIdx}
                        className={`group bg-white p-3.5 rounded-2xl border transition-all flex items-start gap-4 ${
                          isEditing 
                            ? "border-rose-500 shadow-sm" 
                            : "border-slate-100 hover:border-slate-200 hover:shadow-xs"
                        }`}
                      >
                        {/* Timestamp badge */}
                        <div className="flex items-center gap-1 shrink-0 px-2.5 py-1.5 bg-slate-50 text-slate-500 rounded-xl font-mono text-[11px] font-bold">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatTime(seg.start)}</span>
                        </div>

                        {/* Text display / input area */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingSegmentText}
                                onChange={(e) => setEditingSegmentText(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-rose-500 focus:bg-white focus:outline-none rounded-xl text-xs font-semibold leading-relaxed"
                                rows={2}
                              />
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => setEditingSegmentIndex(null)}
                                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                                <button
                                  onClick={() => handleSaveSegmentEdit(seg.origIdx)}
                                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
                                >
                                  <Save className="w-3 h-3" />
                                  <span>تطبيق</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                                {seg.text}
                              </p>
                              
                              <button
                                onClick={() => handleStartEditSegment(seg.origIdx, seg.text)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-rose-600 transition-all cursor-pointer shrink-0"
                                title="تعديل هذا الجزء من النص"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-center">
                    <FileText className="w-10 h-10 text-slate-200 mb-2" />
                    <span className="text-xs font-bold text-slate-400">
                      {docSearch ? "لا توجد نتائج بحث مطابقة." : "التفريغ فارغ حالياً."}
                    </span>
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : showAddForm ? (
          /* extraction screen */
          <div className="h-full overflow-y-auto p-6 flex justify-center">
            <div className="max-w-2xl w-full space-y-6 mt-4">
              
              {/* Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/40" dir="rtl">
                <button
                  type="button"
                  onClick={() => {
                    setAddMode("direct");
                    setCheckingError(null);
                    setVideoInfo(null);
                    setUploadedFile(null);
                    setUploadedText("");
                  }}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                    addMode === "direct"
                      ? "bg-white text-rose-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>رفع ملف نصي مباشر</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMode("youtube");
                    setCheckingError(null);
                    setUploadedFile(null);
                    setUploadedText("");
                  }}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                    addMode === "youtube"
                      ? "bg-white text-rose-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  <Youtube className="w-4 h-4" />
                  <span>ربط فيديو يوتيوب مع ملف ترجمة</span>
                </button>
              </div>

              {addMode === "youtube" ? (
                <>
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Youtube className="w-5 h-5 text-rose-600 shrink-0" />
                      <h3 className="text-sm font-black text-slate-800">أدخل رابط فيديو يوتيوب لسحب الترجمة</h3>
                    </div>

                    <form onSubmit={handleCheckUrl} className="flex gap-2">
                      <input
                        type="url"
                        placeholder="ضع رابط الفيديو هنا، مثلاً: https://www.youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        disabled={checkingUrl || extracting}
                        className="flex-1 px-4 py-2.5 border border-slate-200 focus:border-rose-500 focus:outline-none rounded-xl text-xs font-semibold"
                        required
                      />
                      <button
                        type="submit"
                        disabled={checkingUrl || !youtubeUrl.trim() || extracting}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {checkingUrl ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>جاري التحقق...</span>
                          </>
                        ) : (
                          <span>التحقق من الفيديو</span>
                        )}
                      </button>
                    </form>

                    {checkingError && (
                      <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 font-semibold text-xs rounded-xl leading-relaxed">
                        ⚠️ {checkingError}
                      </div>
                    )}
                  </div>

                  {/* Video Info Card (Displays after Check) */}
                  {videoInfo && (
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden animate-fade-in flex flex-col md:flex-row">
                      {/* Thumbnail Cover */}
                      <div className="w-full md:w-56 aspect-video md:aspect-auto relative shrink-0">
                        <img 
                          src={videoInfo.thumbnailUrl} 
                          alt={videoInfo.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Details and Extract controls */}
                      <div className="flex-1 p-5 flex flex-col justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <span className="px-2 py-0.5 bg-rose-50 text-[10px] font-black text-rose-600 rounded">يوتيوب 🎥</span>
                          </div>
                          <h4 className="text-xs font-black text-slate-800 leading-relaxed">
                            {videoInfo.title}
                          </h4>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">يرجى رفع ملف نصي (.txt) يحتوي على نص الفيديو:</label>
                            
                            {/* Drag and Drop Zone */}
                            <div
                              onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
                                isDragging 
                                  ? "border-rose-500 bg-rose-50/55" 
                                  : uploadedFile 
                                    ? "border-emerald-500 bg-emerald-50/20" 
                                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                              }`}
                            >
                              <input
                                type="file"
                                id="txt-upload-yt"
                                accept=".txt"
                                onChange={handleFileChange}
                                className="hidden"
                              />
                              <label htmlFor="txt-upload-yt" className="cursor-pointer block space-y-1">
                                <FileText className={`w-8 h-8 mx-auto ${uploadedFile ? "text-emerald-500" : "text-slate-400"}`} />
                                {uploadedFile ? (
                                  <div className="text-xs font-bold text-slate-800">
                                    تم اختيار: <span className="text-emerald-600">{uploadedFile.name}</span>
                                  </div>
                                ) : (
                                  <div className="text-[11px] font-bold text-slate-500">
                                    اسحب وأسقط ملف الـ txt هنا، أو <span className="text-rose-600 hover:underline">انقر للاختيار من جهازك</span>
                                  </div>
                                )}
                                <p className="text-[9px] text-slate-400 font-semibold">الملفات المدعومة: .txt فقط (ترميز UTF-8)</p>
                              </label>
                            </div>
                          </div>

                          {uploadedFile && (
                            <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                              <span className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]">
                                {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadedFile(null);
                                  setUploadedText("");
                                }}
                                className="p-1 hover:bg-rose-100 text-rose-500 rounded-lg transition-colors cursor-pointer"
                                title="إزالة الملف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {/* Splitting Option Checkbox */}
                          <label className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100/80 p-3 rounded-xl border border-slate-200/50 cursor-pointer transition-colors select-none">
                            <input
                              type="checkbox"
                              checked={shouldSplit}
                              onChange={(e) => setShouldSplit(e.target.checked)}
                              className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 accent-rose-600 cursor-pointer"
                            />
                            <div className="space-y-0.5 text-right flex-1">
                              <span className="text-xs font-black text-slate-700 block">تجزئة النص تلقائياً لأسطر تفاعلية</span>
                              <span className="text-[10px] font-semibold text-slate-400 block">عند إلغاء التحديد، سيتم حفظ النص بالكامل كقطعة واحدة غير مقسمة (spTT).</span>
                            </div>
                          </label>

                          {extractSuccess ? (
                            <div className="py-2.5 bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-emerald-100">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>تم معالجة الملف بنجاح وحفظه في ملف spT!</span>
                            </div>
                          ) : (
                            <button
                              onClick={handleExtractTranscript}
                              disabled={extracting || !uploadedText.trim()}
                              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-rose-100 cursor-pointer disabled:opacity-50"
                            >
                              {extracting ? (
                                <>
                                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                                  <span>جاري معالجة وحفظ النص...</span>
                                </>
                              ) : (
                                <>
                                  <FileText className="w-4 h-4" />
                                  <span>حفظ واستخراج النص (spT)</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Direct Upload Tab */
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-rose-600 shrink-0" />
                    <h3 className="text-sm font-black text-slate-800">ارفع ملفاً نصياً مباشرة للدراسة</h3>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      ارفع ملف نصي بمحاضرتك أو نصوصك الدراسية. سيقوم النظام بـ <span className="text-emerald-600 font-bold">تجزئة النص تلقائياً لأسطر تفاعلية</span> لتتمكن من دراستها والتعامل مع المساعد الذكي. وفي حال تعذر تقسيمه، سيتم حفظه فوراً كملف نصي غير مقسم <span className="text-rose-600 font-bold">spTT</span> دون أي رفض.
                    </p>

                    <div className="space-y-1">
                      {/* Drag and Drop Zone */}
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                          isDragging 
                            ? "border-rose-500 bg-rose-50/55" 
                            : uploadedFile 
                              ? "border-emerald-500 bg-emerald-50/20" 
                              : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                        }`}
                      >
                        <input
                          type="file"
                          id="txt-upload-direct"
                          accept=".txt"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <label htmlFor="txt-upload-direct" className="cursor-pointer block space-y-2">
                          <FileText className={`w-10 h-10 mx-auto ${uploadedFile ? "text-emerald-500" : "text-slate-400"}`} />
                          {uploadedFile ? (
                            <div className="text-xs font-bold text-slate-800">
                              تم اختيار الملف: <span className="text-emerald-600">{uploadedFile.name}</span>
                            </div>
                          ) : (
                            <div className="text-[11px] font-bold text-slate-500">
                              اسحب وأسقط ملف الـ txt هنا، أو <span className="text-rose-600 hover:underline">انقر للاختيار من جهازك</span>
                            </div>
                          )}
                          <p className="text-[9px] text-slate-400 font-semibold">الملفات المدعومة: .txt فقط (ترميز UTF-8)</p>
                        </label>
                      </div>
                    </div>

                     {uploadedFile && (
                      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 truncate max-w-[250px]">
                          {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFile(null);
                            setUploadedText("");
                          }}
                          className="p-1 hover:bg-rose-100 text-rose-500 rounded-lg transition-colors cursor-pointer"
                          title="إزالة الملف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Splitting Option Checkbox */}
                    <label className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100/80 p-3.5 rounded-2xl border border-slate-200/50 cursor-pointer transition-colors select-none">
                      <input
                        type="checkbox"
                        checked={shouldSplit}
                        onChange={(e) => setShouldSplit(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 accent-rose-600 cursor-pointer"
                      />
                      <div className="space-y-0.5 text-right flex-1">
                        <span className="text-xs font-black text-slate-700 block">تجزئة النص تلقائياً لأسطر تفاعلية</span>
                        <span className="text-[10px] font-semibold text-slate-400 block">عند إلغاء التحديد، سيتم حفظ النص بالكامل كقطعة واحدة غير مقسمة (spTT).</span>
                      </div>
                    </label>

                    {checkingError && (
                      <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 font-semibold text-xs rounded-xl leading-relaxed">
                        ⚠️ {checkingError}
                      </div>
                    )}

                    {extractSuccess ? (
                      <div className="py-2.5 bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-emerald-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>تم معالجة الملف بنجاح وحفظه في المكتبة الدراسية!</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleExtractTranscript}
                        disabled={extracting || !uploadedText.trim()}
                        className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-rose-100 cursor-pointer disabled:opacity-50"
                      >
                        {extracting ? (
                          <>
                            <Loader2 className="w-4.5 h-4.5 animate-spin" />
                            <span>جاري معالجة وحفظ الملف...</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            <span>حفظ واستخراج النص (spT)</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-slate-500 text-[11px] leading-relaxed space-y-1.5 font-bold">
                <span className="text-slate-800 font-black block">💡 نصيحة تفيدك كطالب:</span>
                <p>تعتبر الفيديوهات والمحاضرات على يوتيوب كنزاً دراسياً كبيراً، ولكن قراءة النصوص وسحبها يدوياً يضيع الكثير من الوقت. نظامنا يسمح لك بسحب النص في أقل من ثانيتين وترتيبه، مما يعطيك مطلق الحرية للعمل عليه كـ "قطع ليجو منفصلة" واستخدامه بذكاء مع المساعد الذكي لتوليد بطاقات دراسية غنية ومثالية.</p>
              </div>

            </div>
          </div>
        ) : (
          /* SAVED TRANSCRIPTS LIST LIBRARY */
          <div className="h-full flex flex-col overflow-hidden">
            {/* Search Bar */}
            <div className="p-4 bg-white border-b border-slate-100 flex items-center gap-4 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث داخل مكتبتك عن الملفات النصية المسحوبة spT..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  className="w-full pr-10 pl-4 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl text-xs focus:outline-none transition-all font-semibold"
                />
              </div>
            </div>

            {/* Scrollable grid of documents */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredDocs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredDocs.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => {
                        setActiveDoc(doc);
                        setDocTitle(doc.title);
                        setHasChanges(false);
                      }}
                      className="group bg-white rounded-3xl border border-slate-100 hover:border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer flex flex-col justify-between"
                    >
                      {/* Image Banner */}
                      <div className="aspect-video relative w-full overflow-hidden bg-slate-100">
                        <img 
                          src={doc.thumbnailUrl || `https://img.youtube.com/vi/${doc.videoId}/0.jpg`} 
                          alt={doc.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute top-3 left-3 px-2 py-0.5 bg-black/45 backdrop-blur-xs text-[9px] font-black text-white rounded">
                          {doc.languageLabel || doc.languageCode || "spT"}
                        </div>
                      </div>

                      {/* Info & Card Metadata */}
                      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                        <div className="space-y-1">
                          <h3 className="text-xs font-black text-slate-800 line-clamp-2 leading-relaxed">
                            {doc.title}
                          </h3>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{doc.segments.length} سطر</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSendToAI(doc);
                              }}
                              className="p-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-xl transition-all border border-violet-100/50"
                              title="التحويل للمساعد الذكي"
                            >
                              <Sparkles className="w-3.5 h-3.5 shrink-0" />
                            </button>
                            
                            <button
                              onClick={(e) => handleDeleteDoc(doc.id, e)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all border border-rose-100/50"
                              title="حذف الملف"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-3 border border-rose-100">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-700">مكتبتك خالية حالياً</h3>
                  <p className="text-xs text-slate-400 font-bold mt-1 max-w-sm">
                    {listSearch 
                      ? "لا توجد ملفات نصية تطابق عبارة البحث." 
                      : "لم تقم بسحب أي نصوص يوتيوب بعد. انقر على 'سحب فيديو جديد' في الأعلى للبدء."}
                  </p>
                  
                  {!listSearch && (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      سحب أول فيديو الآن 🎥
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
});
