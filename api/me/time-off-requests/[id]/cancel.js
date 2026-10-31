import { getSql, requireOrgContext, resolveContext } from '../../../_lib/auth.js';
import { isTimeOffEnabled } from '../../../_lib/flags.js';
import { handleError, sendJson } from '../../../_lib/http.js';
import { cancelTimeOffRequest } from '../../../_lib/time-off-data.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/me/time-off-requests/:id/cancel — the requester cancels an own PENDING request. Someone else's id is a 404. */
export default async function handler(req, res) {
  try {
    if (!isTimeOffEnabled()) return sendJson(res, 404, { error: 'Not found' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const requestId = String(req.query?.id ?? '').trim();
    if (!UUID_RE.test(requestId)) return sendJson(res, 404, { error: 'Time-off request not found' });
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    return sendJson(res, 200, { request: await cancelTimeOffRequest(sql, ctx, requestId) });
  } catch (error) {
    return handleError(res, error);
  }
}
