"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Bookmark, BookOpen, Hash, Layers, Moon, Settings, Sparkles, Sun, SunMoon, X } from "lucide-react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

import quranData from "@/data/quran-data.json";
import { Button } from "@/app/components/ui/button";
import { t, type Lang, SUPPORTED_LANGS, isRtlLang, needsFontScale } from "./i18n";
import { APP_VERSION, DEFAULT_START_PAGE, FIRST_PAGE, LAST_PAGE } from "./constants";
import {
  type ActiveSheet,
  type DragHandlers,
  type HighlightColorKey,
  type Juz,
  type LineBand,
  type LineCoord,
  type MushafKey,
  type Surah,
  type Theme,
} from "./types";
import { PageCard } from "./components/PageCard";
import { HighlightPicker } from "./components/HighlightPicker";
import { SurahSheet } from "./components/SurahSheet";
import { JuzSheet } from "./components/JuzSheet";
import { PageSheet } from "./components/PageSheet";
import { BookmarksSheet } from "./components/BookmarksSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { AskSheet } from "./components/AskSheet";

// Number of pages pre-rendered on each side of the active page. The Swiper
// holds 2 * SLIDE_RADIUS + 1 slides with the active page centered, so the user
// can swipe this many pages before reaching a slide edge.
const SLIDE_RADIUS = 10;
const CENTER_SLIDE = SLIDE_RADIUS;
const SLIDE_OFFSETS = Array.from({ length: 2 * SLIDE_RADIUS + 1 }, (_, i) => i - SLIDE_RADIUS);

function clampPage(value: number) {
  return Math.max(FIRST_PAGE, Math.min(LAST_PAGE, value));
}

function toArabicNumber(value: number) {
  return String(value).replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

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

// Map a normalized vertical position to a line index, or -1 if outside text lines.
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
  const [activeMushafKey, setActiveMushafKey] = useState<MushafKey>("original_tajweed");
  const [settingsSubView, setSettingsSubView] = useState<"mushaf" | "about" | "language" | "install" | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showTajweedRules, setShowTajweedRules] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [bookmarks, setBookmarks] = useState<Record<number, string>>({});
  const [missingImages, setMissingImages] = useState<Record<number, true>>({});
  const [navVisible, setNavVisible] = useState(true);
  const [showSections, setShowSections] = useState(false);
  const [highlights, setHighlights] = useState<Record<number, Record<number, HighlightColorKey>>>({});
  const [highlightPicker, setHighlightPicker] = useState<{ page: number; line: number } | null>(null);
  const [rakatMarkers, setRakatMarkers] = useState<Record<number, Record<number, number>>>({});
  const [navFlash, setNavFlash] = useState<{ page: number; line: number; stamp: number } | null>(null);

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
  const sheetDragY = useRef<number | null>(null);
  const navFlashTimer = useRef<number | null>(null);

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

  const currentJuzSection = useMemo(() => {
    const sections = currentJuz.sections;
    if (!sections) return null;
    let found: Juz | null = null;
    for (const s of sections) {
      if (s.page <= page) found = s;
      else break;
    }
    return found;
  }, [currentJuz, page]);

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
      try { setRakatMarkers(JSON.parse(rawRakat)); } catch { setRakatMarkers({}); }
    }

    const storedMushaf = localStorage.getItem("quran13-mushaf");
    if (storedMushaf && storedMushaf in quranData.mushafs) {
      setActiveMushafKey(storedMushaf as MushafKey);
    }

    const storedLang = localStorage.getItem("quran13-lang");
    if (storedLang && SUPPORTED_LANGS.some((l) => l.code === storedLang)) setLang(storedLang as Lang);

    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
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

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("quran13-lang", lang);
  }, [lang, mounted]);

  const goToPage = useCallback((targetPage: number) => {
    setPage(clampPage(targetPage));
    setActiveSheet(null);
    setPageInput("");
  }, []);

  const goToSection = useCallback((targetPage: number, line: number) => {
    setPage(clampPage(targetPage));
    setActiveSheet(null);
    setPageInput("");
    if (navFlashTimer.current !== null) window.clearTimeout(navFlashTimer.current);
    setNavFlash({ page: clampPage(targetPage), line, stamp: Date.now() });
    navFlashTimer.current = window.setTimeout(() => {
      setNavFlash(null);
      navFlashTimer.current = null;
    }, 2000);
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

  const handleSheetDragDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    sheetDragY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handleSheetDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (sheetDragY.current === null) return;
    if (e.clientY - sheetDragY.current > 72) {
      sheetDragY.current = null;
      setActiveSheet(null);
    }
  }, []);

  const handleSheetDragEnd = useCallback(() => { sheetDragY.current = null; }, []);

  const handlePressStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, candidate: number) => {
      if (activeSheet) return;
      suppressClick.current = false;
      const rect = event.currentTarget.getBoundingClientRect();
      const frac = (event.clientY - rect.top) / rect.height;
      const line = lineAtFraction(frac, bandsForPage(candidate));
      if (line < 0) return;
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

  const sortedBookmarks = Object.entries(bookmarks)
    .map(([p, date]) => ({ page: Number(p), date }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const canRenderPage = (candidate: number) => candidate >= FIRST_PAGE && candidate <= LAST_PAGE;

  const dragHandlers: DragHandlers = {
    onPointerDown: handleSheetDragDown,
    onPointerMove: handleSheetDragMove,
    onPointerUp: handleSheetDragEnd,
    onPointerCancel: handleSheetDragEnd,
  };

  const pageCardProps = {
    activeMushaf,
    theme,
    highlights,
    rakatMarkers,
    missingImages,
    lang,
    onPressStart: handlePressStart,
    onPressMove: handlePressMove,
    onPressEnd: cancelPress,
    onMissingImage: (p: number) => setMissingImages((prev) => ({ ...prev, [p]: true })),
  };

  if (!mounted) {
    return <main className="min-h-screen bg-(--bg)" />;
  }

  return (
    <main data-theme={theme} dir={isRtlLang(lang) ? "rtl" : undefined} className="flex min-h-screen flex-col bg-(--bg) text-(--fg)">
      <header className="relative flex items-center justify-between gap-3 px-4 pb-3 pt-1">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{t(lang, "header.surahPrefix")} {surahsOnPage.map((s) => s.name).join(", ")}</div>
          <div className="mt-px text-xs text-(--fg2)">
            {t(lang, "header.juzPage", { juz: Math.floor(currentJuz.num), page: page + 1, section: currentJuzSection ? ` ${currentJuzSection.id === "quarter" ? "¼" : currentJuzSection.id === "half" ? "½" : "¾"}` : "" })}
            <span className="ml-1.5 opacity-70">· {((page - FIRST_PAGE) / (LAST_PAGE - FIRST_PAGE) * 100).toFixed(1)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 rounded-full bg-(--bg2) text-(--fg2)"
            onClick={() => setActiveSheet("ask")}
            aria-label="Ask"
          >
            <Sparkles className="size-4.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 rounded-full bg-(--bg2) text-(--fg2)"
            onClick={toggleBookmark}
            aria-label="Toggle bookmark"
          >
            <Bookmark className="size-4.5" fill={isBookmarked ? "currentColor" : "none"} />
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
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/[0.07] dark:bg-white/[0.07]">
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
          if (!activeSheet) setNavVisible((v) => !v);
        }}
      >
        <div className="absolute inset-0">
          <Swiper
            dir="rtl"
            initialSlide={CENTER_SLIDE}
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
              if (idx === CENTER_SLIDE) return;
              const delta = idx - CENTER_SLIDE;
              flushSync(() => setPage((prev) => clampPage(prev + delta)));
              swiper.slideTo(CENTER_SLIDE, 0, false);
              swiper.slides[CENTER_SLIDE].scrollTop = 0;
              window.scrollTo(0, 0);
            }}
            className="h-full"
            style={{ touchAction: "pan-y" } as React.CSSProperties}
          >
            {/* RTL: slides run oldest → newest; offset 0 is the active page, centered */}
            {SLIDE_OFFSETS.map((offset) => {
              const candidate = page + offset;
              return (
                <SwiperSlide key={offset} style={{ overflowY: "auto" }}>
                  <div className="flex min-h-full flex-col items-center justify-start pb-12 landscape:pb-0">
                    {canRenderPage(candidate) && (
                      <PageCard
                        {...pageCardProps}
                        candidate={candidate}
                        bands={bandsForPage(candidate)}
                        flashLine={navFlash?.page === candidate ? navFlash.line : undefined}
                        flashKey={navFlash?.page === candidate ? navFlash.stamp : undefined}
                      />
                    )}
                  </div>
                </SwiperSlide>
              );
            })}
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
          <button type="button" onClick={() => setActiveSheet("surah")} className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)">
            <BookOpen className="size-5.5" />
            <span className={`${needsFontScale(lang) ? 'text-[17px]' : 'text-[11px]'} font-medium`}>{t(lang, "nav.surah")}</span>
          </button>
          <button type="button" onClick={() => setActiveSheet("juz")} className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)">
            <Layers className="size-5.5" />
            <span className={`${needsFontScale(lang) ? 'text-[17px]' : 'text-[11px]'} font-medium`}>{t(lang, "nav.juz")}</span>
          </button>
          <button
            type="button"
            onClick={() => { setPageInput(""); setActiveSheet("page"); }}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <Hash className="size-5.5" />
            <span className={`${needsFontScale(lang) ? 'text-[17px]' : 'text-[11px]'} font-medium`}>{t(lang, "nav.page")}</span>
          </button>
          <button type="button" onClick={() => setActiveSheet("bookmarks")} className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)">
            <Bookmark className="size-5.5" fill={activeSheet === "bookmarks" ? "currentColor" : "none"} />
            <span className={`${needsFontScale(lang) ? 'text-[17px]' : 'text-[11px]'} font-medium`}>{t(lang, "nav.saved")}</span>
          </button>
          <button
            type="button"
            onClick={() => { setSettingsSubView(null); setActiveSheet("settings"); }}
            className="flex flex-col items-center justify-center gap-1 py-1 text-(--fg2)"
          >
            <Settings className="size-5.5" />
            <span className={`${needsFontScale(lang) ? 'text-[17px]' : 'text-[11px]'} font-medium`}>{t(lang, "nav.settings")}</span>
          </button>
        </nav>
      </div>

      {highlightPicker && (
        <HighlightPicker
          page={highlightPicker.page}
          line={highlightPicker.line}
          lang={lang}
          highlights={highlights}
          rakatMarkers={rakatMarkers}
          onClose={() => setHighlightPicker(null)}
          onSetHighlight={setHighlightColor}
          onSetRakat={setRakatMarker}
        />
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
            <SurahSheet lang={lang} surahs={surahs} juz={juz} currentPage={page} onClose={() => setActiveSheet(null)} onNavigate={goToPage} dragHandlers={dragHandlers} />
          )}
          {activeSheet === "juz" && (
            <JuzSheet
              lang={lang}
              juz={juz}
              surahs={surahs}
              currentPage={page}
              showSections={showSections}
              onToggleSections={() => setShowSections((v) => !v)}
              onClose={() => setActiveSheet(null)}
              onNavigate={goToPage}
              onNavigateSection={goToSection}
              dragHandlers={dragHandlers}
            />
          )}
          {activeSheet === "ask" && (
            <AskSheet lang={lang} onClose={() => setActiveSheet(null)} onNavigate={goToPage} />
          )}
          {activeSheet === "page" && (
            <PageSheet
              lang={lang}
              pageInput={pageInput}
              pageDisplay={pageDisplay}
              firstPage={FIRST_PAGE}
              lastPage={LAST_PAGE}
              onClose={() => setActiveSheet(null)}
              onNavigate={goToPage}
              onPressDigit={pressDigit}
              onDeleteDigit={() => setPageInput((prev) => prev.slice(0, -1))}
            />
          )}
          {activeSheet === "bookmarks" && (
            <BookmarksSheet
              lang={lang}
              sortedBookmarks={sortedBookmarks}
              surahs={surahs}
              onClose={() => setActiveSheet(null)}
              onNavigate={goToPage}
              dragHandlers={dragHandlers}
            />
          )}
          {activeSheet === "settings" && (
            <SettingsSheet
              lang={lang}
              settingsSubView={settingsSubView}
              setSettingsSubView={setSettingsSubView}
              activeMushafKey={activeMushafKey}
              isStandalone={isStandalone}
              appVersion={APP_VERSION}
              onClose={() => setActiveSheet(null)}
              onMushafChange={(key) => { setActiveMushafKey(key); setMissingImages({}); }}
              onShowTajweedRules={() => setShowTajweedRules(true)}
              onLangChange={setLang}
              dragHandlers={dragHandlers}
            />
          )}
        </div>
      )}

      {showTajweedRules && (
        <div
          className="fixed inset-0 z-200 flex items-center justify-center bg-black/80"
          onClick={() => setShowTajweedRules(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"
            onClick={() => setShowTajweedRules(false)}
          >
            <X className="size-5" />
          </button>
          <Image
            src="/quran-pages/original_tajweed/page-002.jpg"
            alt={t(lang, "misc.tajweedRulesAlt")}
            width={800}
            height={1100}
            className="max-h-[90dvh] max-w-[90dvw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
