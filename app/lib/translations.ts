// Lazy-loads a bundled translation edition (data/translations/{id}.json). Each
// edition is a separate chunk, so only the active one downloads; the service
// worker caches it for offline use. Memoized so an edition loads once.
//
// `id` is a translation-edition id (see translation-editions.ts), not a language
// code — most ids equal their language (e.g. "en"), but a language can have
// several (e.g. "en", "en-khattab"), each its own file.

export type Translation = {
  source: string; // attribution, e.g. "Saheeh International"
  text: Record<string, string>; // "surah:ayah" -> translated text
};

const cache = new Map<string, Translation>();

export async function loadTranslation(id: string): Promise<Translation> {
  const cached = cache.get(id);
  if (cached) return cached;

  // Relative path (not the @ alias) so webpack builds one chunk per JSON file.
  const mod = await import(`../../data/translations/${id}.json`);
  const json = (mod.default ?? mod) as { source: string; text: Record<string, string> };
  const translation: Translation = { source: json.source, text: json.text };
  cache.set(id, translation);
  return translation;
}
