import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { listReconciliationDays } from '../_lib/calendar.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET /api/calendar/reconciliation?employeeId=&year= — reconciliation worklist
 * (pending + resolved days with current calendar vs proposed information). Read-only;
 * resolution is POST /api/calendar/changes { action: 'RECONCILE' }.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const worklist = await listReconciliationDays(
        sql,
        ctx,
        String(req.query?.employeeId ?? '').trim(),
        req.query?.year,
      );
      return sendJson(res, 200, worklist);
    }

    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
