import { getSql } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import { validateAccessInvitation } from '../_lib/invitations.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    const token = String(req.query?.token ?? '').trim();
    if (!token) return sendJson(res, 404, { error: 'This invitation is not available', code: 'INVITATION_INVALID' });
    return sendJson(res, 200, await validateAccessInvitation(getSql(), token));
  } catch (error) {
    return handleError(res, error);
  }
}
