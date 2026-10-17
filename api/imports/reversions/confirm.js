import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { confirmImportReversion } from '../../_lib/import-reversion.js';
import { handleError, sendJson } from '../../_lib/http.js';

/**
 * POST /api/imports/reversions/confirm  { importIds, planHash, reason? }
 *
 * Re-computes the plan, rejects a stale one (409 REVERSION_PLAN_STALE) and executes everything in ONE transaction. Replaying the same
 * confirmation returns the already completed operation (idempotent). OWNER / ADMIN only.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const result = await confirmImportReversion(sql, ctx, req.body ?? {});
    return sendJson(res, result.idempotent ? 200 : 201, result);
  } catch (error) {
    return handleError(res, error);
  }
}
