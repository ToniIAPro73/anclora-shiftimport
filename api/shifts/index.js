import { getSql, resolveContext } from '../_lib/auth.js';
import { deleteShiftsByIds, listShifts, upsertShifts } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET   /api/shifts?employeeId= — org-scoped; EMPLOYEE always gets own shifts.
 * PATCH /api/shifts             — { upserts: [...], deleteIds: [...] }.
 *                                 Every upsert must carry employeeId; the
 *                                 server validates org membership of each
 *                                 employee. EMPLOYEE role is forced to its own
 *                                 employee regardless of payload.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = await resolveContext(req, sql);
    if (!ctx || !ctx.organizationId) {
      return sendJson(res, 401, { error: 'Not authenticated' });
    }

    if (req.method === 'GET') {
      const shifts = await listShifts(sql, ctx, String(req.query?.employeeId ?? ''));
      return sendJson(res, 200, { shifts });
    }

    if (req.method === 'PATCH') {
      const payload = req.body ?? {};
      const upserts = Array.isArray(payload.upserts) ? payload.upserts : [];
      const deleteIds = Array.isArray(payload.deleteIds) ? payload.deleteIds : [];
      const requestedEmployeeId = String(payload.employeeId ?? '');

      const [saved, deleted] = await Promise.all([
        upserts.length > 0 ? upsertShifts(sql, ctx, upserts) : Promise.resolve([]),
        deleteIds.length > 0 ? deleteShiftsByIds(sql, ctx, deleteIds, requestedEmployeeId) : Promise.resolve(0),
      ]);

      return sendJson(res, 200, { saved: saved.length, deleted });
    }

    res.setHeader('Allow', 'GET, PATCH');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
