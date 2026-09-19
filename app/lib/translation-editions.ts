// Registry of translation editions. Each edition is one JSON file in
// data/translations/ ({ source, text } — same shape as en.json). Editions are
// grouped by `lang`: a language with more than one edition shows an in-sheet
// picker (see TranslationSheet); a language with a single edition shows none.
//
// To add another translation (e.g. a second English one):
//   1. Add data/translations/<id>.json  ({ source, text }, keyed "surah:ayah")
//   2. Add a row below with that <id> and the matching `lang`
// Nothing else — the loader, picker, and persistence all key off this list.

import type { Lang } from "../i18n";

export type TranslationEdition = {
  id: string; // filename in data/translations/ (without .json) AND persisted value
  lang: Lang; // which language's picker this edition belongs to
  label: string; // short name for the picker pill (e.g. "The Clear Quran")
  source: string; // full attribution shown under the sheet title
};

// The `id` that equals its `lang` (e.g. "en") is that language's default edition.
export const TRANSLATION_EDITIONS: TranslationEdition[] = [
  { id: "en", lang: "en", label: "Saheeh International", source: "Saheeh International" },
  { id: "en-khattab", lang: "en", label: "The Clear Quran", source: "Dr. Mustafa Khattab, The Clear Quran" },
  { id: "ar", lang: "ar", label: "al-Muyassar", source: "Tafsir al-Muyassar (translation mode)" },
  { id: "de", lang: "de", label: "Bubenheim & Elyas", source: "Frank Bubenheim and Nadeem Elyas" },
  { id: "es", lang: "es", label: "Isa Garcia", source: "Sheikh Isa Garcia" },
  { id: "fr", lang: "fr", label: "Hamidullah", source: "Muhammad Hamidullah" },
  { id: "hi", lang: "hi", label: "Azizul Haque", source: "Maulana Azizul Haque al-Umari" },
  { id: "uk", lang: "uk", label: "Yaqubovic", source: "Dr. Mikhailo Yaqubovic" },
  { id: "ur", lang: "ur", label: "Jalandhari", source: "Fatah Muhammad Jalandhari" },
];

/** Editions available for a language, in registry order. */
export function editionsForLang(lang: Lang): TranslationEdition[] {
  return TRANSLATION_EDITIONS.filter((e) => e.lang === lang);
}

/** The default edition id for a language (the one whose id === lang, else the first). */
export function defaultEditionId(lang: Lang): string {
  const list = editionsForLang(lang);
  return (list.find((e) => e.id === lang) ?? list[0])?.id ?? lang;
}

export function getEdition(id: string): TranslationEdition | undefined {
  return TRANSLATION_EDITIONS.find((e) => e.id === id);
}

// Chosen edition per language, persisted as { [lang]: editionId }. Only touched
// client-side from the (post-hydration) sheet, so plain localStorage is enough —
// no cookie/SSR handling needed since the edition never affects first paint.
const STORAGE_KEY = "quran13-translation";

/** The whole { [lang]: editionId } map (empty on the server or if unset/corrupt). */
export function readEditionMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveSelectedEdition(lang: Lang, editionId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[lang] = editionId;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore write failures (private mode / storage full)
  }
}
