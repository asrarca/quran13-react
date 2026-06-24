# Quran 13 — App Context for Claude

## Overview

A Quran reader PWA. Next.js app with a single page route (`app/page.tsx`, `"use client"`). Displays Quran page images with swipe navigation, highlights, bookmarks, and a settings panel. App version: `2.0.2` (defined in `app/constants.ts`).

## Tech Stack

- **Next.js 16.2.9** (app router, `--webpack` flag required for dev/build)
- **React 19.2.4** with React Compiler — strict ref rules apply; event handlers that touch refs must be wrapped in `useCallback`
- **Tailwind CSS v4** (PostCSS plugin, no `tailwind.config.js`)
- **Swiper 12** for page swiping
- **Lucide React 1.21** for icons
- **`@base-ui/react`**, **`shadcn`** (Button component at `@/app/components/ui/button`)
- **TypeScript 5**, strict

## File Structure (key files)

```
app/
  page.tsx                  — root component: state, effects, event handlers, layout (~400 lines)
  constants.ts              — FIRST_PAGE, LAST_PAGE, TOTAL_PAGES, DEFAULT_START_PAGE, APP_VERSION
  types.ts                  — shared types: Theme, ActiveSheet, Surah, Juz, MushafKey, LineBand,
                              LineCoord, HighlightColorKey, HIGHLIGHT_COLORS, DragHandlers
  components/
    PageCard.tsx            — page image + highlight overlays + rakat markers; owns imagePath()
    HighlightPicker.tsx     — long-press modal: color picker + rakat number grid
    SurahSheet.tsx          — surah list bottom sheet
    JuzSheet.tsx            — juz list bottom sheet with halves toggle
    PageSheet.tsx           — numeric keypad overlay (go-to-page)
    BookmarksSheet.tsx      — bookmarks list sheet; owns getSurahForPage() + formatDate()
    SettingsSheet.tsx       — 5-panel slide settings sheet
    ui/
      button.tsx            — shadcn Button (imports from @/lib/utils)
      dialog.tsx
      drawer.tsx
      scroll-area.tsx
      separator.tsx
  i18n/
    index.ts        — translation engine + language registry
    en.json         — English strings (source of truth for keys)
    fr.json         — French
    es.json         — Spanish
    de.json         — German
    tr.json         — Turkish
    ru.json         — Russian
    ar.json         — Arabic
    hi.json         — Hindi
data/
  quran-data.json   — surahs, juz, mushaf definitions (lineCoordinates, aspectRatio, etc.)
lib/
  utils.ts          — cn() helper (clsx + tailwind-merge)
public/
  quran-pages/      — page image assets, organized by mushaf dir
```

## State & localStorage Keys

All persisted via `localStorage`. Only written after `mounted` is true (hydration guard):

| Key | Type | Default |
|-----|------|---------|
| `quran13-page` | `number` (internal, 0-based) | `1` |
| `quran13-theme` | `"light" \| "dark" \| "dark-invert"` | system preference |
| `quran13-bookmarks` | `Record<number, ISO string>` | `{}` |
| `quran13-highlights` | `Record<number, Record<lineIndex, colorKey>>` | `{}` |
| `quran13-rakat` | `Record<number, Record<lineIndex, number>>` | `{}` |
| `quran13-mushaf` | `MushafKey` | `"original_tajweed"` |
| `quran13-lang` | `Lang` | `"en"` |

**Important**: Pages are stored/used internally as 0-based (`page`), but displayed to users as `page + 1`. `TOTAL_PAGES` comes from `NEXT_PUBLIC_TOTAL_PAGES` env var (default 847).

## i18n System

**`app/i18n/index.ts`** — flat-JSON translation engine, no external library.

```ts
t(lang, 'nav.juz')                            // simple lookup
t(lang, 'header.juzPage', { juz: 5, page: 90 })  // with {var} interpolation
```

**`Lang` type** and **`SUPPORTED_LANGS`** are the single sources of truth. To add a language:
1. Create `app/i18n/xx.json` (copy all keys from `en.json`)
2. Add `'xx'` to the `Lang` union in `index.ts`
3. Import and add to `dicts` in `index.ts`
4. Add `xx: 'xx-XX'` to `langDateLocale` (TypeScript enforces this — will error if missing)
5. Add entry to `SUPPORTED_LANGS` array

**Current languages** (alphabetical in picker): Arabic (`ar`), English (`en`), German (`de`), Spanish (`es`), French (`fr`), Hindi (`hi`), Russian (`ru`), Turkish (`tr`).

**JSON key structure** (same across all language files):
```
nav.{surah,juz,page,saved,settings}
header.{surahPrefix,juzPage}
surahIndex.title
juzIndex.{title,halves}
goToPage.{title,hint,go}
bookmarks.{title,empty,emptyHint}
highlightPicker.{lineHighlight,numberAnnotation}
settings.{title,mushafStyle,tajweedRules,language,about,footer,installApp}
about.{versionLine,readingSection,navigatePages,navigatePagesDesc,landscapeMode,landscapeModeDesc,
       toggleMenu,toggleMenuDesc,highlightSection,highlightLine,highlightLineDesc,
       addAnnotation,addAnnotationDesc,addAnnotationTip,bookmarksSection,savePage,savePageDesc,
       viewSavedPages,viewSavedPagesDesc,displaySection,theme,themeDesc}
installApp.{step1,step2,step3,step4}
misc.{imageUnavailable,langName,tajweedRulesAlt}
```

## Settings Sheet — 5-Panel Slide System

The settings sheet (`SettingsSheet.tsx`) uses a pure-CSS slide animation (no library). The container is `width: 500%` with 5 `w-1/5` panels side by side. `settingsSubView` drives `translateX` via the `TRANSLATE_X` lookup object:

| `settingsSubView` | `translateX` | Panel shown |
|---|---|---|
| `null` | `0` | Main settings list |
| `"mushaf"` | `-20%` | Mushaf picker |
| `"about"` | `-40%` | About / how-to |
| `"language"` | `-60%` | Language picker |
| `"install"` | `-80%` | Install App instructions |

Settings rows (Panel 1 order):
1. **Install App** → install sub-panel (hidden when `isStandalone === true`)
2. **Mushaf** → mushaf sub-panel
3. **Tajweed Rules** → fullscreen image overlay in page.tsx (only visible when `activeMushafKey === "original_tajweed"`)
4. **Language** → language sub-panel (shows current `misc.langName`)
5. **About** → about sub-panel (shows `vAppVersion`)

`isStandalone` is detected on mount: `window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true`. When true, the Install App row is hidden entirely.

`settingsSubView` state lives in `page.tsx` and is explicitly reset to `null` when the settings nav button is clicked. `SettingsSheet` receives it as a prop and calls the setter directly.

## Sheets / Drawers

`activeSheet: null | "surah" | "juz" | "page" | "bookmarks" | "settings"` — state in `page.tsx`.

Each sheet is its own component in `app/components/`:
- **SurahSheet**: scrollable list of all 114 surahs with Arabic name, number, page
- **JuzSheet**: scrollable list of 30 juz; "Halves" toggle (`showSections`) reveals half-juz sub-entries
  - Juz label uses `t(lang, 'nav.juz') + ' ' + item.num` (translated, not the raw `item.name`)
- **PageSheet**: numeric keypad modal (centered overlay, not bottom sheet)
- **BookmarksSheet**: sorted by most-recently-added ISO date; `getSurahForPage` and `formatDate` are local to this component
- **SettingsSheet**: 5-panel slide system (see above)

`DragHandlers` type (in `app/types.ts`) bundles the 4 pointer event props for drag-to-dismiss. Assembled in `page.tsx` and passed to each sheet:
```ts
const dragHandlers: DragHandlers = {
  onPointerDown: handleSheetDragDown,
  onPointerMove: handleSheetDragMove,
  onPointerUp: handleSheetDragEnd,
  onPointerCancel: handleSheetDragEnd,
};
```
Sheet drag-to-dismiss: dragging down > 72px closes the sheet.

## Page Display & Navigation

- Swiper in RTL mode, 5 slides (current ± 2 for preloading)
- Slide index 2 = current page; after transition, resets to center with `slideTo(2, 0, false)`
- Tapping the page area toggles `navVisible` (nav bar show/hide) unless `suppressClick` is set
- Long press (600ms, ≤10px move tolerance) on a text line opens the highlight picker

## Highlights & Rakat Markers

- **Highlights**: colored overlays on text lines. 4 colors: yellow, green, red, blue. Stored per page/line. Rendered as `opacity-35 mix-blend-multiply` divs using normalized line band coordinates.
- **Rakat markers**: numbered circles (1–20) placed at the end of a line. Useful for Huffaz to mark Taraweh rakat breaks. Stored per page/line.
- Both use `lineCoordinates` from mushaf data → `computeBands()` → `lineBandsMap` (memoized on mushaf change, computed in `page.tsx`).
- Line detection: `lineAtFraction(frac, bands)` maps a normalized pointer Y position to a line index; returns -1 if outside text area (header/margins).
- `HIGHLIGHT_COLORS` and `HighlightColorKey` are defined in `app/types.ts`.

## Mushaf / Page Images

- `activeMushafKey` selects from `quranData.mushafs` (keys defined in `quran-data.json`)
- `imagePath(page, mushaf)` lives in `PageCard.tsx`; builds: `{dir}/{filePrefix}{paddedPage}.{fileExtension}`
- `pageOffset` in mushaf data adjusts the file numbering
- `missingImages` tracks 404s; shows a localized fallback message
- Switching mushaf calls `setActiveMushafKey` + `setMissingImages({})` via `onMushafChange` prop

## Theme

3 modes cycled in order: `light` → `dark` → `dark-invert` → `light`
- `dark` and `dark-invert` both add `class="dark"` to `<html>`
- `dark-invert` applies `filter: invert(1)` to page images (white-on-black Quran text)
- CSS variables `--bg`, `--bg2`, `--fg`, `--fg2`, `--fg3`, `--nav`, `--paper`, `--border`, `--sheetbd` drive theming

## React Compiler Notes

This project uses React Compiler. The compiler enforces stricter rules than standard React:
- Handlers that read or write refs (like `pressTimer`, `pressInfo`, `suppressClick`, `sheetDragY`) **must** be wrapped in `useCallback`
- Plain arrow functions assigned directly will cause compiler errors if they touch refs

## Known Data Quirks

- `quranData.juz` entries have a `name` field (English string like "Al-Fatihah") but the UI now uses `t(lang, 'nav.juz') + ' ' + item.num` instead, making `item.name` unused in the juz list (it is still displayed in the half-juz sub-rows)
- `item.isNisf` marks half-juz entries (shown at 60% opacity in the main juz row)
- `item.sections` contains the half-juz sub-entries (shown when `showSections` toggle is active)
- Surah `page` and Juz `page` are clamped to `[FIRST_PAGE, LAST_PAGE]` via `clampPage` at load time
