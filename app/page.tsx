"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  BookOpen,
  Bookmark,
  Delete,
  Hash,
  Info,
  Layers,
  Moon,
  Sun,
  SunMoon,
  X,
} from "lucide-react";

import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

import quranData from "@/data/quran-data.json";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "dark-invert";
type ActiveSheet = null | "surah" | "juz" | "page" | "bookmarks" | "about";

type Surah = {
  num: number;
  name: string;
  arabic: string;
  page: number;
  ayah: number;
};

type Juz = {
  num: number;
  name: string;
  arabicStart: string;
  page: number;
  isNisf?: boolean;
  sections?: Juz[];
};

const FIRST_PAGE = 1;
const TOTAL_PAGES = Number(process.env.NEXT_PUBLIC_TOTAL_PAGES ?? 847);
const LAST_PAGE = FIRST_PAGE + TOTAL_PAGES - 1;
const DEFAULT_START_PAGE = 1;

function clampPage(value: number) {
  return Math.max(FIRST_PAGE, Math.min(LAST_PAGE, value));
}

function toArabicNumber(value: number) {
  return String(value).replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function imagePath(page: number) {
  return `/quran-pages/P-${String(page + 1).padStart(3, "0")}.gif`;
}

type LineCoord = { x: number; y: number; w: number };
// left/right are the normalized horizontal edges of the highlight (x ± w/2).
type LineBand = { top: number; bottom: number; left: number; right: number };

// Per-page line coordinates, keyed by the padded page number (matching the
// image filename, e.g. "002"). Pages without a specific key use "default".
const LINE_COORDS_MAP = quranData.meta.lineCoordinates as Record<string, LineCoord[]>;

// Vertical band [top, bottom] and horizontal extent [left, right] (normalized
// 0-1) for each line. Vertical boundaries sit midway between consecutive line
// centers; horizontal extent comes from each line's x (center) and w (width).
function computeBands(coords: LineCoord[]): LineBand[] {
  return coords.map((coord, i, arr) => {
    const prev = arr[i - 1]?.y;
    const next = arr[i + 1]?.y;
    const top = prev === undefined ? Math.max(0, coord.y - (next - coord.y) / 2) : (prev + coord.y) / 2;
    const bottom = next === undefined ? Math.min(1, coord.y + (coord.y - prev) / 2) : (coord.y + next) / 2;
    return { top, bottom, left: coord.x - coord.w / 2, right: coord.x + coord.w / 2 };
  });
}

const LINE_BANDS_MAP: Record<string, LineBand[]> = Object.fromEntries(
  Object.entries(LINE_COORDS_MAP).map(([key, coords]) => [key, computeBands(coords)])
);

function pageKey(p: number) {
  return String(p + 1).padStart(3, "0");
}

function bandsForPage(p: number): LineBand[] {
  return LINE_BANDS_MAP[pageKey(p)] ?? LINE_BANDS_MAP.default;
}

// Map a normalized vertical position (0 = top, 1 = bottom of the page) to a line
// index, or -1 if it falls outside the text lines (e.g. the surah header or margins).
function lineAtFraction(frac: number, bands: LineBand[]) {
  if (frac < bands[0].top || frac >= bands[bands.length - 1].bottom) return -1;
  for (let i = 0; i < bands.length; i++) {
    if (frac < bands[i].bottom) return i;
  }
  return -1;
}

const LONG_PRESS_MS = 600;
const LONG_PRESS_MOVE_TOLERANCE = 10;

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [page, setPage] = useState(DEFAULT_START_PAGE);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [pageInput, setPageInput] = useState("");
  // Record<internalPage, ISO date string>
  const [bookmarks, setBookmarks] = useState<Record<number, string>>({});
  const [missingImages, setMissingImages] = useState<Record<number, true>>({});
  const [navVisible, setNavVisible] = useState(true);
  const [showSections, setShowSections] = useState(false);
  // Record<internalPage, lineIndex[]> — yellow line highlights
  const [highlights, setHighlights] = useState<Record<number, number[]>>({});

  const pressTimer = useRef<number | null>(null);
  const pressInfo = useRef<{ page: number; line: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const surahs = useMemo<Surah[]>(() => {
    return (quranData.surahs as Surah[]).map((surah) => ({
      ...surah,
      page: clampPage(surah.page),
    }));
  }, []);

  const juz = useMemo<Juz[]>(() => {
    return (quranData.juz as Juz[]).map((entry) => ({
      ...entry,
      page: clampPage(entry.page),
    }));
  }, []);

  const surahsOnPage = useMemo(() => {
    return surahs.filter((surah, i) => {
      if (surah.page > page) return false;
      const next = surahs[i + 1];
      return surah.page === page || !next || next.page > page;
    });
  }, [page, surahs]);

  const currentJuz = useMemo(() => {
    let value = juz[0];
    for (const item of juz) {
      if (item.page <= page) value = item;
      else break;
    }
    return value;
  }, [juz, page]);

  useEffect(() => {
    setMounted(true);
    const storedTheme = localStorage.getItem("quran13-theme");
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "dark-invert") {
      setTheme(storedTheme as Theme);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }

    const storedPage = Number(localStorage.getItem("quran13-page") || DEFAULT_START_PAGE);
    setPage(clampPage(storedPage));

    const rawBookmarks = localStorage.getItem("quran13-bookmarks");
    if (rawBookmarks) {
      try {
        const parsed = JSON.parse(rawBookmarks);
        if (Array.isArray(parsed)) {
          // Migrate from old Set<number> format — assign today's date
          const migrated: Record<number, string> = {};
          for (const p of parsed as number[]) migrated[p] = new Date().toISOString();
          setBookmarks(migrated);
        } else {
          setBookmarks(parsed as Record<number, string>);
        }
      } catch {
        setBookmarks({});
      }
    }

    const rawHighlights = localStorage.getItem("quran13-highlights");
    if (rawHighlights) {
      try {
        setHighlights(JSON.parse(rawHighlights) as Record<number, number[]>);
      } catch {
        setHighlights({});
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", theme === "dark" || theme === "dark-invert");
    localStorage.setItem("quran13-theme", theme);
  }, [mounted, theme]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("quran13-page", String(page));
  }, [mounted, page]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("quran13-bookmarks", JSON.stringify(bookmarks));
  }, [bookmarks, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("quran13-highlights", JSON.stringify(highlights));
  }, [highlights, mounted]);

  const goToPage = useCallback((targetPage: number) => {
    setPage(clampPage(targetPage));
    setActiveSheet(null);
    setPageInput("");
  }, []);

  const toggleHighlight = useCallback((targetPage: number, line: number) => {
    setHighlights((prev) => {
      const current = prev[targetPage] ?? [];
      const nextLines = current.includes(line)
        ? current.filter((l) => l !== line)
        : [...current, line].sort((a, b) => a - b);
      const next = { ...prev };
      if (nextLines.length) next[targetPage] = nextLines;
      else delete next[targetPage];
      return next;
    });
  }, []);

  const cancelPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressInfo.current = null;
  }, []);

  const handlePressStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, candidate: number) => {
      if (activeSheet) return;
      suppressClick.current = false;
      const rect = event.currentTarget.getBoundingClientRect();
      const frac = (event.clientY - rect.top) / rect.height;
      const line = lineAtFraction(frac, bandsForPage(candidate));
      if (line < 0) return; // pressed outside the text lines (header/margins) — ignore
      pressInfo.current = { page: candidate, line, x: event.clientX, y: event.clientY };
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null;
        const info = pressInfo.current;
        if (!info) return;
        suppressClick.current = true;
        navigator.vibrate?.(15);
        toggleHighlight(info.page, info.line);
      }, LONG_PRESS_MS);
    },
    [activeSheet, toggleHighlight]
  );

  const handlePressMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const info = pressInfo.current;
      if (!info || pressTimer.current === null) return;
      if (
        Math.abs(event.clientX - info.x) > LONG_PRESS_MOVE_TOLERANCE ||
        Math.abs(event.clientY - info.y) > LONG_PRESS_MOVE_TOLERANCE
      ) {
        cancelPress();
      }
    },
    [cancelPress]
  );

  const toggleBookmark = () => {
    setBookmarks((prev) => {
      const next = { ...prev };
      if (page in next) delete next[page];
      else next[page] = new Date().toISOString();
      return next;
    });
  };

  const pressDigit = (digit: string) => {
    setPageInput((prev) => {
      if (prev.length >= 3) return prev;
      if (prev === "" && digit === "0") return prev;
      return `${prev}${digit}`;
    });
  };

  const pageDisplay = pageInput === "" ? "—" : pageInput;
  const isBookmarked = page in bookmarks;

  const getSurahForPage = (p: number) => {
    let result = surahs[0];
    for (const surah of surahs) {
      if (surah.page <= p) result = surah;
      else break;
    }
    return result;
  };

  const sortedBookmarks = Object.entries(bookmarks)
    .map(([p, date]) => ({ page: Number(p), date }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const formatBookmarkDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const canRenderPage = (candidate: number) => candidate >= FIRST_PAGE && candidate <= LAST_PAGE;

  const renderPageCard = (candidate: number) => {
    if (!canRenderPage(candidate)) return null;
    const missing = missingImages[candidate];
    const bands = bandsForPage(candidate);
    const pageHighlights = (highlights[candidate] ?? []).filter((line) => bands[line]);

    return (
      <div
        className="relative w-full aspect-568/750 select-none overflow-hidden border border-border bg-(--paper) shadow-[0_6px_30px_rgba(0,0,0,0.14),0_0_0_1px_var(--border)]"
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {missing ? (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-(--fg2)">
            Page {candidate} image is unavailable
          </div>
        ) : (
          <>
            <Image
              src={imagePath(candidate)}
              alt={`Quran page ${candidate}`}
              fill
              className="object-cover object-top"
              style={theme === "dark-invert" ? { filter: "invert(1)" } : undefined}
              draggable={false}
              priority={candidate === page}
              onError={() => setMissingImages((prev) => ({ ...prev, [candidate]: true }))}
            />
            {/* Long-press a line to toggle a yellow highlight on it. */}
            <div
              className="absolute inset-0"
              style={{ touchAction: "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => handlePressStart(e, candidate)}
              onPointerMove={handlePressMove}
              onPointerUp={cancelPress}
              onPointerCancel={cancelPress}
              onPointerLeave={cancelPress}
            >
              {pageHighlights.map((line) => (
                <div
                  key={line}
                  className="pointer-events-none absolute bg-[#ffe600] opacity-35 mix-blend-multiply"
                  style={{
                    top: `${bands[line].top * 100}%`,
                    height: `${(bands[line].bottom - bands[line].top) * 100}%`,
                    left: `${bands[line].left * 100}%`,
                    width: `${(bands[line].right - bands[line].left) * 100}%`,
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  if (!mounted) {
    return <main className="min-h-screen bg-(--bg)" />;
  }

  return (
    <main data-theme={theme} className="flex min-h-screen flex-col bg-(--bg) text-(--fg)">
      <header className="relative flex items-center justify-between gap-3 px-4 pb-3 pt-1">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">Sūrah {surahsOnPage.map(s => s.name).join(", ")}</div>
            <div className="mt-px text-xs text-(--fg2)">
              Juz {Math.floor(currentJuz.num)} · Page {page + 1}
              <span className="ml-1.5 opacity-70">· {((page - FIRST_PAGE) / (LAST_PAGE - FIRST_PAGE) * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 rounded-full bg-(--bg2) text-(--fg2)"
              onClick={toggleBookmark}
              aria-label="Toggle bookmark"
            >
              <Bookmark
                className="size-4.5"
                fill={isBookmarked ? "currentColor" : "none"}
              />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 rounded-full bg-(--bg2) text-(--fg2)"
              onClick={() => setTheme((prev) => prev === "light" ? "dark" : prev === "dark" ? "dark-invert" : "light")}
              aria-label="Toggle theme"
            >
              {theme === "light" ? <Sun className="size-4.5" /> : theme === "dark" ? <SunMoon className="size-4.5" /> : <Moon className="size-4.5" />}
            </Button>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-black/[0.07] dark:bg-white/[0.07]">
            <div
              className="h-full bg-gray-500"
              style={{ width: `${((page - FIRST_PAGE) / (LAST_PAGE - FIRST_PAGE)) * 100}%` }}
            />
          </div>
      </header>

      <section
        className="relative min-h-0 flex-1 overflow-hidden bg-(--bg) landscape:flex-none landscape:h-[132vw]"
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (!activeSheet) setNavVisible(v => !v);
        }}
      >
        <div className="absolute inset-0">
          <Swiper
            dir="rtl"
            initialSlide={1}
            slidesPerView={1}
            speed={320}
            threshold={8}
            resistance
            resistanceRatio={0.65}
            allowTouchMove={!activeSheet}
            allowSlideNext={page < LAST_PAGE}
            allowSlidePrev={page > FIRST_PAGE}
            onSlideChangeTransitionEnd={(swiper) => {
              const idx = swiper.activeIndex;
              if (idx === 1) return;
              // RTL: swipe right → idx 2 (next page); swipe left → idx 0 (prev page)
              const delta = idx === 0 ? -1 : 1;
              flushSync(() => setPage((prev) => clampPage(prev + delta)));
              swiper.slideTo(1, 0, false);
              swiper.slides[1].scrollTop = 0;
              window.scrollTo(0, 0);
            }}
            className="h-full"
            style={{ touchAction: "pan-y" } as React.CSSProperties}
          >
            {/* RTL: index 0 = prev page */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page - 1)}
              </div>
            </SwiperSlide>
            {/* index 1 = current page */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page)}
              </div>
            </SwiperSlide>
            {/* index 2 = next page */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page + 1)}
              </div>
            </SwiperSlide>
          </Swiper>
        </div>

        {false && <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-(--bg2) px-3.5 py-1.5 text-[13px] text-(--fg2)">
          <span className="font-amiri text-[17px] text-(--fg)">{toArabicNumber(page + 1)}</span>
          <span className="opacity-50">·</span>
          <span className="tabular-nums">{page + 1}</span>
        </div>}
      </section>

      <div className={`fixed inset-x-0 bottom-0 z-30 transition-opacity duration-300 ${navVisible ? "opacity-99" : "opacity-0 pointer-events-none"}`}>
        <nav className="grid grid-cols-5 border-t border-border bg-(--nav) px-2 pb-6 pt-2 backdrop-blur-[14px]">
          <button
            type="button"
            onClick={() => setActiveSheet("surah")}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <BookOpen className="size-5.5" />
            <span className="text-[11px] font-medium">Surah</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet("juz")}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <Layers className="size-5.5" />
            <span className="text-[11px] font-medium">Juz</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPageInput("");
              setActiveSheet("page");
            }}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <Hash className="size-5.5" />
            <span className="text-[11px] font-medium">Page</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet("bookmarks")}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <Bookmark className="size-5.5" fill={activeSheet === "bookmarks" ? "currentColor" : "none"} />
            <span className="text-[11px] font-medium">Saved</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet("about")}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <Info className="size-5.5" />
            <span className="text-[11px] font-medium">About</span>
          </button>
        </nav>
      </div>

      {activeSheet && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-(--sheetbd)"
            aria-label="Close overlay"
            onClick={() => setActiveSheet(null)}
          />

          {activeSheet === "surah" && (
            <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-50 flex h-[90%] flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[0_-8px_40px_rgba(0,0,0,0.22)]">
              <div className="mx-auto mt-2 h-1.25 w-9.5 rounded-full bg-border" />
              <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
                <span className="text-[13px] font-semibold tracking-[2px] uppercase">SURAH INDEX</span>
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setActiveSheet(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {surahs.map((surah) => (
                  <button
                    key={surah.num}
                    type="button"
                    onClick={() => goToPage(surah.page)}
                    className="flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-left hover:bg-(--bg2)"
                  >
                    <span className="w-6 text-right text-sm tabular-nums text-(--fg3)">{surah.num}</span>
                    <span className="min-w-0 flex-1 truncate text-base font-medium text-(--fg)">{surah.name}</span>
                    <span className="text-xs text-(--fg3)">p.{surah.page + 1}</span>
                    <span className="font-amiri font-bold text-[22px]" dir="rtl">{surah.arabic}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSheet === "juz" && (
            <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-50 flex h-[90%] flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[0_-8px_40px_rgba(0,0,0,0.22)]">
              <div className="mx-auto mt-2 h-1.25 w-9.5 rounded-full bg-border" />
              <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
                <span className="text-[13px] font-semibold tracking-[2px] uppercase">JUZ INDEX</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSections((v) => !v)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${showSections ? "border-transparent bg-(--fg) text-(--bg)" : "border-border bg-(--bg2) text-(--fg2)"}`}
                  >
                    Halves
                  </button>
                  <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setActiveSheet(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {juz.map((item) => (
                  <div key={item.num}>
                    <button
                      key={item.num}
                      type="button"
                      onClick={() => goToPage(item.page)}
                      className={`flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-left hover:bg-(--bg2) ${item.isNisf ? "opacity-60" : ""}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-base font-medium text-(--fg)">{item.name}</span>
                      <span className="text-xs text-(--fg3)">p.{item.page + 1}</span>
                      <span className="font-amiri font-bold text-[22px]" dir="rtl">{item.arabicStart}</span>
                    </button>
                    {showSections && item.sections?.length && item.sections.map((section, idx) => {
                     return (
                      <button
                        key={section.num}
                        type="button"
                        onClick={() => goToPage(section.page)}
                        className={`flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-left hover:bg-(--bg2) opacity-60}`}
                      >
                        <span className="w-6 text-right text-sm tabular-nums text-(--fg3)">½</span>
                        <span className="min-w-0 flex-1 truncate text-base text-sm text-(--fg) opacity-50">{section.name}</span>
                        <span className="text-xs text-(--fg3)">p.{section.page + 1}</span>
                        <span className="font-amiri text-[18px] opacity-60" dir="rtl">{section.arabicStart}</span>
                      </button>

                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSheet === "page" && (
            <div className="animate-pop-in absolute left-1/2 top-1/2 z-50 flex w-75 -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-(--bg) p-5.5 shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">Go to Page</span>
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setActiveSheet(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              <span className="mt-1 text-[13px] text-(--fg2)">Enter a number from {FIRST_PAGE + 1} to {LAST_PAGE + 1}</span>
              <div className="my-4 flex h-16 items-center justify-center rounded-[14px] bg-(--bg2) text-[34px] font-semibold tracking-[3px] tabular-nums">{pageDisplay}</div>
              <div className="grid grid-cols-3 gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    className="h-13 rounded-[14px] bg-(--bg2) text-[22px] font-medium text-(--fg) active:bg-border"
                    onClick={() => pressDigit(digit)}
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  className="flex h-13 items-center justify-center rounded-[14px] bg-(--bg2) text-(--fg) active:bg-border"
                  onClick={() => setPageInput((prev) => prev.slice(0, -1))}
                >
                  <Delete className="size-5.5" />
                </button>
                <button
                  type="button"
                  className="h-13 rounded-[14px] bg-(--bg2) text-[22px] font-medium text-(--fg) active:bg-border"
                  onClick={() => pressDigit("0")}
                >
                  0
                </button>
                <button
                  type="button"
                  className="h-13 rounded-[14px] bg-(--fg) text-base font-semibold text-(--bg)"
                  onClick={() => {
                    if (pageInput !== "") {
                      const next = Number(pageInput);
                      goToPage(Math.max(FIRST_PAGE + 1, Math.min(LAST_PAGE + 1, next)) - 1);
                    }
                  }}
                >
                  Go
                </button>
              </div>
            </div>
          )}

          {activeSheet === "bookmarks" && (
            <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-50 flex h-[90%] flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[0_-8px_40px_rgba(0,0,0,0.22)]">
              <div className="mx-auto mt-2 h-1.25 w-9.5 rounded-full bg-border" />
              <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
                <span className="text-[13px] font-semibold tracking-[2px] uppercase">SAVED PAGES</span>
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setActiveSheet(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {sortedBookmarks.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-(--fg3)">
                    <Bookmark className="size-8 opacity-30" />
                    <span className="text-sm">No saved pages yet</span>
                    <span className="text-xs text-(--fg3)">Tap the bookmark icon while reading</span>
                  </div>
                ) : (
                  sortedBookmarks.map(({ page: p, date }) => {
                    const surah = getSurahForPage(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => goToPage(p)}
                        className="flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-left hover:bg-(--bg2)"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-base font-medium text-(--fg)">{surah.name}</span>
                          <span className="text-xs text-(--fg3)">{formatBookmarkDate(date)}</span>
                        </div>
                        <span className="text-sm tabular-nums text-(--fg3)">p.{p + 1}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeSheet === "about" && (
            <div className="animate-pop-in absolute left-1/2 top-1/2 z-50 flex w-75 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-3xl bg-(--bg) px-6 pb-6 pt-7 shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
              <div className="flex size-15.5 items-center justify-center rounded-2xl bg-(--fg) text-(--bg)">
                <BookOpen className="size-8" />
              </div>
              <div className="mt-3 text-xl font-semibold">Quran13</div>
              <div className="mt-1 text-[13px] text-(--fg2)">Quran Reader · v2.0</div>
              <div className="my-4 h-px w-full bg-border" />
              <p className="m-0 text-center text-[13px] leading-[1.65] text-(--fg2)">
                13-line Mushaf reader.
                <br />
                Swipe to turn pages and use Surah, Juz, or Page to jump.
                <br />
                Tap anywhere on the page to show/hide navigation.
                <br />
                Developed by Asrar Abbasi.
              </p>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="mt-5 h-11 w-full rounded-xl bg-(--fg) text-[15px] font-semibold text-(--bg)"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
