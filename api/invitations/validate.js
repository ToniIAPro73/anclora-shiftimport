import { getSql } from '../_lib/auth.js';
import { handleError, sendJson, setNoStoreSecurityHeaders } from '../_lib/http.js';
import { isValidInvitationToken, validateAccessInvitation } from '../_lib/invitations.js';

export default async function handler(req, res) {
  setNoStoreSecurityHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    const contentLength = Number(req.headers?.['content-length'] ?? 0);
    const bodyLength = JSON.stringify(req.body ?? {}).length;
    if (contentLength > 4096 || bodyLength > 4096) return sendJson(res, 413, { error: 'Request body is too large' });
    const token = req.body?.token;
    if (!isValidInvitationToken(token)) {
      return sendJson(res, 404, { error: 'This invitation is not available', code: 'INVITATION_INVALID' });
    }
    return sendJson(res, 200, await validateAccessInvitation(getSql(), token));
  } catch (error) {
    return handleError(res, error);
  }
}
