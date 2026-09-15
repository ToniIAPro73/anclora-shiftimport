import type { RemoteArea, RemoteEmployee, RemoteMember } from './remote';

export interface Persona {
  id: string; // userId if present, else `emp-${employeeId}`
  name: string;
  email: string | null;
  hasAccess: boolean;
  role: 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE' | null;
  plannerScopeType?: 'ORGANIZATION' | 'AREAS' | 'EMPLOYEES' | null;
  scopedAreaIds?: string[];
  scopedEmployeeIds?: string[];
  userId: string | null;
  employeeId: string | null;
  employeeExternalId: string | null;
  areaId: string | null;
  areaName?: string | null;
  status: 'active' | 'inactive' | 'pending_access';
  isCurrentUser: boolean;
  isLinked: boolean;
}

export function buildPersonas(
  members: RemoteMember[],
  employees: RemoteEmployee[],
  currentUserId?: string,
  areas: RemoteArea[] = [],
  /** employeeId -> last-known email, for a person whose access was revoked:
   * the account still exists (safely recoverable from the access directory)
   * even though no active membership remains. */
  knownEmailByEmployeeId?: Map<string, string>,
): Persona[] {
  const areaMap = new Map<string, string>();
  for (const a of areas) {
    areaMap.set(a.id, a.name);
  }

  const linkedEmployeeIds = new Set<string>();
  const personas: Persona[] = [];

  // 1. Process all members
  for (const m of members) {
    // Find matching employee by m.employeeId or employee.userId
    const emp = (m.employeeId ? employees.find((e) => e.id === m.employeeId) : null)
      || employees.find((e) => e.userId === m.userId);

    if (emp) {
      linkedEmployeeIds.add(emp.id);
    }

    const areaId = emp?.areaId ?? m.employeeAreaId ?? m.scopedAreaId ?? null;
    const areaName = areaId ? areaMap.get(areaId) ?? null : null;

    personas.push({
      id: m.userId,
      // Once a user is linked to an employee, the organization employee name
      // is authoritative for operational selectors and access management.
      // Account display names remain the fallback for users without a card.
      name: emp?.name || m.displayName || m.email,
      email: m.email,
      hasAccess: true,
      role: m.role,
      plannerScopeType: m.plannerScopeType ?? (m.scopedAreaId ? 'AREAS' : null),
      scopedAreaIds: m.scopedAreaIds ?? (m.scopedAreaId ? [m.scopedAreaId] : []),
      scopedEmployeeIds: m.scopedEmployeeIds ?? [],
      userId: m.userId,
      employeeId: emp?.id ?? m.employeeId ?? null,
      employeeExternalId: emp?.externalEmployeeId ?? m.employeeExternalId ?? null,
      areaId,
      areaName,
      status: emp?.status ?? 'active',
      isCurrentUser: Boolean(currentUserId && m.userId === currentUserId),
      isLinked: Boolean(emp || m.employeeId),
    });
  }

  // 2. Process all employees that are not linked to any member
  for (const emp of employees) {
    if (linkedEmployeeIds.has(emp.id)) {
      continue;
    }
    if (emp.userId && personas.some((p) => p.userId === emp.userId)) {
      continue;
    }

    const areaId = emp.areaId ?? null;
    const areaName = areaId ? areaMap.get(areaId) ?? null : null;

    personas.push({
      id: `emp-${emp.id}`,
      name: emp.name,
      email: knownEmailByEmployeeId?.get(emp.id) ?? null,
      hasAccess: false,
      role: null,
      plannerScopeType: null,
      scopedAreaIds: [],
      scopedEmployeeIds: [],
      userId: null,
      employeeId: emp.id,
      employeeExternalId: emp.externalEmployeeId ?? null,
      areaId,
      areaName,
      status: emp.status ?? 'active',
      isCurrentUser: false,
      isLinked: false,
    });
  }

  // Sort personas by name alphabetically
  return personas.sort((a, b) => a.name.localeCompare(b.name));
}

export interface PersonaFilterOptions {
  search?: string;
  access?: 'all' | 'with_access' | 'pending_access' | 'without_access';
  role?: 'all' | 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE';
  areaId?: string; // 'all', 'none', or specific areaId
  status?: 'all' | 'active' | 'inactive' | 'pending_access';
}

export function filterPersonas(personas: Persona[], filters: PersonaFilterOptions): Persona[] {
  return personas.filter((p) => {
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchEmail = Boolean(p.email && p.email.toLowerCase().includes(q));
      const matchExternalId = Boolean(p.employeeExternalId && p.employeeExternalId.toLowerCase().includes(q));
      if (!matchName && !matchEmail && !matchExternalId) {
        return false;
      }
    }

    if (filters.access && filters.access !== 'all') {
      if (filters.access === 'with_access' && !p.hasAccess) return false;
      if (filters.access === 'pending_access' && p.status !== 'pending_access') return false;
      if (filters.access === 'without_access' && (p.hasAccess || p.status === 'pending_access')) return false;
    }

    if (filters.role && filters.role !== 'all') {
      if (p.role !== filters.role) return false;
    }

    if (filters.areaId && filters.areaId !== 'all') {
      if (filters.areaId === 'none') {
        if (p.areaId !== null) return false;
      } else if (p.areaId !== filters.areaId) {
        return false;
      }
    }

    if (filters.status && filters.status !== 'all') {
      if (p.status !== filters.status) return false;
    }

    return true;
  });
}

/**
 * Pure and robust formatter for employee profiles / records.
 *
 * Rules:
 * - name + identifier: "Sebas · ID 84881"
 * - name without identifier: "Sebas"
 * - name with empty/whitespace identifier: "Sebas"
 * - complete absence of record: localized fallback (e.g. "Sin ficha de empleado")
 * - identifier without a name: localized fallback (the identifier is not a name)
 * - never outputs empty parentheses `()`, `(null)`, `(undefined)`, or excess whitespace.
 */
export function formatEmployeeProfileLabel(
  name?: string | null,
  externalId?: string | null | number,
  fallback: string = 'Sin ficha de empleado',
): string {
  const cleanName = typeof name === 'string'
    ? (['null', 'undefined'].includes(name.trim().toLowerCase()) ? '' : name.trim())
    : '';

  let cleanId = '';
  if (typeof externalId === 'number' && Number.isFinite(externalId)) {
    cleanId = String(externalId).trim();
  } else if (typeof externalId === 'string') {
    const trimmed = externalId.trim();
    if (!['null', 'undefined'].includes(trimmed.toLowerCase())) {
      cleanId = trimmed;
    }
  }

  if (cleanName && cleanId) {
    return `${cleanName} · ID ${cleanId}`;
  }
  if (cleanName) {
    return cleanName;
  }
  return fallback;
}
