import type { Metadata } from "next";
import { Amiri, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import { isRtlLang } from "./i18n";
import { COOKIE, parseTheme, parseLang, parseFontSize, rootFontScale } from "./lib/reader-cookies";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Quran13",
  description: "13-line Quran reader PWA",
  applicationName: "Quran13",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Quran13",
    statusBarStyle: "default",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the theme/lang cookies so the first paint has the right dark class and
  // lang/dir — no flash-of-wrong-theme while the client hydrates.
  const store = await cookies();
  const theme = parseTheme(store.get(COOKIE.theme)?.value);
  const lang = parseLang(store.get(COOKIE.lang)?.value);
  const dark = theme === "dark" || theme === "dark-invert";
  const fontScale = rootFontScale(parseFontSize(store.get(COOKIE.fontSize)?.value));
  return (
    <html
      lang={lang}
      dir={isRtlLang(lang) ? "rtl" : "ltr"}
      className={`${geistSans.variable} ${geistMono.variable} ${amiri.variable} ${dark ? "dark " : ""}h-full antialiased`}
      style={fontScale ? { fontSize: fontScale } : undefined}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
