// Real-PostgreSQL verification of the auto-publication SQL. Runs ONLY against a LOCAL disposable database
// (AUTO_PUBLISH_DATABASE_URL=postgres://…@127.0.0.1:…); it refuses any non-local host so Neon is never touched.
// Every scenario seeds its own synthetic organization; the throwaway container is discarded afterwards (no cleanup code).
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTaggedSql, isLocalConnection } from '../../db/connection.mjs';
import { publishImportedPairsTx } from './scheduling.js';

const url = process.env.AUTO_PUBLISH_DATABASE_URL ?? '';
if (url && !isLocalConnection(url)) throw new Error('AUTO_PUBLISH_DATABASE_URL must be a local database');

const sql = url ? createTaggedSql(url) : null;
const d = (offset) => new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10);

async function seed(opts = {}) {
  const org = randomUUID(); const user = randomUUID(); const e1 = randomUUID(); const e2 = randomUUID();
  const schedule = randomUUID(); const base = randomUUID(); const draft = randomUUID(); const importId = randomUUID();
  await sql`INSERT INTO organizations (id, name) VALUES (${org}, 'Synthetic F1 org')`;
  await sql`INSERT INTO users (id, email) VALUES (${user}, ${`f1-${user}@example.invalid`})`;
  await sql`INSERT INTO employees (id, organization_id, name, status) VALUES (${e1}, ${org}, 'Emp One', 'active'), (${e2}, ${org}, 'Emp Two', 'active')`;
  await sql`INSERT INTO schedules (id, organization_id, period_start, period_end, created_by_user_id) VALUES (${schedule}, ${org}, ${d(0)}, ${d(6)}, ${user})`;
  await sql`INSERT INTO imports (id, organization_id, employee_id, file_fingerprint, context_fingerprint, file_name) VALUES (${importId}, ${org}, ${e1}, 'ff', 'cf', 'synthetic.csv')`;
  const ctx = { organizationId: org, user: { id: user }, role: 'OWNER' };
  const importRef = { employeeId: e1, fileFingerprint: 'ff', contextFingerprint: 'cf' };
  if (opts.base) {
    await sql`INSERT INTO schedule_versions (id, schedule_id, version_number, status, created_by_user_id, published_at) VALUES (${base}, ${schedule}, 1, 'PUBLISHED', ${user}, NOW())`;
    await sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${base}, ${e2}, ${d(0)}, '05:00', '13:00', 'Regular', TRUE)`;
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, schedule_version_id, shift_type, counts_as_work, effective_state, provenance, import_id)
              VALUES (${org}, ${e2}, ${d(0)}, '05:00', '13:00', 'schedule', ${base}, 'Regular', TRUE, 'EFFECTIVE', 'SCHEDULE_PUBLICATION', ${importId})`;
  }
  await sql`INSERT INTO schedule_versions (id, schedule_id, version_number, status, created_by_user_id) VALUES (${draft}, ${schedule}, ${opts.base ? 2 : 1}, 'DRAFT', ${user})`;
  return { org, user, e1, e2, schedule, base, draft, importId, ctx, importRef };
}
const assign = (version, employee, date, start, end, type = 'Regular', counts = true) =>
  sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${version}, ${employee}, ${date}, ${start}, ${end}, ${type}, ${counts})`;
const run = async (s, pairs) => (await sql.transaction((txn) => [publishImportedPairsTx(txn, s.ctx, { scheduleId: s.schedule, versionId: s.draft, pairs, importRef: s.importRef })]))[0][0];
const shiftsOf = (s) => sql`SELECT employee_id, TO_CHAR(date,'YYYY-MM-DD') AS date, effective_state, provenance, import_id, schedule_version_id FROM shifts WHERE organization_id = ${s.org} ORDER BY date, effective_state`;
const statusOf = async (id) => (await sql`SELECT status FROM schedule_versions WHERE id = ${id}`)[0].status;

describe.skipIf(!url)('publishImportedPairsTx against PostgreSQL', () => {
  afterAll(async () => { await sql.end(); });

  it('publishes only the import pairs, stamps import_id + SCHEDULE_PUBLICATION and supersedes the import-owned shift it replaces', async () => {
    const s = await seed({ base: true });
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance)
              VALUES (${s.org}, ${s.e1}, ${d(1)}, '06:00', '14:00', 'IMP', 'Regular', TRUE, 'EFFECTIVE', 'SYSTEM')`;
    await assign(s.draft, s.e2, d(0), '05:00', '13:00'); // carry-over copy of the base version: must NOT be materialized again
    await assign(s.draft, s.e1, d(1), '05:00', '13:00');
    await assign(s.draft, s.e1, d(2), '05:00', '13:00');
    const r = await run(s, [{ employeeId: s.e1, date: d(1) }, { employeeId: s.e1, date: d(2) }]);
    expect(r.error_code).toBeNull();
    expect(r.created_shift_count).toBe(2);
    expect(r.superseded_shift_count).toBe(1);
    expect(await statusOf(s.draft)).toBe('PUBLISHED');
    const rows = await shiftsOf(s);
    const effective = rows.filter((x) => x.effective_state === 'EFFECTIVE');
    const fromDraft = effective.filter((x) => x.schedule_version_id === s.draft);
    expect(fromDraft).toHaveLength(2);
    expect(effective.filter((x) => x.employee_id === s.e2).every((x) => x.schedule_version_id === s.base)).toBe(true); // carry-over untouched
    expect(fromDraft.every((x) => x.import_id === s.importId && x.provenance === 'SCHEDULE_PUBLICATION')).toBe(true);
    expect(rows.filter((x) => x.effective_state === 'SUPERSEDED')).toHaveLength(1);
  });

  it('fails closed on a manual EFFECTIVE shift of a pair: nothing is written', async () => {
    const s = await seed();
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance)
              VALUES (${s.org}, ${s.e1}, ${d(1)}, '06:00', '14:00', 'MAN', 'Regular', TRUE, 'EFFECTIVE', 'MANUAL_ADMIN_CHANGE')`;
    await assign(s.draft, s.e1, d(1), '05:00', '13:00');
    const r = await run(s, [{ employeeId: s.e1, date: d(1) }]);
    expect(r.error_code).toBe('PROTECTED_CURRENT');
    expect(await statusOf(s.draft)).toBe('DRAFT');
    expect((await shiftsOf(s)).map((x) => x.effective_state)).toEqual(['EFFECTIVE']);
  });

  it('fails closed on a NULL / unknown provenance (white list, not black list)', async () => {
    const s = await seed();
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state)
              VALUES (${s.org}, ${s.e1}, ${d(1)}, '06:00', '14:00', 'schedule', 'Regular', TRUE, 'EFFECTIVE')`;
    await assign(s.draft, s.e1, d(1), '05:00', '13:00');
    expect((await run(s, [{ employeeId: s.e1, date: d(1) }])).error_code).toBe('PROTECTED_CURRENT');
    expect(await statusOf(s.draft)).toBe('DRAFT');
  });

  it('rejects a rest violation inside the version and writes nothing', async () => {
    const s = await seed();
    await assign(s.draft, s.e1, d(1), '14:00', '22:00');
    await assign(s.draft, s.e1, d(2), '05:00', '13:00');
    const r = await run(s, [{ employeeId: s.e1, date: d(1) }, { employeeId: s.e1, date: d(2) }]);
    expect(r.error_code).toBe('REST_RULE_VIOLATION');
    expect(await statusOf(s.draft)).toBe('DRAFT');
    expect(await shiftsOf(s)).toHaveLength(0);
  });

  it('rejects an overlap, a missing pair, a version that is not a DRAFT and a version of another tenant', async () => {
    const o = await seed();
    await assign(o.draft, o.e1, d(1), '05:00', '13:00'); await assign(o.draft, o.e1, d(1), '12:00', '15:00');
    expect((await run(o, [{ employeeId: o.e1, date: d(1) }])).error_code).toBe('OVERLAP');

    const m = await seed();
    await assign(m.draft, m.e1, d(1), '05:00', '13:00');
    expect((await run(m, [{ employeeId: m.e1, date: d(1) }, { employeeId: m.e1, date: d(3) }])).error_code).toBe('MISSING_PAIR');

    const n = await seed();
    await assign(n.draft, n.e1, d(1), '05:00', '13:00');
    expect((await run(n, [{ employeeId: n.e1, date: d(1) }])).error_code).toBeNull();
    expect((await run(n, [{ employeeId: n.e1, date: d(1) }])).error_code).toBe('NOT_DRAFT');
    expect((await shiftsOf(n)).filter((x) => x.effective_state === 'EFFECTIVE')).toHaveLength(1); // the second run wrote nothing

    const u = await seed();
    const other = await seed();
    const cross = (await sql.transaction((txn) => [publishImportedPairsTx(txn, other.ctx, { scheduleId: u.schedule, versionId: u.draft, pairs: [{ employeeId: u.e1, date: d(1) }], importRef: other.importRef })]))[0][0];
    expect(cross.error_code).toBe('VERSION_NOT_FOUND'); // another organization cannot publish this version
    expect(await statusOf(u.draft)).toBe('DRAFT');
  });
});
