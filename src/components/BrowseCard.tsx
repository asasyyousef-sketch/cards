import React, { useState, useEffect } from "react";
import { Volume2, EyeOff, Layers, Trash2, Check, Pencil, Plus } from "lucide-react";
import { Flashcard, getSafeImageStyle } from "../types";
import { speakClient } from "./Modals";

interface BrowseCardProps {
  card: Flashcard;
  globalFlipped: boolean;
  onFlipToggle: () => void;
  hideFront: boolean;
  hideBack: boolean;
  frontLang: string;
  backLang: string;
  onDiscard: () => void;
  onKeep: () => void;
  onEdit?: () => void;
}

export const BrowseCard: React.FC<BrowseCardProps> = React.memo(({
  card,
  globalFlipped,
  onFlipToggle,
  hideFront,
  hideBack,
  frontLang,
  backLang,
  onDiscard,
  onKeep,
  onEdit,
}) => {
  // Capture card in local state so it stays exactly the same when unmounting/exiting
  const [localCard, setLocalCard] = useState(card);

  useEffect(() => {
    setLocalCard(card);
  }, [card]);

  // Track flipping locally but synchronized with global state changes
  const [localFlipped, setLocalFlipped] = useState(globalFlipped);

  const [revealFrontTemp, setRevealFrontTemp] = useState(false);
  const [revealBackTemp, setRevealBackTemp] = useState(false);
  const [showPlural, setShowPlural] = useState(false);

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
      <div className="w-full h-full relative flip-card-inner rounded-2xl shadow-elevation-3 bg-surface-container-lowest">
        
        {/* FRONT FACE */}
        <div className="absolute inset-0 w-full h-full flip-card-front rounded-2xl flex flex-col p-5 border border-outline-variant/40 bg-surface-container-lowest overflow-hidden justify-between">
          <div className="flex-1 flex flex-col">
            <div className="w-full h-[210px] rounded-xl overflow-hidden relative mb-3 border border-outline-variant/10 flex items-center justify-center bg-surface-container-low shrink-0">
              {localCard.frontImage ? (
                <img
                  src={localCard.frontImage}
                  alt="Illustration"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={getSafeImageStyle(localCard.frontImagePosition)}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="text-primary/70 font-bold text-xs flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl">style</span>
                  <span>مفهوم تعليمي</span>
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  speakClient(localCard.frontText, frontLang);
                }}
                className="absolute top-3 left-3 p-2.5 rounded-full bg-white/90 backdrop-blur-sm text-primary hover:bg-primary hover:text-white transition-all shadow-sm cursor-pointer border border-outline-variant/10"
              >
                <Volume2 className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="text-center pb-2 flex-1 flex flex-col justify-center">
              {hideFront && !revealFrontTemp ? (
                <div 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent card flip
                    setRevealFrontTemp(true);
                  }}
                  className="py-3 px-5 bg-slate-50/50 hover:bg-slate-100/80 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 duration-200"
                >
                  <EyeOff className="w-4 h-4 text-slate-400" />
                  <span className="text-[11px] text-slate-500 font-medium">مخفي • انقر للكشف</span>
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-on-surface break-words whitespace-pre-wrap leading-normal px-2 flex flex-row items-center justify-center gap-2" dir="ltr">
                    {localCard.correctArticle && (
                      <span className={`text-xs px-2.5 py-1 rounded-lg font-black shrink-0 ${
                        localCard.correctArticle === "der" ? "bg-blue-600 text-white shadow-sm" :
                        localCard.correctArticle === "die" ? "bg-rose-600 text-white shadow-sm" :
                        localCard.correctArticle === "das" ? "bg-emerald-600 text-white shadow-sm" :
                        localCard.correctArticle === "die-plural" ? "bg-amber-500 text-white shadow-sm" :
                        "bg-primary text-white"
                      }`}>
                        {localCard.correctArticle === "die-plural" ? "die" : localCard.correctArticle}
                      </span>
                    )}
                    <span className="whitespace-pre-wrap">{localCard.frontText}</span>
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
                    <p className="text-[11px] font-bold text-on-surface-variant/70 mt-1">{localCard.translationHint}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Dedicated Tactile Action Buttons on Front Face */}
          <div className="flex gap-2.5 mt-2 border-t border-outline-variant/30 pt-3.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDiscard();
              }}
              className="flex-1 py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold text-xs hover:bg-red-500 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 duration-200"
            >
              <Trash2 className="w-4 h-4" /> استبعاد
            </button>
            
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="px-3.5 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs hover:bg-indigo-600 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 duration-200"
                title="تعديل تفاصيل البطاقة"
              >
                <Pencil className="w-4 h-4" /> تعديل
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onKeep();
              }}
              className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-xs hover:bg-primary/95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" /> احتفاظ
            </button>
          </div>
        </div>

        {/* BACK FACE */}
        <div className="absolute inset-0 w-full h-full flip-card-back rounded-2xl flex flex-col p-5 border-2 border-primary/20 bg-surface-container-lowest overflow-hidden justify-between">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (showPlural && localCard.pluralText) {
                    speakClient(localCard.pluralText, localCard.pluralLang || "de");
                  } else {
                    speakClient(localCard.backText, backLang);
                  }
                }}
                className="w-9 h-9 rounded-full bg-primary/5 text-primary flex items-center justify-center hover:bg-primary/20 transition-all cursor-pointer"
                title="نطق النص الحالي"
              >
                <Volume2 className="w-4.5 h-4.5" />
              </button>

              {/* Plural Toggle Button */}
              {localCard.isPluralMode && localCard.pluralText && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextShow = !showPlural;
                    setShowPlural(nextShow);
                    if (nextShow) {
                      speakClient(localCard.pluralText!, localCard.pluralLang || "de");
                    } else {
                      speakClient(localCard.backText, backLang);
                    }
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    showPlural 
                      ? "bg-purple-600 text-white shadow-sm hover:bg-purple-700" 
                      : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                  }`}
                  title={showPlural ? "العودة للترجمة" : "عرض صيغة الجمع للكلمة (+)"}
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-3 py-1 rounded-lg">الوجه الخلفي</span>
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
              <div className="flex flex-col items-center gap-2">
                <h3 className="text-xl font-bold text-on-surface leading-relaxed flex flex-col items-center justify-center gap-2 whitespace-pre-wrap">
                  {showPlural ? (
                    <div className="flex flex-col items-center gap-1.5 animate-fadeIn">
                      <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full">صيغة الجمع (Plural)</span>
                      <span className="whitespace-pre-wrap font-extrabold text-purple-900">{localCard.pluralText}</span>
                    </div>
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

          <div className="text-center text-[10px] text-slate-400 pb-1">
            انقر على البطاقة للعودة للوجه الأمامي
          </div>
        </div>

      </div>
    </div>
  );
});
