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

- **58:19 – 68:5** — verified 2026-07-18 (JSON pages 760–789 / images `page-761`–`790`), line only
  (xPct left as the placeholder `0`). Completes Surah 58 (Al-Mujadilah, from 58:19), all of Surah 59
  (Al-Hashr, 24 ayahs), all of Surah 60 (Al-Mumtahanah, 13 ayahs), all of Surah 61 (As-Saff, 14
  ayahs), all of Surah 62 (Al-Jumu'ah, 11 ayahs), all of Surah 63 (Al-Munafiqun, 11 ayahs), all of
  Surah 64 (At-Taghabun, 18 ayahs), all of Surah 65 (At-Talaq, 12 ayahs), all of Surah 66
  (At-Tahrim, 12 ayahs), all of Surah 67 (Al-Mulk, 30 ayahs), and Surah 68 (Al-Qalam) through
  ayah 5. 154 entries corrected across 7 apply-batches, each verified with 0 mismatches; a final
  comprehensive check across the full 58:19–68:5 range (154 entries) confirmed monotonic ordering.
  Anchor pages confirmed exactly against `quran-data.json` for Surah 59 (760), Surah 60 (765),
  Surah 61 (769), Surah 62 (772), Surah 63 (774), Surah 64 (776), Surah 65 (779), Surah 66 (782),
  Surah 67 (786), and Surah 68 (789) — all matched with no adjustment needed. One transcription
  slip was self-caught mid-session: on JSON page 777 a one-word spillover ("ما اصاب", the first
  word of 64:11) was initially missed off the end of the line and had to be folded back in before
  the batch was applied — same page-boundary spillover risk noted for 56:94 in the prior range.
  **Next to scan: `68:6` onward**, JSON page 789/790 (image `page-791.png`).

- **52:27 – 58:18** — verified 2026-07-18 (JSON pages 730–759 / images `page-731`–`760`), line only
  (xPct left as the placeholder `0`). Completes Surah 52 (At-Tur, ends 52:49), all of Surah 53
  (An-Najm, 62 ayahs), all of Surah 54 (Al-Qamar, 55 ayahs), all of Surah 55 (Ar-Rahman, 78 ayahs —
  the repeated refrain "فبأي آلاء ربكما تكذبان" made line-counting error-prone; verified each
  occurrence against the standard ayah sequence rather than trusting marker glyphs), all of Surah 56
  (Al-Waqi'ah, 96 ayahs), all of Surah 57 (Al-Hadid, 29 ayahs), and Surah 58 (Al-Mujadilah) through
  ayah 18. 361 entries corrected across 14 apply-batches, each verified with 0 mismatches and
  monotonic ordering. Anchor pages confirmed exactly against `quran-data.json` for Surah 53 (731),
  Surah 54 (735), Surah 55 (739), Surah 56 (744), Surah 57 (749), and Surah 58 (756) — all matched
  with no adjustment needed. One apply-batch omission was self-caught before the next batch: 56:94
  was skipped when transcribing the JSON-748/749 page boundary (spillover word landed at the very
  end of a line and got missed) — caught by rechecking JSON page 749's opening word against the
  prior page's last transcribed ayah, and fixed in the following batch. **Next to scan: `58:19`
  onward**, JSON page 759/760 (image `page-761.png`).

- **46:21 – 52:26** — verified 2026-07-18 (JSON pages 700–729 / images `page-701`–`730`), line only
  (xPct left as the placeholder `0`). Completes Surah 46 (Al-Ahqaf, ends 46:35), all of Surah 47
  (Muhammad, 38 ayahs), all of Surah 48 (Al-Fath, 29 ayahs), all of Surah 49 (Al-Hujurat, 18 ayahs),
  all of Surah 50 (Qaf, 45 ayahs), all of Surah 51 (Adh-Dhariyat, 60 ayahs), and Surah 52 (At-Tur)
  through ayah 26. 231 entries corrected across 6 apply-batches, each verified with 0 mismatches and
  monotonic ordering. Anchor pages confirmed exactly against `quran-data.json` for Surah 47 (703),
  Surah 48 (709), Surah 49 (715), Surah 50 (720), Surah 51 (724), and Surah 52 (728) — all matched
  with no adjustment needed. Standard header+Bismillah+text layout held throughout, with the usual
  later-line shift when a previous surah's tail filled earlier lines (e.g. Surah 49's header/Bismillah
  landed at lines 11-12 of JSON page 715 since Surah 48's tail filled lines 1-10). Surah 50 (Qaf) and
  Surah 52 (At-Tur) both pack very short ayahs 2-3 per line extremely densely — the page header's
  stated ayah count for Surah 50 was misread as "35" on a first pass (actually 45; content continued
  well past the apparent completion point, caught because Surah 51's anchor page didn't match until
  the extra ayahs were accounted for). Same misread-glyph pattern recurred on both header numerals and
  ayah-end markers throughout — bottom-right Latin footer numeral and verse-text content remained the
  reliable checks, cross-checked on every page. **Next to scan: `52:27` onward**, JSON page 729/730
  (image `page-731.png`).

- **41:11 – 46:20** — verified 2026-07-18 (JSON pages 660–699 / images `page-661`–`700`), line only
  (xPct left as the placeholder `0`). Completes Surah 41 (Fussilat, ends 41:54), all of Surah 42
  (Ash-Shura, 53 ayahs), all of Surah 43 (Az-Zukhruf, 89 ayahs), all of Surah 44 (Ad-Dukhan, 59 ayahs),
  all of Surah 45 (Al-Jathiyah, 37 ayahs), and Surah 46 (Al-Ahqaf) through ayah 20. 301 entries
  corrected across 8 apply-batches, each verified with 0 mismatches and monotonic ordering. Anchor
  pages confirmed exactly against `quran-data.json` for Surah 42 (667), Surah 43 (676), Surah 44 (685),
  Surah 45 (690), and Surah 46 (696) — all matched with no adjustment needed. Standard
  header+Bismillah+text layout held throughout, with the usual later-line shift when a previous
  surah's tail filled earlier lines (e.g. Surah 42's header/Bismillah landed at lines 9 of JSON page
  667 since Surah 41's tail filled lines 1-8; Surah 44's at line 13 of page 685; Surah 45's at line 4
  of page 690 after a short Surah 44 tail). Many ayahs pack 2-3 starts per line throughout, especially
  in Surah 43 and 44 where short ayat are common — several 1-word ayahs (e.g. `44:44` "طعام الأثيم")
  fully occupy less than half a line, sharing it with the ayah before and after. **Caught and corrected
  a self-introduced verse-numbering slip mid-session**: while transcribing Surah 45 (Al-Jathiyah)
  ayahs 6-16, an initial pass mislabeled which marker belonged to which ayah (conflated ayah 7/8 and
  13/14/15/16 boundaries) — re-derived the whole stretch a second time directly against known Al-
  Jathiyah verse text before applying, so no bad data reached the file. This is the same class of
  error as the recurring marker-glyph misreads, but self-inflicted during transcription rather than
  an artifact of the scan — worth double-checking ayah-number continuity (n, n+1, n+2...) against the
  real verse sequence before finalizing a batch, not just trusting the marker glyph in the image. The
  page-header Arabic-Indic numeral misread issue did not surface this pass; bottom-right Latin footer
  numeral was still cross-checked on every page. **Next to scan: `46:21` onward**, JSON page 699/700
  (image `page-701.png`).

- **38:27 – 41:10** — verified 2026-07-18 (JSON pages 630–659 / images `page-631`–`660`), line only
  (xPct left as the placeholder `0`). Completes Surah 38 (Sad, ends 38:88), all of Surah 39 (Az-Zumar,
  75 ayahs), all of Surah 40 (Ghaafir/Al-Mu'min, 85 ayahs), and Surah 41 (Fussilat) through ayah 10.
  229 entries corrected across 6 apply-batches, each verified with 0 mismatches and monotonic ordering.
  Anchor pages confirmed exactly against `quran-data.json` for Surah 39 (634), Surah 40 (646), and
  Surah 41 (658) — all matched with no adjustment needed. The re-derived line values for `38:27`
  onward were a significant correction from the old interpolated data (e.g. old `38:27` was
  `[630,7]`, actually `[630,2]` — nearly a full-line-block drift), caught by cross-referencing known
  Surah Sad verse text rather than trusting the stored page/line. Standard header+Bismillah+text
  layout held for the Surah 39, 40, and 41 openings (Surah 39's header/Bismillah landed at lines 3-4
  of JSON page 634 since Surah 38's tail filled lines 1-2; Surah 40's at lines 3-4 of page 646;
  Surah 41's at lines 10-11 of page 658). Many ayahs throughout this stretch end and the next start
  on the same line with only a short spillover word/phrase at the line's end — don't assume a new
  ayah always starts on the following line. The page-header Arabic-Indic numeral misread issue did
  not recur as severely this pass, but the bottom-right Latin footer numeral was still cross-checked
  on every page as the reliable source. **Next to scan: `41:11` onward**, JSON page 659/660 (image
  `page-661.png`).

- **34:38 – 38:26** — verified 2026-07-18 (JSON pages 600–629 / images `page-601`–`630`), line only
  (xPct left as the placeholder `0`). Completes Surah 34 (Saba, ends 34:54), all of Surah 35 (Fatir,
  45 ayahs), all of Surah 36 (Ya-Sin, 83 ayahs), all of Surah 37 (As-Saffat, 182 ayahs), and Surah 38
  (Sad) through ayah 26. 353 entries corrected across 6 apply-batches, each verified with 0 mismatches
  and monotonic ordering. Anchor pages confirmed exactly against `quran-data.json` for Surah 35 (602),
  Surah 36 (610), Surah 37 (617), and Surah 38 (627) — all matched with no adjustment needed. Standard
  header+Bismillah+text layout held throughout, with the two-slot offset shifting later on a page when
  the previous surah's tail occupied earlier lines (e.g. Surah 35's info-box/Bismillah landed at lines
  6–7 of JSON page 602 since Surah 34's tail filled lines 1–5; Surah 38's landed at lines 4–5 of JSON
  page 627). Very short ayahs in Surah 37 (many single-clause verses) routinely pack 2-3 ayah starts
  and ends onto one line — don't assume one ayah per line, especially in As-Saffat. The page-header
  Arabic-Indic numeral misread issue recurred repeatedly (e.g. images that read "612" or "622" via the
  header glyph were actually 614/624 by the reliable bottom-right Latin footer numeral) — always trust
  the footer over the header. Ayah-end marker digits were frequently ambiguous on close reads (e.g.
  30:34/37 markers on JSON 600-601, 36:13/14 markers, 38:23/24 marker) — resolved by counting from known
  verse text rather than the glyph. **Next to scan: `38:27` onward**, JSON page 629/630 (image
  `page-631.png`).

- **30:58 – 34:37** — verified 2026-07-18 (JSON pages 570–599 / images `page-571`–`600`), line only
  (xPct left as the placeholder `0`). Completes Surah 30 (Ar-Rum, ends 30:60), all of Surah 31
  (Luqman, 34 ayahs), all of Surah 32 (As-Sajdah, 30 ayahs), all of Surah 33 (Al-Ahzab, 73 ayahs),
  and Surah 34 (Saba) through ayah 37. 213 entries corrected across 6 apply-batches, each verified
  with 0 mismatches and monotonic ordering. Anchor pages confirmed exactly against `quran-data.json`
  for Surah 31 (570), Surah 32 (576), Surah 33 (580), and Surah 34 (594) — all matched with no
  adjustment needed. Standard header(line1)+Bismillah(line2)+text(line3) layout held for all four
  surah openings except where a previous surah's tail pushed it later on the same page (e.g. Surah 30's
  header/Bismillah landed at lines 6–7 of JSON page 570 since Surah 29's tail filled lines 1–5).
  Several ayahs pack 2-3 starts onto one line (e.g. `31:1`/`31:2`/`31:3` all start on JSON-570 line 8).
  One very long ayah (33:19, and separately 33:37) spans 4+ lines on its own. The page-header
  Arabic-Indic numeral misread issue recurred again (e.g. image `page-571.png`'s top-center numeral
  looked like "581" — bottom-right Latin numeral, which read correctly as "571", is what was trusted
  throughout). Ayah-end marker digits were occasionally ambiguous on close reads (e.g. 30:58/59/60
  markers, 33:12's marker) — resolved by counting from known verse text rather than trusting the
  glyph. **Next to scan: `34:38` onward**, JSON page 599/600 (image `page-601.png`).

- **28:84 – 30:57** — verified 2026-07-18 (JSON pages 550–569 / images `page-551`–`570`), line only
  (xPct left as the placeholder `0`). Completes Surah 28 (Al-Qasas, ends at 28:88), all of Surah 29
  (Al-Ankabut, 69 ayahs, fully verified end-to-end), and Surah 30 (Ar-Rum) through ayah 57. 131
  entries corrected. Surah 29's anchor page (551) and Surah 30's anchor page (561) both match
  `quran-data.json` exactly. Both surahs follow the standard header(line1)+Bismillah(line2)+text(line3)
  layout. Several ayahs in this range are very short (e.g. `29:1` "الم", `30:1` "الم", `30:2` "غلبت
  الروم") and pack 2-3 ayah-starts onto a single line — don't assume one ayah-start per line. Same
  misread-glyph issue recurred (a page's top-center numeral read as "552" via the header glyph but
  the reliable bottom-right Latin numeral confirmed "554") — always trust the bottom-right numeral.
  `30:58` onward is **not yet corrected**; next pass starts at JSON page 569/570 (image `page-571.png`).
- **27:44 – 28:83** — verified 2026-07-18 (JSON pages 529–549 / images `page-530`–`550`), line only
  (xPct left as the placeholder `0`). Completes Surah 27 (An-Naml, ends at 27:93) and covers all of
  Surah 28 (Al-Qasas) through ayah 83. 133 entries corrected. Surah 27's spillover start (`27:44`)
  confirmed at JSON page 529 line 13, matching the catchword flagged in the previous range's note.
  Surah 28's anchor page (536) matches `quran-data.json` exactly, and its header+Bismillah occupy
  lines 1-3 of JSON page 536 before `28:1` ("طسم") starts at line 4. Same misread-glyph issue as the
  prior range recurred repeatedly (both page-header numerals and ayah-end marker digits) — resolved
  the same way, via bottom-right Latin numeral + verse-text content, not the glyphs. `28:84` onward
  (JSON page 549/550) is **not yet corrected**; next pass starts at JSON page 550 (image `page-551.png`),
  which is also where Surah 29 (Al-Ankabut, anchor page 551 per `quran-data.json`) begins.
- **25:77 – 27:43** — verified 2026-07-18 (JSON pages 510–529 / images `page-511`–`530`), line only
  (xPct left as the placeholder `0`). Surah 26 (Ash-Shu'ara, all 227 ayahs) fully verified end-to-end,
  plus Surah 27 (An-Naml) through ayah 43. 271 entries corrected. Same severe drift pattern as
  neighboring ranges. Surah 26's anchor page (510) and Surah 27's anchor page (524) both match
  `quran-data.json` exactly. Header digit glyphs on this batch's page images were frequently
  misread on a first pass (e.g. a "512" that was actually "514", ayah-end marker digits reading
  a few off from the true ayah number) — **always cross-check the printed page number via the
  bottom-right Latin numeral, not the top-center Arabic-Indic numeral, and always verify ayah
  boundaries against known verse text rather than trusting the small circled marker digit.**
  `27:44` onward (currently on JSON page 529/530) is **not yet corrected** — the scan stopped
  mid-ayah-43 at JSON page 529 line 13 (catchword confirms "ما كانت تعبد..." carries onto the
  next page); next pass starts there, JSON page 530 (image `page-531.png`).
- **81:1 – 92:21** — verified 2026-07-18 (JSON pages 823–836 / images `page-824`–`837`), line only
  (xPct left as the placeholder `0`). Surahs 81 (At-Takwir) through 92 (Al-Layl) fully verified
  end-to-end, 279 entries corrected. **This range had the worst drift found so far** — e.g. surah
  81's entire 29 ayahs were originally crammed into JSON page 823 lines 1-13, when in reality only
  81:1-17 are on page 823 (lines 7-13) and 81:18-29 spill onto page 824 (lines 1-6). Surah 82's old
  data was outright **backwards**: ayah 1 was stored at line 9 and ayah 19 at line 2 on the same
  page, i.e. line number decreasing as ayah number increased — a corruption, not just drift.
  **Full-resolution page reads are unreliable for this dense a layout** — an uncropped `Read` of a
  page image repeatedly miscounted how many short ayahs share one line (e.g. inventing 2 extra
  lines that don't exist, or missing that 2-3 short ayahs pack onto a single line). Cropping each
  page into top/bottom halves at 2x with PIL before reading fixed this consistently; use this for
  any further work on short-surah / high-density pages (juz 30 in general has many short ayahs
  per line). Confirmed the surah-header+Bismillah-as-line-slot convention holds throughout. Several
  ayahs start with only a one-letter prefix (e.g. `وَ`) spilling onto the end of the previous line,
  with the rest of the word/ayah on the next line — treat this the same as a full-word spillover
  (the ayah's line = wherever its first letter appears). `93:1` onward (currently on JSON page 837)
  is **not yet verified** — next pass starts at JSON page 837 (image `page-838.png`).
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
