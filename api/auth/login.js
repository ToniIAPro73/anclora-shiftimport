import { createSession, getSql, sessionCookieHeader } from '../_lib/auth.js';
import { verifyPassword } from '../_lib/passwords.js';
import { handleError, sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body ?? {};
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    const sql = getSql();
    const rows = await sql`
      SELECT id, email, display_name, password_hash
      FROM users WHERE lower(email) = ${normalizedEmail}
    `;
    const user = rows[0];
    if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
      return sendJson(res, 401, { error: 'Invalid credentials' });
    }

    const { token, expiresAt } = await createSession(sql, user.id);
    res.setHeader('Set-Cookie', sessionCookieHeader(req, token, expiresAt));

    return sendJson(res, 200, {
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (error) {
    return handleError(res, error);
  }
}
