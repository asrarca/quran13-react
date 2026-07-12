import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { type Lang, t, SUPPORTED_LANGS, isRtlLang, needsFontScale } from "../i18n";
import { type MushafKey, type Theme, type DragHandlers } from "../types";
import quranData from "@/data/quran-data.json";

type SettingsSubView = "display" | "mushaf" | "about" | "language" | "install" | null;

type Props = {
  lang: Lang;
  settingsSubView: SettingsSubView;
  setSettingsSubView: (v: SettingsSubView) => void;
  activeMushafKey: MushafKey;
  theme: Theme;
  isStandalone: boolean;
  appVersion: string;
  onClose: () => void;
  onMushafChange: (key: MushafKey) => void;
  onThemeChange: (theme: Theme) => void;
  onShowTajweedRules: () => void;
  onLangChange: (lang: Lang) => void;
  dragHandlers: DragHandlers;
};

// The panels are laid out left-to-right; each occupies 1/PANEL_COUNT of the
// container. translateX shifts the strip so the chosen panel fills the viewport.
const PANEL_COUNT = 6;
const PANEL_INDEX: Record<NonNullable<SettingsSubView>, number> = {
  display: 1,
  mushaf: 2,
  about: 3,
  language: 4,
  install: 5,
};

const THEMES: Theme[] = ["light", "dark", "dark-invert"];
const THEME_LABEL_KEY: Record<Theme, string> = {
  light: "display.light",
  dark: "display.dark",
  "dark-invert": "display.darkInvert",
};

export function SettingsSheet({
  lang,
  settingsSubView,
  setSettingsSubView,
  activeMushafKey,
  theme,
  isStandalone,
  appVersion,
  onClose,
  onMushafChange,
  onThemeChange,
  onShowTajweedRules,
  onLangChange,
  dragHandlers,
}: Props) {
  const activeMushaf = quranData.mushafs[activeMushafKey];
  const isRtl = isRtlLang(lang);
  const scaleFont = needsFontScale(lang);
  const ForwardChevron = isRtl ? ChevronLeft : ChevronRight;
  const BackChevron = isRtl ? ChevronRight : ChevronLeft;

  // Only the active panel is opaque; the others stay transparent so the sliding
  // strip never flashes the panels it passes over (main is active when null).
  const panelCls = (active: boolean) =>
    `flex h-full w-1/6 flex-col transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0 pointer-events-none"}`;

  return (
    <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-50 flex h-[90%] flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[0_-8px_40px_rgba(0,0,0,0.22)]">
      <div
        className="flex shrink-0 cursor-grab items-center justify-center pb-1 pt-3"
        style={{ touchAction: "none" }}
        onPointerDown={dragHandlers.onPointerDown}
        onPointerMove={dragHandlers.onPointerMove}
        onPointerUp={dragHandlers.onPointerUp}
        onPointerCancel={dragHandlers.onPointerCancel}
      >
        <div className="pointer-events-none h-1.25 w-9.5 rounded-full bg-border" />
      </div>
      <div className="flex-1 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{
            width: `${PANEL_COUNT * 100}%`,
            transform: settingsSubView ? `translateX(${isRtl ? '' : '-'}${(PANEL_INDEX[settingsSubView] * 100) / PANEL_COUNT}%)` : "translateX(0)",
          }}
        >
          {/* Panel 1: main settings */}
          <div className={panelCls(settingsSubView === null)}>
            <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
              <span className={`${scaleFont ? "text-[20px]" : "text-[13px] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "settings.title")}</span>
              <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!isStandalone && (
                <button
                  type="button"
                  className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                  onClick={() => setSettingsSubView("install")}
                >
                  <span className="text-base font-bold text-(--fg)">{t(lang, "settings.installApp")}</span>
                  <ForwardChevron className="size-4 text-(--fg2)" />
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                onClick={() => setSettingsSubView("mushaf")}
              >
                <span className="text-base text-(--fg)">{t(lang, "settings.mushafStyle")}</span>
                <div className="flex items-center gap-1.5 text-(--fg2)">
                  <span className="text-sm">{activeMushaf.name}</span>
                  <ForwardChevron className="size-4" />
                </div>
              </button>
              {activeMushafKey === "original_tajweed" && (
                <button
                  type="button"
                  className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                  onClick={onShowTajweedRules}
                >
                  <span className="text-base text-(--fg)">{t(lang, "settings.tajweedRules")}</span>
                  <ForwardChevron className="size-4 text-(--fg2)" />
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                onClick={() => setSettingsSubView("display")}
              >
                <span className="text-base text-(--fg)">{t(lang, "settings.theme")}</span>
                <div className="flex items-center gap-1.5 text-(--fg2)">
                  <span className="text-sm">{t(lang, THEME_LABEL_KEY[theme])}</span>
                  <ForwardChevron className="size-4" />
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                onClick={() => setSettingsSubView("language")}
              >
                <span className="text-base text-(--fg)">{t(lang, "settings.language")}</span>
                <div className="flex items-center gap-1.5 text-(--fg2)">
                  <span className="text-sm">{t(lang, "misc.langName")}</span>
                  <ForwardChevron className="size-4" />
                </div>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                onClick={() => setSettingsSubView("about")}
              >
                <span className="text-base text-(--fg)">{t(lang, "settings.about")}</span>
                <div className="flex items-center gap-1.5 text-(--fg2)">
                  <span className="text-sm">v{appVersion}</span>
                  <ForwardChevron className="size-4" />
                </div>
              </button>
            </div>
            <div className="shrink-0 border-t border-border px-5 py-4 text-center text-sm text-(--fg3)">
              {t(lang, "settings.footer")}
            </div>
          </div>

          {/* Panel: display / theme picker */}
          <div className={panelCls(settingsSubView === "display")}>
            <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
              <div className="flex items-center gap-2">
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setSettingsSubView(null)}>
                  <BackChevron className="size-4" />
                </Button>
                <span className={`${scaleFont ? "text-[20px]" : "text-[13px] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "settings.theme")}</span>
              </div>
              <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {THEMES.map((key) => {
                const selected = theme === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className="flex w-full items-center gap-3.5 border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                    onClick={() => onThemeChange(key)}
                  >
                    <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-(--fg) bg-(--fg)" : "border-(--fg3)"}`}>
                      {selected && <div className="size-2 rounded-full bg-(--bg)" />}
                    </div>
                    <span className={`text-base ${selected ? "font-semibold text-(--fg)" : "text-(--fg)"}`}>
                      {t(lang, THEME_LABEL_KEY[key])}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel 2: mushaf picker */}
          <div className={panelCls(settingsSubView === "mushaf")}>
            <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
              <div className="flex items-center gap-2">
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setSettingsSubView(null)}>
                  <BackChevron className="size-4" />
                </Button>
                <span className={`${scaleFont ? "text-[20px]" : "text-[13px] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "settings.mushafStyle")}</span>
              </div>
              <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {(Object.keys(quranData.mushafs) as MushafKey[]).map((key) => {
                const mushaf = quranData.mushafs[key];
                const selected = activeMushafKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className="flex w-full items-center gap-3.5 border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                    onClick={() => { onMushafChange(key); setSettingsSubView(null); }}
                  >
                    <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-(--fg) bg-(--fg)" : "border-(--fg3)"}`}>
                      {selected && <div className="size-2 rounded-full bg-(--bg)" />}
                    </div>
                    <span className={`text-base ${selected ? "font-semibold text-(--fg)" : "text-(--fg)"}`}>
                      {mushaf.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel 3: about */}
          <div className={panelCls(settingsSubView === "about")}>
            <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
              <div className="flex items-center gap-2">
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setSettingsSubView(null)}>
                  <BackChevron className="size-4" />
                </Button>
                <span className={`${scaleFont ? "text-[20px]" : "text-[13px] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "settings.about")}</span>
              </div>
              <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-6 text-[15px] text-(--fg2)">{t(lang, "about.versionLine", { version: appVersion })}</p>

              <div className="mb-6">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-(--fg3)">{t(lang, "about.readingSection")}</p>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.navigatePages")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.navigatePagesDesc")}</p>
                  </div>
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.landscapeMode")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.landscapeModeDesc")}</p>
                  </div>
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.toggleMenu")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.toggleMenuDesc")}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-(--fg3)">{t(lang, "about.aiSection")}</p>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.askFeature")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.askFeatureDesc")}</p>
                  </div>
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.translateFeature")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.translateFeatureDesc")}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-(--fg3)">{t(lang, "about.highlightSection")}</p>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.highlightLine")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.highlightLineDesc")}</p>
                  </div>
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.addAnnotation")}</p>
                    <p className="mt-0.5 mb-2 text-[15px] text-(--fg2)">{t(lang, "about.addAnnotationDesc")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.addAnnotationTip")}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-(--fg3)">{t(lang, "about.bookmarksSection")}</p>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.savePage")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.savePageDesc")}</p>
                  </div>
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.viewSavedPages")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.viewSavedPagesDesc")}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-(--fg3)">{t(lang, "about.displaySection")}</p>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[17px] font-medium text-(--fg)">{t(lang, "about.theme")}</p>
                    <p className="mt-0.5 text-[15px] text-(--fg2)">{t(lang, "about.themeDesc")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 4: language picker */}
          <div className={panelCls(settingsSubView === "language")}>
            <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
              <div className="flex items-center gap-2">
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setSettingsSubView(null)}>
                  <BackChevron className="size-4" />
                </Button>
                <span className={`${scaleFont ? "text-[20px]" : "text-[13px] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "settings.language")}</span>
              </div>
              <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {SUPPORTED_LANGS.map(({ code, label }) => {
                const selected = lang === code;
                return (
                  <button
                    key={code}
                    type="button"
                    className="flex w-full items-center gap-3.5 border-b border-border px-5 py-4 text-start active:bg-(--bg2)"
                    onClick={() => { onLangChange(code); setSettingsSubView(null); }}
                  >
                    <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-(--fg) bg-(--fg)" : "border-(--fg3)"}`}>
                      {selected && <div className="size-2 rounded-full bg-(--bg)" />}
                    </div>
                    <span className={`text-base ${selected ? "font-semibold text-(--fg)" : "text-(--fg)"}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel 5: install app */}
          <div className={panelCls(settingsSubView === "install")}>
            <div className="flex items-center justify-between border-b border-border px-5 pb-3 pt-2">
              <div className="flex items-center gap-2">
                <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={() => setSettingsSubView(null)}>
                  <BackChevron className="size-4" />
                </Button>
                <span className={`${scaleFont ? "text-[20px]" : "text-[13px] tracking-[2px] uppercase"} font-semibold`}>{t(lang, "settings.installApp")}</span>
              </div>
              <Button size="icon-sm" variant="ghost" className="rounded-full bg-(--bg2)" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-8">
                {([1, 2, 3, 4] as const).map((step) => (
                  <div key={step}>
                    <div className="mb-3 flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--fg) text-(--bg) text-sm font-bold">
                        {step}
                      </div>
                      <p className="text-[15px] leading-snug text-(--fg)">{t(lang, `installApp.step${step}`)}</p>
                    </div>
                    <Image
                      src={`/screenshots/install-app-0${step}.jpeg`}
                      alt={`Step ${step}`}
                      width={0}
                      height={0}
                      sizes="100vw"
                      className="h-auto w-full rounded-2xl shadow-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
