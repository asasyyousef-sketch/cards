import React from "react";

export interface Folder {
  id: string;
  parentId?: string; // Optional field for nested subfolders
  name: string;
  description?: string;
  color: string; // Hex color or styling class
  coverImage?: string;
  coverImagePosition?: string; // CSS object-position e.g. "50% 50%"
  frontLang: string; // e.g. "de", "en", "ar"
  backLang: string; // e.g. "ar", "en", "de"
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  folderId: string;
  frontText: string;
  frontLang: string;
  frontImage?: string;
  frontImagePosition?: string; // CSS object-position e.g. "50% 50%"
  frontAudioUrl?: string;
  backText: string;
  backLang: string;
  backImage?: string;
  backImagePosition?: string; // CSS object-position e.g. "50% 50%"
  backAudioUrl?: string;
  isArticleMode?: boolean; // German der/die/das mode
  correctArticle?: "der" | "die" | "das" | "die-plural" | "" | string; // der, die, das, die-plural
  isPluralMode?: boolean; // Toggle for plural form inputs
  pluralText?: string; // German plural text (e.g., "Tische")
  pluralLang?: string; // Pronunciation language for the plural
  translationHint?: string; // Arabic or English short translation shown under front text
  createdAt: string;
  streak: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  autoImageCandidates?: string[];
  imageSearchQuery?: string;
}

export function getCardSearchQuery(
  card: { frontText?: string; backText?: string; imageSearchQuery?: string }
): string {
  let sourceMode = "smart_auto";
  try {
    sourceMode = localStorage.getItem("settings_image_search_query_source") || "smart_auto";
  } catch (e) {}

  const front = card.frontText?.trim() || "";
  const back = card.backText?.trim() || "";
  const subject = front || back || "";
  const custom = card.imageSearchQuery?.trim() || "";

  if (sourceMode === "front_text_only") {
    return front || custom || subject || "flashcard";
  } else if (sourceMode === "back_text_only") {
    return back || custom || subject || "flashcard";
  } else if (sourceMode === "combined_front_back") {
    return [front, back].filter(Boolean).join(" ") || custom || subject || "flashcard";
  } else if (sourceMode === "custom_query_only") {
    return custom || front || subject || "flashcard";
  } else {
    // smart_auto (default): Use exact imageSearchQuery returned by AI if present!
    return custom || front || back || subject || "flashcard";
  }
}

export type ReviewMethod = 'challenge' | 'write' | 'listen' | 'article' | 'match' | 'classic' | 'puzzles';

export interface ReviewSessionState {
  method: ReviewMethod;
  cards: Flashcard[];
  currentIndex: number;
  score: number;
  startTime: number;
  isCompleted: boolean;
  history: { cardId: string; correct: boolean }[];
}

export interface DbStatus {
  supabaseActive: boolean;
  tablesExist: boolean;
  error: string | null;
}

export function getSafeImageStyle(positionString?: string): React.CSSProperties {
  if (!positionString) {
    return { objectPosition: "50% 50%" };
  }
  const parts = positionString.trim().split(/\s+/);
  const xStr = parts[0] || "50%";
  const yStr = parts[1] || "50%";
  const zoomStr = parts[2];
  
  const style: React.CSSProperties = {
    objectPosition: `${xStr} ${yStr}`,
  };
  
  if (zoomStr) {
    const zoom = parseFloat(zoomStr);
    if (!isNaN(zoom) && zoom !== 1) {
      // Extract numeric value from percentages (e.g. "52.4%" -> 52.4)
      const posX = parseFloat(xStr) || 50;
      const posY = parseFloat(yStr) || 50;
      
      // Calculate perfect centering offset shift based on zoom scale
      const translateX = (50 - posX) * (zoom - 1);
      const translateY = (50 - posY) * (zoom - 1);
      
      style.transform = `scale(${zoom}) translate(${translateX.toFixed(2)}%, ${translateY.toFixed(2)}%)`;
    }
  }
  
  return style;
}

export interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

export interface TranscriptDocument {
  id: string;
  title: string;
  videoId?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  languageCode?: string;
  languageLabel?: string;
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
}

export interface CorrectionItem {
  originalSegment: string;
  correctedSegment: string;
  type: "spelling" | "grammar" | "vocabulary" | "style";
  reasonAr: string;
}

export interface CorrectorAnalysis {
  score: number;
  gradeLabel: string;
  originalText: string;
  correctedText: string;
  hasErrors: boolean;
  corrections: CorrectionItem[];
  nativeVersion: string;
  improvedExpressionText?: string;
  improvedExpressionExplanationAr?: string;
  positiveFeedbackAr: string;
  grammarSummaryAr: string;
  explanationAr?: string;
}

export interface Persona {
  id: string;
  name: string;
  avatar: string; // Emoji or image URL
  job: string; // عمله / مهنته
  age: string; // عمره
  origin: string; // أصله / جنسيته
  relationship?: string; // صلة القرابة / العلاقة بالمستخدم (اختياري)
  toneStyle: string; // أسلوبه في الكلام
  backgroundTopics: string; // مواضيع أخرى مهمة عن الشخصية
  isDefault?: boolean;
}

export interface PersonaReply {
  personaId?: string;
  personaName: string;
  personaAvatar?: string;
  personaJob?: string;
  replyText: string;
  replyTextArabic?: string;
  imageQueries?: string[];
  imageUrls?: string[];
  userCorrection?: CorrectorAnalysis;
}

export interface CorrectorMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  sendMode?: "correct" | "chat" | "persona";
  personaId?: string;
  personaName?: string;
  aiModelName?: string;
  analysis?: CorrectorAnalysis;
  chatReply?: {
    title: string;
    replyText: string;
  };
  personaReply?: PersonaReply;
  targetLanguage?: string;
  isFollowUp?: boolean;
}

export interface ExercisePersona {
  id: string;
  name: string;
  job: string;
  avatar: string;
  origin?: string;
  toneStyle?: string;
  backgroundTopics?: string;
  relationship?: string;
  roleDescriptionAr?: string;
  imageSearchQuery?: string;
  promptInstructions?: string;
}

export interface ExerciseChecklistItem {
  id: string;
  speakerName: string;
  objective: string;
  isCompleted: boolean;
}

export interface CorrectorSession {
  id: string;
  title: string;
  targetLanguage: string;
  createdAt: string;
  messages: CorrectorMessage[];
  personaId?: string;
  chatType?: "free" | "exercise";
  exerciseContext?: string;
  exerciseVariables?: string;
  exerciseTitle?: string;
  userRole?: string;
  exercisePersonas?: ExercisePersona[];
  exerciseChecklist?: ExerciseChecklistItem[];
  isExerciseCompleted?: boolean;
}


