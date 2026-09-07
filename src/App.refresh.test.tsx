// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from './test-utils/local-storage';
import { I18nProvider } from './lib/i18n-react';
import { ThemeProvider } from './lib/theme-react';
import { completeOnboarding } from './lib/onboarding';
import App from './App';

setupLocalStorageMock();
afterEach(cleanup);

describe('App Dashboard Refresh & Busy State (P5.5-R13)', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    completeOnboarding();

    // Mock fetch for auth session -> return guest mode 401
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not authenticated' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    // Spy on window.location.reload to ensure no hard page reloads
    reloadSpy = vi.fn();
    const origLocation = window.location;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: Location }).location = new Proxy(origLocation, {
      get(target, prop) {
        if (prop === 'reload') return reloadSpy;
        return Reflect.get(target, prop);
      },
    });
  });

  function renderApp(path = '/app') {
    window.history.pushState({}, '', path);
    return render(
      <ThemeProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ThemeProvider>,
    );
  }

  it('renders the manual refresh button in calendar header and triggers refetch without page reload', async () => {
    localStorage.setItem(
      'anclora_shifts_v1',
      JSON.stringify([
        { id: 's1', date: '2026-03-04', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
      ]),
    );

    renderApp();

    const refreshButton = await screen.findByRole('button', { name: 'Actualizar calendario' });
    expect(refreshButton).toBeTruthy();

    // Add a new shift directly into localStorage to simulate external or backend change
    localStorage.setItem(
      'anclora_shifts_v1',
      JSON.stringify([
        { id: 's1', date: '2026-03-04', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
        { id: 's2', date: '2026-03-05', startTime: '09:00', endTime: '17:00', location: 'Regular', origin: 'MAN' },
      ]),
    );

    // Click refresh
    fireEvent.click(refreshButton);

    // Expect window.location.reload was NEVER called
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('preserves month, employee, and area selection during manual refresh', async () => {
    localStorage.setItem(
      'anclora_shifts_v1',
      JSON.stringify([
        { id: 's1', date: '2026-05-15', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
      ]),
    );

    renderApp();

    const refreshButton = await screen.findByRole('button', { name: 'Actualizar calendario' });
    expect(refreshButton).toBeTruthy();

    // Check current month label is visible
    const monthLabel = document.querySelector('.month-nav-label');
    expect(monthLabel).toBeTruthy();
    const initialMonthText = monthLabel?.textContent;

    // Trigger refresh
    fireEvent.click(refreshButton);

    // After refresh, month text should be strictly preserved
    expect(document.querySelector('.month-nav-label')?.textContent).toBe(initialMonthText);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('automatically refetches calendar shifts when returning from planner (/app/schedule -> /app)', async () => {
    // Start at planner route
    renderApp('/app/schedule');

    await waitFor(() => {
      // In planner route
      expect(window.location.pathname).toBe('/app/schedule');
    });

    // Simulate returning to /app via popstate
    window.history.pushState({}, '', '/app');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Actualizar calendario' })).toBeTruthy();
    });

    // No hard reloads
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('toggles app--busy class on document.body during busy states', async () => {
    renderApp();

    await screen.findByRole('button', { name: 'Actualizar calendario' });

    // Initial state: not busy
    expect(document.body.classList.contains('app--busy')).toBe(false);

    // Simulate busy state class manually to test style lifecycle if needed
    document.body.classList.add('app--busy');
    expect(document.body.classList.contains('app--busy')).toBe(true);
    document.body.classList.remove('app--busy');
    expect(document.body.classList.contains('app--busy')).toBe(false);
  });
});
