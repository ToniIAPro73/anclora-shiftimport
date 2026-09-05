import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { getEmployeeShift } from '../../_lib/data.js';
import { handleError, sendJson } from '../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/me/shifts/:id — one SELF-scoped employee shift. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const shiftId = String(req.query?.id ?? '').trim();
    if (!UUID_RE.test(shiftId)) {
      return sendJson(res, 404, { error: 'Shift not found' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const shift = await getEmployeeShift(sql, ctx, shiftId);
    return sendJson(res, 200, { shift });
  } catch (error) {
    return handleError(res, error);
  }
}
