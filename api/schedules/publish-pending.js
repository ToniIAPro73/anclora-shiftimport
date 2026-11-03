import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { publishPendingVersions } from '../_lib/scheduling.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/schedules/publish-pending — { versionIds: string[] (1–12, no duplicates), mode?: 'preview' | 'apply' } (F4-M03 / OD-F4-02).
 * One canonical publication per version (its own transaction, scope check, conflicts and notifications); `preview` writes nothing.
 * A version that cannot be published is reported and the rest continue.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    return sendJson(res, 200, await publishPendingVersions(sql, ctx, req.body ?? {}));
  } catch (error) {
    return handleError(res, error);
  }
}
