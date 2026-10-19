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
    current: [row('c', 'Regular', '14:00', '22:00')], proposed: [row('p', 'Baja', null, null, 'REQUIRES_REVIEW')], countedProvisionally: true,
    revisions: [1, 2], legacyDutyRows: [row('d', 'Regular', '14:00', '22:00')],
  },
  changes: [change('c1'), change('c2'), change('c3')],
  rows: [row('p', 'Baja', null, null, 'REQUIRES_REVIEW')],
  ...over,
});
const renderPanel = (canReconcile = true) => render(<I18nProvider><DayProvenancePanel employeeId="e1" date="2026-06-02" canReconcile={canReconcile} /></I18nProvider>);

describe('DayProvenancePanel (compact two-column layout pieces)', () => {
  it('shows the decision panel (no redundant comparison) and a compact trail', async () => {
    loadDayHistory.mockResolvedValue(history());
    renderPanel();
    expect(await screen.findByTestId('day-history-pending')).toHaveTextContent('Diferencia pendiente');
    // M4: a pending difference is decided in the block itself; no redundant comparison underneath
    expect(screen.queryByTestId('day-history-compare')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Guardar decisión' }));
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith({ employeeId: 'e1', date: '2026-06-02', keepShiftIds: ['c'], reason: 'confirmado' }));
  });

  it('a non-reconciling role sees the pending notice but no decision controls', async () => {
    loadDayHistory.mockResolvedValue(history());
    renderPanel(false);
    await screen.findByTestId('day-history-pending');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar decisión' })).toBeNull();
  });
});

describe('pending difference choices (17/09 equivalent)', () => {
  const sep17 = () => ({
    provenance: {
      requiresReview: true, effective: [],
      companyOriginal: [row('a1', 'Regular', '04:30', '12:30', 'REQUIRES_REVIEW')],
      // the same 04:30 state arrives twice (plan history row + a pending row with another id) next to a genuinely different one
      companyCurrent: [row('a1', 'Regular', '04:30', '12:30', 'REQUIRES_REVIEW'), row('b1', 'Regular', '05:00', '13:00', 'REQUIRES_REVIEW')],
      current: [row('a1', 'Regular', '04:30', '12:30')], proposed: [row('b1', 'Regular', '05:00', '13:00', 'REQUIRES_REVIEW')], countedProvisionally: true,
      revisions: [1, 2], legacyDutyRows: [],
    },
    changes: [],
    rows: [row('a2', 'Regular', '04:30', '12:30', 'REQUIRES_REVIEW'), row('b1', 'Regular', '05:00', '13:00', 'REQUIRES_REVIEW')],
  });

  it('D1/M2/M3: offers each semantic state once (2 options, never 3)', async () => {
    loadDayHistory.mockResolvedValue(sep17());
    renderPanel();
    await screen.findByTestId('day-history-pending');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getAllByText(/Regular 04:30–12:30/)).toHaveLength(1);
    expect(screen.getAllByText(/Regular 05:00–13:00/)).toHaveLength(1);
  });

  it('D2: two genuinely different shifts remain two options', async () => {
    loadDayHistory.mockResolvedValue(history({ rows: [row('p1', 'Regular', '04:30', '12:30', 'REQUIRES_REVIEW'), row('p2', 'Regular', '05:00', '13:00', 'REQUIRES_REVIEW')], provenance: { requiresReview: true, effective: [], companyOriginal: [], companyCurrent: [], revisions: [], legacyDutyRows: [] } }));
    renderPanel();
    await screen.findByTestId('day-history-pending');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('D3: choosing an option keeps the id of the row that is pending', async () => {
    loadDayHistory.mockResolvedValue(sep17());
    renderPanel();
    await screen.findByTestId('day-history-pending');
    fireEvent.click(screen.getByRole('checkbox', { name: /Usar como calendario actual: Regular 04:30–12:30/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar decisión' }));
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith({ employeeId: 'e1', date: '2026-06-02', keepShiftIds: ['a1'], reason: 'ok' }));
  });

  it('D4/D5/D6: no company-plan vocabulary, no revision labels', async () => {
    loadDayHistory.mockResolvedValue(sep17());
    const { container } = renderPanel();
    await screen.findByTestId('day-history-pending');
    expect(container.textContent).not.toMatch(/Plan Empresa|Antes comunicado|Ahora comunicado|Actualización \d|Revisión \d/i);
    expect(screen.getByRole('group', { name: 'Elige el calendario del día' })).toBeInTheDocument();
    expect(screen.getByTestId('day-history-pending-note')).toHaveTextContent('el calendario actual sí cuentan provisionalmente');
  });

  it('a resolved day shows only the current calendar, without revision numbers', async () => {
    loadDayHistory.mockResolvedValue(history({ provenance: {
      requiresReview: false, effective: [row('e', 'Regular', '05:00', '13:00')],
      companyOriginal: [row('o', 'Regular', '04:30', '12:30')], companyCurrent: [row('c', 'Regular', '05:00', '13:00')], revisions: [1, 2], legacyDutyRows: [],
    }, rows: [] }));
    renderPanel();
    const compare = await screen.findByTestId('day-history-compare');
    expect(compare).toHaveTextContent('Calendario actual');
    expect(compare).not.toHaveTextContent('Información anterior');
    expect(compare).not.toHaveTextContent(/Actualización|Revisión/);
  });
});

describe('day history: a technical check is not a change (16/07 equivalent)', () => {
  const noChange = (reason: string) => ({
    id: 'sys1', changeType: 'RECONCILIATION', createdAt: '2026-10-16T15:50:40Z', actorRole: 'SYSTEM', actorName: null, selfChange: false, reason,
    // the stored audit snapshot shape of the real 16/07 row: {id,type,start,end} → {type,start,end}
    before: [{ id: 'r1', type: 'Vacaciones', start: null, end: null }], after: [{ type: 'Vacaciones', start: null, end: null }],
  });
  const textOf = (el: HTMLElement) => (el.textContent ?? '').toLowerCase();
  const count = (el: HTMLElement, needle: string) => textOf(el).split(needle).length - 1;
  const dayOf = (changes: unknown[]) => ({
    provenance: { requiresReview: false, effective: [row('e', 'Vacaciones', null, null)], companyOriginal: [], companyCurrent: [], revisions: [], legacyDutyRows: [] },
    changes, rows: [],
  });
  const LEGACY = '[run 1acfbb93-09f0-40c3-9860-8de50a26b3d8] Reconciled (HIGH): consistent with company calendar';

  it('ES: humane copy, no false diff, no technical text, no "ajuste de datos"', async () => {
    loadDayHistory.mockResolvedValue(dayOf([noChange(LEGACY)]));
    const { container } = renderPanel();
    const item = await screen.findByTestId('day-history-change-sys1');
    expect(item.getAttribute('data-semantic-change')).toBe('false');
    expect(item).toHaveTextContent('Comprobación automática');
    expect(count(item, 'comprobación automática')).toBe(1); // not "Comprobación automática · Sistema · comprobación automática"
    expect(textOf(item)).not.toContain('sistema');
    expect(item).toHaveTextContent('Sin cambios');
    expect(item).toHaveTextContent('La información ya coincidía con el calendario.');
    expect(container.textContent).not.toMatch(/Reconciled|HIGH|run |1acfbb93|company calendar|ajuste de datos|Vacaciones → Vacaciones/i);
    expect(container.querySelector('.day-history__change-diff')).toBeNull();
  });

  it('EN: natural localized copy', async () => {
    window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'en');
    loadDayHistory.mockResolvedValue(dayOf([noChange(LEGACY)]));
    const { container } = renderPanel();
    const item = await screen.findByTestId('day-history-change-sys1');
    expect(item).toHaveTextContent('Automatic check');
    expect(count(item, 'automatic check')).toBe(1);
    expect(textOf(item)).not.toContain('system');
    expect(item).toHaveTextContent('No changes');
    expect(item).toHaveTextContent('The information already matched the calendar.');
    expect(container.textContent).not.toMatch(/Reconciled|HIGH|1acfbb93|company calendar/);
  });

  it('a REAL change keeps its before → after diff and its (humanized) reason', async () => {
    loadDayHistory.mockResolvedValue(dayOf([{ ...noChange('Marked REQUIRES_REVIEW (LOW): x'), id: 'real1', after: [{ type: 'Libre', start: null, end: null }] }]));
    const { container } = renderPanel();
    const item = await screen.findByTestId('day-history-change-real1');
    expect(item.getAttribute('data-semantic-change')).toBe('true');
    expect(item).toHaveTextContent('Vacaciones → Libre');
    expect(container.textContent).not.toMatch(/REQUIRES_REVIEW|LOW/);
    expect(item).toHaveTextContent('Se detectó una diferencia que necesita revisión.');
  });
});
