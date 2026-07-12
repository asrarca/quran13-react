import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t, needsFontScale } from "../i18n";
import { type Juz, type Surah, type DragHandlers } from "../types";

type Props = {
  lang: Lang;
  juz: Juz[];
  surahs: Surah[];
  currentPage: number;
  showSections: boolean;
  onToggleSections: () => void;
  onClose: () => void;
  onNavigate: (page: number) => void;
  onNavigateSection: (page: number, line: number) => void;
  dragHandlers: DragHandlers;
};

function getJuzSurahSubtitle(item: Juz, juzList: Juz[], surahs: Surah[]): string {
  const juzStart = item.page;
  const juzIdx = juzList.indexOf(item);
  const nextJuz = juzList[juzIdx + 1];
  const juzEnd = nextJuz ? nextJuz.page - 1 : Infinity;

  let startIdx = 0;
  for (let i = 0; i < surahs.length; i++) {
    if (surahs[i].page <= juzStart) startIdx = i;
    else break;
  }

  let endIdx = startIdx;
  for (let i = startIdx; i < surahs.length; i++) {
    if (surahs[i].page <= juzEnd) endIdx = i;
    else break;
  }

  const count = endIdx - startIdx + 1;
  if (count <= 3) return Array.from({ length: count }, (_, i) => surahs[startIdx + i].name).join(", ");
  return `${surahs[startIdx].name} – ${surahs[endIdx].name}`;
}

export function JuzSheet({ lang, juz, surahs, currentPage, showSections, onToggleSections, onClose, onNavigate, onNavigateSection, dragHandlers }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const preservedOffsetRef = useRef<number | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "start" });
  }, []);

  useLayoutEffect(() => {
    if (preservedOffsetRef.current !== null && scrollRef.current && activeRef.current) {
      const newOffset = activeRef.current.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top;
      scrollRef.current.scrollTop += newOffset - preservedOffsetRef.current;
      preservedOffsetRef.current = null;
    }
  }, [showSections]);

  let activeJuzNum = juz[0].num;
  for (const item of juz) {
    if (item.page <= currentPage) activeJuzNum = item.num;
    else break;
  }

  const handleToggle = () => {
    if (scrollRef.current && activeRef.current) {
      preservedOffsetRef.current = activeRef.current.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top;
    }
    onToggleSections();
  };

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
        <span className={`${needsFontScale(lang) ? "text-[1.25rem]" : "text-[0.8125rem] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "juzIndex.title")}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              showSections ? "border-transparent bg-(--fg) text-(--bg)" : "border-border bg-(--bg2) text-(--fg2)"
            }`}
          >
            {t(lang, "juzIndex.quarters")}
          </button>
          <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {juz.map((item) => (
          <div key={item.num}>
            <button
              ref={item.num === activeJuzNum ? activeRef : undefined}
              type="button"
              onClick={() => onNavigate(item.page)}
              className={`flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-start hover:bg-(--bg2) ${item.isNisf ? "opacity-75" : ""}`}
            >
              <div className="min-w-0 flex-1 flex flex-col">
                <span className="truncate text-base font-medium text-(--fg)">{t(lang, "nav.juz")} {item.num}</span>
                <span className="truncate text-xs text-(--fg2)">{getJuzSurahSubtitle(item, juz, surahs)}</span>
              </div>
              <span className="text-xs text-(--fg2)">p.{item.page + 1}</span>
              <span className="font-amiri font-bold text-[1.375rem]" dir="rtl">{item.arabicStart}</span>
            </button>
            {showSections && item.sections?.map((section) => (
              <button
                key={section.num}
                type="button"
                onClick={() => section.line != null ? onNavigateSection(section.page, section.line) : onNavigate(section.page)}
                className="flex w-full items-center gap-3.5 border-b border-border px-5 py-3.25 text-start hover:bg-(--bg2) opacity-80"
              >
                <span className="w-6 shrink-0 text-center text-sm text-(--fg2)">
                  {section.id === "quarter" ? "¼" : section.id === "half" ? "½" : "¾"}
                </span>
                <span className="shrink-0 text-sm text-(--fg) opacity-60">{section.name}</span>
                <span className="shrink-0 text-xs text-(--fg2)">p.{section.page + 1}</span>
                <span className="min-w-0 flex-1 truncate text-right font-amiri text-[1.125rem] opacity-60" dir="rtl">{section.arabicStart}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
