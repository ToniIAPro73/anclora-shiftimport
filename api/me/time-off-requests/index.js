import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { isTimeOffEnabled } from '../../_lib/flags.js';
import { handleError, sendJson } from '../../_lib/http.js';
import { createTimeOffRequest, listTimeOffRequests } from '../../_lib/time-off-data.js';

/**
 * GET  /api/me/time-off-requests?status=&year=  — own requests + summary.
 * POST /api/me/time-off-requests                — create a PENDING request (MVP: VACATION only).
 * SELF by construction; 404 while TIME_OFF_ENABLED is off (the route does not exist for the client).
 */
export default async function handler(req, res) {
  try {
    if (!isTimeOffEnabled()) return sendJson(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      return sendJson(res, 200, await listTimeOffRequests(sql, ctx, { status: req.query?.status, year: req.query?.year }));
    }
    const request = await createTimeOffRequest(sql, ctx, req.body);
    return sendJson(res, 201, { request });
  } catch (error) {
    return handleError(res, error);
  }
}
