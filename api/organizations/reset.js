import { getSql, requireOrgContext, requireRole, resolveContext } from '../_lib/auth.js';
import { resetOrganization } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/organizations/reset — deletes the active organization's
 * operational data (shifts, imports, employees) inside one transaction.
 * ADMIN only; the organization, users, memberships and sessions survive —
 * see resetOrganization in _lib/data.js for the keep/delete decision.
 * Tenant isolation comes from ctx.organizationId (session) only.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    requireRole(ctx, 'ADMIN');
    const result = await resetOrganization(sql, ctx);
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
