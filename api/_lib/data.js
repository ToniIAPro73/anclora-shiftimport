import { randomBytes, randomUUID } from 'node:crypto';
import { HttpError, requireRole } from './auth.js';
import { canUseFeature, checkLimit, requireFeature, requireWithinLimit } from './plans.js';

/**
 * Tenant-scoped data access. Every function takes the resolved security
 * context (ctx) and enforces:
 * - organization_id always comes from ctx (session), never from the client;
 * - EMPLOYEE role is forced through its linked employee_id;
 * - any employee referenced by the client must belong to ctx.organizationId.
 *
 * Functions accept the sql executor as first parameter so tests can inject a
 * fake.
 */

export function normalizeShiftDate(value) {
  const trimmed = String(value ?? '').trim();
  const match = trimmed.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return trimmed;
  }
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeShiftInput(raw) {
  return {
    id: String(raw?.id ?? '').trim() || null,
    employeeId: String(raw?.employeeId ?? '').trim(),
    importId: String(raw?.importId ?? '').trim() || null,
    date: normalizeShiftDate(raw?.date ?? ''),
    startTime: String(raw?.startTime ?? '').trim(),
    endTime: String(raw?.endTime ?? '').trim(),
    location: String(raw?.location ?? '').trim(),
    origin: raw?.origin === 'MAN' ? 'MAN' : 'IMP',
    areaId: raw?.areaId ? String(raw.areaId).trim() || null : null,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapEmployeeRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    externalEmployeeId: row.external_employee_id,
    name: row.name,
    userId: row.user_id,
    areaId: row.area_id ?? null,
    status: row.status,
    deactivatedAt: row.deactivated_at,
  };
}

function mapImportRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    importedByUserId: row.imported_by_user_id,
    fileName: row.file_name,
    sourceFormat: row.source_format,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    status: row.status,
    areaId: row.area_id ?? null,
    createdAt: row.created_at,
  };
}

function mapShiftRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    employeeId: row.employee_id,
    importId: row.import_id,
    areaId: row.area_id ?? null,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    origin: row.origin,
  };
}

/** Effective employee filter for read/write of shifts. */
function effectiveEmployeeId(ctx, requestedEmployeeId) {
  if (ctx.role === 'EMPLOYEE') {
    if (!ctx.employeeId) {
      throw new HttpError(403, 'No employee linked to this user');
    }
    return ctx.employeeId;
  }
  return requestedEmployeeId || null;
}

async function assertEmployeeInOrg(sql, ctx, employeeId) {
  const rows = await sql`
    SELECT id FROM employees
    WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) {
    throw new HttpError(403, 'Employee does not belong to the organization');
  }
}

/**
 * Areas are optional (0..N per organization). An area id sent by the client
 * is only ever accepted when the row belongs to ctx.organizationId — same
 * no-cross-tenant convention as assertEmployeeInOrg (403, no existence leak).
 */
async function assertAreaInOrg(sql, ctx, areaId) {
  const rows = await sql`
    SELECT id FROM areas
    WHERE id = ${areaId} AND organization_id = ${ctx.organizationId} AND active = TRUE
  `;
  if (rows.length === 0) {
    throw new HttpError(403, 'Area does not belong to the organization');
  }
}

/**
 * Resolve an area by normalized (trim + lowercase) name or code within the
 * session org. Returns the area id, or null when the name/code is unknown —
 * callers decide whether unknown means "store null" (never) or "fail the
 * row" (roster bulk) — unknown areas are NEVER auto-created here.
 */
async function resolveAreaIdByName(sql, ctx, areaName) {
  const normalized = String(areaName ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const rows = await sql`
    SELECT id FROM areas
    WHERE organization_id = ${ctx.organizationId}
      AND active = TRUE
      AND (lower(trim(name)) = ${normalized}
        OR (code IS NOT NULL AND lower(trim(code)) = ${normalized}))
  `;
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------- employees

export async function listEmployees(sql, ctx, { areaId = null } = {}) {
  if (ctx.role === 'EMPLOYEE') {
    const rows = await sql`
      SELECT * FROM employees
      WHERE organization_id = ${ctx.organizationId}
        AND user_id = ${ctx.user.id}
      ORDER BY name ASC
    `;
    return rows.map(mapEmployeeRow);
  }
  // Optional area filter (ADMIN dashboard area context). A foreign area id
  // simply matches nothing — no cross-tenant leak through list filters.
  const rows = areaId
    ? await sql`
        SELECT * FROM employees
        WHERE organization_id = ${ctx.organizationId}
          AND area_id = ${areaId}
        ORDER BY name ASC
      `
    : await sql`
        SELECT * FROM employees
        WHERE organization_id = ${ctx.organizationId}
        ORDER BY name ASC
      `;
  return rows.map(mapEmployeeRow);
}

/** Matching support for the importer: find by external id or normalized name.
 *
 * EMPLOYEE role: never search the org directory by client-sent text — that
 * would leak other employees' names/ids to a curious/malicious request. An
 * EMPLOYEE can only ever "match" their own linked row, or get 'new' (never
 * another employee's row, never 'ambiguous' with other people). */
export async function findEmployeeMatch(sql, ctx, { externalEmployeeId, name }) {
  const normalizedName = String(name ?? '').trim().toLowerCase();
  const externalId = String(externalEmployeeId ?? '').trim();

  if (ctx.role === 'EMPLOYEE') {
    if (!ctx.employeeId) {
      return { kind: 'new', employees: [] };
    }
    const rows = await sql`
      SELECT * FROM employees WHERE id = ${ctx.employeeId} AND organization_id = ${ctx.organizationId}
    `;
    const self = rows[0] ? mapEmployeeRow(rows[0]) : null;
    if (!self) {
      return { kind: 'new', employees: [] };
    }
    const selfMatches = (externalId && externalId === (self.externalEmployeeId ?? ''))
      || (normalizedName && normalizedName === self.name.trim().toLowerCase());
    return selfMatches ? { kind: 'recognized', employees: [self] } : { kind: 'new', employees: [] };
  }

  if (externalId) {
    const rows = await sql`
      SELECT * FROM employees
      WHERE organization_id = ${ctx.organizationId}
        AND external_employee_id = ${externalId}
    `;
    if (rows.length > 0) {
      const employees = rows.map(mapEmployeeRow);
      if (employees.length === 1 && employees[0].status === 'inactive') {
        return { kind: 'recognized_inactive', employees };
      }
      return { kind: 'recognized', employees };
    }
  }

  if (normalizedName) {
    const rows = await sql`
      SELECT * FROM employees
      WHERE organization_id = ${ctx.organizationId}
        AND lower(trim(name)) = ${normalizedName}
    `;
    if (rows.length === 1) {
      const employees = rows.map(mapEmployeeRow);
      return { kind: employees[0].status === 'inactive' ? 'recognized_inactive' : 'recognized', employees };
    }
    if (rows.length > 1) {
      return { kind: 'ambiguous', employees: rows.map(mapEmployeeRow) };
    }
  }

  return { kind: 'new', employees: [] };
}

export async function createEmployee(sql, ctx, input) {
  requireRole(ctx, 'ADMIN');
  const name = String(input?.name ?? '').trim();
  if (!name) {
    throw new HttpError(400, 'Employee name is required');
  }

  // Fase 1.2G: structural enforcement — Free/Personal cap at 1 employee,
  // so a personal-plan org can never accidentally grow into a full B2B
  // team workspace just by inline-adding people.
  const existing = await sql`
    SELECT count(*) AS count FROM employees WHERE organization_id = ${ctx.organizationId} AND status = 'active'
  `;
  requireWithinLimit(
    ctx.plan,
    'maxEmployees',
    Number(existing[0]?.count ?? 0),
    'This plan only allows 1 employee. Upgrade to Team to add more.',
  );

  const externalId = String(input?.externalEmployeeId ?? '').trim() || null;
  // PENDING_ACCESS: employees created without a user_id start as pending_access
  // (no login access yet). The onboarding endpoint explicitly passes status='active'
  // when creating a self-linked employee with user_id.
  const status = input?.status === 'active' ? 'active' : 'pending_access';

  // Optional area assignment: by id (validated against the session org) or by
  // name/code (unknown name is a client error, never an auto-create).
  let areaId = null;
  if (input?.areaId !== undefined && input.areaId !== null && String(input.areaId).trim()) {
    areaId = String(input.areaId).trim();
    await assertAreaInOrg(sql, ctx, areaId);
  } else if (input?.areaName !== undefined && String(input.areaName).trim()) {
    areaId = await resolveAreaIdByName(sql, ctx, input.areaName);
    if (!areaId) {
      throw new HttpError(400, `Unknown area: ${String(input.areaName).trim()}`);
    }
  }

  const rows = areaId
    ? await sql`
        INSERT INTO employees (organization_id, external_employee_id, name, status, area_id)
        VALUES (${ctx.organizationId}, ${externalId}, ${name}, ${status}, ${areaId})
        RETURNING *
      `
    : await sql`
        INSERT INTO employees (organization_id, external_employee_id, name, status)
        VALUES (${ctx.organizationId}, ${externalId}, ${name}, ${status})
        RETURNING *
      `;
  return mapEmployeeRow(rows[0]);
}

/**
 * ADMIN only: create many employees in one request (multi-employee import
 * "create all new" flow). Every item is revalidated server-side against the
 * org's CURRENT roster (never trusts what the client believed at upload
 * time) and processed sequentially — no concurrency, so the plan-limit
 * running count below can't race itself. Never creates a User; `user_id`
 * is simply omitted from the INSERT, staying NULL per the schema default.
 * Partial failure is the point: one bad row never aborts the rest.
 */
export async function bulkCreateEmployees(sql, ctx, items) {
  requireRole(ctx, 'ADMIN');

  // The roster index covers employees of ANY status so an inactive employee
  // is matched (reported as 'existing_inactive') instead of duplicated.
  const existingRows = await sql`
    SELECT * FROM employees WHERE organization_id = ${ctx.organizationId}
  `;
  const byExternalId = new Map();
  const byName = new Map();
  for (const row of existingRows) {
    const employee = mapEmployeeRow(row);
    if (employee.externalEmployeeId) {
      byExternalId.set(employee.externalEmployeeId, employee);
    }
    const key = employee.name.trim().toLowerCase();
    byName.set(key, byName.has(key) ? null : employee); // null = ambiguous, never auto-matched
  }

  // Roster `area` column resolution: one lookup of the org's active areas,
  // matched per row by normalized name OR code. Empty cell → area_id NULL
  // (employee belongs directly to the org). Unknown area → the row FAILS
  // with reason 'unknown_area' — unknown areas are never auto-created, so
  // "Operaciones"/"operaciones"/" OPERACIONES" can never spawn duplicates.
  const areaRows = await sql`
    SELECT id, name, code FROM areas
    WHERE organization_id = ${ctx.organizationId} AND active = TRUE
  `;
  const areaIdByKey = new Map();
  for (const area of areaRows) {
    areaIdByKey.set(area.name.trim().toLowerCase(), area.id);
    if (area.code) {
      areaIdByKey.set(area.code.trim().toLowerCase(), area.id);
    }
  }
  const resolveRosterArea = (raw) => {
    const explicitAreaId = String(raw?.areaId ?? '').trim();
    if (explicitAreaId) {
      const known = areaRows.some((area) => area.id === explicitAreaId);
      return known ? { areaId: explicitAreaId } : { unknown: true, label: explicitAreaId };
    }
    const areaName = raw?.areaName;
    const normalized = String(areaName ?? '').trim().toLowerCase();
    if (!normalized) {
      return { areaId: null };
    }
    const areaId = areaIdByKey.get(normalized);
    return areaId ? { areaId } : { unknown: true, label: String(areaName ?? '').trim() };
  };

  // Plan-limit semantics (maxEmployees) count ACTIVE employees only, same as
  // createEmployee — inactive rows never consume the quota.
  let runningCount = existingRows.filter((row) => row.status === 'active').length;
  const results = [];

  for (const raw of Array.isArray(items) ? items : []) {
    const key = String(raw?.key ?? '');
    const name = String(raw?.name ?? '').trim();
    const externalId = String(raw?.externalEmployeeId ?? '').trim() || null;

    if (!name) {
      results.push({ key, status: 'failed', reason: 'invalid' });
      continue;
    }

    const matched = (externalId && byExternalId.get(externalId))
      || (!externalId && byName.get(name.toLowerCase()));
    if (matched) {
      results.push({ key, status: matched.status === 'inactive' ? 'existing_inactive' : 'existing', employee: matched });
      continue;
    }

    if (!checkLimit(ctx.plan, 'maxEmployees', runningCount)) {
      results.push({ key, status: 'failed', reason: 'plan_limit' });
      continue;
    }

    const area = resolveRosterArea(raw);
    if (area.unknown) {
      results.push({ key, status: 'failed', reason: 'unknown_area', areaError: `Unknown area: ${area.label}` });
      continue;
    }

    try {
      const inserted = area.areaId
        ? await sql`
            INSERT INTO employees (organization_id, external_employee_id, name, status, area_id)
            VALUES (${ctx.organizationId}, ${externalId}, ${name}, 'pending_access', ${area.areaId})
            ON CONFLICT (organization_id, external_employee_id) WHERE external_employee_id IS NOT NULL DO NOTHING
            RETURNING *
          `
        : await sql`
            INSERT INTO employees (organization_id, external_employee_id, name, status)
            VALUES (${ctx.organizationId}, ${externalId}, ${name}, 'pending_access')
            ON CONFLICT (organization_id, external_employee_id) WHERE external_employee_id IS NOT NULL DO NOTHING
            RETURNING *
          `;
      if (inserted.length > 0) {
        const employee = mapEmployeeRow(inserted[0]);
        if (employee.externalEmployeeId) {
          byExternalId.set(employee.externalEmployeeId, employee);
        }
        runningCount += 1;
        results.push({ key, status: 'created', employee });
      } else {
        // Lost the race to an identical external id inserted earlier in
        // this same batch (or concurrently) — never a duplicate, just late.
        const rows = await sql`
          SELECT * FROM employees
          WHERE organization_id = ${ctx.organizationId} AND external_employee_id = ${externalId}
        `;
        results.push({ key, status: 'existing', employee: rows[0] ? mapEmployeeRow(rows[0]) : null });
      }
    } catch {
      results.push({ key, status: 'failed', reason: 'error' });
    }
  }

  return { results };
}

/**
 * Last-admin protection for the employee lifecycle: deactivating or deleting
 * the employee linked to the org's last ADMIN user would leave the org
 * without anyone able to manage it (same rule as updateMemberRole /
 * removeMember). HttpError has no code param, so the machine-readable code
 * is attached post-construction; handleError serializes it.
 */
async function assertEmployeeNotLastAdmin(sql, ctx, employee) {
  if (!employee.userId) {
    return;
  }
  const rows = await sql`
    SELECT role FROM memberships
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${employee.userId}
  `;
  if (rows[0]?.role === 'ADMIN' && (await countOrgAdmins(sql, ctx.organizationId)) <= 1) {
    const error = new HttpError(400, 'The organization must keep at least one ADMIN');
    error.code = 'LAST_ADMIN';
    throw error;
  }
}

export async function updateEmployee(sql, ctx, input) {
  requireRole(ctx, 'ADMIN');
  const id = String(input?.id ?? '').trim();
  if (!id) {
    throw new HttpError(400, 'Employee id is required');
  }
  await assertEmployeeInOrg(sql, ctx, id);

  const current = mapEmployeeRow((await sql`SELECT * FROM employees WHERE id = ${id}`)[0]);
  const name = String(input?.name ?? current.name).trim() || current.name;
  const externalId = input?.externalEmployeeId !== undefined
    ? String(input.externalEmployeeId).trim() || null
    : current.externalEmployeeId;
  const status = input?.status === undefined
    ? current.status
    : (input.status === 'inactive' ? 'inactive' : 'active');

  // Area move (ADMIN): explicit areaId (null = back to organization-direct),
  // or areaName resolved within the org. Only employees.area_id changes —
  // historical shifts.area_id / imports.area_id are snapshots, never
  // recalculated retroactively.
  let areaId = current.areaId;
  if (input?.areaId !== undefined) {
    areaId = input.areaId === null ? null : String(input.areaId).trim() || null;
    if (areaId) {
      await assertAreaInOrg(sql, ctx, areaId);
    }
  } else if (input?.areaName !== undefined) {
    const areaName = String(input.areaName ?? '').trim();
    if (areaName) {
      areaId = await resolveAreaIdByName(sql, ctx, areaName);
      if (!areaId) {
        throw new HttpError(400, `Unknown area: ${areaName}`);
      }
    } else {
      areaId = null;
    }
  }

  // PENDING_ACCESS → ACTIVE transition: when linking a user to a pending_access employee,
  // the status automatically becomes 'active' (employee now has access)
  let userId = current.userId;
  let finalStatus = status;
  if (input?.userId !== undefined) {
    // Explicit null (the frontend's unlink signal) must stay an unlink —
    // String(null) would produce the literal 'null' and fail the member check.
    userId = input.userId === null ? null : String(input.userId).trim() || null;
    if (userId) {
      const member = await sql`
        SELECT 1 FROM memberships
        WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
      `;
      if (member.length === 0) {
        throw new HttpError(400, 'User is not a member of the organization');
      }
      if (current.userId && current.userId !== userId) {
        const error = new HttpError(409, 'Employee is already linked to another user');
        error.code = 'EMPLOYEE_ALREADY_LINKED';
        throw error;
      }
      const occupied = await sql`
        SELECT id FROM employees
        WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId} AND id <> ${id}
      `;
      if (occupied.length > 0) {
        const error = new HttpError(409, 'User is already linked to another employee');
        error.code = 'USER_ALREADY_LINKED';
        throw error;
      }
      // When linking a user to a pending_access employee, auto-transition to active
      if (current.status === 'pending_access') {
        finalStatus = 'active';
      }
    } else if (current.userId) {
      // Unlinking: if employee was pending_access, it stays pending_access
      // (no status change on unlink)
    }
  }
  if (finalStatus === 'inactive' && current.status !== 'inactive') {
    await assertEmployeeNotLastAdmin(sql, ctx, current);
  }
  if (finalStatus === 'active' && current.status === 'inactive') {
    const existing = await sql`
      SELECT count(*) AS count FROM employees WHERE organization_id = ${ctx.organizationId} AND status = 'active'
    `;
    requireWithinLimit(
      ctx.plan,
      'maxEmployees',
      Number(existing[0]?.count ?? 0),
      'This plan only allows 1 employee. Upgrade to Team to add more.',
    );
  }

  let deactivatedAt = current.deactivatedAt;
  if (finalStatus === 'inactive' && current.status !== 'inactive') {
    deactivatedAt = new Date();
  } else if (finalStatus === 'active') {
    deactivatedAt = null;
  }

  const rows = await sql`
    UPDATE employees
    SET name = ${name},
        external_employee_id = ${externalId},
        status = ${finalStatus},
        user_id = ${userId},
        area_id = ${areaId},
        deactivated_at = ${deactivatedAt},
        updated_at = NOW()
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
    RETURNING *
  `;
  return mapEmployeeRow(rows[0]);
}

/**
 * EMPLOYEE (or ADMIN): update own employee's name.
 * Only allows updating the name field, not status/externalId/userId.
 */
export async function updateEmployeeName(sql, ctx, employeeId, name) {
  await assertEmployeeInOrg(sql, ctx, employeeId);
  // EMPLOYEE can only update their own employee
  if (ctx.role === 'EMPLOYEE' && employeeId !== ctx.employeeId) {
    throw new HttpError(403, 'Cannot update another employee');
  }
  const rows = await sql`
    UPDATE employees
    SET name = ${name}, updated_at = NOW()
    WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
    RETURNING *
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Employee not found');
  }
  return mapEmployeeRow(rows[0]);
}

/**
 * ADMIN only: permanently delete an employee. Only possible when the
 * employee has NO shift history — shifts.employee_id is ON DELETE CASCADE,
 * so a raw delete would silently destroy it; employees with history must be
 * deactivated instead (409 EMPLOYEE_HAS_HISTORY).
 */
export async function deleteEmployee(sql, ctx, input) {
  requireRole(ctx, 'ADMIN');
  const id = String(input?.id ?? '').trim();
  if (!id) {
    throw new HttpError(400, 'Employee id is required');
  }
  const rows = await sql`
    SELECT * FROM employees
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Employee not found');
  }
  await assertEmployeeNotLastAdmin(sql, ctx, mapEmployeeRow(rows[0]));

  const deleted = await sql`
    DELETE FROM employees
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
      AND NOT EXISTS (SELECT 1 FROM shifts WHERE employee_id = ${id})
    RETURNING id
  `;
  if (deleted.length === 0) {
    const error = new HttpError(
      409,
      'This employee has shift history that would be destroyed; deactivate the employee instead of deleting',
    );
    error.code = 'EMPLOYEE_HAS_HISTORY';
    throw error;
  }
  return { deleted: true };
}

// -------------------------------------------------------------- memberships

const VALID_ROLES = ['ADMIN', 'EMPLOYEE'];

function mapMemberRow(row) {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

/** ADMIN only: members of the active organization. */
export async function listMembers(sql, ctx) {
  requireRole(ctx, 'ADMIN');
  const rows = await sql`
    SELECT m.user_id, m.role, m.created_at, u.email, u.display_name
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ${ctx.organizationId}
    ORDER BY u.email ASC
  `;
  return rows.map(mapMemberRow);
}

async function countOrgAdmins(sql, organizationId) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM memberships
    WHERE organization_id = ${organizationId} AND role = 'ADMIN'
  `;
  return rows[0].n;
}

/**
 * ADMIN only: add a member to the active organization.
 * - Existing registered user (by email): password not required.
 * - New user, password supplied: ADMIN sets an initial password (min 8) and
 *   hands it over out-of-band.
 * - New user, password omitted (bulk CSV import path): a random password is
 *   generated server-side (never client-supplied, never predictable, never
 *   logged) and returned ONCE in the response as `temporaryPassword` — the
 *   caller must show it to the ADMIN immediately and never persist it in
 *   plaintext. No email infrastructure exists yet — documented limitation,
 *   this is the explicit out-of-band handoff for both the single and bulk
 *   add-member flows.
 * Role escalation is impossible: only ADMIN reaches this function and the
 * role whitelist is enforced here.
 */
export async function addMember(sql, ctx, input, hashPasswordFn) {
  requireRole(ctx, 'ADMIN');
  // Fase 1.2G: inviting another user into the org is "team management" —
  // Free/Personal orgs are single-person by design, never silently.
  requireFeature(ctx.plan, 'teamManagement', 'Inviting team members requires the Team plan.');
  const email = String(input?.email ?? '').trim().toLowerCase();
  const role = String(input?.role ?? '').trim();
  if (!email || !VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Valid email and role are required');
  }

  let userRows = await sql`SELECT id FROM users WHERE lower(email) = ${email}`;
  let temporaryPassword;
  if (userRows.length === 0) {
    const suppliedPassword = String(input?.password ?? '');
    if (suppliedPassword && suppliedPassword.length < 8) {
      throw new HttpError(400, 'New users require an initial password of at least 8 characters');
    }
    const password = suppliedPassword || randomBytes(12).toString('base64url');
    if (!suppliedPassword) {
      temporaryPassword = password;
    }
    userRows = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${email}, ${hashPasswordFn(password)}, ${String(input?.displayName ?? '').trim()})
      RETURNING id
    `;
  }
  const userId = userRows[0].id;

  const existing = await sql`
    SELECT 1 FROM memberships
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  if (existing.length > 0) {
    throw new HttpError(409, 'User is already a member of the organization');
  }

  await sql`
    INSERT INTO memberships (user_id, organization_id, role)
    VALUES (${userId}, ${ctx.organizationId}, ${role})
  `;

  // Optional User ↔ Employee link at creation time. The relation is 1:1 and
  // a link is never silently replaced: the employee must be free (user_id
  // NULL) and the user must not be linked to any other employee in the org.
  const employeeId = String(input?.employeeId ?? '').trim();
  if (employeeId) {
    await assertEmployeeInOrg(sql, ctx, employeeId);
    const employeeRows = await sql`
      SELECT * FROM employees
      WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
    `;
    if (employeeRows[0]?.user_id) {
      const error = new HttpError(409, 'Employee is already linked to another user');
      error.code = 'EMPLOYEE_ALREADY_LINKED';
      throw error;
    }
    const occupied = await sql`
      SELECT id FROM employees
      WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId} AND id <> ${employeeId}
    `;
    if (occupied.length > 0) {
      const error = new HttpError(409, 'User is already linked to another employee');
      error.code = 'USER_ALREADY_LINKED';
      throw error;
    }
    await sql`
      UPDATE employees SET user_id = ${userId}, updated_at = NOW()
      WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
    `;
  }

  return temporaryPassword ? { userId, email, role, temporaryPassword } : { userId, email, role };
}

/** ADMIN only: change a member's role. The last ADMIN cannot be demoted. */
export async function updateMemberRole(sql, ctx, input) {
  requireRole(ctx, 'ADMIN');
  const userId = String(input?.userId ?? '').trim();
  const role = String(input?.role ?? '').trim();
  if (!userId || !VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Valid userId and role are required');
  }
  const rows = await sql`
    SELECT role FROM memberships
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Membership not found');
  }
  if (rows[0].role === 'ADMIN' && role !== 'ADMIN'
    && (await countOrgAdmins(sql, ctx.organizationId)) <= 1) {
    throw new HttpError(400, 'The organization must keep at least one ADMIN');
  }
  await sql`
    UPDATE memberships SET role = ${role}
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  return { userId, role };
}

/** ADMIN only: remove a membership. Self-removal and orphaning the org
 * without an ADMIN are blocked. Linked employees keep existing (user_id
 * set to NULL). */
export async function removeMember(sql, ctx, input) {
  requireRole(ctx, 'ADMIN');
  const userId = String(input?.userId ?? '').trim();
  if (!userId) {
    throw new HttpError(400, 'userId is required');
  }
  if (userId === ctx.user.id) {
    throw new HttpError(400, 'You cannot remove your own membership');
  }
  const rows = await sql`
    SELECT role FROM memberships
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Membership not found');
  }
  if (rows[0].role === 'ADMIN' && (await countOrgAdmins(sql, ctx.organizationId)) <= 1) {
    throw new HttpError(400, 'The organization must keep at least one ADMIN');
  }
  await sql`
    DELETE FROM memberships
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  await sql`
    UPDATE employees SET user_id = NULL, updated_at = NOW()
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  return { userId };
}

// ------------------------------------------------------------- organizations

/**
 * ADMIN only: full reset of the active organization's OPERATIONAL data.
 * Deletes, org-scoped and inside ONE transaction (a mid-failure rolls
 * everything back), in FK-safe order:
 *   1) shifts   (shifts.employee_id → employees, shifts.import_id → imports)
 *   2) imports  (no longer referenced once shifts are gone)
 *   3) employees (operational/import data — see below)
 *
 * What is KEPT (never touched): organizations, users, memberships, sessions
 * and plan — the account configuration. The admin's User row and membership
 * survive, so the account can start over immediately. `areas` and
 * `format_profiles` are also kept: both are organizational configuration
 * (how the org is structured, how it reads its own roster templates), not
 * operational history, so a data reset does not erase them. See
 * sdd/features/format-memory-v1/01_TECHNICAL_DESIGN.md (Reset policy) for
 * the decision record.
 *
 * ALL employees are deleted, including one linked to the admin user:
 * employees are operational/import data and the post-onboarding initial
 * state has zero employees; the admin User and its membership are the
 * account configuration and survive. (Memberships are unaffected, so this
 * never conflicts with the LAST_ADMIN rule, which protects memberships.)
 *
 * Requires `sql` to expose `.transaction(fn)` — the real Neon HTTP client
 * (@neondatabase/serverless) does; in tests the injected fake only needs a
 * `transaction(fn)` method plus template-tag queries.
 *
 * Returns { reset: true, deleted: { shifts, imports, employees } } with the
 * per-table deleted row counts (via RETURNING id).
 */
export async function resetOrganization(sql, ctx) {
  requireRole(ctx, 'ADMIN');
  const [shifts, imports, employees] = await sql.transaction((txn) => [
    txn`DELETE FROM shifts WHERE organization_id = ${ctx.organizationId} RETURNING id`,
    txn`DELETE FROM imports WHERE organization_id = ${ctx.organizationId} RETURNING id`,
    txn`DELETE FROM employees WHERE organization_id = ${ctx.organizationId} RETURNING id`,
  ]);
  return {
    reset: true,
    deleted: {
      shifts: shifts.length,
      imports: imports.length,
      employees: employees.length,
    },
  };
}

// ------------------------------------------------------------------ imports

export async function listImports(sql, ctx, { areaId = null } = {}) {
  const rows = areaId
    ? await sql`
        SELECT * FROM imports
        WHERE organization_id = ${ctx.organizationId}
          AND area_id = ${areaId}
        ORDER BY created_at DESC
      `
    : await sql`
        SELECT * FROM imports
        WHERE organization_id = ${ctx.organizationId}
        ORDER BY created_at DESC
      `;
  return rows.map(mapImportRow);
}

export async function createImport(sql, ctx, input) {
  // areaId NULL = organization-scoped import; set = area-scoped import. The
  // area must belong to the session org (403 otherwise, no existence leak).
  const areaId = input?.areaId ? String(input.areaId).trim() || null : null;
  if (areaId) {
    await assertAreaInOrg(sql, ctx, areaId);
  }
  const rows = areaId
    ? await sql`
        INSERT INTO imports (
          organization_id, imported_by_user_id, file_name, source_format,
          period_year, period_month, status, area_id
        )
        VALUES (
          ${ctx.organizationId}, ${ctx.user.id},
          ${String(input?.fileName ?? '')}, ${String(input?.sourceFormat ?? '')},
          ${input?.periodYear ?? null}, ${input?.periodMonth ?? null},
          'completed', ${areaId}
        )
        RETURNING *
      `
    : await sql`
        INSERT INTO imports (
          organization_id, imported_by_user_id, file_name, source_format,
          period_year, period_month, status
        )
        VALUES (
          ${ctx.organizationId}, ${ctx.user.id},
          ${String(input?.fileName ?? '')}, ${String(input?.sourceFormat ?? '')},
          ${input?.periodYear ?? null}, ${input?.periodMonth ?? null},
          'completed'
        )
        RETURNING *
      `;
  return mapImportRow(rows[0]);
}

// ------------------------------------------------------------------- shifts

export async function listShifts(sql, ctx, requestedEmployeeId, { areaId = null } = {}) {
  const employeeId = effectiveEmployeeId(ctx, requestedEmployeeId);
  if (employeeId) {
    await assertEmployeeInOrg(sql, ctx, employeeId);
    // EMPLOYEE role is always forced to self above; the area filter only
    // applies to ADMIN/Manager browsing an area context.
    const rows = areaId && ctx.role !== 'EMPLOYEE'
      ? await sql`
          SELECT id, organization_id, employee_id, import_id, area_id,
                 TO_CHAR(date, 'YYYY-MM-DD') AS date,
                 start_time, end_time, location, origin
          FROM shifts
          WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
            AND area_id = ${areaId}
          ORDER BY date ASC, start_time ASC, id ASC
        `
      : await sql`
          SELECT id, organization_id, employee_id, import_id, area_id,
                 TO_CHAR(date, 'YYYY-MM-DD') AS date,
                 start_time, end_time, location, origin
          FROM shifts
          WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
          ORDER BY date ASC, start_time ASC, id ASC
        `;
    return rows.map(mapShiftRow);
  }

  // Manager/Admin without employee filter: whole organization, optionally
  // narrowed to one area (dashboard area context).
  const rows = areaId
    ? await sql`
        SELECT id, organization_id, employee_id, import_id, area_id,
               TO_CHAR(date, 'YYYY-MM-DD') AS date,
               start_time, end_time, location, origin
        FROM shifts
        WHERE organization_id = ${ctx.organizationId}
          AND area_id = ${areaId}
        ORDER BY date ASC, start_time ASC, id ASC
      `
    : await sql`
        SELECT id, organization_id, employee_id, import_id, area_id,
               TO_CHAR(date, 'YYYY-MM-DD') AS date,
               start_time, end_time, location, origin
        FROM shifts
        WHERE organization_id = ${ctx.organizationId}
        ORDER BY date ASC, start_time ASC, id ASC
      `;
  return rows.map(mapShiftRow);
}

/**
 * Upserts shifts. Conflict unit is (organization, employee, id) — semantic
 * dedupe (fingerprint) happens client-side before this call; two different
 * employees on the same date never collide because employee_id is part of
 * every statement.
 */
export async function upsertShifts(sql, ctx, rawShifts) {
  const shifts = rawShifts.map(normalizeShiftInput);
  const saved = [];

  for (const shift of shifts) {
    if (!shift.date || !shift.employeeId) {
      throw new HttpError(400, 'Shift requires date and employeeId');
    }
    const employeeId = effectiveEmployeeId(ctx, shift.employeeId);
    await assertEmployeeInOrg(sql, ctx, employeeId);

    // Area snapshot rule (single rule, tested): explicit shift.areaId (org-
    // validated) wins; else the import's area when the import is area-scoped;
    // else the employee's CURRENT area at write time; else NULL (org-scoped).
    // Historical rows are never recalculated when an employee moves areas.
    let shiftAreaId = shift.areaId;
    if (shiftAreaId) {
      await assertAreaInOrg(sql, ctx, shiftAreaId);
    } else if (shift.importId) {
      const importRows = await sql`
        SELECT area_id FROM imports
        WHERE id = ${shift.importId} AND organization_id = ${ctx.organizationId}
      `;
      shiftAreaId = importRows[0]?.area_id ?? null;
    }
    if (!shiftAreaId) {
      const employeeRows = await sql`
        SELECT area_id FROM employees
        WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
      `;
      shiftAreaId = employeeRows[0]?.area_id ?? null;
    }

    // Plan/role separation (Fase: role-aware import unification) — ROLE
    // decides WHO an ADMIN may write for (any org employee, checked
    // above); PLAN decides whether the org may operate on more than one
    // distinct employee at all. DB-observed, not client-declared: a request
    // can't dodge this by spreading employees across separate calls.
    if (ctx.role !== 'EMPLOYEE' && !canUseFeature(ctx.plan, 'multiEmployeeImport')) {
      const existingEmployees = await sql`
        SELECT DISTINCT employee_id FROM shifts WHERE organization_id = ${ctx.organizationId}
      `;
      const otherEmployeeExists = existingEmployees.some((row) => row.employee_id !== employeeId);
      if (otherEmployeeExists) {
        requireFeature(ctx.plan, 'multiEmployeeImport', 'This plan only allows shifts for a single employee. Upgrade to Team to import for more.');
      }
    }

    const id = shift.id && UUID_RE.test(shift.id) ? shift.id : randomUUID();
    const rows = await sql`
      INSERT INTO shifts (id, organization_id, employee_id, import_id, area_id, date,
                          start_time, end_time, location, origin, updated_at)
      VALUES (${id}, ${ctx.organizationId}, ${employeeId}, ${shift.importId},
              ${shiftAreaId}, ${shift.date}, ${shift.startTime}, ${shift.endTime},
              ${shift.location}, ${shift.origin}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        date = EXCLUDED.date,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        location = EXCLUDED.location,
        origin = EXCLUDED.origin,
        area_id = EXCLUDED.area_id,
        updated_at = NOW()
      WHERE shifts.organization_id = ${ctx.organizationId}
        AND shifts.employee_id = ${employeeId}
      RETURNING id, organization_id, employee_id, import_id, area_id,
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                start_time, end_time, location, origin
    `;
    if (rows.length > 0) {
      saved.push(mapShiftRow(rows[0]));
    }
  }

  return saved;
}

export async function deleteShiftsByIds(sql, ctx, rawIds, requestedEmployeeId) {
  const employeeId = effectiveEmployeeId(ctx, requestedEmployeeId);
  if (employeeId) {
    await assertEmployeeInOrg(sql, ctx, employeeId);
  }
  const ids = [...new Set(rawIds.map((value) => String(value ?? '').trim()).filter((id) => UUID_RE.test(id)))];
  let deleted = 0;
  for (const id of ids) {
    const rows = employeeId
      ? await sql`
          DELETE FROM shifts
          WHERE id = ${id}
            AND organization_id = ${ctx.organizationId}
            AND employee_id = ${employeeId}
          RETURNING id
        `
      : await sql`
          DELETE FROM shifts
          WHERE id = ${id} AND organization_id = ${ctx.organizationId}
          RETURNING id
        `;
    deleted += rows.length;
  }
  return deleted;
}
