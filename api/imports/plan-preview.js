import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { previewFutureImport } from '../_lib/future-import.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/imports/plan-preview
 *
 * Read-only: classifies a parsed document and compares incoming rows with CURRENT and Planning drafts.
 * Performs NO writes. Same authorization as confirm-split (planning capability).
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    return sendJson(res, 200, await previewFutureImport(sql, ctx, req.body ?? {}));
  } catch (error) {
    return handleError(res, error);
  }
}
