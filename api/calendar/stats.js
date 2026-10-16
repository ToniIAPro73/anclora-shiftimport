import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { getEffectiveStats } from '../_lib/calendar.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET /api/calendar/stats?employeeId=&year=[&month=] — effective-calendar statistics
 * (realized vs planned), unresolved days and the annual contract evaluation.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const stats = await getEffectiveStats(
        sql,
        ctx,
        String(req.query?.employeeId ?? '').trim(),
        req.query?.year,
        { month: req.query?.month ?? null },
      );
      return sendJson(res, 200, stats);
    }

    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
