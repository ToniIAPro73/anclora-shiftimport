// Real-PostgreSQL verification of the employee-side time-off SQL (migration 0050). Runs ONLY against a LOCAL disposable database
// (TIME_OFF_DATABASE_URL=postgres://…@127.0.0.1:…); it refuses any non-local host so Neon is never touched.
// Every scenario seeds its own synthetic organization (random ids); the throwaway container is discarded afterwards.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTaggedSql, isLocalConnection } from '../../db/connection.mjs';
import {
  cancelTimeOffRequest,
  createTimeOffRequest,
  getTimeOffImpact,
  listTimeOffRequests,
} from './time-off-data.js';

const url = process.env.TIME_OFF_DATABASE_URL ?? '';
if (url && !isLocalConnection(url)) throw new Error('TIME_OFF_DATABASE_URL must be a local database');
const sql = url ? createTaggedSql(url) : null;

const TODAY = '2026-11-02';
const d = (offset) => new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10);
const uuid = () => randomUUID();

async function user(label) {
  const id = uuid();
  await sql`INSERT INTO users (id, email) VALUES (${id}, ${`${label}-${id}@example.invalid`})`;
  return id;
}

/** One synthetic org: requester employee (linked to a user) + OWNER + ADMIN + planners with every scope kind. */
async function seed({ policy = 'ORGANIZATION_ADMIN', withArea = true } = {}) {
  const org = uuid();
  await sql`INSERT INTO organizations (id, name, approval_policy, plan, type) VALUES (${org}, 'Synthetic F2 org', ${policy}, 'team', 'company')`;
  const area = uuid(); const otherArea = uuid();
  if (withArea) {
    await sql`INSERT INTO areas (id, organization_id, name) VALUES (${area}, ${org}, 'Area A'), (${otherArea}, ${org}, 'Area B')`;
  }
  const requesterUser = await user('requester');
  const employee = uuid(); const colleague = uuid();
  await sql`INSERT INTO employees (id, organization_id, name, status, user_id, area_id) VALUES (${employee}, ${org}, 'Requester', 'active', ${requesterUser}, ${withArea ? area : null})`;
  await sql`INSERT INTO employees (id, organization_id, name, status, area_id) VALUES (${colleague}, ${org}, 'Colleague', 'active', ${withArea ? area : null})`;
  const owner = await user('owner'); const admin = await user('admin');
  const plannerOrg = await user('planner-org'); const plannerAreaA = await user('planner-a'); const plannerAreaB = await user('planner-b');
  const plannerEmp = await user('planner-emp'); const plannerOtherEmp = await user('planner-oemp');
  await sql`INSERT INTO memberships (user_id, organization_id, role, planner_scope_type, scoped_area_id) VALUES
    (${requesterUser}, ${org}, 'EMPLOYEE', NULL, NULL), (${owner}, ${org}, 'OWNER', NULL, NULL), (${admin}, ${org}, 'ADMIN', NULL, NULL),
    (${plannerOrg}, ${org}, 'PLANNER', 'ORGANIZATION', NULL),
    (${plannerAreaA}, ${org}, 'PLANNER', 'AREAS', ${withArea ? area : null}), (${plannerAreaB}, ${org}, 'PLANNER', 'AREAS', ${withArea ? otherArea : null}),
    (${plannerEmp}, ${org}, 'PLANNER', 'EMPLOYEES', NULL), (${plannerOtherEmp}, ${org}, 'PLANNER', 'EMPLOYEES', NULL)`;
  if (withArea) {
    await sql`INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id) VALUES
      (${org}, 'PLANNER_AREA', ${plannerAreaA}, ${area}), (${org}, 'PLANNER_AREA', ${plannerAreaB}, ${otherArea})`;
  }
  await sql`INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id) VALUES
    (${org}, 'PLANNER_EMPLOYEE', ${plannerEmp}, ${employee}), (${org}, 'PLANNER_EMPLOYEE', ${plannerOtherEmp}, ${colleague})`;
  const ctx = { organizationId: org, user: { id: requesterUser }, role: 'EMPLOYEE', employeeId: employee };
  return { org, area, otherArea, requesterUser, employee, colleague, owner, admin, plannerOrg, plannerAreaA, plannerAreaB, plannerEmp, plannerOtherEmp, ctx };
}
const body = (patch = {}) => ({ requestType: 'VACATION', startDate: d(10), endDate: d(14), comment: 'Verano', ...patch });
const create = (s, patch, ctx = s.ctx) => createTimeOffRequest(sql, ctx, body(patch), { today: TODAY });
const recipients = async (s) => (await sql`SELECT user_id FROM notifications WHERE organization_id = ${s.org} AND type = 'APPROVAL_REQUEST_CREATED'`).map((r) => r.user_id);
const rejects = async (promise) => { try { await promise; } catch (error) { return error; } throw new Error('expected a rejection'); };

// The throwaway container runs inside Docker Desktop's VM: generous timeouts keep the seeds from flaking, not hiding slowness of the SUT.
describe.skipIf(!url)('time-off requests against PostgreSQL (0050)', { timeout: 90_000 }, () => {
  afterAll(async () => { await sql.end(); }, 30_000);

  it('creates the request and its approval envelope atomically, with the audit event', async () => {
    const s = await seed();
    const request = await create(s);
    expect(request).toMatchObject({ requestType: 'VACATION', startDate: d(10), endDate: d(14), requestedDays: 5, status: 'PENDING', comment: 'Verano' });
    const [row] = await sql`SELECT organization_id, employee_id, requested_by_user_id, status, applied_days FROM time_off_requests WHERE id = ${request.id}`;
    expect(row).toMatchObject({ organization_id: s.org, employee_id: s.employee, requested_by_user_id: s.requesterUser, status: 'PENDING', applied_days: null });
    const envelopes = await sql`SELECT change_request_id, time_off_request_id, status, policy_snapshot FROM approval_requests WHERE time_off_request_id = ${request.id}`;
    expect(envelopes).toEqual([{ change_request_id: null, time_off_request_id: request.id, status: 'PENDING', policy_snapshot: 'ORGANIZATION_ADMIN' }]);
    const audit = await sql`SELECT event_type, target_type, actor_user_id FROM organization_audit_events WHERE organization_id = ${s.org} AND target_id = ${request.id}`;
    expect(audit).toEqual([{ event_type: 'time_off_request.created', target_type: 'TIME_OFF_REQUEST', actor_user_id: s.requesterUser }]);
  });

  it('ORGANIZATION_ADMIN policy notifies OWNER, ADMIN and the organisation-wide planner — nobody scoped, never the requester', async () => {
    const s = await seed({ policy: 'ORGANIZATION_ADMIN' });
    await create(s);
    expect((await recipients(s)).sort()).toEqual([s.owner, s.admin, s.plannerOrg].sort());
  });

  it('AREA_RESPONSIBLE policy notifies the area-bound approvers (area planner + planner of that employee), not other areas or other employees', async () => {
    const s = await seed({ policy: 'AREA_RESPONSIBLE' });
    await create(s);
    const got = await recipients(s);
    expect(got.sort()).toEqual([s.plannerAreaA, s.plannerEmp].sort());
    for (const excluded of [s.plannerAreaB, s.plannerOtherEmp, s.requesterUser]) expect(got).not.toContain(excluded);
  });

  it('AREA_RESPONSIBLE with a responsible admin: only that admin and the scoped planners', async () => {
    const s = await seed({ policy: 'AREA_RESPONSIBLE' });
    await sql`INSERT INTO area_responsibles (area_id, user_id, organization_id) VALUES (${s.area}, ${s.admin}, ${s.org})`;
    await create(s);
    expect((await recipients(s)).sort()).toEqual([s.admin, s.plannerAreaA, s.plannerEmp].sort());
  });

  it('anti-self-approval: a requester who is also OWNER is never notified, the rest still are', async () => {
    const s = await seed();
    await sql`UPDATE memberships SET role = 'ADMIN' WHERE user_id = ${s.owner} AND organization_id = ${s.org}`; // one OWNER per organisation
    await sql`UPDATE memberships SET role = 'OWNER' WHERE user_id = ${s.requesterUser} AND organization_id = ${s.org}`;
    await create(s, {}, { ...s.ctx, role: 'OWNER' });
    const got = await recipients(s);
    expect(got).not.toContain(s.requesterUser);
    expect(got).toContain(s.admin);
  });

  it('rejects an overlapping live request with the real exclusion violation (409 TIME_OFF_OVERLAP) and writes nothing', async () => {
    const s = await seed();
    await create(s);
    const error = await rejects(create(s, { startDate: d(13), endDate: d(16) }));
    expect(error).toMatchObject({ status: 409, code: 'TIME_OFF_OVERLAP' });
    expect(await sql`SELECT id FROM time_off_requests WHERE organization_id = ${s.org}`).toHaveLength(1);
    expect(await sql`SELECT id FROM approval_requests WHERE organization_id = ${s.org}`).toHaveLength(1);
  });

  it('adjacent ranges do not overlap; two employees may hold the same days', async () => {
    const s = await seed();
    await create(s);
    await create(s, { startDate: d(15), endDate: d(16) });
    await createTimeOffRequest(sql, { ...s.ctx, employeeId: s.colleague }, body(), { today: TODAY }).catch(() => null);
    expect((await sql`SELECT id FROM time_off_requests WHERE organization_id = ${s.org} AND employee_id = ${s.employee}`)).toHaveLength(2);
  });

  it('cancel frees the days, mirrors CANCELLED on the envelope, and the days can be requested again', async () => {
    const s = await seed();
    const request = await create(s);
    const cancelled = await cancelTimeOffRequest(sql, s.ctx, request.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.history.map((e) => e.type)).toEqual(['CREATED', 'CANCELLED']);
    expect((await sql`SELECT status FROM approval_requests WHERE time_off_request_id = ${request.id}`)[0].status).toBe('CANCELLED');
    expect((await create(s)).status).toBe('PENDING');
    const second = await rejects(cancelTimeOffRequest(sql, s.ctx, request.id));
    expect(second).toMatchObject({ status: 409, code: 'TIME_OFF_NOT_PENDING' });
  });

  it('TENANT ISOLATION: another employee / another organisation can neither see nor cancel the request (404), and cannot request for it', async () => {
    const a = await seed(); const b = await seed();
    const request = await create(a);
    expect(await rejects(cancelTimeOffRequest(sql, b.ctx, request.id))).toMatchObject({ status: 404 });
    expect(await rejects(cancelTimeOffRequest(sql, { ...a.ctx, employeeId: a.colleague }, request.id))).toMatchObject({ status: 404 });
    expect((await listTimeOffRequests(sql, b.ctx, { year: 2026 }, { today: TODAY })).requests).toEqual([]);
    expect((await sql`SELECT status FROM time_off_requests WHERE id = ${request.id}`)[0].status).toBe('PENDING');
    // The database itself refuses a cross-tenant subject: employee of org A under org B.
    const error = await rejects(sql`INSERT INTO time_off_requests (organization_id, employee_id, request_type, start_date, end_date, requested_days) VALUES (${b.org}, ${a.employee}, 'VACATION', ${d(30)}, ${d(30)}, 1)`);
    expect(error.code ?? error.cause?.code).toBe('23503');
  });

  it('list: year, status filter and summary (applied days count once approved)', async () => {
    const s = await seed();
    const a = await create(s);
    const b = await create(s, { startDate: d(20), endDate: d(22) });
    await sql`UPDATE time_off_requests SET status = 'APPROVED', resolved_at = NOW(), applied_start_date = ${d(20)}, applied_days = 2 WHERE id = ${b.id}`;
    const all = await listTimeOffRequests(sql, s.ctx, { year: 2026 }, { today: TODAY });
    expect(all.requests.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(all.summary).toEqual({ approvedDaysInYear: 2, pendingDays: 5, activeCount: 2 });
    const approved = all.requests.find((r) => r.id === b.id);
    expect(approved).toMatchObject({ appliedDays: 2, skippedPastDays: 1, appliedStartDate: d(20) });
    expect((await listTimeOffRequests(sql, s.ctx, { year: 2026, status: 'approved' }, { today: TODAY })).requests.map((r) => r.id)).toEqual([b.id]);
    expect((await listTimeOffRequests(sql, s.ctx, { year: 2027 }, { today: TODAY })).requests).toEqual([]);
  });

  it('impact: counts the employee’s EFFECTIVE shifts and DRAFT assignments in the range, and own live overlaps — nobody else’s', async () => {
    const s = await seed();
    const schedule = uuid(); const draft = uuid();
    await sql`INSERT INTO schedules (id, organization_id, period_start, period_end, created_by_user_id) VALUES (${schedule}, ${s.org}, ${d(0)}, ${d(30)}, ${s.owner})`;
    await sql`INSERT INTO schedule_versions (id, schedule_id, version_number, status, created_by_user_id) VALUES (${draft}, ${schedule}, 1, 'DRAFT', ${s.owner})`;
    for (const [emp, offset] of [[s.employee, 11], [s.employee, 12], [s.colleague, 11]]) {
      await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance)
                VALUES (${s.org}, ${emp}, ${d(offset)}, '05:00', '13:00', 'MAN', 'Regular', TRUE, 'EFFECTIVE', 'MANUAL_ADMIN_CHANGE')`;
    }
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance)
              VALUES (${s.org}, ${s.employee}, ${d(13)}, '05:00', '13:00', 'MAN', 'Regular', TRUE, 'SUPERSEDED', 'MANUAL_ADMIN_CHANGE')`;
    await sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${draft}, ${s.employee}, ${d(14)}, '05:00', '13:00', 'Regular', TRUE), (${draft}, ${s.colleague}, ${d(14)}, '05:00', '13:00', 'Regular', TRUE)`;
    const mine = await create(s, { startDate: d(40), endDate: d(42) });
    const impact = await getTimeOffImpact(sql, s.ctx, { startDate: d(10), endDate: d(14) }, { today: TODAY });
    expect(impact).toEqual({ publishedShifts: 2, draftAssignments: 1, overlapsOwn: [] });
    const overlapping = await getTimeOffImpact(sql, s.ctx, { startDate: d(41), endDate: d(45) }, { today: TODAY });
    expect(overlapping.overlapsOwn).toEqual([{ id: mine.id, startDate: d(40), endDate: d(42), status: 'PENDING' }]);
  });

  it('COMPATIBILITY (INV-11): code that predates 0050 neither sees nor trips on a time-off envelope', async () => {
    const s = await seed();
    await create(s);
    const legacy = await sql`
      SELECT ar.id FROM approval_requests ar
      JOIN change_requests cr ON cr.id = ar.change_request_id AND cr.organization_id = ar.organization_id
      WHERE ar.organization_id = ${s.org}`;
    expect(legacy).toEqual([]);
    expect(await sql`SELECT id FROM change_requests WHERE organization_id = ${s.org}`).toEqual([]);
  });

  it('the SICK_LEAVE / PERMISSION / OTHER catalogue exists in the database but the server refuses to create them', async () => {
    const s = await seed();
    for (const requestType of ['SICK_LEAVE', 'PERMISSION', 'OTHER']) {
      expect(await rejects(create(s, { requestType }))).toMatchObject({ status: 422, code: 'TIME_OFF_TYPE_NOT_ENABLED' });
    }
    expect(await sql`SELECT id FROM time_off_requests WHERE organization_id = ${s.org}`).toEqual([]);
  });

  it('a user without an active linked employee cannot create, list, check impact or cancel (403 EMPLOYEE_LINK_REQUIRED)', async () => {
    const s = await seed();
    const ctx = { ...s.ctx, employeeId: null };
    for (const op of [
      () => create(s, {}, ctx),
      () => listTimeOffRequests(sql, ctx, {}, { today: TODAY }),
      () => getTimeOffImpact(sql, ctx, { startDate: d(10), endDate: d(11) }, { today: TODAY }),
      () => cancelTimeOffRequest(sql, ctx, uuid()),
    ]) expect(await rejects(op())).toMatchObject({ status: 403, code: 'EMPLOYEE_LINK_REQUIRED' });
  });
});
