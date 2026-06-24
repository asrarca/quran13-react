# Quran 13

A Quran reader PWA built with Next.js. Displays high-quality Quran page images with swipe navigation and annotation tools.

## Features

- **Swipe navigation** between pages (RTL, preloads ±2 pages)
- **Multiple mushaf styles** selectable from settings
- **Highlights** — long-press any text line to color it (yellow, green, red, blue)
- **Rakat markers** — number annotations on lines, useful for Taraweh tracking
- **Bookmarks** — save pages with timestamps, sorted by recency
- **Jump to** surah, juz, or page number
- **Three themes** — light, dark, dark-invert (white-on-black page images)
- **8 UI languages** — Arabic, English, French, Spanish, German, Turkish, Russian, Hindi
- **Installable PWA** — works offline once cached

## Stack

- Next.js 16 (app router, webpack)
- React 19 with React Compiler
- Tailwind CSS v4
- Swiper 12

## Dev

```bash
npm run dev -- --turbopack   # or without --turbopack if issues arise
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_TOTAL_PAGES` | `847` | Total page count (adjusts for different editions) |
