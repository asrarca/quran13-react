import { X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t } from "../i18n";
import { type Surah, type DragHandlers } from "../types";

type Props = {
  lang: Lang;
  surahs: Surah[];
  onClose: () => void;
  onNavigate: (page: number) => void;
  dragHandlers: DragHandlers;
};

export function SurahSheet({ lang, surahs, onClose, onNavigate, dragHandlers }: Props) {
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
        <span className="text-[13px] font-semibold tracking-[2px] uppercase">{t(lang, "surahIndex.title")}</span>
        <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {surahs.map((surah) => (
          <button
            key={surah.num}
            type="button"
            onClick={() => onNavigate(surah.page)}
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
  );
}
