// Full import flow (`confirmFutureImport`) against a LOCAL disposable PostgreSQL: auto-publication, SPLIT, retention, scope, tenant isolation,
// notifications and replay. Skipped unless AUTO_PUBLISH_DATABASE_URL points at a local database (never Neon). Synthetic data only;
// the throwaway container is discarded afterwards.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTaggedSql, isLocalConnection } from '../../db/connection.mjs';
import { confirmFutureImport, previewFutureImport } from './future-import.js';
import { getOperationalDate } from './operational-date.js';
import { confirmImportReversion, previewImportReversion } from './import-reversion.js';

const url = process.env.AUTO_PUBLISH_DATABASE_URL ?? '';
if (url && !isLocalConnection(url)) throw new Error('AUTO_PUBLISH_DATABASE_URL must be a local database');
const sql = url ? createTaggedSql(url) : null;

const AUTO = 'historical-and-auto-publish';
const PLAN = 'historical-and-plan';
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
function nextMonday() {
  let date = addDays(getOperationalDate(), 7);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 1) date = addDays(date, 1);
  return date;
}
const MON = url ? nextMonday() : '';
const day = (n) => addDays(MON, n);
const fp = () => randomUUID().replaceAll('-', '').padEnd(64, 'a');
const reg = (employeeId, date, start = '05:00', end = '13:00') => ({ employeeId, date, startTime: start, endTime: end, shiftType: 'Regular', countsAsWork: true, location: '' });

async function seed() {
  const org = randomUUID(); const user = randomUUID(); const u1 = randomUUID(); const u2 = randomUUID();
  const e1 = randomUUID(); const e2 = randomUUID();
  await sql`INSERT INTO organizations (id, name) VALUES (${org}, 'Synthetic F1 import org')`;
  await sql`INSERT INTO users (id, email) VALUES (${user}, ${`o-${user}@example.invalid`}), (${u1}, ${`a-${u1}@example.invalid`}), (${u2}, ${`b-${u2}@example.invalid`})`;
  await sql`INSERT INTO employees (id, organization_id, name, status, external_employee_id, user_id)
            VALUES (${e1}, ${org}, 'Synthetic One', 'active', 'SYN-1', ${u1}), (${e2}, ${org}, 'Synthetic Two', 'active', 'SYN-2', ${u2})`;
  const ctx = { organizationId: org, user: { id: user }, role: 'OWNER', plan: 'team', employeeId: null };
  return { org, user, e1, e2, u1, u2, ctx };
}
const input = (shifts, over = {}) => ({
  shifts, fileFingerprint: fp(), fileName: 'synthetic.csv', sourceFormat: 'csv', importMode: 'team', futureConsent: AUTO, ...over,
});
const effective = (s) => sql`SELECT employee_id, TO_CHAR(date,'YYYY-MM-DD') AS date, provenance, import_id, effective_state, schedule_version_id FROM shifts WHERE organization_id = ${s.org} AND effective_state = 'EFFECTIVE' ORDER BY date, employee_id`;
const versions = (s) => sql`SELECT sv.id, sv.status, sv.version_number FROM schedule_versions sv JOIN schedules sc ON sc.id = sv.schedule_id WHERE sc.organization_id = ${s.org} ORDER BY sc.period_start, sv.version_number`;
const assignments = (s, versionId) => sql`SELECT employee_id, TO_CHAR(date,'YYYY-MM-DD') AS date FROM shift_assignments WHERE schedule_version_id = ${versionId} ORDER BY date, employee_id`;

describe.skipIf(!url)('confirmFutureImport with historical-and-auto-publish (PostgreSQL)', () => {
  beforeEach(() => { process.env.IMPORT_AUTO_PUBLISH_ENABLED = 'true'; });
  afterAll(async () => { delete process.env.IMPORT_AUTO_PUBLISH_ENABLED; await sql.end(); });

  it('publishes a clean file, stamps provenance/import id, stores the decision and notifies each employee once across two weeks', async () => {
    const s = await seed();
    const file = [reg(s.e1, day(0)), reg(s.e1, day(1)), reg(s.e2, day(0)), reg(s.e2, day(7)), reg(s.e1, day(8))];
    const r = await confirmFutureImport(sql, s.ctx, input(file));
    expect(r.decision).toBe(AUTO);
    expect(r.future.publishedWeekCount).toBe(2);
    expect(r.future.publishedShiftCount).toBe(5);
    expect(r.future.retained).toEqual([]);
    expect(r.plan.autoPublished).toBe(true);
    const rows = await effective(s);
    expect(rows).toHaveLength(5);
    expect(rows.every((x) => x.provenance === 'SCHEDULE_PUBLICATION' && x.import_id === r.importId)).toBe(true);
    expect((await versions(s)).every((v) => v.status === 'PUBLISHED')).toBe(true);
    const stored = (await sql`SELECT import_decision, publication_summary FROM imports WHERE id = ${r.importId}`)[0];
    expect(stored.import_decision).toBe(AUTO);
    expect(stored.publication_summary.publicationResults).toHaveLength(2);
    const notifications = await sql`SELECT user_id FROM notifications WHERE organization_id = ${s.org} AND type = 'SHIFT_PUBLISHED'`;
    expect(notifications).toHaveLength(2); // OD-07: one per employee for the whole batch, although e1 and e2 appear in two weeks
    expect(new Set(notifications.map((n) => n.user_id))).toEqual(new Set([s.u1, s.u2]));
    const audit = await sql`SELECT event_type FROM organization_audit_events WHERE organization_id = ${s.org} AND event_type = 'schedule.auto_published_on_import'`;
    expect(audit).toHaveLength(2);
  });

  it('replaying the same file writes nothing new (idempotent) and sends no extra notification', async () => {
    const s = await seed();
    const body = input([reg(s.e1, day(0)), reg(s.e2, day(1))]);
    await confirmFutureImport(sql, s.ctx, body);
    const again = await confirmFutureImport(sql, s.ctx, body);
    expect(again.deduplicated).toBe(true);
    expect((await effective(s))).toHaveLength(2);
    expect(await sql`SELECT 1 FROM notifications WHERE organization_id = ${s.org}`).toHaveLength(2);
  });

  it('OD-05: manual CURRENT is never overwritten; the rest is published and the retained pair goes to a new draft (SPLIT)', async () => {
    const s = await seed();
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance, layer)
              VALUES (${s.org}, ${s.e1}, ${day(1)}, '06:00', '14:00', 'MAN', 'Regular', TRUE, 'EFFECTIVE', 'MANUAL_ADMIN_CHANGE', 'CHANGE')`;
    const r = await confirmFutureImport(sql, s.ctx, input([reg(s.e1, day(0)), reg(s.e1, day(1)), reg(s.e2, day(1))]));
    expect(r.future.publicationResults.map((x) => x.status)).toEqual(['SPLIT']);
    expect(r.future.retained).toEqual([{ employeeId: s.e1, date: day(1), reason: 'MANUAL_CURRENT_PROTECTED' }]);
    const rows = await effective(s);
    expect(rows.find((x) => x.employee_id === s.e1 && x.date === day(1)).provenance).toBe('MANUAL_ADMIN_CHANGE'); // untouched
    expect(rows.filter((x) => x.provenance === 'SCHEDULE_PUBLICATION').map((x) => `${x.employee_id}|${x.date}`).sort())
      .toEqual([`${s.e1}|${day(0)}`, `${s.e2}|${day(1)}`].sort());
    const vs = await versions(s);
    expect(vs.map((v) => v.status)).toEqual(['PUBLISHED', 'DRAFT']);
    const draftPairs = (await assignments(s, vs[1].id)).map((x) => `${x.employee_id}|${x.date}`);
    expect(draftPairs).toContain(`${s.e1}|${day(1)}`); // the retained pair waits for review in the new draft
    const published = (await assignments(s, vs[0].id)).map((x) => `${x.employee_id}|${x.date}`);
    expect(published).not.toContain(`${s.e1}|${day(1)}`); // never inserted into the version that was published
  });

  it('a foreign draft in the week keeps the whole week as a draft (INV-03): nothing is published', async () => {
    const s = await seed();
    const schedule = randomUUID(); const draft = randomUUID();
    await sql`INSERT INTO schedules (id, organization_id, period_start, period_end, created_by_user_id) VALUES (${schedule}, ${s.org}, ${day(0)}, ${day(6)}, ${s.user})`;
    await sql`INSERT INTO schedule_versions (id, schedule_id, version_number, status, created_by_user_id) VALUES (${draft}, ${schedule}, 1, 'DRAFT', ${s.user})`;
    await sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${draft}, ${s.e2}, ${day(3)}, '05:00', '13:00', 'Regular', TRUE)`;
    const r = await confirmFutureImport(sql, s.ctx, input([reg(s.e1, day(0)), reg(s.e1, day(1))]));
    expect(r.future.publishedWeekCount).toBe(0);
    expect(r.future.publicationResults.map((x) => x.status)).toEqual(['RETAINED_DRAFT']);
    expect(r.future.retained.every((x) => x.reason === 'FOREIGN_DRAFT_PRESENT')).toBe(true);
    expect(await effective(s)).toHaveLength(0);
    expect((await versions(s)).map((v) => v.status)).toEqual(['DRAFT']);
    expect((await assignments(s, draft)).length).toBe(3); // the foreign one plus the two file pairs, all still a draft
  });

  it('a rest violation retains only the offending pair', async () => {
    const s = await seed();
    const r = await confirmFutureImport(sql, s.ctx, input([reg(s.e1, day(0), '14:00', '22:00'), reg(s.e1, day(1), '05:00', '13:00'), reg(s.e2, day(1))]));
    expect(r.future.retained).toEqual([{ employeeId: s.e1, date: day(1), reason: 'REST_RULE_VIOLATION' }]);
    expect((await effective(s)).map((x) => `${x.employee_id}|${x.date}`).sort()).toEqual([`${s.e1}|${day(0)}`, `${s.e2}|${day(1)}`].sort());
  });

  it('defence in depth: a conflict that appears after planning makes the SQL gate degrade the week to a draft without failing the import', async () => {
    const s = await seed();
    // Simulates a race: a manual shift lands between the (read-only) planning and the transaction.
    const racy = Object.assign((...args) => sql(...args), {
      transaction: async (build) => {
        await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance, layer)
                  VALUES (${s.org}, ${s.e1}, ${day(1)}, '06:00', '14:00', 'MAN', 'Regular', TRUE, 'EFFECTIVE', 'MANUAL_ADMIN_CHANGE', 'CHANGE')`;
        return sql.transaction(build);
      },
    });
    const r = await confirmFutureImport(racy, s.ctx, input([reg(s.e1, day(0)), reg(s.e1, day(1)), reg(s.e2, day(1))]));
    expect(r.future.publishedWeekCount).toBe(0);
    expect(r.future.publicationResults[0]).toMatchObject({ status: 'RETAINED_DRAFT', errorCode: 'PROTECTED_CURRENT' });
    expect(r.future.retained.map((x) => x.reason)).toEqual(['PUBLICATION_VALIDATION_FAILED', 'PUBLICATION_VALIDATION_FAILED', 'PUBLICATION_VALIDATION_FAILED']);
    const rows = await effective(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].provenance).toBe('MANUAL_ADMIN_CHANGE'); // untouched
    const vs = await versions(s);
    expect(vs.map((v) => v.status)).toEqual(['DRAFT']);
    expect(await assignments(s, vs[0].id)).toHaveLength(3); // nothing lost: every pair waits in the draft
    expect(await sql`SELECT 1 FROM notifications WHERE organization_id = ${s.org}`).toHaveLength(0);
  });

  it('INV-06: the legacy value `publish` and `historical-and-plan` never publish', async () => {
    for (const futureConsent of ['publish', PLAN]) {
      const s = await seed();
      const r = await confirmFutureImport(sql, s.ctx, input([reg(s.e1, day(0))], { futureConsent }));
      expect(r.decision).toBe(PLAN);
      expect(r.future.publishedWeekCount).toBe(0);
      expect(await effective(s)).toHaveLength(0);
      expect((await versions(s)).map((v) => v.status)).toEqual(['DRAFT']);
    }
  });

  it('the deployment switch is enforced by the server: AUTO is refused (409) and nothing is written', async () => {
    process.env.IMPORT_AUTO_PUBLISH_ENABLED = 'false';
    const s = await seed();
    await expect(confirmFutureImport(sql, s.ctx, input([reg(s.e1, day(0))]))).rejects.toMatchObject({ status: 409, code: 'AUTO_PUBLISH_UNAVAILABLE' });
    expect(await sql`SELECT 1 FROM imports WHERE organization_id = ${s.org}`).toHaveLength(0);
  });

  it('authorization: EMPLOYEE refused; PLANNER limited to EMPLOYEES scope cannot auto-publish another employee; cross-tenant refused', async () => {
    const s = await seed();
    await expect(confirmFutureImport(sql, { ...s.ctx, role: 'EMPLOYEE', employeeId: s.e1 }, input([reg(s.e1, day(0))]))).rejects.toMatchObject({ status: 403 });
    const planner = { ...s.ctx, role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [s.e1] };
    await expect(confirmFutureImport(sql, planner, input([reg(s.e1, day(0)), reg(s.e2, day(0))]))).rejects.toMatchObject({ status: 403 });
    const own = await confirmFutureImport(sql, planner, input([reg(s.e1, day(0))])); // inside the scope it works
    expect(own.future.publishedWeekCount).toBe(1);
    const other = await seed();
    await expect(confirmFutureImport(sql, s.ctx, input([reg(other.e1, day(0))]))).rejects.toMatchObject({ status: 403, code: 'TENANT_FORBIDDEN' });
    expect(await sql`SELECT 1 FROM shifts WHERE organization_id = ${other.org}`).toHaveLength(0);
  });

  describe('reversal of an auto-published import (complete or BLOCKED, never partial)', () => {
    const publish = async (s, shifts) => confirmFutureImport(sql, s.ctx, input(shifts));
    const snapshot = async (s) => ({
      shifts: (await sql`SELECT employee_id, TO_CHAR(date,'YYYY-MM-DD') AS date, effective_state, provenance FROM shifts WHERE organization_id = ${s.org} ORDER BY date, employee_id, effective_state`),
      versions: (await sql`SELECT sv.status FROM schedule_versions sv JOIN schedules sc ON sc.id = sv.schedule_id WHERE sc.organization_id = ${s.org} ORDER BY sc.period_start, sv.version_number`).map((v) => v.status),
    });

    it('reverts a clean publication 1:1: the import-owned shift it superseded comes back and the published week disappears', async () => {
      const s = await seed();
      await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance, layer)
                VALUES (${s.org}, ${s.e1}, ${day(1)}, '06:00', '14:00', 'IMP', 'Regular', TRUE, 'EFFECTIVE', 'SYSTEM', 'CHANGE')`;
      const before = await snapshot(s);
      const r = await publish(s, [reg(s.e1, day(0)), reg(s.e1, day(1)), reg(s.e2, day(1))]);
      expect(r.future.publishedWeekCount).toBe(1);
      const preview = await previewImportReversion(sql, s.ctx, { importIds: [r.importId] });
      expect(preview.status).toBe('READY');
      const done = await confirmImportReversion(sql, s.ctx, { importIds: [r.importId], planHash: preview.planHash });
      expect(done.status).toBe('completed');
      expect(await snapshot(s)).toEqual(before); // exactly what existed before the import
    });

    it('reverts a SPLIT import including the new draft that held the retained pair', async () => {
      const s = await seed();
      await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance, layer)
                VALUES (${s.org}, ${s.e1}, ${day(1)}, '06:00', '14:00', 'MAN', 'Regular', TRUE, 'EFFECTIVE', 'MANUAL_ADMIN_CHANGE', 'CHANGE')`;
      const before = await snapshot(s);
      const r = await publish(s, [reg(s.e1, day(0)), reg(s.e1, day(1)), reg(s.e2, day(1))]);
      expect(r.future.publicationResults[0].status).toBe('SPLIT');
      const preview = await previewImportReversion(sql, s.ctx, { importIds: [r.importId] });
      expect(JSON.stringify(preview.blockers)).toBe('[]');
      expect(preview.status).toBe('READY');
      await confirmImportReversion(sql, s.ctx, { importIds: [r.importId], planHash: preview.planHash });
      expect(await snapshot(s)).toEqual(before);
    });

    it('PUBLISHED_SHIFT_HAS_DEPENDENTS: an acknowledgement on a published shift blocks the whole reversal and changes nothing', async () => {
      const s = await seed();
      const r = await publish(s, [reg(s.e1, day(0)), reg(s.e2, day(0))]);
      const shift = (await sql`SELECT id, employee_id FROM shifts WHERE import_id = ${r.importId} AND employee_id = ${s.e1}`)[0];
      await sql`INSERT INTO shift_acknowledgements (shift_id, employee_id) VALUES (${shift.id}, ${shift.employee_id})`;
      const before = await snapshot(s);
      const preview = await previewImportReversion(sql, s.ctx, { importIds: [r.importId] });
      expect(preview.status).toBe('BLOCKED');
      expect(preview.blockers.map((b) => b.code)).toContain('PUBLISHED_SHIFT_HAS_DEPENDENTS');
      await expect(confirmImportReversion(sql, s.ctx, { importIds: [r.importId], planHash: preview.planHash })).rejects.toMatchObject({ code: 'REVERSION_BLOCKED' });
      expect(await snapshot(s)).toEqual(before);
      expect(await sql`SELECT 1 FROM shift_acknowledgements WHERE shift_id = ${shift.id}`).toHaveLength(1);
    });

    it('a manual edit of a published shift after the import blocks the reversal (LATER_MANUAL_CHANGE_UNSAFE)', async () => {
      const s = await seed();
      const r = await publish(s, [reg(s.e1, day(0))]);
      await sql`UPDATE shifts SET start_time = '07:00' WHERE import_id = ${r.importId} AND employee_id = ${s.e1}`;
      const preview = await previewImportReversion(sql, s.ctx, { importIds: [r.importId] });
      expect(preview.status).toBe('BLOCKED');
    });

    it('a draft created after the publication blocks the reversal (only one DRAFT per schedule)', async () => {
      const s = await seed();
      const r = await publish(s, [reg(s.e1, day(0))]);
      const schedule = (await sql`SELECT id FROM schedules WHERE organization_id = ${s.org}`)[0].id;
      await sql`INSERT INTO schedule_versions (schedule_id, version_number, status, created_by_user_id) VALUES (${schedule}, 2, 'DRAFT', ${s.user})`;
      const preview = await previewImportReversion(sql, s.ctx, { importIds: [r.importId] });
      expect(preview.status).toBe('BLOCKED');
      expect(preview.blockers.map((b) => b.code)).toContain('PUBLISHED_DEPENDENCY');
    });
  });

  it('plan-preview is read-only and reports what auto-publication would do', async () => {
    const s = await seed();
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance, layer)
              VALUES (${s.org}, ${s.e1}, ${day(1)}, '06:00', '14:00', 'MAN', 'Regular', TRUE, 'EFFECTIVE', 'MANUAL_ADMIN_CHANGE', 'CHANGE')`;
    const count = async () => [
      (await sql`SELECT COUNT(*)::int AS n FROM schedules WHERE organization_id = ${s.org}`)[0].n,
      (await sql`SELECT COUNT(*)::int AS n FROM imports WHERE organization_id = ${s.org}`)[0].n,
      (await sql`SELECT COUNT(*)::int AS n FROM shifts WHERE organization_id = ${s.org}`)[0].n,
      (await sql`SELECT COUNT(*)::int AS n FROM notifications WHERE organization_id = ${s.org}`)[0].n,
    ];
    const before = await count();
    const preview = await previewFutureImport(sql, s.ctx, input([reg(s.e1, day(0)), reg(s.e1, day(1)), reg(s.e2, day(1))], { futureConsent: undefined }));
    expect(preview.autoPublish.eligible).toBe(true);
    expect(preview.autoPublish.willPublishShiftCount).toBe(2);
    expect(preview.autoPublish.weeks[0].mode).toBe('SPLIT');
    expect(preview.autoPublish.willRetain).toEqual([{ employeeId: s.e1, date: day(1), reason: 'MANUAL_CURRENT_PROTECTED' }]);
    expect(await count()).toEqual(before); // ZERO writes
    const employee = await previewFutureImport(sql, { ...s.ctx, role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [s.e1] }, input([reg(s.e1, day(0))], { futureConsent: undefined }));
    expect(employee.autoPublish.eligible).toBe(true);
  });
});
