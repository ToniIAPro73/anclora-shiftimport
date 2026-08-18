import { createContext } from 'react';
import { Locale } from './i18n';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tl: (key: string) => string[];
}

export const I18nContext = createContext<I18nContextValue | null>(null);
