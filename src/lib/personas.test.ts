import { describe, expect, it } from 'vitest';
import { buildPersonas, filterPersonas, formatEmployeeProfileLabel } from './personas';
import type { RemoteArea, RemoteEmployee, RemoteMember } from './remote';

describe('Personas domain logic (buildPersonas & filterPersonas)', () => {
  const areas: RemoteArea[] = [
    { id: 'area-ops', name: 'Operaciones', code: 'OPS', active: true, createdAt: '2026-01-01' },
    { id: 'area-sec', name: 'Seguridad', code: 'SEC', active: true, createdAt: '2026-01-01' },
  ];

  const members: RemoteMember[] = [
    {
      userId: 'usr-owner',
      email: 'owner@example.com',
      displayName: 'Alice Owner',
      role: 'OWNER',
    },
    {
      userId: 'usr-admin',
      email: 'admin@example.com',
      displayName: 'Bob Admin',
      role: 'ADMIN',
      employeeId: 'emp-bob',
    },
    {
      userId: 'usr-planner',
      email: 'planner@example.com',
      displayName: 'Charlie Planner',
      role: 'PLANNER',
      plannerScopeType: 'AREAS',
      scopedAreaIds: ['area-ops'],
    },
  ];

  const employees: RemoteEmployee[] = [
    {
      id: 'emp-bob',
      organizationId: 'org-1',
      name: 'Bob Admin',
      userId: 'usr-admin',
      externalEmployeeId: 'EMP-001',
      areaId: 'area-ops',
      status: 'active',
    },
    {
      id: 'emp-dave',
      organizationId: 'org-1',
      name: 'Dave Worker',
      userId: null,
      externalEmployeeId: 'EMP-002',
      areaId: 'area-sec',
      status: 'pending_access',
    },
  ];

  it('unifies members and unlinked employees into consistent Personas', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas);

    expect(personas).toHaveLength(4);

    // Alice Owner: Member without employee record
    const alice = personas.find((p) => p.name === 'Alice Owner')!;
    expect(alice).toBeDefined();
    expect(alice.hasAccess).toBe(true);
    expect(alice.role).toBe('OWNER');
    expect(alice.isCurrentUser).toBe(true);
    expect(alice.employeeId).toBeNull();
    expect(alice.isLinked).toBe(false);

    // Bob Admin: Member linked to Employee emp-bob
    const bob = personas.find((p) => p.name === 'Bob Admin')!;
    expect(bob).toBeDefined();
    expect(bob.hasAccess).toBe(true);
    expect(bob.role).toBe('ADMIN');
    expect(bob.employeeId).toBe('emp-bob');
    expect(bob.employeeExternalId).toBe('EMP-001');
    expect(bob.areaId).toBe('area-ops');
    expect(bob.areaName).toBe('Operaciones');
    expect(bob.isLinked).toBe(true);

    // Charlie Planner: Member with planner scope
    const charlie = personas.find((p) => p.name === 'Charlie Planner')!;
    expect(charlie).toBeDefined();
    expect(charlie.role).toBe('PLANNER');
    expect(charlie.plannerScopeType).toBe('AREAS');
    expect(charlie.scopedAreaIds).toEqual(['area-ops']);

    // Dave Worker: Unlinked employee without user account
    const dave = personas.find((p) => p.name === 'Dave Worker')!;
    expect(dave).toBeDefined();
    expect(dave.hasAccess).toBe(false);
    expect(dave.role).toBeNull();
    expect(dave.email).toBeNull();
    expect(dave.employeeId).toBe('emp-dave');
    expect(dave.areaName).toBe('Seguridad');
    expect(dave.status).toBe('pending_access');
    expect(dave.isLinked).toBe(false);
  });

  it('filters personas by search text across name, email, and external ID', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas);

    expect(filterPersonas(personas, { search: 'owner' })).toHaveLength(1);
    expect(filterPersonas(personas, { search: 'EMP-002' })).toHaveLength(1);
    expect(filterPersonas(personas, { search: 'charlie' })).toHaveLength(1);
    expect(filterPersonas(personas, { search: 'nonexistent' })).toHaveLength(0);
  });

  it('filters personas by access status', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas);

    expect(filterPersonas(personas, { access: 'with_access' })).toHaveLength(3);
    expect(filterPersonas(personas, { access: 'pending_access' })).toHaveLength(1);
    expect(filterPersonas(personas, { access: 'without_access' })).toHaveLength(0);
  });

  it('filters personas by role', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas);

    expect(filterPersonas(personas, { role: 'OWNER' })).toHaveLength(1);
    expect(filterPersonas(personas, { role: 'ADMIN' })).toHaveLength(1);
    expect(filterPersonas(personas, { role: 'PLANNER' })).toHaveLength(1);
    expect(filterPersonas(personas, { role: 'EMPLOYEE' })).toHaveLength(0);
  });

  it('recovers the last-known email for a person whose access was revoked, without granting access', () => {
    const knownEmailByEmployeeId = new Map([['emp-dave', 'dave@example.com']]);
    const personas = buildPersonas(members, employees, 'usr-owner', areas, knownEmailByEmployeeId);

    const dave = personas.find((p) => p.name === 'Dave Worker')!;
    expect(dave.email).toBe('dave@example.com');
    expect(dave.hasAccess).toBe(false);
  });

  it('leaves email null when there is no known previous account for the employee', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas, new Map());
    const dave = personas.find((p) => p.name === 'Dave Worker')!;
    expect(dave.email).toBeNull();
  });

  it('filters personas by area', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas);

    expect(filterPersonas(personas, { areaId: 'area-ops' })).toHaveLength(1);
    expect(filterPersonas(personas, { areaId: 'area-sec' })).toHaveLength(1);
    expect(filterPersonas(personas, { areaId: 'none' })).toHaveLength(2); // Alice and Charlie
  });
});

describe('formatEmployeeProfileLabel', () => {
  it('formats nombre + identificador correctly', () => {
    expect(formatEmployeeProfileLabel('Sebas', '84881')).toBe('Sebas · ID 84881');
  });

  it('formats nombre + identificador numérico correctly', () => {
    expect(formatEmployeeProfileLabel('Sebas', 84881)).toBe('Sebas · ID 84881');
  });

  it('formats nombre + null without empty parentheses', () => {
    expect(formatEmployeeProfileLabel('Sebas', null)).toBe('Sebas');
  });

  it('formats nombre + undefined without empty parentheses', () => {
    expect(formatEmployeeProfileLabel('Sebas', undefined)).toBe('Sebas');
  });

  it('formats nombre + cadena vacía without empty parentheses', () => {
    expect(formatEmployeeProfileLabel('Sebas', '')).toBe('Sebas');
  });

  it('formats nombre + espacios without empty parentheses', () => {
    expect(formatEmployeeProfileLabel('Sebas', '   ')).toBe('Sebas');
  });

  it('handles ausencia completa de ficha with default and localized fallback', () => {
    expect(formatEmployeeProfileLabel(null, null)).toBe('Sin ficha de empleado');
    expect(formatEmployeeProfileLabel(undefined, undefined)).toBe('Sin ficha de empleado');
    expect(formatEmployeeProfileLabel('', '')).toBe('Sin ficha de empleado');
    expect(formatEmployeeProfileLabel('   ', '   ')).toBe('Sin ficha de empleado');
    expect(formatEmployeeProfileLabel(null, null, 'No employee profile')).toBe('No employee profile');
  });

  it('handles nombres con tildes y caracteres internacionales', () => {
    expect(formatEmployeeProfileLabel('María José Peña-Gómez', 'EMP-Ñ-01')).toBe('María José Peña-Gómez · ID EMP-Ñ-01');
    expect(formatEmployeeProfileLabel('Björn Müller', 'ID-99')).toBe('Björn Müller · ID ID-99');
    expect(formatEmployeeProfileLabel('François Çelik', 'FR-42')).toBe('François Çelik · ID FR-42');
  });

  it('never outputs "(null)", "(undefined)" or excess whitespace', () => {
    expect(formatEmployeeProfileLabel('Sebas', 'null')).toBe('Sebas');
    expect(formatEmployeeProfileLabel('Sebas', 'undefined')).toBe('Sebas');
    expect(formatEmployeeProfileLabel(null, '84881')).toBe('Sin ficha de empleado');
    expect(formatEmployeeProfileLabel('null', '84881')).toBe('Sin ficha de empleado');
    expect(formatEmployeeProfileLabel('undefined', '84881')).toBe('Sin ficha de empleado');
    expect(formatEmployeeProfileLabel('  Sebas  ', '  84881  ')).toBe('Sebas · ID 84881');
    expect(formatEmployeeProfileLabel('Usuario Groundforce restaurado', null)).toBe('Usuario Groundforce restaurado');
  });
});
