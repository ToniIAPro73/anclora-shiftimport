import { getSql, requireAuthenticatedContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/user/me   — current user's profile (account-level)
 * PATCH /api/user/me   — update current user's display_name
 * 
 * This is account-level (cross-org), not org-scoped.
 * Requires authentication but not active organization.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireAuthenticatedContext(await resolveContext(req, sql));
    const user = ctx.user;

    if (req.method === 'GET') {
      return sendJson(res, 200, { user });
    }

    if (req.method === 'PATCH') {
      const displayName = String(req.body?.displayName ?? '').trim();
      if (!displayName) {
        return sendJson(res, 400, { error: 'Display name is required' });
      }
      await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${user.id}`;
      return sendJson(res, 200, { user: { ...user, displayName } });
    }

    res.setHeader('Allow', 'GET, PATCH');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
