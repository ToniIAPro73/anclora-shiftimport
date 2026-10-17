// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';

const loadDayHistory = vi.fn();
const reconcile = vi.fn().mockResolvedValue({});
vi.mock('../../lib/remote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/remote')>()),
  loadDayHistory: (...a: unknown[]) => loadDayHistory(...a),
  reconcileCalendarDayRemote: (...a: unknown[]) => reconcile(...a),
}));
import { DayProvenancePanel } from './DayProvenancePanel';

afterEach(cleanup);
beforeEach(() => { window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es'); loadDayHistory.mockReset(); reconcile.mockClear(); });

const row = (id: string, shiftType: string, startTime: string | null, endTime: string | null, effectiveState = 'EFFECTIVE') => ({ id, shiftType, startTime, endTime, effectiveState });
const change = (id: string, type = 'TIME_CHANGE') => ({
  id, changeType: type, createdAt: '2026-10-01T10:00:00Z', actorRole: 'ADMIN', actorName: 'QA', selfChange: false, reason: 'ajuste',
  before: [{ shiftType: 'Regular', startTime: '11:00', endTime: '19:00' }], after: [{ shiftType: 'Regular', startTime: '10:00', endTime: '18:00' }],
});
const history = (over: Record<string, unknown> = {}) => ({
  provenance: {
    requiresReview: true, effective: [], companyOriginal: [row('o', 'Regular', '14:00', '22:00')], companyCurrent: [row('c', 'Regular', '14:00', '22:00')],
    revisions: [1, 2], legacyDutyRows: [row('d', 'Regular', '14:00', '22:00')],
  },
  changes: [change('c1'), change('c2'), change('c3')],
  rows: [row('p', 'Baja', null, null, 'REQUIRES_REVIEW')],
  ...over,
});
const renderPanel = (canReconcile = true) => render(<I18nProvider><DayProvenancePanel employeeId="e1" date="2026-06-02" canReconcile={canReconcile} /></I18nProvider>);

describe('DayProvenancePanel (compact two-column layout pieces)', () => {
  it('shows the decision panel, the effective / original / current comparison and a compact trail', async () => {
    loadDayHistory.mockResolvedValue(history());
    renderPanel();
    expect(await screen.findByTestId('day-history-pending')).toHaveTextContent('Pendiente de reconciliación');
    expect(screen.getByTestId('day-history-compare').children).toHaveLength(3);
    expect(screen.getByTestId('day-history-compare')).toHaveTextContent('Plan empresa original');
    expect(screen.getByTestId('day-history-compare')).toHaveTextContent('Plan empresa vigente');
    // only the latest two changes are inline; the rest sit behind "Ver 1 más"
    expect(screen.getByTestId('day-history-change-c1')).toBeInTheDocument();
    expect(screen.getByText('Ver 1 más')).toBeInTheDocument();
    expect(screen.getByText(/Jefe de turno \(legado JT/)).toBeInTheDocument();
  });

  it('records the decision with the chosen rows and a reason (behaviour unchanged)', async () => {
    loadDayHistory.mockResolvedValue(history());
    renderPanel();
    await screen.findByTestId('day-history-pending');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'confirmado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar decisión' }));
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith({ employeeId: 'e1', date: '2026-06-02', keepShiftIds: ['c'], reason: 'confirmado' }));
  });

  it('a non-reconciling role sees the comparison but no decision controls', async () => {
    loadDayHistory.mockResolvedValue(history());
    renderPanel(false);
    await screen.findByTestId('day-history-pending');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar decisión' })).toBeNull();
  });
});
