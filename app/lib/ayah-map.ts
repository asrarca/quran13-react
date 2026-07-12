// Typed lookup over data/ayah-map.json (built by scripts/build-ayah-map.mjs).
// Turns a verse key like "5:6" into the app's page/line for THIS 13-line mushaf.
//
// Page/line are in the app's internal numbering (1-based, Fatihah = page 1) —
// the SAME numbering as surah.page / juz.page in quran-data.json, so a resolved
// page can be passed straight to goToPage() with no offset.
//
// Accuracy note: the map is interpolated (~94% within ±1 page). Treat `page` as
// reliable-ish and `line` as approximate — navigate to the page, don't hard-flash
// the line.

import ayahMap from "@/data/ayah-map.json";

export type VerseLocation = { page: number; line: number };

const LOCATIONS = ayahMap.ayahToLocation as unknown as Record<string, [number, number]>;

const KEY_RE = /^(\d{1,3}):(\d{1,3})$/;

/** Parse "surah:ayah" → {surah, ayah}, or null if malformed / out of range. */
export function parseVerseKey(key: string): { surah: number; ayah: number } | null {
  const m = KEY_RE.exec(key.trim());
  if (!m) return null;
  const surah = Number(m[1]);
  const ayah = Number(m[2]);
  if (surah < 1 || surah > 114 || ayah < 1) return null;
  return { surah, ayah };
}

/** Look up the page/line for a verse key. Returns null if the key isn't in the map. */
export function locateVerse(key: string): VerseLocation | null {
  const parsed = parseVerseKey(key);
  if (!parsed) return null;
  const normalized = `${parsed.surah}:${parsed.ayah}`;
  const loc = LOCATIONS[normalized];
  if (!loc) return null;
  return { page: loc[0], line: loc[1] };
}

/** All valid verse keys (used to validate LLM output). */
export function verseKeyExists(key: string): boolean {
  const parsed = parseVerseKey(key);
  return parsed ? `${parsed.surah}:${parsed.ayah}` in LOCATIONS : false;
}

// Ordered (mushaf order) list of every ayah's start page + line, built once.
const ORDERED: { key: string; startPage: number; line: number }[] = Object.entries(LOCATIONS).map(
  ([key, [page, line]]) => ({ key, startPage: page, line })
);

/**
 * Every ayah that appears on the given page, in order — all ayahs starting on
 * this page, plus a carry-over ayah spilling in from the previous page when one
 * exists. Whole ayahs (translation is per-ayah), so page splits don't matter.
 *
 * The carry-over is only included when the first ayah starting on the page begins
 * below line 1: if the page opens at line 1, the previous ayah ended cleanly on
 * the prior page and there's nothing carried over.
 */
export function ayahsOnPage(page: number): string[] {
  const starters: number[] = [];
  let first = -1;
  for (let i = 0; i < ORDERED.length; i++) {
    if (ORDERED[i].startPage === page) {
      if (first < 0) first = i;
      starters.push(i);
    } else if (ORDERED[i].startPage > page) break;
  }

  const out: string[] = [];
  if (starters.length) {
    const prev = first - 1;
    if (prev >= 0 && ORDERED[prev].startPage < page && ORDERED[first].line > 1) out.push(ORDERED[prev].key);
    for (const i of starters) out.push(ORDERED[i].key);
  } else {
    // No ayah starts on this page: a single long ayah spans it entirely.
    let idx = -1;
    for (let i = 0; i < ORDERED.length; i++) {
      if (ORDERED[i].startPage < page) idx = i;
      else break;
    }
    if (idx >= 0) {
      const nextStart = idx + 1 < ORDERED.length ? ORDERED[idx + 1].startPage : Infinity;
      if (nextStart > page) out.push(ORDERED[idx].key);
    }
  }
  return out;
}
