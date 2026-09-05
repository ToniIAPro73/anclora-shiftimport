import { getSql, requireOrgContext, resolveContext } from '../../../_lib/auth.js';
import { acknowledgeEmployeeShift } from '../../../_lib/data.js';
import { handleError, sendJson } from '../../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/me/shifts/:id/acknowledge — idempotent SELF acknowledgement. */
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
    const acknowledgement = await acknowledgeEmployeeShift(sql, ctx, shiftId);
    return sendJson(res, 200, { acknowledgement });
  } catch (error) {
    return handleError(res, error);
  }
}
