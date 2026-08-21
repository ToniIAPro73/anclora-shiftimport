import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { DEFAULT_THEME_MODE, loadThemeMode, resolveThemeMode, saveThemeMode } from './theme';

setupLocalStorageMock();

describe('theme', () => {
  it('defaults to dark when nothing is persisted', () => {
    expect(DEFAULT_THEME_MODE).toBe('dark');
    expect(loadThemeMode()).toBe('dark');
  });

  it('persists and restores the chosen theme mode', () => {
    saveThemeMode('light');
    expect(loadThemeMode()).toBe('light');
    saveThemeMode('system');
    expect(loadThemeMode()).toBe('system');
  });

  it('ignores an invalid persisted value and falls back to the default', () => {
    localStorage.setItem('anclora_theme_mode', 'blue');
    expect(loadThemeMode()).toBe('dark');
  });

  it('resolves system mode against the OS preference', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
  });

  it('resolves an explicit mode regardless of OS preference', () => {
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
  });
});
