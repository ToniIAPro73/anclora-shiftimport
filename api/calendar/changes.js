import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { applyCalendarChange, getDayHistory, reconcileCalendarDay } from '../_lib/calendar.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/calendar/changes?employeeId=&date= — current/proposed state and
 *      the day change trail.
 * POST /api/calendar/changes — administrative change on the effective
 *      calendar ({ employeeId, date, changeType, reason, after[], supersedeShiftIds[] }).
 *      With { action: 'RECONCILE', keepShiftIds[] } it resolves a REQUIRES_REVIEW day.
 *      EMPLOYEE users must use change requests instead.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const history = await getDayHistory(
        sql,
        ctx,
        String(req.query?.employeeId ?? '').trim(),
        String(req.query?.date ?? '').trim(),
      );
      return sendJson(res, 200, history);
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      const result = body.action === 'RECONCILE'
        ? await reconcileCalendarDay(sql, ctx, body)
        : await applyCalendarChange(sql, ctx, body);
      return sendJson(res, 201, { result });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
