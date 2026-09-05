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
  };
}

/** POST /api/approval-requests/:id/approve — eligibility and the state
 * transition are evaluated together. This keeps a stale inbox from granting
 * approval after policy, area responsibility, tenant or request status has
 * changed. Applying a concrete schedule delta remains R5-M07's responsibility
 * because R4-M06 does not yet persist requested hours. */
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
        SET status = 'APPROVED',
            approved_by_user_id = ${ctx.user.id},
            approved_at = NOW()
        FROM eligible
        WHERE target.id = eligible.id
          AND target.status = 'PENDING'
        RETURNING target.id, target.organization_id, target.change_request_id,
                  target.status, target.policy_snapshot,
                  target.approved_by_user_id, target.approved_at
      )
      SELECT id, organization_id, change_request_id, status, policy_snapshot,
             approved_by_user_id, approved_at
      FROM updated
    `]);

    if (updatedRows?.[0]) {
      await recordAuditEvent(sql, ctx, {
        eventType: 'approval_request.approved',
        targetType: 'APPROVAL_REQUEST',
        targetId: updatedRows[0].id,
        metadata: {
          changeRequestId: updatedRows[0].change_request_id,
          policySnapshot: updatedRows[0].policy_snapshot,
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
    return sendJson(res, 403, { error: 'You are not eligible to approve this request' });
  } catch (error) {
    return handleError(res, error);
  }
}
