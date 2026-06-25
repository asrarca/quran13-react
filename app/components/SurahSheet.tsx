import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t, needsFontScale } from "../i18n";
import { type Surah, type Juz, type DragHandlers } from "../types";

type Props = {
  lang: Lang;
  surahs: Surah[];
  juz: Juz[];
  currentPage: number;
  onClose: () => void;
  onNavigate: (page: number) => void;
  dragHandlers: DragHandlers;
};

function getSurahJuzSubtitle(surah: Surah, surahList: Surah[], juzList: Juz[], lang: Lang): string {
  const surahStart = surah.page;
  const surahIdx = surahList.indexOf(surah);
  const nextSurah = surahList[surahIdx + 1];
  const surahEnd = nextSurah ? Math.max(surahStart, nextSurah.page - 1) : Infinity;

  let startIdx = 0;
  for (let i = 0; i < juzList.length; i++) {
    if (juzList[i].page <= surahStart) startIdx = i;
    else break;
  }

  let endIdx = startIdx;
  for (let i = startIdx; i < juzList.length; i++) {
    if (juzList[i].page <= surahEnd) endIdx = i;
    else break;
  }

  const juzLabel = t(lang, "nav.juz");
  const startNum = juzList[startIdx].num;
  const endNum = juzList[endIdx].num;

  const count = endIdx - startIdx + 1;
  if (count <= 3) return Array.from({ length: count }, (_, i) => `${juzLabel} ${juzList[startIdx + i].num}`).join(", ");
  return `${juzLabel} ${startNum} – ${juzLabel} ${endNum}`;
}

export function SurahSheet({ lang, surahs, juz, currentPage, onClose, onNavigate, dragHandlers }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "start" });
  }, []);

  let activeSurahNum = surahs[0].num;
  for (const surah of surahs) {
    if (surah.page <= currentPage) activeSurahNum = surah.num;
    else break;
  }

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
        <span className={`${needsFontScale(lang) ? "text-[20px]" : "text-[13px] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "surahIndex.title")}</span>
        <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {surahs.map((surah) => (
          <button
            ref={surah.num === activeSurahNum ? activeRef : undefined}
            key={surah.num}
            type="button"
            onClick={() => onNavigate(surah.page)}
            className="flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-start hover:bg-(--bg2)"
          >
            <span className="w-6 text-right text-sm tabular-nums text-(--fg2) mb-3.5">{surah.num}</span>
            <div className="min-w-0 flex-1 flex flex-col">
              <span className="truncate text-base font-medium text-(--fg)">{surah.name}</span>
              <span className="truncate text-xs text-(--fg2)">{getSurahJuzSubtitle(surah, surahs, juz, lang)}</span>
            </div>
            <span className="text-xs text-(--fg2)">p.{surah.page + 1}</span>
            <span className="font-amiri font-bold text-[22px]" dir="rtl">{surah.arabic}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
