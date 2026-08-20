import { clearSessionCookieHeader, destroySession, getSql, parseSessionToken } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    await destroySession(getSql(), parseSessionToken(req));
    res.setHeader('Set-Cookie', clearSessionCookieHeader(req));
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return handleError(res, error);
  }
}
