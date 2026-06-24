import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import de from './de.json';
import tr from './tr.json';
import ru from './ru.json';

export type Lang = 'en' | 'fr' | 'es' | 'de' | 'tr' | 'ru';

const dicts = { en, fr, es, de, tr, ru } as const;

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
  tr: 'tr-TR',
  ru: 'ru-RU',
};

export const SUPPORTED_LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ru', label: 'Русский' },
];
