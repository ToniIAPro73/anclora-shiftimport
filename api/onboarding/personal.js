import { getSql, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Fase 1.2C.3: "Para mí" onboarding. Creates the personal organization, an
 * ADMIN membership and a self-linked Employee so the import flow works
 * without extra setup. Idempotency guard: a user with any existing
 * membership has already onboarded (personal or company) and cannot repeat
 * this step, so an interrupted signup can always resume safely by retrying
 * the same choice, but never double-provisions.
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

    const label = ctx.user.displayName || ctx.user.email;

    const orgRows = await sql`
      INSERT INTO organizations (name, type)
      VALUES (${label}, 'personal')
      RETURNING id
    `;
    const organizationId = orgRows[0].id;

    await sql`
      INSERT INTO memberships (user_id, organization_id, role)
      VALUES (${ctx.user.id}, ${organizationId}, 'ADMIN')
    `;

    await sql`
      INSERT INTO employees (organization_id, name, user_id)
      VALUES (${organizationId}, ${label}, ${ctx.user.id})
    `;

    return sendJson(res, 201, { organizationId });
  } catch (error) {
    return handleError(res, error);
  }
}
