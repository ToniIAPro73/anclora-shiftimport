import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import { resendAccessInvitation, revokeAccessInvitation } from '../_lib/invitations.js';

export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const id = String(req.query?.id ?? '').trim();
    if (!id) return sendJson(res, 400, { error: 'Invitation id is required' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const action = String(req.body?.action ?? '').trim().toLowerCase();
    if (action === 'revoke') return sendJson(res, 200, await revokeAccessInvitation(sql, ctx, id));
    if (action === 'resend') return sendJson(res, 200, await resendAccessInvitation(sql, ctx, id, req.body ?? {}));
    return sendJson(res, 400, { error: 'Unknown invitation action' });
  } catch (error) {
    return handleError(res, error);
  }
}
