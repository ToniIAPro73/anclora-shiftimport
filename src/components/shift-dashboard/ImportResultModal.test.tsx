// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});
