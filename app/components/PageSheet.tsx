import { Delete, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t } from "../i18n";

type Props = {
  lang: Lang;
  pageInput: string;
  pageDisplay: string;
  firstPage: number;
  lastPage: number;
  onClose: () => void;
  onNavigate: (page: number) => void;
  onPressDigit: (digit: string) => void;
  onDeleteDigit: () => void;
};

export function PageSheet({
  lang,
  pageInput,
  pageDisplay,
  firstPage,
  lastPage,
  onClose,
  onNavigate,
  onPressDigit,
  onDeleteDigit,
}: Props) {
  return (
    <div className="animate-pop-in absolute left-1/2 top-1/2 z-50 flex w-75 -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-(--bg) p-5.5 shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">{t(lang, "goToPage.title")}</span>
        <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <span className="mt-1 text-[0.8125rem] text-(--fg2)">
        {t(lang, "goToPage.hint", { min: firstPage + 1, max: lastPage + 1 })}
      </span>
      <div className="my-4 flex h-16 items-center justify-center rounded-[14px] bg-(--bg2) text-[2.125rem] font-semibold tracking-[3px] tabular-nums">
        {pageDisplay}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            className="h-13 rounded-[14px] bg-(--bg2) text-[1.375rem] font-medium text-(--fg) active:bg-border"
            onClick={() => onPressDigit(digit)}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="flex h-13 items-center justify-center rounded-[14px] bg-(--bg2) text-(--fg) active:bg-border"
          onClick={onDeleteDigit}
        >
          <Delete className="size-5.5" />
        </button>
        <button
          type="button"
          className="h-13 rounded-[14px] bg-(--bg2) text-[1.375rem] font-medium text-(--fg) active:bg-border"
          onClick={() => onPressDigit("0")}
        >
          0
        </button>
        <button
          type="button"
          className="h-13 rounded-[14px] bg-(--fg) text-base font-semibold text-(--bg)"
          onClick={() => {
            if (pageInput !== "") {
              const next = Number(pageInput);
              onNavigate(Math.max(firstPage + 1, Math.min(lastPage + 1, next)) - 1);
            }
          }}
        >
          {t(lang, "goToPage.go")}
        </button>
      </div>
    </div>
  );
}
