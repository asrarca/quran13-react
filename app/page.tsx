// Server Component for "/": read the reader's cookie-backed preferences (theme,
// language, current page, mushaf, font size) so the first server-rendered frame
// is already correct, then hand off to the client reader. The interactive app
// lives in <Reader> ("use client"). Deep links live at /page/[n].
import { Reader } from "./Reader";
import { readReaderPrefs } from "./lib/reader-prefs";

export default async function Home() {
  const prefs = await readReaderPrefs();
  return <Reader {...prefs} />;
}
