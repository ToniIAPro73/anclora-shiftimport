import { getSql, requireOrgContext, requireRole, resolveContext } from '../_lib/auth.js';
import { bulkMoveEmployeesArea } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/assignments/bulk-move
 * Move multiple employees to an area or remove from area with effective dating.
 * Body: { employeeIds: string[], targetAreaId: string | null, effectiveDate?: string }
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    requireRole(ctx, 'ADMIN');
    const result = await bulkMoveEmployeesArea(sql, ctx, req.body ?? {});
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
