import type React from "react";
import quranData from "@/data/quran-data.json";

export type Theme = "light" | "dark" | "dark-invert";
export type ActiveSheet = null | "surah" | "juz" | "page" | "bookmarks" | "settings" | "ask" | "translate";

export type Surah = {
  num: number;
  name: string;
  arabic: string;
  page: number;
  ayah: number;
};

export type Juz = {
  num: number;
  name: string;
  arabicStart: string;
  page: number;
  id?: string;
  line?: number;
  isNisf?: boolean;
  sections?: Juz[];
};

export type MushafKey = keyof typeof quranData.mushafs;

export type LineCoord = { x: number; y: number; w: number };
export type LineBand = { top: number; bottom: number; left: number; right: number };

export const HIGHLIGHT_COLORS = [
  { key: "yellow", hex: "#ffe600" },
  { key: "green",  hex: "#4ade60" },
  { key: "red",    hex: "#f82020" },
  { key: "blue",   hex: "#60a5fa" },
] as const;
export type HighlightColorKey = typeof HIGHLIGHT_COLORS[number]["key"];

export type DragHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
};
