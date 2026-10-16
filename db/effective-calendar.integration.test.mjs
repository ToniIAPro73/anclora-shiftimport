import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTaggedSql, isLocalConnection } from './connection.mjs';
import {
  applyCalendarChange,
  getDayHistory,
  getEffectiveStats,
  listAnnualTargets,
  reconcileCalendarDay,
  setAnnualTarget,
} from '../api/_lib/calendar.js';

/**
 * Real PostgreSQL integration for the effective calendar (migration 0041).
 * Only runs against a local Docker database; every row is synthetic and
 * removed in afterAll.
 */
describe('effective calendar integration (local PostgreSQL)', () => {
  let sql;
  const run = randomUUID().slice(0, 8);
  const ids = { org: randomUUID(), otherOrg: randomUUID() };
  const users = {};
  const employees = {};
  const ctxOf = (key, extra = {}) => ({
    user: { id: users[key] },
    organizationId: ids.org,
    role: { owner: 'OWNER', admin: 'ADMIN', planner: 'PLANNER', employee: 'EMPLOYEE' }[key],
    employeeId: employees[key] ?? null,
    plan: 'team',
    plannerScopeType: key === 'planner' ? 'ORGANIZATION' : null,
    scopedAreaIds: [],
    scopedEmployeeIds: [],
    ...extra,
  });

  async function insertShift(employeeId, row) {
    await sql`
      INSERT INTO shifts (id, organization_id, employee_id, date, start_time, end_time, location, origin,
                          shift_type, counts_as_work, layer, provenance, effective_state, plan_revision)
      VALUES (${randomUUID()}, ${ids.org}, ${employeeId}, ${row.date}, ${row.start ?? null}, ${row.end ?? null},
              ${row.type}, ${row.origin ?? 'IMP'}, ${row.type}, ${row.work ?? true}, ${row.layer ?? 'COMPANY_PLAN'},
              ${row.provenance ?? 'COMPANY_IMPORT'}, ${row.state ?? 'EFFECTIVE'}, ${row.revision ?? 1})
    `;
  }

  beforeAll(async () => {
    const url = process.env.EFFECTIVE_CALENDAR_DATABASE_URL;
    if (!url || !isLocalConnection(url)) {
      throw new Error('EFFECTIVE_CALENDAR_DATABASE_URL must point at a local Docker PostgreSQL');
    }
    sql = createTaggedSql(url);
    await sql`INSERT INTO organizations (id, name, plan, type) VALUES (${ids.org}, ${`EFFCAL-${run}`}, 'team', 'company')`;
    await sql`INSERT INTO organizations (id, name, plan, type) VALUES (${ids.otherOrg}, ${`EFFCAL-OTHER-${run}`}, 'team', 'company')`;
    for (const key of ['owner', 'admin', 'planner', 'employee']) {
      users[key] = randomUUID();
      await sql`INSERT INTO users (id, email, password_hash, display_name) VALUES (${users[key]}, ${`effcal-${key}-${run}@example.test`}, 'x', ${`Effcal ${key}`})`;
      await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${users[key]}, ${ids.org}, ${key.toUpperCase()})`;
    }
    // The administrator is ALSO an employee (same identity, no second user).
    employees.admin = randomUUID();
    employees.employee = randomUUID();
    employees.other = randomUUID();
    await sql`INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status) VALUES (${employees.admin}, ${ids.org}, ${`A-${run}`}, 'Admin Employee', ${users.admin}, 'active')`;
    await sql`INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status) VALUES (${employees.employee}, ${ids.org}, ${`E-${run}`}, 'Plain Employee', ${users.employee}, 'active')`;
    await sql`INSERT INTO employees (id, organization_id, external_employee_id, name, status) VALUES (${employees.other}, ${ids.otherOrg}, ${`O-${run}`}, 'Other Org Employee', 'active')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM organizations WHERE id IN (${ids.org}, ${ids.otherOrg})`;
    for (const key of Object.keys(users)) await sql`DELETE FROM users WHERE id = ${users[key]}`;
    const residue = await sql`SELECT COUNT(*)::int AS n FROM organizations WHERE id IN (${ids.org}, ${ids.otherOrg})`;
    expect(residue[0].n).toBe(0);
    await sql.end();
  });

  describe('annual targets (per employee, per year)', () => {
    it('OWNER and ADMIN can configure, with before/after audit', async () => {
      const created = await setAnnualTarget(sql, ctxOf('admin'), {
        employeeId: employees.admin, year: 2025, minimumAnnualMinutes: 91740, maximumAnnualMinutes: 92400, notes: 'pilot',
      });
      expect(created.marginMinutes).toBe(660);
      await setAnnualTarget(sql, ctxOf('owner'), {
        employeeId: employees.admin, year: 2025, minimumAnnualMinutes: 91740, maximumAnnualMinutes: 92500,
      });
      const events = await sql`
        SELECT event_type, metadata FROM organization_audit_events
        WHERE organization_id = ${ids.org} AND target_id = ${employees.admin}
          AND event_type IN ('EMPLOYEE_ANNUAL_TARGET_SET', 'EMPLOYEE_ANNUAL_TARGET_UPDATED')
        ORDER BY created_at ASC
      `;
      expect(events.map((e) => e.event_type)).toEqual(['EMPLOYEE_ANNUAL_TARGET_SET', 'EMPLOYEE_ANNUAL_TARGET_UPDATED']);
      expect(events[1].metadata.before.maximumAnnualMinutes).toBe(92400);
      expect(events[1].metadata.after.maximumAnnualMinutes).toBe(92500);
    });

    it('does not infer a 2026 target from 2025', async () => {
      const targets = await listAnnualTargets(sql, ctxOf('admin'), employees.admin);
      expect(targets.map((t) => t.year)).toEqual([2025]);
      const stats = await getEffectiveStats(sql, ctxOf('admin'), employees.admin, 2026, { today: '2026-10-16' });
      expect(stats.target).toBeNull();
      expect(stats.contract.status).toBe('UNCONFIGURED');
    });

    it('rejects EMPLOYEE and PLANNER writes, allows EMPLOYEE to read only their own', async () => {
      await expect(setAnnualTarget(sql, ctxOf('employee'), {
        employeeId: employees.employee, year: 2026, minimumAnnualMinutes: 1, maximumAnnualMinutes: 2,
      })).rejects.toMatchObject({ status: 403 });
      await expect(setAnnualTarget(sql, ctxOf('planner'), {
        employeeId: employees.employee, year: 2026, minimumAnnualMinutes: 1, maximumAnnualMinutes: 2,
      })).rejects.toMatchObject({ status: 403 });
      await setAnnualTarget(sql, ctxOf('admin'), {
        employeeId: employees.employee, year: 2026, minimumAnnualMinutes: 60000, maximumAnnualMinutes: 61000,
      });
      expect(await listAnnualTargets(sql, ctxOf('employee'), employees.employee)).toHaveLength(1);
      // An EMPLOYEE asking for someone else's targets is silently forced to their own.
      expect((await listAnnualTargets(sql, ctxOf('employee'), employees.admin))[0].employeeId).toBe(employees.employee);
    });

    it('is tenant-scoped', async () => {
      await expect(setAnnualTarget(sql, ctxOf('admin'), {
        employeeId: employees.other, year: 2026, minimumAnnualMinutes: 1, maximumAnnualMinutes: 2,
      })).rejects.toMatchObject({ status: 403 });
    });

    it('rejects an inverted range and enforces the DB check', async () => {
      await expect(setAnnualTarget(sql, ctxOf('admin'), {
        employeeId: employees.admin, year: 2026, minimumAnnualMinutes: 100, maximumAnnualMinutes: 50,
      })).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('admin changes on the effective calendar', () => {
    const date = '2026-01-01';

    it('2026-01-01: Libre superseded by an administrative Regular 11-19', async () => {
      await insertShift(employees.admin, { date, type: 'Libre', start: null, end: null, work: false });
      const [libre] = await sql`SELECT id FROM shifts WHERE employee_id = ${employees.admin} AND date = ${date}`;
      const result = await applyCalendarChange(sql, ctxOf('admin'), {
        employeeId: employees.admin, date, changeType: 'REPLACE_DAY',
        reason: 'Company asked to work the day', after: [{ shiftType: 'Regular', startTime: '11:00', endTime: '19:00' }],
      });
      // Admin acting on THEIR OWN calendar is audited as a self change, not as an approval.
      expect(result).toMatchObject({ selfChange: true, actorRole: 'ADMIN', changeType: 'REPLACE_DAY' });
      expect(result.before).toHaveLength(1);

      const [change] = await sql`SELECT * FROM calendar_changes WHERE id = ${result.changeId}`;
      expect(change.actor_user_id).toBe(users.admin);
      expect(change.employee_id).toBe(employees.admin);
      expect(change.self_change).toBe(true);
      expect(change.actor_role).toBe('ADMIN');
      expect(change.reason).toBe('Company asked to work the day');
      expect(change.approval_status).toBe('APPLIED');
      expect(change.original_shift_id).toBe(libre.id);

      const history = await getDayHistory(sql, ctxOf('admin'), employees.admin, date);
      expect(history.provenance.companyOriginal.map((r) => r.shiftType)).toEqual(['Libre']);
      expect(history.provenance.effective.map((r) => r.shiftType)).toEqual(['Regular']);
      expect(history.changes).toHaveLength(1);
      expect(history.provenance.hasChangesFromPlan).toBe(true);

      const stats = await getEffectiveStats(sql, ctxOf('admin'), employees.admin, 2026, { today: '2026-10-16' });
      expect(stats.realized.effectiveMinutes).toBe(480);
      expect(stats.realized.freeDays).toBe(0);
    });

    it('rejects EMPLOYEE direct changes (they use change requests)', async () => {
      await expect(applyCalendarChange(sql, ctxOf('employee'), {
        employeeId: employees.employee, date: '2026-03-02', changeType: 'ADD_SHIFT', reason: 'x',
        after: [{ shiftType: 'Regular', startTime: '08:00', endTime: '16:00' }],
      })).rejects.toMatchObject({ status: 403 });
    });

    it('rejects a change that would make the effective day inconsistent', async () => {
      await insertShift(employees.employee, { date: '2026-03-03', type: 'Regular', start: '08:00', end: '16:00' });
      await expect(applyCalendarChange(sql, ctxOf('admin'), {
        employeeId: employees.employee, date: '2026-03-03', changeType: 'ADD_EXTRA', reason: 'overlap',
        after: [{ shiftType: 'Extras', startTime: '15:00', endTime: '18:00' }],
      })).rejects.toMatchObject({ status: 422, code: 'OVERLAP' });
    });

    it('refuses to create JT as work', async () => {
      await expect(applyCalendarChange(sql, ctxOf('admin'), {
        employeeId: employees.employee, date: '2026-03-04', changeType: 'ADD_SHIFT', reason: 'jt',
        after: [{ shiftType: 'JT', startTime: '08:00', endTime: '16:00' }],
      })).rejects.toMatchObject({ code: 'JT_NOT_WORK' });
    });

    it('blocks cross-tenant changes', async () => {
      await expect(applyCalendarChange(sql, ctxOf('admin'), {
        employeeId: employees.other, date: '2026-03-02', changeType: 'ADD_SHIFT', reason: 'x',
        after: [{ shiftType: 'Regular', startTime: '08:00', endTime: '16:00' }],
      })).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('legacy data semantics', () => {
    it('2026-02-06 / 02-18: JT summary never adds hours', async () => {
      const e = employees.employee;
      await insertShift(e, { date: '2026-02-06', type: 'Regular', start: '13:00', end: '20:00' });
      await insertShift(e, { date: '2026-02-06', type: 'Extras', start: '20:00', end: '21:00' });
      await insertShift(e, { date: '2026-02-06', type: 'JT', start: '13:00', end: '21:00' });
      await insertShift(e, { date: '2026-02-18', type: 'Regular', start: '13:00', end: '21:00' });
      await insertShift(e, { date: '2026-02-18', type: 'Extras', start: '21:00', end: '23:15' });
      await insertShift(e, { date: '2026-02-18', type: 'JT', start: '13:00', end: '23:15' });
      const stats = await getEffectiveStats(sql, ctxOf('admin'), e, 2026, { today: '2026-10-16' });
      const feb = stats.realized;
      // 2026-03-03 Regular 8h from the previous suite + 8h + 10h15
      expect(feb.regularMinutes).toBe(420 + 480 + 480);
      expect(feb.extrasMinutes).toBe(60 + 135);
      expect(stats.legacyDutyRows).toBe(2);
    });

    it('2026-06-02: Baja vs historical Regular stays REQUIRES_REVIEW until reconciled', async () => {
      const e = employees.employee;
      await insertShift(e, { date: '2026-06-02', type: 'Baja', work: false, layer: 'COMPANY_PLAN', revision: 2, state: 'REQUIRES_REVIEW' });
      await insertShift(e, { date: '2026-06-02', type: 'Regular', start: '14:00', end: '22:00', state: 'REQUIRES_REVIEW' });
      const before = await getEffectiveStats(sql, ctxOf('admin'), e, 2026, { today: '2026-10-16' });
      expect(before.unresolved.some((u) => u.date === '2026-06-02' && u.status === 'REQUIRES_REVIEW')).toBe(true);

      const rows = await sql`SELECT id, shift_type FROM shifts WHERE employee_id = ${e} AND date = '2026-06-02'`;
      const baja = rows.find((r) => r.shift_type === 'Baja');
      await expect(reconcileCalendarDay(sql, ctxOf('employee'), {
        employeeId: e, date: '2026-06-02', keepShiftIds: [baja.id], reason: 'nope',
      })).rejects.toMatchObject({ status: 403 });
      await reconcileCalendarDay(sql, ctxOf('admin'), {
        employeeId: e, date: '2026-06-02', keepShiftIds: [baja.id], reason: 'Company calendar says Baja',
      });
      const history = await getDayHistory(sql, ctxOf('admin'), e, '2026-06-02');
      expect(history.rows.filter((r) => r.effectiveState === 'SUPERSEDED')).toHaveLength(1);
      expect(history.changes[0].changeType).toBe('RECONCILIATION');
      const after = await getEffectiveStats(sql, ctxOf('admin'), e, 2026, { today: '2026-10-16' });
      expect(after.unresolved.some((u) => u.date === '2026-06-02')).toBe(false);
      expect(after.realized.sickLeaveDays).toBe(1);
    });
  });
});
