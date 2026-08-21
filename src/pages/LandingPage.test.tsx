// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('LandingPage transformation section (Fase 1.2B-VISUAL-REFINE)', () => {
  it('renders the input/detection/output flow, not a 6-card feature grid', () => {
    renderLanding(false);
    expect(screen.getByRole('heading', { name: 'Qué hace ShiftImport' })).toBeTruthy();
    expect(screen.getByText('cuadrante-agosto.pdf')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getAllByText('38 Reconocido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 Nuevo').length).toBeGreaterThan(0);
    expect(screen.getByText('Agosto')).toBeTruthy();
  });
});

describe('LandingPage team roster (Fase 1.2B-VISUAL-REFINE)', () => {
  it('shows a selectable roster with recognized/new status pills, not generic pills', () => {
    renderLanding(false);
    expect(screen.getByRole('heading', { name: 'Pensado para equipos, no solo para una persona' })).toBeTruthy();
    expect(screen.getByText('Equipo detectado')).toBeTruthy();
    expect(screen.getAllByText('Adriana Molina').length).toBeGreaterThan(0);
    expect(screen.getByText('Seleccionados 3 de 40')).toBeTruthy();
  });

  it('toggling a row updates the selected count', () => {
    const { container } = renderLanding(false);
    const roster = container.querySelector('.team-roster');
    const martaRow = Array.from(roster?.querySelectorAll('label') ?? []).find((row) => row.textContent?.includes('Marta Pérez'));
    const checkbox = martaRow?.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox as HTMLInputElement);
    expect(screen.getByText('Seleccionados 4 de 40')).toBeTruthy();
  });

  it('"Seleccionar todos" selects every visible row', () => {
    renderLanding(false);
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar todos' }));
    expect(screen.getByText('Seleccionados 4 de 40')).toBeTruthy();
  });
});
