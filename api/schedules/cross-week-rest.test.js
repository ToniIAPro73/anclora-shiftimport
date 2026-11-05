import { describe, expect, it } from 'vitest';
import {
  MINIMUM_REST_HOURS,
  createAssignment,
  publishImportedPairsTx,
  publishScheduleVersionTx,
  updateAssignment,
  violatesCrossWeekRest,
} from '../_lib/scheduling.js';
import { RETENTION, WEEK_MODE, planAutoPublication } from '../_lib/import-auto-publish-planner.js';

// G7 — the minimum rest also binds the first/last day of a planning week against the ADJACENT week (EFFECTIVE calendar).
const ORG = '11111111-1111-4111-8111-111111111111';
const AREA = '22222222-2222-4222-8222-222222222222';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE = '66666666-6666-4666-8666-666666666666';
const planner = { user: { id: '77777777-7777-4777-8777-777777777777' }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null };

/** `boundary` = rows the shifts table returns for the day before / after the period. */
function makeSql({ periodStart, periodEnd, boundary = [], inWeek = [] }) {
  const calls = { boundaryQueries: 0 };
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT sv.id AS version_id')) {
      return Promise.resolve([{ version_id: VERSION, schedule_id: SCHEDULE, status: 'DRAFT', organization_id: ORG, area_id: AREA, period_start: periodStart, period_end: periodEnd }]);
    }
    if (text.startsWith('SELECT sa.id')) {
      return Promise.resolve([{ id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: EMPLOYEE, date: periodStart, start_time: '10:00', end_time: '14:00', location: null, shift_type: 'Regular', counts_as_work: true }]);
    }
    if (text.startsWith('SELECT id, area_id, status')) return Promise.resolve([{ id: EMPLOYEE, area_id: AREA, status: 'active' }]);
    if (text.startsWith('SELECT employee_id, date, NULLIF(btrim(start_time)')) { calls.boundaryQueries += 1; return Promise.resolve(boundary); }
    if (text.startsWith('SELECT id, date, start_time, end_time')) return Promise.resolve(inWeek);
    if (text.startsWith('INSERT INTO shift_assignments')) return Promise.resolve([{ id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: EMPLOYEE, date: values[1], start_time: values[2], end_time: values[3], shift_type: values[5], counts_as_work: values[6] }]);
    if (text.startsWith('UPDATE shift_assignments')) return Promise.resolve([{ id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: EMPLOYEE, date: values[1], start_time: values[2], end_time: values[3], shift_type: 'Regular', counts_as_work: true }]);
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}

const prev = (over) => ({ employee_id: EMPLOYEE, date: '2099-10-11', start_time: '15:00', end_time: '23:30', shift_type: 'Regular', counts_as_work: true, ...over });
const WEEK = { periodStart: '2099-10-12', periodEnd: '2099-10-18' }; // Monday..Sunday

describe('violatesCrossWeekRest — pure boundary', () => {
  const a = (date, start, end) => ({ date, start_time: start, end_time: end });
  it('the minimum is 12 h (ET art. 34.3) and exactly 12:00 is valid', () => {
    expect(MINIMUM_REST_HOURS).toBe(12);
    expect(violatesCrossWeekRest(a('2099-10-11', '15:00', '23:30'), a('2099-10-12', '11:30', '14:00'))).toBe(false); // exactly 12:00
    expect(violatesCrossWeekRest(a('2099-10-11', '15:00', '23:30'), a('2099-10-12', '11:29', '14:00'))).toBe(true); // 11:59
  });
  it('Sunday 23:30 -> Monday 05:00 (5 h 30) violates, in both argument orders', () => {
    expect(violatesCrossWeekRest(a('2099-10-11', '15:00', '23:30'), a('2099-10-12', '05:00', '13:00'))).toBe(true);
    expect(violatesCrossWeekRest(a('2099-10-12', '05:00', '13:00'), a('2099-10-11', '15:00', '23:30'))).toBe(true);
  });
  it('an overnight shift of the previous week that runs into the next week is measured from its real end', () => {
    expect(violatesCrossWeekRest(a('2099-10-11', '22:00', '06:00'), a('2099-10-12', '14:00', '20:00'))).toBe(true); // 8 h
    expect(violatesCrossWeekRest(a('2099-10-11', '22:00', '06:00'), a('2099-10-12', '17:00', '20:00'))).toBe(true); // 11 h: no longer enough
    expect(violatesCrossWeekRest(a('2099-10-11', '22:00', '06:00'), a('2099-10-12', '18:00', '20:00'))).toBe(false); // exactly 12 h
    expect(violatesCrossWeekRest(a('2099-10-11', '22:00', '06:00'), a('2099-10-12', '05:00', '09:00'))).toBe(true); // overlap
  });
  it('year boundary behaves like any other', () => {
    expect(violatesCrossWeekRest(a('2099-12-31', '14:00', '23:30'), a('2100-01-01', '05:00', '13:00'))).toBe(true);
    expect(violatesCrossWeekRest(a('2099-12-31', '14:00', '23:30'), a('2100-01-01', '11:30', '13:00'))).toBe(false);
  });
  it('rows without times never violate', () => {
    expect(violatesCrossWeekRest({ date: '2099-10-11' }, a('2099-10-12', '05:00', '13:00'))).toBe(false);
  });
});

describe('createAssignment / updateAssignment — rest against the adjacent week', () => {
  const create = (sql, input, week = WEEK) => createAssignment(sql, planner, SCHEDULE, VERSION, { employeeId: EMPLOYEE, date: week.periodStart, ...input });

  it('rejects Monday 05:00 after a Sunday that ends 23:30 (API 422 REST_RULE_VIOLATION)', async () => {
    const sql = makeSql({ ...WEEK, boundary: [prev()] });
    await expect(create(sql, { startTime: '05:00', endTime: '13:00' })).rejects.toMatchObject({ status: 422, code: 'REST_RULE_VIOLATION', minimumRestHours: 12, crossWeek: true });
  });
  it('accepts exactly 12 h and rejects 11 h 59', async () => {
    const ok = await create(makeSql({ ...WEEK, boundary: [prev()] }), { startTime: '11:30', endTime: '14:00' });
    expect(ok.startTime).toBe('11:30');
    await expect(create(makeSql({ ...WEEK, boundary: [prev()] }), { startTime: '11:29', endTime: '14:00' })).rejects.toMatchObject({ code: 'REST_RULE_VIOLATION' });
  });
  it('also binds the LAST day of the week against the first day of the next one', async () => {
    const next = { employee_id: EMPLOYEE, date: '2099-10-19', start_time: '05:00', end_time: '13:00', shift_type: 'Regular', counts_as_work: true };
    await expect(createAssignment(makeSql({ ...WEEK, boundary: [next] }), planner, SCHEDULE, VERSION, { employeeId: EMPLOYEE, date: WEEK.periodEnd, startTime: '15:00', endTime: '23:30' })).rejects.toMatchObject({ code: 'REST_RULE_VIOLATION' });
    const ok = await createAssignment(makeSql({ ...WEEK, boundary: [next] }), planner, SCHEDULE, VERSION, { employeeId: EMPLOYEE, date: WEEK.periodEnd, startTime: '12:00', endTime: '17:00' });
    expect(ok.endTime).toBe('17:00'); // 12 h exactly (17:00 -> 05:00)
  });
  it('a night shift of the previous week is measured to its end; overlap with it is rejected too', async () => {
    const night = prev({ start_time: '22:00', end_time: '06:00' });
    await expect(create(makeSql({ ...WEEK, boundary: [night] }), { startTime: '14:00', endTime: '20:00' })).rejects.toMatchObject({ code: 'REST_RULE_VIOLATION' });
    await expect(create(makeSql({ ...WEEK, boundary: [night] }), { startTime: '05:00', endTime: '09:00' })).rejects.toMatchObject({ code: 'REST_RULE_VIOLATION' });
    expect((await create(makeSql({ ...WEEK, boundary: [night] }), { startTime: '18:00', endTime: '20:00' })).startTime).toBe('18:00');
  });
  it('year boundary: Dec 31 -> Jan 1', async () => {
    const week = { periodStart: '2100-01-01', periodEnd: '2100-01-07' };
    const dec31 = { employee_id: EMPLOYEE, date: '2099-12-31', start_time: '14:00', end_time: '23:30', shift_type: 'Regular', counts_as_work: true };
    await expect(create(makeSql({ ...week, boundary: [dec31] }), { startTime: '05:00', endTime: '13:00' }, week)).rejects.toMatchObject({ code: 'REST_RULE_VIOLATION' });
    expect((await create(makeSql({ ...week, boundary: [dec31] }), { startTime: '11:30', endTime: '13:00' }, week)).startTime).toBe('11:30');
  });
  it('DST change: the model is wall-clock in both directions (documented limit, same as inside a week)', async () => {
    // Sunday 2027-03-28 is the spring-forward night in Spain; the rule keeps measuring the clock times the plan shows.
    const week = { periodStart: '2027-03-29', periodEnd: '2027-04-04' };
    const sunday = { employee_id: EMPLOYEE, date: '2027-03-28', start_time: '22:00', end_time: '06:00', shift_type: 'Regular', counts_as_work: true };
    expect((await create(makeSql({ ...week, boundary: [sunday] }), { startTime: '18:00', endTime: '20:00' }, week)).startTime).toBe('18:00');
    await expect(create(makeSql({ ...week, boundary: [sunday] }), { startTime: '17:59', endTime: '20:00' }, week)).rejects.toMatchObject({ code: 'REST_RULE_VIOLATION' });
  });
  it('absences, whole-day types and rows without times in the adjacent week never block', async () => {
    const boundary = [prev({ shift_type: 'Vacaciones' }), prev({ start_time: null, end_time: null, shift_type: 'Libre' }), prev({ counts_as_work: false })];
    expect((await create(makeSql({ ...WEEK, boundary }), { startTime: '05:00', endTime: '13:00' })).startTime).toBe('05:00');
  });
  it('inside a week the same 12 h applies: exactly 12:00 is valid, 11:59 is not (single threshold for both rules)', async () => {
    const inWeek = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', date: '2099-10-13', start_time: '09:00', end_time: '17:00' }];
    const mid = { employeeId: EMPLOYEE, date: '2099-10-14' };
    expect((await createAssignment(makeSql({ ...WEEK, inWeek }), planner, SCHEDULE, VERSION, { ...mid, startTime: '05:00', endTime: '09:00' })).startTime).toBe('05:00');
    await expect(createAssignment(makeSql({ ...WEEK, inWeek }), planner, SCHEDULE, VERSION, { ...mid, startTime: '04:59', endTime: '09:00' })).rejects.toMatchObject({ code: 'REST_RULE_VIOLATION', minimumRestHours: 12 });
  });
  it('middle days of the week never query the adjacent week (no extra cost, no behaviour change)', async () => {
    const sql = makeSql({ ...WEEK, boundary: [prev()] });
    await createAssignment(sql, planner, SCHEDULE, VERSION, { employeeId: EMPLOYEE, date: '2099-10-14', startTime: '05:00', endTime: '13:00' });
    expect(sql.calls.boundaryQueries).toBe(0);
  });
  it('editing an assignment applies the same rule (UI and API share this path)', async () => {
    await expect(updateAssignment(makeSql({ ...WEEK, boundary: [prev()] }), planner, SCHEDULE, VERSION, ASSIGNMENT, { startTime: '05:00', endTime: '13:00' })).rejects.toMatchObject({ status: 422, code: 'REST_RULE_VIOLATION' });
    const ok = await updateAssignment(makeSql({ ...WEEK, boundary: [prev()] }), planner, SCHEDULE, VERSION, ASSIGNMENT, { startTime: '11:30', endTime: '14:00' });
    expect(ok.startTime).toBe('11:30');
  });
});

describe('auto-publication planner — rest against the adjacent week', () => {
  const day = (date, rows) => ({ employeeId: 'e1', date, outcome: 'NEW', rows });
  const early = [{ startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true }];
  const plan = (over) => planAutoPublication({ periodStart: '2026-11-02', areaId: null, fileDays: [], ...over });
  const sundayLate = { employeeId: 'e1', date: '2026-11-01', start_time: '15:00', end_time: '23:30', shift_type: 'Regular', counts_as_work: true };

  it('retains only the offending pair with REST_RULE_VIOLATION; the rest of the week is still published', () => {
    const r = plan({ fileDays: [day('2026-11-02', early), day('2026-11-04', early)], boundaryAssignments: [sundayLate] });
    expect(r.retainPairs).toEqual([{ employeeId: 'e1', date: '2026-11-02', reason: RETENTION.REST_RULE_VIOLATION }]);
    expect(r.publishPairs).toEqual([{ employeeId: 'e1', date: '2026-11-04' }]);
    expect(r.mode).toBe(WEEK_MODE.SPLIT);
  });
  it('exactly 12 h is published', () => {
    const r = plan({ fileDays: [day('2026-11-02', [{ startTime: '11:30', endTime: '14:00', shiftType: 'Regular', countsAsWork: true }])], boundaryAssignments: [sundayLate] });
    expect(r.mode).toBe(WEEK_MODE.PUBLISH);
  });
  it('without boundary context the behaviour is unchanged', () => {
    expect(plan({ fileDays: [day('2026-11-02', early)] }).mode).toBe(WEEK_MODE.PUBLISH);
  });
});

describe('publication SQL gates include the adjacent week (same interval as the in-week rule, both interpolating MINIMUM_REST_HOURS)', () => {
  const capture = (fn) => {
    const queries = [];
    const txn = (strings) => { queries.push(strings.join(' ? ').replace(/\s+/g, ' ')); return Promise.resolve([]); };
    fn(txn);
    return queries[0];
  };
  const assertGate = (text) => {
    expect(text).toContain('s.period_start, s.period_end');
    expect(text).toContain('boundary_intervals AS MATERIALIZED');
    expect(text).toContain("sh.effective_state = 'EFFECTIVE'");
    expect(text).toContain('sh.date = t.period_start - 1 OR sh.date = t.period_end + 1');
    expect(text).toMatch(/boundary_rest_conflicts AS \(.*INTERVAL '1 hour'/);
    expect(text).toMatch(/FROM boundary_rest_conflicts/);
  };
  it('publishScheduleVersionTx', () => {
    assertGate(capture((txn) => publishScheduleVersionTx(txn, planner, SCHEDULE, VERSION)));
  });
  it('publishImportedPairsTx', () => {
    assertGate(capture((txn) => publishImportedPairsTx(txn, planner, {
      scheduleId: SCHEDULE, versionId: VERSION, pairs: [{ employeeId: EMPLOYEE, date: '2099-10-12' }],
      importRef: { employeeId: EMPLOYEE, fileFingerprint: 'f', contextFingerprint: 'c' },
    })));
  });
});
