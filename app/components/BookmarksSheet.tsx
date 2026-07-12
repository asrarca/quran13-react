import { useState } from "react";
import { Bookmark, Hash, Highlighter, Trash2, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t, langDateLocale, needsFontScale } from "../i18n";
import { HIGHLIGHT_COLORS, type HighlightColorKey, type Surah, type DragHandlers } from "../types";

type BookmarkEntry = { page: number; date: string };

type SavedTab = "bookmarks" | "highlights" | "annotations";
const TABS: SavedTab[] = ["bookmarks", "highlights", "annotations"];

type Props = {
  lang: Lang;
  sortedBookmarks: BookmarkEntry[];
  surahs: Surah[];
  highlights: Record<number, Record<number, HighlightColorKey>>;
  rakatMarkers: Record<number, Record<number, number>>;
  onClose: () => void;
  onNavigate: (page: number) => void;
  onNavigateLine: (page: number, line: number) => void; // line is 1-based (flash convention)
  onDeleteHighlight: (page: number, line: number) => void;
  onDeleteAnnotation: (page: number, line: number) => void;
  dragHandlers: DragHandlers;
};

function getSurahForPage(page: number, surahs: Surah[]): Surah {
  let result = surahs[0];
  for (const surah of surahs) {
    if (surah.page <= page) result = surah;
    else break;
  }
  return result;
}

function formatDate(iso: string, lang: Lang): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(langDateLocale[lang], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Flatten a page → line → value map into a page/line-sorted list.
function flattenLineMap<T>(map: Record<number, Record<number, T>>): { page: number; line: number; value: T }[] {
  return Object.entries(map)
    .flatMap(([p, lines]) =>
      Object.entries(lines).map(([l, value]) => ({ page: Number(p), line: Number(l), value }))
    )
    .sort((a, b) => a.page - b.page || a.line - b.line);
}

export function BookmarksSheet({
  lang,
  sortedBookmarks,
  surahs,
  highlights,
  rakatMarkers,
  onClose,
  onNavigate,
  onNavigateLine,
  onDeleteHighlight,
  onDeleteAnnotation,
  dragHandlers,
}: Props) {
  const [tab, setTab] = useState<SavedTab>("bookmarks");
  const highlightList = flattenLineMap(highlights);
  const annotationList = flattenLineMap(rakatMarkers);

  // Rows share a layout mirroring the bookmarks list: leading icon, surah name
  // with "Page X, Line Y" beneath it (line is stored 0-based; displayed and
  // flashed 1-based), trailing delete.
  const lineRow = (
    page: number,
    line: number,
    icon: React.ReactNode,
    onDelete: (page: number, line: number) => void
  ) => (
    <div key={`${page}-${line}`} className="flex items-center border-b border-border">
      <button
        type="button"
        onClick={() => onNavigateLine(page, line + 1)}
        className="flex min-w-0 flex-1 items-center gap-3.5 px-5 py-3.25 text-start hover:bg-(--bg2)"
      >
        {icon}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-base font-medium text-(--fg)">{getSurahForPage(page, surahs).name}</span>
          <span className="text-xs text-(--fg2)">
            {t(lang, "bookmarks.pageLine", { page: page + 1, line: line + 1 })}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onDelete(page, line)}
        className="shrink-0 px-5 py-3.25 text-red-500 hover:bg-(--bg2)"
        aria-label={t(lang, "bookmarks.delete")}
      >
        <Trash2 className="size-4.5" />
      </button>
    </div>
  );

  const emptyState = (icon: React.ReactNode, text: string, hint: string) => (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-(--fg2)">
      {icon}
      <span className="text-sm">{text}</span>
      <span className="text-xs text-(--fg2)">{hint}</span>
    </div>
  );

  return (
    <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-50 flex h-[90%] flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[0_-8px_40px_rgba(0,0,0,0.22)]">
      <div
        className="flex shrink-0 cursor-grab items-center justify-center pb-1 pt-3"
        style={{ touchAction: "none" }}
        onPointerDown={dragHandlers.onPointerDown}
        onPointerMove={dragHandlers.onPointerMove}
        onPointerUp={dragHandlers.onPointerUp}
        onPointerCancel={dragHandlers.onPointerCancel}
      >
        <div className="pointer-events-none h-1.25 w-9.5 rounded-full bg-border" />
      </div>
      <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
        <span className={`${needsFontScale(lang) ? "text-[1.25rem]" : "text-[0.8125rem] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "bookmarks.title")}</span>
        <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex shrink-0 gap-1.5 border-b border-border px-5 py-2.5">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-1.5 font-medium ${needsFontScale(lang) ? "text-[1rem]" : "text-[0.8125rem]"} ${
              tab === key ? "bg-(--fg) text-(--bg)" : "bg-(--bg2) text-(--fg2)"
            }`}
          >
            {t(lang, `bookmarks.tab.${key}`)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "bookmarks" &&
          (sortedBookmarks.length === 0
            ? emptyState(
                <Bookmark className="size-8 opacity-30" />,
                t(lang, "bookmarks.empty"),
                t(lang, "bookmarks.emptyHint")
              )
            : sortedBookmarks.map(({ page: p, date }) => {
                const surah = getSurahForPage(p, surahs);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onNavigate(p)}
                    className="flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-start hover:bg-(--bg2)"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-base font-medium text-(--fg)">{surah.name}</span>
                      <span className="text-xs text-(--fg2)">{formatDate(date, lang)}</span>
                    </div>
                    <span className="text-sm tabular-nums text-(--fg2)">p.{p + 1}</span>
                  </button>
                );
              }))}
        {tab === "highlights" &&
          (highlightList.length === 0
            ? emptyState(
                <Highlighter className="size-8 opacity-30" />,
                t(lang, "bookmarks.highlightsEmpty"),
                t(lang, "bookmarks.lineHint")
              )
            : highlightList.map(({ page: p, line, value }) =>
                lineRow(
                  p,
                  line,
                  <span
                    className="size-4.5 shrink-0 rounded-full"
                    style={{ backgroundColor: HIGHLIGHT_COLORS.find((c) => c.key === value)?.hex ?? "#ffe600" }}
                  />,
                  onDeleteHighlight
                )
              ))}
        {tab === "annotations" &&
          (annotationList.length === 0
            ? emptyState(
                <Hash className="size-8 opacity-30" />,
                t(lang, "bookmarks.annotationsEmpty"),
                t(lang, "bookmarks.lineHint")
              )
            : annotationList.map(({ page: p, line, value }) =>
                lineRow(
                  p,
                  line,
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-500 text-xs font-bold text-white">
                    {value}
                  </span>,
                  onDeleteAnnotation
                )
              ))}
      </div>
    </div>
  );
}
