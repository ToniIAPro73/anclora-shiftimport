// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportResultModal } from './ImportResultModal';
import { ReconciliationReport } from '../../lib/import-reconciliation';
import { I18nProvider } from '../../lib/i18n-react';

function renderModal(report: ReconciliationReport) {
  return render(
    <I18nProvider>
      <ImportResultModal isOpen onClose={vi.fn()} report={report} />
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
});
