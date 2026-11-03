import { beforeEach, describe, expect, it } from 'vitest';
import { dayStateSignature, dayStateToken, getDayHistory, keepCurrentForDays, KEEP_CURRENT_MAX_DATES, reconcileCalendarDay } from './calendar.js';

/**
 * Reconciliation (single day and bulk «Mantener actual») over a fake SQL that models employee-days.
 * The write is ONE gated statement: the fake models what the database does with it — if the signature of the live day differs from the
 * one the application read, nothing is applied (gate_ok=false); otherwise the effect is applied. That is what the real-PostgreSQL E2E
 * of F4-M03 confirms against the actual statement.
 */
const ORG = '11111111-1111-4111-8111-111111111111';
const EMP = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const D1 = '2026-11-10';
const D2 = '2026-11-11';
const D3 = '2026-11-12';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const shift = (n, date, shiftType, startTime, endTime, effective_state, extra = {}) => ({
  id: id(n), organization_id: ORG, employee_id: EMP, import_id: null, area_id: null, date,
  start_time: startTime, end_time: endTime, location: shiftType, origin: 'MAN', shift_type: shiftType,
  counts_as_work: !['Libre', 'Vacaciones'].includes(shiftType), layer: 'CHANGE', provenance: 'MANUAL_ADMIN_CHANGE',
  legacy_origin: null, duty_role: null, effective_state, plan_revision: 1, change_id: null, time_off_request_id: null, ...extra,
});
/** A pending day: the current Regular and an imported proposal that differs. */
const pendingDay = (date, base) => [
  shift(base, date, 'Regular', '08:00', '16:00', 'EFFECTIVE'),
  shift(base + 1, date, 'Regular', '09:00', '17:00', 'REQUIRES_REVIEW', { provenance: 'COMPANY_IMPORT', origin: 'IMP' }),
];

let state;
function makeSql() {
  const text = (strings) => strings.join(' ').replace(/\s+/g, ' ').trim();
  const sql = (strings, ...values) => {
    const t = text(strings);
    if (t.startsWith('SELECT id, status FROM employees')) return Promise.resolve([{ id: EMP, status: 'active' }]);
    if (t.startsWith('SELECT area_id FROM employees')) return Promise.resolve([{ area_id: null }]);
    if (t.includes('FROM shifts') && t.includes('ORDER BY start_time')) {
      const date = values[2];
      return Promise.resolve((state.live[date] ?? []).map((row) => ({ ...row })));
    }
    if (t.includes('INTO organization_audit_events')) {
      state.audit.push({ eventType: values[2], metadata: JSON.parse(values[5]) });
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => {
    const txn = (strings, ...values) => ({ text: text(strings), values });
    const statements = build(txn);
    if (statements.length !== 2) throw new Error(`a reconciliation is [day lock, ONE gated statement], got ${statements.length}`);
    const [lock, stmt] = statements;
    expect(lock.text).toContain('pg_advisory_xact_lock'); // the day is serialised even when it has no row to lock
    state.statements.push(stmt);
    expect(stmt.text).toContain('FOR UPDATE');
    expect(stmt.text).not.toMatch(/\/\s*\(|day_unchanged|division/i); // no deliberate evaluation error as the concurrency control
    const date = stmt.values[2];
    const liveSignature = dayStateSignature(state.live[date] ?? []);
    if (!stmt.values.includes(liveSignature)) return [[], [{ gate_ok: false, changes_written: 0 }]];
    const [keptIds, droppedIds, dutyIds] = stmt.values.filter(Array.isArray);
    state.live[date] = state.live[date].map((row) => {
      if (keptIds.includes(row.id)) return { ...row, effective_state: 'EFFECTIVE' };
      if (droppedIds.includes(row.id)) return { ...row, effective_state: 'SUPERSEDED' };
      if (dutyIds.includes(row.id)) return { ...row, effective_state: 'METADATA_ONLY' };
      return row;
    });
    state.changes.push({ date, reason: stmt.values.find((value) => typeof value === 'string' && value.startsWith('Se conserva')) });
    return [[], [{ gate_ok: true, changes_written: 1 }]];
  };
  return sql;
}
const ctx = (role = 'ADMIN') => ({ user: { id: USER }, organizationId: ORG, role, employeeId: null, plannerScopeType: 'ORGANIZATION' });
const reject = (promise) => promise.then(() => { throw new Error('expected a rejection'); }, (error) => error);
const validDates = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
const REASON = 'Se conserva la planificación vigente';

beforeEach(() => {
  state = { live: {}, audit: [], statements: [], changes: [] };
});
const setDays = (map) => { state.live = Object.fromEntries(Object.entries(map).map(([date, rows]) => [date, rows.map((row) => ({ ...row }))])); };
const tokenOf = (date) => dayStateToken(state.live[date]);

describe('single-day reconciliation: the day is guarded (409 DAY_CHANGED)', () => {
  it('resolves a pending day with ONE gated statement and audits it once', async () => {
    setDays({ [D1]: pendingDay(D1, 1) });
    const result = await reconcileCalendarDay(makeSql(), ctx(), { employeeId: EMP, date: D1, reason: 'Se conserva', keepShiftIds: [id(1)], expectedDayToken: tokenOf(D1) });
    expect(result).toMatchObject({ date: D1, kept: 1, dropped: 1 });
    expect(state.statements).toHaveLength(1);
    expect(state.live[D1].map((row) => row.effective_state)).toEqual(['EFFECTIVE', 'SUPERSEDED']);
    expect(state.audit.map((event) => event.eventType)).toEqual(['CALENDAR_DAY_RECONCILED']);
  });

  it('a preview token that no longer matches is a 409 and nothing is written', async () => {
    setDays({ [D1]: pendingDay(D1, 1) });
    const stale = tokenOf(D1);
    state.live[D1].push(shift(9, D1, 'Extras', '18:00', '20:00', 'EFFECTIVE')); // someone added a shift after the preview
    const error = await reject(reconcileCalendarDay(makeSql(), ctx(), { employeeId: EMP, date: D1, reason: 'x', keepShiftIds: [id(1)], expectedDayToken: stale }));
    expect(error).toMatchObject({ status: 409, code: 'DAY_CHANGED' });
    expect(state.statements).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });

  it('even WITHOUT a token the write is gated: a day that moves between the read and the write is a 409 with no write and no audit', async () => {
    setDays({ [D1]: pendingDay(D1, 1) });
    const sql = makeSql();
    const read = sql.transaction;
    sql.transaction = async (build) => { state.live[D1][0].effective_state = 'SUPERSEDED'; return read(build); }; // a concurrent change lands in the window
    const error = await reject(reconcileCalendarDay(sql, ctx(), { employeeId: EMP, date: D1, reason: 'x', keepShiftIds: [id(1)] }));
    expect(error).toMatchObject({ status: 409, code: 'DAY_CHANGED' });
    expect(state.changes).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
  });

  it('a day with nothing pending is a 400 and stays untouched', async () => {
    setDays({ [D1]: [shift(1, D1, 'Regular', '08:00', '16:00', 'EFFECTIVE')] });
    const error = await reject(reconcileCalendarDay(makeSql(), ctx(), { employeeId: EMP, date: D1, reason: 'x', keepShiftIds: [id(1)] }));
    expect(error).toMatchObject({ status: 400, code: 'NOTHING_TO_RECONCILE' });
  });

  it('getDayHistory exposes the token the reconciliation later checks', async () => {
    setDays({ [D1]: pendingDay(D1, 1) });
    const sql = makeSql();
    const history = await getDayHistory(sql, ctx(), EMP, D1);
    expect(history.dayToken).toBe(tokenOf(D1));
  });
});

describe('«Mantener actual» in bulk (OD-F4-04, v1)', () => {
  const dates = [D1, D2];
  const preview = (sql = makeSql(), input = {}) => keepCurrentForDays(sql, ctx(), { employeeId: EMP, dates, mode: 'preview', action: 'KEEP_CURRENT', ...input });
  const apply = (sql, tokens, input = {}) => keepCurrentForDays(sql, ctx(), { employeeId: EMP, dates, mode: 'apply', action: 'KEEP_CURRENT', reason: REASON, dayTokens: tokens, ...input });
  const tokensOf = (list) => Object.fromEntries(list.map((date) => [date, tokenOf(date)]));

  it('preview writes nothing and reports, per day, what stays, what is superseded and the day token', async () => {
    setDays({ [D1]: pendingDay(D1, 1), [D2]: pendingDay(D2, 3) });
    const out = await preview();
    expect(state.statements).toHaveLength(0);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({ date: D1, eligible: true, dayToken: tokenOf(D1), protectedAbsence: false });
    expect(out.results[0].keep).toEqual([{ type: 'Regular', startTime: '08:00', endTime: '16:00' }]);
    expect(out.results[0].drop).toEqual([{ type: 'Regular', startTime: '09:00', endTime: '17:00' }]);
  });

  it('apply keeps the CURRENT rows, supersedes only the proposals, one change + one audit per day, the same reason on each', async () => {
    setDays({ [D1]: pendingDay(D1, 1), [D2]: pendingDay(D2, 3) });
    const out = await apply(makeSql(), tokensOf(dates));
    expect(out.summary).toEqual({ requested: 2, applied: 2, failed: 0 });
    expect(out.results).toEqual([{ date: D1, ok: true }, { date: D2, ok: true }]);
    expect(state.statements).toHaveLength(2); // one transaction per day
    expect(state.live[D1].map((row) => row.effective_state)).toEqual(['EFFECTIVE', 'SUPERSEDED']);
    expect(state.live[D2].map((row) => row.effective_state)).toEqual(['EFFECTIVE', 'SUPERSEDED']);
    expect(state.changes.map((change) => change.reason)).toEqual([REASON, REASON]);
    expect(state.audit.filter((event) => event.eventType === 'CALENDAR_DAY_RECONCILED')).toHaveLength(2);
  });

  it('PARTIAL: a stale day, an already-resolved day and a good day each get their own result; only the good one is written', async () => {
    setDays({ [D1]: pendingDay(D1, 1), [D2]: pendingDay(D2, 3), [D3]: [shift(5, D3, 'Regular', '08:00', '16:00', 'EFFECTIVE')] });
    const tokens = tokensOf([D1, D2, D3]);
    state.live[D2].push(shift(20, D2, 'Extras', '18:00', '20:00', 'EFFECTIVE')); // D2 moved after the preview
    const out = await apply(makeSql(), tokens, { dates: [D1, D2, D3] });
    expect(out.results).toEqual([
      { date: D1, ok: true },
      { date: D2, ok: false, status: 409, code: 'DAY_CHANGED' },
      { date: D3, ok: false, status: 409, code: 'ALREADY_RECONCILED' },
    ]);
    expect(out.summary).toEqual({ requested: 3, applied: 1, failed: 2 });
    expect(state.statements).toHaveLength(1);
    expect(state.live[D2].find((row) => row.id === id(4)).effective_state).toBe('REQUIRES_REVIEW'); // untouched
    expect(state.audit).toHaveLength(1);
  });

  it('IDEMPOTENT: repeating a completed operation writes nothing and audits nothing again', async () => {
    setDays({ [D1]: pendingDay(D1, 1), [D2]: pendingDay(D2, 3) });
    const tokens = tokensOf(dates);
    await apply(makeSql(), tokens);
    const writtenBefore = state.statements.length;
    const auditBefore = state.audit.length;
    const again = await apply(makeSql(), tokens);
    expect(again.results.every((item) => item.ok === false && item.code === 'ALREADY_RECONCILED')).toBe(true);
    expect(state.statements).toHaveLength(writtenBefore);
    expect(state.audit).toHaveLength(auditBefore);
  });

  it('never empties a day: with nothing effective to keep the day is skipped (NO_CURRENT_TO_KEEP), in preview and in apply', async () => {
    setDays({ [D1]: [shift(1, D1, 'Regular', '09:00', '17:00', 'REQUIRES_REVIEW', { provenance: 'COMPANY_IMPORT', origin: 'IMP' })] });
    const p = await preview(makeSql(), { dates: [D1] });
    expect(p.results[0]).toMatchObject({ eligible: false, code: 'NO_CURRENT_TO_KEEP' });
    const out = await apply(makeSql(), tokensOf([D1]), { dates: [D1] });
    expect(out.results[0]).toEqual({ date: D1, ok: false, status: 409, code: 'NO_CURRENT_TO_KEEP' });
    expect(state.statements).toHaveLength(0);
  });

  it('a day whose CURRENT state is already inconsistent is not offered (RESULT_INCONSISTENT) and is never written', async () => {
    const vacation = shift(1, D1, 'Vacaciones', null, null, 'EFFECTIVE', { time_off_request_id: '55555555-5555-4555-8555-555555555555', provenance: 'EMPLOYEE_REQUEST' });
    const regular = shift(2, D1, 'Regular', '08:00', '16:00', 'EFFECTIVE');
    const proposal = shift(3, D1, 'Regular', '10:00', '18:00', 'REQUIRES_REVIEW', { provenance: 'COMPANY_IMPORT', origin: 'IMP' });
    setDays({ [D1]: [vacation, regular, proposal] });
    const p = await preview(makeSql(), { dates: [D1] });
    expect(p.results[0]).toMatchObject({ eligible: false, code: 'RESULT_INCONSISTENT' });
    const out = await apply(makeSql(), tokensOf([D1]), { dates: [D1] });
    expect(out.results[0]).toEqual({ date: D1, ok: false, status: 409, code: 'RESULT_INCONSISTENT' });
    expect(state.statements).toHaveLength(0);
  });

  it('a protected approved vacation is KEPT (never replaced) and flagged in the preview; no override is recorded', async () => {
    const vacation = shift(1, D1, 'Vacaciones', null, null, 'EFFECTIVE', { time_off_request_id: '55555555-5555-4555-8555-555555555555', provenance: 'EMPLOYEE_REQUEST' });
    const proposal = shift(2, D1, 'Regular', '09:00', '17:00', 'REQUIRES_REVIEW', { provenance: 'COMPANY_IMPORT', origin: 'IMP' });
    setDays({ [D1]: [vacation, proposal] });
    const p = await preview(makeSql(), { dates: [D1] });
    expect(p.results[0]).toMatchObject({ eligible: true, protectedAbsence: true });
    expect(p.results[0].keep).toEqual([{ type: 'Vacaciones', startTime: null, endTime: null }]);
    const out = await apply(makeSql(), tokensOf([D1]), { dates: [D1], role: 'PLANNER' });
    expect(out.results).toEqual([{ date: D1, ok: true }]);
    expect(state.live[D1].map((row) => row.effective_state)).toEqual(['EFFECTIVE', 'SUPERSEDED']);
    expect(state.audit.map((event) => event.eventType)).toEqual(['CALENDAR_DAY_RECONCILED']);
  });

  it.each([
    ['no dates', { dates: [] }],
    ['more than 50 distinct valid dates', { dates: validDates(KEEP_CURRENT_MAX_DATES + 1) }],
    ['a malformed date', { dates: ['10/11/2026'] }],
    ['another action', { action: 'USE_PROPOSAL' }],
    ['a blank reason', { reason: '   ' }],
    ['a too long reason', { reason: 'x'.repeat(2001) }],
    ['a missing day token', { dayTokens: {} }],
  ])('rejects %s before touching anything', async (_label, patch) => {
    setDays({ [D1]: pendingDay(D1, 1), [D2]: pendingDay(D2, 3) });
    const error = await reject(apply(makeSql(), tokensOf(dates), patch));
    expect(error.status).toBe(400);
    expect(state.statements).toHaveLength(0);
  });

  it('duplicated dates are decided once', async () => {
    setDays({ [D1]: pendingDay(D1, 1) });
    const out = await apply(makeSql(), tokensOf([D1]), { dates: [D1, D1] });
    expect(out.summary).toEqual({ requested: 1, applied: 1, failed: 0 });
    expect(state.statements).toHaveLength(1);
  });

  it('accepts exactly 50 distinct dates (the upper bound) in preview', async () => {
    const out = await preview(makeSql(), { dates: validDates(KEEP_CURRENT_MAX_DATES) });
    expect(out.results).toHaveLength(KEEP_CURRENT_MAX_DATES);
  });

  it('EMPLOYEE is forbidden; a PLANNER in scope is allowed (authorised reconciliation)', async () => {
    setDays({ [D1]: pendingDay(D1, 1) });
    const forbidden = await reject(keepCurrentForDays(makeSql(), ctx('EMPLOYEE'), { employeeId: EMP, dates: [D1], mode: 'preview' }));
    expect(forbidden.status).toBe(403);
    const ok = await keepCurrentForDays(makeSql(), ctx('PLANNER'), { employeeId: EMP, dates: [D1], mode: 'apply', reason: REASON, dayTokens: tokensOf([D1]) });
    expect(ok.summary.applied).toBe(1);
  });
});
