import Image from "next/image";
import { type Lang, t } from "../i18n";
import { HIGHLIGHT_COLORS, type HighlightColorKey, type LineBand, type Theme } from "../types";
import quranData from "@/data/quran-data.json";

type MushafKey = keyof typeof quranData.mushafs;
type Mushaf = (typeof quranData.mushafs)[MushafKey];

function imagePath(page: number, mushaf: Mushaf) {
  const { dir, filePrefix, fileExtension, pageOffset } = mushaf;
  return `${dir}/${filePrefix}${String(page + pageOffset).padStart(3, "0")}.${fileExtension}`;
}

type Props = {
  candidate: number;
  activeMushaf: Mushaf;
  theme: Theme;
  highlights: Record<number, Record<number, HighlightColorKey>>;
  rakatMarkers: Record<number, Record<number, number>>;
  missingImages: Record<number, true>;
  bands: LineBand[];
  lang: Lang;
  flashLine?: number;
  flashKey?: number;
  onPressStart: (e: React.PointerEvent<HTMLDivElement>, candidate: number) => void;
  onPressMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPressEnd: () => void;
  onMissingImage: (page: number) => void;
};

export function PageCard({
  candidate,
  activeMushaf,
  theme,
  highlights,
  rakatMarkers,
  missingImages,
  bands,
  lang,
  flashLine,
  flashKey,
  onPressStart,
  onPressMove,
  onPressEnd,
  onMissingImage,
}: Props) {
  const missing = missingImages[candidate];
  const pageHighlights = Object.entries(highlights[candidate] ?? {})
    .map(([lineStr, color]) => ({ line: Number(lineStr), color }))
    .filter(({ line }) => bands[line]);

  return (
    <div
      className="relative w-full select-none overflow-hidden border border-border bg-(--paper) shadow-[0_6px_30px_rgba(0,0,0,0.14),0_0_0_1px_var(--border)]"
      style={{ aspectRatio: activeMushaf.aspectRatio, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {missing ? (
        <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-(--fg2)">
          {t(lang, "misc.imageUnavailable", { page: candidate })}
        </div>
      ) : (
        <>
          <Image
            src={imagePath(candidate, activeMushaf)}
            alt={`Quran page ${candidate}`}
            fill
            className="object-cover object-top"
            style={theme === "dark-invert" ? { filter: "invert(1)" } : undefined}
            draggable={false}
            priority
            onError={() => onMissingImage(candidate)}
          />
          <div
            className="absolute inset-0"
            style={{ touchAction: "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => onPressStart(e, candidate)}
            onPointerMove={onPressMove}
            onPointerUp={onPressEnd}
            onPointerCancel={onPressEnd}
            onPointerLeave={onPressEnd}
          >
            {pageHighlights.map(({ line, color }) => (
              <div
                key={line}
                className="pointer-events-none absolute opacity-35 mix-blend-multiply"
                style={{
                  backgroundColor: HIGHLIGHT_COLORS.find((c) => c.key === color)?.hex ?? "#ffe600",
                  top: `${bands[line].top * 100}%`,
                  height: `${(bands[line].bottom - bands[line].top) * 100}%`,
                  left: `${bands[line].left * 100}%`,
                  width: `${(bands[line].right - bands[line].left) * 100}%`,
                }}
              />
            ))}
            {flashLine !== undefined && bands[flashLine - 1] && (
              <div
                key={flashKey}
                className="pointer-events-none absolute animate-line-flash"
                style={{
                  backgroundColor: "#dade60",
                  top: `${bands[flashLine - 1].top * 100}%`,
                  height: `${(bands[flashLine - 1].bottom - bands[flashLine - 1].top) * 100}%`,
                  left: `${bands[flashLine - 1].left * 100}%`,
                  width: `${(bands[flashLine - 1].right - bands[flashLine - 1].left) * 100}%`,
                }}
              />
            )}
            {Object.entries(rakatMarkers[candidate] ?? {}).map(([lineStr, rakat]) => {
              const line = Number(lineStr);
              const band = bands[line];
              if (!band) return null;
              const midY = (band.top + band.bottom) / 2;
              return (
                <div
                  key={`rakat-${line}`}
                  className="pointer-events-none absolute flex aspect-square w-[6%] items-center justify-center rounded-full bg-gray-500 font-bold text-white"
                  style={{
                    top: `${midY * 100}%`,
                    [(candidate + 1) % 2 === 0 ? "left" : "right"]: "1%",
                    transform: "translateY(-50%)",
                    fontSize: "3vw",
                  }}
                >
                  {rakat}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
