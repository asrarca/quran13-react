// Server-rendered deep link: /page/[n] opens the reader at page n (the number
// shown in the app header). n forces the start page; theme/lang/mushaf/font size
// still come from the visitor's cookies. generateMetadata gives shared links a
// meaningful title/preview (surah + page).
import type { Metadata } from "next";
import { Reader } from "../../Reader";
import { readReaderPrefs } from "../../lib/reader-prefs";
import { paramToPage, pageToParam } from "../../lib/reader-cookies";
import quranData from "@/data/quran-data.json";

// Last surah that begins on or before this internal page — the surah a reader is
// looking at when they land here. Surahs are ordered by ascending page.
function surahNameForPage(internalPage: number): string {
  let name = quranData.surahs[0].name;
  for (const s of quranData.surahs) {
    if (s.page <= internalPage) name = s.name;
    else break;
  }
  return name;
}

type Params = { params: Promise<{ n: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { n } = await params;
  const internalPage = paramToPage(n);
  const shown = pageToParam(internalPage);
  const surah = surahNameForPage(internalPage);
  const title = `${surah} · Page ${shown} · Quran13`;
  const description = `Read ${surah} (page ${shown}) in the Quran13 reader.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
  };
}

export default async function DeepLinkPage({ params }: Params) {
  const { n } = await params;
  const prefs = await readReaderPrefs(paramToPage(n));
  return <Reader {...prefs} />;
}
