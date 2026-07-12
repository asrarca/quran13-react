// Lazy-loads a bundled per-language translation (data/translations/{lang}.json).
// Each language is a separate chunk, so only the active one downloads; the
// service worker caches it for offline use. Memoized so a language loads once.

import type { Lang } from "../i18n";

export type Translation = {
  source: string; // attribution, e.g. "Saheeh International"
  text: Record<string, string>; // "surah:ayah" -> translated text
};

const cache = new Map<Lang, Translation>();

export async function loadTranslation(lang: Lang): Promise<Translation> {
  const cached = cache.get(lang);
  if (cached) return cached;

  // Relative path (not the @ alias) so webpack builds one chunk per JSON file.
  const mod = await import(`../../data/translations/${lang}.json`);
  const json = (mod.default ?? mod) as { source: string; text: Record<string, string> };
  const translation: Translation = { source: json.source, text: json.text };
  cache.set(lang, translation);
  return translation;
}
