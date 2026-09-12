import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { HttpError } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/memberships/bulk — retired until the CSV invitation flow exists.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const error = new HttpError(410, 'Bulk access provisioning is deferred; use individual invitations');
    error.code = 'BULK_INVITATIONS_DEFERRED';
    throw error;
  } catch (error) {
    return handleError(res, error);
  }
}
