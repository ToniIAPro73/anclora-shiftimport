import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { isTimeOffEnabled } from '../../_lib/flags.js';
import { handleError, sendJson } from '../../_lib/http.js';
import { getTimeOffImpact } from '../../_lib/time-off-data.js';

/** GET /api/me/time-off-requests/impact?startDate&endDate — what the range would touch, before sending. SELF scope. */
export default async function handler(req, res) {
  try {
    if (!isTimeOffEnabled()) return sendJson(res, 404, { error: 'Not found' });
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    return sendJson(res, 200, await getTimeOffImpact(sql, ctx, { startDate: req.query?.startDate, endDate: req.query?.endDate }));
  } catch (error) {
    return handleError(res, error);
  }
}
