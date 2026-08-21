// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from './test-utils/local-storage';
import { I18nProvider } from './lib/i18n-react';
import { ThemeProvider } from './lib/theme-react';
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
  // Fase 1.2A.1: dashboard now lives at /app, not /.
  window.history.pushState({}, '', '/app');
  return render(
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>,
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

describe('Fase 1.2A.1 public/private routing', () => {
  function renderAt(path: string) {
    window.history.pushState({}, '', path);
    return render(
      <ThemeProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ThemeProvider>,
    );
  }

  it('renders the landing page at /', async () => {
    renderAt('/');
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Empezar gratis' }).length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Importar' })).toBeNull();
  });

  it('renders the pricing placeholder at /pricing', async () => {
    renderAt('/pricing');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Precios' })).toBeTruthy());
  });

  it('renders login form at /login', async () => {
    renderAt('/login');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy());
    expect(screen.queryByText('Confirmar contraseña')).toBeNull();
  });

  it('renders signup form (register mode) at /signup', async () => {
    renderAt('/signup');
    await waitFor(() => expect(screen.getByText('Confirmar contraseña')).toBeTruthy());
  });

  it('still serves the guest dashboard at /app (soft gate, no session required)', async () => {
    renderAt('/app');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toBeTruthy());
  });

  it('falls back unknown paths to the /app dashboard', async () => {
    renderAt('/some/unknown/path');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toBeTruthy());
  });
});
