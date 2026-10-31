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
    expect(screen.getByText('Jefe de turno (registro legado; no duplica las horas del turno actual)')).toBeInTheDocument();
  });

  it('localizes the legacy shift-lead note in English', async () => {
    window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'en');
    loadDayHistory.mockResolvedValue(history());
    renderPanel();
    await screen.findByTestId('day-history-pending');
    expect(screen.getByText('Shift lead (legacy record; does not duplicate current shift hours)')).toBeInTheDocument();
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

  it('2026-01-07 JT case: decision options show the two semantic alternatives exactly once', async () => {
    const current = row('jt-current', 'Regular', '17:00', '01:00');
    const same = row('proposal-same', 'Regular', '17:00', '01:00', 'REQUIRES_REVIEW');
    const other = row('proposal-other', 'Regular', '16:00', '00:00', 'REQUIRES_REVIEW');
    loadDayHistory.mockResolvedValue(history({
      provenance: { requiresReview: true, effective: [], current: [current], proposed: [same, other], countedProvisionally: true, legacyDutyRows: [current] },
      rows: [same, other],
    }));
    renderPanel();
    await screen.findByTestId('day-history-pending');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: /Regular 17:00–01:00/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Regular 16:00–00:00/ })).toBeInTheDocument();
  });

  it('2026-01-14 case: matching proposal is not offered as a duplicate decision option', async () => {
    const regular = row('regular-current', 'Regular', '06:00', '11:00');
    const extras = row('extras-current', 'Extras', '11:00', '13:00');
    const proposed = row('regular-proposed', 'Regular', '06:00', '11:00', 'REQUIRES_REVIEW');
    loadDayHistory.mockResolvedValue(history({
      provenance: { requiresReview: true, effective: [], current: [regular, extras], proposed: [proposed], countedProvisionally: true, legacyDutyRows: [] },
      rows: [proposed],
    }));
    renderPanel();
    await screen.findByTestId('day-history-pending');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: /Regular 06:00–11:00/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Extras 11:00–13:00/ })).toBeInTheDocument();
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

describe('approved vacation in the day (F3-M06)', () => {
  const absence = { timeOffRequestId: 'req-1', startDate: '2026-08-12', endDate: '2026-08-18', shiftId: 'abs' };
  const conflict = (over: Record<string, unknown> = {}) => history({
    provenance: {
      requiresReview: true, effective: [row('abs', 'Vacaciones', null, null)], current: [row('abs', 'Vacaciones', null, null)],
      proposed: [row('prop', 'Regular', '05:00', '13:00', 'REQUIRES_REVIEW')], countedProvisionally: false, legacyDutyRows: [],
    },
    rows: [row('abs', 'Vacaciones', null, null), row('prop', 'Regular', '05:00', '13:00', 'REQUIRES_REVIEW')],
    changes: [], protectedAbsence: absence, conflictsWithApprovedVacation: true, ...over,
  });
  const panel = (canReconcile: boolean, canOverrideProtectedAbsence: boolean) => render(
    <I18nProvider><DayProvenancePanel employeeId="e1" date="2026-08-12" canReconcile={canReconcile} canOverrideProtectedAbsence={canOverrideProtectedAbsence} /></I18nProvider>,
  );

  it('shows the origin "solicitud de vacaciones aprobada" with the range, with a lock and words', async () => {
    loadDayHistory.mockResolvedValue(conflict({ provenance: { requiresReview: false, effective: [row('abs', 'Vacaciones', null, null)], current: [], proposed: [], legacyDutyRows: [] }, rows: [row('abs', 'Vacaciones', null, null)], conflictsWithApprovedVacation: false }));
    panel(true, true);
    const origin = await screen.findByTestId('day-history-origin');
    expect(origin).toHaveTextContent('Protegida');
    expect(origin).toHaveTextContent('Origen: solicitud de vacaciones aprobada (12/08–18/08)');
  });

  it('a conflict states the five answers and offers two named actions', async () => {
    loadDayHistory.mockResolvedValue(conflict());
    panel(true, true);
    const box = await screen.findByTestId('day-history-conflict');
    expect(box).toHaveAttribute('role', 'alert');
    expect(box).toHaveTextContent('Conflicto con Vacaciones aprobadas (12/08–18/08)');
    for (const text of ['Qué pasó', 'Qué se guardó', 'Qué no se aplicó', 'Por qué', 'Qué puedes hacer']) expect(box).toHaveTextContent(text);
    expect(screen.getByTestId('day-history-keep-current')).toHaveTextContent('Mantener actual (Vacaciones)');
    expect(screen.getByTestId('day-history-use-proposal')).toHaveTextContent('Usar propuesta');
    expect(screen.queryByTestId('day-history-pending')).toBeNull(); // the generic keep-options block does not compete with it
  });

  it('OWNER/ADMIN: "Mantener actual" keeps the vacation row; "Usar propuesta" keeps the proposal rows; both need a reason', async () => {
    loadDayHistory.mockResolvedValue(conflict());
    panel(true, true);
    await screen.findByTestId('day-history-conflict');
    expect(screen.getByTestId('day-history-keep-current')).toBeDisabled();
    fireEvent.change(screen.getByTestId('day-history-conflict-reason'), { target: { value: 'Confirmado con el empleado' } });
    fireEvent.click(screen.getByTestId('day-history-use-proposal'));
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith({ employeeId: 'e1', date: '2026-08-12', keepShiftIds: ['prop'], reason: 'Confirmado con el empleado' }));
    await waitFor(() => expect(screen.getByTestId('day-history-keep-current')).toBeDisabled()); // the reason is cleared after a decision
    fireEvent.change(screen.getByTestId('day-history-conflict-reason'), { target: { value: 'Confirmado con el empleado' } });
    fireEvent.click(screen.getByTestId('day-history-keep-current'));
    await waitFor(() => expect(reconcile).toHaveBeenLastCalledWith({ employeeId: 'e1', date: '2026-08-12', keepShiftIds: ['abs'], reason: 'Confirmado con el empleado' }));
  });

  it('PLANNER: "Usar propuesta" is disabled with its reason announced; "Mantener actual" still works', async () => {
    loadDayHistory.mockResolvedValue(conflict());
    panel(true, false);
    await screen.findByTestId('day-history-conflict');
    fireEvent.change(screen.getByTestId('day-history-conflict-reason'), { target: { value: 'ok' } });
    const use = screen.getByTestId('day-history-use-proposal');
    expect(use).toBeDisabled();
    expect(use).toHaveAttribute('aria-describedby', 'day-history-use-proposal-note');
    expect(screen.getByTestId('day-history-use-proposal-note')).toHaveTextContent('solo está disponible para propietarios y administradores');
    expect(screen.getByTestId('day-history-keep-current')).toBeEnabled();
  });

  it('a 403 PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN is explained with what was and was not written and what to do', async () => {
    const { ApiError } = await import('../../lib/session');
    reconcile.mockRejectedValueOnce(new ApiError(403, 'forbidden', 'PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN'));
    loadDayHistory.mockResolvedValue(conflict());
    panel(true, true);
    await screen.findByTestId('day-history-conflict');
    fireEvent.change(screen.getByTestId('day-history-conflict-reason'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('day-history-use-proposal'));
    const error = await screen.findByTestId('day-history-override-forbidden');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No se pudo sustituir las Vacaciones');
    expect(error).toHaveTextContent('nada. Las Vacaciones y la propuesta siguen como estaban');
  });

  it('after an OWNER/ADMIN replaced the vacation the day says so and the request stays approved', async () => {
    loadDayHistory.mockResolvedValue(conflict({
      provenance: { requiresReview: false, effective: [row('prop', 'Regular', '05:00', '13:00')], current: [], proposed: [], legacyDutyRows: [] },
      rows: [row('prop', 'Regular', '05:00', '13:00')], protectedAbsence: null, replacedAbsence: absence, conflictsWithApprovedVacation: false,
    }));
    panel(true, true);
    const note = await screen.findByTestId('day-history-absence-replaced');
    expect(note).toHaveTextContent('fueron sustituidas este día por un propietario o administrador');
    expect(note).toHaveTextContent('La solicitud sigue aprobada');
  });

  it('in English', async () => {
    window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'en');
    loadDayHistory.mockResolvedValue(conflict());
    panel(true, true);
    const box = await screen.findByTestId('day-history-conflict');
    expect(box).toHaveTextContent('Conflict with approved Vacation (12/08–18/08)');
    expect(screen.getByTestId('day-history-keep-current')).toHaveTextContent('Keep current (Vacation)');
    expect(screen.getByTestId('day-history-use-proposal')).toHaveTextContent('Use proposal');
  });
});
