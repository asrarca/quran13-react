"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Ban,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Delete,
  Hash,
  Layers,
  Moon,
  Settings,
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
type ActiveSheet = null | "surah" | "juz" | "page" | "bookmarks" | "settings";

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

const APP_VERSION = "2.0.1";

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

type MushafKey = keyof typeof quranData.mushafs;

function imagePath(page: number, mushaf: { dir: string; filePrefix: string; fileExtension: string; pageOffset: number }) {
  const { dir, filePrefix, fileExtension, pageOffset } = mushaf;
  return `${dir}/${filePrefix}${String(page + pageOffset).padStart(3, "0")}.${fileExtension}`;
}

type LineCoord = { x: number; y: number; w: number };
type LineBand = { top: number; bottom: number; left: number; right: number };

function computeBands(coords: LineCoord[], lineHeight?: number): LineBand[] {
  return coords.map((coord, i, arr) => {
    let top: number, bottom: number;
    if (lineHeight !== undefined) {
      top = coord.y - lineHeight / 2;
      bottom = coord.y + lineHeight / 2;
    } else {
      const prev = arr[i - 1]?.y;
      const next = arr[i + 1]?.y;
      top = prev === undefined ? Math.max(0, coord.y - (next - coord.y) / 2) : (prev + coord.y) / 2;
      bottom = next === undefined ? Math.min(1, coord.y + (coord.y - prev) / 2) : (coord.y + next) / 2;
    }
    return { top, bottom, left: coord.x - coord.w / 2, right: coord.x + coord.w / 2 };
  });
}

function pageKey(p: number) {
  return String(p).padStart(3, "0");
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

const HIGHLIGHT_COLORS = [
  { key: "yellow", hex: "#ffe600" },
  { key: "green",  hex: "#4ade60" },
  { key: "red",    hex: "#f82020" },
  { key: "blue",   hex: "#60a5fa" },
] as const;
type HighlightColorKey = typeof HIGHLIGHT_COLORS[number]["key"];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [page, setPage] = useState(DEFAULT_START_PAGE);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [pageInput, setPageInput] = useState("");
  const [activeMushafKey, setActiveMushafKey] = useState<MushafKey>("original_tajweed");
  const [settingsSubView, setSettingsSubView] = useState<"mushaf" | "about" | null>(null);
  // Record<internalPage, ISO date string>
  const [bookmarks, setBookmarks] = useState<Record<number, string>>({});
  const [missingImages, setMissingImages] = useState<Record<number, true>>({});
  const [navVisible, setNavVisible] = useState(true);
  const [showSections, setShowSections] = useState(false);
  // Record<internalPage, Record<lineIndex, colorKey>>
  const [highlights, setHighlights] = useState<Record<number, Record<number, HighlightColorKey>>>({});
  const [highlightPicker, setHighlightPicker] = useState<{ page: number; line: number } | null>(null);
  // Record<internalPage, Record<lineIndex, rakatNumber (1-20)>>
  const [rakatMarkers, setRakatMarkers] = useState<Record<number, Record<number, number>>>({});

  const activeMushaf = quranData.mushafs[activeMushafKey];

  const lineBandsMap = useMemo<Record<string, LineBand[]>>(() => {
    const coordsMap = activeMushaf.lineCoordinates as Record<string, LineCoord[]>;
    return Object.fromEntries(
      Object.entries(coordsMap).map(([key, coords]) => [key, computeBands(coords, activeMushaf.lineHeight)])
    );
  }, [activeMushafKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function bandsForPage(p: number): LineBand[] {
    return lineBandsMap[pageKey(p)] ?? lineBandsMap.default;
  }

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
        const parsed = JSON.parse(rawHighlights);
        // Migrate old format Record<page, number[]> → Record<page, Record<line, color>>
        const migrated: Record<number, Record<number, HighlightColorKey>> = {};
        for (const [p, val] of Object.entries(parsed)) {
          if (Array.isArray(val)) {
            migrated[Number(p)] = Object.fromEntries((val as number[]).map((l) => [l, "yellow"]));
          } else {
            migrated[Number(p)] = val as Record<number, HighlightColorKey>;
          }
        }
        setHighlights(migrated);
      } catch {
        setHighlights({});
      }
    }

    const rawRakat = localStorage.getItem("quran13-rakat");
    if (rawRakat) {
      try {
        setRakatMarkers(JSON.parse(rawRakat));
      } catch {
        setRakatMarkers({});
      }
    }

    const storedMushaf = localStorage.getItem("quran13-mushaf");
    if (storedMushaf && storedMushaf in quranData.mushafs) {
      setActiveMushafKey(storedMushaf as MushafKey);
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

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("quran13-rakat", JSON.stringify(rakatMarkers));
  }, [rakatMarkers, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("quran13-mushaf", activeMushafKey);
  }, [activeMushafKey, mounted]);

  const goToPage = useCallback((targetPage: number) => {
    setPage(clampPage(targetPage));
    setActiveSheet(null);
    setPageInput("");
  }, []);

  const setRakatMarker = useCallback((targetPage: number, line: number, rakat: number | null) => {
    setRakatMarkers((prev) => {
      const pageMap = { ...(prev[targetPage] ?? {}) };
      if (rakat === null) delete pageMap[line];
      else pageMap[line] = rakat;
      const next = { ...prev };
      if (Object.keys(pageMap).length) next[targetPage] = pageMap;
      else delete next[targetPage];
      return next;
    });
  }, []);

  const setHighlightColor = useCallback((targetPage: number, line: number, color: HighlightColorKey | null) => {
    setHighlights((prev) => {
      const pageMap = { ...(prev[targetPage] ?? {}) };
      if (color === null) delete pageMap[line];
      else pageMap[line] = color;
      const next = { ...prev };
      if (Object.keys(pageMap).length) next[targetPage] = pageMap;
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
        setHighlightPicker({ page: info.page, line: info.line });
      }, LONG_PRESS_MS);
    },
    [activeSheet, lineBandsMap] // eslint-disable-line react-hooks/exhaustive-deps
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
    const pageHighlights = Object.entries(highlights[candidate] ?? {})
      .map(([lineStr, color]) => ({ line: Number(lineStr), color }))
      .filter(({ line }) => bands[line]);

    return (
      <div
        className="relative w-full select-none overflow-hidden border border-border bg-(--paper) shadow-[0_6px_30px_rgba(0,0,0,0.14),0_0_0_1px_var(--border)]"
        style={{ aspectRatio: activeMushaf.aspectRatio, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {missing ? (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-(--fg2)">
            Page {candidate} image is unavailable
          </div>
        ) : (
          <>
            <Image
              src={imagePath(candidate, activeMushaf)}
              alt={`Quran page ${candidate}`}
              fill
              className="object-cover object-top"
              style={theme === "dark-invert" ? { filter: "invert(1)" } : undefined}
              draggable={false}
              priority
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
              {pageHighlights.map(({ line, color }) => (
                <div
                  key={line}
                  className="pointer-events-none absolute opacity-35 mix-blend-multiply"
                  style={{
                    backgroundColor: HIGHLIGHT_COLORS.find((c) => c.key === color)?.hex ?? "#ffe600",
                    top: `${bands[line].top * 100}%`,
                    height: `${(bands[line].bottom - bands[line].top) * 100}%`,
                    left: `${bands[line].left * 100}%`,
                    width: `${(bands[line].right - bands[line].left) * 100}%`,
                  }}
                />
              ))}
              {Object.entries(rakatMarkers[candidate] ?? {}).map(([lineStr, rakat]) => {
                const line = Number(lineStr);
                const band = bands[line];
                if (!band) return null;
                const midY = (band.top + band.bottom) / 2;
                return (
                  <div
                    key={`rakat-${line}`}
                    className="pointer-events-none absolute flex aspect-square w-[6%] items-center justify-center rounded-full bg-gray-500 font-bold text-white"
                    style={{
                      top: `${midY * 100}%`,
                      [(candidate + 1) % 2 === 0 ? "left" : "right"]: "1%",
                      transform: "translateY(-50%)",
                      fontSize: "3vw",
                    }}
                  >
                    {rakat}
                  </div>
                );
              })}
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
            initialSlide={2}
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
              if (idx === 2) return;
              // RTL: swipe right → idx 3 (next page); swipe left → idx 1 (prev page)
              const delta = idx < 2 ? -1 : 1;
              flushSync(() => setPage((prev) => clampPage(prev + delta)));
              swiper.slideTo(2, 0, false);
              swiper.slides[2].scrollTop = 0;
              window.scrollTo(0, 0);
            }}
            className="h-full"
            style={{ touchAction: "pan-y" } as React.CSSProperties}
          >
            {/* RTL: index 0 = page − 2 */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page - 2)}
              </div>
            </SwiperSlide>
            {/* index 1 = page − 1 */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page - 1)}
              </div>
            </SwiperSlide>
            {/* index 2 = current page */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page)}
              </div>
            </SwiperSlide>
            {/* index 3 = page + 1 */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page + 1)}
              </div>
            </SwiperSlide>
            {/* index 4 = page + 2 */}
            <SwiperSlide style={{ overflowY: "auto" }}>
              <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                {renderPageCard(page + 2)}
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
            onClick={() => { setSettingsSubView(null); setActiveSheet("settings"); }}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <Settings className="size-5.5" />
            <span className="text-[11px] font-medium">Settings</span>
          </button>
        </nav>
      </div>

      {highlightPicker && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label="Close"
            onClick={() => setHighlightPicker(null)}
          />
          <div className="animate-pop-in absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 rounded-3xl bg-(--bg) px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.32)] min-w-64 max-w-[calc(100vw-2rem)]">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-(--fg2)">Line Highlight</span>
            <div className="flex items-center gap-3">
              {HIGHLIGHT_COLORS.map(({ key, hex }) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  className="size-8 rounded-full shadow-sm transition-transform active:scale-90"
                  style={{ backgroundColor: hex }}
                  onClick={() => {
                    setHighlightColor(highlightPicker.page, highlightPicker.line, key);
                    setHighlightPicker(null);
                  }}
                />
              ))}
              {highlights[highlightPicker.page]?.[highlightPicker.line] && (
                <button
                  type="button"
                  aria-label="Remove highlight"
                  className="flex size-8 items-center justify-center rounded-full border-2 border-border bg-(--bg2) transition-transform active:scale-90"
                  onClick={() => {
                    setHighlightColor(highlightPicker.page, highlightPicker.line, null);
                    setHighlightPicker(null);
                  }}
                >
                  <Ban className="size-5 text-gray-500" />
                </button>
              )}
            </div>
            <div className="w-full h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-(--fg2)">Number Annotation</span>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rakat ${n}`}
                  className={`flex size-7 items-center justify-center rounded-full text-[12px] font-semibold transition-transform active:scale-90 ${
                    rakatMarkers[highlightPicker.page]?.[highlightPicker.line] === n
                      ? "bg-teal-500 text-white"
                      : "bg-(--bg2) text-(--fg)"
                  }`}
                  onClick={() => {
                    setRakatMarker(highlightPicker.page, highlightPicker.line, n);
                    setHighlightPicker(null);
                  }}
                >
                  {n}
                </button>
              ))}
              {rakatMarkers[highlightPicker.page]?.[highlightPicker.line] && (
                <button
                  type="button"
                  aria-label="Remove rakat marker"
                  className="flex size-7 items-center justify-center rounded-full border-2 border-border bg-(--bg2) transition-transform active:scale-90"
                  onClick={() => {
                    setRakatMarker(highlightPicker.page, highlightPicker.line, null);
                    setHighlightPicker(null);
                  }}
                >
                  <Ban className="size-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

          {activeSheet === "settings" && (
            <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-50 flex h-[90%] flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[0_-8px_40px_rgba(0,0,0,0.22)]">
              <div className="mx-auto mt-2 h-1.25 w-9.5 shrink-0 rounded-full bg-border" />
              <div className="flex-1 overflow-hidden">
                <div
                  className="flex h-full transition-transform duration-300 ease-in-out"
                  style={{
                    width: "300%",
                    transform: settingsSubView === "mushaf"
                      ? "translateX(-33.333%)"
                      : settingsSubView === "about"
                        ? "translateX(-66.667%)"
                        : "translateX(0)",
                  }}
                >
                  {/* Panel 1: main settings */}
                  <div className="flex h-full w-1/3 flex-col">
                    <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
                      <span className="text-[13px] font-semibold tracking-[2px] uppercase">Settings</span>
                      <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setActiveSheet(null)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-left active:bg-(--bg2)"
                        onClick={() => setSettingsSubView("mushaf")}
                      >
                        <span className="text-base text-(--fg)">Mushaf Style</span>
                        <div className="flex items-center gap-1.5 text-(--fg2)">
                          <span className="text-sm">{activeMushaf.name}</span>
                          <ChevronRight className="size-4" />
                        </div>
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-left active:bg-(--bg2)"
                        onClick={() => setSettingsSubView("about")}
                      >
                        <span className="text-base text-(--fg)">About</span>
                        <div className="flex items-center gap-1.5 text-(--fg2)">
                          <span className="text-sm">v{APP_VERSION}</span>
                          <ChevronRight className="size-4" />
                        </div>
                      </button>
                    </div>
                    <div className="shrink-0 border-t border-border px-5 py-4 text-center text-sm text-(--fg3)">
                      Developed by Asrar Abbasi
                    </div>
                  </div>

                  {/* Panel 2: mushaf picker */}
                  <div className="flex h-full w-1/3 flex-col">
                    <div className="flex items-center gap-2 border-b border-border px-5 pb-3 pt-2">
                      <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setSettingsSubView(null)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-[13px] font-semibold tracking-[2px] uppercase">Mushaf Style</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {(Object.keys(quranData.mushafs) as MushafKey[]).map((key) => {
                        const mushaf = quranData.mushafs[key];
                        const selected = activeMushafKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            className="flex w-full items-center gap-3.5 border-b border-border px-5 py-4 text-left active:bg-(--bg2)"
                            onClick={() => {
                              setActiveMushafKey(key);
                              setMissingImages({});
                              setSettingsSubView(null);
                            }}
                          >
                            <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-(--fg) bg-(--fg)" : "border-(--fg3)"}`}>
                              {selected && <div className="size-2 rounded-full bg-(--bg)" />}
                            </div>
                            <span className={`text-base ${selected ? "font-semibold text-(--fg)" : "text-(--fg)"}`}>
                              {mushaf.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Panel 3: about / how-to */}
                  <div className="flex h-full w-1/3 flex-col">
                    <div className="flex items-center gap-2 border-b border-border px-5 pb-3 pt-2">
                      <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setSettingsSubView(null)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-[13px] font-semibold tracking-[2px] uppercase">About</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                      <p className="mb-6 text-sm text-(--fg2)">Quran 13 · v{APP_VERSION}</p>

                      <div className="mb-6">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-(--fg3)">Reading</p>
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="text-base font-medium text-(--fg)">Navigate pages</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Swipe left or right to move between pages.</p>
                          </div>
                          <div>
                            <p className="text-base font-medium text-(--fg)">Landscape mode</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Rotate your device to landscape orientation and immediately get a larger view of the Quran text.</p>
                          </div>
                          <div>
                            <p className="text-base font-medium text-(--fg)">Toggle menu</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Tap anywhere on the page to show or hide the navigation bar.</p>
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-(--fg3)">Highlighting & Annotations</p>
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="text-base font-medium text-(--fg)">Highlight a line</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Press and hold any line to open the highlight picker. Choose a colour to mark it, or clear an existing highlight.</p>
                          </div>
                          <div>
                            <p className="text-base font-medium text-(--fg)">Add an annotation</p>
                            <p className="mt-0.5 mb-2 text-sm text-(--fg2)">After long-pressing, pick a number (1–20) to add a numbered marker to that line.</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Tip for Huffaz: use number annotations to mark the line where each Taraweh rakat ends — making it easy to resume from the right place.</p>
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-(--fg3)">Bookmarks</p>
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="text-base font-medium text-(--fg)">Save a page</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Tap the bookmark icon in the top-right corner to save the current page. Tap it again to remove the bookmark.</p>
                          </div>
                          <div>
                            <p className="text-base font-medium text-(--fg)">View saved pages</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Open the Saved tab in the navigation bar to see all your bookmarked pages, sorted by most recently added.</p>
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-(--fg3)">Display</p>
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="text-base font-medium text-(--fg)">Theme</p>
                            <p className="mt-0.5 text-sm text-(--fg2)">Tap the sun/moon icon in the top-right to cycle through three display modes: Light, Dark, and Dark Inverted (white text on a black page image).</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
