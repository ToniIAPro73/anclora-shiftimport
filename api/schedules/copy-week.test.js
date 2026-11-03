import { beforeEach, describe, expect, it } from 'vitest';
import { copyWeekIntoDraft } from '../_lib/scheduling.js';
import { getOperationalDate, shiftOperationalDate } from '../_lib/operational-date.js';

/**
 * F4-M03 / OD-F4-01 — copy the previous week's PUBLISHED plan into a draft. The fake SQL models one source version, one target draft and
 * the calendar around it; what matters is WHAT is copied (only what the publication materialised and is still current) and that
 * nothing is overwritten, duplicated or written in `preview`.
 */
const ORG = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const SRC_SCHEDULE = '44444444-4444-4444-8444-444444444444';
const SRC_VERSION = '55555555-5555-4555-8555-555555555555';
const EMP_A = '66666666-6666-4666-8666-666666666666';
const EMP_B = '77777777-7777-4777-8777-777777777777';
const EMP_OTHER_AREA = '88888888-8888-4888-8888-888888888888';
const AREA = '99999999-9999-4999-8999-999999999999';
const OTHER_AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const today = getOperationalDate();
const TARGET_START = shiftOperationalDate(today, -2); // a week already under way: its first days are past
const TARGET_END = shiftOperationalDate(TARGET_START, 6);
const SOURCE_START = shiftOperationalDate(TARGET_START, -7);
const SOURCE_END = shiftOperationalDate(SOURCE_START, 6);
const src = (offset) => shiftOperationalDate(SOURCE_START, offset);
const tgt = (offset) => shiftOperationalDate(TARGET_START, offset);

let n = 0;
const row = (employee, offset, shiftType, start, end, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, employee_id: employee, date: src(offset), start_time: start, end_time: end,
  location: shiftType, shift_type: shiftType, counts_as_work: !['Libre', 'Vacaciones'].includes(shiftType), still_current: true, ...extra,
});

let state;
function makeSql() {
  const text = (strings) => strings.join(' ').replace(/\s+/g, ' ').trim();
  const sql = (strings, ...values) => {
    const t = text(strings);
    state.queries.push(t);
    if (t.includes('FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id WHERE sv.id')) {
      return Promise.resolve(state.target ? [{ version_id: VERSION, schedule_id: SCHEDULE, status: state.target.status, organization_id: ORG, area_id: AREA, period_start: TARGET_START, period_end: TARGET_END }] : []);
    }
    if (t.includes('FROM schedules s JOIN schedule_versions sv ON sv.schedule_id = s.id')) {
      expect(t).toContain("sv.status IN ('PUBLISHED', 'LOCKED', 'COMPLETED')"); // a draft is never a source
      return Promise.resolve(state.source ? [{ version_id: SRC_VERSION, version_number: 2, schedule_id: SRC_SCHEDULE, period_start: SOURCE_START, period_end: SOURCE_END }] : []);
    }
    if (t.includes('FROM shift_assignments sa WHERE sa.schedule_version_id')) {
      expect(values).toContain(SRC_VERSION);
      return Promise.resolve(state.sourceRows);
    }
    if (t.startsWith('SELECT id, name, area_id, status FROM employees')) return Promise.resolve(state.employees);
    if (t.startsWith('SELECT id, employee_id, date, start_time, end_time, location, shift_type, counts_as_work FROM shift_assignments')) return Promise.resolve(state.existing.map((r) => ({ ...r })));
    if (t.includes('time_off_request_id IS NOT NULL')) return Promise.resolve(state.protectedDays);
    if (t.includes('FROM shifts') && t.includes('date IN (')) return Promise.resolve(state.boundary);
    if (t.startsWith('SELECT status FROM schedule_versions')) return Promise.resolve([{ status: state.target.status }]);
    if (t.includes('INTO organization_audit_events')) { state.audit.push({ eventType: values[2], metadata: JSON.parse(values[5]) }); return Promise.resolve([]); }
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => {
    const txn = (strings, ...values) => ({ text: text(strings), values });
    const statements = build(txn);
    state.transactions.push(statements);
    const [lock, insert] = statements;
    expect(lock.text).toContain('FOR UPDATE'); // the version row is locked FIRST
    expect(insert.text).toContain('NOT EXISTS'); // and the insert never duplicates an identical assignment
    const payload = JSON.parse(insert.values.find((value) => typeof value === 'string' && value.startsWith('[')));
    const created = [];
    for (const item of payload) {
      const exists = state.existing.some((e) => e.employee_id === item.employee_id && e.date === item.date && (e.start_time ?? null) === item.start_time && (e.end_time ?? null) === item.end_time && e.shift_type === item.shift_type);
      if (!exists) { const inserted = { id: `99999999-0000-4000-8000-${String(created.length + 1).padStart(12, '0')}`, ...item }; created.push(inserted); state.existing.push(inserted); }
    }
    return [[{ id: VERSION }], created];
  };
  return sql;
}
const ctx = (role = 'ADMIN') => ({ user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, organizationId: ORG, role, employeeId: null });
const reject = (promise) => promise.then(() => { throw new Error('expected a rejection'); }, (error) => error);
const copy = (input = {}, c = ctx()) => copyWeekIntoDraft(makeSql(), c, SCHEDULE, VERSION, { sourceWeekStart: SOURCE_START, mode: 'preview', ...input });
const reasons = (result) => Object.fromEntries(result.skipped.map((s) => [`${s.shiftType ?? 'x'}@${s.targetDate}`, s.reason]));

beforeEach(() => {
  n = 0;
  state = {
    queries: [], transactions: [], audit: [], target: { status: 'DRAFT' }, source: true, existing: [], protectedDays: [], boundary: [],
    employees: [
      { id: EMP_A, name: 'Ana', area_id: AREA, status: 'active' },
      { id: EMP_B, name: 'Beto', area_id: AREA, status: 'active' },
      { id: EMP_OTHER_AREA, name: 'Otra', area_id: OTHER_AREA, status: 'active' },
    ],
    sourceRows: [],
  };
});

describe('copy-week: what is copied', () => {
  it('preview copies the materialised, still-current assignments (Regular + compatible Extras) and writes NOTHING', async () => {
    state.sourceRows = [row(EMP_A, 4, 'Regular', '08:00', '16:00'), row(EMP_A, 4, 'Extras', '18:00', '21:00'), row(EMP_B, 5, 'Libre', null, null)];
    const out = await copy();
    expect(out.candidates.map((c) => `${c.shiftType}@${c.targetDate}`).sort()).toEqual([`Extras@${tgt(4)}`, `Libre@${tgt(5)}`, `Regular@${tgt(4)}`].sort());
    expect(out.skipped).toEqual([]); // no false exclusion for Regular + Extras
    expect(out.created).toBe(0);
    expect(state.transactions).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
    expect(out.source).toMatchObject({ versionId: SRC_VERSION, periodStart: SOURCE_START });
    expect(out.target).toMatchObject({ versionId: VERSION, periodStart: TARGET_START });
  });

  it('the day-off that was REPLACED by Extras (or any assignment no longer current) is not carried over', async () => {
    state.sourceRows = [row(EMP_A, 5, 'Libre', null, null, { still_current: false }), row(EMP_A, 6, 'Regular', '08:00', '16:00')];
    const out = await copy();
    expect(out.candidates.map((c) => c.shiftType)).toEqual(['Regular']);
    expect(out.skipped).toEqual([expect.objectContaining({ reason: 'STALE_SOURCE', shiftType: 'Libre' })]);
  });

  it('approved/planned vacations are not copied as ordinary shifts', async () => {
    state.sourceRows = [row(EMP_A, 5, 'Vacaciones', null, null), row(EMP_A, 6, 'Regular', '08:00', '16:00')];
    const out = await copy();
    expect(out.skipped.map((s) => s.reason)).toEqual(['SOURCE_ABSENCE']);
    expect(out.candidates).toHaveLength(1);
  });

  it('only a PUBLISHED source counts: with no published version of that week the request is a 404', async () => {
    state.source = false;
    const error = await reject(copy());
    expect(error).toMatchObject({ status: 404, code: 'SOURCE_NOT_PUBLISHED' });
  });
});

describe('copy-week: what is skipped, and why', () => {
  it('past days, inactive employees and approved-vacation days of the TARGET week', async () => {
    state.employees = [{ id: EMP_A, name: 'Ana', area_id: AREA, status: 'active' }, { id: EMP_B, name: 'Beto', area_id: AREA, status: 'inactive' }];
    state.protectedDays = [{ employee_id: EMP_A, date: tgt(5) }];
    state.sourceRows = [
      row(EMP_A, 0, 'Regular', '08:00', '16:00'), // target = 2 days ago -> past
      row(EMP_A, 5, 'Regular', '08:00', '16:00'), // vacation on that target day
      row(EMP_B, 6, 'Regular', '08:00', '16:00'), // inactive
      row(EMP_A, 6, 'Regular', '08:00', '16:00'), // fine
    ];
    const out = await copy();
    expect(out.skipped.map((s) => s.reason).sort()).toEqual(['INACTIVE_EMPLOYEE', 'PAST_DATE', 'PROTECTED_ABSENCE_DAY']);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].targetDate).toBe(tgt(6));
  });

  it('an employee outside the actor’s scope is reported WITHOUT any identifying data', async () => {
    state.sourceRows = [row(EMP_OTHER_AREA, 6, 'Regular', '08:00', '16:00')];
    const out = await copy();
    expect(out.candidates).toEqual([]);
    expect(out.skipped).toEqual([{ reason: 'OUT_OF_SCOPE', sourceAssignmentId: null, targetDate: tgt(6), employeeId: null, employeeName: null, shiftType: null, startTime: null, endTime: null }]);
  });

  it('NEVER overwrites: an identical row is ALREADY_ASSIGNED; a different row on the same hours or a whole-day record is a conflict', async () => {
    state.existing = [
      { id: 'e1', employee_id: EMP_A, date: tgt(4), start_time: '08:00', end_time: '16:00', location: 'Regular', shift_type: 'Regular', counts_as_work: true },
      { id: 'e2', employee_id: EMP_B, date: tgt(5), start_time: '10:00', end_time: '18:00', location: 'Regular', shift_type: 'Regular', counts_as_work: true },
      { id: 'e3', employee_id: EMP_A, date: tgt(6), start_time: null, end_time: null, location: 'Libre', shift_type: 'Libre', counts_as_work: false },
    ];
    state.sourceRows = [
      row(EMP_A, 4, 'Regular', '08:00', '16:00'),
      row(EMP_B, 5, 'Regular', '08:00', '16:00'),
      row(EMP_A, 6, 'Regular', '08:00', '16:00'),
    ];
    const out = await copy();
    expect(out.candidates).toEqual([]);
    expect(out.skipped.map((s) => s.reason)).toEqual(['ALREADY_ASSIGNED', 'OVERLAP', 'OVERLAP']);
  });

  it('the minimum rest is enforced inside the week and ACROSS the week boundary (what the employee really works the day after)', async () => {
    // The employee already works 06:00-14:00 on the first day of the NEXT week.
    state.boundary = [{ employee_id: EMP_A, date: shiftOperationalDate(TARGET_END, 1), start_time: '06:00', end_time: '14:00', shift_type: 'Regular', counts_as_work: true }];
    state.sourceRows = [
      row(EMP_A, 6, 'Regular', '15:00', '23:00'), // ends 7h before that shift -> across the boundary
      row(EMP_B, 3, 'Regular', '22:00', '06:00'), // night
      row(EMP_B, 4, 'Regular', '08:00', '16:00'), // 2h after the night -> inside the week
      row(EMP_A, 5, 'Regular', '09:00', '17:00'), // fine
    ];
    const out = await copy();
    expect(out.skipped.map((s) => `${s.reason}@${s.targetDate}`).sort()).toEqual([`REST_RULE_VIOLATION@${tgt(4)}`, `REST_RULE_VIOLATION@${tgt(6)}`].sort());
    expect(out.candidates.map((c) => `${c.employeeId === EMP_A ? 'A' : 'B'}@${c.targetDate}`).sort()).toEqual([`A@${tgt(5)}`, `B@${tgt(3)}`].sort());
  });
});

describe('copy-week: apply', () => {
  const futureRows = () => [row(EMP_A, 4, 'Regular', '08:00', '16:00'), row(EMP_A, 5, 'Regular', '08:00', '16:00')];

  it('locks the draft first, inserts only the accepted rows and audits the copy once', async () => {
    state.sourceRows = futureRows();
    const out = await copy({ mode: 'apply' });
    expect(out.created).toBe(2);
    expect(out.createdAssignmentIds).toHaveLength(2);
    expect(state.transactions).toHaveLength(1);
    expect(state.audit.map((e) => e.eventType)).toEqual(['ASSIGNMENT_CREATED']);
    expect(state.audit[0].metadata).toMatchObject({ operation: 'WEEK_COPIED', sourceVersionId: SRC_VERSION, created: 2 });
  });

  it('IDEMPOTENT: applying twice creates nothing the second time (and does not touch the database again)', async () => {
    state.sourceRows = futureRows();
    const first = await copy({ mode: 'apply' });
    const second = await copy({ mode: 'apply' });
    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(second.skipped.map((s) => s.reason)).toEqual(['ALREADY_ASSIGNED', 'ALREADY_ASSIGNED']);
    expect(state.transactions).toHaveLength(1);
    expect(state.audit).toHaveLength(1);
  });

  it('a draft that was published meanwhile is a 409 and nothing is created', async () => {
    state.sourceRows = futureRows();
    const sql = makeSql();
    const original = sql.transaction;
    sql.transaction = async (build) => { const [lock] = await original(build); state.target.status = 'PUBLISHED'; return [lock, []]; };
    const error = await reject(copyWeekIntoDraft(sql, ctx(), SCHEDULE, VERSION, { sourceWeekStart: SOURCE_START, mode: 'apply' }));
    expect(error).toMatchObject({ status: 409, code: 'VERSION_NOT_EDITABLE' });
    expect(state.audit).toHaveLength(0);
  });
});

describe('copy-week: contract and authorisation', () => {
  it('copies ONLY into a draft', async () => {
    state.target.status = 'PUBLISHED';
    expect(await reject(copy())).toMatchObject({ status: 409, code: 'VERSION_NOT_EDITABLE' });
  });
  it.each([
    ['a missing sourceWeekStart', { sourceWeekStart: '' }],
    ['a malformed sourceWeekStart', { sourceWeekStart: '10/11/2026' }],
    ['the target week itself as source', { sourceWeekStart: TARGET_START }],
    ['an unknown mode', { mode: 'overwrite' }],
  ])('rejects %s with 400 and writes nothing', async (_label, patch) => {
    expect((await reject(copy(patch))).status).toBe(400);
    expect(state.transactions).toHaveLength(0);
  });
  it('EMPLOYEE cannot copy weeks', async () => {
    expect((await reject(copy({}, ctx('EMPLOYEE')))).status).toBe(403);
  });
  it('a PLANNER scoped to another area cannot copy into this schedule', async () => {
    const planner = { ...ctx('PLANNER'), scopedAreaId: OTHER_AREA, plannerScopeType: 'AREA' };
    expect((await reject(copy({}, planner))).status).toBe(403);
    expect(state.transactions).toHaveLength(0);
  });
  it('the source is read from the same organisation and area as the target (no cross-tenant source)', async () => {
    state.sourceRows = [row(EMP_A, 4, 'Regular', '08:00', '16:00')];
    await copy();
    const sourceQuery = state.queries.find((q) => q.includes('FROM schedules s JOIN schedule_versions sv'));
    expect(sourceQuery).toContain('s.organization_id =');
    expect(sourceQuery).toContain('s.area_id IS NOT DISTINCT FROM');
  });
});
