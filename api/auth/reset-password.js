import { destroyAllSessions, getSql, hashToken } from '../_lib/auth.js';
import { hashPassword } from '../_lib/passwords.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Fase 1.2D.3: redeem a password reset token. Single-use (used_at set on
 * redemption, checked on lookup), short-lived (expires_at), and invalidates
 * every active session for the account — a stolen/forgotten-open session
 * must not survive a password reset.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const token = String(req.body?.token ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '');

    if (!token) {
      return sendJson(res, 400, { error: 'Reset token is required' });
    }
    if (newPassword.length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT user_id, expires_at, used_at FROM password_reset_tokens
      WHERE token_hash = ${hashToken(token)}
    `;
    const record = rows[0];
    const valid = record && !record.used_at && new Date(record.expires_at) > new Date();
    if (!valid) {
      return sendJson(res, 400, { error: 'This reset link is invalid or has expired' });
    }

    await sql`UPDATE users SET password_hash = ${hashPassword(newPassword)} WHERE id = ${record.user_id}`;
    await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = ${hashToken(token)}`;
    await destroyAllSessions(sql, record.user_id);

    return sendJson(res, 200, { message: 'Password updated' });
  } catch (error) {
    return handleError(res, error);
  }
}
