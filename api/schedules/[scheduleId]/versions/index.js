import { getSql, requireOrgContext, resolveContext } from '../../../../_lib/auth.js';
import { listScheduleVersionHistory } from '../../../../_lib/scheduling.js';
import { handleError, sendJson } from '../../../../_lib/http.js';

/** GET /api/schedules/:scheduleId/versions — read-only version history. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const versions = await listScheduleVersionHistory(
      sql, ctx, String(req.query?.scheduleId ?? ''),
    );
    return sendJson(res, 200, versions);
  } catch (error) {
    return handleError(res, error);
  }
}
