import { getSql, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/** Current session: user, memberships and active-organization context. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const ctx = await resolveContext(req, getSql());
    if (!ctx) {
      return sendJson(res, 401, { error: 'Not authenticated' });
    }
    return sendJson(res, 200, {
      user: ctx.user,
      organizationId: ctx.organizationId,
      role: ctx.role,
      employeeId: ctx.employeeId,
      memberships: ctx.memberships,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
