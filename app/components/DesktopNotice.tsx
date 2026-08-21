import { Smartphone } from "lucide-react";
import { type Lang, t, needsFontScale } from "../i18n";
import { Button } from "./ui/button";

type Props = {
  lang: Lang;
  onDismiss: () => void;
};

// Shown once per browser when the app is opened on a desktop-class device.
// Dismissal is persisted by the caller (localStorage), so it never returns.
export function DesktopNotice({ lang, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-300 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-(--sheetbd)"
        aria-label={t(lang, "desktopNotice.dismiss")}
        onClick={onDismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(lang, "desktopNotice.title")}
        className="animate-pop-in relative flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-(--bg) px-6 py-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.32)]"
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-(--bg2) text-(--fg2)">
          <Smartphone className="size-7" />
        </div>
        <h2 className={`${needsFontScale(lang) ? "text-xl" : "text-lg"} font-semibold`}>
          {t(lang, "desktopNotice.title")}
        </h2>
        <p className={`${needsFontScale(lang) ? "text-base" : "text-sm"} text-(--fg2)`}>
          {t(lang, "desktopNotice.body")}
        </p>
        <Button type="button" className="mt-1 w-full rounded-full" onClick={onDismiss}>
          {t(lang, "desktopNotice.dismiss")}
        </Button>
      </div>
    </div>
  );
}
