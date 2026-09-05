import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

const APPROVAL_REQUEST_STATUSES = new Set(['PENDING']);

function mapApprovalRequestRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    changeRequestId: row.change_request_id,
    status: row.status,
    policySnapshot: row.policy_snapshot,
    createdAt: row.created_at,
    requestType: row.request_type,
    reason: row.reason,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    areaId: row.area_id ?? null,
    areaName: row.area_name ?? null,
    shiftId: row.shift_id,
    shiftDate: row.shift_date,
    shiftStartTime: row.shift_start_time,
    shiftEndTime: row.shift_end_time,
    shiftLocation: row.shift_location ?? '',
  };
}

/** GET /api/approval-requests?status=pending — pending requests for the
 * current user's effective approver scope. Eligibility is recalculated from
 * the current policy and area mappings on every read; no approver id from the
 * client is accepted or trusted. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const rawStatus = String(req.query?.status ?? 'PENDING').trim().toUpperCase() || 'PENDING';
    if (!APPROVAL_REQUEST_STATUSES.has(rawStatus)) {
      return sendJson(res, 400, { error: 'Invalid approval request status' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
      return sendJson(res, 403, { error: 'Approver access required' });
    }

    const rows = await sql`
      SELECT ar.id, ar.organization_id, ar.change_request_id, ar.status,
             ar.policy_snapshot, ar.created_at,
             cr.request_type, cr.reason, cr.employee_id, cr.shift_id,
             e.name AS employee_name, e.area_id,
             a.name AS area_name,
             TO_CHAR(s.date, 'YYYY-MM-DD') AS shift_date,
             s.start_time AS shift_start_time,
             s.end_time AS shift_end_time,
             s.location AS shift_location
      FROM approval_requests ar
      JOIN change_requests cr
        ON cr.id = ar.change_request_id
       AND cr.organization_id = ar.organization_id
      JOIN employees e
        ON e.id = cr.employee_id
       AND e.organization_id = ar.organization_id
      JOIN shifts s
        ON s.id = cr.shift_id
       AND s.employee_id = cr.employee_id
       AND s.organization_id = ar.organization_id
      LEFT JOIN areas a
        ON a.id = e.area_id
       AND a.organization_id = ar.organization_id
      JOIN organizations o ON o.id = ar.organization_id
      JOIN memberships caller_membership
        ON caller_membership.organization_id = ar.organization_id
       AND caller_membership.user_id = ${ctx.user.id}
      WHERE ar.organization_id = ${ctx.organizationId}
        AND ar.status = ${rawStatus}
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
      ORDER BY ar.created_at DESC, ar.id DESC
    `;
    return sendJson(res, 200, { requests: rows.map(mapApprovalRequestRow) });
  } catch (error) {
    return handleError(res, error);
  }
}
