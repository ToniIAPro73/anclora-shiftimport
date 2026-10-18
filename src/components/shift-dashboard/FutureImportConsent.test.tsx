// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { FutureImportConsent } from './FutureImportConsent';

setupLocalStorageMock();
afterEach(cleanup);

const renderConsent = (historicalCount: number, decision: 'historical-only' | 'historical-and-plan') => render(
  <I18nProvider><FutureImportConsent decision={decision} onChange={vi.fn()} testId="c" historicalCount={historicalCount} futureCount={3} /></I18nProvider>,
);

describe('FutureImportConsent (shared by individual and team import, any source kind)', () => {
  it('mixed: two explicit options and the draft / not-published help', () => {
    renderConsent(2, 'historical-and-plan');
    expect(screen.getByText('El archivo también contiene turnos futuros')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Importar solo los turnos anteriores' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Importar también los turnos futuros' })).toBeChecked();
    expect(screen.getByText('Los turnos futuros se añadirán a Planificación como borrador. No se publicarán automáticamente.')).toBeInTheDocument();
  });

  it('future-only: a single option to add the shifts to Planning, with the review-before-publishing help', () => {
    renderConsent(0, 'historical-and-plan');
    expect(screen.getByText('El archivo contiene turnos futuros')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Importar solo los turnos anteriores' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Añadir los turnos a Planificación' })).toBeChecked();
    expect(screen.getByText('Se crearán como borrador para que puedas revisarlos antes de publicarlos.')).toBeInTheDocument();
  });
});
