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
  - **Calibrated-ruler method (2026-07-17, verified against hand-measured pages):** draw
    vertical gridlines directly onto the page image with PIL at exact xPct positions —
    `pixelX = imgWidth × (0.9215 − pct/100 × 0.845)` (band right/width from the indopak
    `lineCoordinates`: x=0.499, w=0.845) — then cut per-line strips (band tops/bottoms midway
    between the `y` centers), 3× upscale, labels every 5%. Reading marker + first-letter
    positions off this ruler matched the user's hand-fixed values on JSON pages 435-436
    within ~1-2% on all 25 nonzero entries, so this method is trusted for xPct (the earlier
    "way off" eyeball estimates were unguided, without a drawn ruler). JSON page 437 was
    measured this way. For ambiguous marker/letter boundaries, re-crop that line at 5× over
    a ±15% window.
  - **Mushaf switch (2026-07-17): xPct is now measured on the ORIGINAL mushaf, not indopak.**
    The user viewed page 438 rendered on `original` (`public/quran-pages/original/P-NNN.gif`,
    +1 file offset like indopak) and said indopak-based readings were "mixed" as a result.
    From JSON page 438 onward, xPct uses the **original** mushaf's own band geometry:
    `x=0.499, w=0.84` → right border (0%) at `0.919×W`, left border (100%) at `0.079×W`,
    fixed `lineHeight=0.068` (not derived from neighboring `y`s like indopak). Page/line
    values are unaffected — pagination matches indopak on every page checked so far — only
    the xPct ruler/frame changed. Pages ≤437 were xPct-measured against indopak and may read
    a few % off if re-checked against original; not yet revisited, only touch if asked.
    JSON pages 438-440 (images `P-439.gif`–`P-441.gif`) verified this way, user confirmed
    438 was "great" before continuing to 439-440.

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

- **25:3 – 25:76** — verified 2026-07-18 (JSON pages 501–509 / images `page-502`–`510`), line only
  (xPct left as the placeholder `0`). Confirms the prior range's flag: `25:3` does start at JSON
  page 501 line 1 as predicted. All 74 entries in the range corrected — the old interpolated data
  was off by roughly one page throughout (e.g. `25:6` was stored `[501,2,0]`, actually `[501,8,0]`).
  Several short ayahs share a line with the next ayah's start (e.g. `25:22`/`25:23` both start on
  JSON page 504 — `25:23` on line 4 right after `25:22`'s end-marker on the same line; similarly
  `25:24`+`25:25`, `25:39`+`25:40` land close together). **`25:77` is NOT yet corrected** — the old
  value `[509,12,0]` is left in place but is wrong; per this scan `25:76` starts on JSON page 509
  line 13 and doesn't finish there (page 509 row 13 ends mid-76, catchword confirms carry-over), so
  `25:77` must start on JSON page 510 (image `page-511.png`), the next range to scan — along with
  confirming `26:1`'s existing `[510,5,0]` (Surah 26/Ash-Shu'ara's anchor page matches
  `quran-data.json` exactly at JSON 510).
- **23:52 – 25:2** — verified 2026-07-18 (JSON pages 481–500 / images `page-482`–`501`), line only
  (xPct left as the placeholder `0`). Same severe drift pattern as 21:109-23:51 — 124 of 133
  entries changed, often by a full page. Notably **`25:1` does not start at JSON page 500 line 1**
  as the old data assumed — Surah 25 (Al-Furqan)'s header ornament + Bismillah occupy lines 8-9
  of that page (Surah 24/An-Nur's tail, `24:63`-`24:64`, fills lines 1-7), so `25:1` actually
  starts line 10 and `25:2` line 11. **`25:3` is NOT yet corrected** — the old value `[500,6,0]`
  is left in place but is wrong; per this scan `25:2` already runs through JSON500 line 13, so
  `25:3` must actually start on JSON page 501 (image `page-502.png`), the next range to scan.
- **21:109 – 23:51** — verified 2026-07-18 (JSON pages 461–480 / images `page-462`–`481`), line only
  (xPct left as the placeholder `0`). **The original interpolated data here was badly wrong** —
  from roughly 22:5 onward it drifted by up to a full page, with only scattered ayahs matching
  by coincidence (e.g. 22:43-44, 22:62-70 were mostly already correct; nearly everything else
  wasn't). 110 of 133 entries changed. Root-caused by careful verse-text segmentation (knowing
  where each ayah actually ends grammatically) rather than trusting line-count assumptions —
  the original data was likely a straight interpolation that never got corrected for this stretch.
  Also fixed `21:109`–`21:112` (tail of Al-Anbiya), which were previously misplaced on JSON page
  460 instead of 461. `23:52` onward is NOT yet re-verified — treat the existing data for it with
  the same suspicion as everything found wrong in this pass.
- **21:27 – 21:108** — verified 2026-07-17 (JSON pages 451–460 / images `page-452`–`461`), line only
  (xPct left as the placeholder `0`). Scanned with a faster 2-crop-per-page (top/bottom half)
  method instead of 4 quadrants, batching multiple pages per read — cut wall-clock time
  significantly without dropping the marker-vs-grammar check. Several short ayahs land multiple
  ayah-starts on the same line (e.g. `21:106`/`21:107` both on JSON page 460 line 11;
  `21:74`/`21:75` both effectively resolve on page 456 line 10) — don't assume one ayah-start per
  line. `21:109` onward (currently on JSON page 461) is **not yet scanned** — next pass starts at
  JSON page 461 (image `page-462.png`).
- **20:123 – 21:26** — verified 2026-07-17 (JSON pages 446–450 / images `page-447`–`451`), line only
  (xPct left as the placeholder `0`). Confirms `20:123` does start at JSON page 446 line 1 as
  flagged. Surah 20 (Ta-Ha) ends at `20:135` on JSON page 447 line 13; Surah 21 (Al-Anbiya) begins
  JSON page 448 — header ornament = line 1, Bismillah = line 2, `21:1` starts **line 3**. One
  ambiguous marker worth noting: on JSON page 449 line 4, a circled `10` marker sits right after
  `ذكركم` and before `أفلا تعقلون`, which at first glance looks like it splits ayah 10 mid-sentence
  (both `... ذكركم` and `أفلا تعقلون ...` read as grammatically complete on their own). Resolved by
  checking the *next* marker (11) landed exactly at `... قوما آخرين` with nothing left over — i.e.
  the marker-implied split is internally consistent across the whole page (no leftover fragments,
  no impossible boundaries), so both markers were trusted as printed rather than overridden by a
  plausible-sounding alternate reading. **`21:27` onward (currently on JSON page 451) is now
  known-wrong** — page 450 (image 451) ends mid-26 (catchword `ولدا سبحنه`), so `21:27`+ needs
  re-scanning starting at JSON page 451 (image `page-452.png`) in the next pass.
- **20:80 – 20:122** — verified 2026-07-17 (JSON pages 441–445 / images `page-442`–`446`), line only
  (xPct left as the placeholder `0`). Confirms the prior range's flag: `20:80` does start at JSON
  page 441 line 1 as predicted. Found one same-line multi-start case worth flagging: `20:106` and
  `20:107` **both start on JSON page 444 line 4** — `20:106` (`فَيَذَرُهَا قَاعًا صَفْصَفًا`) is a short
  ayah that fits entirely before its end-marker, and `20:107` begins immediately after on the same
  line (not a one-word spillover, but most of the ayah's words fit on the line with only the last
  word `امتا` spilling to line 5) — don't assume the next ayah always starts on the *following*
  line just because the previous one had a lot of text; check where the marker actually falls
  first. `20:87` onward runs to a full page/line drift similar to the previous range's severity.
  **`20:123` (currently on JSON page 445) is now known-wrong** — page 445 (image 446) ends mid-122
  (spillover word `ثم`), so `20:123`+ needs re-scanning starting at JSON page 446 (image
  `page-447.png`) in the next pass.
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
