import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { getImportReversionDetail } from '../../_lib/import-reversion.js';
import { handleError, sendJson } from '../../_lib/http.js';

/** GET /api/imports/reversions/detail?importId= — the reversion operation that reverted an import (OWNER / ADMIN). */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    return sendJson(res, 200, await getImportReversionDetail(sql, ctx, req.query?.importId));
  } catch (error) {
    return handleError(res, error);
  }
}
