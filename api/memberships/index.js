import { getSql, HttpError, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { listMembers, removeMember, updateMemberRole } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Minimal B2B membership management (OWNER/ADMIN only, org from session).
 *
 * GET    /api/memberships                — list org members
 * POST   /api/memberships                — retired; use /api/invitations
 * PATCH  /api/memberships                — change role/scope {userId, role, scopedAreaId?}
 * DELETE /api/memberships                — remove membership {userId}
 *
 * No email invitations: new users get an ADMIN-set initial password handed
 * over out-of-band. Documented limitation until mail infrastructure exists.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      return sendJson(res, 200, { members: await listMembers(sql, ctx) });
    }
    if (req.method === 'POST') {
      const error = new HttpError(410, 'Use the invitation flow to grant access');
      error.code = 'INVITATIONS_REQUIRED';
      throw error;
    }
    if (req.method === 'PATCH') {
      return sendJson(res, 200, { member: await updateMemberRole(sql, ctx, req.body ?? {}) });
    }
    if (req.method === 'DELETE') {
      return sendJson(res, 200, { removed: await removeMember(sql, ctx, req.body ?? {}) });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
