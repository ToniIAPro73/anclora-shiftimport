import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { updateOrganizationName } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET   /api/organizations/current — active organization's id/name/plan.
 *       Any role (both ADMIN and EMPLOYEE need this to render read-only
 *       "your organization" info); values are already in ctx (see
 *       resolveContext in _lib/auth.js), so this reads no extra row.
 * PATCH /api/organizations/current — rename the active organization.
 *       ADMIN/OWNER only (checked in updateOrganizationName, not just here —
 *       master prompt §25). `plan` is not editable (no billing yet).
 *
 * Tenant isolation: organization_id always comes from the session context,
 * never from the request body/query — there is no "which org" parameter.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const membership = ctx.memberships.find((m) => m.organizationId === ctx.organizationId);
      return sendJson(res, 200, {
        organization: {
          id: ctx.organizationId,
          name: membership?.organizationName ?? null,
          plan: ctx.plan,
        },
      });
    }

    if (req.method === 'PATCH') {
      const organization = await updateOrganizationName(sql, ctx, req.body?.name);
      return sendJson(res, 200, { organization });
    }

    res.setHeader('Allow', 'GET, PATCH');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
