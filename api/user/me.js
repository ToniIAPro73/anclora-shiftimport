import { getSql } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import { hashToken } from '../_lib/auth.js';

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
    const cookieHeader = String(req.headers?.cookie ?? '');
    const match = cookieHeader.match(/anclora_session=([^;]+)/);
    const token = match?.[1];
    if (!token) {
      return sendJson(res, 401, { error: 'Not authenticated' });
    }
    const rows = await sql`
      SELECT u.id, u.email, u.display_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${hashToken(token)}
        AND s.expires_at > NOW()
    `;
    if (rows.length === 0) {
      return sendJson(res, 401, { error: 'Not authenticated' });
    }
    const user = { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name };

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
