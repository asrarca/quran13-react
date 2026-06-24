import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import de from './de.json';
import ar from './ar.json';
import hi from './hi.json';
import ur from './ur.json';

export type Lang = 'en' | 'fr' | 'es' | 'de' | 'ar' | 'hi' | 'ur';

const dicts = { en, fr, es, de, ar, hi, ur } as const;

function getByPath(obj: Record<string, unknown>, path: string): string {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return path;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : path;
}

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let str = getByPath(dicts[lang] as Record<string, unknown>, key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export const langDateLocale: Record<Lang, string> = {
  en: 'en-US',
  fr: 'fr-CA',
  es: 'es-ES',
  de: 'de-DE',
  ar: 'ar-SA',
  hi: 'hi-IN',
  ur: 'ur-PK',
};

export const SUPPORTED_LANGS: { code: Lang; label: string; rtl?: boolean; scaleFont?: boolean }[] = [
  { code: 'ar', label: 'العربية', rtl: true, scaleFont: true },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ur', label: 'اردو', rtl: true, scaleFont: true },
];

export function isRtlLang(lang: Lang): boolean {
  return SUPPORTED_LANGS.find((l) => l.code === lang)?.rtl ?? false;
}

export function needsFontScale(lang: Lang): boolean {
  return SUPPORTED_LANGS.find((l) => l.code === lang)?.scaleFont ?? false;
}
