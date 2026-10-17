import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { previewImportReversion } from '../../_lib/import-reversion.js';
import { handleError, sendJson } from '../../_lib/http.js';

/**
 * POST /api/imports/reversions/preview  { importIds }
 *
 * READ-ONLY (zero writes). The server closes the dependency set, orders the execution and simulates the inverse; the order the
 * client sends (if any) is irrelevant. OWNER / ADMIN only.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    return sendJson(res, 200, await previewImportReversion(sql, ctx, req.body ?? {}));
  } catch (error) {
    return handleError(res, error);
  }
}
