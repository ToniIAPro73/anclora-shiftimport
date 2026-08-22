import { createSession, getSql, sessionCookieHeader } from '../_lib/auth.js';
import { hashPassword } from '../_lib/passwords.js';
import { handleError, sendJson } from '../_lib/http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Account bootstrap: creates the user and opens a session. Organization and
 * membership are deliberately NOT created here — Fase 1.2C.2 requires an
 * explicit "Para mí" / "Para mi empresa" choice right after signup, handled
 * by POST /api/onboarding/personal or /api/onboarding/company. A freshly
 * registered account intentionally has zero memberships until that step
 * completes (see resolveContext: memberships.length === 0 is a valid,
 * expected state, not an error).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email, password, displayName } = req.body ?? {};
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const name = String(displayName ?? '').trim();

    if (!EMAIL_RE.test(normalizedEmail)) {
      return sendJson(res, 400, { error: 'Invalid email' });
    }
    if (String(password ?? '').length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
    }

    const sql = getSql();
    const existing = await sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`;
    if (existing.length > 0) {
      return sendJson(res, 409, { error: 'Email already registered' });
    }

    const userRows = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${normalizedEmail}, ${hashPassword(String(password))}, ${name})
      RETURNING id, email, display_name
    `;
    const user = userRows[0];

    const { token, expiresAt } = await createSession(sql, user.id);
    res.setHeader('Set-Cookie', sessionCookieHeader(req, token, expiresAt));

    return sendJson(res, 201, {
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (error) {
    // Unique constraint violation for email — possible race between SELECT and INSERT
    if (error?.code === '23505') {
      // Verify this is the email constraint, not another unique index
      if (error?.details?.includes('users_email_lower_idx') ||
          error?.details?.includes('email')) {
        return sendJson(res, 409, { error: 'Email already registered' });
      }
    }
    return handleError(res, error);
  }
}
