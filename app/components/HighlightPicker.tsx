import { Ban } from "lucide-react";
import { type Lang, t } from "../i18n";
import { HIGHLIGHT_COLORS, type HighlightColorKey } from "../types";

type Props = {
  page: number;
  line: number;
  lang: Lang;
  highlights: Record<number, Record<number, HighlightColorKey>>;
  rakatMarkers: Record<number, Record<number, number>>;
  onClose: () => void;
  onSetHighlight: (page: number, line: number, color: HighlightColorKey | null) => void;
  onSetRakat: (page: number, line: number, rakat: number | null) => void;
};

export function HighlightPicker({
  page,
  line,
  lang,
  highlights,
  rakatMarkers,
  onClose,
  onSetHighlight,
  onSetRakat,
}: Props) {
  const currentHighlight = highlights[page]?.[line];
  const currentRakat = rakatMarkers[page]?.[line];

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/20"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="animate-pop-in absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 rounded-3xl bg-(--bg) px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.32)] min-w-64 max-w-[calc(100vw-2rem)]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-(--fg2)">
          {t(lang, "highlightPicker.lineHighlight")}
        </span>
        <div className="flex items-center gap-3">
          {HIGHLIGHT_COLORS.map(({ key, hex }) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              className="size-8 rounded-full shadow-sm transition-transform active:scale-90"
              style={{ backgroundColor: hex }}
              onClick={() => { onSetHighlight(page, line, key); onClose(); }}
            />
          ))}
          {currentHighlight && (
            <button
              type="button"
              aria-label="Remove highlight"
              className="flex size-8 items-center justify-center rounded-full border-2 border-border bg-(--bg2) transition-transform active:scale-90"
              onClick={() => { onSetHighlight(page, line, null); onClose(); }}
            >
              <Ban className="size-5 text-gray-500" />
            </button>
          )}
        </div>
        <div className="w-full h-px bg-border" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-(--fg2)">
          {t(lang, "highlightPicker.numberAnnotation")}
        </span>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Rakat ${n}`}
              className={`flex size-7 items-center justify-center rounded-full text-[12px] font-semibold transition-transform active:scale-90 ${
                currentRakat === n ? "bg-teal-500 text-white" : "bg-(--bg2) text-(--fg)"
              }`}
              onClick={() => { onSetRakat(page, line, n); onClose(); }}
            >
              {n}
            </button>
          ))}
          {currentRakat !== undefined && (
            <button
              type="button"
              aria-label="Remove rakat marker"
              className="flex size-7 items-center justify-center rounded-full border-2 border-border bg-(--bg2) transition-transform active:scale-90"
              onClick={() => { onSetRakat(page, line, null); onClose(); }}
            >
              <Ban className="size-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
