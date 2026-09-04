import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { confirmFutureImport } from '../_lib/future-import.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/imports/confirm-split
 *
 * FUTURE/MIXED Safe Import confirmation. The whole operation is one database
 * transaction. HISTORICAL-only documents deliberately remain on the legacy
 * Safe Import path (/api/imports + /api/shifts).
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const result = await confirmFutureImport(sql, ctx, req.body ?? {});
    return sendJson(res, result.deduplicated ? 200 : 201, result);
  } catch (error) {
    return handleError(res, error);
  }
}
