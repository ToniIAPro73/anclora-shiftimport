// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
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
  it('ANONYMOUS_INITIAL_RENDER / AUTH_LOADING: stable public CTA, placeholder visible in secondary slot (NO_EMPTY_SLOT), slot reserves space via sizer', () => {
    const { container } = renderHeader(null);
    expect(screen.getByRole('button', { name: 'Empezar gratis' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ir a ShiftImport' })).toBeNull();
    const slot = container.querySelector('.public-header-secondary-slot');
    expect(slot).toBeTruthy();
    expect(slot).toHaveAttribute('data-auth-state', 'unknown');
    expect(slot?.querySelector('.public-header-secondary-sizer')).toBeTruthy();
    const placeholder = slot?.querySelector('.public-header-secondary-placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder?.querySelector('.public-header-secondary-skeleton')).toBeTruthy();
  });

  it('ANONYMOUS_RESOLVED (null → false): placeholder is replaced by login action, primary CTA stays identical, no layout shift in slot', () => {
    const { container, rerender } = renderHeader(null);
    const beforeSlot = container.querySelector('.public-header-secondary-slot');
    expect(beforeSlot?.querySelector('.public-header-secondary-placeholder')).toBeTruthy();
    const beforePrimary = screen.getByRole('button', { name: 'Empezar gratis' }).textContent;

    rerender(headerTree(false));
    expect(screen.getByRole('button', { name: 'Empezar gratis' }).textContent).toBe(beforePrimary);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ir a ShiftImport' })).toBeNull();
    expect(beforeSlot?.querySelector('.public-header-secondary-placeholder')).toBeNull();
    expect(beforeSlot).toHaveAttribute('data-auth-state', 'anonymous');
  });

  it('AUTHENTICATED_RESOLVED (null → true): placeholder is replaced by goToApp action, login stays absent, primary CTA stays identical', () => {
    const { container, rerender } = renderHeader(null);
    const beforeSlot = container.querySelector('.public-header-secondary-slot');
    expect(beforeSlot?.querySelector('.public-header-secondary-placeholder')).toBeTruthy();
    const beforePrimary = screen.getByRole('button', { name: 'Empezar gratis' }).textContent;

    rerender(headerTree(true));
    expect(screen.getByRole('button', { name: 'Empezar gratis' }).textContent).toBe(beforePrimary);
    expect(screen.getByRole('button', { name: 'Ir a ShiftImport' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
    expect(beforeSlot?.querySelector('.public-header-secondary-placeholder')).toBeNull();
    expect(beforeSlot).toHaveAttribute('data-auth-state', 'authenticated');
  });

  it('AUTH_FAILURE fallback: resolves to guest (false), rendering Iniciar sesión safely', () => {
    const { rerender } = renderHeader(null);
    rerender(headerTree(false));
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ir a ShiftImport' })).toBeNull();
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

  it('provides a keyboard-accessible collapsible navigation contract for narrow viewports', () => {
    const { container } = renderHeader(false);
    const menuButton = screen.getByRole('button', { name: 'Abrir menú' });
    const navigation = container.querySelector('#public-header-navigation');

    expect(navigation).toBeTruthy();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-controls', 'public-header-navigation');

    fireEvent.click(menuButton);
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir menú' }));
  });
});
