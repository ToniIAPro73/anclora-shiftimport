import { randomUUID } from 'node:crypto';
import { getSql, requireAuthenticatedContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Unified onboarding: creates the organization and an OWNER membership.
 * A self-linked Employee is created only when ownerIsEmployee is explicitly
 * true. User/Membership/Employee are independent domain entities.
 * Idempotency guard: a user with any existing membership has already
 * onboarded and cannot repeat this step.
 *
 * All steps run inside a single DB transaction — if any step fails,
 * everything rolls back so no partial state remains. The neon HTTP driver
 * only supports `sql.transaction([...queries])` (one batch = one
 * transaction), so the organization id is generated up front to keep the
 * three inserts independent of each other's results.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const ctx = requireAuthenticatedContext(await resolveContext(req, sql));
    if (ctx.memberships.length > 0) {
      return sendJson(res, 409, { error: 'Onboarding already completed' });
    }

    const organizationName = String(req.body?.organizationName ?? '').trim();
    // `adminName` remains a backwards-compatible alias for the owner's
    // display name. It must never imply that the owner is also an Employee.
    const ownerName = String(req.body?.ownerName ?? req.body?.adminName ?? '').trim();
    const ownerIsEmployee = req.body?.ownerIsEmployee === true;
    const employeeName = ownerIsEmployee
      ? String(req.body?.employeeName ?? '').trim() || ownerName || ctx.user.displayName || ctx.user.email
      : '';

    if (!organizationName) {
      return sendJson(res, 400, { error: 'Organization name is required' });
    }

    // Use displayName as the organization label if not provided.
    const orgLabel = organizationName || ctx.user.displayName || ctx.user.email;

    // Personal flow (self employee) = B2C personal org; organizationName
    // alone = B2B company org (organizations.type is NOT NULL, no default).
    const organizationType = ownerIsEmployee ? 'personal' : 'company';

    const organizationId = randomUUID();
    const queries = [
      sql`
        INSERT INTO organizations (id, name, type) VALUES (${organizationId}, ${orgLabel}, ${organizationType})
      `,
      sql`
        INSERT INTO memberships (user_id, organization_id, role)
        VALUES (${ctx.user.id}, ${organizationId}, 'OWNER')
      `,
    ];
    // Compatibility: legacy clients may send adminName. Keep its intended
    // identity meaning by updating User.displayName, never by creating an
    // Employee. The current registration flow already sets this value.
    if (ownerName) {
      queries.push(sql`
        UPDATE users
        SET display_name = ${ownerName}, updated_at = NOW()
        WHERE id = ${ctx.user.id}
      `);
    }
    // Step 3: optional self-linked Employee ACTIVE, only after explicit opt-in.
    if (ownerIsEmployee) {
      queries.push(sql`
        INSERT INTO employees (organization_id, name, user_id, status)
        VALUES (${organizationId}, ${employeeName}, ${ctx.user.id}, 'active')
      `);
    }
    await sql.transaction(queries);

    return sendJson(res, 201, { organizationId });
  } catch (error) {
    return handleError(res, error);
  }
}
