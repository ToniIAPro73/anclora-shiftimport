// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  window.history.pushState({}, '', '/pricing');
  // This file uses the real jsdom localStorage (no mock), which persists
  // across tests within the same file. Reset the persisted locale so every
  // test starts from the ES default regardless of run order.
  window.localStorage.removeItem('anclora_shiftimport_locale_v1');
});

function renderPricing(isAuthenticated: boolean | null) {
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

  it('keeps the public header CTA for a signed-in visitor and shows "Ir a ShiftImport" as the secondary action', () => {
    renderPricing(true);
    expect(screen.getAllByRole('button', { name: 'Empezar gratis' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Ir a ShiftImport' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
  });

  it('plan CTAs keep their public text with isAuthenticated=true and navigate to /app', () => {
    renderPricing(true);
    expect(screen.getByRole('button', { name: 'Probar Personal' })).toBeTruthy();
    const teamCta = screen.getByRole('button', { name: 'Probar Team' });
    fireEvent.click(teamCta);
    expect(window.location.pathname).toBe('/app');
  });

  it('renders the three plan cards', () => {
    renderPricing(false);
    expect(screen.getByRole('heading', { name: 'Free' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy();
  });
});

describe('UXR-F1-M03 (CX-F09): pricing amounts render through i18n, no mixed-language suffix', () => {
  it('AC-1: EN pricing never shows "Desde" and never doubles the interval suffix', () => {
    const { container } = renderPricing(false);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar idioma/i }));

    const priceTexts = Array.from(container.querySelectorAll('.pricing-card-price')).map((el) => el.textContent ?? '');
    expect(priceTexts.length).toBe(3);
    priceTexts.forEach((text) => {
      expect(text).not.toMatch(/Desde/);
      expect(text).not.toMatch(/\/mes/);
      expect((text.match(/\/mo/g) ?? []).length).toBeLessThanOrEqual(1);
    });

    const teamPriceText = container.querySelector('.pricing-card--recommended .pricing-card-price')?.textContent ?? '';
    expect(teamPriceText).toContain('From');
    expect(teamPriceText).toContain('19');
    expect(teamPriceText).toContain('/mo');
  });

  it('ES pricing keeps the original "Desde <amount> €/mes" composition for Team, unchanged commercial values', () => {
    const { container } = renderPricing(false);
    const teamPriceText = container.querySelector('.pricing-card--recommended .pricing-card-price')?.textContent ?? '';
    expect(teamPriceText).toBe('Desde 19 €/mes');

    const personalPriceText = container.querySelectorAll('.pricing-card-price')[1]?.textContent ?? '';
    expect(personalPriceText).toBe('4,99 €/mes');

    const freePriceText = container.querySelectorAll('.pricing-card-price')[0]?.textContent ?? '';
    expect(freePriceText).toBe('0 €');
  });

  it('AC-2: role comparison uses "Planner"/"Planificador", never "Manager", in either locale', () => {
    renderPricing(false);
    expect(screen.getByText('Roles Admin/Planificador')).toBeTruthy();
    expect(screen.queryByText(/Manager/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Cambiar idioma/i }));
    expect(screen.getByText('Admin/Planner roles')).toBeTruthy();
    expect(screen.queryByText(/Manager/)).toBeNull();
  });
});
