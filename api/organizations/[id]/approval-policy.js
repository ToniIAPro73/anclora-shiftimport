import { getSql, requireOrgContext, requireRole, resolveContext } from '../../_lib/auth.js';
import { APPROVAL_POLICIES } from '../../_lib/approval.js';
import { handleError, sendJson } from '../../_lib/http.js';

/** Organization-scoped Approval Lite policy. OWNER/ADMIN only. */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    requireRole(ctx, 'ADMIN');

    const organizationId = String(req.query?.id ?? '').trim();
    if (!organizationId || organizationId !== ctx.organizationId) {
      return sendJson(res, 404, { error: 'Organization not found' });
    }

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, approval_policy
        FROM organizations
        WHERE id = ${organizationId}
      `;
      if (rows.length === 0) {
        return sendJson(res, 404, { error: 'Organization not found' });
      }
      return sendJson(res, 200, { policy: rows[0].approval_policy });
    }

    if (req.method === 'PUT') {
      const policy = String(req.body?.policy ?? '').trim();
      if (!APPROVAL_POLICIES.includes(policy)) {
        return sendJson(res, 400, { error: 'Invalid approval policy' });
      }
      const rows = await sql`
        UPDATE organizations
        SET approval_policy = ${policy}, updated_at = NOW()
        WHERE id = ${organizationId}
        RETURNING id, approval_policy
      `;
      if (rows.length === 0) {
        return sendJson(res, 404, { error: 'Organization not found' });
      }
      return sendJson(res, 200, { policy: rows[0].approval_policy });
    }

    res.setHeader('Allow', 'GET, PUT');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
