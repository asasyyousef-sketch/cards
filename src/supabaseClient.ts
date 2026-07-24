import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

let supabaseInstance: any = null;

/**
 * Checks if the Supabase credentials in the environment are valid (and not placeholders).
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  return !!(
    url &&
    url !== "https://your-supabase-project.supabase.co" &&
    url.trim() !== "" &&
    anonKey &&
    anonKey !== "your-supabase-anon-key" &&
    anonKey.trim() !== ""
  );
}

/**
 * Lazily gets the Supabase client instance.
 * Returns null if Supabase is not configured, which triggers a fallback to the local database.
 */
export function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  if (!isSupabaseConfigured()) {
    return null;
  }

  const url = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY!;

  try {
    supabaseInstance = createClient(url, anonKey);
    console.log("⚡ Supabase client initialized successfully!");
    return supabaseInstance;
  } catch (err) {
    console.error("❌ Failed to initialize Supabase client:", err);
    return null;
  }
}

/**
 * Returns the SQL script necessary for creating the 'decks' and 'cards' tables in Supabase.
 * This can be used to set up the DB schema via the Supabase SQL editor.
 */
export const SUPABASE_SQL_SCHEMA = `
-- Create decks table (corresponds to folders)
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
  "position" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) or grant permissions
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.decks FOR SELECT USING (true);
CREATE POLICY "Allow public write access" ON public.decks FOR ALL USING (true);

-- Create cards table (corresponds to flashcards)
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
  "position" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) or grant permissions for cards
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Allow public write access" ON public.cards FOR ALL USING (true);
`;
