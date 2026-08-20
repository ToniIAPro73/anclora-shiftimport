import { getSql, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Fase 1.2C.4: "Para mi empresa" onboarding. Minimal data only: company
 * name always, administrator name only when the account doesn't already
 * have one. Creates the company organization and an ADMIN membership — no
 * self Employee: a company ADMIN is not automatically a scheduled worker.
 * Same idempotency guard as /api/onboarding/personal.
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

    const companyName = String(req.body?.companyName ?? '').trim();
    const adminName = String(req.body?.adminName ?? '').trim();

    if (!companyName) {
      return sendJson(res, 400, { error: 'Company name is required' });
    }
    if (!ctx.user.displayName && !adminName) {
      return sendJson(res, 400, { error: 'Administrator name is required' });
    }

    if (!ctx.user.displayName && adminName) {
      await sql`UPDATE users SET display_name = ${adminName} WHERE id = ${ctx.user.id}`;
    }

    // Fase 1.2G: pre-Stripe trial grant — a fresh company org starts on
    // 'team' so the B2B signup flow can exercise Team features immediately.
    // This is NOT a paid subscription; docs/pricing-hypothesis.md documents
    // it explicitly as pre-billing behavior to replace once Stripe lands.
    const orgRows = await sql`
      INSERT INTO organizations (name, type, plan)
      VALUES (${companyName}, 'company', 'team')
      RETURNING id
    `;
    const organizationId = orgRows[0].id;

    await sql`
      INSERT INTO memberships (user_id, organization_id, role)
      VALUES (${ctx.user.id}, ${organizationId}, 'ADMIN')
    `;

    return sendJson(res, 201, { organizationId });
  } catch (error) {
    return handleError(res, error);
  }
}
