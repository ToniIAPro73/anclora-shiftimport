// Real-PostgreSQL verification of F3 (vacation approval, materialisation, planning protection, audited override).
// Runs ONLY against a LOCAL disposable database (TIME_OFF_DATABASE_URL=postgres://…@127.0.0.1:…); it refuses any non-local host so Neon
// is never touched. Every scenario seeds its own synthetic organization (random ids); the throwaway container is discarded afterwards.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTaggedSql, isLocalConnection } from '../../db/connection.mjs';
import { reconcileCalendarDay } from './calendar.js';
import { createAssignment, createNewDraftFromVersion, getScheduleSnapshot, publishScheduleVersion, updateAssignment } from './scheduling.js';
import { approveTimeOffRequest, listTimeOffApprovals, parseApprovalQuery, rejectTimeOffRequest } from './time-off-approvals.js';
import { createTimeOffRequest } from './time-off-data.js';

const url = process.env.TIME_OFF_DATABASE_URL ?? '';
if (url && !isLocalConnection(url)) throw new Error('TIME_OFF_DATABASE_URL must be a local database');
const sql = url ? createTaggedSql(url) : null;

const TODAY = '2026-11-02';
const d = (offset) => new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10);
const uuid = () => randomUUID();
const rejects = async (promise) => { try { await promise; } catch (error) { return error; } throw new Error('expected a rejection'); };

async function user(label) {
  const id = uuid();
  await sql`INSERT INTO users (id, email, display_name) VALUES (${id}, ${`${label}-${id}@example.invalid`}, ${label})`;
  return id;
}

/** One synthetic organisation: requester + colleague (area A) + an employee of area B, and a manager of every kind. */
async function seed({ policy = 'ORGANIZATION_ADMIN' } = {}) {
  const org = uuid(); const otherOrg = uuid();
  await sql`INSERT INTO organizations (id, name, approval_policy, plan, type) VALUES (${org}, 'Synthetic F3 org', ${policy}, 'team', 'company'), (${otherOrg}, 'Synthetic F3 other', 'ORGANIZATION_ADMIN', 'team', 'company')`;
  const areaA = uuid(); const areaB = uuid();
  await sql`INSERT INTO areas (id, organization_id, name) VALUES (${areaA}, ${org}, 'Area A'), (${areaB}, ${org}, 'Area B')`;
  const u = {};
  for (const key of ['requester', 'owner', 'admin', 'plannerOrg', 'plannerA', 'plannerB', 'plannerEmp', 'plannerOtherEmp', 'colleague', 'otherOwner']) u[key] = await user(key);
  const e = { requester: uuid(), colleague: uuid(), areaB: uuid() };
  await sql`INSERT INTO employees (id, organization_id, name, status, user_id, area_id) VALUES
    (${e.requester}, ${org}, 'Requester', 'active', ${u.requester}, ${areaA}), (${e.colleague}, ${org}, 'Colleague', 'active', ${u.colleague}, ${areaA}),
    (${e.areaB}, ${org}, 'AreaB employee', 'active', NULL, ${areaB})`;
  await sql`INSERT INTO memberships (user_id, organization_id, role, planner_scope_type) VALUES
    (${u.requester}, ${org}, 'EMPLOYEE', NULL), (${u.colleague}, ${org}, 'EMPLOYEE', NULL), (${u.owner}, ${org}, 'OWNER', NULL), (${u.admin}, ${org}, 'ADMIN', NULL),
    (${u.plannerOrg}, ${org}, 'PLANNER', 'ORGANIZATION'), (${u.plannerA}, ${org}, 'PLANNER', 'AREAS'), (${u.plannerB}, ${org}, 'PLANNER', 'AREAS'),
    (${u.plannerEmp}, ${org}, 'PLANNER', 'EMPLOYEES'), (${u.plannerOtherEmp}, ${org}, 'PLANNER', 'EMPLOYEES'), (${u.otherOwner}, ${otherOrg}, 'OWNER', NULL)`;
  await sql`INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id) VALUES
    (${org}, 'PLANNER_AREA', ${u.plannerA}, ${areaA}), (${org}, 'PLANNER_AREA', ${u.plannerB}, ${areaB}),
    (${org}, 'PLANNER_EMPLOYEE', ${u.plannerEmp}, ${e.requester}), (${org}, 'PLANNER_EMPLOYEE', ${u.plannerOtherEmp}, ${e.colleague})`;
  const ctxOf = (key, role, extra = {}) => ({ organizationId: org, user: { id: u[key], display_name: key }, role, employeeId: null, plannerScopeType: null, scopedAreaIds: [], scopedEmployeeIds: [], scopedAreaId: null, ...extra });
  const ctx = {
    requester: ctxOf('requester', 'EMPLOYEE', { employeeId: e.requester }),
    owner: ctxOf('owner', 'OWNER'),
    admin: ctxOf('admin', 'ADMIN'),
    plannerOrg: ctxOf('plannerOrg', 'PLANNER', { plannerScopeType: 'ORGANIZATION' }),
    plannerA: ctxOf('plannerA', 'PLANNER', { plannerScopeType: 'AREAS', scopedAreaIds: [areaA] }),
    plannerB: ctxOf('plannerB', 'PLANNER', { plannerScopeType: 'AREAS', scopedAreaIds: [areaB] }),
    plannerEmp: ctxOf('plannerEmp', 'PLANNER', { plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [e.requester] }),
    plannerOtherEmp: ctxOf('plannerOtherEmp', 'PLANNER', { plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [e.colleague] }),
    colleague: ctxOf('colleague', 'EMPLOYEE', { employeeId: e.colleague }),
    otherOwner: { organizationId: otherOrg, user: { id: u.otherOwner, display_name: 'otherOwner' }, role: 'OWNER', employeeId: null, plannerScopeType: null, scopedAreaIds: [], scopedEmployeeIds: [], scopedAreaId: null },
  };
  return { org, otherOrg, areaA, areaB, u, e, ctx };
}

const request = (s, patch = {}) => createTimeOffRequest(sql, s.ctx.requester, { requestType: 'VACATION', startDate: d(10), endDate: d(14), comment: 'Verano', ...patch }, { today: TODAY });
const envelopeOf = async (requestId) => (await sql`SELECT id, status FROM approval_requests WHERE time_off_request_id = ${requestId}`)[0];
const approve = async (s, who, requestId, opts = { today: TODAY }) => approveTimeOffRequest(sql, s.ctx[who], (await envelopeOf(requestId)).id, opts);
const shiftsOf = (s, employee = s.e.requester) => sql`SELECT id, TO_CHAR(date, 'YYYY-MM-DD') AS date, shift_type, start_time, end_time, effective_state, provenance, origin, counts_as_work, layer, time_off_request_id, change_id
  FROM shifts WHERE organization_id = ${s.org} AND employee_id = ${employee} ORDER BY date, effective_state, id`;
const manualShift = (s, date, type = 'Regular', start = '05:00', end = '13:00', employee = s.e.requester) => sql`
  INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin, shift_type, counts_as_work, layer, provenance, effective_state)
  VALUES (${s.org}, ${employee}, ${s.areaA}, ${date}, ${start}, ${end}, ${type}, 'MAN', ${type}, ${type === 'Regular'}, 'CHANGE', 'MANUAL_ADMIN_CHANGE', 'EFFECTIVE') RETURNING id`;
async function planning(s) {
  const schedule = uuid(); const draft = uuid();
  await sql`INSERT INTO schedules (id, organization_id, period_start, period_end, created_by_user_id) VALUES (${schedule}, ${s.org}, ${d(0)}, ${d(40)}, ${s.u.owner})`;
  await sql`INSERT INTO schedule_versions (id, schedule_id, version_number, status, created_by_user_id) VALUES (${draft}, ${schedule}, 1, 'DRAFT', ${s.u.owner})`;
  return { schedule, draft };
}

describe.skipIf(!url)('vacation approval, materialisation and protection against PostgreSQL (F3)', { timeout: 120_000 }, () => {
  afterAll(async () => { await sql.end(); }, 30_000);

  describe('approve → materialise (F3-M02)', () => {
    it('supersedes the previous EFFECTIVE shifts, inserts one Vacaciones EFFECTIVE row per day linked to the request, records a REPLACE_DAY change per day and replaces draft assignments', async () => {
      const s = await seed(); const p = await planning(s);
      const r = await request(s);
      await manualShift(s, d(10)); await manualShift(s, d(12), 'Regular', '14:00', '22:00');
      await sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${p.draft}, ${s.e.requester}, ${d(11)}, '05:00', '13:00', 'Regular', TRUE), (${p.draft}, ${s.e.colleague}, ${d(11)}, '05:00', '13:00', 'Regular', TRUE)`;

      const result = await approve(s, 'admin', r.id);
      expect(result).toMatchObject({ requestedDays: 5, materializedDays: 5, skippedPastDays: 0, effectiveStartDate: d(10) });
      expect(result.materialized).toMatchObject({ shiftsCreated: 5, shiftsSuperseded: 2, draftAssignmentsReplaced: 1 });
      expect(result.approvalRequest).toMatchObject({ kind: 'TIME_OFF', status: 'APPROVED' });
      expect(result.timeOffRequest).toMatchObject({ status: 'APPROVED', appliedStartDate: d(10), appliedDays: 5, skippedPastDays: 0 });

      const rows = await shiftsOf(s);
      const effective = rows.filter((x) => x.effective_state === 'EFFECTIVE');
      expect(effective.map((x) => x.date)).toEqual([d(10), d(11), d(12), d(13), d(14)]);
      for (const row of effective) {
        expect(row).toMatchObject({ shift_type: 'Vacaciones', provenance: 'EMPLOYEE_REQUEST', origin: 'MAN', counts_as_work: false, layer: 'CHANGE', time_off_request_id: r.id });
        expect(row.start_time).toBeNull();
        expect(row.end_time).toBeNull();
        expect(row.change_id).toBeTruthy();
      }
      expect(rows.some((x) => /baja/i.test(x.shift_type ?? ''))).toBe(false); // VACATION is never Baja (INV-14)
      expect(rows.filter((x) => x.effective_state === 'SUPERSEDED').map((x) => x.shift_type)).toEqual(['Regular', 'Regular']);

      const changes = await sql`SELECT change_type, source, approval_status, reason, self_change, actor_role, jsonb_array_length(before_state) AS before_n FROM calendar_changes WHERE organization_id = ${s.org} ORDER BY date`;
      expect(changes).toHaveLength(5);
      expect(changes.every((c) => c.change_type === 'REPLACE_DAY' && c.source === 'EMPLOYEE_REQUEST' && c.approval_status === 'APPROVED' && c.reason === `time_off_request:${r.id}` && c.self_change === false && c.actor_role === 'ADMIN')).toBe(true);
      expect(changes.map((c) => Number(c.before_n))).toEqual([1, 0, 1, 0, 0]);

      const drafts = await sql`SELECT employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, shift_type, counts_as_work, start_time FROM shift_assignments WHERE schedule_version_id = ${p.draft} ORDER BY employee_id, date`;
      expect(drafts.filter((x) => x.employee_id === s.e.requester)).toEqual([{ employee_id: s.e.requester, date: d(11), shift_type: 'Vacaciones', counts_as_work: false, start_time: null }]);
      expect(drafts.filter((x) => x.employee_id === s.e.colleague)).toHaveLength(1); // somebody else's assignment untouched

      expect((await sql`SELECT status, applied_start_date::text AS s, applied_days, resolved_by_user_id FROM time_off_requests WHERE id = ${r.id}`)[0]).toMatchObject({ status: 'APPROVED', applied_days: 5, resolved_by_user_id: s.u.admin });
      expect((await envelopeOf(r.id)).status).toBe('APPROVED');
      expect((await sql`SELECT event_type, actor_user_id FROM organization_audit_events WHERE organization_id = ${s.org} AND target_id = ${r.id} AND event_type = 'time_off_request.approved'`)).toEqual([{ event_type: 'time_off_request.approved', actor_user_id: s.u.admin }]);
      expect((await sql`SELECT type, resource_type FROM notifications WHERE user_id = ${s.u.requester} AND resource_id = ${r.id}`)).toEqual([{ type: 'TIME_OFF_REQUEST_RESOLVED', resource_type: 'TIME_OFF_REQUEST' }]);
    });

    it('OD-08: an approval after the start materialises only [today, end]; past days are never back-dated and history is not mutated', async () => {
      const s = await seed();
      const r = await request(s, { startDate: d(0), endDate: d(6) });
      const pastShift = (await manualShift(s, d(1)))[0].id; // inside the skipped past
      const result = await approve(s, 'owner', r.id, { today: d(3) });
      expect(result).toMatchObject({ requestedDays: 7, materializedDays: 4, skippedPastDays: 3, effectiveStartDate: d(3) });
      expect(result.materializedDays + result.skippedPastDays).toBe(result.requestedDays);
      expect(result.timeOffRequest).toMatchObject({ appliedStartDate: d(3), appliedDays: 4, skippedPastDays: 3 });
      const rows = await shiftsOf(s);
      expect(rows.filter((x) => x.time_off_request_id).map((x) => x.date)).toEqual([d(3), d(4), d(5), d(6)]);
      expect((await sql`SELECT effective_state FROM shifts WHERE id = ${pastShift}`)[0].effective_state).toBe('EFFECTIVE');
      expect((await sql`SELECT COUNT(*)::int AS n FROM calendar_changes WHERE organization_id = ${s.org} AND date < ${d(3)}`)[0].n).toBe(0);
    });

    it('a range that is entirely in the past is 422 TIME_OFF_START_PASSED_ALL and changes nothing', async () => {
      const s = await seed();
      const r = await request(s, { startDate: d(0), endDate: d(2) });
      const error = await rejects(approve(s, 'owner', r.id, { today: d(5) }));
      expect(error).toMatchObject({ status: 422, code: 'TIME_OFF_START_PASSED_ALL' });
      expect((await sql`SELECT status FROM time_off_requests WHERE id = ${r.id}`)[0].status).toBe('PENDING');
      expect((await envelopeOf(r.id)).status).toBe('PENDING');
      expect(await shiftsOf(s)).toEqual([]);
    });

    it('is idempotent and transactional: a replay is 409 with the decision and writes nothing; two concurrent approvals produce exactly one materialisation', async () => {
      const s = await seed();
      const r = await request(s);
      const first = await approve(s, 'admin', r.id);
      const before = (await shiftsOf(s)).length;
      const replay = await rejects(approve(s, 'owner', r.id));
      expect(replay).toMatchObject({ status: 409, decision: { by: 'admin' } });
      expect((await shiftsOf(s)).length).toBe(before);
      expect(first.materialized.shiftsCreated).toBe(5);

      const r2 = await request(s, { startDate: d(20), endDate: d(22) });
      const settled = await Promise.allSettled([approve(s, 'admin', r2.id), approve(s, 'owner', r2.id)]);
      expect(settled.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(settled.filter((x) => x.status === 'rejected').map((x) => x.reason.status)).toEqual([409]);
      expect((await sql`SELECT COUNT(*)::int AS n FROM shifts WHERE time_off_request_id = ${r2.id}`)[0].n).toBe(3);
    });

    it('APPROVED is terminal: it cannot be cancelled, rejected or approved again', async () => {
      const s = await seed();
      const r = await request(s);
      await approve(s, 'admin', r.id);
      const env = await envelopeOf(r.id);
      expect(await rejects(rejectTimeOffRequest(sql, s.ctx.admin, env.id, 'tarde'))).toMatchObject({ status: 409 });
      expect((await sql`SELECT status FROM time_off_requests WHERE id = ${r.id}`)[0].status).toBe('APPROVED');
    });

    it('a day that already holds a full-day Vacaciones is neither superseded nor duplicated', async () => {
      const s = await seed();
      const r = await request(s);
      await manualShift(s, d(11), 'Vacaciones', null, null);
      const result = await approve(s, 'admin', r.id);
      expect(result.materialized).toMatchObject({ shiftsCreated: 4, shiftsSuperseded: 0, daysAlreadyAbsent: 1 });
      expect((await shiftsOf(s)).filter((x) => x.date === d(11) && x.effective_state === 'EFFECTIVE')).toHaveLength(1);
    });

    it('a type that has no shift_type mapping cannot be materialised: 422 and no state change', async () => {
      const s = await seed();
      const r = await request(s);
      await sql`UPDATE time_off_requests SET request_type = 'SICK_LEAVE' WHERE id = ${r.id}`;
      expect(await rejects(approve(s, 'admin', r.id))).toMatchObject({ status: 422, code: 'TIME_OFF_TYPE_NOT_MATERIALIZABLE' });
      expect((await sql`SELECT status FROM time_off_requests WHERE id = ${r.id}`)[0].status).toBe('PENDING');
      expect(await shiftsOf(s)).toEqual([]);
    });
  });

  describe('reject', () => {
    it('needs a reason, mirrors REJECTED on the envelope, touches no calendar row, notifies the employee and is audited', async () => {
      const s = await seed();
      const r = await request(s);
      const env = await envelopeOf(r.id);
      expect(await rejects(rejectTimeOffRequest(sql, s.ctx.admin, env.id, '   '))).toMatchObject({ status: 400 });
      expect(await rejects(rejectTimeOffRequest(sql, s.ctx.admin, env.id, 'x'.repeat(2001)))).toMatchObject({ status: 400 });
      const result = await rejectTimeOffRequest(sql, s.ctx.admin, env.id, 'Hay cobertura mínima');
      expect(result.timeOffRequest).toMatchObject({ status: 'REJECTED', rejectionReason: 'Hay cobertura mínima' });
      expect((await sql`SELECT status, rejection_reason FROM approval_requests WHERE id = ${env.id}`)[0]).toEqual({ status: 'REJECTED', rejection_reason: 'Hay cobertura mínima' });
      expect(await shiftsOf(s)).toEqual([]);
      expect((await sql`SELECT COUNT(*)::int AS n FROM calendar_changes WHERE organization_id = ${s.org}`)[0].n).toBe(0);
      expect((await sql`SELECT type FROM notifications WHERE user_id = ${s.u.requester} AND resource_id = ${r.id}`)[0].type).toBe('TIME_OFF_REQUEST_RESOLVED');
      expect((await sql`SELECT event_type FROM organization_audit_events WHERE organization_id = ${s.org} AND target_id = ${r.id} AND event_type = 'time_off_request.rejected'`)).toHaveLength(1);
      expect(await rejects(approve(s, 'admin', r.id))).toMatchObject({ status: 409 });
    });
  });

  describe('eligibility on the decision (scope, policy, anti-self-approval, tenant)', () => {
    it('anti-self-approval by userId (requester is also an ADMIN) and by employeeId (another account of the same employee) ⇒ 403 self_approval_forbidden', async () => {
      const s = await seed();
      const r = await request(s);
      await sql`UPDATE memberships SET role = 'ADMIN' WHERE user_id = ${s.u.requester} AND organization_id = ${s.org}`;
      const asAdmin = { ...s.ctx.requester, role: 'ADMIN' };
      expect(await rejects(approveTimeOffRequest(sql, asAdmin, (await envelopeOf(r.id)).id, { today: TODAY }))).toMatchObject({ status: 403, code: 'self_approval_forbidden' });
      // a different user id, but the session is linked to the SAME employee
      const otherAccount = { ...s.ctx.owner, user: { id: s.u.owner, display_name: 'owner' }, employeeId: s.e.requester };
      expect(await rejects(approveTimeOffRequest(sql, otherAccount, (await envelopeOf(r.id)).id, { today: TODAY }))).toMatchObject({ status: 403, code: 'self_approval_forbidden' });
      expect(await rejects(rejectTimeOffRequest(sql, otherAccount, (await envelopeOf(r.id)).id, 'no'))).toMatchObject({ status: 403, code: 'self_approval_forbidden' });
      expect((await sql`SELECT status FROM time_off_requests WHERE id = ${r.id}`)[0].status).toBe('PENDING');
    });

    it('ORGANIZATION_ADMIN policy: OWNER, ADMIN and an organisation-wide PLANNER decide; scoped planners are in scope or not, but never entitled by policy', async () => {
      const s = await seed({ policy: 'ORGANIZATION_ADMIN' });
      const outcomes = {};
      for (const who of ['plannerA', 'plannerEmp', 'plannerB', 'plannerOtherEmp']) {
        const r = await request(s, { startDate: d(10 + Object.keys(outcomes).length * 7), endDate: d(11 + Object.keys(outcomes).length * 7) });
        const error = await rejects(approve(s, who, r.id));
        outcomes[who] = [error.status, error.message];
      }
      expect(outcomes.plannerA[0]).toBe(403); // in scope (area A) but the policy reserves the decision for the organisation level
      expect(outcomes.plannerEmp[0]).toBe(403); // in scope (that employee), same
      expect(outcomes.plannerB[0]).toBe(404); // out of scope: it does not exist for them
      expect(outcomes.plannerOtherEmp[0]).toBe(404);
      for (const who of ['plannerOrg', 'admin', 'owner']) {
        const r = await request(s, { startDate: d(60 + Object.keys(outcomes).length * 7), endDate: d(61 + Object.keys(outcomes).length * 7) });
        outcomes[who] = [(await approve(s, who, r.id)).approvalRequest.status];
      }
      expect([outcomes.plannerOrg, outcomes.admin, outcomes.owner]).toEqual([['APPROVED'], ['APPROVED'], ['APPROVED']]);
    });

    it('AREA_RESPONSIBLE policy: the planner of that area and the planner of that employee decide; the planner of another area / another employee gets 404', async () => {
      const s = await seed({ policy: 'AREA_RESPONSIBLE' });
      const a = await request(s, { startDate: d(10), endDate: d(11) });
      expect(await rejects(approve(s, 'plannerB', a.id))).toMatchObject({ status: 404 });
      expect(await rejects(approve(s, 'plannerOtherEmp', a.id))).toMatchObject({ status: 404 });
      expect((await approve(s, 'plannerA', a.id)).approvalRequest.status).toBe('APPROVED');
      const b = await request(s, { startDate: d(20), endDate: d(21) });
      expect((await approve(s, 'plannerEmp', b.id)).approvalRequest.status).toBe('APPROVED');
      // the OWNER always decides; an ADMIN who is not the area's responsible is not entitled by policy (403, in scope)
      const c = await request(s, { startDate: d(30), endDate: d(31) });
      expect(await rejects(approve(s, 'admin', c.id))).toMatchObject({ status: 403 });
      expect((await approve(s, 'owner', c.id)).approvalRequest.status).toBe('APPROVED');
    });

    it('TENANT ISOLATION: a manager of another organisation, and an EMPLOYEE session, cannot read or decide (404 / 403)', async () => {
      const s = await seed();
      const r = await request(s);
      const env = await envelopeOf(r.id);
      // another tenant: the envelope does not exist for it (null ⇒ the legacy path runs and ends in 404)
      expect(await approveTimeOffRequest(sql, s.ctx.otherOwner, env.id, { today: TODAY })).toBeNull();
      expect(await rejectTimeOffRequest(sql, s.ctx.otherOwner, env.id, 'no')).toBeNull();
      expect(await rejects(approveTimeOffRequest(sql, s.ctx.colleague, env.id, { today: TODAY }))).toMatchObject({ status: 403 });
      expect((await listTimeOffApprovals(sql, s.ctx.otherOwner, parseApprovalQuery({ kind: 'TIME_OFF' }), { today: TODAY })).requests).toEqual([]);
      expect((await sql`SELECT status FROM time_off_requests WHERE id = ${r.id}`)[0].status).toBe('PENDING');
    });

    it('an unassigned PLANNER (no areas / employees) fails closed with SCOPE_UNAVAILABLE', async () => {
      const s = await seed();
      const r = await request(s);
      const unassigned = { ...s.ctx.plannerA, scopedAreaIds: [] };
      expect(await rejects(approveTimeOffRequest(sql, unassigned, (await envelopeOf(r.id)).id, { today: TODAY }))).toMatchObject({ status: 403, code: 'SCOPE_UNAVAILABLE' });
    });
  });

  describe('GET list (F3-M01)', () => {
    it('filters by scope IN THE QUERY: every manager sees exactly their scope; canDecide / cannotDecideReason follow the policy; overlapping shows only visible colleagues', async () => {
      const s = await seed({ policy: 'ORGANIZATION_ADMIN' });
      const mine = await request(s, { startDate: d(10), endDate: d(14) });
      const colleague = await createTimeOffRequest(sql, s.ctx.colleague, { requestType: 'VACATION', startDate: d(12), endDate: d(16) }, { today: TODAY });
      const list = (who, q = { kind: 'TIME_OFF' }) => listTimeOffApprovals(sql, s.ctx[who], parseApprovalQuery(q), { today: TODAY });

      const admin = await list('admin');
      expect(admin.requests.map((x) => x.timeOffRequestId).sort()).toEqual([mine.id, colleague.id].sort());
      const row = admin.requests.find((x) => x.timeOffRequestId === mine.id);
      expect(row).toMatchObject({ kind: 'TIME_OFF', employeeName: 'Requester', areaName: 'Area A', status: 'PENDING', canDecide: true, cannotDecideReason: null, alreadyStarted: false, materializableDays: 5, skippedPastDays: 0 });
      expect(row.overlapping.map((o) => o.name)).toEqual(['Colleague']);

      const plannerA = await list('plannerA');
      expect(plannerA.requests).toHaveLength(2); // both in area A
      expect(plannerA.requests.every((x) => x.canDecide === false && x.cannotDecideReason === 'POLICY')).toBe(true);
      expect((await list('plannerB')).requests).toEqual([]);
      const plannerEmp = await list('plannerEmp');
      expect(plannerEmp.requests.map((x) => x.timeOffRequestId)).toEqual([mine.id]);
      expect(plannerEmp.requests[0].overlapping).toEqual([]); // the colleague is out of that planner's scope: not even their name leaks
      expect((await list('plannerOtherEmp')).requests.map((x) => x.timeOffRequestId)).toEqual([colleague.id]);

      // SELF_REQUEST stays visible (the card explains why there are no actions)
      await sql`UPDATE memberships SET role = 'ADMIN' WHERE user_id = ${s.u.requester} AND organization_id = ${s.org}`;
      const asAdmin = await listTimeOffApprovals(sql, { ...s.ctx.requester, role: 'ADMIN' }, parseApprovalQuery({ kind: 'TIME_OFF' }), { today: TODAY });
      expect(asAdmin.requests.find((x) => x.timeOffRequestId === mine.id)).toMatchObject({ canDecide: false, cannotDecideReason: 'SELF_REQUEST' });
      expect(asAdmin.requests.find((x) => x.timeOffRequestId === colleague.id)).toMatchObject({ canDecide: true });
    });

    it('HISTORY lists decided requests, status/area/employee/q filters and keyset pagination work', async () => {
      const s = await seed();
      const a = await request(s, { startDate: d(10), endDate: d(11) });
      const b = await request(s, { startDate: d(20), endDate: d(21) });
      const c = await createTimeOffRequest(sql, s.ctx.colleague, { requestType: 'VACATION', startDate: d(30), endDate: d(31) }, { today: TODAY });
      await approve(s, 'admin', a.id); await rejectTimeOffRequest(sql, s.ctx.admin, (await envelopeOf(b.id)).id, 'no');
      const list = (q) => listTimeOffApprovals(sql, s.ctx.admin, parseApprovalQuery({ kind: 'TIME_OFF', ...q }), { today: TODAY });
      expect((await list({ status: 'HISTORY' })).requests.map((x) => x.status).sort()).toEqual(['APPROVED', 'REJECTED']);
      expect((await list({ status: 'PENDING' })).requests.map((x) => x.timeOffRequestId)).toEqual([c.id]);
      expect((await list({ status: 'HISTORY', employeeId: s.e.colleague })).requests).toEqual([]);
      expect((await list({ status: 'HISTORY', areaId: s.areaB })).requests).toEqual([]);
      expect((await list({ status: 'HISTORY', q: 'requ' })).requests).toHaveLength(2);
      const page1 = await list({ status: 'HISTORY', limit: '1' });
      expect(page1.requests).toHaveLength(1);
      expect(page1.nextCursor).toBeTruthy();
      const page2 = await list({ status: 'HISTORY', limit: '1', cursor: page1.nextCursor });
      expect(page2.requests).toHaveLength(1);
      expect(page2.requests[0].timeOffRequestId).not.toBe(page1.requests[0].timeOffRequestId);
      const approved = (await list({ status: 'HISTORY' })).requests.find((x) => x.status === 'APPROVED');
      expect(approved).toMatchObject({ appliedStartDate: d(10), appliedDays: 2 });
    });

    it('flags an already-started request before the decision (OD-08 preview)', async () => {
      const s = await seed();
      await request(s, { startDate: d(0), endDate: d(6) });
      const [row] = (await listTimeOffApprovals(sql, s.ctx.admin, parseApprovalQuery({ kind: 'TIME_OFF' }), { today: d(3) })).requests;
      expect(row).toMatchObject({ alreadyStarted: true, effectiveStartDate: d(3), materializableDays: 4, skippedPastDays: 3 });
    });
  });

  describe('planning protection (F3-M03)', () => {
    it('createAssignment / updateAssignment refuse a protected day (422 PROTECTED_ABSENCE_DAY); other days and other employees are unaffected', async () => {
      const s = await seed(); const p = await planning(s);
      const r = await request(s, { startDate: d(10), endDate: d(12) });
      await approve(s, 'admin', r.id);
      const input = (employeeId, date) => ({ employeeId, date, startTime: '05:00', endTime: '13:00' });
      expect(await rejects(createAssignment(sql, s.ctx.owner, p.schedule, p.draft, input(s.e.requester, d(11))))).toMatchObject({ status: 422, code: 'PROTECTED_ABSENCE_DAY' });
      const free = await createAssignment(sql, s.ctx.owner, p.schedule, p.draft, input(s.e.requester, d(15)));
      expect(free.date).toBe(d(15));
      expect((await createAssignment(sql, s.ctx.owner, p.schedule, p.draft, input(s.e.colleague, d(11)))).employeeId).toBe(s.e.colleague);
      expect(await rejects(updateAssignment(sql, s.ctx.owner, p.schedule, p.draft, free.id, { date: d(12), startTime: '05:00', endTime: '13:00' }))).toMatchObject({ status: 422, code: 'PROTECTED_ABSENCE_DAY' });
      expect((await updateAssignment(sql, s.ctx.owner, p.schedule, p.draft, free.id, { date: d(16), startTime: '05:00', endTime: '13:00' })).date).toBe(d(16));
    });

    it('the planner snapshot shows the approved vacation as a blocked day (calendarShifts with timeOffRequestId)', async () => {
      const s = await seed(); const p = await planning(s);
      const r = await request(s, { startDate: d(10), endDate: d(11) });
      await approve(s, 'admin', r.id);
      const snapshot = await getScheduleSnapshot(sql, s.ctx.owner, p.schedule, p.draft);
      const blocked = snapshot.calendarShifts.filter((x) => x.employeeId === s.e.requester);
      expect(blocked.map((x) => [x.date, x.shiftType, x.countsAsWork, x.timeOffRequestId])).toEqual([[d(10), 'Vacaciones', false, r.id], [d(11), 'Vacaciones', false, r.id]]);
    });

    it('publication excludes an assignment on a protected day (reason PROTECTED_ABSENCE) and never creates a shift on top of the vacation; a new draft does not copy it', async () => {
      const s = await seed(); const p = await planning(s);
      const r = await request(s, { startDate: d(10), endDate: d(11) });
      await approve(s, 'admin', r.id);
      // bypass the planner guard on purpose (legacy rows / concurrent edits): the publish gate must hold on its own
      await sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES
        (${p.draft}, ${s.e.requester}, ${d(10)}, '05:00', '13:00', 'Regular', TRUE), (${p.draft}, ${s.e.requester}, ${d(13)}, '05:00', '13:00', 'Regular', TRUE)`;
      const published = await publishScheduleVersion(sql, s.ctx.owner, p.schedule, p.draft);
      expect(published.excludedAssignments).toHaveLength(1);
      expect(published.excludedAssignments[0]).toMatchObject({ employeeId: s.e.requester, reason: 'PROTECTED_ABSENCE' });
      const effective = (await shiftsOf(s)).filter((x) => x.effective_state === 'EFFECTIVE');
      expect(effective.filter((x) => x.date === d(10))).toHaveLength(1); // only the vacation
      expect(effective.filter((x) => x.date === d(10))[0].shift_type).toBe('Vacaciones');
      expect(effective.filter((x) => x.date === d(13))).toHaveLength(1); // the legitimate day was published
      // a second publication path: assignments of protected pairs are not carried into a new draft
      await sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${p.draft}, ${s.e.requester}, ${d(11)}, '05:00', '13:00', 'Regular', TRUE)`;
      const next = await createNewDraftFromVersion(sql, s.ctx.owner, p.schedule, p.draft);
      const copied = await sql`SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date FROM shift_assignments WHERE schedule_version_id = ${next.newVersionId} AND employee_id = ${s.e.requester} ORDER BY date`;
      expect(copied.map((x) => x.date)).not.toContain(d(11));
      expect(copied.map((x) => x.date)).not.toContain(d(10));
      expect(copied.map((x) => x.date)).toContain(d(13));
    });

    it('publication without any vacation behaves exactly as before (manual publication regression)', async () => {
      const s = await seed(); const p = await planning(s);
      await sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES (${p.draft}, ${s.e.requester}, ${d(10)}, '05:00', '13:00', 'Regular', TRUE)`;
      const published = await publishScheduleVersion(sql, s.ctx.owner, p.schedule, p.draft);
      expect(published.excludedAssignments).toEqual([]);
      expect((await shiftsOf(s)).filter((x) => x.effective_state === 'EFFECTIVE').map((x) => x.shift_type)).toEqual(['Regular']);
    });
  });

  describe('audited override (F3-M05)', () => {
    async function conflict() {
      const s = await seed();
      const r = await request(s, { startDate: d(10), endDate: d(11) });
      await approve(s, 'admin', r.id);
      const absence = (await shiftsOf(s)).find((x) => x.date === d(10) && x.effective_state === 'EFFECTIVE');
      // what an import writes on a protected day: the proposal waits as REQUIRES_REVIEW, the absence stays EFFECTIVE
      const proposal = (await sql`
        INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin, shift_type, counts_as_work, layer, provenance, effective_state)
        VALUES (${s.org}, ${s.e.requester}, ${s.areaA}, ${d(10)}, '05:00', '13:00', '', 'IMP', 'Regular', TRUE, 'CHANGE', 'SYSTEM', 'REQUIRES_REVIEW') RETURNING id`)[0].id;
      return { s, r, absence, proposal };
    }
    const reconcile = (s, who, keep, date = d(10)) => reconcileCalendarDay(sql, s.ctx[who], { employeeId: s.e.requester, date, reason: 'Resolución de prueba', keepShiftIds: keep });

    it('PLANNER choosing the proposal ⇒ 403 PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN and nothing changes (every planner scope)', async () => {
      const { s, r, absence, proposal } = await conflict();
      for (const who of ['plannerOrg', 'plannerA', 'plannerEmp']) {
        expect(await rejects(reconcile(s, who, [proposal]))).toMatchObject({ status: 403, code: 'PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN' });
      }
      const rows = await sql`SELECT id, effective_state FROM shifts WHERE id = ANY(${[absence.id, proposal]}::uuid[])`;
      expect(Object.fromEntries(rows.map((x) => [x.id, x.effective_state]))).toEqual({ [absence.id]: 'EFFECTIVE', [proposal]: 'REQUIRES_REVIEW' });
      expect((await sql`SELECT COUNT(*)::int AS n FROM organization_audit_events WHERE target_id = ${r.id} AND event_type = 'time_off_request.manual_override'`)[0].n).toBe(0);
    });

    it('"Mantener actual": any manager in scope may keep the vacation; the proposal is SUPERSEDED, no override is recorded', async () => {
      const { s, r, absence, proposal } = await conflict();
      const result = await reconcile(s, 'plannerA', [absence.id]);
      expect(result).toMatchObject({ kept: 1, dropped: 1, overriddenAbsences: 0 });
      const rows = await sql`SELECT id, effective_state FROM shifts WHERE id = ANY(${[absence.id, proposal]}::uuid[])`;
      expect(Object.fromEntries(rows.map((x) => [x.id, x.effective_state]))).toEqual({ [absence.id]: 'EFFECTIVE', [proposal]: 'SUPERSEDED' });
      expect((await sql`SELECT COUNT(*)::int AS n FROM organization_audit_events WHERE target_id = ${r.id} AND event_type = 'time_off_request.manual_override'`)[0].n).toBe(0);
    });

    it('OWNER and ADMIN may use the proposal: the absence is SUPERSEDED, the proposal EFFECTIVE, the override is audited with the real actor, and the request stays APPROVED', async () => {
      for (const who of ['owner', 'admin']) {
        const { s, r, absence, proposal } = await conflict();
        const result = await reconcile(s, who, [proposal]);
        expect(result).toMatchObject({ kept: 1, dropped: 1, overriddenAbsences: 1 });
        const rows = await sql`SELECT id, effective_state FROM shifts WHERE id = ANY(${[absence.id, proposal]}::uuid[])`;
        expect(Object.fromEntries(rows.map((x) => [x.id, x.effective_state]))).toEqual({ [absence.id]: 'SUPERSEDED', [proposal]: 'EFFECTIVE' });
        const audit = await sql`SELECT actor_user_id, target_type, metadata FROM organization_audit_events WHERE target_id = ${r.id} AND event_type = 'time_off_request.manual_override'`;
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ actor_user_id: s.u[who], target_type: 'TIME_OFF_REQUEST' });
        expect(audit[0].metadata).toMatchObject({ actorRole: who.toUpperCase(), employeeId: s.e.requester, replacedShiftIds: [absence.id] });
        expect((await sql`SELECT status FROM time_off_requests WHERE id = ${r.id}`)[0].status).toBe('APPROVED');
        expect((await sql`SELECT status FROM approval_requests WHERE time_off_request_id = ${r.id}`)[0].status).toBe('APPROVED');
      }
    });

    it('resolving an ordinary (non-vacation) review day is unchanged: a PLANNER may pick either row', async () => {
      const s = await seed();
      const a = (await manualShift(s, d(10)))[0].id;
      const b = (await sql`
        INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin, shift_type, counts_as_work, layer, provenance, effective_state)
        VALUES (${s.org}, ${s.e.requester}, ${s.areaA}, ${d(10)}, '06:00', '14:00', '', 'IMP', 'Regular', TRUE, 'CHANGE', 'SYSTEM', 'REQUIRES_REVIEW') RETURNING id`)[0].id;
      expect(await reconcile(s, 'plannerA', [b])).toMatchObject({ kept: 1, dropped: 1, overriddenAbsences: 0 });
      expect((await sql`SELECT effective_state FROM shifts WHERE id = ${a}`)[0].effective_state).toBe('SUPERSEDED');
    });
  });
});
