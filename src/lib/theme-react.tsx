import { ReactNode, useCallback, useEffect, useState } from 'react';
import { loadThemeMode, resolveThemeMode, saveThemeMode, ThemeMode } from './theme';
import { ThemeContext } from './theme-context';

const hasMatchMedia = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => loadThemeMode());
  const [prefersDark, setPrefersDark] = useState(() =>
    hasMatchMedia() ? window.matchMedia('(prefers-color-scheme: dark)').matches : true,
  );

  useEffect(() => {
    if (!hasMatchMedia()) {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme = resolveThemeMode(themeMode, prefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    saveThemeMode(themeMode);
  }, [themeMode]);

  const setThemeMode = useCallback((next: ThemeMode) => setThemeModeState(next), []);
  const toggleThemeMode = useCallback(() => {
    setThemeModeState((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'));
  }, []);

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, setThemeMode, toggleThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
