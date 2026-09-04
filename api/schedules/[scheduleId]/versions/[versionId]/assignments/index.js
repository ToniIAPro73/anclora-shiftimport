import { getSql, requireOrgContext, resolveContext } from '../../../../../_lib/auth.js';
import { createAssignment } from '../../../../../_lib/scheduling.js';
import { handleError, sendJson } from '../../../../../_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const assignment = await createAssignment(
      sql, ctx, String(req.query?.scheduleId ?? ''), String(req.query?.versionId ?? ''), req.body ?? {},
    );
    return sendJson(res, 201, { assignment });
  } catch (error) {
    return handleError(res, error);
  }
}
