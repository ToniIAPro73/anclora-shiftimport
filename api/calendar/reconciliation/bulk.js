import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { keepCurrentForDays } from '../../_lib/calendar.js';
import { handleError, sendJson } from '../../_lib/http.js';

/**
 * POST /api/calendar/reconciliation/bulk — «Mantener actual» for up to 50 pending days of ONE employee (F4-M03 / OD-F4-04, v1).
 *   { employeeId, dates[], action: 'KEEP_CURRENT', mode: 'preview' | 'apply', reason?, dayTokens? }
 * `preview` writes nothing and returns, per day, what stays / what is superseded and the day token; `apply` needs the tokens of the
 * preview and one common reason (recorded on each day). Every day is its own gated write and its own result (partial by design).
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const result = await keepCurrentForDays(sql, ctx, req.body ?? {});
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
