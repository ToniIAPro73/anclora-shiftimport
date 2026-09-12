import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import { createAccessInvitation, listAccessDirectory } from '../_lib/invitations.js';

export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      return sendJson(res, 200, await listAccessDirectory(sql, ctx));
    }
    if (req.method === 'POST') {
      return sendJson(res, 201, await createAccessInvitation(sql, ctx, req.body ?? {}));
    }
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
