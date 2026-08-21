export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'anclora_theme_mode';
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

const hasLocalStorage = (): boolean => typeof localStorage !== 'undefined';

export const loadThemeMode = (): ThemeMode => {
  if (!hasLocalStorage()) {
    return DEFAULT_THEME_MODE;
  }
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system'
    ? stored
    : DEFAULT_THEME_MODE;
};

export const saveThemeMode = (mode: ThemeMode): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(THEME_STORAGE_KEY, mode);
};

export const resolveThemeMode = (mode: ThemeMode, prefersDark: boolean): ResolvedTheme =>
  mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
