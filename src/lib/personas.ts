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
      name: m.displayName || emp?.name || m.email,
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
      email: null,
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
  access?: 'all' | 'with_access' | 'without_access';
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
      if (filters.access === 'without_access' && p.hasAccess) return false;
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
