import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createScheduleDraft } from '../_lib/scheduling.js';
import { handleError, sendJson } from '../_lib/http.js';

/** POST /api/schedules — create/reuse a weekly schedule and its DRAFT. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const result = await createScheduleDraft(sql, ctx, req.body);
    return sendJson(res, 201, result);
  } catch (error) {
    return handleError(res, error);
  }
}
