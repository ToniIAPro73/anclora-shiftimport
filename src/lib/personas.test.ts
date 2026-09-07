import { describe, expect, it } from 'vitest';
import { buildPersonas, filterPersonas } from './personas';
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
    expect(filterPersonas(personas, { access: 'without_access' })).toHaveLength(1);
  });

  it('filters personas by role', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas);

    expect(filterPersonas(personas, { role: 'OWNER' })).toHaveLength(1);
    expect(filterPersonas(personas, { role: 'ADMIN' })).toHaveLength(1);
    expect(filterPersonas(personas, { role: 'PLANNER' })).toHaveLength(1);
    expect(filterPersonas(personas, { role: 'EMPLOYEE' })).toHaveLength(0);
  });

  it('filters personas by area', () => {
    const personas = buildPersonas(members, employees, 'usr-owner', areas);

    expect(filterPersonas(personas, { areaId: 'area-ops' })).toHaveLength(1);
    expect(filterPersonas(personas, { areaId: 'area-sec' })).toHaveLength(1);
    expect(filterPersonas(personas, { areaId: 'none' })).toHaveLength(2); // Alice and Charlie
  });
});
