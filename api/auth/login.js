import { createSession, getSql, sessionCookieHeader } from '../_lib/auth.js';
import { verifyPassword } from '../_lib/passwords.js';
import { handleError, sendJson } from '../_lib/http.js';
import { clearLoginAttempts, getClientIp, isLoginBlocked, recordFailedLogin } from '../_lib/rate-limit.js';

// Fase 1.2E: distributed (Neon-backed) fixed-window limits, checked per
// identity independently — a shared office IP doesn't punish everyone on
// it, and an attacker rotating IPs still hits the per-email limit.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 10;
const MAX_ATTEMPTS_PER_IP = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body ?? {};
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const ipKey = `ip:${getClientIp(req)}`;
    const emailKey = `email:${normalizedEmail}`;

    const sql = getSql();
    const [ipBlocked, emailBlocked] = await Promise.all([
      isLoginBlocked(sql, ipKey, { windowMs: WINDOW_MS, maxAttempts: MAX_ATTEMPTS_PER_IP }),
      isLoginBlocked(sql, emailKey, { windowMs: WINDOW_MS, maxAttempts: MAX_ATTEMPTS_PER_EMAIL }),
    ]);
    if (ipBlocked || emailBlocked) {
      return sendJson(res, 429, { error: 'Too many attempts. Try again later.' });
    }

    const rows = await sql`
      SELECT id, email, display_name, password_hash
      FROM users WHERE lower(email) = ${normalizedEmail}
    `;
    const user = rows[0];
    // Generic message for both unknown email and wrong password
    // (no user enumeration).
    if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
      await Promise.all([
        recordFailedLogin(sql, ipKey, { windowMs: WINDOW_MS, maxAttempts: MAX_ATTEMPTS_PER_IP }),
        recordFailedLogin(sql, emailKey, { windowMs: WINDOW_MS, maxAttempts: MAX_ATTEMPTS_PER_EMAIL }),
      ]);
      return sendJson(res, 401, { error: 'Invalid credentials' });
    }

    // Successful login clears both counters: legitimate users are never
    // punished for their own eventual correct password.
    await Promise.all([clearLoginAttempts(sql, ipKey), clearLoginAttempts(sql, emailKey)]);

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
