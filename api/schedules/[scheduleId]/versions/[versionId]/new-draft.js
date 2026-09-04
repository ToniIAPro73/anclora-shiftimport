import { getSql, requireOrgContext, resolveContext } from '../../../../_lib/auth.js';
import { createNewDraftFromVersion } from '../../../../_lib/scheduling.js';
import { handleError, sendJson } from '../../../../_lib/http.js';

/** POST /api/schedules/:scheduleId/versions/:versionId/new-draft. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const result = await createNewDraftFromVersion(
      sql, ctx, String(req.query?.scheduleId ?? ''), String(req.query?.versionId ?? ''),
    );
    return sendJson(res, 201, result);
  } catch (error) {
    return handleError(res, error);
  }
}
