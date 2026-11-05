// G7 — real-PostgreSQL verification of the cross-week rest gate in BOTH publication statements.
// Runs ONLY against a LOCAL disposable database (AUTO_PUBLISH_DATABASE_URL=postgres://…@127.0.0.1:…); it refuses any non-local host.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTaggedSql, isLocalConnection } from '../../db/connection.mjs';
import { loadRestBoundaryShifts, publishImportedPairsTx, publishScheduleVersionTx } from './scheduling.js';

const url = process.env.AUTO_PUBLISH_DATABASE_URL ?? '';
if (url && !isLocalConnection(url)) throw new Error('AUTO_PUBLISH_DATABASE_URL must be a local database');

const sql = url ? createTaggedSql(url) : null;
const d = (offset) => new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10); // d(0) = Monday 2026-11-02

async function seed() {
  const org = randomUUID(); const user = randomUUID(); const e1 = randomUUID();
  const schedule = randomUUID(); const draft = randomUUID(); const importId = randomUUID();
  await sql`INSERT INTO organizations (id, name) VALUES (${org}, 'Synthetic G7 org')`;
  await sql`INSERT INTO users (id, email) VALUES (${user}, ${`g7-${user}@example.invalid`})`;
  await sql`INSERT INTO employees (id, organization_id, name, status) VALUES (${e1}, ${org}, 'Emp One', 'active')`;
  await sql`INSERT INTO schedules (id, organization_id, period_start, period_end, created_by_user_id) VALUES (${schedule}, ${org}, ${d(0)}, ${d(6)}, ${user})`;
  await sql`INSERT INTO imports (id, organization_id, employee_id, file_fingerprint, context_fingerprint, file_name) VALUES (${importId}, ${org}, ${e1}, 'ff', 'cf', 'synthetic.csv')`;
  await sql`INSERT INTO schedule_versions (id, schedule_id, version_number, status, created_by_user_id) VALUES (${draft}, ${schedule}, 1, 'DRAFT', ${user})`;
  return { org, user, e1, schedule, draft, ctx: { organizationId: org, user: { id: user }, role: 'OWNER' }, importRef: { employeeId: e1, fileFingerprint: 'ff', contextFingerprint: 'cf' } };
}
const neighbour = (s, date, start, end, type = 'Regular', state = 'EFFECTIVE', counts = true) =>
  sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance)
      VALUES (${s.org}, ${s.e1}, ${date}, ${start}, ${end}, 'IMP', ${type}, ${counts}, ${state}, 'SYSTEM')`;
const assign = (s, date, start, end) =>
  sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${s.draft}, ${s.e1}, ${date}, ${start}, ${end}, 'Regular', TRUE)`;
const publish = async (s) => (await sql.transaction((txn) => [publishScheduleVersionTx(txn, s.ctx, s.schedule, s.draft, { dryRun: true })]))[0][0];
const publishPairs = async (s, date) => (await sql.transaction((txn) => [publishImportedPairsTx(txn, s.ctx, { scheduleId: s.schedule, versionId: s.draft, pairs: [{ employeeId: s.e1, date }], importRef: s.importRef })]))[0][0];

describe.skipIf(!url)('cross-week rest gate against PostgreSQL', () => {
  afterAll(async () => { await sql.end(); });

  it('Sunday 23:30 (previous week) -> Monday 05:00 is blocked by BOTH statements with REST_RULE_VIOLATION', async () => {
    const s = await seed();
    await neighbour(s, d(-1), '15:00', '23:30');
    await assign(s, d(0), '05:00', '13:00');
    expect((await publish(s)).error_code).toBe('REST_RULE_VIOLATION');
    const r = await publishPairs(s, d(0));
    expect(r.error_code).toBe('REST_RULE_VIOLATION');
    expect((await sql`SELECT status FROM schedule_versions WHERE id = ${s.draft}`)[0].status).toBe('DRAFT'); // nothing published
  });

  it('exactly 12 h of rest publishes; 11 h 59 does not', async () => {
    const ok = await seed();
    await neighbour(ok, d(-1), '15:00', '23:30');
    await assign(ok, d(0), '11:30', '14:00');
    expect((await publish(ok)).error_code).toBeNull();
    expect((await publishPairs(ok, d(0))).error_code).toBeNull();
    const tight = await seed();
    await neighbour(tight, d(-1), '15:00', '23:30');
    await assign(tight, d(0), '11:29', '14:00');
    expect((await publish(tight)).error_code).toBe('REST_RULE_VIOLATION');
  });

  it('inside the week the same 12 h applies in both statements (exactly 12:00 valid, 11:59 not)', async () => {
    const ok = await seed();
    await assign(ok, d(1), '09:00', '17:00');
    await assign(ok, d(2), '05:00', '09:00');
    expect((await publish(ok)).error_code).toBeNull();
    expect((await publishPairs(ok, d(2))).error_code).toBeNull();
    const tight = await seed();
    await assign(tight, d(1), '09:00', '17:00');
    await assign(tight, d(2), '04:59', '09:00');
    expect((await publish(tight)).error_code).toBe('REST_RULE_VIOLATION');
    expect((await publishPairs(tight, d(2))).error_code).toBe('REST_RULE_VIOLATION');
  });

  it('binds the last day against the next week, and an overnight shift of the previous week is measured to its real end', async () => {
    const next = await seed();
    await neighbour(next, d(7), '05:00', '13:00');
    await assign(next, d(6), '15:00', '23:30');
    expect((await publish(next)).error_code).toBe('REST_RULE_VIOLATION');
    const night = await seed();
    await neighbour(night, d(-1), '22:00', '06:00');
    await assign(night, d(0), '14:00', '20:00');
    expect((await publish(night)).error_code).toBe('REST_RULE_VIOLATION');
    const exact = await seed();
    await neighbour(exact, d(-1), '22:00', '06:00');
    await assign(exact, d(0), '18:00', '20:00');
    expect((await publish(exact)).error_code).toBeNull();
  });

  it('absences, whole-day types, non-worked rows and SUPERSEDED shifts of the adjacent week never block', async () => {
    const s = await seed();
    await neighbour(s, d(-1), '15:00', '23:30', 'Vacaciones');
    await neighbour(s, d(-1), '15:00', '23:30', 'Regular', 'SUPERSEDED');
    await neighbour(s, d(-1), '15:00', '23:30', 'Regular', 'EFFECTIVE', false);
    await assign(s, d(0), '05:00', '13:00');
    expect((await publish(s)).error_code).toBeNull();
    expect(await loadRestBoundaryShifts(sql, { organizationId: s.org, employeeIds: [s.e1], periodStart: d(0), periodEnd: d(6) })).toEqual([]);
  });

  it('is scoped to the organization: another tenant\'s shifts never constrain the week', async () => {
    const a = await seed();
    const b = await seed();
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance)
              VALUES (${b.org}, ${a.e1}, ${d(-1)}, '15:00', '23:30', 'IMP', 'Regular', TRUE, 'EFFECTIVE', 'SYSTEM')`.catch(() => null);
    await assign(a, d(0), '05:00', '13:00');
    expect((await publish(a)).error_code).toBeNull();
  });

  it('year boundary: Dec 31 -> Jan 1 (week spanning two years)', async () => {
    const s = await seed();
    await sql`UPDATE schedules SET period_start = '2026-12-28', period_end = '2027-01-03' WHERE id = ${s.schedule}`;
    await neighbour(s, '2026-12-27', '14:00', '23:30');
    await assign(s, '2026-12-28', '05:00', '13:00');
    expect((await publish(s)).error_code).toBe('REST_RULE_VIOLATION');
    const next = await seed();
    await sql`UPDATE schedules SET period_start = '2026-12-28', period_end = '2027-01-03' WHERE id = ${next.schedule}`;
    await neighbour(next, '2027-01-04', '05:00', '13:00');
    await assign(next, '2027-01-03', '14:00', '23:30');
    expect((await publish(next)).error_code).toBe('REST_RULE_VIOLATION');
  });
});
