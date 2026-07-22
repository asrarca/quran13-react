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

// Values are [page, line] or, on scan-verified ranges, [page, line, xPct] where
// xPct is the integer % from the RIGHT margin (RTL line start = 0) at which the
// ayah's first word begins on its start line. See .claude/ayah-map-scanning.md.
const LOCATIONS = ayahMap.ayahToLocation as unknown as Record<string, [number, number] | [number, number, number]>;

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

// Ordered (mushaf order) list of every ayah's start page + line (+ xPct when
// scan-verified), built once. Insertion order of the JSON is mushaf order.
const ORDERED: { key: string; startPage: number; line: number; xPct?: number }[] = Object.entries(LOCATIONS).map(
  ([key, v]) => ({ key, startPage: v[0], line: v[1], xPct: v[2] })
);
const ORDER_INDEX = new Map(ORDERED.map((e, i) => [e.key, i]));

// This mushaf prints 13 lines of Quran text per page (used when a surah-boundary
// end pulls back across a page break).
const LINES_PER_PAGE = 13;

// Where an ayah begins and ends, for highlighting the whole verse. The end is
// the START of the next ayah (its first word sits right where this ayah's last
// word left off). x's are % from the right margin; endX === 0 means the ayah
// ends exactly at the end of the line before endLine.
export type VerseSpan = {
  page: number;
  line: number;
  xStart: number;
  endPage: number;
  endLine: number;
  endX: number;
};

/**
 * Full-verse span for whole-ayah highlighting. Returns null unless BOTH this
 * ayah and the following one carry a scan-verified xPct — without the next
 * ayah's exact start we can't bound this one, so callers fall back to a
 * single-line flash.
 */
export function locateVerseSpan(key: string): VerseSpan | null {
  const parsed = parseVerseKey(key);
  if (!parsed) return null;
  const i = ORDER_INDEX.get(`${parsed.surah}:${parsed.ayah}`);
  if (i === undefined) return null;
  const cur = ORDERED[i];
  const next = ORDERED[i + 1];
  if (cur.xPct === undefined || !next || next.xPct === undefined) return null;

  let endPage = next.startPage;
  let endLine = next.line;
  let endX = next.xPct;

  // Surah boundary: `next` is ayah 1 of the following surah, so between this
  // ayah's last line and that ayah sit the new surah's header-ornament line and
  // Bismillah line — neither belongs to this ayah. Pull the end back to the
  // ornament line (exclusive: endX = 0) so the highlight stops at this surah's
  // last text line. At-Taubah (surah 9) has no Bismillah, so only the ornament
  // intervenes there (one line, not two).
  const nextSurah = Number(next.key.slice(0, next.key.indexOf(":")));
  if (nextSurah !== parsed.surah) {
    const skip = nextSurah === 9 ? 1 : 2; // ornament (+ Bismillah unless At-Taubah)
    endLine = next.line - skip;
    endX = 0;
    while (endLine <= 0) {
      endPage -= 1;
      endLine += LINES_PER_PAGE;
    }
  }

  return {
    page: cur.startPage,
    line: cur.line,
    xStart: cur.xPct,
    endPage,
    endLine,
    endX,
  };
}

/**
 * Every ayah that appears on the given page, in order — all ayahs starting on
 * this page, plus a carry-over ayah spilling in from the previous page when one
 * exists. Whole ayahs (translation is per-ayah), so page splits don't matter.
 *
 * The carry-over is only included when the first ayah starting on the page begins
 * below the lines any previous text could occupy: if the page opens at line 1,
 * the previous ayah ended cleanly on the prior page and there's nothing carried
 * over. When the page opens with a NEW surah, the lines above its first ayah are
 * the header ornament + Bismillah (not carried-over text), so those are
 * discounted before deciding whether the previous ayah really spills onto the
 * page — otherwise a page that simply starts with a surah wrongly pulls in the
 * last ayah of the previous surah.
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
    if (prev >= 0 && ORDERED[prev].startPage < page) {
      const prevSurah = Number(ORDERED[prev].key.slice(0, ORDERED[prev].key.indexOf(":")));
      const firstSurah = Number(ORDERED[first].key.slice(0, ORDERED[first].key.indexOf(":")));
      // Lines the previous ayah cannot occupy above `first`: the new-surah
      // ornament (+ Bismillah unless At-Taubah, surah 9). Same-surah = 0.
      const headerLines = firstSurah !== prevSurah ? (firstSurah === 9 ? 1 : 2) : 0;
      if (ORDERED[first].line > headerLines + 1) out.push(ORDERED[prev].key);
    }
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
