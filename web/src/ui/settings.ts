// WEB-013: only UI preferences are stored (language, theme, typed-cell reading). Never inputs or results.
import { type Lang, LANGS, detectLang } from '../i18n';

export type Theme = 'auto' | 'day' | 'night';
export interface Settings {
  lang: Lang;
  theme: Theme;
  interp: 'corner' | 'centre';
}

const KEY = 'calc.prefs.v1';

export function loadSettings(): Settings {
  const def: Settings = { lang: detectLang(navigator.languages ?? [navigator.language]), theme: 'auto', interp: 'corner' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const o = JSON.parse(raw) as Partial<Settings>;
    return {
      lang: LANGS.includes(o.lang as Lang) ? (o.lang as Lang) : def.lang,
      theme: o.theme === 'day' || o.theme === 'night' ? o.theme : 'auto',
      interp: o.interp === 'centre' ? 'centre' : 'corner',
    };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the page works without it */
  }
}
