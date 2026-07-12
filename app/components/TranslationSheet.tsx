import { useMemo } from "react";
import { Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/button";
import { type Lang, t, isRtlLang, needsFontScale } from "../i18n";
import { type Surah, type DragHandlers } from "../types";
import { ayahsOnPage } from "../lib/ayah-map";
import { loadTranslation } from "../lib/translations";

type Props = {
  lang: Lang;
  page: number;
  surahs: Surah[];
  onClose: () => void;
  dragHandlers: DragHandlers;
};

export function TranslationSheet({ lang, page, surahs, onClose, dragHandlers }: Props) {
  const rtl = isRtlLang(lang);
  const scale = needsFontScale(lang);

  const ayahs = useMemo(() => ayahsOnPage(page), [page]);
  const surahByNum = useMemo(() => new Map(surahs.map((s) => [s.num, s])), [surahs]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["translation", lang],
    queryFn: () => loadTranslation(lang),
  });

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
        <div className="min-w-0">
          <div className={`${scale ? "text-[1.25rem]" : "text-[0.8125rem] tracking-[2px] uppercase"} font-semibold`}>
            {t(lang, "translation.title")}
          </div>
          {data?.source && <div className="mt-0.5 truncate text-sm text-(--fg2)">{data.source}</div>}
        </div>
        <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-(--fg2)">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : isError || !data ? (
          <div className="px-5 py-8 text-center text-sm text-(--fg2)">{t(lang, "translation.unavailable")}</div>
        ) : (
          ayahs.map((key) => {
            const [surahNum, ayahNum] = key.split(":");
            const surah = surahByNum.get(Number(surahNum));
            return (
              <div key={key} className="border-b border-border px-5 py-3.5">
                <div className="mb-1 flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-wide text-(--fg2)">
                  <span>{surah?.name}</span>
                  <span className="tabular-nums opacity-70">
                    {surahNum}:{ayahNum}
                  </span>
                </div>
                <p
                  dir={rtl ? "rtl" : "ltr"}
                  className={`${scale ? "text-[1.1875rem] leading-[2] font-amiri" : "text-[0.9375rem] leading-relaxed"} text-(--fg)`}
                >
                  {data.text[key] ?? ""}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
