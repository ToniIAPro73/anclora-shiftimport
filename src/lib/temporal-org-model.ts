/**
 * TypeScript definitions and domain utilities for the Normalized Temporal Organizational Model (Phase 1).
 */

export type OrgRole = 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE';
export type OrgScopeType = 'ORGANIZATION' | 'AREA' | 'PERSON';
export type OrgRelationshipType = 'ADMIN_PLANNER' | 'ADMIN_EMPLOYEE' | 'PLANNER_EMPLOYEE';
export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type PersonStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_INVITATION';

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

export function intersectDateRanges(
  rangeA: { from?: string | Date | null; validFrom?: string | Date | null; to?: string | Date | null; validTo?: string | Date | null },
  rangeB: { from?: string | Date | null; validFrom?: string | Date | null; to?: string | Date | null; validTo?: string | Date | null }
): { from: string; to: string | null; validFrom: string; validTo: string | null } | null {
  const sA = normalizeDate(rangeA.from || rangeA.validFrom)!;
  const eA = rangeA.to ? normalizeDate(rangeA.to) : (rangeA.validTo ? normalizeDate(rangeA.validTo) : null);
  const sB = normalizeDate(rangeB.from || rangeB.validFrom)!;
  const eB = rangeB.to ? normalizeDate(rangeB.to) : (rangeB.validTo ? normalizeDate(rangeB.validTo) : null);

  const maxStart = sA > sB ? sA : sB;
  let minEnd: string | null = null;
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

export function getDayBefore(date: string | Date): string {
  const normalized = normalizeDate(date)!;
  const d = new Date(`${normalized}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function dateRangeContains(
  outerFrom: string | Date,
  outerTo: string | Date | null | undefined,
  innerFrom: string | Date,
  innerTo: string | Date | null | undefined
): boolean {
  const normOuterFrom = normalizeDate(outerFrom)!;
  const normOuterTo = outerTo ? normalizeDate(outerTo) : null;
  const normInnerFrom = normalizeDate(innerFrom)!;
  const normInnerTo = innerTo ? normalizeDate(innerTo) : null;

  if (normOuterFrom > normInnerFrom) return false;
  if (normOuterTo !== null) {
    if (normInnerTo === null) return false;
    if (normInnerTo > normOuterTo) return false;
  }
  return true;
}

export function detectSupervisionCycle(
  existingEdges: Array<{ supervisorPersonId: string; subordinatePersonId: string; validFrom?: string; validTo?: string | null }>,
  newEdge: { supervisorPersonId: string; subordinatePersonId: string; validFrom?: string; validTo?: string | null }
): boolean {
  const { supervisorPersonId, subordinatePersonId } = newEdge;
  if (supervisorPersonId === subordinatePersonId) {
    return true;
  }

  const newRange = {
    validFrom: newEdge.validFrom || '1970-01-01',
    validTo: newEdge.validTo || null,
  };

  const adj = new Map<string, Array<{ to: string; validFrom: string; validTo: string | null }>>();
  for (const edge of existingEdges) {
    const list = adj.get(edge.supervisorPersonId) || [];
    list.push({
      to: edge.subordinatePersonId,
      validFrom: edge.validFrom || '1970-01-01',
      validTo: edge.validTo || null,
    });
    adj.set(edge.supervisorPersonId, list);
  }

  function canReachWithTemporalOverlap(
    currentNode: string,
    currentRange: { validFrom: string; validTo: string | null },
    visited: Set<string>
  ): boolean {
    const outgoing = adj.get(currentNode) || [];
    for (const edge of outgoing) {
      const intersection = intersectDateRanges(currentRange, edge);
      if (intersection !== null) {
        if (edge.to === supervisorPersonId) {
          return true;
        }
        if (!visited.has(edge.to)) {
          const nextVisited = new Set(visited);
          nextVisited.add(edge.to);
          if (canReachWithTemporalOverlap(edge.to, intersection, nextVisited)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  return canReachWithTemporalOverlap(subordinatePersonId, newRange, new Set([subordinatePersonId]));
}
