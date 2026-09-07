import { getSql, requireOrgContext, requireRole, resolveContext } from '../_lib/auth.js';
import { transferOwnership } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/organizations/transfer-ownership
 * Sole Owner transfers organization ownership to another active member.
 * Transactional and audited.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    requireRole(ctx, 'OWNER');
    const result = await transferOwnership(sql, ctx, req.body ?? {});
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
