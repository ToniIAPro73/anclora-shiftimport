/**
 * Data access for the employee-side time-off endpoints (`/api/me/time-off-requests*`, spec §4.2).
 *
 * Every function is SELF-scoped by construction: the employee id comes from the session (`ctx.employeeId`, resolved from an
 * ACTIVE employee linked to the user) and is bound into the WHERE clause together with `ctx.organizationId`. Nothing about the
 * subject of a request is ever read from the client (INV-01, INV-13). Approval (decide/materialise) is F3 and not here.
 */
import { HttpError } from './auth.js';
import { recordAuditEvent } from './data.js';
import { resolveTimeOffApprovers } from './approval-eligibility.js';
import { getOperationalDate } from './operational-date.js';
import {
  countDaysInclusive,
  isValidIsoDate,
  mapTimeOffRequestRow,
  MAX_TIME_OFF_DAYS,
  parseStatusFilter,
  parseYearFilter,
  requestYear,
  timeOffError,
  validateTimeOffInput,
} from './time-off.js';

const OVERLAP_SQLSTATE = '23P01';

/** 403 EMPLOYEE_LINK_REQUIRED unless the session has an active linked employee. The role is deliberately NOT checked (§3.4):
 *  these routes are SELF by construction, so an OWNER/ADMIN/PLANNER who is also an employee can request their own time off. */
export function assertTimeOffSelfContext(ctx) {
  if (!ctx?.employeeId) {
    throw timeOffError(403, 'No active employee linked to this user', 'EMPLOYEE_LINK_REQUIRED');
  }
}

/** Tenant-validated pool of managers (with their real planner scope) used to route the notification to eligible approvers. */
export async function loadApprovalCandidates(sql, organizationId, areaId) {
  const [members, assignments, responsibles] = await Promise.all([
    sql`
      SELECT m.user_id, m.role, m.scoped_area_id, m.planner_scope_type, e.id AS employee_id
      FROM memberships m
      LEFT JOIN employees e
        ON e.organization_id = m.organization_id AND e.user_id = m.user_id AND e.status = 'active'
      WHERE m.organization_id = ${organizationId}
        AND m.role IN ('OWNER', 'ADMIN', 'PLANNER')
    `,
    sql`
      SELECT subject_id, assignment_type, target_id
      FROM operational_assignments
      WHERE organization_id = ${organizationId}
        AND valid_to IS NULL
        AND assignment_type IN ('PLANNER_AREA', 'PLANNER_EMPLOYEE')
    `,
    areaId
      ? sql`SELECT user_id FROM area_responsibles WHERE organization_id = ${organizationId} AND area_id = ${areaId}`
      : Promise.resolve([]),
  ]);
  const candidates = members.map((row) => {
    const mine = assignments.filter((a) => a.subject_id === row.user_id);
    const scopedAreaIds = mine.filter((a) => a.assignment_type === 'PLANNER_AREA').map((a) => String(a.target_id));
    if (row.scoped_area_id && !scopedAreaIds.includes(row.scoped_area_id)) scopedAreaIds.push(row.scoped_area_id);
    return {
      userId: row.user_id,
      role: row.role,
      employeeId: row.employee_id ?? null,
      plannerScopeType: row.planner_scope_type ?? null,
      scopedAreaId: row.scoped_area_id ?? null,
      scopedAreaIds,
      scopedEmployeeIds: mine.filter((a) => a.assignment_type === 'PLANNER_EMPLOYEE').map((a) => String(a.target_id)),
    };
  });
  return { candidates, areaResponsibleUserIds: responsibles.map((row) => String(row.user_id)) };
}

/**
 * Notifies the approvers eligible by scope + policy (best effort, after commit — a notification outage never rolls the request back).
 * Returns the recipient user ids.
 */
async function notifyEligibleApprovers(sql, { organizationId, employeeId, employeeUserId, areaId, policy, approvalRequestId }) {
  try {
    const pool = await loadApprovalCandidates(sql, organizationId, areaId);
    const approvers = resolveTimeOffApprovers({
      policy,
      target: { employeeId, areaId, requesterUserId: employeeUserId },
      candidates: pool.candidates,
      areaResponsibleUserIds: pool.areaResponsibleUserIds,
    });
    const userIds = [...new Set(approvers.map((a) => a.userId))];
    if (userIds.length === 0) {
      console.warn('[approval] time-off request has no eligible approver', { organizationId, approvalRequestId, policy });
      return [];
    }
    await sql`
      INSERT INTO notifications (user_id, organization_id, type, resource_type, resource_id)
      SELECT recipient, ${organizationId}, 'APPROVAL_REQUEST_CREATED', 'APPROVAL_REQUEST', ${approvalRequestId}
      FROM unnest(${userIds}::uuid[]) AS recipient
      ON CONFLICT (user_id, type, resource_id) DO NOTHING
    `;
    return userIds;
  } catch (error) {
    console.error('[approval] time-off notification failed', { organizationId, approvalRequestId, error: error instanceof Error ? error.message : 'unknown' });
    return [];
  }
}

/** POST /api/me/time-off-requests. Request + approval envelope are one atomic statement; audit + notifications follow. */
export async function createTimeOffRequest(sql, ctx, input, { today = getOperationalDate() } = {}) {
  assertTimeOffSelfContext(ctx);
  const { requestType, startDate, endDate, requestedDays, comment } = validateTimeOffInput(input, today);

  let rows;
  try {
    [rows] = await sql.transaction((txn) => [txn`
      WITH owner AS (
        SELECT e.id, e.area_id, e.user_id, o.approval_policy
        FROM employees e
        JOIN organizations o ON o.id = e.organization_id
        WHERE e.id = ${ctx.employeeId}
          AND e.organization_id = ${ctx.organizationId}
          AND e.status = 'active'
      ), created AS (
        INSERT INTO time_off_requests
          (organization_id, employee_id, requested_by_user_id, request_type,
           start_date, end_date, requested_days, comment, status)
        SELECT ${ctx.organizationId}, owner.id, ${ctx.user.id}, ${requestType},
               ${startDate}::date, ${endDate}::date, ${requestedDays}, ${comment}, 'PENDING'
        FROM owner
        RETURNING id, organization_id, employee_id, request_type, start_date, end_date,
                  requested_days, comment, status, created_at, resolved_at, rejection_reason,
                  applied_start_date, applied_days, cancelled_at
      ), envelope AS (
        INSERT INTO approval_requests (organization_id, time_off_request_id, status, policy_snapshot)
        SELECT created.organization_id, created.id, 'PENDING', owner.approval_policy
        FROM created, owner
        RETURNING id, policy_snapshot
      )
      SELECT created.id, created.organization_id, created.employee_id, created.request_type,
             TO_CHAR(created.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(created.end_date, 'YYYY-MM-DD') AS end_date,
             created.requested_days, created.comment, created.status, created.created_at, created.resolved_at,
             created.rejection_reason, TO_CHAR(created.applied_start_date, 'YYYY-MM-DD') AS applied_start_date,
             created.applied_days, created.cancelled_at,
             owner.area_id, owner.user_id AS employee_user_id,
             envelope.id AS approval_request_id, envelope.policy_snapshot
      FROM created, owner, envelope
    `]);
  } catch (error) {
    if (error?.code === OVERLAP_SQLSTATE) {
      throw timeOffError(409, 'You already have a time-off request over those days', 'TIME_OFF_OVERLAP');
    }
    throw error;
  }

  const created = rows?.[0];
  if (!created) {
    throw timeOffError(403, 'No active employee linked to this user', 'EMPLOYEE_LINK_REQUIRED');
  }
  await recordAuditEvent(sql, ctx, {
    eventType: 'time_off_request.created',
    targetType: 'TIME_OFF_REQUEST',
    targetId: created.id,
    metadata: { requestType, startDate, endDate, requestedDays, policySnapshot: created.policy_snapshot },
  });
  await notifyEligibleApprovers(sql, {
    organizationId: ctx.organizationId,
    employeeId: created.employee_id,
    employeeUserId: created.employee_user_id,
    areaId: created.area_id,
    policy: created.policy_snapshot,
    approvalRequestId: created.approval_request_id,
  });
  return mapTimeOffRequestRow(created);
}

/** GET /api/me/time-off-requests?status=&year= → { requests, summary }. A request counts in the year of its start date. */
export async function listTimeOffRequests(sql, ctx, { status: rawStatus, year: rawYear } = {}, { today = getOperationalDate() } = {}) {
  assertTimeOffSelfContext(ctx);
  const status = parseStatusFilter(rawStatus);
  const year = parseYearFilter(rawYear, today);
  const rows = await sql`
    SELECT t.id, t.request_type,
           TO_CHAR(t.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(t.end_date, 'YYYY-MM-DD') AS end_date,
           t.requested_days, t.comment, t.status, t.created_at, t.resolved_at, t.rejection_reason,
           TO_CHAR(t.applied_start_date, 'YYYY-MM-DD') AS applied_start_date, t.applied_days, t.cancelled_at,
           resolver.display_name AS resolved_by_name
    FROM time_off_requests t
    LEFT JOIN users resolver ON resolver.id = t.resolved_by_user_id
    WHERE t.organization_id = ${ctx.organizationId}
      AND t.employee_id = ${ctx.employeeId}
      AND EXTRACT(YEAR FROM t.start_date) = ${year}
    ORDER BY t.start_date DESC, t.id DESC
  `;
  const inYear = rows.filter((row) => requestYear(String(row.start_date)) === year);
  const summary = {
    approvedDaysInYear: inYear.filter((r) => r.status === 'APPROVED').reduce((n, r) => n + Number(r.applied_days ?? r.requested_days), 0),
    pendingDays: inYear.filter((r) => r.status === 'PENDING').reduce((n, r) => n + Number(r.requested_days), 0),
    activeCount: inYear.filter((r) => r.status === 'PENDING' || r.status === 'APPROVED').length,
  };
  return {
    requests: inYear.filter((row) => !status || row.status === status).map(mapTimeOffRequestRow),
    summary,
  };
}

/** GET /api/me/time-off-requests/impact?startDate&endDate → what the range would touch, before sending. */
export async function getTimeOffImpact(sql, ctx, { startDate: rawStart, endDate: rawEnd } = {}, { today = getOperationalDate() } = {}) {
  assertTimeOffSelfContext(ctx);
  const startDate = String(rawStart ?? '').trim();
  const endDate = String(rawEnd ?? '').trim();
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate) {
    throw timeOffError(400, 'Invalid time-off date range', 'INVALID_INPUT');
  }
  if (startDate < today) {
    throw timeOffError(422, 'Time-off cannot start in the past', 'TIME_OFF_PAST_DATE');
  }
  if (countDaysInclusive(startDate, endDate) > MAX_TIME_OFF_DAYS) {
    throw timeOffError(422, `A time-off request cannot exceed ${MAX_TIME_OFF_DAYS} days`, 'TIME_OFF_RANGE_TOO_LONG');
  }
  const [published, drafts, overlaps] = await Promise.all([
    sql`
      SELECT COUNT(*)::integer AS count
      FROM shifts
      WHERE organization_id = ${ctx.organizationId}
        AND employee_id = ${ctx.employeeId}
        AND effective_state = 'EFFECTIVE'
        AND date BETWEEN ${startDate}::date AND ${endDate}::date
    `,
    sql`
      SELECT COUNT(*)::integer AS count
      FROM shift_assignments sa
      JOIN schedule_versions sv ON sv.id = sa.schedule_version_id
      JOIN schedules sc ON sc.id = sv.schedule_id
      WHERE sc.organization_id = ${ctx.organizationId}
        AND sv.status = 'DRAFT'
        AND sa.employee_id = ${ctx.employeeId}
        AND sa.date BETWEEN ${startDate}::date AND ${endDate}::date
    `,
    sql`
      SELECT id, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date, status
      FROM time_off_requests
      WHERE organization_id = ${ctx.organizationId}
        AND employee_id = ${ctx.employeeId}
        AND status IN ('PENDING', 'APPROVED')
        AND daterange(start_date, end_date, '[]') && daterange(${startDate}::date, ${endDate}::date, '[]')
      ORDER BY start_date
    `,
  ]);
  return {
    publishedShifts: Number(published[0]?.count ?? 0),
    draftAssignments: Number(drafts[0]?.count ?? 0),
    overlapsOwn: overlaps.map((row) => ({ id: row.id, startDate: row.start_date, endDate: row.end_date, status: row.status })),
  };
}

/** POST /api/me/time-off-requests/:id/cancel — only the requester, only while PENDING; the approval envelope mirrors the state. */
export async function cancelTimeOffRequest(sql, ctx, requestId) {
  assertTimeOffSelfContext(ctx);
  const [rows] = await sql.transaction((txn) => [txn`
    WITH cancelled AS (
      UPDATE time_off_requests
      SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = ${requestId}
        AND organization_id = ${ctx.organizationId}
        AND employee_id = ${ctx.employeeId}
        AND status = 'PENDING'
      RETURNING id, request_type, start_date, end_date, requested_days, comment, status,
                created_at, resolved_at, rejection_reason, applied_start_date, applied_days, cancelled_at
    ), envelope AS (
      UPDATE approval_requests ar
      SET status = 'CANCELLED'
      FROM cancelled
      WHERE ar.time_off_request_id = cancelled.id
        AND ar.organization_id = ${ctx.organizationId}
        AND ar.status = 'PENDING'
      RETURNING ar.id
    )
    SELECT cancelled.id, cancelled.request_type,
           TO_CHAR(cancelled.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(cancelled.end_date, 'YYYY-MM-DD') AS end_date,
           cancelled.requested_days, cancelled.comment, cancelled.status, cancelled.created_at, cancelled.resolved_at,
           cancelled.rejection_reason, TO_CHAR(cancelled.applied_start_date, 'YYYY-MM-DD') AS applied_start_date,
           cancelled.applied_days, cancelled.cancelled_at
    FROM cancelled
  `]);
  if (rows?.[0]) {
    await recordAuditEvent(sql, ctx, {
      eventType: 'time_off_request.cancelled',
      targetType: 'TIME_OFF_REQUEST',
      targetId: rows[0].id,
      metadata: { requestType: rows[0].request_type },
    });
    return mapTimeOffRequestRow(rows[0]);
  }
  const existing = await sql`
    SELECT id FROM time_off_requests
    WHERE id = ${requestId} AND organization_id = ${ctx.organizationId} AND employee_id = ${ctx.employeeId}
  `;
  if (existing[0]) {
    throw timeOffError(409, 'Only pending time-off requests can be cancelled', 'TIME_OFF_NOT_PENDING');
  }
  throw new HttpError(404, 'Time-off request not found');
}
