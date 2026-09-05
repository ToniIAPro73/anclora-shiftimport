import { getSql, requireOrgContext, resolveContext } from '../../../_lib/auth.js';
import { createEmployeeShiftComment, listEmployeeShiftComments } from '../../../_lib/data.js';
import { handleError, sendJson } from '../../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET/POST /api/me/shifts/:id/comments — SELF-scoped append-only comments. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const shiftId = String(req.query?.id ?? '').trim();
    if (!UUID_RE.test(shiftId)) {
      return sendJson(res, 404, { error: 'Shift not found' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      return sendJson(res, 200, { comments: await listEmployeeShiftComments(sql, ctx, shiftId) });
    }

    const comment = await createEmployeeShiftComment(sql, ctx, shiftId, req.body?.body);
    return sendJson(res, 201, { comment });
  } catch (error) {
    return handleError(res, error);
  }
}
