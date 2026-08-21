export const FIRST_PAGE = 1;
export const TOTAL_PAGES = Number(process.env.NEXT_PUBLIC_TOTAL_PAGES ?? 847);
export const LAST_PAGE = FIRST_PAGE + TOTAL_PAGES - 1;
export const DEFAULT_START_PAGE = 1;
export const APP_VERSION = "2.2.3";

// How long a whole-ayah navigation highlight (from AI search) stays before it
// fades out. Kept high for now to make testing easy — lower when ready.
export const AYAH_FLASH_MS = 6000;

// How long the screen is held awake after the last interaction, so reading a
// page isn't cut short by iOS's ~30s dim-then-lock. See lib/use-wake-lock.ts.
export const WAKE_LOCK_MS = 2 * 60 * 1000;

// How often the "best on your phone" notice appears on desktop browsers:
//   "once"   — shown a single time, then never again (dismissal persisted).
//   "always" — shown on every page load, dismissable per load.
export const DESKTOP_NOTICE_FREQUENCY: "once" | "always" = "always";
