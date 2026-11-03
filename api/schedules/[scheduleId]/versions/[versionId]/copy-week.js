import { getSql, requireOrgContext, resolveContext } from '../../../../_lib/auth.js';
import { copyWeekIntoDraft } from '../../../../_lib/scheduling.js';
import { handleError, sendJson } from '../../../../_lib/http.js';

/**
 * POST /api/schedules/:scheduleId/versions/:versionId/copy-week — { sourceWeekStart: 'YYYY-MM-DD', mode: 'preview' | 'apply' }.
 * Copies the materialised, still-current assignments of the latest PUBLISHED version of the source week into THIS draft. `preview`
 * writes nothing. Never overwrites, never publishes, never creates a version (F4-M03 / OD-F4-01).
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const result = await copyWeekIntoDraft(
      sql, ctx, String(req.query?.scheduleId ?? ''), String(req.query?.versionId ?? ''), req.body ?? {},
    );
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
