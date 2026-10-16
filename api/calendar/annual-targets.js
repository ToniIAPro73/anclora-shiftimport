import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { listAnnualTargets, setAnnualTarget } from '../_lib/calendar.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET /api/calendar/annual-targets?employeeId= — targets of one employee
 *     (EMPLOYEE gets only their own; PLANNER read-only inside scope).
 * PUT /api/calendar/annual-targets — { employeeId, year, minimumAnnualMinutes,
 *     maximumAnnualMinutes, notes } OWNER/ADMIN only; audited with before/after.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const targets = await listAnnualTargets(sql, ctx, String(req.query?.employeeId ?? '').trim());
      return sendJson(res, 200, { targets });
    }

    if (req.method === 'PUT') {
      const target = await setAnnualTarget(sql, ctx, req.body ?? {});
      return sendJson(res, 200, { target });
    }

    res.setHeader('Allow', 'GET, PUT');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
