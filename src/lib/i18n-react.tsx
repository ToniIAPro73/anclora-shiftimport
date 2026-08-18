import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Locale, loadLocale, saveLocale, translate, translateList } from './i18n';
import { I18nContext } from './i18n-context';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale());

  useEffect(() => {
    saveLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const toggleLocale = useCallback(() => setLocaleState((current) => (current === 'es' ? 'en' : 'es')), []);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
  const tl = useCallback((key: string) => translateList(locale, key), [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, toggleLocale, t, tl }}>
      {children}
    </I18nContext.Provider>
  );
}
