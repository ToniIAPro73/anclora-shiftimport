// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../lib/i18n-react';
import { ThemeProvider } from '../lib/theme-react';
import { PublicHeader } from './PublicHeader';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.history.pushState({}, '', '/');
});

function headerTree(isAuthenticated: boolean | null) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <PublicHeader isAuthenticated={isAuthenticated} />
      </I18nProvider>
    </ThemeProvider>
  );
}

function renderHeader(isAuthenticated: boolean | null) {
  return render(headerTree(isAuthenticated));
}

describe('PublicHeader auth-state flash (ternary isAuthenticated)', () => {
  it('unknown (null): stable public CTA, no login/goToApp visible, slot reserves space via sizer', () => {
    const { container } = renderHeader(null);
    expect(screen.getByRole('button', { name: 'Empezar gratis' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ir a ShiftImport' })).toBeNull();
    const slot = container.querySelector('.public-header-secondary-slot');
    expect(slot).toBeTruthy();
    expect(slot?.querySelector('.public-header-secondary-sizer')).toBeTruthy();
  });

  it('null → false: primary CTA text is identical before/after, login appears', () => {
    const { rerender } = renderHeader(null);
    const before = screen.getByRole('button', { name: 'Empezar gratis' }).textContent;
    rerender(headerTree(false));
    expect(screen.getByRole('button', { name: 'Empezar gratis' }).textContent).toBe(before);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ir a ShiftImport' })).toBeNull();
  });

  it('null → true: primary CTA text is identical before/after, goToApp appears and login stays absent', () => {
    const { rerender } = renderHeader(null);
    const before = screen.getByRole('button', { name: 'Empezar gratis' }).textContent;
    rerender(headerTree(true));
    expect(screen.getByRole('button', { name: 'Empezar gratis' }).textContent).toBe(before);
    expect(screen.getByRole('button', { name: 'Ir a ShiftImport' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
  });

  it('true from the first render: goToApp as secondary action, stable public CTA', () => {
    renderHeader(true);
    expect(screen.getByRole('button', { name: 'Empezar gratis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ir a ShiftImport' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
  });

  it('false from the first render: login as secondary action, stable public CTA', () => {
    renderHeader(false);
    expect(screen.getByRole('button', { name: 'Empezar gratis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ir a ShiftImport' })).toBeNull();
  });

  it('primary CTA always navigates to /signup regardless of auth state', () => {
    for (const state of [null, false, true] as const) {
      window.history.pushState({}, '', '/');
      renderHeader(state);
      fireEvent.click(screen.getByRole('button', { name: 'Empezar gratis' }));
      expect(window.location.pathname).toBe('/signup');
      cleanup();
    }
  });

  it('login navigates to /login and goToApp to /app', () => {
    const { rerender } = renderHeader(false);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(window.location.pathname).toBe('/login');

    window.history.pushState({}, '', '/');
    rerender(headerTree(true));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a ShiftImport' }));
    expect(window.location.pathname).toBe('/app');
  });
});
