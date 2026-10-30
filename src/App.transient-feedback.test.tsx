// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from './test-utils/local-storage';
import { I18nProvider } from './lib/i18n-react';
import { ThemeProvider } from './lib/theme-react';
import { completeOnboarding } from './lib/onboarding';
import App from './App';

vi.mock('./components/shift-dashboard/ShiftModal', () => ({
  ShiftModal: ({ isOpen, onSave }: { isOpen: boolean; onSave: (shift: { id: string; date: string; startTime: string; endTime: string; location: string; origin: string }) => void }) => (
    isOpen ? <button data-testid="test-save-shift" onClick={() => onSave({
      id: 'qa-shift', date: '2000-01-01', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN',
    })}>Save test shift</button> : null
  ),
}));

setupLocalStorageMock();
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  completeOnboarding();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  ));
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.history.pushState({}, '', '/app');
});

describe('dashboard transient feedback', () => {
  it('shows saved-shift feedback in a dismissible overlay outside dashboard layout', async () => {
    render(
      <ThemeProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ThemeProvider>,
    );
    fireEvent.click(await screen.findByTestId('sidebar-add-shift'));
    fireEvent.click(await screen.findByTestId('test-save-shift'));

    const toast = await screen.findByTestId('app-toast');
    const stack = screen.getByTestId('app-toast-stack');
    expect(toast.getAttribute('data-tone')).toBe('success');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.textContent).toContain('Turno guardado correctamente.');
    expect(stack.closest('.dashboard-body')).toBeNull();
    expect(document.querySelector('.dashboard-body')?.contains(stack)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByTestId('app-toast')).toBeNull();

    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('sidebar-add-shift'));
    fireEvent.click(screen.getByTestId('test-save-shift'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('app-toast')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByTestId('app-toast')).toBeNull();
  });
});
