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
    ? body.areas.map((area, idx) => ({
      name: String(area?.name ?? '').trim(),
      ref: String(area?.ref ?? area?.areaRef ?? `area-${idx}`).trim(),
    }))
    : [];

  let admins = [];
  if (Array.isArray(body?.admins)) {
    admins = body.admins.map((adm, idx) => ({
      ref: String(adm?.ref ?? `admin-${idx}`).trim(),
      name: String(adm?.name ?? '').trim(),
      email: String(adm?.email ?? '').trim().toLowerCase(),
      isEmployee: adm?.isEmployee === true,
      employeeName: String(adm?.employeeName ?? '').trim() || String(adm?.name ?? '').trim(),
      areaRef: String(adm?.areaRef ?? '').trim(),
      externalEmployeeId: String(adm?.externalEmployeeId ?? '').trim(),
    }));
  } else if (body?.admin && typeof body.admin === 'object') {
    const rawAdmin = body.admin;
    const email = String(rawAdmin.email ?? '').trim().toLowerCase();
    const name = String(rawAdmin.name ?? '').trim();
    if (name || email) {
      admins = [{
        ref: String(rawAdmin.ref ?? 'admin-0').trim(),
        name,
        email,
        isEmployee: rawAdmin.isEmployee === true,
        employeeName: String(rawAdmin.employeeName ?? '').trim() || name,
        areaRef: String(rawAdmin.areaRef ?? '').trim(),
        externalEmployeeId: String(rawAdmin.externalEmployeeId ?? '').trim(),
      }];
    }
  }

  const planners = Array.isArray(body?.planners)
    ? body.planners.map((pln, idx) => ({
      ref: String(pln?.ref ?? `planner-${idx}`).trim(),
      name: String(pln?.name ?? '').trim(),
      email: String(pln?.email ?? '').trim().toLowerCase(),
      isEmployee: pln?.isEmployee === true,
      employeeName: String(pln?.employeeName ?? '').trim() || String(pln?.name ?? '').trim(),
      externalEmployeeId: String(pln?.externalEmployeeId ?? '').trim(),
      areaRef: String(pln?.areaRef ?? '').trim(),
      plannerScopeType: pln?.plannerScopeType ? String(pln.plannerScopeType).trim().toUpperCase() : 'ORGANIZATION',
      scopedAreaRefs: Array.isArray(pln?.scopedAreaRefs)
        ? pln.scopedAreaRefs.map(String)
        : (pln?.areaRef ? [String(pln.areaRef)] : []),
      scopedEmployeeRefs: Array.isArray(pln?.scopedEmployeeRefs) ? pln.scopedEmployeeRefs.map(String) : [],
    }))
    : [];

  const employees = Array.isArray(body?.employees)
    ? body.employees.map((emp, idx) => ({
      ref: String(emp?.ref ?? `emp-${idx}`).trim(),
      name: String(emp?.name ?? '').trim(),
      externalEmployeeId: String(emp?.externalEmployeeId ?? '').trim(),
      areaRef: String(emp?.areaRef ?? '').trim(),
    }))
    : [];

  const rawAssign = body?.assignments;
  const assignments = {
    employeeToArea: Array.isArray(rawAssign?.employeeToArea) ? rawAssign.employeeToArea : [],
    employeeToPlanner: Array.isArray(rawAssign?.employeeToPlanner) ? rawAssign.employeeToPlanner : [],
  };

  const owner = {
    isEmployee: ownerIsEmployee,
    name: ownerName,
    employeeName: String(body?.owner?.employeeName ?? body?.employeeName ?? '').trim() || ownerName || user.email,
    areaRef: String(body?.owner?.areaRef ?? '').trim(),
    externalEmployeeId: String(body?.owner?.externalEmployeeId ?? '').trim(),
  };

  return { plan, organizationName, owner, areas, admins, admin: admins[0] ?? null, planners, employees, assignments, legacy };
}

/**
 * Plan-aware onboarding: creates the organization, selected pre-billing plan,
 * exactly one OWNER membership, optional areas, optional self-linked owner
 * Employee, optional Team ADMINs, optional PLANNERs, optional standalone
 * Employees and assignments in one atomic transaction. User/Membership/
 * Employee remain independent domain entities with NO implicit Employee creation.
 *
 * All steps run inside a single DB transaction — if any step fails,
 * everything rolls back so no partial state remains. The neon HTTP driver
 * only supports `sql.transaction([...queries])` (one batch = one
 * transaction), so IDs are generated up front.
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
    const hasTeamFeatures = input.areas.length > 0 || input.admins.length > 0 || input.planners.length > 0 || input.employees.length > 0;
    if (input.plan !== 'team' && hasTeamFeatures) {
      return sendJson(res, 400, { error: 'Areas and additional administrators require the Team plan', code: 'PLAN_CONFIGURATION_INVALID' });
    }
    if (input.areas.some((area) => !area.name)) {
      return sendJson(res, 400, { error: 'Area names are required' });
    }
    const normalizedAreaNames = input.areas.map((area) => area.name.toLocaleLowerCase());
    if (new Set(normalizedAreaNames).size !== normalizedAreaNames.length) {
      return sendJson(res, 400, { error: 'Area names must be unique' });
    }

    // Admins validation
    for (const admin of input.admins) {
      if (!admin.name || !EMAIL_RE.test(admin.email)) {
        return sendJson(res, 400, { error: 'A valid administrator name and email are required' });
      }
      if (admin.email === String(ctx.user.email).toLowerCase()) {
        return sendJson(res, 400, { error: 'The owner is already the organization owner' });
      }
      if (admin.isEmployee && !admin.employeeName) {
        return sendJson(res, 400, { error: 'An employee name is required for the administrator' });
      }
    }
    if (new Set(input.admins.map((a) => a.email)).size !== input.admins.length) {
      return sendJson(res, 400, { error: 'Administrator emails must be unique' });
    }

    // Planners validation
    for (const planner of input.planners) {
      if (!planner.name || !EMAIL_RE.test(planner.email)) {
        return sendJson(res, 400, { error: 'A valid planner name and email are required' });
      }
      if (planner.email === String(ctx.user.email).toLowerCase()) {
        return sendJson(res, 400, { error: 'The owner cannot also be registered as a separate planner' });
      }
      if (input.admins.some((a) => a.email === planner.email)) {
        return sendJson(res, 400, { error: 'User is already registered as an administrator' });
      }
      if (planner.isEmployee && !planner.employeeName) {
        return sendJson(res, 400, { error: 'An employee name is required for the planner' });
      }
    }
    if (new Set(input.planners.map((p) => p.email)).size !== input.planners.length) {
      return sendJson(res, 400, { error: 'Planner emails must be unique' });
    }

    // Standalone employees validation
    for (const emp of input.employees) {
      if (!emp.name) {
        return sendJson(res, 400, { error: 'Employee names are required' });
      }
    }

    // Look up existing users by email
    const existingAdminIds = {};
    for (const admin of input.admins) {
      const existingRows = await sql`SELECT id FROM users WHERE lower(email) = ${admin.email}`;
      existingAdminIds[admin.email] = existingRows[0]?.id ?? null;
    }

    const existingPlannerIds = {};
    for (const planner of input.planners) {
      const existingRows = await sql`SELECT id FROM users WHERE lower(email) = ${planner.email}`;
      existingPlannerIds[planner.email] = existingRows[0]?.id ?? null;
    }

    // Deterministic identifiers make retried submits converge safely
    const organizationId = stableUuid(`onboarding:${ctx.user.id}`);
    const ownerEmployeeId = stableUuid(`${organizationId}:owner-employee`);
    const areaIds = input.areas.map((_, index) => stableUuid(`${organizationId}:area:${index}`));

    const areaRefToId = new Map();
    input.areas.forEach((area, index) => {
      const id = areaIds[index];
      if (area.ref) areaRefToId.set(area.ref, id);
      areaRefToId.set(`area-${index}`, id);
      areaRefToId.set(String(index), id);
      areaRefToId.set(area.name.toLowerCase(), id);
    });
    const resolveAreaId = (ref) => (ref ? areaRefToId.get(ref) ?? null : null);

    const empRefToId = new Map();
    const employeeIds = input.employees.map((_, index) => stableUuid(`${organizationId}:emp:${index}`));
    input.employees.forEach((emp, index) => {
      const id = employeeIds[index];
      if (emp.ref) empRefToId.set(emp.ref, id);
      empRefToId.set(`emp-${index}`, id);
      empRefToId.set(String(index), id);
    });
    empRefToId.set('owner', ownerEmployeeId);

    const adminCredentials = [];
    const adminUserIds = new Map();
    const adminEmployeeIds = new Map();
    for (const admin of input.admins) {
      const existingId = existingAdminIds[admin.email];
      const userId = existingId ?? stableUuid(`onboarding-admin:${admin.email}`);
      adminUserIds.set(admin.email, userId);
      const empId = admin.isEmployee ? stableUuid(`${organizationId}:admin-employee:${userId}`) : null;
      if (empId) {
        adminEmployeeIds.set(admin.email, empId);
        if (admin.ref) empRefToId.set(admin.ref, empId);
      }
      if (!existingId) {
        const tempPass = randomBytes(12).toString('base64url');
        adminCredentials.push({ role: 'ADMIN', email: admin.email, temporaryPassword: tempPass, userId, name: admin.name });
      }
    }

    const plannerCredentials = [];
    const plannerUserIds = new Map();
    const plannerEmployeeIds = new Map();
    const plannerRefToId = new Map();
    for (const planner of input.planners) {
      const existingId = existingPlannerIds[planner.email];
      const userId = existingId ?? stableUuid(`onboarding-planner:${planner.email}`);
      plannerUserIds.set(planner.email, userId);
      if (planner.ref) plannerRefToId.set(planner.ref, userId);
      plannerRefToId.set(planner.email, userId);
      const empId = planner.isEmployee ? stableUuid(`${organizationId}:planner-employee:${userId}`) : null;
      if (empId) {
        plannerEmployeeIds.set(planner.email, empId);
        if (planner.ref) empRefToId.set(planner.ref, empId);
      }
      if (!existingId) {
        const tempPass = randomBytes(12).toString('base64url');
        plannerCredentials.push({ role: 'PLANNER', email: planner.email, temporaryPassword: tempPass, userId, name: planner.name });
      }
    }

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
      const ownerAreaId = resolveAreaId(input.owner.areaRef);
      queries.push(sql`
        INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status, area_id)
        VALUES (${ownerEmployeeId}, ${organizationId}, ${input.owner.externalEmployeeId || null}, ${input.owner.employeeName}, ${ctx.user.id}, 'active', ${ownerAreaId})
        ON CONFLICT (id) DO NOTHING
      `);
      if (ownerAreaId) {
        queries.push(sql`
          INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
          VALUES (${organizationId}, 'EMPLOYEE_AREA', ${ownerEmployeeId}, ${ownerAreaId}, CURRENT_DATE, NULL)
          ON CONFLICT DO NOTHING
        `);
      }
    }

    for (const admin of input.admins) {
      const userId = adminUserIds.get(admin.email);
      const cred = adminCredentials.find((c) => c.email === admin.email);
      if (cred) {
        queries.push(sql`
          INSERT INTO users (id, email, password_hash, display_name)
          VALUES (${userId}, ${admin.email}, ${hashPassword(cred.temporaryPassword)}, ${admin.name})
          ON CONFLICT (id) DO NOTHING
        `);
      }
      queries.push(sql`
        INSERT INTO memberships (user_id, organization_id, role)
        VALUES (${userId}, ${organizationId}, 'ADMIN')
        ON CONFLICT (user_id, organization_id) DO NOTHING
      `);
      if (admin.isEmployee) {
        const empId = adminEmployeeIds.get(admin.email);
        const adminAreaId = resolveAreaId(admin.areaRef);
        queries.push(sql`
          INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status, area_id)
          VALUES (${empId}, ${organizationId}, ${admin.externalEmployeeId || null}, ${admin.employeeName}, ${userId}, 'active', ${adminAreaId})
          ON CONFLICT (id) DO NOTHING
        `);
        if (adminAreaId) {
          queries.push(sql`
            INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
            VALUES (${organizationId}, 'EMPLOYEE_AREA', ${empId}, ${adminAreaId}, CURRENT_DATE, NULL)
            ON CONFLICT DO NOTHING
          `);
        }
      }
    }

    for (const planner of input.planners) {
      const userId = plannerUserIds.get(planner.email);
      const cred = plannerCredentials.find((c) => c.email === planner.email);
      if (cred) {
        queries.push(sql`
          INSERT INTO users (id, email, password_hash, display_name)
          VALUES (${userId}, ${planner.email}, ${hashPassword(cred.temporaryPassword)}, ${planner.name})
          ON CONFLICT (id) DO NOTHING
        `);
      }
      const plannerScopeType = ['ORGANIZATION', 'AREAS', 'EMPLOYEES'].includes(planner.plannerScopeType)
        ? planner.plannerScopeType
        : 'ORGANIZATION';
      const firstAreaId = plannerScopeType === 'AREAS' && planner.scopedAreaRefs?.[0]
        ? resolveAreaId(planner.scopedAreaRefs[0])
        : null;

      queries.push(sql`
        INSERT INTO memberships (user_id, organization_id, role, scoped_area_id, planner_scope_type)
        VALUES (${userId}, ${organizationId}, 'PLANNER', ${firstAreaId}, ${plannerScopeType})
        ON CONFLICT (user_id, organization_id) DO NOTHING
      `);

      if (planner.isEmployee) {
        const empId = plannerEmployeeIds.get(planner.email);
        const plannerAreaId = resolveAreaId(planner.areaRef);
        queries.push(sql`
          INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status, area_id)
          VALUES (${empId}, ${organizationId}, ${planner.externalEmployeeId || null}, ${planner.employeeName}, ${userId}, 'active', ${plannerAreaId})
          ON CONFLICT (id) DO NOTHING
        `);
        if (plannerAreaId) {
          queries.push(sql`
            INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
            VALUES (${organizationId}, 'EMPLOYEE_AREA', ${empId}, ${plannerAreaId}, CURRENT_DATE, NULL)
            ON CONFLICT DO NOTHING
          `);
        }
      }

      if (plannerScopeType === 'AREAS') {
        for (const aRef of planner.scopedAreaRefs) {
          const aId = resolveAreaId(aRef);
          if (aId) {
            queries.push(sql`
              INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
              VALUES (${organizationId}, 'PLANNER_AREA', ${userId}, ${aId}, CURRENT_DATE, NULL)
              ON CONFLICT DO NOTHING
            `);
          }
        }
      } else if (plannerScopeType === 'EMPLOYEES') {
        for (const eRef of planner.scopedEmployeeRefs) {
          const eId = empRefToId.get(eRef);
          if (eId) {
            queries.push(sql`
              INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
              VALUES (${organizationId}, 'PLANNER_EMPLOYEE', ${userId}, ${eId}, CURRENT_DATE, NULL)
              ON CONFLICT DO NOTHING
            `);
          }
        }
      }
    }

    input.employees.forEach((emp, index) => {
      const empId = employeeIds[index];
      const empAreaId = resolveAreaId(emp.areaRef);
      queries.push(sql`
        INSERT INTO employees (id, organization_id, external_employee_id, name, status, area_id)
        VALUES (${empId}, ${organizationId}, ${emp.externalEmployeeId || null}, ${emp.name}, 'active', ${empAreaId})
        ON CONFLICT (id) DO NOTHING
      `);
      if (empAreaId) {
        queries.push(sql`
          INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
          VALUES (${organizationId}, 'EMPLOYEE_AREA', ${empId}, ${empAreaId}, CURRENT_DATE, NULL)
          ON CONFLICT DO NOTHING
        `);
      }
    });

    for (const assign of input.assignments.employeeToArea) {
      const eId = empRefToId.get(assign.employeeRef);
      const aId = resolveAreaId(assign.areaRef);
      if (eId && aId) {
        queries.push(sql`
          UPDATE employees SET area_id = ${aId} WHERE id = ${eId} AND organization_id = ${organizationId}
        `);
        queries.push(sql`
          INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
          VALUES (${organizationId}, 'EMPLOYEE_AREA', ${eId}, ${aId}, CURRENT_DATE, NULL)
          ON CONFLICT DO NOTHING
        `);
      }
    }

    for (const assign of input.assignments.employeeToPlanner) {
      const eId = empRefToId.get(assign.employeeRef);
      const pUserId = plannerRefToId.get(assign.plannerRef);
      if (eId && pUserId) {
        queries.push(sql`
          INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
          VALUES (${organizationId}, 'PLANNER_EMPLOYEE', ${pUserId}, ${eId}, CURRENT_DATE, NULL)
          ON CONFLICT DO NOTHING
        `);
        queries.push(sql`
          UPDATE memberships SET planner_scope_type = 'EMPLOYEES'
          WHERE organization_id = ${organizationId} AND user_id = ${pUserId}
        `);
      }
    }

    await sql.transaction(queries);

    const firstAdminCred = adminCredentials[0];
    const allCredentials = [...adminCredentials, ...plannerCredentials];

    return sendJson(res, 201, {
      organizationId,
      ...(firstAdminCred ? { adminCredentials: { email: firstAdminCred.email, temporaryPassword: firstAdminCred.temporaryPassword } } : {}),
      ...(allCredentials.length > 0 ? { credentials: allCredentials.map((c) => ({ role: c.role, email: c.email, temporaryPassword: c.temporaryPassword })) } : {}),
    });
  } catch (error) {
    return handleError(res, error);
  }
}
