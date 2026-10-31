/**
 * Manager side of time off (F3, spec §4.3 / §4.4.2): the `TIME_OFF` branch of the unified approval envelope.
 *
 *  - `listTimeOffApprovals`  → `GET /api/approval-requests?kind=TIME_OFF|ALL`
 *  - `approveTimeOffRequest` → `POST /api/approval-requests/:id/approve` when the envelope's subject is a time-off request
 *  - `rejectTimeOffRequest`  → `POST /api/approval-requests/:id/reject`
 *
 * Authorisation is the canonical chain, never a role-only or `scoped_area_id`-only check (INV-13):
 * `resolveEffectiveAccessScope` (fail closed for an unassigned PLANNER) → `isTargetInScope` → eligibility (`can(APPROVE_REQUEST)` +
 * organisation policy + anti-self-approval by `userId` AND `employeeId`). The scope also filters IN THE QUERY, so nothing out of scope
 * is ever loaded. Out of scope ⇒ 404 (it does not exist for this actor); never a 200 with foreign data.
 *
 * Approving materialises the vacation in ONE gated statement (a data-modifying CTE chain keyed on the PENDING→APPROVED update of
 * the request itself), so it is atomic and idempotent: a replay finds the request no longer PENDING and writes nothing (409).
 */
import { HttpError, resolveEffectiveAccessScope } from './auth.js';
import { isTargetInScope } from './authorization.js';
import { CANNOT_DECIDE, evaluateApprovalEligibility } from './approval-eligibility.js';
import { recordAuditEvent } from './data.js';
import { getOperationalDate } from './operational-date.js';
import { loadApprovalCandidates } from './time-off-data.js';
import {
  mapTimeOffRequestRow,
  previewApplicationRange,
  resolveApplicationRange,
  timeOffError,
  TIME_OFF_SHIFT_TYPE,
} from './time-off.js';

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN', 'PLANNER']);
const MAX_REASON = 2000;
const MAX_LIMIT = 100;
export const APPROVAL_KINDS = Object.freeze(['ALL', 'SHIFT_CHANGE', 'TIME_OFF']);
export const APPROVAL_STATUS_FILTERS = Object.freeze(['PENDING', 'HISTORY']);

/** The effective actor as the authorisation layer expects it (all facts come from the session, never from the client). */
export function actorFromContext(ctx) {
  return {
    userId: ctx.user?.id ?? null,
    role: ctx.role,
    employeeId: ctx.employeeId ?? null,
    plannerScopeType: ctx.plannerScopeType ?? null,
    scopedAreaId: ctx.scopedAreaId ?? null,
    scopedAreaIds: ctx.scopedAreaIds ?? [],
    scopedEmployeeIds: ctx.scopedEmployeeIds ?? [],
  };
}

/** Scope → the constants the SQL predicate needs. */
function scopeFilter(scope) {
  if (scope.type === 'SELF') throw new HttpError(403, 'Approver access required');
  if (scope.type === 'EMPLOYEES') return { kind: 'EMPLOYEES', areaIds: [], employeeIds: scope.employeeIds ?? [] };
  if (scope.type === 'AREAS') return { kind: 'AREAS', areaIds: scope.areaIds ?? [], employeeIds: [] };
  if (scope.type === 'AREA') return { kind: 'AREAS', areaIds: [scope.areaId].filter(Boolean), employeeIds: [] };
  return { kind: 'ORGANIZATION', areaIds: [], employeeIds: [] };
}

async function resolveApproverScope(sql, ctx) {
  if (!MANAGER_ROLES.has(ctx?.role)) throw new HttpError(403, 'Approver access required');
  const scope = await resolveEffectiveAccessScope(sql, ctx);
  return { scope, filter: scopeFilter(scope) };
}

const encodeCursor = (createdAt, id) => Buffer.from(JSON.stringify([new Date(createdAt).toISOString(), id])).toString('base64url');
function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error('bad cursor');
    return { createdAt, id };
  } catch {
    throw timeOffError(400, 'Invalid cursor', 'INVALID_INPUT');
  }
}

export function parseApprovalQuery(query = {}) {
  const kind = String(query.kind ?? '').trim().toUpperCase();
  if (kind && !APPROVAL_KINDS.includes(kind)) throw timeOffError(400, 'Invalid approval kind', 'INVALID_INPUT');
  const status = String(query.status ?? 'PENDING').trim().toUpperCase() || 'PENDING';
  if (!APPROVAL_STATUS_FILTERS.includes(status)) throw timeOffError(400, 'Invalid approval request status', 'INVALID_INPUT');
  const limit = query.limit === undefined || query.limit === '' ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw timeOffError(400, 'Invalid limit', 'INVALID_INPUT');
  const uuid = (value, name) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) throw timeOffError(400, `Invalid ${name}`, 'INVALID_INPUT');
    return text;
  };
  const q = String(query.q ?? '').trim().slice(0, 100);
  return { kind: kind || null, status, limit, areaId: uuid(query.areaId, 'areaId'), employeeId: uuid(query.employeeId, 'employeeId'), q, cursor: decodeCursor(query.cursor) };
}

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));

/**
 * `GET /api/approval-requests` — the TIME_OFF items an approver may see, with the data the decision needs.
 * `canDecide=false` cards stay visible (SELF_REQUEST / POLICY) so the manager understands why there is no action;
 * anything OUT_OF_SCOPE is not returned at all.
 */
export async function listTimeOffApprovals(sql, ctx, query, { today = getOperationalDate() } = {}) {
  const { status, limit, areaId, employeeId, q, cursor } = query;
  const { filter } = await resolveApproverScope(sql, ctx);
  const actor = actorFromContext(ctx);
  const pattern = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const rows = await sql`
    SELECT ar.id AS approval_request_id, ar.policy_snapshot, o.approval_policy,
           t.id AS id, t.employee_id, t.request_type,
           TO_CHAR(t.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(t.end_date, 'YYYY-MM-DD') AS end_date,
           t.requested_days, t.comment, t.status, t.created_at, t.resolved_at, t.rejection_reason, t.cancelled_at,
           TO_CHAR(t.applied_start_date, 'YYYY-MM-DD') AS applied_start_date, t.applied_days,
           resolver.display_name AS resolved_by_name,
           e.name AS employee_name, e.area_id, e.user_id AS employee_user_id, a.name AS area_name
    FROM approval_requests ar
    JOIN time_off_requests t ON t.id = ar.time_off_request_id AND t.organization_id = ar.organization_id
    JOIN employees e ON e.id = t.employee_id AND e.organization_id = ar.organization_id
    JOIN organizations o ON o.id = ar.organization_id
    LEFT JOIN areas a ON a.id = e.area_id AND a.organization_id = ar.organization_id
    LEFT JOIN users resolver ON resolver.id = t.resolved_by_user_id
    WHERE ar.organization_id = ${ctx.organizationId}
      AND ar.time_off_request_id IS NOT NULL
      AND (
        (${status} = 'PENDING' AND t.status = 'PENDING')
        OR (${status} = 'HISTORY' AND t.status IN ('APPROVED', 'REJECTED', 'CANCELLED'))
      )
      AND (
        ${filter.kind} = 'ORGANIZATION'
        OR (${filter.kind} = 'AREAS' AND e.area_id = ANY(${filter.areaIds}::uuid[]))
        OR (${filter.kind} = 'EMPLOYEES' AND t.employee_id = ANY(${filter.employeeIds}::uuid[]))
      )
      AND (${areaId}::uuid IS NULL OR e.area_id = ${areaId}::uuid)
      AND (${employeeId}::uuid IS NULL OR t.employee_id = ${employeeId}::uuid)
      AND (${pattern}::text IS NULL OR e.name ILIKE ${pattern}::text ESCAPE '\\')
      AND (${cursor?.createdAt ?? null}::timestamptz IS NULL OR (t.created_at, ar.id) < (${cursor?.createdAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
    ORDER BY t.created_at DESC, ar.id DESC
    LIMIT ${limit + 1}
  `;
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].approval_request_id) : null;

  // Second line of defence (INV-13): the scope predicate already ran in the query, the canonical check runs on every element.
  const visible = page.filter((row) => isTargetInScope(actor, { employeeId: row.employee_id, areaId: row.area_id }));
  const pending = visible.filter((row) => row.status === 'PENDING');
  const ids = pending.map((row) => row.id);

  const overlapRows = ids.length === 0 ? [] : await sql`
    SELECT me.id AS for_id, o.employee_id, e2.name, o.status,
           TO_CHAR(o.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(o.end_date, 'YYYY-MM-DD') AS end_date
    FROM time_off_requests me
    JOIN employees em ON em.id = me.employee_id AND em.organization_id = me.organization_id
    JOIN time_off_requests o
      ON o.organization_id = me.organization_id AND o.employee_id <> me.employee_id AND o.status IN ('PENDING', 'APPROVED')
     AND daterange(o.start_date, o.end_date, '[]') && daterange(me.start_date, me.end_date, '[]')
    JOIN employees e2 ON e2.id = o.employee_id AND e2.organization_id = o.organization_id AND e2.area_id IS NOT DISTINCT FROM em.area_id
    WHERE me.organization_id = ${ctx.organizationId} AND me.id = ANY(${ids}::uuid[])
      AND (
        ${filter.kind} = 'ORGANIZATION'
        OR (${filter.kind} = 'AREAS' AND e2.area_id = ANY(${filter.areaIds}::uuid[]))
        OR (${filter.kind} = 'EMPLOYEES' AND o.employee_id = ANY(${filter.employeeIds}::uuid[]))
      )
    ORDER BY o.start_date
  `;
  const impactRows = ids.length === 0 ? [] : await sql`
    SELECT me.id AS for_id,
      (SELECT COUNT(*)::integer FROM shifts s
        WHERE s.organization_id = me.organization_id AND s.employee_id = me.employee_id AND s.effective_state = 'EFFECTIVE'
          AND s.date BETWEEN GREATEST(me.start_date, ${today}::date) AND me.end_date) AS published,
      (SELECT COUNT(*)::integer FROM shift_assignments sa
        JOIN schedule_versions sv ON sv.id = sa.schedule_version_id AND sv.status = 'DRAFT'
        JOIN schedules sc ON sc.id = sv.schedule_id AND sc.organization_id = me.organization_id
        WHERE sa.employee_id = me.employee_id AND sa.date BETWEEN GREATEST(me.start_date, ${today}::date) AND me.end_date) AS draft
    FROM time_off_requests me
    WHERE me.organization_id = ${ctx.organizationId} AND me.id = ANY(${ids}::uuid[])
  `;

  const poolByArea = new Map();
  const poolFor = async (areaOfEmployee) => {
    const key = areaOfEmployee ?? 'none';
    if (!poolByArea.has(key)) poolByArea.set(key, await loadApprovalCandidates(sql, ctx.organizationId, areaOfEmployee));
    return poolByArea.get(key);
  };

  const requests = [];
  for (const row of visible) {
    const pool = await poolFor(row.area_id);
    const decision = row.status === 'PENDING'
      ? evaluateApprovalEligibility({
        actor, policy: row.approval_policy,
        target: { employeeId: row.employee_id, areaId: row.area_id, requesterUserId: row.employee_user_id },
        candidates: pool.candidates, areaResponsibleUserIds: pool.areaResponsibleUserIds,
      })
      : { canDecide: false, cannotDecideReason: null };
    if (decision.cannotDecideReason === CANNOT_DECIDE.OUT_OF_SCOPE) continue;
    const range = { startDate: row.start_date, endDate: row.end_date };
    const preview = previewApplicationRange(range, today);
    const impact = impactRows.find((entry) => entry.for_id === row.id);
    requests.push({
      kind: 'TIME_OFF',
      id: row.approval_request_id,
      timeOffRequestId: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      areaId: row.area_id ?? null,
      areaName: row.area_name ?? null,
      requestType: row.request_type,
      startDate: row.start_date,
      endDate: row.end_date,
      requestedDays: Number(row.requested_days),
      comment: row.comment ?? '',
      status: row.status,
      createdAt: iso(row.created_at),
      resolvedAt: iso(row.resolved_at),
      resolvedByName: row.resolved_by_name ?? null,
      rejectionReason: row.rejection_reason ?? null,
      overlapping: overlapRows.filter((entry) => entry.for_id === row.id).map((entry) => ({
        employeeId: entry.employee_id, name: entry.name, startDate: entry.start_date, endDate: entry.end_date, status: entry.status,
      })),
      affectedShifts: { published: Number(impact?.published ?? 0), draft: Number(impact?.draft ?? 0) },
      alreadyStarted: preview.alreadyStarted,
      effectiveStartDate: preview.effectiveStartDate,
      materializableDays: preview.materializableDays,
      skippedPastDays: preview.skippedPastDays,
      canDecide: decision.canDecide,
      cannotDecideReason: decision.cannotDecideReason,
      ...(row.status === 'APPROVED' ? { appliedStartDate: row.applied_start_date ?? null, appliedDays: row.applied_days ?? null } : {}),
    });
  }
  return { requests, nextCursor };
}

/** Everything a decision needs, read inside the tenant. `null` when the envelope is not a time-off one (the legacy code continues). */
async function loadDecisionSubject(sql, ctx, approvalRequestId) {
  const rows = await sql`
    SELECT ar.id AS approval_request_id, ar.status AS approval_status, ar.policy_snapshot,
           t.id AS request_id, t.employee_id, t.request_type, t.status, t.comment, t.requested_days,
           TO_CHAR(t.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(t.end_date, 'YYYY-MM-DD') AS end_date,
           t.resolved_at, t.rejection_reason, resolver.display_name AS resolved_by_name,
           e.area_id, e.user_id AS employee_user_id, o.approval_policy
    FROM approval_requests ar
    JOIN time_off_requests t ON t.id = ar.time_off_request_id AND t.organization_id = ar.organization_id
    JOIN employees e ON e.id = t.employee_id AND e.organization_id = ar.organization_id
    JOIN organizations o ON o.id = ar.organization_id
    LEFT JOIN users resolver ON resolver.id = t.resolved_by_user_id
    WHERE ar.id = ${approvalRequestId} AND ar.organization_id = ${ctx.organizationId} AND ar.time_off_request_id IS NOT NULL
  `;
  return rows[0] ?? null;
}

/** Scope + eligibility for ONE subject. Throws; returns the actor on success. */
async function assertCanDecide(sql, ctx, subject) {
  await resolveApproverScope(sql, ctx);
  const actor = actorFromContext(ctx);
  const target = { employeeId: subject.employee_id, areaId: subject.area_id, requesterUserId: subject.employee_user_id };
  // Out of scope: the request does not exist for this actor.
  if (!isTargetInScope(actor, target) && !(actor.userId === subject.employee_user_id)) {
    throw new HttpError(404, 'Approval request not found');
  }
  const pool = await loadApprovalCandidates(sql, ctx.organizationId, subject.area_id);
  const decision = evaluateApprovalEligibility({
    actor, policy: subject.approval_policy, target, candidates: pool.candidates, areaResponsibleUserIds: pool.areaResponsibleUserIds,
  });
  if (decision.canDecide) return actor;
  if (decision.cannotDecideReason === CANNOT_DECIDE.SELF_REQUEST) {
    const error = new HttpError(403, 'You cannot approve your own request');
    error.code = 'self_approval_forbidden';
    throw error;
  }
  if (decision.cannotDecideReason === CANNOT_DECIDE.OUT_OF_SCOPE) throw new HttpError(404, 'Approval request not found');
  throw new HttpError(403, 'You are not eligible to approve this request');
}

function assertStillPending(subject) {
  if (subject.status === 'PENDING') return;
  const error = new HttpError(409, 'Approval request is no longer pending');
  error.decision = { by: subject.resolved_by_name ?? null, at: iso(subject.resolved_at) };
  throw error;
}

async function notifyEmployee(sql, ctx, subject) {
  if (!subject.employee_user_id) return;
  try {
    await sql`
      INSERT INTO notifications (user_id, organization_id, type, resource_type, resource_id)
      VALUES (${subject.employee_user_id}, ${ctx.organizationId}, 'TIME_OFF_REQUEST_RESOLVED', 'TIME_OFF_REQUEST', ${subject.request_id})
      ON CONFLICT (user_id, type, resource_id) DO NOTHING
    `;
  } catch (error) {
    console.error('[approval] time-off resolution notification failed', { organizationId: ctx.organizationId, error: error instanceof Error ? error.message : 'unknown' });
  }
}

/**
 * Approve a vacation and materialise it (spec §4.4.2). Range `[max(start, today), end]` (OD-08): never back-dated, the skipped past
 * days are reported. One gated statement: request→APPROVED, envelope→APPROVED, one `calendar_changes` `REPLACE_DAY` per day,
 * previous EFFECTIVE shifts→SUPERSEDED, a full-day `Vacaciones` EFFECTIVE shift per day linked to the request, and draft
 * assignments of those days replaced. A day that already holds a full-day absence of the same type is neither superseded nor duplicated.
 */
export async function approveTimeOffRequest(sql, ctx, approvalRequestId, { today = getOperationalDate() } = {}) {
  const subject = await loadDecisionSubject(sql, ctx, approvalRequestId);
  if (!subject) return null;
  await assertCanDecide(sql, ctx, subject);
  assertStillPending(subject);

  const shiftType = TIME_OFF_SHIFT_TYPE[subject.request_type];
  if (!shiftType) throw timeOffError(422, 'This time-off type cannot be materialised', 'TIME_OFF_TYPE_NOT_MATERIALIZABLE');
  const range = resolveApplicationRange({ startDate: subject.start_date, endDate: subject.end_date }, today); // 422 TIME_OFF_START_PASSED_ALL

  const [rows] = await sql.transaction((txn) => [txn`
    WITH gate AS MATERIALIZED (
      UPDATE time_off_requests t
      SET status = 'APPROVED', resolved_at = NOW(), resolved_by_user_id = ${ctx.user.id},
          applied_start_date = ${range.effectiveStartDate}::date, applied_days = ${range.materializedDays}, updated_at = NOW()
      WHERE t.id = ${subject.request_id} AND t.organization_id = ${ctx.organizationId} AND t.status = 'PENDING'
      RETURNING t.id, t.employee_id, t.organization_id, t.resolved_at
    ), envelope AS (
      UPDATE approval_requests ar
      SET status = 'APPROVED', approved_by_user_id = ${ctx.user.id}, approved_at = gate.resolved_at, applied_at = gate.resolved_at
      FROM gate
      WHERE ar.time_off_request_id = gate.id AND ar.status = 'PENDING'
      RETURNING ar.id
    ), days AS MATERIALIZED (
      SELECT g.id AS request_id, g.employee_id, g.organization_id, d::date AS day
      FROM gate g, generate_series(${range.effectiveStartDate}::date, ${subject.end_date}::date, INTERVAL '1 day') AS d
    ), prior AS MATERIALIZED (
      SELECT s.id, s.employee_id, s.date, s.shift_type, s.start_time, s.end_time, s.layer, s.provenance
      FROM shifts s
      JOIN days d ON d.organization_id = s.organization_id AND d.employee_id = s.employee_id AND d.day = s.date
      WHERE s.effective_state = 'EFFECTIVE'
    ), already AS MATERIALIZED (
      SELECT DISTINCT p.employee_id, p.date
      FROM prior p
      WHERE COALESCE(p.start_time, '') = '' AND COALESCE(p.end_time, '') = '' AND lower(btrim(COALESCE(p.shift_type, ''))) = lower(${shiftType})
    ), todo AS MATERIALIZED (
      SELECT d.* FROM days d
      WHERE NOT EXISTS (SELECT 1 FROM already a WHERE a.employee_id = d.employee_id AND a.date = d.day)
    ), change_rows AS (
      INSERT INTO calendar_changes (
        organization_id, employee_id, date, change_type, actor_user_id, actor_role, self_change, source, reason,
        before_state, after_state, approval_status, approved_by_user_id, approved_at, approval_request_id
      )
      SELECT t.organization_id, t.employee_id, t.day, 'REPLACE_DAY', ${ctx.user.id}, ${ctx.role}, FALSE, 'EMPLOYEE_REQUEST',
             'time_off_request:' || t.request_id::text,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id', p.id, 'shiftType', p.shift_type, 'startTime', NULLIF(p.start_time, ''),
                                                   'endTime', NULLIF(p.end_time, ''), 'layer', p.layer, 'provenance', p.provenance))
               FROM prior p WHERE p.employee_id = t.employee_id AND p.date = t.day
             ), '[]'::jsonb),
             jsonb_build_array(jsonb_build_object('shiftType', ${shiftType}::text, 'startTime', NULL, 'endTime', NULL, 'layer', 'CHANGE', 'provenance', 'EMPLOYEE_REQUEST')),
             'APPROVED', ${ctx.user.id}, NOW(), (SELECT id FROM envelope LIMIT 1)
      FROM todo t
      RETURNING id, employee_id, date
    ), superseded AS (
      UPDATE shifts s
      SET effective_state = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW(), change_id = c.id
      FROM prior p
      JOIN change_rows c ON c.employee_id = p.employee_id AND c.date = p.date
      WHERE s.id = p.id
      RETURNING s.id
    ), inserted AS (
      INSERT INTO shifts (
        organization_id, employee_id, area_id, date, start_time, end_time, location, origin, shift_type, counts_as_work,
        layer, provenance, effective_state, change_id, time_off_request_id, updated_at
      )
      SELECT t.organization_id, t.employee_id, e.area_id, t.day, NULL::text, NULL::text, ${shiftType}::text, 'MAN', ${shiftType}::text, FALSE,
             'CHANGE', 'EMPLOYEE_REQUEST', 'EFFECTIVE', c.id, t.request_id, NOW()
      FROM todo t
      JOIN change_rows c ON c.employee_id = t.employee_id AND c.date = t.day
      JOIN employees e ON e.id = t.employee_id AND e.organization_id = t.organization_id
      RETURNING id
    ), draft_hits AS MATERIALIZED (
      SELECT sa.id, sa.schedule_version_id, sa.employee_id, sa.date
      FROM shift_assignments sa
      JOIN schedule_versions sv ON sv.id = sa.schedule_version_id AND sv.status = 'DRAFT'
      JOIN schedules sc ON sc.id = sv.schedule_id AND sc.organization_id = ${ctx.organizationId}
      JOIN days d ON d.employee_id = sa.employee_id AND d.day = sa.date
    ), draft_deleted AS (
      DELETE FROM shift_assignments sa USING draft_hits h WHERE sa.id = h.id RETURNING sa.id
    ), draft_inserted AS (
      INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, location, shift_type, counts_as_work)
      SELECT DISTINCT h.schedule_version_id, h.employee_id, h.date, NULL::time, NULL::time, NULL::text, ${shiftType}::text, FALSE
      FROM draft_hits h
      RETURNING id
    )
    SELECT (SELECT COUNT(*)::integer FROM gate) AS approved_count,
           (SELECT COUNT(*)::integer FROM inserted) AS shifts_created,
           (SELECT COUNT(*)::integer FROM superseded) AS shifts_superseded,
           (SELECT COUNT(*)::integer FROM already) AS already_absent_days,
           (SELECT COUNT(*)::integer FROM draft_deleted) AS draft_assignments_replaced,
           (SELECT COUNT(*)::integer FROM draft_inserted) AS draft_assignments_inserted
  `]);

  const outcome = rows?.[0];
  if (!outcome || Number(outcome.approved_count) === 0) {
    // Lost the race: somebody decided it between the read and the write. Nothing was written.
    const fresh = await loadDecisionSubject(sql, ctx, approvalRequestId);
    if (fresh) assertStillPending(fresh);
    throw new HttpError(409, 'Approval request is no longer pending');
  }
  await recordAuditEvent(sql, ctx, {
    eventType: 'time_off_request.approved',
    targetType: 'TIME_OFF_REQUEST',
    targetId: subject.request_id,
    metadata: {
      approvalRequestId, employeeId: subject.employee_id, requestType: subject.request_type,
      requestedDays: range.requestedDays, materializedDays: range.materializedDays, skippedPastDays: range.skippedPastDays,
      effectiveStartDate: range.effectiveStartDate, shiftsCreated: Number(outcome.shifts_created),
    },
  });
  await notifyEmployee(sql, ctx, subject);

  const refreshed = await loadDecisionSubject(sql, ctx, approvalRequestId);
  return {
    approvalRequest: { id: approvalRequestId, kind: 'TIME_OFF', status: 'APPROVED', policySnapshot: subject.policy_snapshot, timeOffRequestId: subject.request_id, approvedByUserId: ctx.user.id },
    timeOffRequest: mapTimeOffRequestRow({
      id: subject.request_id, request_type: subject.request_type, start_date: subject.start_date, end_date: subject.end_date,
      requested_days: subject.requested_days, comment: subject.comment, status: 'APPROVED', created_at: null,
      resolved_at: refreshed?.resolved_at ?? null, resolved_by_name: refreshed?.resolved_by_name ?? null,
      applied_start_date: range.effectiveStartDate, applied_days: range.materializedDays,
    }),
    requestedDays: range.requestedDays,
    materializedDays: range.materializedDays,
    skippedPastDays: range.skippedPastDays,
    effectiveStartDate: range.effectiveStartDate,
    materialized: {
      shiftsCreated: Number(outcome.shifts_created),
      shiftsSuperseded: Number(outcome.shifts_superseded),
      draftAssignmentsReplaced: Number(outcome.draft_assignments_replaced),
      daysAlreadyAbsent: Number(outcome.already_absent_days),
    },
  };
}

/** Reject a vacation: reason is mandatory (1–2000), the state mirrors on the envelope, nothing touches the calendar. */
export async function rejectTimeOffRequest(sql, ctx, approvalRequestId, rawReason) {
  const subject = await loadDecisionSubject(sql, ctx, approvalRequestId);
  if (!subject) return null;
  await assertCanDecide(sql, ctx, subject);
  const reason = String(rawReason ?? '').trim();
  if (!reason || reason.length > MAX_REASON) {
    throw timeOffError(400, `A rejection reason (1-${MAX_REASON} characters) is required`, 'INVALID_INPUT');
  }
  assertStillPending(subject);

  const [rows] = await sql.transaction((txn) => [txn`
    WITH gate AS MATERIALIZED (
      UPDATE time_off_requests t
      SET status = 'REJECTED', rejection_reason = ${reason}, resolved_at = NOW(), resolved_by_user_id = ${ctx.user.id}, updated_at = NOW()
      WHERE t.id = ${subject.request_id} AND t.organization_id = ${ctx.organizationId} AND t.status = 'PENDING'
      RETURNING t.id, t.resolved_at
    ), envelope AS (
      UPDATE approval_requests ar
      SET status = 'REJECTED', rejected_by_user_id = ${ctx.user.id}, rejected_at = gate.resolved_at, rejection_reason = ${reason}
      FROM gate
      WHERE ar.time_off_request_id = gate.id AND ar.status = 'PENDING'
      RETURNING ar.id
    )
    SELECT (SELECT COUNT(*)::integer FROM gate) AS rejected_count, (SELECT COUNT(*)::integer FROM envelope) AS envelope_count
  `]);
  if (!rows?.[0] || Number(rows[0].rejected_count) === 0) {
    const fresh = await loadDecisionSubject(sql, ctx, approvalRequestId);
    if (fresh) assertStillPending(fresh);
    throw new HttpError(409, 'Approval request is no longer pending');
  }
  await recordAuditEvent(sql, ctx, {
    eventType: 'time_off_request.rejected',
    targetType: 'TIME_OFF_REQUEST',
    targetId: subject.request_id,
    metadata: { approvalRequestId, employeeId: subject.employee_id, requestType: subject.request_type },
  });
  await notifyEmployee(sql, ctx, subject);
  return {
    approvalRequest: { id: approvalRequestId, kind: 'TIME_OFF', status: 'REJECTED', policySnapshot: subject.policy_snapshot, timeOffRequestId: subject.request_id, rejectedByUserId: ctx.user.id, rejectionReason: reason },
    timeOffRequest: mapTimeOffRequestRow({
      id: subject.request_id, request_type: subject.request_type, start_date: subject.start_date, end_date: subject.end_date,
      requested_days: subject.requested_days, comment: subject.comment, status: 'REJECTED', created_at: null,
      resolved_at: new Date().toISOString(), rejection_reason: reason,
    }),
  };
}

