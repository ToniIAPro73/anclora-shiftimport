import { randomUUID } from 'node:crypto';
import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { recordAuditEvent } from '../../_lib/data.js';
import { handleError, sendJson } from '../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapApprovalDecision(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    changeRequestId: row.change_request_id,
    status: row.status,
    policySnapshot: row.policy_snapshot,
    approvedByUserId: row.approved_by_user_id ?? null,
    approvedAt: row.approved_at ?? null,
    appliedAt: row.applied_at ?? null,
    resultingScheduleVersionId: row.resulting_schedule_version_id ?? null,
  };
}

/** POST /api/approval-requests/:id/approve — eligibility and the state
 * transition are evaluated together. This keeps a stale inbox from granting
 * approval after policy, area responsibility, tenant or request status has
 * changed. TIME_CHANGE requests are applied to a new draft in this same
 * transaction; OTHER requests are approval-only because they have no
 * structured scheduling delta. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const approvalRequestId = String(req.query?.id ?? '').trim();
    if (!UUID_RE.test(approvalRequestId)) {
      return sendJson(res, 404, { error: 'Approval request not found' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const resultingVersionId = randomUUID();
    const [updatedRows] = await sql.transaction((txn) => [txn`
      WITH eligible AS MATERIALIZED (
        SELECT ar.id, ar.organization_id, ar.change_request_id,
               ar.policy_snapshot, cr.request_type,
               cr.requested_start_time, cr.requested_end_time,
               sh.schedule_version_id AS source_version_id,
               sv.schedule_id AS source_schedule_id,
               sh.employee_id, sh.date AS source_date,
               sh.start_time AS source_start_time,
               sh.end_time AS source_end_time,
               sh.location AS source_location
        FROM approval_requests ar
        JOIN change_requests cr
          ON cr.id = ar.change_request_id
         AND cr.organization_id = ar.organization_id
        JOIN employees e
          ON e.id = cr.employee_id
         AND e.organization_id = ar.organization_id
        JOIN shifts sh
          ON sh.id = cr.shift_id
         AND sh.employee_id = cr.employee_id
         AND sh.organization_id = ar.organization_id
        LEFT JOIN schedule_versions sv
          ON sv.id = sh.schedule_version_id
         AND sv.status = 'PUBLISHED'
        LEFT JOIN schedules source_schedule
          ON source_schedule.id = sv.schedule_id
         AND source_schedule.organization_id = ar.organization_id
        JOIN organizations o ON o.id = ar.organization_id
        JOIN memberships caller_membership
          ON caller_membership.organization_id = ar.organization_id
         AND caller_membership.user_id = ${ctx.user.id}
        WHERE ar.id = ${approvalRequestId}
          AND ar.organization_id = ${ctx.organizationId}
          AND ar.status = 'PENDING'
          AND (
            (
              o.approval_policy = 'ORGANIZATION_ADMIN'
              AND caller_membership.role IN ('OWNER', 'ADMIN')
            )
            OR (
              o.approval_policy = 'AREA_RESPONSIBLE'
              AND caller_membership.role = 'ADMIN'
              AND EXISTS (
                SELECT 1
                FROM area_responsibles arx
                WHERE arx.area_id = e.area_id
                  AND arx.user_id = caller_membership.user_id
                  AND arx.organization_id = ar.organization_id
              )
            )
          )
      ), source_assignment AS MATERIALIZED (
        SELECT e.*, sa.id AS source_assignment_id
        FROM eligible e
        JOIN shift_assignments sa
          ON sa.schedule_version_id = e.source_version_id
         AND sa.employee_id = e.employee_id
         AND sa.date = e.source_date
         AND sa.start_time = e.source_start_time::time
         AND sa.end_time = e.source_end_time::time
         AND sa.location IS NOT DISTINCT FROM e.source_location
        WHERE e.request_type = 'TIME_CHANGE'
          AND e.source_version_id IS NOT NULL
          AND e.requested_start_time IS NOT NULL
          AND e.requested_end_time IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM shift_assignments conflict
            WHERE conflict.schedule_version_id = e.source_version_id
              AND conflict.employee_id = e.employee_id
              AND conflict.date = e.source_date
              AND conflict.id <> sa.id
              AND conflict.start_time < e.requested_end_time
              AND conflict.end_time > e.requested_start_time
          )
        LIMIT 1
      ), draft_conflict AS MATERIALIZED (
        SELECT sa.*, existing.id AS existing_draft_id
        FROM source_assignment sa
        LEFT JOIN schedule_versions existing
          ON existing.schedule_id = sa.source_schedule_id
         AND existing.status = 'DRAFT'
      ), next_version AS (
        SELECT d.*,
               COALESCE((SELECT MAX(version_number) FROM schedule_versions sv
                         WHERE sv.schedule_id = d.source_schedule_id), 0) + 1 AS next_version_number
        FROM draft_conflict d
        WHERE d.existing_draft_id IS NULL
      ), created_version AS (
        INSERT INTO schedule_versions
          (id, schedule_id, version_number, status, created_by_user_id)
        SELECT ${resultingVersionId}, source_schedule_id, next_version_number,
               'DRAFT', ${ctx.user.id}
        FROM next_version
        RETURNING id, schedule_id
      ), copied_assignments AS (
        INSERT INTO shift_assignments
          (schedule_version_id, employee_id, import_id, date, start_time, end_time, location)
        SELECT cv.id, sa.employee_id, sa.import_id, sa.date,
               CASE WHEN sa.id = source.source_assignment_id THEN source.requested_start_time ELSE sa.start_time END,
               CASE WHEN sa.id = source.source_assignment_id THEN source.requested_end_time ELSE sa.end_time END,
               sa.location
        FROM shift_assignments sa
        JOIN source_assignment source ON source.source_version_id = sa.schedule_version_id
        JOIN created_version cv ON cv.schedule_id = source.source_schedule_id
        RETURNING id
      ), updated AS (
        UPDATE approval_requests target
        SET status = 'APPROVED',
            approved_by_user_id = ${ctx.user.id},
            approved_at = NOW(),
            applied_at = NOW(),
            resulting_schedule_version_id = CASE
              WHEN eligible.request_type = 'TIME_CHANGE' THEN (SELECT id FROM created_version LIMIT 1)
              ELSE NULL
            END
        FROM eligible
        WHERE target.id = eligible.id
          AND target.status = 'PENDING'
          AND (
            eligible.request_type = 'OTHER'
            OR EXISTS (SELECT 1 FROM copied_assignments)
          )
        RETURNING target.id, target.organization_id, target.change_request_id,
                  target.status, target.policy_snapshot,
                  target.approved_by_user_id, target.approved_at,
                  target.applied_at, target.resulting_schedule_version_id
      ), updated_change_request AS (
        UPDATE change_requests target
        SET status = 'APPROVED',
            resolved_by_user_id = ${ctx.user.id},
            resolved_at = NOW()
        FROM updated
        WHERE target.id = updated.change_request_id
          AND target.organization_id = updated.organization_id
        RETURNING target.id
      )
      SELECT id, organization_id, change_request_id, status, policy_snapshot,
             approved_by_user_id, approved_at, applied_at,
             resulting_schedule_version_id
      FROM updated
      WHERE EXISTS (SELECT 1 FROM updated_change_request)
    `]);

    if (updatedRows?.[0]) {
      await recordAuditEvent(sql, ctx, {
        eventType: 'approval_request.approved',
        targetType: 'APPROVAL_REQUEST',
        targetId: updatedRows[0].id,
        metadata: {
          changeRequestId: updatedRows[0].change_request_id,
          policySnapshot: updatedRows[0].policy_snapshot,
          resultingScheduleVersionId: updatedRows[0].resulting_schedule_version_id,
        },
      });
      return sendJson(res, 200, { approvalRequest: mapApprovalDecision(updatedRows[0]) });
    }

    const existingRows = await sql`
      SELECT ar.status, cr.request_type, cr.requested_start_time, cr.requested_end_time
      FROM approval_requests ar
      JOIN change_requests cr ON cr.id = ar.change_request_id
      WHERE ar.id = ${approvalRequestId}
        AND ar.organization_id = ${ctx.organizationId}
    `;
    if (!existingRows[0]) {
      return sendJson(res, 404, { error: 'Approval request not found' });
    }
    if (existingRows[0].status !== 'PENDING') {
      return sendJson(res, 409, { error: 'Approval request is no longer pending' });
    }
    if (existingRows[0].request_type === 'TIME_CHANGE'
      && (!existingRows[0].requested_start_time || !existingRows[0].requested_end_time)) {
      return sendJson(res, 422, { error: 'Approval request has no structured time delta to apply' });
    }
    return sendJson(res, 403, { error: 'You are not eligible to approve this request' });
  } catch (error) {
    return handleError(res, error);
  }
}
