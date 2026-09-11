/**
 * Temporal Organizational Model Domain Service (Phase 1)
 * Pure domain logic for validating temporal roles, employee area assignments,
 * access scopes, and reporting relationships with cycle detection and tenant boundaries.
 */

export const ROLES = Object.freeze(['OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE']);
export const SCOPE_TYPES = Object.freeze(['ORGANIZATION', 'AREA', 'PERSON']);
export const RELATIONSHIP_TYPES = Object.freeze(['ADMIN_PLANNER', 'ADMIN_EMPLOYEE', 'PLANNER_EMPLOYEE']);
export const EMPLOYMENT_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']);
export const PERSON_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITATION']);
export const SOURCES = Object.freeze([
  'SYSTEM',
  'USER',
  'LEGACY_CURRENT_STATE',
  'LEGACY_OPERATIONAL_ASSIGNMENT',
  'LEGACY_AREA_RESPONSIBLE',
]);

/**
 * Normalizes a date to an ISO YYYY-MM-DD string.
 */
export function normalizeDate(date) {
  if (!date) return null;
  if (typeof date === 'string') {
    const match = date.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Checks if a given date falls within [validFrom, validTo] inclusively.
 * NULL validTo represents an unbounded / open-ended upper limit.
 */
export function isDateWithinRange(date, validFrom, validTo = null) {
  const d = normalizeDate(date);
  const from = normalizeDate(validFrom);
  const to = validTo ? normalizeDate(validTo) : null;

  if (d < from) return false;
  if (to !== null && d > to) return false;
  return true;
}

/**
 * Checks if two closed or open-ended discrete date ranges overlap.
 * Both ranges are inclusive: [start, end]. If end is null, range is [start, +infinity).
 */
export function rangesOverlap(startA, endA, startB, endB) {
  const sA = normalizeDate(startA);
  const eA = endA ? normalizeDate(endA) : null;
  const sB = normalizeDate(startB);
  const eB = endB ? normalizeDate(endB) : null;

  if (eA !== null && sA > eA) {
    throw new Error(`Range A is inverted: ${sA} > ${eA}`);
  }
  if (eB !== null && sB > eB) {
    throw new Error(`Range B is inverted: ${sB} > ${eB}`);
  }

  const aStartsBeforeBEnds = eB === null || sA <= eB;
  const bStartsBeforeAEnds = eA === null || sB <= eA;

  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

/**
 * Computes the intersection of two closed or open-ended discrete date ranges.
 * Returns null if the intersection is empty.
 */
export function intersectDateRanges(rangeA, rangeB) {
  const sA = normalizeDate(rangeA.from || rangeA.validFrom);
  const eA = rangeA.to ? normalizeDate(rangeA.to) : (rangeA.validTo ? normalizeDate(rangeA.validTo) : null);
  const sB = normalizeDate(rangeB.from || rangeB.validFrom);
  const eB = rangeB.to ? normalizeDate(rangeB.to) : (rangeB.validTo ? normalizeDate(rangeB.validTo) : null);

  const maxStart = sA > sB ? sA : sB;
  let minEnd = null;
  if (eA !== null && eB !== null) {
    minEnd = eA < eB ? eA : eB;
  } else if (eA !== null) {
    minEnd = eA;
  } else if (eB !== null) {
    minEnd = eB;
  }

  if (minEnd !== null && maxStart > minEnd) {
    return null;
  }
  return { from: maxStart, to: minEnd, validFrom: maxStart, validTo: minEnd };
}

/**
 * Returns the calendar date immediately preceding the given ISO date string.
 *
 * @param {string} date ISO date YYYY-MM-DD
 * @returns {string} ISO date YYYY-MM-DD
 */
export function getDayBefore(date) {
  const normalized = normalizeDate(date);
  const d = new Date(`${normalized}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Checks if outer range [outerFrom, outerTo] fully covers inner range [innerFrom, innerTo].
 *
 * @param {string} outerFrom
 * @param {string|null} outerTo
 * @param {string} innerFrom
 * @param {string|null} innerTo
 * @returns {boolean}
 */
export function dateRangeContains(outerFrom, outerTo, innerFrom, innerTo) {
  const normOuterFrom = normalizeDate(outerFrom);
  const normOuterTo = outerTo ? normalizeDate(outerTo) : null;
  const normInnerFrom = normalizeDate(innerFrom);
  const normInnerTo = innerTo ? normalizeDate(innerTo) : null;

  if (normOuterFrom > normInnerFrom) return false;
  if (normOuterTo !== null) {
    if (normInnerTo === null) return false;
    if (normInnerTo > normOuterTo) return false;
  }
  return true;
}

/**
 * Validates a temporal role period assignment.
 */
export function validateRolePeriod({
  organizationId,
  organizationPersonId,
  role,
  validFrom,
  validTo = null,
  existingPeriods = [],
}) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!organizationPersonId) throw new Error('organizationPersonId is required');
  if (!ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of ${ROLES.join(', ')}`);
  }

  const from = normalizeDate(validFrom);
  const to = validTo ? normalizeDate(validTo) : null;

  if (to !== null && to < from) {
    throw new Error(`Invalid date range: validTo (${to}) cannot be earlier than validFrom (${from})`);
  }

  // Check role overlap for the same person
  for (const existing of existingPeriods) {
    if (existing.organizationPersonId !== organizationPersonId) continue;
    if (rangesOverlap(from, to, existing.validFrom, existing.validTo)) {
      throw new Error(
        `Role period overlaps with existing role '${existing.role}' (${existing.validFrom} to ${existing.validTo ?? 'open'})`
      );
    }
  }

  // Single Owner invariant check
  if (role === 'OWNER') {
    for (const existing of existingPeriods) {
      if (existing.role === 'OWNER' && existing.organizationPersonId !== organizationPersonId) {
        if (rangesOverlap(from, to, existing.validFrom, existing.validTo)) {
          throw new Error('Organization already has an active OWNER in this period. Ownership transfer required.');
        }
      }
    }
  }

  return {
    organizationId,
    organizationPersonId,
    role,
    validFrom: from,
    validTo: to,
  };
}

/**
 * Validates an employee area period assignment.
 */
export function validateEmployeeAreaPeriod({
  organizationId,
  employeeProfileId,
  areaId,
  validFrom,
  validTo = null,
  isPrimary = false,
  areaOrganizationId = organizationId,
  existingPeriods = [],
}) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!employeeProfileId) throw new Error('employeeProfileId is required');
  if (!areaId) throw new Error('areaId is required');

  if (areaOrganizationId !== organizationId) {
    throw new Error('Tenant boundary violation: Area does not belong to the same organization');
  }

  const from = normalizeDate(validFrom);
  const to = validTo ? normalizeDate(validTo) : null;

  if (to !== null && to < from) {
    throw new Error(`Invalid date range: validTo (${to}) cannot be earlier than validFrom (${from})`);
  }

  for (const existing of existingPeriods) {
    if (existing.employeeProfileId !== employeeProfileId) continue;

    // Disallow overlapping periods for the exact SAME area
    if (existing.areaId === areaId && rangesOverlap(from, to, existing.validFrom, existing.validTo)) {
      throw new Error(`Employee already has an overlapping assignment to the same area (${areaId})`);
    }

    // Disallow more than one primary area at any point in time
    if (isPrimary && existing.isPrimary && rangesOverlap(from, to, existing.validFrom, existing.validTo)) {
      throw new Error(`Employee already has a primary area assigned during this period (${existing.areaId})`);
    }
  }

  return {
    organizationId,
    employeeProfileId,
    areaId,
    validFrom: from,
    validTo: to,
    isPrimary: Boolean(isPrimary),
  };
}

/**
 * Validates an access scope period assignment.
 */
export function validateAccessScopePeriod({
  organizationId,
  organizationPersonId,
  scopeType,
  areaId = null,
  targetPersonId = null,
  validFrom,
  validTo = null,
  areaOrganizationId = organizationId,
  targetPersonOrganizationId = organizationId,
  existingPeriods = [],
}) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!organizationPersonId) throw new Error('organizationPersonId is required');
  if (!SCOPE_TYPES.includes(scopeType)) {
    throw new Error(`Invalid scopeType: ${scopeType}. Must be one of ${SCOPE_TYPES.join(', ')}`);
  }

  // Structural checks
  if (scopeType === 'ORGANIZATION') {
    if (areaId !== null || targetPersonId !== null) {
      throw new Error('ORGANIZATION scope must have both areaId and targetPersonId as null');
    }
  } else if (scopeType === 'AREA') {
    if (!areaId || targetPersonId !== null) {
      throw new Error('AREA scope requires areaId and targetPersonId must be null');
    }
    if (areaOrganizationId !== organizationId) {
      throw new Error('Tenant boundary violation: Scoped area does not belong to the same organization');
    }
  } else if (scopeType === 'PERSON') {
    if (!targetPersonId || areaId !== null) {
      throw new Error('PERSON scope requires targetPersonId and areaId must be null');
    }
    if (targetPersonOrganizationId !== organizationId) {
      throw new Error('Tenant boundary violation: Target person does not belong to the same organization');
    }
  }

  const from = normalizeDate(validFrom);
  const to = validTo ? normalizeDate(validTo) : null;

  if (to !== null && to < from) {
    throw new Error(`Invalid date range: validTo (${to}) cannot be earlier than validFrom (${from})`);
  }

  // Check duplicates / overlapping identical scopes
  for (const existing of existingPeriods) {
    if (existing.organizationPersonId !== organizationPersonId) continue;
    if (existing.scopeType !== scopeType) continue;

    let isSameTarget = false;
    if (scopeType === 'ORGANIZATION') isSameTarget = true;
    else if (scopeType === 'AREA') isSameTarget = existing.areaId === areaId;
    else if (scopeType === 'PERSON') isSameTarget = existing.targetPersonId === targetPersonId;

    if (isSameTarget && rangesOverlap(from, to, existing.validFrom, existing.validTo)) {
      throw new Error(`Duplicate or overlapping access scope detected for ${scopeType}`);
    }
  }

  return {
    organizationId,
    organizationPersonId,
    scopeType,
    areaId,
    targetPersonId,
    validFrom: from,
    validTo: to,
  };
}

/**
 * Detects if adding a directed edge (supervisor -> subordinate) introduces a cycle in the reporting graph.
 * Temporal cycle detection: a path forms a cycle only if the intersection of all date ranges along the path is non-empty.
 */
export function detectSupervisionCycle(existingEdges, newEdge) {
  const { supervisorPersonId, subordinatePersonId, validFrom, validTo = null } = newEdge;
  if (supervisorPersonId === subordinatePersonId) {
    return true; // Self-supervision is a trivial cycle
  }

  const initialRange = {
    from: normalizeDate(validFrom),
    to: validTo ? normalizeDate(validTo) : null,
  };

  function dfs(currentNode, currentRange, visited) {
    for (const edge of existingEdges) {
      if (edge.supervisorPersonId === currentNode) {
        const edgeRange = {
          from: normalizeDate(edge.validFrom),
          to: edge.validTo ? normalizeDate(edge.validTo) : null,
        };
        const intersection = intersectDateRanges(currentRange, edgeRange);
        if (intersection !== null) {
          if (edge.subordinatePersonId === supervisorPersonId) {
            return true;
          }
          if (!visited.has(edge.subordinatePersonId)) {
            const nextVisited = new Set(visited);
            nextVisited.add(edge.subordinatePersonId);
            if (dfs(edge.subordinatePersonId, intersection, nextVisited)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  return dfs(subordinatePersonId, initialRange, new Set([subordinatePersonId]));
}

/**
 * Validates a reporting relationship period.
 */
export function validateReportingRelationship({
  organizationId,
  supervisorPersonId,
  subordinatePersonId,
  relationshipType,
  validFrom,
  validTo = null,
  isPrimary = false,
  supervisorOrganizationId = organizationId,
  subordinateOrganizationId = organizationId,
  existingRelationships = [],
  supervisorRole,
  subordinateRole,
  subordinateHasProfile,
  supervisorRolePeriod = null,
  subordinateRolePeriod = null,
  subordinateProfilePeriod = null,
}) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!supervisorPersonId) throw new Error('supervisorPersonId is required');
  if (!subordinatePersonId) throw new Error('subordinatePersonId is required');

  if (supervisorOrganizationId !== organizationId || subordinateOrganizationId !== organizationId) {
    throw new Error('Tenant boundary violation: Supervisor and subordinate must belong to the same organization');
  }

  if (supervisorPersonId === subordinatePersonId) {
    throw new Error('Self-supervision forbidden: A person cannot supervise themselves');
  }

  if (!RELATIONSHIP_TYPES.includes(relationshipType)) {
    throw new Error(`Invalid relationshipType: ${relationshipType}. Must be one of ${RELATIONSHIP_TYPES.join(', ')}`);
  }

  const from = normalizeDate(validFrom);
  const to = validTo ? normalizeDate(validTo) : null;

  if (to !== null && to < from) {
    throw new Error(`Invalid date range: validTo (${to}) cannot be earlier than validFrom (${from})`);
  }

  // Subordinate profile check
  if (['ADMIN_EMPLOYEE', 'PLANNER_EMPLOYEE'].includes(relationshipType)) {
    if (!subordinateHasProfile) {
      throw new Error(`Subordinate person must have an active employee profile for relationship type ${relationshipType}`);
    }
    if (subordinateProfilePeriod) {
      const profileFrom = subordinateProfilePeriod.startedOn || subordinateProfilePeriod.validFrom;
      const profileTo = subordinateProfilePeriod.endedOn !== undefined ? subordinateProfilePeriod.endedOn : subordinateProfilePeriod.validTo;
      if (profileFrom || profileTo) {
        if (!dateRangeContains(profileFrom || from, profileTo ?? null, from, to)) {
          throw new Error('Subordinate employee profile tenure does not fully cover the reporting relationship period');
        }
      }
    }
  }

  // Role compatibility validations (mandatory parameters)
  if (!supervisorRole) {
    throw new Error('supervisorRole is required for reporting relationship validation');
  }
  if (!subordinateRole) {
    throw new Error('subordinateRole is required for reporting relationship validation');
  }

  if (supervisorRolePeriod) {
    if (!dateRangeContains(supervisorRolePeriod.validFrom, supervisorRolePeriod.validTo ?? null, from, to)) {
      throw new Error('Supervisor role period does not fully cover the reporting relationship period');
    }
  }

  if (relationshipType === 'ADMIN_PLANNER') {
    if (!['OWNER', 'ADMIN'].includes(supervisorRole)) {
      throw new Error(`Incompatible supervisor role for ADMIN_PLANNER: ${supervisorRole}. Must be OWNER or ADMIN`);
    }
    if (subordinateRole !== 'PLANNER') {
      throw new Error(`Incompatible subordinate role for ADMIN_PLANNER: ${subordinateRole}. Must be PLANNER`);
    }
    if (subordinateRolePeriod) {
      if (!dateRangeContains(subordinateRolePeriod.validFrom, subordinateRolePeriod.validTo ?? null, from, to)) {
        throw new Error('Subordinate role period does not fully cover the reporting relationship period');
      }
    }
  } else if (relationshipType === 'ADMIN_EMPLOYEE') {
    if (!['OWNER', 'ADMIN'].includes(supervisorRole)) {
      throw new Error(`Incompatible supervisor role for ADMIN_EMPLOYEE: ${supervisorRole}. Must be OWNER or ADMIN`);
    }
    if (subordinateRole !== 'EMPLOYEE') {
      throw new Error(`Incompatible subordinate role for ADMIN_EMPLOYEE: ${subordinateRole}. Must be EMPLOYEE`);
    }
  } else if (relationshipType === 'PLANNER_EMPLOYEE') {
    if (supervisorRole !== 'PLANNER') {
      throw new Error(`Incompatible supervisor role for PLANNER_EMPLOYEE: ${supervisorRole}. Must be PLANNER`);
    }
    if (subordinateRole !== 'EMPLOYEE') {
      throw new Error(`Incompatible subordinate role for PLANNER_EMPLOYEE: ${subordinateRole}. Must be EMPLOYEE`);
    }
  }

  // Check duplicates and single primary
  for (const existing of existingRelationships) {
    if (!rangesOverlap(from, to, existing.validFrom, existing.validTo)) continue;

    // Duplicate check
    if (
      existing.supervisorPersonId === supervisorPersonId &&
      existing.subordinatePersonId === subordinatePersonId &&
      existing.relationshipType === relationshipType
    ) {
      throw new Error('Duplicate reporting relationship for the same supervisor, subordinate, and relationship type');
    }

    // Single primary check
    if (
      isPrimary &&
      existing.isPrimary &&
      existing.subordinatePersonId === subordinatePersonId &&
      existing.relationshipType === relationshipType
    ) {
      throw new Error(`Subordinate already has a primary supervisor for relationship type ${relationshipType}`);
    }
  }

  // Cycle detection with temporal date range intersection
  const hasCycle = detectSupervisionCycle(existingRelationships, {
    supervisorPersonId,
    subordinatePersonId,
    validFrom: from,
    validTo: to,
  });
  if (hasCycle) {
    throw new Error('Circular supervision detected: A person cannot report to their subordinate (direct or indirect cycle)');
  }

  return {
    organizationId,
    supervisorPersonId,
    subordinatePersonId,
    relationshipType,
    validFrom: from,
    validTo: to,
    isPrimary: Boolean(isPrimary),
  };
}

/**
 * Closes an open-ended period by assigning validTo.
 */
export function closePeriod(period, closeDate) {
  const cd = normalizeDate(closeDate);
  const vf = normalizeDate(period.validFrom);
  if (cd < vf) {
    throw new Error(`Close date (${cd}) cannot be earlier than validFrom (${vf})`);
  }
  return {
    ...period,
    validTo: cd,
  };
}

// =========================================================================
// PARAMETERIZED QUERIES FOR DATABASE ACCESS / REPOSITORY LAYER
// =========================================================================

/**
 * Returns employee areas valid on an arbitrary as-of date.
 */
export async function getEmployeeAreasOnDate(sql, { organizationId, employeeProfileId, asOfDate }) {
  const targetDate = normalizeDate(asOfDate);
  const rows = await sql`
    SELECT 
      eap.id,
      eap.organization_id,
      eap.employee_profile_id,
      eap.area_id,
      a.name AS area_name,
      a.active AS area_active,
      eap.is_primary,
      eap.valid_from,
      eap.valid_to,
      eap.source
    FROM employee_area_periods eap
    JOIN areas a ON eap.area_id = a.id AND eap.organization_id = a.organization_id
    WHERE eap.organization_id = ${organizationId}
      AND eap.employee_profile_id = ${employeeProfileId}
      AND eap.valid_from <= ${targetDate}::date
      AND (eap.valid_to IS NULL OR eap.valid_to >= ${targetDate}::date)
    ORDER BY eap.is_primary DESC, a.name ASC;
  `;
  return rows;
}

/**
 * Returns employees in an area valid on an arbitrary as-of date.
 */
export async function getAreaEmployeesOnDate(sql, { organizationId, areaId, asOfDate }) {
  const targetDate = normalizeDate(asOfDate);
  const rows = await sql`
    SELECT 
      eap.id AS assignment_id,
      eap.employee_profile_id,
      ep.employee_name,
      ep.external_employee_id,
      ep.employment_status,
      eap.is_primary,
      eap.valid_from,
      eap.valid_to
    FROM employee_area_periods eap
    JOIN employee_profiles ep ON eap.employee_profile_id = ep.id AND eap.organization_id = ep.organization_id
    WHERE eap.organization_id = ${organizationId}
      AND eap.area_id = ${areaId}
      AND eap.valid_from <= ${targetDate}::date
      AND (eap.valid_to IS NULL OR eap.valid_to >= ${targetDate}::date)
    ORDER BY ep.employee_name ASC;
  `;
  return rows;
}

/**
 * Returns access scopes for a person on an arbitrary as-of date.
 */
export async function getPersonAccessScopesOnDate(sql, { organizationId, personId, asOfDate }) {
  const targetDate = normalizeDate(asOfDate);
  const rows = await sql`
    SELECT 
      pasp.id,
      pasp.organization_id,
      pasp.organization_person_id,
      pasp.scope_type,
      pasp.area_id,
      a.name AS area_name,
      pasp.target_person_id,
      pasp.valid_from,
      pasp.valid_to,
      pasp.source
    FROM person_access_scope_periods pasp
    LEFT JOIN areas a ON pasp.area_id = a.id AND pasp.organization_id = a.organization_id
    WHERE pasp.organization_id = ${organizationId}
      AND pasp.organization_person_id = ${personId}
      AND pasp.valid_from <= ${targetDate}::date
      AND (pasp.valid_to IS NULL OR pasp.valid_to >= ${targetDate}::date)
    ORDER BY pasp.scope_type ASC;
  `;
  return rows;
}

/**
 * Returns the effective supervisor(s) of a subordinate on a given date.
 */
export async function getSupervisorsOnDate(sql, { organizationId, subordinatePersonId, relationshipType = null, asOfDate }) {
  const targetDate = normalizeDate(asOfDate);
  const rows = await sql`
    SELECT 
      rrp.id,
      rrp.supervisor_person_id,
      rrp.relationship_type,
      rrp.is_primary,
      rrp.valid_from,
      rrp.valid_to,
      sup_ep.employee_name AS supervisor_name,
      sup_op.user_id AS supervisor_user_id
    FROM reporting_relationship_periods rrp
    JOIN organization_people sup_op ON rrp.supervisor_person_id = sup_op.id AND rrp.organization_id = sup_op.organization_id
    LEFT JOIN employee_profiles sup_ep ON rrp.supervisor_person_id = sup_ep.organization_person_id AND rrp.organization_id = sup_ep.organization_id
    WHERE rrp.organization_id = ${organizationId}
      AND rrp.subordinate_person_id = ${subordinatePersonId}
      AND (${relationshipType}::text IS NULL OR rrp.relationship_type = ${relationshipType})
      AND rrp.valid_from <= ${targetDate}::date
      AND (rrp.valid_to IS NULL OR rrp.valid_to >= ${targetDate}::date)
    ORDER BY rrp.is_primary DESC;
  `;
  return rows;
}

/**
 * Returns the subordinates supervised by a person on a given date.
 */
export async function getSubordinatesOnDate(sql, { organizationId, supervisorPersonId, relationshipType = null, asOfDate }) {
  const targetDate = normalizeDate(asOfDate);
  const rows = await sql`
    SELECT 
      rrp.id,
      rrp.subordinate_person_id,
      rrp.relationship_type,
      rrp.is_primary,
      rrp.valid_from,
      rrp.valid_to,
      sub_ep.employee_name AS subordinate_name,
      sub_op.user_id AS subordinate_user_id
    FROM reporting_relationship_periods rrp
    JOIN organization_people sub_op ON rrp.subordinate_person_id = sub_op.id AND rrp.organization_id = sub_op.organization_id
    LEFT JOIN employee_profiles sub_ep ON rrp.subordinate_person_id = sub_ep.organization_person_id AND rrp.organization_id = sub_ep.organization_id
    WHERE rrp.organization_id = ${organizationId}
      AND rrp.supervisor_person_id = ${supervisorPersonId}
      AND (${relationshipType}::text IS NULL OR rrp.relationship_type = ${relationshipType})
      AND rrp.valid_from <= ${targetDate}::date
      AND (rrp.valid_to IS NULL OR rrp.valid_to >= ${targetDate}::date)
    ORDER BY rrp.is_primary DESC, sub_ep.employee_name ASC;
  `;
  return rows;
}

/**
 * Returns full historical record for a person across roles, areas, scopes, and supervision.
 */
export async function getPersonHistory(sql, { organizationId, personId }) {
  const [roles, areas, scopes, supervisionsAsSupervisor, supervisionsAsSubordinate] = await Promise.all([
    sql`
      SELECT id, role, valid_from, valid_to, source, created_at
      FROM person_role_periods
      WHERE organization_id = ${organizationId} AND organization_person_id = ${personId}
      ORDER BY valid_from ASC;
    `,
    sql`
      SELECT eap.id, eap.area_id, a.name AS area_name, eap.is_primary, eap.valid_from, eap.valid_to, eap.source
      FROM employee_area_periods eap
      JOIN employee_profiles ep ON eap.employee_profile_id = ep.id AND eap.organization_id = ep.organization_id
      JOIN areas a ON eap.area_id = a.id AND eap.organization_id = a.organization_id
      WHERE eap.organization_id = ${organizationId} AND ep.organization_person_id = ${personId}
      ORDER BY eap.valid_from ASC;
    `,
    sql`
      SELECT pasp.id, pasp.scope_type, pasp.area_id, a.name AS area_name, pasp.target_person_id, pasp.valid_from, pasp.valid_to, pasp.source
      FROM person_access_scope_periods pasp
      LEFT JOIN areas a ON pasp.area_id = a.id AND pasp.organization_id = a.organization_id
      WHERE pasp.organization_id = ${organizationId} AND pasp.organization_person_id = ${personId}
      ORDER BY pasp.valid_from ASC;
    `,
    sql`
      SELECT rrp.id, rrp.subordinate_person_id, rrp.relationship_type, rrp.is_primary, rrp.valid_from, rrp.valid_to
      FROM reporting_relationship_periods rrp
      WHERE rrp.organization_id = ${organizationId} AND rrp.supervisor_person_id = ${personId}
      ORDER BY rrp.valid_from ASC;
    `,
    sql`
      SELECT rrp.id, rrp.supervisor_person_id, rrp.relationship_type, rrp.is_primary, rrp.valid_from, rrp.valid_to
      FROM reporting_relationship_periods rrp
      WHERE rrp.organization_id = ${organizationId} AND rrp.subordinate_person_id = ${personId}
      ORDER BY rrp.valid_from ASC;
    `,
  ]);

  return {
    roles,
    areas,
    scopes,
    supervisionsAsSupervisor,
    supervisionsAsSubordinate,
  };
}

/**
 * Resolves the effective area for an employee shift on a specific historical date.
 * If the employee has a primary area on that date, it is returned; otherwise fallbackAreaId is used.
 */
export async function resolveShiftAreaHistorical(sql, { organizationId, employeeProfileId, shiftDate, fallbackAreaId = null }) {
  const targetDate = normalizeDate(shiftDate);
  const rows = await sql`
    SELECT area_id
    FROM employee_area_periods
    WHERE organization_id = ${organizationId}
      AND employee_profile_id = ${employeeProfileId}
      AND valid_from <= ${targetDate}::date
      AND (valid_to IS NULL OR valid_to >= ${targetDate}::date)
    ORDER BY is_primary DESC, valid_from DESC
    LIMIT 1;
  `;
  if (rows.length > 0) {
    return rows[0].area_id;
  }
  return fallbackAreaId;
}

/**
 * Atomically transfers organizational ownership on a specific effective date in the temporal model,
 * maintaining the single OWNER exclusion constraint and updating legacy memberships for compatibility.
 *
 * @param {object} sql Neon/postgres tagged template client
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} [params.currentOwnerPersonId] Optional, discovered if omitted
 * @param {string} params.newOwnerPersonId
 * @param {string} params.effectiveDate ISO YYYY-MM-DD
 * @param {string} [params.newPreviousOwnerRole='ADMIN']
 * @returns {Promise<{ transferred: boolean, organizationId: string, previousOwnerPersonId: string, newOwnerPersonId: string, effectiveDate: string, previousOwnerRole: string }>}
 */
export async function transferOwnershipTemporal(sql, {
  organizationId,
  currentOwnerPersonId = null,
  newOwnerPersonId,
  effectiveDate,
  newPreviousOwnerRole = 'ADMIN',
}) {
  if (typeof sql?.transaction !== 'function') {
    throw new Error('Transaction support is required for atomic ownership transfer');
  }
  if (!organizationId) throw new Error('organizationId is required');
  if (!newOwnerPersonId) throw new Error('newOwnerPersonId is required');
  if (!['ADMIN', 'PLANNER'].includes(newPreviousOwnerRole)) {
    throw new Error('Previous owner role must be ADMIN or PLANNER');
  }

  const effDate = normalizeDate(effectiveDate);
  const today = new Date().toISOString().slice(0, 10);
  if (effDate > today) {
    throw new Error('Future-dated ownership transfers are not allowed without an automated scheduler');
  }
  const dayBefore = getDayBefore(effDate);

  // Validate target person belongs to the organization and meets owner prerequisites
  const newOwnerPersonRows = await sql`
    SELECT id, user_id, status
    FROM organization_people
    WHERE id = ${newOwnerPersonId} AND organization_id = ${organizationId};
  `;
  if (newOwnerPersonRows.length === 0) {
    throw new Error(`Target person ${newOwnerPersonId} not found in organization ${organizationId}`);
  }
  const newOwnerPerson = newOwnerPersonRows[0];
  if (!newOwnerPerson.user_id) {
    throw new Error('New owner must have an associated user_id');
  }
  if (newOwnerPerson.status !== 'ACTIVE') {
    throw new Error('New owner must be in ACTIVE status');
  }

  // Validate new owner holds a valid membership
  const newOwnerMembershipRows = await sql`
    SELECT role
    FROM memberships
    WHERE organization_id = ${organizationId} AND user_id = ${newOwnerPerson.user_id};
  `;
  if (newOwnerMembershipRows.length === 0) {
    throw new Error('New owner must have an existing membership in the organization');
  }

  // Discover or verify current owner
  let currentOwner;
  if (currentOwnerPersonId) {
    const rows = await sql`
      SELECT prp.id, prp.organization_person_id, prp.valid_from, prp.valid_to, op.user_id
      FROM person_role_periods prp
      JOIN organization_people op ON op.id = prp.organization_person_id AND op.organization_id = prp.organization_id
      WHERE prp.organization_id = ${organizationId}
        AND prp.organization_person_id = ${currentOwnerPersonId}
        AND prp.role = 'OWNER'
        AND prp.valid_from <= ${effDate}::date
        AND (prp.valid_to IS NULL OR prp.valid_to >= ${effDate}::date)
      ORDER BY prp.valid_from DESC
      LIMIT 1;
    `;
    if (rows.length === 0) {
      throw new Error(`Current owner period for person ${currentOwnerPersonId} not active on ${effDate}`);
    }
    currentOwner = rows[0];
  } else {
    const rows = await sql`
      SELECT prp.id, prp.organization_person_id, prp.valid_from, prp.valid_to, op.user_id
      FROM person_role_periods prp
      JOIN organization_people op ON op.id = prp.organization_person_id AND op.organization_id = prp.organization_id
      WHERE prp.organization_id = ${organizationId}
        AND prp.role = 'OWNER'
        AND prp.valid_from <= ${effDate}::date
        AND (prp.valid_to IS NULL OR prp.valid_to >= ${effDate}::date)
      ORDER BY prp.valid_from DESC
      LIMIT 1;
    `;
    if (rows.length === 0) {
      throw new Error(`No active OWNER role period found in organization ${organizationId} on ${effDate}`);
    }
    currentOwner = rows[0];
  }

  if (currentOwner.organization_person_id === newOwnerPersonId) {
    throw new Error('Target owner cannot be the same as current owner');
  }

  const curOwnerValidFrom = normalizeDate(currentOwner.valid_from);
  if (curOwnerValidFrom > dayBefore) {
    throw new Error(`Effective date ${effDate} is on or before current owner start date ${curOwnerValidFrom}`);
  }

  // Explicit conflict check: do NOT delete future periods; reject if incompatible future periods exist
  const futureRoleRows = await sql`
    SELECT id, role, organization_person_id, valid_from
    FROM person_role_periods
    WHERE organization_id = ${organizationId}
      AND (
        (organization_person_id = ${currentOwner.organization_person_id} AND valid_from > ${effDate}::date)
        OR (organization_person_id = ${newOwnerPersonId} AND valid_from >= ${effDate}::date)
        OR (role = 'OWNER' AND valid_from >= ${effDate}::date)
      );
  `;
  if (futureRoleRows.length > 0) {
    throw new Error('Ownership transfer conflict: Incompatible future role periods exist on or after effective date');
  }

  const queriesBuilder = (client) => {
    const list = [
      // Concurrency lock: serialize transfers on organization
      client`
        SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE;
      `,
      // 1. Close active OWNER period for current owner at effectiveDate - 1 day
      client`
        UPDATE person_role_periods
        SET valid_to = ${dayBefore}::date, updated_at = NOW()
        WHERE id = ${currentOwner.id};
      `,
      // 2. Open new demoted role period for previous owner at effectiveDate
      client`
        INSERT INTO person_role_periods (
          organization_id, organization_person_id, role, valid_from, valid_to, source, created_at, updated_at
        ) VALUES (
          ${organizationId}, ${currentOwner.organization_person_id}, ${newPreviousOwnerRole}, ${effDate}::date, NULL, 'USER', NOW(), NOW()
        );
      `,
      // 3. Close any active role period of new owner starting before effectiveDate at effectiveDate - 1 day
      client`
        UPDATE person_role_periods
        SET valid_to = ${dayBefore}::date, updated_at = NOW()
        WHERE organization_id = ${organizationId}
          AND organization_person_id = ${newOwnerPersonId}
          AND valid_from <= ${dayBefore}::date
          AND (valid_to IS NULL OR valid_to >= ${effDate}::date);
      `,
      // 4. Open new OWNER period for new owner starting at effectiveDate
      client`
        INSERT INTO person_role_periods (
          organization_id, organization_person_id, role, valid_from, valid_to, source, created_at, updated_at
        ) VALUES (
          ${organizationId}, ${newOwnerPersonId}, 'OWNER', ${effDate}::date, NULL, 'USER', NOW(), NOW()
        );
      `,
    ];

    // 5. Update legacy memberships table for current owner if user_id exists
    if (currentOwner.user_id) {
      list.push(client`
        UPDATE memberships
        SET role = ${newPreviousOwnerRole}, scoped_area_id = NULL, planner_scope_type = NULL
        WHERE organization_id = ${organizationId} AND user_id = ${currentOwner.user_id};
      `);
    }

    // 6. Update legacy memberships table for new owner if user_id exists
    if (newOwnerPerson.user_id) {
      list.push(client`
        UPDATE memberships
        SET role = 'OWNER', scoped_area_id = NULL, planner_scope_type = NULL
        WHERE organization_id = ${organizationId} AND user_id = ${newOwnerPerson.user_id};
      `);
    }

    return list;
  };

  await sql.transaction(queriesBuilder);

  return {
    transferred: true,
    organizationId,
    previousOwnerPersonId: currentOwner.organization_person_id,
    newOwnerPersonId,
    effectiveDate: effDate,
    previousOwnerRole: newPreviousOwnerRole,
  };
}
