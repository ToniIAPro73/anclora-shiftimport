// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import { PlanBaselineCard } from './PlanBaselineCard';

afterEach(cleanup);
beforeEach(() => window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es'));

const baseline = { status: 'MISSING' as const, canCreate: true, existingEquivalentRows: 15, newRows: 0, modifiedRows: 0, reviewRows: 0, sourceKind: 'TEAM_SCHEDULE_EXPORT' };

describe('PlanBaselineCard', () => {
  it('explains the action in plain language, without internal vocabulary', () => {
    const onCreate = vi.fn();
    render(<I18nProvider><PlanBaselineCard baseline={baseline} onCreate={onCreate} /></I18nProvider>);
    const card = screen.getByTestId('plan-baseline-card');
    expect(card).toHaveTextContent('Primera referencia de la empresa');
    expect(card).toHaveTextContent('Aún no tenemos información previa de la empresa');
    expect(card).toHaveTextContent('15 turnos del documento ya existen');
    expect(card).toHaveTextContent('no se duplicarán');
    expect(card).toHaveTextContent('calendario actual no se sobrescribirá');
    expect(card.textContent).not.toMatch(/plan empresa|baseline|calendario efectivo|reconciliaci|revisi[oó]n|bootstrap|fingerprint|company_plan|scope|[0-9a-f]{8}-[0-9a-f]{4}/i);
    fireEvent.click(screen.getByRole('button', { name: 'Usar como referencia inicial' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('mentions new and conflicting rows only when present and disables the action while busy', () => {
    render(<I18nProvider><PlanBaselineCard baseline={{ ...baseline, existingEquivalentRows: 1, newRows: 2, reviewRows: 3 }} busy onCreate={() => undefined} /></I18nProvider>);
    expect(screen.getByTestId('plan-baseline-card')).toHaveTextContent('2 turnos nuevos');
    expect(screen.getByTestId('plan-baseline-card')).toHaveTextContent('3 días difieren');
    expect(screen.getByTestId('plan-baseline-card-create')).toBeDisabled();
  });
});
