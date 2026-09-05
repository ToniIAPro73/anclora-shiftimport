import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { logApprovalAuthorizationDenied } from '../../_lib/approval.js';
import { listEmployeeChangeRequests } from '../../_lib/data.js';
import { handleError, sendJson } from '../../_lib/http.js';

/** GET /api/me/change-requests — all change requests owned by the employee. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (ctx.role !== 'EMPLOYEE' || !ctx.employeeId) {
      logApprovalAuthorizationDenied({ endpoint: 'GET /api/me/change-requests', ctx, reason: 'employee_self_scope_required' });
      return sendJson(res, 403, { error: 'Employee portal access required' });
    }
    const requests = await listEmployeeChangeRequests(sql, ctx, req.query?.status);
    return sendJson(res, 200, { requests });
  } catch (error) {
    return handleError(res, error);
  }
}
