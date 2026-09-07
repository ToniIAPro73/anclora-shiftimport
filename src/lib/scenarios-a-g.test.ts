import { describe, expect, it } from 'vitest';
import { ACTIONS, can } from './authorization';
import type { Actor } from './authorization';
import { buildPersonas, filterPersonas } from './personas';
import type { RemoteArea, RemoteEmployee, RemoteMember } from './remote';

describe('P5.7-M10 — Canonical Business Scenarios A through G', () => {
  // =========================================================================
  // SCENARIO A: Micro-empresa plana
  // 3 personas, 0 áreas, 0 planners; todo funciona limpio y sin fricción.
  // =========================================================================
  describe('Scenario A: Micro-empresa plana', () => {
    const areas: RemoteArea[] = []; // 0 areas
    const members: RemoteMember[] = [
      { userId: 'u-owner', email: 'owner@micro.com', displayName: 'Elena Propietaria', role: 'OWNER' },
      { userId: 'u-emp1', email: 'worker1@micro.com', displayName: 'Carlos Operario', role: 'EMPLOYEE', employeeId: 'emp-1' },
    ];
    const employees: RemoteEmployee[] = [
      { id: 'emp-1', organizationId: 'org-micro', name: 'Carlos Operario', userId: 'u-emp1', externalEmployeeId: null, status: 'active' },
      { id: 'emp-2', organizationId: 'org-micro', name: 'Diana Técnica', userId: null, externalEmployeeId: null, status: 'pending_access' },
    ];

    it('builds a clean 3-persona roster with zero areas and zero planners', () => {
      const personas = buildPersonas(members, employees, 'u-owner', areas);
      expect(personas).toHaveLength(3);

      const ownerPersona = personas.find((p) => p.userId === 'u-owner')!;
      expect(ownerPersona.role).toBe('OWNER');
      expect(ownerPersona.isCurrentUser).toBe(true);

      const emp1Persona = personas.find((p) => p.employeeId === 'emp-1')!;
      expect(emp1Persona.role).toBe('EMPLOYEE');
      expect(emp1Persona.hasAccess).toBe(true);

      const emp2Persona = personas.find((p) => p.employeeId === 'emp-2')!;
      expect(emp2Persona.hasAccess).toBe(false);
      expect(emp2Persona.status).toBe('pending_access');
    });

    it('grants full management to owner while denying user management to employees', () => {
      const ownerActor: Actor = { userId: 'u-owner', role: 'OWNER', employeeId: null };
      const empActor: Actor = { userId: 'u-emp1', role: 'EMPLOYEE', employeeId: 'emp-1' };

      expect(can(ownerActor, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(ownerActor, ACTIONS.MANAGE_USERS)).toBe(true);
      expect(can(ownerActor, ACTIONS.EDIT_SHIFT)).toBe(true);

      expect(can(empActor, ACTIONS.VIEW_TEAM)).toBe(false);
      expect(can(empActor, ACTIONS.MANAGE_USERS)).toBe(false);
      expect(can(empActor, ACTIONS.EDIT_SHIFT)).toBe(false);
    });
  });

  // =========================================================================
  // SCENARIO B: Empresa sin áreas con planificador
  // 1 Owner, 1 Planner global, N empleados; planner ve y planifica toda la org.
  // =========================================================================
  describe('Scenario B: Empresa sin áreas con planificador', () => {
    const plannerActor: Actor = {
      userId: 'u-planner',
      role: 'PLANNER',
      plannerScopeType: 'ORGANIZATION',
      employeeId: null,
    };

    it('allows global planner to plan for any employee across the whole organization', () => {
      expect(can(plannerActor, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(plannerActor, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-1' })).toBe(true);
      expect(can(plannerActor, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-99' })).toBe(true);
      expect(can(plannerActor, ACTIONS.EDIT_SHIFT, { areaId: undefined })).toBe(true);
    });

    it('prohibits planner from modifying user roles or transferring ownership', () => {
      expect(can(plannerActor, ACTIONS.MANAGE_USERS)).toBe(false);
      expect(can(plannerActor, ACTIONS.TRANSFER_OWNERSHIP)).toBe(false);
    });
  });

  // =========================================================================
  // SCENARIO C: Empresa con áreas y planificador acotado
  // 1 Owner, 2 áreas (Norte, Sur), 1 Planner asignado a Área Norte.
  // =========================================================================
  describe('Scenario C: Empresa con áreas y planificador acotado', () => {
    const areaNortePlanner: Actor = {
      userId: 'u-planner-norte',
      role: 'PLANNER',
      plannerScopeType: 'AREAS',
      scopedAreaIds: ['area-norte'],
      employeeId: null,
    };

    it('restricts shift editing to shifts strictly within the assigned area', () => {
      expect(can(areaNortePlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-norte' })).toBe(true);
      expect(can(areaNortePlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-sur' })).toBe(false);
      expect(can(areaNortePlanner, ACTIONS.EDIT_SHIFT, { areaId: undefined })).toBe(false);
    });

    it('allows approving change requests only for the scoped area', () => {
      const norteRequest = { requesterUserId: 'u-emp1', employeeId: 'emp-1', areaId: 'area-norte' };
      const surRequest = { requesterUserId: 'u-emp2', employeeId: 'emp-2', areaId: 'area-sur' };

      expect(can(areaNortePlanner, ACTIONS.APPROVE_REQUEST, norteRequest)).toBe(true);
      expect(can(areaNortePlanner, ACTIONS.APPROVE_REQUEST, surRequest)).toBe(false);
    });
  });

  // =========================================================================
  // SCENARIO D: Planificador multi-área
  // Planner asignado a Área Norte + Centro; ve exactamente esas dos áreas.
  // =========================================================================
  describe('Scenario D: Planificador multi-área', () => {
    const multiPlanner: Actor = {
      userId: 'u-planner-multi',
      role: 'PLANNER',
      plannerScopeType: 'AREAS',
      scopedAreaIds: ['area-norte', 'area-centro'],
      employeeId: null,
    };

    it('permits operations across all assigned areas and forbids unassigned areas', () => {
      expect(can(multiPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-norte' })).toBe(true);
      expect(can(multiPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-centro' })).toBe(true);
      expect(can(multiPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-sur' })).toBe(false);
      expect(can(multiPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-este' })).toBe(false);
    });
  });

  // =========================================================================
  // SCENARIO E: Admin con empleo operativo
  // 1 Admin vinculado a Employee; planifica para otros, tiene sus turnos,
  // anti-self-approval bloquea auto-aprobación.
  // =========================================================================
  describe('Scenario E: Admin con empleo operativo', () => {
    const adminWithEmployee: Actor = {
      userId: 'u-admin-dual',
      role: 'ADMIN',
      employeeId: 'emp-admin',
    };

    it('allows admin to edit shifts for others and manage organization', () => {
      expect(can(adminWithEmployee, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(adminWithEmployee, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-other' })).toBe(true);
    });

    it('strictly forbids self-approval and self-rejection of own change requests', () => {
      const ownRequest = {
        requesterUserId: 'u-admin-dual',
        employeeId: 'emp-admin',
      };
      expect(can(adminWithEmployee, ACTIONS.APPROVE_REQUEST, ownRequest)).toBe(false);
      expect(can(adminWithEmployee, ACTIONS.REJECT_REQUEST, ownRequest)).toBe(false);
    });

    it('allows approving other employees change requests', () => {
      const peerRequest = {
        requesterUserId: 'u-peer',
        employeeId: 'emp-peer',
      };
      expect(can(adminWithEmployee, ACTIONS.APPROVE_REQUEST, peerRequest)).toBe(true);
      expect(can(adminWithEmployee, ACTIONS.REJECT_REQUEST, peerRequest)).toBe(true);
    });
  });

  // =========================================================================
  // SCENARIO F: Owner sin empleo operativo
  // Solo gestiona, no aparece en selectores de turnos operativos.
  // =========================================================================
  describe('Scenario F: Owner sin empleo operativo', () => {
    const members: RemoteMember[] = [
      { userId: 'u-owner-pure', email: 'owner@pure.com', displayName: 'Sonia Inversora', role: 'OWNER' },
    ];
    const employees: RemoteEmployee[] = [
      { id: 'emp-worker', organizationId: 'org-1', name: 'Pedro Operativo', userId: null, externalEmployeeId: null, status: 'active' },
    ];

    it('creates pure governance persona with null employeeId and isLinked false', () => {
      const personas = buildPersonas(members, employees, 'u-owner-pure', []);
      const ownerPersona = personas.find((p) => p.userId === 'u-owner-pure')!;

      expect(ownerPersona).toBeDefined();
      expect(ownerPersona.role).toBe('OWNER');
      expect(ownerPersona.employeeId).toBeNull();
      expect(ownerPersona.isLinked).toBe(false);
      expect(ownerPersona.hasAccess).toBe(true);
    });

    it('owner can manage users and transfer ownership', () => {
      const ownerActor: Actor = { userId: 'u-owner-pure', role: 'OWNER', employeeId: null };
      expect(can(ownerActor, ACTIONS.MANAGE_USERS, { role: 'ADMIN' })).toBe(true);
      expect(can(ownerActor, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-new-owner' })).toBe(true);
    });
  });

  // =========================================================================
  // SCENARIO G: Empleado con acceso (Employee portal only)
  // Solo ve su portal de empleado, su calendario, sus solicitudes, no ve menú Gestión.
  // =========================================================================
  describe('Scenario G: Empleado con acceso', () => {
    const employeeActor: Actor = {
      userId: 'u-employee-user',
      role: 'EMPLOYEE',
      employeeId: 'emp-sole',
    };

    it('denies all management and approval permissions', () => {
      expect(can(employeeActor, ACTIONS.VIEW_TEAM)).toBe(false);
      expect(can(employeeActor, ACTIONS.MANAGE_USERS)).toBe(false);
      expect(can(employeeActor, ACTIONS.MANAGE_AREA)).toBe(false);
      expect(can(employeeActor, ACTIONS.EDIT_SHIFT)).toBe(false);
      expect(can(employeeActor, ACTIONS.APPROVE_REQUEST)).toBe(false);
      expect(can(employeeActor, ACTIONS.REJECT_REQUEST)).toBe(false);
      expect(can(employeeActor, ACTIONS.TRANSFER_OWNERSHIP)).toBe(false);
    });

    it('allows searching personas by access status', () => {
      const personas = [
        {
          id: 'p-1',
          name: 'Empleado Activo',
          role: 'EMPLOYEE' as const,
          hasAccess: true,
          status: 'active' as const,
          email: 'emp@test.com',
          employeeId: 'emp-1',
          employeeExternalId: null,
          userId: 'u-1',
          areaId: null,
          areaName: null,
          plannerScopeType: null,
          scopedAreaIds: [],
          scopedEmployeeIds: [],
          isLinked: true,
          isCurrentUser: true,
        },
      ];
      const filtered = filterPersonas(personas, { access: 'with_access', role: 'EMPLOYEE' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].hasAccess).toBe(true);
    });
  });
});
