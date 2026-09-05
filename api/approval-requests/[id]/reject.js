import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { recordAuditEvent } from '../../_lib/data.js';
import { handleError, sendJson } from '../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REJECTION_REASON_LENGTH = 2000;

function mapApprovalDecision(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    changeRequestId: row.change_request_id,
    status: row.status,
    policySnapshot: row.policy_snapshot,
    rejectedByUserId: row.rejected_by_user_id ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectionReason: row.rejection_reason,
  };
}

/** POST /api/approval-requests/:id/reject — validates the reason and evaluates
 * current approval eligibility in the same compare-and-set transaction. */
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
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      return sendJson(res, 400, { error: 'Rejection reason is required' });
    }
    if (reason.length > MAX_REJECTION_REASON_LENGTH) {
      return sendJson(res, 400, { error: `Rejection reason cannot exceed ${MAX_REJECTION_REASON_LENGTH} characters` });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const [updatedRows] = await sql.transaction((txn) => [txn`
      WITH eligible AS (
        SELECT ar.id
        FROM approval_requests ar
        JOIN change_requests cr
          ON cr.id = ar.change_request_id
         AND cr.organization_id = ar.organization_id
        JOIN employees e
          ON e.id = cr.employee_id
         AND e.organization_id = ar.organization_id
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
      ), updated AS (
        UPDATE approval_requests target
        SET status = 'REJECTED',
            rejected_by_user_id = ${ctx.user.id},
            rejected_at = NOW(),
            rejection_reason = ${reason}
        FROM eligible
        WHERE target.id = eligible.id
          AND target.status = 'PENDING'
        RETURNING target.id, target.organization_id, target.change_request_id,
                  target.status, target.policy_snapshot,
                  target.rejected_by_user_id, target.rejected_at,
                  target.rejection_reason
      ), updated_change_request AS (
        UPDATE change_requests target
        SET status = 'REJECTED',
            resolved_by_user_id = ${ctx.user.id},
            resolved_at = NOW()
        FROM updated
        WHERE target.id = updated.change_request_id
          AND target.organization_id = updated.organization_id
        RETURNING target.id
      )
      SELECT id, organization_id, change_request_id, status, policy_snapshot,
             rejected_by_user_id, rejected_at, rejection_reason
      FROM updated
      WHERE EXISTS (SELECT 1 FROM updated_change_request)
    `]);

    if (updatedRows?.[0]) {
      await recordAuditEvent(sql, ctx, {
        eventType: 'approval_request.rejected',
        targetType: 'APPROVAL_REQUEST',
        targetId: updatedRows[0].id,
        metadata: {
          changeRequestId: updatedRows[0].change_request_id,
          policySnapshot: updatedRows[0].policy_snapshot,
          reason: updatedRows[0].rejection_reason,
        },
      });
      return sendJson(res, 200, { approvalRequest: mapApprovalDecision(updatedRows[0]) });
    }

    const existingRows = await sql`
      SELECT status
      FROM approval_requests
      WHERE id = ${approvalRequestId}
        AND organization_id = ${ctx.organizationId}
    `;
    if (!existingRows[0]) {
      return sendJson(res, 404, { error: 'Approval request not found' });
    }
    if (existingRows[0].status !== 'PENDING') {
      return sendJson(res, 409, { error: 'Approval request is no longer pending' });
    }
    return sendJson(res, 403, { error: 'You are not eligible to reject this request' });
  } catch (error) {
    return handleError(res, error);
  }
}
