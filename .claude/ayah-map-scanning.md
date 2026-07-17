# Ayah-Map Scanning & Correction Guide

How to read the scanned Quran page images and hand-correct `data/ayah-map.json`.
This mushaf is a **13-line, 847-page Indopak** edition. The map was originally
built by interpolation (page usually right, **line unreliable**), so the accurate
values come from visually scanning the page images — that's what this doc is for.

## `ayah-map.json` structure

```json
"ayahToLocation": { "3:92": [84, 1], ... }
```

- Key: `"surah:ayah"`. Value: `[page, line]` — or `[page, line, xPct]` — where that ayah **starts**.
- `page`: the map's own numbering, **1-based, Fatihah = page 1** (same numbering as
  `surah.page` / `juz.page` in `quran-data.json`).
- `line`: **1-based, 1–13** (13 lines of Quran text per page).
- `xPct` (optional 3rd element, added during scanning from 18:75 onward): the horizontal
  position where the ayah's **first word begins on its starting line**, as an integer
  **percent from the RIGHT margin** (lines are RTL, so the line *start* = right edge = 0). An
  ayah that begins at the start of a line is `0`; a one-or-two-word spillover sitting at the
  left end of the previous ayah's line is ~85–93. Intended for future partial-line / multi-line
  ayah highlighting (used by the AI-search whole-ayah flash). The read path
  (`app/lib/ayah-map.ts`) destructures `[page, line]` and ignores any 3rd element, so entries
  may safely be a mix of 2- and 3-element arrays. Estimate to the nearest ~5%; no decimals.
  - **Reference frame (easy to get wrong):** measure across the **text area only** — from the
    inner edge of the RIGHT ornamental border (0%) to the inner edge of the LEFT border (100%).
    Do **not** measure from the image file edges; the scans include a page margin + decorative
    frame outside the text, and including it skews the percentages. `xPct` maps to the app's
    `band.right`/`band.left` (the text extent per line), not the image width. On this scan set
    the inner borders sit at image x≈610 (right/0%) and x≈58 (left/100%) out of a 670px-wide
    page — consistent across pages since the physical margin doesn't change. (Page 422 was
    re-measured on 2026-07-16 after an image-relative first pass came out low.)
  - **Measure to the ayah's first LETTER, not the marker.** The circled end-of-previous-ayah
    marker sits to the right of where the new ayah's text actually starts, and marker glyphs
    render at inconsistent sizes/positions. Find the first stroke of the ayah's own first word
    and read the gridline there — don't anchor on the marker itself. Pages 430-434 (2026-07-16)
    were measured this way; a marker-anchored first pass would read a few % high (too far
    right) on nearly every line.

## The +1 image-file offset (critical)

The scan image files are **indexed from 2**; the JSON is indexed from 1. So:

```
image file  page-NNN.png   =   JSON map page (NNN − 1)
```

- Verified examples: JSON page 67 → `page-068.png`; JSON page 112 → `page-113.png`;
  Fatihah (JSON page 1) → `page-002.png`.
- Files live in `public/quran-pages/indopak/`, prefix `page-`, **zero-padded to 3
  digits**, `.png` (e.g. `page-068.png`, `page-113.png`).
- This +1 is exactly the indopak `pageOffset: 1` in `quran-data.json`
  (`imagePath()` in `PageCard.tsx` computes `page + pageOffset`).
- **Gotcha:** the printed page number visible on the scan (top-center in Arabic
  digits, bottom-right in Latin) equals the **file** number, NOT the JSON page.
  So when someone says "page 113" they usually mean the printed/file number →
  store it as JSON page 112. Always translate before writing to the JSON.

## How to read a page image

- Each ayah ends with a **circled ayah number** (٣ / ۳ etc.) in the text.
  Ayah *N* therefore **starts right after the circled marker for N−1**.
- The small text in the **bottom-left corner** is the *catchword* — the first
  word(s) of the **next** page. Use it to confirm whether an ayah carries over or
  a new one starts the next page.
- A page's first Quran text line is line 1; the last is line 13. Ignore the
  surah-title ornament boxes and Bismillah band when counting — but note they DO
  occupy a text line's vertical space, so count actual printed rows top to bottom.

## Line convention (the important, easy-to-get-wrong part)

An ayah's `line` is the line where its **first word appears** — **including a
single trailing word that spills onto the end of a line**, with the rest of the
ayah continuing on the next line(s).

Example (JSON page 71 / `page-072.png`): line 8 ends
`… سريع الحساب ⑲ فان` and line 9 is `حاجّوك فقل اسلمت …`. The one word `فان` is on
line 8, so **3:20 = line 8**, not line 9. Apply this consistently — it's the most
common source of off-by-one line errors, in both directions.

## Verified ranges (scanned, not interpolated)

- **20:14 – 20:79** — verified 2026-07-17 (JSON pages 435–440 / images `page-436`–`441`), line only
  (no xPct — see note above about not scanning xPct visually). Drift here was severe and
  worsened steadily through the range: early entries were off by 1 line, by 20:73 the stored
  page itself was a full page early (`20:73` was `[439,9]`, actually `[440,3]`). All markers
  were cross-checked against grammatical verse completion, not just marker glyph position, per
  the unreliable-marker note below. **20:80 onward (currently on JSON page 440–441) is now
  known-wrong** — page 440 (image 441) ends mid-79, so 20:80+ needs re-scanning starting at
  JSON page 441 (image `page-442.png`) in the next pass.
- **19:56 – 20:13** — verified 2026-07-16 (JSON pages 430–434 / images `page-431`–`435`). Rest of
  Surah 19 (Maryam) to its end (98 ayahs), then Surah 20 (Ta-Ha) through ayah 13. Drift here
  followed the usual one-page-late pattern (e.g. 19:56 was stored at `[430,13]`, actually starts
  `[430,1,72]`); all 56 entries in the range corrected, all now carry `xPct`. Surah 20's anchor
  page is JSON 434, matching `quran-data.json` exactly; `20:1` (`طه`, a one-word ayah) starts at
  **line 4** — Surah 19 ends line 1 with 19:98, header ornament = line 2, Bismillah = line 3,
  same convention as the Surah 18→19 boundary.
- **3:1 – 3:92** — verified 2026-07-12 (JSON pages 67–84 / images `page-068`–`085`).
- **3:92 – 3:159** — verified 2026-07-12 (JSON pages 84–96 / images `page-085`–`097`).
- **4:24 – 17:57** — verified 2026-07-13 (JSON pages 112–399 / images `page-113`–`400`). Surahs 6
  (An'am), 7 (A'raf), 8 (Anfal), 9 (At-Taubah), 10 (Yunus), 11 (Hud), 12 (Yusuf), 13 (Ar-Ra'd),
  14 (Ibrahim), 15 (Al-Hijr), and 16 (An-Nahl) are fully verified end-to-end. 17 (Al-Isra /
  Bani Isra'il) is verified through ayah 57. Surah 17's anchor page (392) matches
  `quran-data.json` exactly, and its header+Bismillah occupy lines 1-2 before the first verse
  text starts at line 3 (same convention as other surahs).
- **18:75 – 19:55** — verified 2026-07-16 (JSON pages 420–429 / images `page-421`–`430`). Rest of
  Surah 18 (Al-Kahf), then Surah 19 (Maryam) through ayah 55. **First range scanned with the
  `xPct` 3rd element** (see structure section). Surah 19's anchor page is JSON 424 with `19:1`
  at **line 9** (Surah 18 ends line 6 with 18:110, header ornament = line 7, Bismillah = line 8).
  The interpolated data was again ~1 page late through Surah 18's tail (e.g. 18:82 was stored on
  page 421 but starts page 421 line 1 while the old data had it packed with 18:83–92); 91
  entries corrected. Note some ayahs here are very short (18:85 `فَأَتْبَعَ سَبَبًا`, 18:92, 19:1
  `كهيعص`), so several lines carry two ayah-starts.
- **17:58 – 18:74** — verified 2026-07-16 (JSON pages 400–419 / images `page-401`–`420`). Rest of
  Surah 17 (Al-Isra) end-to-end, and Surah 18 (Al-Kahf) through ayah 74. **The interpolated data
  here was badly drifted — a full page late through most of Surah 17's tail** (e.g. 17:58 was
  stored at [400,6] but starts at [400,1]; 17:62 was on page 401 but is on 400): 100 of ~131
  entries in the range were corrected. The drift self-corrected and re-synced at page 413
  (18:31–36 were already right), drifted one line again on 414–417, then re-synced from 418
  onward (18:59–18:74 already right). Surah 18's anchor page is JSON 407, but `18:1` starts at
  **line 12** of that page (Surah 17 ends at line 9 with 17:111, then the Al-Kahf header ornament
  = line 10 and Bismillah band = line 11, so the first verse text is line 12) — the old data's
  `18:1 = [407,1]` was wrong.
- The user manually corrected everything **up to 3:92** before that.
- Everything in **3:160 – 4:23** and **after 17:57** is still interpolated: treat
  `page` as roughly right and `line` as unreliable until scanned.
- **Watch for skipped/merged ayahs, not just marker mis-position.** While scanning Surah 14, ayah
  17 ("يتجرعه...") got silently merged into the transcription of ayah 18, shifting every
  subsequent ayah number down by one for ~10 ayahs before it was caught (via the surah-15 anchor
  page mismatch) and fixed. A similar merge happened at Surah 15 ayahs 2/3. The fix: whenever an
  ayah's full text doesn't cleanly match a single verse end-to-end, re-derive the *count* of
  distinct verses in that line span from a real mushaf reference, not just the boundary
  positions — a merged pair is easy to miss because each half still "reads fine" on its own.
- Recurring error pattern found across all scanned batches: the interpolation
  drifts a full **page** late (not just a line or two) over a run of ~10-20
  ayahs, then resyncs when a long ayah absorbs the slack. Always re-derive the
  page from the actual verse text at page/line boundaries, don't just trust the
  existing page number and only fix the line.
- **Circled ayah-end marker digits are unreliable ~20-30% of the time** even
  when clearly visible — don't trust a marker's apparent position over known
  verse content. Concretely found on pages 212-213 and 217-218 (surah 7):
  markers appeared to close a verse mid-sentence, which is impossible once you
  check the actual verse text. Ground truth is: does the sentence grammatically
  end at that word? If yes, the ayah boundary is there regardless of where a
  tiny marker glyph seems to sit. Only treat a following word as "spillover"
  (staying on the same line as the previous ayah's end) if the image genuinely
  shows more text after the ayah-end point on that same visual line — don't
  default to assuming spillover.

## Surah 9 (At-Taubah) has no Bismillah

Unlike every other surah, At-Taubah's header ornament box occupies its **only**
line-slot before the first ayah — there's no separate Bismillah line to
account for. Confirmed at JSON page 259 (image `page-260.png`): `9:1` starts
at line 5, i.e. only 4 lines of surah-8 tail text precede the header box, and
the header box itself is the sole non-text row before `9:1`.

## Correction workflow

1. Identify the JSON page range, convert to file numbers (**+1**), read those
   `page-NNN.png` images.
2. For each page, walk the 13 lines top→bottom, noting each circled ayah-end
   marker and where the next ayah's first word lands (spillover counts).
3. Diff your readings against the current JSON values.
4. Apply edits with a script that regex-replaces each `"s:a": [p, l]` entry, then
   **re-parse the JSON to confirm validity** and check surah page numbers are
   **monotonic non-decreasing** (a cheap catch for a mis-shifted page). See the
   scratch scripts used for the 4:24–4:118 pass as a template.
5. Never trust the printed page number on the scan — always store JSON = file − 1.

Related: `data/ayah-map.json`, `app/lib/ayah-map.ts` (lookup + `ayahsOnPage`),
`scripts/build-ayah-map.mjs` (interpolation builder).
