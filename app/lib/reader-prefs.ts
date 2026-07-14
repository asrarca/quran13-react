// Server-only: read the reader's cookie-backed preferences into the prop bundle
// <Reader> expects. Shared by the "/" route (start page from the cookie) and the
// "/page/[n]" deep-link route (start page forced by the URL).
import { cookies } from "next/headers";
import type { Theme, FontSize, MushafKey } from "@/app/types";
import type { Lang } from "@/app/i18n";
import { COOKIE, parseTheme, parseLang, parsePage, parseMushaf, parseFontSize } from "./reader-cookies";

export type ReaderPrefs = {
  initialTheme: Theme;
  initialLang: Lang;
  initialPage: number;
  initialMushafKey: MushafKey;
  initialFontSize: FontSize;
};

// pageOverride (from a /page/[n] URL) wins over the saved page cookie.
export async function readReaderPrefs(pageOverride?: number): Promise<ReaderPrefs> {
  const store = await cookies();
  return {
    initialTheme: parseTheme(store.get(COOKIE.theme)?.value),
    initialLang: parseLang(store.get(COOKIE.lang)?.value),
    initialPage: pageOverride ?? parsePage(store.get(COOKIE.page)?.value),
    initialMushafKey: parseMushaf(store.get(COOKIE.mushaf)?.value),
    initialFontSize: parseFontSize(store.get(COOKIE.fontSize)?.value),
  };
}
