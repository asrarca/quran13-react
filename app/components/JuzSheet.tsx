import { X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t } from "../i18n";
import { type Juz, type DragHandlers } from "../types";

type Props = {
  lang: Lang;
  juz: Juz[];
  showSections: boolean;
  onToggleSections: () => void;
  onClose: () => void;
  onNavigate: (page: number) => void;
  dragHandlers: DragHandlers;
};

export function JuzSheet({ lang, juz, showSections, onToggleSections, onClose, onNavigate, dragHandlers }: Props) {
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
        <span className="text-[13px] font-semibold tracking-[2px] uppercase">{t(lang, "juzIndex.title")}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSections}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              showSections ? "border-transparent bg-(--fg) text-(--bg)" : "border-border bg-(--bg2) text-(--fg2)"
            }`}
          >
            {t(lang, "juzIndex.halves")}
          </button>
          <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {juz.map((item) => (
          <div key={item.num}>
            <button
              type="button"
              onClick={() => onNavigate(item.page)}
              className={`flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-left hover:bg-(--bg2) ${item.isNisf ? "opacity-60" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate text-base font-medium text-(--fg)">{t(lang, "nav.juz")} {item.num}</span>
              <span className="text-xs text-(--fg3)">p.{item.page + 1}</span>
              <span className="font-amiri font-bold text-[22px]" dir="rtl">{item.arabicStart}</span>
            </button>
            {showSections && item.sections?.map((section) => (
              <button
                key={section.num}
                type="button"
                onClick={() => onNavigate(section.page)}
                className="flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-left hover:bg-(--bg2) opacity-60"
              >
                <span className="w-6 text-right text-sm tabular-nums text-(--fg3)">½</span>
                <span className="min-w-0 flex-1 truncate text-sm text-(--fg) opacity-50">{section.name}</span>
                <span className="text-xs text-(--fg3)">p.{section.page + 1}</span>
                <span className="font-amiri text-[18px] opacity-60" dir="rtl">{section.arabicStart}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
