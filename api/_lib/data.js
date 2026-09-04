import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpError, requireRole, resolveAccessScope } from './auth.js';
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function importContextFingerprint({ sourceFormat, periodYear, periodMonth, importMode, periodKind, areaId }) {
  return sha256([
    sourceFormat, periodYear ?? '', periodMonth ?? '', importMode, periodKind, areaId ?? 'global',
  ].join('\u001f'));
}

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
    importedByUserName: row.imported_by_user_name ?? null,
    fileName: row.file_name,
    sourceFormat: row.source_format,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    periodKind: row.period_kind ?? 'single',
    periodLabel: row.period_label ?? '',
    importMode: row.import_mode ?? 'individual',
    scopeType: row.area_id ? 'area' : (row.scope_type ?? 'global'),
    areaId: row.area_id ?? null,
    areaNameSnapshot: row.area_name_snapshot ?? null,
    employeeCount: row.employee_count ?? 0,
    shiftCount: row.shift_count ?? 0,
    createdShiftCount: row.created_shift_count ?? 0,
    existingShiftCount: row.existing_shift_count ?? 0,
    status: row.deleted_at ? 'deleted' : row.status,
    deletedAt: row.deleted_at ?? null,
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

function scopeForbidden(message = 'Resource is outside your access scope') {
  const error = new HttpError(403, message);
  error.code = 'SCOPE_FORBIDDEN';
  return error;
}

function assertScopedResource(scope, { employeeId = null, areaId = null } = {}) {
  if (scope.type === 'AREA' && areaId !== scope.areaId) {
    throw scopeForbidden('Resource is outside your assigned area');
  }
  if (scope.type === 'SELF' && employeeId !== scope.employeeId) {
    throw scopeForbidden('Resource belongs to another employee');
  }
}

async function assertEmployeeInOrg(sql, ctx, employeeId) {
  const rows = await sql`
    SELECT id, status FROM employees
    WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) {
    throw new HttpError(403, 'Employee does not belong to the organization');
  }
  return rows[0];
}

async function assertEmployeeInScope(sql, ctx, employeeId) {
  const employee = await assertEmployeeInOrg(sql, ctx, employeeId);
  const scope = resolveAccessScope(ctx);
  if (scope.type === 'AREA') {
    const areaRows = await sql`
      SELECT area_id FROM employees
      WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
    `;
    assertScopedResource(scope, { employeeId, areaId: areaRows[0]?.area_id ?? null });
  } else {
    assertScopedResource(scope, { employeeId });
  }
  return employee;
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
  const scope = resolveAccessScope(ctx);
  if (scope.type === 'SELF') {
    const rows = await sql`
      SELECT * FROM employees
      WHERE organization_id = ${ctx.organizationId} AND id = ${scope.employeeId}
      ORDER BY name ASC
    `;
    return rows.map(mapEmployeeRow);
  }
  if (scope.type === 'AREA') {
    if (areaId && areaId !== scope.areaId) {
      throw scopeForbidden('Requested area is outside your assigned area');
    }
    const rows = await sql`
      SELECT * FROM employees
      WHERE organization_id = ${ctx.organizationId}
        AND area_id = ${scope.areaId}
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

/** A matched employee is only truly import-ready when ACTIVE. inactive and
 * pending_access each get their own distinct kind so callers never treat
 * either as "recognized" — an import must never silently land on an
 * employee who isn't active yet (see EMPLOYEE_NOT_ACTIVE in upsertShifts). */
function matchKindForStatus(status) {
  if (status === 'inactive') {
    return 'recognized_inactive';
  }
  if (status === 'pending_access') {
    return 'recognized_pending';
  }
  return 'recognized';
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

  const scope = resolveAccessScope(ctx);
  if (scope.type === 'SELF') {
    const rows = await sql`
      SELECT * FROM employees WHERE id = ${scope.employeeId} AND organization_id = ${ctx.organizationId}
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
    const rows = scope.type === 'AREA'
      ? await sql`
          SELECT * FROM employees
          WHERE organization_id = ${ctx.organizationId}
            AND area_id = ${scope.areaId}
            AND external_employee_id = ${externalId}
        `
      : await sql`
          SELECT * FROM employees
          WHERE organization_id = ${ctx.organizationId}
            AND external_employee_id = ${externalId}
        `;
    if (rows.length > 0) {
      const employees = rows.map(mapEmployeeRow);
      return { kind: employees.length === 1 ? matchKindForStatus(employees[0].status) : 'recognized', employees };
    }
  }

  if (normalizedName) {
    const rows = scope.type === 'AREA'
      ? await sql`
          SELECT * FROM employees
          WHERE organization_id = ${ctx.organizationId}
            AND area_id = ${scope.areaId}
            AND lower(trim(name)) = ${normalizedName}
        `
      : await sql`
          SELECT * FROM employees
          WHERE organization_id = ${ctx.organizationId}
            AND lower(trim(name)) = ${normalizedName}
        `;
    if (rows.length === 1) {
      const employees = rows.map(mapEmployeeRow);
      return { kind: matchKindForStatus(employees[0].status), employees };
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
 * ADMIN/OWNER only: create many employees in one request (multi-employee import
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
  if (['OWNER', 'ADMIN'].includes(rows[0]?.role) && (await countOrgManagers(sql, ctx.organizationId)) <= 1) {
    const error = new HttpError(400, 'The organization must keep at least one OWNER or ADMIN');
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
  await assertEmployeeInScope(sql, ctx, employeeId);
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
 * ADMIN/OWNER only: permanently delete an employee. Only possible when the
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

const VALID_ROLES = ['OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'];

function mapMemberRow(row) {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    scopedAreaId: row.scoped_area_id ?? null,
    createdAt: row.created_at,
  };
}

/** ADMIN/OWNER only: members of the active organization. */
export async function listMembers(sql, ctx) {
  requireRole(ctx, 'ADMIN');
  const rows = await sql`
    SELECT m.user_id, m.role, m.scoped_area_id, m.created_at, u.email, u.display_name
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

async function countOrgOwners(sql, organizationId) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM memberships
    WHERE organization_id = ${organizationId} AND role = 'OWNER'
  `;
  return rows[0].n;
}

async function countOrgManagers(sql, organizationId) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM memberships
    WHERE organization_id = ${organizationId} AND role IN ('OWNER', 'ADMIN')
  `;
  return rows[0].n;
}

/**
 * ADMIN/OWNER only: add a member to the active organization.
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
 * Role escalation is impossible: only ADMIN/OWNER reaches this function and the
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
  const rawScopedAreaId = String(input?.scopedAreaId ?? '').trim();
  if (rawScopedAreaId && role !== 'PLANNER') {
    throw new HttpError(400, 'Only PLANNER members can have an area scope');
  }
  if (rawScopedAreaId) {
    await assertAreaInOrg(sql, ctx, rawScopedAreaId);
  }
  const scopedAreaId = role === 'PLANNER' ? rawScopedAreaId || null : null;

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
    INSERT INTO memberships (user_id, organization_id, role, scoped_area_id)
    VALUES (${userId}, ${ctx.organizationId}, ${role}, ${scopedAreaId})
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

  return temporaryPassword
    ? { userId, email, role, scopedAreaId, temporaryPassword }
    : { userId, email, role, scopedAreaId };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ADMIN/OWNER only: bulk user provisioning + automatic User<->Employee linking
 * (multi-row CSV import, "Usuarios" tab). Each row is independent —
 * one bad row never aborts the rest (same partial-success shape as
 * bulkCreateEmployees). Never creates an Employee: `externalEmployeeId`
 * only RESOLVES an existing one; an unknown id fails only that row
 * (code EMPLOYEE_NOT_FOUND). Never overwrites an existing 1:1 link in
 * either direction (guards mirror addMember's). Idempotent: rerunning the
 * exact same CSV reuses the existing user/membership/link and reports
 * 'existing' instead of erroring or duplicating anything.
 */
export async function bulkAddMembers(sql, ctx, items, hashPasswordFn) {
  requireRole(ctx, 'ADMIN');
  requireFeature(ctx.plan, 'teamManagement', 'Inviting team members requires the Team plan.');

  const rows = Array.isArray(items) ? items : [];

  const employeeRows = await sql`
    SELECT * FROM employees WHERE organization_id = ${ctx.organizationId}
  `;
  const employeesByExternalId = new Map();
  for (const row of employeeRows) {
    if (row.external_employee_id) {
      employeesByExternalId.set(row.external_employee_id, mapEmployeeRow(row));
    }
  }

  const memberRows = await sql`
    SELECT m.user_id, m.role, u.email
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ${ctx.organizationId}
  `;
  const membershipByUserId = new Map(memberRows.map((row) => [row.user_id, row]));
  const userIdByEmail = new Map(memberRows.map((row) => [row.email.toLowerCase(), row.user_id]));

  // Employees already linked in the org, keyed by user_id — used to detect
  // USER_ALREADY_LINKED without a per-row query.
  const employeeByUserId = new Map();
  for (const row of employeeRows) {
    if (row.user_id) {
      employeeByUserId.set(row.user_id, mapEmployeeRow(row));
    }
  }

  const seenEmails = new Set();
  const results = [];
  const summary = { created: 0, linked: 0, existing: 0, failed: 0 };

  const fail = (row, code, message) => {
    results.push({ row: row.rowNumber, key: row.key, email: row.email || null, status: 'error', code, error: message });
    summary.failed += 1;
  };

  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] ?? {};
    const row = {
      rowNumber: i + 1,
      key: String(raw.key ?? ''),
      email: String(raw.email ?? '').trim().toLowerCase(),
      name: String(raw.name ?? '').trim(),
      role: String(raw.role ?? '').trim().toUpperCase(),
      externalEmployeeId: String(raw.externalEmployeeId ?? '').trim(),
    };

    if (!row.email || !EMAIL_RE.test(row.email)) {
      fail(row, 'INVALID_EMAIL', 'A valid email is required');
      continue;
    }
    if (!VALID_ROLES.includes(row.role)) {
      fail(row, 'INVALID_ROLE', 'A valid role is required');
      continue;
    }
    if (seenEmails.has(row.email)) {
      fail(row, 'DUPLICATE_IN_FILE', 'Duplicate email within this file');
      continue;
    }
    seenEmails.add(row.email);

    // Resolve the target employee (never created here). Unknown id -> row
    // fails; empty id -> user provisioned with no link (rule B).
    let employee = null;
    if (row.externalEmployeeId) {
      employee = employeesByExternalId.get(row.externalEmployeeId) ?? null;
      if (!employee) {
        fail(row, 'EMPLOYEE_NOT_FOUND', `No employee with external id "${row.externalEmployeeId}"`);
        continue;
      }
      if (employee.userId && employee.userId !== userIdByEmail.get(row.email)) {
        fail(row, 'EMPLOYEE_ALREADY_LINKED', 'Employee is already linked to another user');
        continue;
      }
    }

    // Resolve or create the user.
    let userId = userIdByEmail.get(row.email);
    let created = false;
    let temporaryPassword;
    if (!userId) {
      const existingUser = await sql`SELECT id FROM users WHERE lower(email) = ${row.email}`;
      if (existingUser.length > 0) {
        userId = existingUser[0].id;
      } else {
        const password = randomBytes(12).toString('base64url');
        temporaryPassword = password;
        const inserted = await sql`
          INSERT INTO users (email, password_hash, display_name)
          VALUES (${row.email}, ${hashPasswordFn(password)}, ${row.name})
          RETURNING id
        `;
        userId = inserted[0].id;
        created = true;
      }
    }

    // User already linked to a DIFFERENT employee -> row fails (guard F),
    // unless it's the very employee this row targets (idempotent no-op).
    const linkedEmployee = employeeByUserId.get(userId);
    if (employee && linkedEmployee && linkedEmployee.id !== employee.id) {
      fail(row, 'USER_ALREADY_LINKED', 'User is already linked to another employee');
      continue;
    }
    if (!employee && linkedEmployee) {
      // Row didn't ask for a link, but the user already has one — never
      // touched, never reported as an error.
      employee = linkedEmployee;
    }

    // Membership: reuse if it already exists (idempotent rerun), else create.
    const existingMembership = membershipByUserId.get(userId);
    if (!existingMembership) {
      await sql`
        INSERT INTO memberships (user_id, organization_id, role)
        VALUES (${userId}, ${ctx.organizationId}, ${row.role})
      `;
      membershipByUserId.set(userId, { user_id: userId, role: row.role, email: row.email });
      userIdByEmail.set(row.email, userId);
    }

    // Link (only when the row named an employee, the employee is free or
    // already this same user's, and nothing else claims it).
    const wasAlreadyLinked = Boolean(employee && employee.userId === userId);
    let justLinked = false;
    if (employee && employee.userId !== userId) {
      // Mirrors the PENDING_ACCESS -> ACTIVE transition in the single-employee
      // update path (see above): linking a user gives the employee access.
      const newStatus = employee.status === 'pending_access' ? 'active' : employee.status;
      const newDeactivatedAt = newStatus === 'active' ? null : employee.deactivatedAt ?? null;
      await sql`
        UPDATE employees
        SET user_id = ${userId}, status = ${newStatus}, deactivated_at = ${newDeactivatedAt}, updated_at = NOW()
        WHERE id = ${employee.id} AND organization_id = ${ctx.organizationId}
      `;
      employee = { ...employee, userId, status: newStatus };
      employeeByUserId.set(userId, employee);
      if (row.externalEmployeeId) {
        employeesByExternalId.set(row.externalEmployeeId, employee);
      }
      justLinked = true;
    }

    const status = created
      ? (justLinked ? 'created_and_linked' : 'created')
      : wasAlreadyLinked
        ? 'already_linked'
        : justLinked
          ? 'linked'
          : 'existing';

    if (created) {
      summary.created += 1;
    } else {
      summary.existing += 1;
    }
    if (justLinked) {
      summary.linked += 1;
    }

    results.push({
      row: row.rowNumber,
      key: row.key,
      email: row.email,
      status,
      userId,
      employeeId: employee ? employee.id : null,
      ...(temporaryPassword ? { temporaryPassword } : {}),
    });
  }

  return { results, summary };
}

/** ADMIN/OWNER only: change a member's role. The sole OWNER cannot be demoted. */
export async function updateMemberRole(sql, ctx, input) {
  requireRole(ctx, 'ADMIN');
  const userId = String(input?.userId ?? '').trim();
  const role = String(input?.role ?? '').trim();
  if (!userId || !VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Valid userId and role are required');
  }
  const rows = await sql`
    SELECT role, scoped_area_id FROM memberships
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Membership not found');
  }
  const rawScopedAreaId = input?.scopedAreaId === undefined
    ? String(rows[0].scoped_area_id ?? '').trim()
    : String(input.scopedAreaId ?? '').trim();
  if (rawScopedAreaId && role !== 'PLANNER') {
    throw new HttpError(400, 'Only PLANNER members can have an area scope');
  }
  if (rawScopedAreaId) {
    await assertAreaInOrg(sql, ctx, rawScopedAreaId);
  }
  const scopedAreaId = role === 'PLANNER' ? rawScopedAreaId || null : null;
  if (rows[0].role === 'OWNER' && role !== 'OWNER'
    && (await countOrgOwners(sql, ctx.organizationId)) <= 1) {
    const error = new HttpError(400, 'The organization must keep at least one OWNER');
    error.code = 'LAST_OWNER';
    throw error;
  }
  if (rows[0].role !== 'OWNER' && role === 'OWNER'
    && (await countOrgOwners(sql, ctx.organizationId)) >= 1) {
    const error = new HttpError(400, 'The organization already has an OWNER');
    error.code = 'OWNER_EXISTS';
    throw error;
  }
  // Compatibility guard for any pre-R2-M06 data encountered before the
  // migration has completed: do not remove the last high-privilege member.
  if (rows[0].role === 'ADMIN' && role !== 'ADMIN'
    && (await countOrgOwners(sql, ctx.organizationId)) === 0
    && (await countOrgAdmins(sql, ctx.organizationId)) <= 1) {
    throw new HttpError(400, 'The organization must keep at least one ADMIN');
  }
  await sql`
    UPDATE memberships SET role = ${role}, scoped_area_id = ${scopedAreaId}
    WHERE organization_id = ${ctx.organizationId} AND user_id = ${userId}
  `;
  return { userId, role, scopedAreaId };
}

/** ADMIN/OWNER only: remove a membership. Self-removal and orphaning the org
 * without an OWNER are blocked. Linked employees keep existing (user_id
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
  if (rows[0].role === 'OWNER' && (await countOrgOwners(sql, ctx.organizationId)) <= 1) {
    const error = new HttpError(400, 'The organization must keep at least one OWNER');
    error.code = 'LAST_OWNER';
    throw error;
  }
  if (rows[0].role === 'ADMIN'
    && (await countOrgOwners(sql, ctx.organizationId)) === 0
    && (await countOrgAdmins(sql, ctx.organizationId)) <= 1) {
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
 * ADMIN/OWNER only: rename the active organization. `plan` is deliberately not
 * editable here (R2-M01 scope: no billing integration exists yet to keep it
 * consistent with).
 */
export async function updateOrganizationName(sql, ctx, rawName) {
  requireRole(ctx, 'ADMIN');
  const name = String(rawName ?? '').trim();
  if (!name) {
    throw new HttpError(400, 'Organization name is required');
  }
  const rows = await sql`
    UPDATE organizations SET name = ${name}, updated_at = NOW()
    WHERE id = ${ctx.organizationId}
    RETURNING id, name, plan
  `;
  if (rows.length === 0) {
    throw new HttpError(404, 'Organization not found');
  }
  return { id: rows[0].id, name: rows[0].name, plan: rows[0].plan };
}

/**
 * ADMIN/OWNER only: full reset of the active organization's OPERATIONAL data.
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

/**
 * Org-scoped import history, newest first. Pagination and the optional
 * filters (userId/importMode/scopeType/sourceFormat/status) are applied
 * in-process after the tenant-scoped fetch: the history is expected to stay
 * in the hundreds-of-rows range per organization, and this keeps one simple,
 * always-correct query shape instead of a hand-built dynamic WHERE — see the
 * "Limitaciones pendientes" note in the feature report if this ever needs to
 * move to SQL-level filtering/pagination for very large histories.
 * Soft-deleted imports (deleted_at set) are NOT excluded — they must still
 * show up, displayed as status 'deleted' (mapImportRow), so the history stays
 * a complete audit trail.
 */
export async function listImports(sql, ctx, {
  areaId = null,
  page = 1,
  pageSize = 5,
  userId = null,
  importMode = null,
  scopeType = null,
  sourceFormat = null,
  status = null,
} = {}) {
  const scope = resolveAccessScope(ctx);
  if (scope.type === 'AREA' && areaId && areaId !== scope.areaId) {
    throw scopeForbidden('Requested area is outside your assigned area');
  }

  const rows = scope.type === 'SELF'
    ? await sql`
        SELECT i.*, u.display_name AS imported_by_user_name
        FROM imports i
        LEFT JOIN users u ON u.id = i.imported_by_user_id
        WHERE i.organization_id = ${ctx.organizationId}
          AND i.employee_id = ${scope.employeeId}
        ORDER BY i.created_at DESC
      `
    : scope.type === 'AREA'
      ? await sql`
        SELECT i.*, u.display_name AS imported_by_user_name
        FROM imports i
        LEFT JOIN users u ON u.id = i.imported_by_user_id
        WHERE i.organization_id = ${ctx.organizationId}
          AND i.area_id = ${scope.areaId}
        ORDER BY i.created_at DESC
      `
      : areaId
        ? await sql`
        SELECT i.*, u.display_name AS imported_by_user_name
        FROM imports i
        LEFT JOIN users u ON u.id = i.imported_by_user_id
        WHERE i.organization_id = ${ctx.organizationId}
          AND i.area_id = ${areaId}
        ORDER BY i.created_at DESC
      `
        : await sql`
        SELECT i.*, u.display_name AS imported_by_user_name
        FROM imports i
        LEFT JOIN users u ON u.id = i.imported_by_user_id
        WHERE i.organization_id = ${ctx.organizationId}
        ORDER BY i.created_at DESC
      `;

  const mapped = rows.map(mapImportRow);
  const filtered = mapped.filter((row) => (
    (!userId || row.importedByUserId === userId)
    && (!importMode || row.importMode === importMode)
    && (!scopeType || row.scopeType === scopeType)
    && (!sourceFormat || row.sourceFormat === sourceFormat)
    && (!status || row.status === status)
  ));

  const safePageSize = Math.min(Math.max(Number(pageSize) || 5, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const start = (safePage - 1) * safePageSize;

  return {
    imports: filtered.slice(start, start + safePageSize),
    total: filtered.length,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function createImport(sql, ctx, input) {
  const scope = resolveAccessScope(ctx);
  // areaId NULL = organization-scoped (global) import; set = area-scoped
  // import. The area must belong to the session org (403 otherwise, no
  // existence leak) — same assertAreaInOrg convention used everywhere else.
  // The area's CURRENT name is snapshotted at creation time so the history
  // stays readable even if the area is later renamed or deactivated.
  const areaId = input?.areaId ? String(input.areaId).trim() || null : null;
  let areaNameSnapshot = null;
  if (areaId) {
    await assertAreaInOrg(sql, ctx, areaId);
    const nameRows = await sql`
      SELECT name FROM areas WHERE id = ${areaId} AND organization_id = ${ctx.organizationId}
    `;
    areaNameSnapshot = nameRows[0]?.name ?? null;
  }

  const status = 'completed';
  const importMode = input?.importMode === 'team' ? 'team' : 'individual';
  const periodKind = input?.periodKind === 'multi' ? 'multi' : 'single';
  const periodLabel = String(input?.periodLabel ?? '').trim();
  const scopeType = areaId ? 'area' : 'global';
  const employeeCount = Math.max(0, Math.trunc(Number(input?.employeeCount) || 0));
  const shiftCount = Math.max(0, Math.trunc(Number(input?.shiftCount) || 0));
  const createdShiftCount = Math.max(0, Math.trunc(Number(input?.createdShiftCount) || 0));
  const existingShiftCount = Math.max(0, Math.trunc(Number(input?.existingShiftCount) || 0));

  // Idempotency is opt-in for new clients and deliberately requires the
  // server-resolved employee plus a content fingerprint. Legacy callers may
  // still write history rows without a key, but the actual authenticated
  // import flows always provide both values.
  const requestedEmployeeId = String(input?.employeeId ?? '').trim() || null;
  const employeeId = requestedEmployeeId
    ? effectiveEmployeeId(ctx, requestedEmployeeId)
    : (ctx.role === 'EMPLOYEE' ? effectiveEmployeeId(ctx, null) : null);
  if (employeeId) {
    await assertEmployeeInScope(sql, ctx, employeeId);
  } else if (scope.type === 'SELF') {
    throw scopeForbidden('Employee scope is unavailable');
  }
  if (scope.type === 'AREA') {
    assertScopedResource(scope, { employeeId, areaId });
  }
  if (scope.type === 'SELF') {
    assertScopedResource(scope, { employeeId });
  }
  const fileFingerprint = String(input?.fileFingerprint ?? '').trim().toLowerCase();
  const hasIdempotencyKey = Boolean(employeeId && /^[0-9a-f]{64}$/.test(fileFingerprint));
  const contextFingerprint = hasIdempotencyKey
    ? importContextFingerprint({
      sourceFormat: String(input?.sourceFormat ?? ''),
      periodYear: input?.periodYear ?? null,
      periodMonth: input?.periodMonth ?? null,
      importMode,
      periodKind,
      areaId,
    })
    : null;

  if (hasIdempotencyKey) {
    const rows = areaId
      ? await sql`
          INSERT INTO imports (
            organization_id, imported_by_user_id, employee_id, file_name, source_format,
            period_year, period_month, status, area_id, import_mode, period_kind,
            period_label, scope_type, area_name_snapshot, employee_count, shift_count,
            created_shift_count, existing_shift_count, file_fingerprint, context_fingerprint
          )
          VALUES (
            ${ctx.organizationId}, ${ctx.user.id}, ${employeeId}, ${String(input?.fileName ?? '')},
            ${String(input?.sourceFormat ?? '')}, ${input?.periodYear ?? null}, ${input?.periodMonth ?? null},
            ${status}, ${areaId}, ${importMode}, ${periodKind}, ${periodLabel}, ${scopeType},
            ${areaNameSnapshot}, ${employeeCount}, ${shiftCount}, ${createdShiftCount}, ${existingShiftCount},
            ${fileFingerprint}, ${contextFingerprint}
          )
          ON CONFLICT (organization_id, employee_id, file_fingerprint, context_fingerprint)
          WHERE employee_id IS NOT NULL AND file_fingerprint IS NOT NULL AND context_fingerprint IS NOT NULL
          DO NOTHING
          RETURNING *
        `
      : await sql`
          INSERT INTO imports (
            organization_id, imported_by_user_id, employee_id, file_name, source_format,
            period_year, period_month, status, area_id, import_mode, period_kind,
            period_label, scope_type, area_name_snapshot, employee_count, shift_count,
            created_shift_count, existing_shift_count, file_fingerprint, context_fingerprint
          )
          VALUES (
            ${ctx.organizationId}, ${ctx.user.id}, ${employeeId}, ${String(input?.fileName ?? '')},
            ${String(input?.sourceFormat ?? '')}, ${input?.periodYear ?? null}, ${input?.periodMonth ?? null},
            ${status}, ${areaId}, ${importMode}, ${periodKind}, ${periodLabel}, ${scopeType},
            ${areaNameSnapshot}, ${employeeCount}, ${shiftCount}, ${createdShiftCount}, ${existingShiftCount},
            ${fileFingerprint}, ${contextFingerprint}
          )
          ON CONFLICT (organization_id, employee_id, file_fingerprint, context_fingerprint)
          WHERE employee_id IS NOT NULL AND file_fingerprint IS NOT NULL AND context_fingerprint IS NOT NULL
          DO NOTHING
          RETURNING *
        `;
    if (rows.length > 0) {
      return { ...mapImportRow(rows[0]), deduplicated: false };
    }
    const existingRows = await sql`
      SELECT * FROM imports
      WHERE organization_id = ${ctx.organizationId}
        AND employee_id = ${employeeId}
        AND file_fingerprint = ${fileFingerprint}
        AND context_fingerprint = ${contextFingerprint}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (existingRows.length === 0) {
      throw new HttpError(409, 'Import idempotency key could not be resolved');
    }
    return { ...mapImportRow(existingRows[0]), deduplicated: true };
  }

  const rows = areaId
    ? await sql`
        INSERT INTO imports (
          organization_id, imported_by_user_id, file_name, source_format,
          period_year, period_month, status, area_id,
          import_mode, period_kind, period_label, scope_type, area_name_snapshot,
          employee_count, shift_count, created_shift_count, existing_shift_count
        )
        VALUES (
          ${ctx.organizationId}, ${ctx.user.id},
          ${String(input?.fileName ?? '')}, ${String(input?.sourceFormat ?? '')},
          ${input?.periodYear ?? null}, ${input?.periodMonth ?? null},
          ${status}, ${areaId},
          ${importMode}, ${periodKind}, ${periodLabel}, ${scopeType}, ${areaNameSnapshot},
          ${employeeCount}, ${shiftCount}, ${createdShiftCount}, ${existingShiftCount}
        )
        RETURNING *
      `
    : await sql`
        INSERT INTO imports (
          organization_id, imported_by_user_id, file_name, source_format,
          period_year, period_month, status,
          import_mode, period_kind, period_label, scope_type,
          employee_count, shift_count, created_shift_count, existing_shift_count
        )
        VALUES (
          ${ctx.organizationId}, ${ctx.user.id},
          ${String(input?.fileName ?? '')}, ${String(input?.sourceFormat ?? '')},
          ${input?.periodYear ?? null}, ${input?.periodMonth ?? null},
          ${status},
          ${importMode}, ${periodKind}, ${periodLabel}, ${scopeType},
          ${employeeCount}, ${shiftCount}, ${createdShiftCount}, ${existingShiftCount}
        )
        RETURNING *
      `;
  return mapImportRow(rows[0]);
}

/**
 * Deletes exactly one import (ADMIN/OWNER only): the shifts it created are HARD
 * deleted, scoped strictly by `import_id` (never period/employee/area/origin
 * — see the feature spec's "Turnos importados" rules), so a manual shift
 * that happens to be identical in date/time/employee is never touched
 * (manual shifts always have import_id IS NULL, never equal to any import's
 * id). The import row itself is SOFT deleted (deleted_at/deleted_by_user_id)
 * so it keeps showing in the history as 'deleted', per the project's
 * soft-delete convention for historical/reference rows (see areas).
 *
 * Both writes run inside one transaction: either both land or neither does
 * — no state where the import shows completed but its shifts are gone, or
 * deleted but shifts remain. The real deleted-shift count comes back from
 * RETURNING, never trusted from the client.
 */
export async function deleteImport(sql, ctx, rawImportId) {
  requireRole(ctx, 'ADMIN');
  const id = String(rawImportId ?? '').trim();
  if (!UUID_RE.test(id)) {
    throw new HttpError(400, 'Import id is required');
  }

  const existingRows = await sql`
    SELECT id, organization_id, deleted_at FROM imports
    WHERE id = ${id} AND organization_id = ${ctx.organizationId}
  `;
  const existing = existingRows[0];
  if (!existing) {
    throw new HttpError(404, 'Import not found');
  }
  if (existing.deleted_at) {
    throw new HttpError(409, 'Import already deleted');
  }

  const [deletedShifts, updatedImport] = await sql.transaction((txn) => [
    txn`
      DELETE FROM shifts
      WHERE import_id = ${id} AND organization_id = ${ctx.organizationId}
      RETURNING id
    `,
    txn`
      UPDATE imports
      SET deleted_at = NOW(), deleted_by_user_id = ${ctx.user.id}, updated_at = NOW()
      WHERE id = ${id} AND organization_id = ${ctx.organizationId} AND deleted_at IS NULL
      RETURNING id
    `,
  ]);

  if (updatedImport.length === 0) {
    // Raced with a concurrent delete of the same import between the check
    // above and the transaction — surfaced as a conflict, never silently
    // reported as success with a made-up count.
    throw new HttpError(409, 'Import already deleted');
  }

  return { deleted: true, importId: id, deletedShiftCount: deletedShifts.length };
}

// ------------------------------------------------------------------- shifts

export async function listShifts(sql, ctx, requestedEmployeeId, { areaId = null } = {}) {
  const scope = resolveAccessScope(ctx);
  if (scope.type === 'AREA' && areaId && areaId !== scope.areaId) {
    throw scopeForbidden('Requested area is outside your assigned area');
  }
  const employeeId = scope.type === 'SELF'
    ? scope.employeeId
    : effectiveEmployeeId(ctx, requestedEmployeeId);
  const effectiveAreaId = scope.type === 'AREA' ? scope.areaId : areaId;
  if (employeeId) {
    await assertEmployeeInScope(sql, ctx, employeeId);
    const rows = effectiveAreaId && scope.type !== 'SELF'
      ? await sql`
          SELECT id, organization_id, employee_id, import_id, area_id,
                 TO_CHAR(date, 'YYYY-MM-DD') AS date,
                 start_time, end_time, location, origin
          FROM shifts
          WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
            AND area_id = ${effectiveAreaId}
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

  // Organization-scope or area-scope planner without employee filter.
  const rows = effectiveAreaId
    ? await sql`
        SELECT id, organization_id, employee_id, import_id, area_id,
               TO_CHAR(date, 'YYYY-MM-DD') AS date,
               start_time, end_time, location, origin
        FROM shifts
        WHERE organization_id = ${ctx.organizationId}
          AND area_id = ${effectiveAreaId}
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
 * Upserts shifts. The client performs reconciliation for conflict UX, while
 * imported shifts also carry a server-computed semantic key. This protects
 * retries and concurrent requests even when the client has no prior copy.
 */
export async function upsertShifts(sql, ctx, rawShifts) {
  const shifts = rawShifts.map(normalizeShiftInput);
  const scope = resolveAccessScope(ctx);
  // R1-M08 atomicity: every shift is validated (and its write parameters
  // computed) in this first pass, with NO write issued yet. Only once every
  // shift in the batch has passed validation does the second pass run the
  // actual INSERTs, as one sql.transaction — so a bad shift anywhere in the
  // batch throws before anything is written, instead of leaving the shifts
  // validated before it already committed (each query auto-commits
  // individually against the Neon HTTP driver when not wrapped in a
  // transaction).
  const prepared = [];

  for (const shift of shifts) {
    if (!shift.date || !shift.employeeId) {
      throw new HttpError(400, 'Shift requires date and employeeId');
    }
    const employeeId = effectiveEmployeeId(ctx, shift.employeeId);
    const employee = await assertEmployeeInScope(sql, ctx, employeeId);

    // Imported shifts (origin IMP) may only land on an ACTIVE employee — a
    // pending_access row (detected in a file but not yet linked to a real
    // user) or an inactive one is not a usable employee yet. Manual shifts
    // (origin MAN) are untouched: an ADMIN adding one shift by hand for a
    // pending_access employee is not the import-a-whole-file risk this
    // guards against.
    if (shift.origin === 'IMP' && employee.status !== 'active') {
      const error = new HttpError(409, 'Cannot import shifts for an employee that is not active yet');
      error.code = 'EMPLOYEE_NOT_ACTIVE';
      throw error;
    }

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
    if (scope.type === 'AREA') {
      assertScopedResource(scope, { areaId: shiftAreaId });
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
    const semanticFingerprint = shift.origin === 'IMP'
      ? sha256([employeeId, shift.date, shift.startTime, shift.endTime, shift.location].join('\u001f'))
      : null;
    prepared.push({ shift, id, employeeId, shiftAreaId, semanticFingerprint });
  }

  if (prepared.length === 0) {
    return [];
  }

  const rowsPerShift = await sql.transaction((txn) => prepared.map(({ shift, id, employeeId, shiftAreaId, semanticFingerprint }) => (
    semanticFingerprint
      ? txn`
      INSERT INTO shifts (id, organization_id, employee_id, import_id, area_id, date,
                          start_time, end_time, location, origin, updated_at, semantic_fingerprint)
      VALUES (${id}, ${ctx.organizationId}, ${employeeId}, ${shift.importId},
              ${shiftAreaId}, ${shift.date}, ${shift.startTime}, ${shift.endTime},
              ${shift.location}, ${shift.origin}, NOW(), ${semanticFingerprint})
      ON CONFLICT (organization_id, employee_id, semantic_fingerprint)
      WHERE semantic_fingerprint IS NOT NULL
      DO UPDATE SET updated_at = NOW()
      RETURNING id, organization_id, employee_id, import_id, area_id,
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                start_time, end_time, location, origin
    `
      : txn`
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
    `
  )));

  const saved = [];
  for (const rows of rowsPerShift) {
    if (rows.length > 0) {
      saved.push(mapShiftRow(rows[0]));
    }
  }

  return saved;
}

export async function deleteShiftsByIds(sql, ctx, rawIds, requestedEmployeeId) {
  const scope = resolveAccessScope(ctx);
  const employeeId = scope.type === 'SELF'
    ? scope.employeeId
    : effectiveEmployeeId(ctx, requestedEmployeeId);
  if (employeeId) {
    await assertEmployeeInScope(sql, ctx, employeeId);
  }
  const ids = [...new Set(rawIds.map((value) => String(value ?? '').trim()).filter((id) => UUID_RE.test(id)))];
  let deleted = 0;
  for (const id of ids) {
    const existing = await sql`
      SELECT employee_id, area_id FROM shifts
      WHERE id = ${id} AND organization_id = ${ctx.organizationId}
    `;
    if (existing.length > 0) {
      assertScopedResource(scope, {
        employeeId: existing[0].employee_id,
        areaId: existing[0].area_id,
      });
    }
    const rows = employeeId
      ? await sql`
          DELETE FROM shifts
          WHERE id = ${id}
            AND organization_id = ${ctx.organizationId}
            AND employee_id = ${employeeId}
          RETURNING id
        `
      : scope.type === 'AREA'
        ? await sql`
          DELETE FROM shifts
          WHERE id = ${id}
            AND organization_id = ${ctx.organizationId}
            AND area_id = ${scope.areaId}
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
