// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '../lib/i18n-react';
import { ThemeProvider } from '../lib/theme-react';
import { PricingPage } from './PricingPage';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

function renderPricing(isAuthenticated: boolean) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <PricingPage isAuthenticated={isAuthenticated} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('PricingPage shares the public header controls', () => {
  it('renders the same theme and language toggles as the landing header', () => {
    renderPricing(false);
    expect(screen.getByRole('button', { name: /Cambiar tema/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cambiar idioma/i })).toBeTruthy();
  });

  it('shows Empezar gratis + Iniciar sesión in the header for an anonymous visitor', () => {
    renderPricing(false);
    expect(screen.getAllByRole('button', { name: 'Empezar gratis' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
  });

  it('replaces the header CTA with "Ir a ShiftImport" for a signed-in visitor', () => {
    renderPricing(true);
    expect(screen.getAllByRole('button', { name: 'Ir a ShiftImport' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
  });

  it('renders the three plan cards', () => {
    renderPricing(false);
    expect(screen.getByRole('heading', { name: 'Free' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy();
  });
});
