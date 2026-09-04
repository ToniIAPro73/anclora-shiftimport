import { randomUUID } from 'node:crypto';
import { getSql, requireAuthenticatedContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Unified onboarding: creates the organization, an OWNER membership
 * and optionally a self-linked Employee (when employeeName is provided).
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
    // `adminName` accepted as an alias: the web client (src/lib/session.ts
    // completeOnboarding) sends that field name for the self-employee.
    const employeeName = String(req.body?.employeeName ?? req.body?.adminName ?? '').trim();

    if (!organizationName) {
      return sendJson(res, 400, { error: 'Organization name is required' });
    }

    // Use displayName or employeeName as the organization label if not provided
    const orgLabel = organizationName || ctx.user.displayName || ctx.user.email;

    // Personal flow (self employee) = B2C personal org; organizationName
    // alone = B2B company org (organizations.type is NOT NULL, no default).
    const organizationType = employeeName ? 'personal' : 'company';

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
    // Step 3: optional self-linked Employee ACTIVE
    if (employeeName) {
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
