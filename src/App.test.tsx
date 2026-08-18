// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from './test-utils/local-storage';
import { I18nProvider } from './lib/i18n-react';
import { completeOnboarding, loadOnboarding } from './lib/onboarding';
import App from './App';

setupLocalStorageMock();
afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}

describe('App theme + locale defaults', () => {
  it('defaults the theme to dark on first visit', async () => {
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(localStorage.getItem('anclora_theme_mode')).toBe('dark');
  });

  it('persists an explicit theme choice across remounts', async () => {
    localStorage.setItem('anclora_theme_mode', 'light');
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('keeps theme and locale on independent storage keys (toggling one leaves the other untouched)', async () => {
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(localStorage.getItem('anclora_shiftimport_locale_v1')).toBe('es');

    localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
    cleanup();
    renderApp();
    // Locale changed to English, but the persisted theme choice (dark) is untouched.
    await waitFor(() => expect(screen.getByRole('button', { name: /Import/ })).toBeTruthy());
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('anclora_theme_mode')).toBe('dark');
  });
});

describe('App onboarding', () => {
  it('opens the onboarding wizard for a first user (no shifts, no record)', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('Bienvenido a Anclora ShiftImport')).toBeTruthy());
    expect(loadOnboarding().completed).toBe(false);
  });

  it('does not open onboarding for a returning user who already has shifts (record completed silently)', async () => {
    localStorage.setItem('anclora_shifts_v1', JSON.stringify([
      { id: 's1', date: '2026-03-04', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ]));
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(screen.queryByText('Bienvenido a Anclora ShiftImport')).toBeNull();
    expect(loadOnboarding().completed).toBe(true);
  });

  it('does not open onboarding once the guide was completed', async () => {
    completeOnboarding();
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(screen.queryByText('Bienvenido a Anclora ShiftImport')).toBeNull();
  });
});
