import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { bulkAddMembers } from '../_lib/data.js';
import { hashPassword } from '../_lib/passwords.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/memberships/bulk — bulk user provisioning + automatic
 * User<->Employee linking (Usuarios CSV import, ADMIN/OWNER only, Team plan).
 * Body: { members: [{ key, email, name?, role, externalEmployeeId? }] }.
 * `key` is a client-supplied correlation id, echoed back per result, never
 * stored. Never creates an Employee — `externalEmployeeId` only resolves an
 * existing one. Partial success: one bad row never aborts the rest.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const result = await bulkAddMembers(sql, ctx, req.body?.members ?? [], hashPassword);
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
