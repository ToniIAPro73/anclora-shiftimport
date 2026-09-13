import { createSession, getSql, resolveContext, sessionCookieHeader } from '../_lib/auth.js';
import { handleError, sendJson, setNoStoreSecurityHeaders } from '../_lib/http.js';
import { acceptAccessInvitation } from '../_lib/invitations.js';

export default async function handler(req, res) {
  setNoStoreSecurityHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    const sql = getSql();
    // Authoritative identity of whoever is calling this endpoint right now
    // (their own cookie session, re-validated server-side) — used only to
    // detect a session conflict, never trusted from the request body.
    const ctx = await resolveContext(req, sql);
    const result = await acceptAccessInvitation(sql, req.body ?? {}, {
      createSessionFn: (userId) => createSession(sql, userId),
      acceptLanguageHeader: req.headers?.['accept-language'],
      currentUserEmail: ctx?.user?.email ?? null,
    });
    if (result.session) {
      res.setHeader('Set-Cookie', sessionCookieHeader(req, result.session.token, result.session.expiresAt));
    }
    return sendJson(res, 200, {
      status: 'ACCEPTED',
      organizationId: result.organization_id,
      userId: result.user_id,
      // Only present when the caller was authenticated as a different
      // identity than the invitation just activated: the invited account is
      // active, but no session was created/replaced for it here.
      ...(result.requiresAccountSwitch ? { requiresAccountSwitch: true, currentEmail: ctx.user.email } : {}),
    });
  } catch (error) {
    return handleError(res, error);
  }
}
