// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

afterEach(cleanup);
import { ImportOutcomeReport, ImportResultModal } from './ImportResultModal';
import { ReconciliationReport } from '../../lib/import-reconciliation';
import { I18nProvider } from '../../lib/i18n-react';

function renderModal(report: ReconciliationReport) {
  return render(
    <I18nProvider>
      <ImportResultModal isOpen onClose={vi.fn()} report={report} />
    </I18nProvider>,
  );
}

function renderOutcome(report: ImportOutcomeReport, actions: { onCompleteEmployee?: () => void; onRetry?: () => void } = {}) {
  return render(
    <I18nProvider>
      <ImportResultModal
        isOpen
        onClose={vi.fn()}
        report={report}
        onCompleteEmployee={actions.onCompleteEmployee ? () => actions.onCompleteEmployee?.() : undefined}
        onRetry={actions.onRetry}
      />
    </I18nProvider>,
  );
}

describe('ImportResultModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <I18nProvider>
        <ImportResultModal isOpen={false} onClose={vi.fn()} report={{ expectedCount: 0, persistedCount: 0, matchedCount: 0, mismatches: [], status: 'PASS' }} />
      </I18nProvider>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('PASS: shows the dialog with the persisted/expected counts, no mismatch list', () => {
    renderModal({ expectedCount: 15, persistedCount: 15, matchedCount: 15, mismatches: [], status: 'PASS' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/15/)).toBeTruthy();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('FAIL: shows one alert row per mismatch, with the date and reason', () => {
    renderModal({
      expectedCount: 2,
      persistedCount: 1,
      matchedCount: 1,
      status: 'FAIL',
      mismatches: [
        {
          id: 'missing-1',
          date: '2026-09-07',
          reason: 'missing_in_persisted',
          expected: { id: 'missing-1', date: '2026-09-07', startTime: '17:00', endTime: '01:00', location: '', origin: 'IMP' },
        },
      ],
    });
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('2026-09-07');
  });

  it('blocked outcome stays in the application modal and exposes recovery actions', () => {
    const onCompleteEmployee = vi.fn();
    const onRetry = vi.fn();
    renderOutcome({
      status: 'blocked',
      reason: 'EMPLOYEE_PENDING_ACCESS',
      blockingEmployeeId: 'employee-1',
      blockingEmployeeName: 'Ana Soler',
      attemptedCount: 4,
      createdShiftCount: 0,
      existingShiftCount: 0,
    }, { onCompleteEmployee, onRetry });

    const dialog = screen.getAllByRole('dialog').at(-1);
    expect(dialog).toBeTruthy();
    expect(within(dialog as HTMLElement).getByRole('alert').textContent).toContain('Ana Soler');
    within(dialog as HTMLElement).getByRole('button', { name: 'Completar alta' }).click();
    within(dialog as HTMLElement).getByRole('button', { name: 'Reintentar importación' }).click();
    expect(onCompleteEmployee).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the self-import breakdown and future-row explanation', () => {
    renderOutcome({
      status: 'partial',
      reason: 'SELF_FUTURE_ROWS_EXCLUDED',
      attemptedCount: 8,
      createdShiftCount: 5,
      existingShiftCount: 0,
      outcomeDetail: { totalRows: 8, ownRows: 8, ignoredRows: 0, futureOwnRows: 3 },
    });
    const dialog = screen.getAllByRole('dialog').at(-1) as HTMLElement;
    expect(within(dialog).getByText(/8 filas detectadas: 8 propias/)).toBeTruthy();
    expect(within(dialog).getByText(/Las fechas futuras no se importan/)).toBeTruthy();
    expect(dialog.textContent).not.toContain('{{unidentifiedRows}}');
  });

  it('COMPLETED: structured summary (metrics, done, pending, next step) instead of running text', () => {
    render(
      <I18nProvider>
        <ImportResultModal
          isOpen
          onClose={vi.fn()}
          report={{
            status: 'COMPLETED',
            historical: { submittedCount: 289, persistedCount: 288, existingCount: 1 },
            future: { submittedCount: 30, createdAssignmentCount: 30, existingAssignmentCount: 0, affectedWeekCount: 6, publishedWeekCount: 0, publishedShiftCount: 0, publicationResults: [], draftWeekCount: 6 },
            plan: { changes: { new: 30, unchanged: 280, modified: 2, requiresReview: 1 } },
          }}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(screen.getByTestId('import-result-metric-historical')).getByText('288')).toBeTruthy();
    expect(within(screen.getByTestId('import-result-metric-future')).getByText('30')).toBeTruthy();
    expect(within(screen.getByTestId('import-result-metric-weeks')).getByText('6')).toBeTruthy();
    expect(screen.queryByTestId('import-result-revision')).toBeNull();
    expect(screen.getByTestId('import-result-changes').textContent).toMatch(/2.*Modificados/);
    expect(screen.getByTestId('import-result-pending').textContent).toContain('1 día(s)');
    expect(screen.getByText(/borrador y no se publica sola/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entendido' })).toBeTruthy();
  });

  it('COMPLETED duplicate: says nothing was duplicated and nothing is pending', () => {
    render(
      <I18nProvider>
        <ImportResultModal
          isOpen
          onClose={vi.fn()}
          report={{
            status: 'COMPLETED', duplicate: 'DUPLICATE_PLAN',
            historical: { submittedCount: 0, persistedCount: 0, existingCount: 5 },
            future: { submittedCount: 2, createdAssignmentCount: 0, existingAssignmentCount: 2, affectedWeekCount: 1, publishedWeekCount: 0, publishedShiftCount: 0, publicationResults: [] },
          }}
        />
      </I18nProvider>,
    );
    expect(screen.getByTestId('import-result-duplicate')).toBeTruthy();
    expect(screen.queryByTestId('import-result-revision')).toBeNull();
    expect(screen.getByTestId('import-result-pending').textContent).toContain('Ninguna diferencia pendiente');
  });
});

describe('ImportResultModal — temporal result with auto-publication (F1-M11)', () => {
  const base = {
    status: 'COMPLETED' as const,
    historical: { submittedCount: 0, persistedCount: 0, existingCount: 0 },
    duplicate: null,
  };
  const future = (over: Record<string, unknown> = {}) => ({
    submittedCount: 5, createdAssignmentCount: 5, existingAssignmentCount: 0, affectedWeekCount: 1, publishedWeekCount: 1, publishedShiftCount: 4,
    publicationResults: [{ periodStart: '2026-11-02', status: 'SPLIT', createdShiftCount: 4 }], draftWeekCount: 1, ...over,
  });
  const renderResult = (report: Parameters<typeof ImportResultModal>[0]['report'], extra: { onOpenPlanner?: () => void; onResolveDifferences?: () => void } = {}) => render(
    <I18nProvider><ImportResultModal isOpen onClose={vi.fn()} report={report} {...extra} /></I18nProvider>,
  );

  it('separates published, kept back (with reasons) and review; offers only actionable CTAs', () => {
    const onOpenPlanner = vi.fn();
    const onResolveDifferences = vi.fn();
    renderResult({
      ...base,
      future: future({ retained: [{ employeeId: 'e1', date: '2026-11-03', reason: 'REST_RULE_VIOLATION' }, { employeeId: 'e2', date: '2026-11-03', reason: 'REST_RULE_VIOLATION' }] }),
      plan: { autoPublished: true, changes: { new: 3, unchanged: 0, modified: 0, requiresReview: 2 } },
    }, { onOpenPlanner, onResolveDifferences });
    expect(screen.getByTestId('import-result-published')).toHaveTextContent('Turnos publicados: 4 (semanas: 1).');
    expect(screen.getByTestId('import-result-retained')).toHaveTextContent('2 × No respetan el descanso mínimo');
    screen.getByTestId('import-result-resolve').click();
    screen.getByTestId('import-result-open-planner').click();
    expect(onResolveDifferences).toHaveBeenCalledTimes(1);
    expect(onOpenPlanner).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Resolver 2 diferencias')).toBeInTheDocument();
  });

  it('a fully published import has no "Open in Planning" CTA and says the shifts are visible', () => {
    renderResult({
      ...base,
      future: future({ draftWeekCount: 0, publicationResults: [{ periodStart: '2026-11-02', status: 'PUBLISHED', createdShiftCount: 4 }], retained: [] }),
      plan: { autoPublished: true, changes: { new: 4, unchanged: 0, modified: 0, requiresReview: 0 } },
    }, { onOpenPlanner: vi.fn(), onResolveDifferences: vi.fn() });
    expect(screen.queryByTestId('import-result-open-planner')).toBeNull();
    expect(screen.queryByTestId('import-result-resolve')).toBeNull();
    expect(screen.getByText('Los turnos ya son visibles para los empleados afectados.')).toBeInTheDocument();
  });

  it('a plain draft import keeps the "not published automatically" copy and opens Planning', () => {
    renderResult({ ...base, future: future({ publishedWeekCount: 0, publishedShiftCount: 0, publicationResults: [] }), plan: { changes: { new: 5, unchanged: 0, modified: 0, requiresReview: 0 } } }, { onOpenPlanner: vi.fn() });
    expect(screen.getByText(/no se publica sola/)).toBeInTheDocument();
    expect(screen.getByTestId('import-result-open-planner')).toBeInTheDocument();
  });
});
