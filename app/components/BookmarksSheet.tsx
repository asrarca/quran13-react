import { Bookmark, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t, langDateLocale } from "../i18n";
import { type Surah, type DragHandlers } from "../types";

type BookmarkEntry = { page: number; date: string };

type Props = {
  lang: Lang;
  sortedBookmarks: BookmarkEntry[];
  surahs: Surah[];
  onClose: () => void;
  onNavigate: (page: number) => void;
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

export function BookmarksSheet({ lang, sortedBookmarks, surahs, onClose, onNavigate, dragHandlers }: Props) {
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
        <span className="text-[13px] font-semibold tracking-[2px] uppercase">{t(lang, "bookmarks.title")}</span>
        <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortedBookmarks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-(--fg3)">
            <Bookmark className="size-8 opacity-30" />
            <span className="text-sm">{t(lang, "bookmarks.empty")}</span>
            <span className="text-xs text-(--fg3)">{t(lang, "bookmarks.emptyHint")}</span>
          </div>
        ) : (
          sortedBookmarks.map(({ page: p, date }) => {
            const surah = getSurahForPage(p, surahs);
            return (
              <button
                key={p}
                type="button"
                onClick={() => onNavigate(p)}
                className="flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-left hover:bg-(--bg2)"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-base font-medium text-(--fg)">{surah.name}</span>
                  <span className="text-xs text-(--fg3)">{formatDate(date, lang)}</span>
                </div>
                <span className="text-sm tabular-nums text-(--fg3)">p.{p + 1}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
