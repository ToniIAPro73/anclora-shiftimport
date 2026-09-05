import { getSql, requireOrgContext, resolveContext } from '../../../_lib/auth.js';
import { cancelEmployeeChangeRequest } from '../../../_lib/data.js';
import { handleError, sendJson } from '../../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/me/change-requests/:id/cancel — cancel an own pending request. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const requestId = String(req.query?.id ?? '').trim();
    if (!UUID_RE.test(requestId)) {
      return sendJson(res, 404, { error: 'Change request not found' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const request = await cancelEmployeeChangeRequest(sql, ctx, requestId);
    return sendJson(res, 200, { request });
  } catch (error) {
    return handleError(res, error);
  }
}
