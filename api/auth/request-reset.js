import { randomBytes } from 'node:crypto';
import { getSql, hashToken } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MINUTES = 30;

/**
 * Fase 1.2D.2: request a password reset. Always responds 200 with the same
 * generic message whether or not the email exists — the enumeration guard
 * is the point, not an edge case. If the account exists, a single-use,
 * short-lived token is created and hashed at rest (same pattern as session
 * tokens).
 *
 * Fase 1.2D.4 delivery gap: there is no email infrastructure yet, so the
 * reset link is logged server-side instead of sent. This endpoint is the
 * complete, real recovery backend — only the delivery channel is missing.
 * Wiring a transactional-email provider later only needs to replace the
 * console.log below with an actual send; token issuance/redemption do not
 * change.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const normalizedEmail = String(req.body?.email ?? '').trim().toLowerCase();
    const generic = { message: 'If that email is registered, a reset link has been sent.' };

    if (!EMAIL_RE.test(normalizedEmail)) {
      return sendJson(res, 200, generic);
    }

    const sql = getSql();
    const userRows = await sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`;
    if (userRows.length === 0) {
      return sendJson(res, 200, generic);
    }
    const userId = userRows[0].id;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
    await sql`
      INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
      VALUES (${hashToken(token)}, ${userId}, ${expiresAt.toISOString()})
    `;

    // Delivery stand-in (Fase 1.2D.4 gap): no email provider configured yet.
    const origin = req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.headers?.host ?? 'localhost';
    console.log(`[password-reset] ${normalizedEmail}: ${origin}://${host}/reset-password?token=${token}`);

    return sendJson(res, 200, generic);
  } catch (error) {
    return handleError(res, error);
  }
}
