import { createHash, randomBytes } from 'node:crypto';
import { getSql, requireAuthenticatedContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import { hashPassword } from '../_lib/passwords.js';
import { PLAN_IDS } from '../_lib/plans.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stableUuid(seed) {
  const hex = createHash('md5').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(Number.parseInt(hex.slice(16, 18), 16) & 0x3f | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20)}`;
}

function normalizeInput(body, user) {
  const legacy = !body?.organization;
  const ownerIsEmployee = legacy
    ? body?.ownerIsEmployee === true
    : body?.owner?.isEmployee === true;
  const plan = String(body?.plan ?? (ownerIsEmployee ? 'personal' : 'team')).trim().toLowerCase();
  const organizationName = String(body?.organization?.name ?? body?.organizationName ?? '').trim();
  const ownerName = String(body?.owner?.name ?? body?.ownerName ?? body?.adminName ?? user.displayName ?? '').trim();
  const areas = Array.isArray(body?.areas)
    ? body.areas.map((area) => ({
      name: String(area?.name ?? '').trim(),
      ref: String(area?.ref ?? area?.areaRef ?? '').trim(),
    }))
    : [];
  const rawAdmin = body?.admin;
  const admin = rawAdmin && typeof rawAdmin === 'object'
    ? {
      name: String(rawAdmin.name ?? '').trim(),
      email: String(rawAdmin.email ?? '').trim().toLowerCase(),
      isEmployee: rawAdmin.isEmployee === true,
      employeeName: String(rawAdmin.employeeName ?? '').trim(),
      areaRef: String(rawAdmin.areaRef ?? '').trim(),
      externalEmployeeId: String(rawAdmin.externalEmployeeId ?? '').trim(),
    }
    : null;
  const owner = {
    isEmployee: ownerIsEmployee,
    name: ownerName,
    employeeName: String(body?.owner?.employeeName ?? body?.employeeName ?? '').trim() || ownerName || user.email,
    areaRef: String(body?.owner?.areaRef ?? '').trim(),
    externalEmployeeId: String(body?.owner?.externalEmployeeId ?? '').trim(),
  };
  return { plan, organizationName, owner, areas, admin, legacy };
}

function resolveAreaId(areaRef, areaIds) {
  if (!areaRef) return null;
  const match = /^area-(\d+)$/.exec(areaRef) ?? /^(\d+)$/.exec(areaRef);
  if (!match) return null;
  return areaIds[Number(match[1])] ?? null;
}

/**
 * Plan-aware onboarding: creates the organization, selected pre-billing plan,
 * exactly one OWNER membership, optional areas, optional self-linked owner
 * Employee, and optional Team ADMIN in one transaction. User/Membership/
 * Employee remain independent domain entities. The legacy three-field payload
 * is accepted during the client migration, but new callers use the structured
 * plan/organization/areas/owner/admin contract.
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

    const input = normalizeInput(req.body ?? {}, ctx.user);
    if (!input.organizationName) {
      return sendJson(res, 400, { error: 'Organization name is required' });
    }
    if (!PLAN_IDS.includes(input.plan)) {
      return sendJson(res, 400, { error: 'Selected plan is not available during pre-billing onboarding', code: 'INVALID_PLAN' });
    }
    if (input.plan !== 'team' && (input.areas.length > 0 || input.admin)) {
      return sendJson(res, 400, { error: 'Areas and additional administrators require the Team plan', code: 'PLAN_CONFIGURATION_INVALID' });
    }
    if (input.areas.some((area) => !area.name)) {
      return sendJson(res, 400, { error: 'Area names are required' });
    }
    const normalizedAreaNames = input.areas.map((area) => area.name.toLocaleLowerCase());
    if (new Set(normalizedAreaNames).size !== normalizedAreaNames.length) {
      return sendJson(res, 400, { error: 'Area names must be unique' });
    }
    if (input.admin) {
      if (!input.admin.name || !EMAIL_RE.test(input.admin.email)) {
        return sendJson(res, 400, { error: 'A valid administrator name and email are required' });
      }
      if (input.admin.email === String(ctx.user.email).toLowerCase()) {
        return sendJson(res, 400, { error: 'The owner is already the organization owner' });
      }
      if (input.admin.isEmployee && !input.admin.employeeName) {
        return sendJson(res, 400, { error: 'An employee name is required for the administrator' });
      }
    }

    const existingAdminRows = input.admin
      ? await sql`SELECT id FROM users WHERE lower(email) = ${input.admin.email}`
      : [];
    const existingAdminId = existingAdminRows[0]?.id ?? null;
    const temporaryPassword = input.admin && !existingAdminId ? randomBytes(12).toString('base64url') : null;

    // Deterministic identifiers make a retried final submit converge on the
    // same bootstrap organization without adding a migration or a second
    // idempotency table. The membership check above still rejects a normal
    // post-success repeat before any writes are attempted.
    const organizationId = stableUuid(`onboarding:${ctx.user.id}`);
    const ownerEmployeeId = stableUuid(`${organizationId}:owner-employee`);
    const areaIds = input.areas.map((_, index) => stableUuid(`${organizationId}:area:${index}`));
    const adminUserId = existingAdminId ?? (input.admin ? stableUuid(`onboarding-admin:${input.admin.email}`) : null);
    const adminEmployeeId = input.admin?.isEmployee ? stableUuid(`${organizationId}:admin-employee:${adminUserId}`) : null;
    const organizationType = input.plan === 'team' ? 'company' : 'personal';
    const queries = [
      sql`
        INSERT INTO organizations (id, name, type, plan)
        VALUES (${organizationId}, ${input.organizationName}, ${organizationType}, ${input.plan})
        ON CONFLICT (id) DO NOTHING
      `,
      sql`
        INSERT INTO memberships (user_id, organization_id, role)
        VALUES (${ctx.user.id}, ${organizationId}, 'OWNER')
        ON CONFLICT (user_id, organization_id) DO NOTHING
      `,
    ];
    // Preserve the legacy display-name alias during the client migration.
    // The structured wizard intentionally does not edit the authenticated
    // user's identity; it only displays it in the OWNER summary.
    if (input.legacy && input.owner.name) {
      queries.push(sql`
        UPDATE users SET display_name = ${input.owner.name}, updated_at = NOW()
        WHERE id = ${ctx.user.id}
      `);
    }
    input.areas.forEach((area, index) => {
      queries.push(sql`
        INSERT INTO areas (id, organization_id, name)
        VALUES (${areaIds[index]}, ${organizationId}, ${area.name})
        ON CONFLICT (id) DO NOTHING
      `);
    });
    if (input.owner.isEmployee) {
      queries.push(sql`
        INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status, area_id)
        VALUES (${ownerEmployeeId}, ${organizationId}, ${input.owner.externalEmployeeId || null}, ${input.owner.employeeName}, ${ctx.user.id}, 'active', ${resolveAreaId(input.owner.areaRef, areaIds)})
        ON CONFLICT (id) DO NOTHING
      `);
    }
    if (input.admin) {
      if (!existingAdminId) {
        queries.push(sql`
          INSERT INTO users (id, email, password_hash, display_name)
          VALUES (${adminUserId}, ${input.admin.email}, ${hashPassword(temporaryPassword)}, ${input.admin.name})
          ON CONFLICT (id) DO NOTHING
        `);
      }
      queries.push(sql`
        INSERT INTO memberships (user_id, organization_id, role)
        VALUES (${adminUserId}, ${organizationId}, 'ADMIN')
        ON CONFLICT (user_id, organization_id) DO NOTHING
      `);
      if (input.admin.isEmployee) {
        queries.push(sql`
          INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status, area_id)
          VALUES (${adminEmployeeId}, ${organizationId}, ${input.admin.externalEmployeeId || null}, ${input.admin.employeeName}, ${adminUserId}, 'active', ${resolveAreaId(input.admin.areaRef, areaIds)})
          ON CONFLICT (id) DO NOTHING
        `);
      }
    }
    await sql.transaction(queries);

    return sendJson(res, 201, {
      organizationId,
      ...(temporaryPassword ? { adminCredentials: { email: input.admin.email, temporaryPassword } } : {}),
    });
  } catch (error) {
    return handleError(res, error);
  }
}
