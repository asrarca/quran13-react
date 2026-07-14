// Cookie-backed reader preferences.
//
// Theme, language, and current page are the only settings that must be known on
// the *server* — they decide the very first server-rendered frame (correct theme
// so no light→dark flash, correct lang/dir, correct starting page image). Unlike
// localStorage, cookies are sent with the request, so a Server Component can read
// them. Everything else (bookmarks, highlights, rakat, mushaf, font size) stays
// in localStorage since it doesn't affect first paint.
//
// This module is isomorphic: the parse* validators run on the server (from the
// cookie string) and the client; read/writeCookie touch `document` and so are
// client-only — never call them from a Server Component.

import type { Theme, FontSize, MushafKey } from "@/app/types";
import { type Lang, SUPPORTED_LANGS } from "@/app/i18n";
import { FIRST_PAGE, LAST_PAGE, DEFAULT_START_PAGE } from "@/app/constants";
import quranData from "@/data/quran-data.json";

const DEFAULT_MUSHAF: MushafKey = "original_tajweed";

// Cookie names deliberately match the legacy localStorage keys.
export const COOKIE = {
  theme: "quran13-theme",
  lang: "quran13-lang",
  page: "quran13-page",
  mushaf: "quran13-mushaf",
  fontSize: "quran13-fontsize",
} as const;

const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function parseTheme(raw: string | undefined): Theme {
  return raw === "dark" || raw === "dark-invert" || raw === "light" ? raw : "light";
}

export function parseLang(raw: string | undefined): Lang {
  return SUPPORTED_LANGS.some((l) => l.code === raw) ? (raw as Lang) : "en";
}

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_START_PAGE;
  return Math.max(FIRST_PAGE, Math.min(LAST_PAGE, Math.round(n)));
}

export function parseMushaf(raw: string | undefined): MushafKey {
  return raw && raw in quranData.mushafs ? (raw as MushafKey) : DEFAULT_MUSHAF;
}

export function parseFontSize(raw: string | undefined): FontSize {
  if (raw === "small" || raw === "medium" || raw === "large") return raw;
  if (raw === "normal") return "small"; // legacy value from the old 2-option setting
  return "small";
}

// Root font-size that a font-size setting maps to (empty = browser default).
// Shared so the server (layout) and client (effect) apply the exact same scale.
export function rootFontScale(fs: FontSize): string {
  return fs === "large" ? "135%" : fs === "medium" ? "115%" : "";
}

// Client-only: persist a preference so the next server-rendered frame is correct.
export function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

// Client-only: read a cookie, or undefined if unset. Used to detect first-time
// (pre-cookie) visitors so their legacy localStorage values can be migrated.
export function readCookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}
