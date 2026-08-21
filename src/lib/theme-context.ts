import { createContext } from 'react';
import { ResolvedTheme, ThemeMode } from './theme';

export interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
