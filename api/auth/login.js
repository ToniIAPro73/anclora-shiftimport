import { createSession, getSql, sessionCookieHeader } from '../_lib/auth.js';
import { verifyPassword } from '../_lib/passwords.js';
import { handleError, sendJson } from '../_lib/http.js';

// Naive fixed-window rate limit (per warm serverless instance). Limits
// credential stuffing per email; documented limitation: not distributed.
const attempts = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function rateLimited(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    attempts.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body ?? {};
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (rateLimited(normalizedEmail)) {
      return sendJson(res, 429, { error: 'Too many attempts. Try again later.' });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, email, display_name, password_hash
      FROM users WHERE lower(email) = ${normalizedEmail}
    `;
    const user = rows[0];
    // Generic message for both unknown email and wrong password
    // (no user enumeration).
    if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
      return sendJson(res, 401, { error: 'Invalid credentials' });
    }

    // Hygiene: drop expired sessions of this user.
    await sql`DELETE FROM sessions WHERE user_id = ${user.id} AND expires_at <= NOW()`;

    const { token, expiresAt } = await createSession(sql, user.id);
    res.setHeader('Set-Cookie', sessionCookieHeader(req, token, expiresAt));

    return sendJson(res, 200, {
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (error) {
    return handleError(res, error);
  }
}
