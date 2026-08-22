import { getSql, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Unified onboarding: creates the organization, an ADMIN membership
 * and optionally a self-linked Employee (when employeeName is provided).
 * Idempotency guard: a user with any existing membership has already
 * onboarded and cannot repeat this step.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const ctx = await resolveContext(req, sql);
    if (!ctx) {
      return sendJson(res, 401, { error: 'Not authenticated' });
    }
    if (ctx.memberships.length > 0) {
      return sendJson(res, 409, { error: 'Onboarding already completed' });
    }

    const organizationName = String(req.body?.organizationName ?? '').trim();
    const employeeName = String(req.body?.employeeName ?? '').trim();

    if (!organizationName) {
      return sendJson(res, 400, { error: 'Organization name is required' });
    }

    // Use displayName or employeeName as the organization label if not provided
    const orgLabel = organizationName || ctx.user.displayName || ctx.user.email;

    const orgRows = await sql`
      INSERT INTO organizations (name)
      VALUES (${orgLabel})
      RETURNING id
    `;
    const organizationId = orgRows[0].id;

    await sql`
      INSERT INTO memberships (user_id, organization_id, role)
      VALUES (${ctx.user.id}, ${organizationId}, 'ADMIN')
    `;

    // Create self-linked employee if employeeName provided
    if (employeeName) {
      await sql`
        INSERT INTO employees (organization_id, name, user_id, status)
        VALUES (${organizationId}, ${employeeName}, ${ctx.user.id}, 'active')
      `;
    }

    return sendJson(res, 201, { organizationId });
  } catch (error) {
    return handleError(res, error);
  }
}