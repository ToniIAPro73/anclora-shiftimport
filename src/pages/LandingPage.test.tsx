// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '../lib/i18n-react';
import { ThemeProvider } from '../lib/theme-react';
import { LandingPage } from './LandingPage';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

function renderLanding(isAuthenticated: boolean) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <LandingPage isAuthenticated={isAuthenticated} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('LandingPage CTA (Fase 1.2A.3 + 1.2B)', () => {
  it('shows Empezar gratis (header + hero + final CTA) and Iniciar sesión for an anonymous visitor', () => {
    renderLanding(false);
    expect(screen.getAllByRole('button', { name: 'Empezar gratis' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ir a ShiftImport' })).toBeNull();
  });

  it('replaces every CTA with "Ir a ShiftImport" for a signed-in visitor, no Empezar gratis / Iniciar sesión left', () => {
    renderLanding(true);
    expect(screen.getAllByRole('button', { name: 'Ir a ShiftImport' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Empezar gratis' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
  });

  it('always offers Precios regardless of auth state', () => {
    renderLanding(true);
    expect(screen.getByRole('button', { name: 'Precios' })).toBeTruthy();
  });

  it('renders the 3-step how-it-works and the Personal/Team segments', () => {
    renderLanding(false);
    expect(screen.getByText('Sube tu cuadrante')).toBeTruthy();
    expect(screen.getByText('ShiftImport detecta empleados y turnos')).toBeTruthy();
    expect(screen.getByText('Consulta y gestiona el calendario')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy();
  });

  it('final CTA reads "Importar mi primer cuadrante" for an anonymous visitor', () => {
    renderLanding(false);
    expect(screen.getByRole('button', { name: 'Importar mi primer cuadrante' })).toBeTruthy();
  });
});
