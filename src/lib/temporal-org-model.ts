/**
 * TypeScript definitions and domain utilities for the Normalized Temporal Organizational Model (Phase 1).
 */

export type OrgRole = 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE';
export type OrgScopeType = 'ORGANIZATION' | 'AREA' | 'PERSON';
export type OrgRelationshipType = 'ADMIN_PLANNER' | 'ADMIN_EMPLOYEE' | 'PLANNER_EMPLOYEE';
export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type PersonStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_INVITATION';

export interface OrganizationPerson {
  id: string;
  organizationId: string;
  userId: string | null;
  status: PersonStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeProfile {
  id: string;
  organizationId: string;
  organizationPersonId: string;
  externalEmployeeId: string | null;
  employeeName: string;
  employmentStatus: EmploymentStatus;
  startedOn: string | null;
  endedOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonRolePeriod {
  id: string;
  organizationId: string;
  organizationPersonId: string;
  role: OrgRole;
  validFrom: string;
  validTo: string | null;
  createdByUserId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeAreaPeriod {
  id: string;
  organizationId: string;
  employeeProfileId: string;
  areaId: string;
  validFrom: string;
  validTo: string | null;
  isPrimary: boolean;
  createdByUserId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonAccessScopePeriod {
  id: string;
  organizationId: string;
  organizationPersonId: string;
  scopeType: OrgScopeType;
  areaId: string | null;
  targetPersonId: string | null;
  validFrom: string;
  validTo: string | null;
  createdByUserId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportingRelationshipPeriod {
  id: string;
  organizationId: string;
  supervisorPersonId: string;
  subordinatePersonId: string;
  relationshipType: OrgRelationshipType;
  validFrom: string;
  validTo: string | null;
  isPrimary: boolean;
  createdByUserId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export function normalizeDate(date: string | Date | null | undefined): string | null {
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

export function isDateWithinRange(date: string | Date, validFrom: string | Date, validTo: string | Date | null = null): boolean {
  const d = normalizeDate(date)!;
  const from = normalizeDate(validFrom)!;
  const to = validTo ? normalizeDate(validTo) : null;

  if (d < from) return false;
  if (to !== null && d > to) return false;
  return true;
}

export function rangesOverlap(
  startA: string | Date,
  endA: string | Date | null,
  startB: string | Date,
  endB: string | Date | null
): boolean {
  const sA = normalizeDate(startA)!;
  const eA = endA ? normalizeDate(endA) : null;
  const sB = normalizeDate(startB)!;
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

export function detectSupervisionCycle(
  existingEdges: Array<{ supervisorPersonId: string; subordinatePersonId: string }>,
  newEdge: { supervisorPersonId: string; subordinatePersonId: string }
): boolean {
  const { supervisorPersonId, subordinatePersonId } = newEdge;
  if (supervisorPersonId === subordinatePersonId) {
    return true;
  }

  const adj = new Map<string, string[]>();
  for (const edge of existingEdges) {
    const list = adj.get(edge.supervisorPersonId) || [];
    list.push(edge.subordinatePersonId);
    adj.set(edge.supervisorPersonId, list);
  }

  const list = adj.get(supervisorPersonId) || [];
  list.push(subordinatePersonId);
  adj.set(supervisorPersonId, list);

  const visited = new Set<string>();
  function canReach(current: string, target: string): boolean {
    if (current === target) return true;
    visited.add(current);
    const neighbors = adj.get(current) || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        if (canReach(next, target)) return true;
      }
    }
    return false;
  }

  return canReach(subordinatePersonId, supervisorPersonId);
}
