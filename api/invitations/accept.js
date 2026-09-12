import { createSession, getSql, sessionCookieHeader } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import { acceptAccessInvitation } from '../_lib/invitations.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    const sql = getSql();
    const result = await acceptAccessInvitation(sql, req.body ?? {}, {
      createSessionFn: (userId) => createSession(sql, userId),
    });
    if (result.session) {
      res.setHeader('Set-Cookie', sessionCookieHeader(req, result.session.token, result.session.expiresAt));
    }
    return sendJson(res, 200, {
      status: 'ACCEPTED',
      organizationId: result.organization_id,
      userId: result.user_id,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
