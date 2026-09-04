import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createScheduleDraft, listScheduleVersions } from '../_lib/scheduling.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/schedules — list tenant-scoped schedules for draft discovery.
 * POST /api/schedules — create/reuse a weekly schedule and its DRAFT.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      const schedules = await listScheduleVersions(sql, ctx, {
        areaId: String(req.query?.areaId ?? '').trim() || null,
      });
      return sendJson(res, 200, { schedules });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const result = await createScheduleDraft(sql, ctx, req.body);
    return sendJson(res, 201, result);
  } catch (error) {
    return handleError(res, error);
  }
}
