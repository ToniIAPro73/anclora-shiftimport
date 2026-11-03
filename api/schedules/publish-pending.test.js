import { beforeEach, describe, expect, it } from 'vitest';
import { PUBLISH_PENDING_MAX, publishPendingVersions } from '../_lib/scheduling.js';
import { getOperationalDate, shiftOperationalDate } from '../_lib/operational-date.js';

/**
 * F4-M03 / OD-F4-02 — publish up to 12 pending weeks. Each version goes through the SAME publication as the single button; the fake
 * returns, per version, what the publishing statement would answer. What is asserted here: eligibility, per-week results, that a bad
 * week neither blocks nor is hidden by the good ones, scope, past dates and that a preview never publishes.
 */
const ORG = '11111111-1111-4111-8111-111111111111';
const AREA = '22222222-2222-4222-8222-222222222222';
const OTHER_AREA = '33333333-3333-4333-8333-333333333333';
const EMP = '44444444-4444-4444-8444-444444444444';
const today = getOperationalDate();
const uuid = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const sched = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`;

let state;
const week = (n, over = {}) => ({
  scheduleId: sched(n), areaId: AREA, status: 'DRAFT', periodStart: shiftOperationalDate(today, 7 * n), periodEnd: shiftOperationalDate(today, 7 * n + 6),
  total: 3, past: 0,
  outcome: { found: true, current_status: 'DRAFT', error_code: null, published_at: '2026-11-03T10:00:00Z', created_shift_count: 3, excluded_count: 0, excluded_assignments: [] },
  ...over,
});

function makeSql() {
  const text = (strings) => strings.join(' ').replace(/\s+/g, ' ').trim();
  const sql = (strings, ...values) => {
    const t = text(strings);
    if (t.includes('FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id WHERE sv.id')) {
      const v = state.versions[values[0]];
      return Promise.resolve(v ? [{ schedule_id: v.scheduleId, status: v.status, period_start: v.periodStart, period_end: v.periodEnd }] : []);
    }
    if (t.startsWith('SELECT area_id FROM schedules')) {
      const v = Object.values(state.versions).find((item) => item.scheduleId === values[0]);
      return Promise.resolve(v ? [{ area_id: v.areaId }] : []);
    }
    if (t.includes('COUNT(*)::integer AS total')) {
      const v = state.versions[values[1]];
      return Promise.resolve([{ total: v.total, past: v.past }]);
    }
    state.notifications.push(t);
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => {
    const txn = (strings, ...values) => ({ text: text(strings), values });
    const [stmt] = build(txn);
    const versionId = stmt.values.find((value) => state.versions[value]);
    state.statements.push({ versionId, dryRun: stmt.values.includes(true), values: stmt.values, text: stmt.text });
    return [[state.versions[versionId].outcome]];
  };
  return sql;
}
const ctx = (over = {}) => ({ user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, organizationId: ORG, role: 'ADMIN', employeeId: null, ...over });
const run = (input, c = ctx()) => publishPendingVersions(makeSql(), c, input);
const reject = (promise) => promise.then(() => { throw new Error('expected a rejection'); }, (error) => error);

beforeEach(() => { state = { versions: {}, statements: [], notifications: [] }; });

describe('publish-pending: input contract', () => {
  it.each([
    ['no body', {}],
    ['an empty list', { versionIds: [] }],
    ['a non-array', { versionIds: uuid(1) }],
    ['a non-string id', { versionIds: [1] }],
    ['a malformed id', { versionIds: ['not-a-uuid'] }],
    ['more than 12 ids', { versionIds: Array.from({ length: PUBLISH_PENDING_MAX + 1 }, (_, i) => uuid(i + 1)) }],
    ['an unknown mode', { versionIds: [uuid(1)], mode: 'force' }],
  ])('rejects %s with 400 before touching anything', async (_label, input) => {
    expect((await reject(run(input))).status).toBe(400);
    expect(state.statements).toHaveLength(0);
  });

  it('rejects duplicated ids (400 DUPLICATE_VERSION_IDS)', async () => {
    expect(await reject(run({ versionIds: [uuid(1), uuid(1)] }))).toMatchObject({ status: 400, code: 'DUPLICATE_VERSION_IDS' });
  });

  it('EMPLOYEE cannot publish weeks', async () => {
    expect((await reject(run({ versionIds: [uuid(1)] }, ctx({ role: 'EMPLOYEE' })))).status).toBe(403);
  });
});

describe('publish-pending: per-week results', () => {
  it('a valid batch of two weeks publishes each through the canonical statement and keeps the order', async () => {
    state.versions = { [uuid(1)]: week(1), [uuid(2)]: week(2, { outcome: { ...week(2).outcome, created_shift_count: 5, excluded_count: 1, excluded_assignments: [{ assignmentId: 'a', employeeId: EMP, reason: 'STALE_AGAINST_CALENDAR' }] } }) };
    const out = await run({ versionIds: [uuid(1), uuid(2)] });
    expect(out.results.map((r) => [r.versionId, r.ok, r.createdShiftCount])).toEqual([[uuid(1), true, 3], [uuid(2), true, 5]]);
    expect(out.results[1].excluded).toEqual([{ assignmentId: 'a', employeeId: EMP, reason: 'STALE_AGAINST_CALENDAR' }]);
    expect(out.summary).toEqual({ requested: 2, ok: 2, failed: 0 });
    expect(state.statements).toHaveLength(2);
    expect(state.statements.every((s) => s.dryRun === false)).toBe(true);
  });

  it('PARTIAL: an invalid week is reported with its own code and the valid ones are still published', async () => {
    state.versions = {
      [uuid(1)]: week(1),
      [uuid(2)]: week(2, { outcome: { found: true, current_status: 'DRAFT', error_code: 'OVERLAP', created_shift_count: 0, excluded_count: 0, excluded_assignments: [] } }),
      [uuid(3)]: week(3),
    };
    const out = await run({ versionIds: [uuid(1), uuid(2), uuid(3)] });
    expect(out.results.map((r) => [r.ok, r.code ?? null])).toEqual([[true, null], [false, 'OVERLAP'], [true, null]]);
    expect(out.results[1].status).toBe(422);
    expect(out.summary).toEqual({ requested: 3, ok: 2, failed: 1 });
  });

  it('RETRY is safe: a week already published answers VERSION_NOT_EDITABLE and nothing is published again', async () => {
    state.versions = { [uuid(1)]: week(1, { status: 'PUBLISHED' }), [uuid(2)]: week(2) };
    const out = await run({ versionIds: [uuid(1), uuid(2)] });
    expect(out.results[0]).toMatchObject({ ok: false, status: 409, code: 'VERSION_NOT_EDITABLE' });
    expect(out.results[1].ok).toBe(true);
    expect(state.statements.map((s) => s.versionId)).toEqual([uuid(2)]);
  });

  it('an unknown / other-tenant version is a plain 404 with no data', async () => {
    const out = await run({ versionIds: [uuid(9)] });
    expect(out.results).toEqual([{ versionId: uuid(9), ok: false, status: 404, code: 'NOT_FOUND', excluded: [] }]);
    expect(state.statements).toHaveLength(0);
  });

  it('a failure of one week that is not a controlled error is reported without internals and does not stop the rest', async () => {
    state.versions = { [uuid(1)]: week(1), [uuid(2)]: week(2) };
    const sql = makeSql();
    const original = sql.transaction;
    let calls = 0;
    sql.transaction = async (build) => { calls += 1; if (calls === 1) throw new Error('connection reset db.internal:5432'); return original(build); };
    const out = await publishPendingVersions(sql, ctx(), { versionIds: [uuid(1), uuid(2)] });
    expect(out.results[0]).toMatchObject({ ok: false, status: 500, code: 'ERROR' });
    expect(JSON.stringify(out)).not.toContain('db.internal');
    expect(out.results[1].ok).toBe(true);
  });
});

describe('publish-pending: dates that are already past', () => {
  it('a week that includes past assignments is NOT eligible (nothing is published or modified) and the others continue', async () => {
    state.versions = { [uuid(1)]: week(1, { past: 2 }), [uuid(2)]: week(2) };
    const out = await run({ versionIds: [uuid(1), uuid(2)] });
    expect(out.results[0]).toMatchObject({ ok: false, status: 422, code: 'PAST_DATES_AFFECTED', pastAssignmentCount: 2 });
    expect(out.results[1].ok).toBe(true);
    expect(state.statements.map((s) => s.versionId)).toEqual([uuid(2)]);
  });

  it('a week that already ended is not eligible either', async () => {
    state.versions = { [uuid(1)]: week(1, { periodStart: shiftOperationalDate(today, -14), periodEnd: shiftOperationalDate(today, -8) }) };
    const out = await run({ versionIds: [uuid(1)] });
    expect(out.results[0]).toMatchObject({ ok: false, code: 'PAST_DATES_AFFECTED' });
    expect(state.statements).toHaveLength(0);
  });

  it('a week under way whose assignments are all today or later IS eligible', async () => {
    state.versions = { [uuid(1)]: week(1, { periodStart: shiftOperationalDate(today, -3), periodEnd: shiftOperationalDate(today, 3), past: 0 }) };
    expect((await run({ versionIds: [uuid(1)] })).results[0].ok).toBe(true);
  });
});

describe('publish-pending: scope (every employee the publication touches)', () => {
  const planner = (over) => ctx({ role: 'PLANNER', ...over });

  it('an ORGANIZATION-wide actor is not restricted (the statement receives mode NONE)', async () => {
    state.versions = { [uuid(1)]: week(1) };
    await run({ versionIds: [uuid(1)] });
    expect(state.statements[0].values).toContain('NONE');
  });

  it('a PLANNER scoped to EMPLOYEES: the publishing statement carries the allowed employees and refuses a version with anyone else', async () => {
    state.versions = { [uuid(1)]: week(1, { outcome: { found: true, current_status: 'DRAFT', error_code: 'SCOPE_FORBIDDEN', created_shift_count: 0, excluded_count: 0, excluded_assignments: [] } }) };
    const out = await run({ versionIds: [uuid(1)] }, planner({ plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [EMP] }));
    expect(state.statements[0].values).toEqual(expect.arrayContaining(['EMPLOYEES', [EMP]]));
    expect(state.statements[0].text).toContain("WHEN 'EMPLOYEES'");
    expect(out.results[0]).toEqual({ versionId: uuid(1), ok: false, status: 403, code: 'SCOPE_FORBIDDEN', excluded: [] });
  });

  it('a PLANNER scoped to AREAS cannot reach a schedule of another area: refused before any publication, with no dates leaked', async () => {
    state.versions = { [uuid(1)]: week(1, { areaId: OTHER_AREA }) };
    const out = await run({ versionIds: [uuid(1)] }, planner({ plannerScopeType: 'AREAS', scopedAreaIds: [AREA] }));
    expect(out.results[0]).toEqual({ versionId: uuid(1), ok: false, status: 403, code: 'SCOPE_FORBIDDEN', excluded: [] });
    expect(state.statements).toHaveLength(0);
  });

  it('a PLANNER scoped to AREAS publishes a schedule of its own area, enforcing the area on every employee', async () => {
    state.versions = { [uuid(1)]: week(1) };
    const out = await run({ versionIds: [uuid(1)] }, planner({ plannerScopeType: 'AREAS', scopedAreaIds: [AREA] }));
    expect(out.results[0].ok).toBe(true);
    expect(state.statements[0].values).toEqual(expect.arrayContaining(['AREAS', [AREA]]));
  });

  it('the same guard protects the SINGLE publication (not only the batch)', async () => {
    const { publishScheduleVersion } = await import('../_lib/scheduling.js');
    state.versions = { [uuid(1)]: week(1, { outcome: { found: true, current_status: 'DRAFT', error_code: 'SCOPE_FORBIDDEN', created_shift_count: 0, excluded_count: 0, excluded_assignments: [] } }) };
    const error = await reject(publishScheduleVersion(makeSql(), planner({ plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [EMP] }), sched(1), uuid(1)));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(error.message).not.toContain(EMP);
  });
});

describe('publish-pending: preview', () => {
  it('only checks: runs the validations as a dry run, publishes nothing and notifies nobody', async () => {
    state.versions = { [uuid(1)]: week(1, { outcome: { found: true, current_status: 'DRAFT', error_code: null, created_shift_count: 0, excluded_count: 2, excluded_assignments: [{ assignmentId: 'a', employeeId: EMP, reason: 'STALE_AGAINST_CALENDAR' }, { assignmentId: 'b', employeeId: EMP, reason: 'PROTECTED_ABSENCE' }] } }) };
    const out = await run({ versionIds: [uuid(1)], mode: 'preview' });
    expect(state.statements.every((s) => s.dryRun === true)).toBe(true);
    expect(state.notifications).toHaveLength(0);
    expect(out.results[0]).toMatchObject({ versionId: uuid(1), ok: true, assignmentCount: 3, excludedCount: 2, excludedByReason: { STALE_AGAINST_CALENDAR: 1, PROTECTED_ABSENCE: 1 } });
    expect(out.results[0].excluded).toEqual([]); // preview reports counts, not the employees
  });

  it('a preview reports the conflict a real publication would hit', async () => {
    state.versions = { [uuid(1)]: week(1, { outcome: { found: true, current_status: 'DRAFT', error_code: 'REST_RULE_VIOLATION', created_shift_count: 0, excluded_count: 0, excluded_assignments: [] } }) };
    const out = await run({ versionIds: [uuid(1)], mode: 'preview' });
    expect(out.results[0]).toMatchObject({ ok: false, status: 422, code: 'REST_RULE_VIOLATION' });
  });

  it('the dry run is a statement gated by dryRun: its text never lets the publication update run', async () => {
    state.versions = { [uuid(1)]: week(1) };
    await run({ versionIds: [uuid(1)], mode: 'preview' });
    expect(state.statements[0].text).toContain('AND NOT');
    expect(state.statements[0].values).toContain(true);
  });
});
