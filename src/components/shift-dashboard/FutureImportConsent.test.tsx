// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { FutureImportConsent } from './FutureImportConsent';
import type { PlanImportPreview } from '../../lib/remote';

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

describe('FutureImportConsent — auto-publication option (F1-M11)', () => {
  const preview = (autoPublish: PlanImportPreview['autoPublish']): PlanImportPreview => ({
    classification: 'MIXED', cutoff: '2026-11-02', document: { documentClass: 'PLANNING_DRAFT', confidence: 'high', evidence: [] },
    historicalCount: 2, futureCount: 5, employeeCount: 2, plan: { changes: { new: 5, unchanged: 0, modified: 0, requiresReview: 0 }, weeksAffected: [] }, autoPublish,
  });
  const eligible = { eligible: true, willPublishShiftCount: 4, weeks: [], willRetain: [{ employeeId: 'e1', date: '2026-11-03', reason: 'OVERLAP' }], reviewConflicts: [] };
  const renderWith = (decision: 'historical-only' | 'historical-and-plan' | 'historical-and-auto-publish', autoPublish: PlanImportPreview['autoPublish'], onChange = vi.fn()) => render(
    <I18nProvider><FutureImportConsent decision={decision} onChange={onChange} testId="c" historicalCount={2} futureCount={5} preview={preview(autoPublish)} /></I18nProvider>,
  );

  it('does not offer auto-publication while the deployment switch is off (legacy boolean) or the actor is not eligible', () => {
    renderWith('historical-and-plan', false);
    expect(screen.queryByRole('radio', { name: 'Importar y publicar lo válido' })).toBeNull();
    cleanup();
    renderWith('historical-and-plan', { ...eligible, eligible: false });
    expect(screen.queryByRole('radio', { name: 'Importar y publicar lo válido' })).toBeNull();
  });

  it('offers three explicit options and states what will be published, kept and reviewed before the user confirms', () => {
    const onChange = vi.fn();
    renderWith('historical-and-auto-publish', eligible, onChange);
    expect(screen.getByRole('radio', { name: 'Importar y publicar lo válido' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Importar también los turnos futuros' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Importar solo los turnos anteriores' })).toBeInTheDocument();
    expect(screen.getByText('Se publicarán 4 turnos')).toBeInTheDocument();
    expect(screen.getByText('1 quedará en borrador')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Importar también los turnos futuros' }));
    expect(onChange).toHaveBeenCalledWith('historical-and-plan');
  });

  it('never promises publication when nothing would be published', () => {
    renderWith('historical-and-auto-publish', { ...eligible, willPublishShiftCount: 0, willRetain: [] });
    expect(screen.getByTestId('c-auto-publish-nothing')).toHaveTextContent('no se publicaría ningún turno');
  });
});
