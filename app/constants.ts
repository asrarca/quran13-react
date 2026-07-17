export const FIRST_PAGE = 1;
export const TOTAL_PAGES = Number(process.env.NEXT_PUBLIC_TOTAL_PAGES ?? 847);
export const LAST_PAGE = FIRST_PAGE + TOTAL_PAGES - 1;
export const DEFAULT_START_PAGE = 1;
export const APP_VERSION = "2.2.2";

// How long a whole-ayah navigation highlight (from AI search) stays before it
// fades out. Kept high for now to make testing easy — lower when ready.
export const AYAH_FLASH_MS = 10000;
