import Image from "next/image";
import { type Lang, t } from "../i18n";
import { type AyahFlash, HIGHLIGHT_COLORS, type HighlightColorKey, type LineBand, type Theme } from "../types";
import { AYAH_FLASH_MS } from "../constants";
import quranData from "@/data/quran-data.json";

type MushafKey = keyof typeof quranData.mushafs;
type Mushaf = (typeof quranData.mushafs)[MushafKey];

function imagePath(page: number, mushaf: Mushaf) {
  const { dir, filePrefix, fileExtension, pageOffset } = mushaf;
  return `${dir}/${filePrefix}${String(page + pageOffset).padStart(3, "0")}.${fileExtension}`;
}

// Rectangles covering a whole ayah on ONE page, given the verse span. Each line
// the ayah touches on this page becomes a band-height rectangle whose horizontal
// extent is clipped by the ayah's start x (on its first line) and end x (on its
// last line). x's are % from the RIGHT margin, so a normalized page X is
// `right - (x / 100) * (right - left)`. Lines/pages between start and end are full width.
function ayahFlashSegments(candidate: number, ayah: AyahFlash, bands: LineBand[]) {
  if (candidate < ayah.startPage || candidate > ayah.endPage) return [];
  const firstLine = candidate === ayah.startPage ? ayah.startLine : 1;
  const lastLine = candidate === ayah.endPage ? ayah.endLine : bands.length;
  const segs: { line: number; top: number; height: number; left: number; width: number }[] = [];
  for (let ln = firstLine; ln <= lastLine; ln++) {
    const band = bands[ln - 1];
    if (!band) continue;
    const xStart = candidate === ayah.startPage && ln === ayah.startLine ? ayah.startX : 0;
    const xEnd = candidate === ayah.endPage && ln === ayah.endLine ? ayah.endX : 100;
    if (xEnd <= xStart) continue; // e.g. endX 0 → ayah ended on the previous line
    const w = band.right - band.left;
    const left = band.right - (xEnd / 100) * w;
    const right = band.right - (xStart / 100) * w;
    segs.push({ line: ln, top: band.top, height: band.bottom - band.top, left, width: right - left });
  }
  return segs;
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
  flashAyah?: AyahFlash;
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
  flashAyah,
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
  const flashSegments = flashAyah ? ayahFlashSegments(candidate, flashAyah, bands) : [];

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
            {flashSegments.map((seg) => (
              <div
                key={`${flashKey}-${seg.line}`}
                className="pointer-events-none absolute animate-ayah-flash"
                style={{
                  backgroundColor: "#dade60",
                  animationDuration: `${AYAH_FLASH_MS}ms`,
                  top: `${seg.top * 100}%`,
                  height: `${seg.height * 100}%`,
                  left: `${seg.left * 100}%`,
                  width: `${seg.width * 100}%`,
                }}
              />
            ))}
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
