import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { listTodayShifts } from '../../_lib/data.js';
import { handleError, sendJson } from '../../_lib/http.js';

/** GET /api/me/shifts/today — SELF-scoped employee portal read model. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const shifts = await listTodayShifts(sql, ctx);
    return sendJson(res, 200, { shifts });
  } catch (error) {
    return handleError(res, error);
  }
}
