import { getSql, requireOrgContext, resolveContext } from '../../../_lib/auth.js';
import { createEmployeeChangeRequest } from '../../../_lib/data.js';
import { handleError, sendJson } from '../../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/me/shifts/:id/change-requests — create a SELF request. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const shiftId = String(req.query?.id ?? '').trim();
    if (!UUID_RE.test(shiftId)) {
      return sendJson(res, 404, { error: 'Shift not found' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const request = await createEmployeeChangeRequest(
      sql,
      ctx,
      shiftId,
      req.body?.requestType,
      req.body?.reason,
      req.body?.requestedStartTime,
      req.body?.requestedEndTime,
    );
    return sendJson(res, 201, { request });
  } catch (error) {
    return handleError(res, error);
  }
}
