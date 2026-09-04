import { getSql, requireOrgContext, resolveContext } from '../../../../_lib/auth.js';
import { getScheduleSnapshot } from '../../../../_lib/scheduling.js';
import { handleError, sendJson } from '../../../../_lib/http.js';

/** GET /api/schedules/:scheduleId/versions/:versionId — planner grid snapshot. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const snapshot = await getScheduleSnapshot(
      sql,
      ctx,
      String(req.query?.scheduleId ?? ''),
      String(req.query?.versionId ?? ''),
    );
    return sendJson(res, 200, snapshot);
  } catch (error) {
    return handleError(res, error);
  }
}
