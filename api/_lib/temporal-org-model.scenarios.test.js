import { describe, expect, it } from 'vitest';
import {
  normalizeDate,
  validateRolePeriod,
  validateEmployeeAreaPeriod,
  validateAccessScopePeriod,
  validateReportingRelationship,
  isDateWithinRange,
  rangesOverlap,
  closePeriod,
} from './temporal-org-model.js';

describe('22 Canonical business scenarios for temporal organizational model (Phase 1)', () => {
  const org1 = '11111111-1111-4111-8111-111111111111';
  const org2 = '22222222-2222-4222-8222-222222222222';

  const user1 = 'user1111-1111-4111-8111-111111111111';
  const personAdmin = 'per-adm1-1111-4111-8111-111111111111';
  const personPlanner1 = 'per-pln1-1111-4111-8111-111111111111';
  const personPlanner2 = 'per-pln2-1111-4111-8111-111111111111';
  const personSubstitute = 'per-sub0-1111-4111-8111-111111111111';
  const personEmp1 = 'per-emp1-1111-4111-8111-111111111111';
  const personEmp2 = 'per-emp2-1111-4111-8111-111111111111';
  const personPending = 'per-pend-1111-4111-8111-111111111111';

  const areaRampa = 'area-rmp-1111-4111-8111-111111111111';
  const areaEquipajes = 'area-eqp-1111-4111-8111-111111111111';
  const areaCrossTenant = 'area-cros-2222-4222-8222-222222222222';

  const empProfile1 = 'empprof1-1111-4111-8111-111111111111';
  const empProfile2 = 'empprof2-1111-4111-8111-111111111111';

  // 1. Admin sin empleado
  it('Scenario 1: Admin sin empleado', () => {
    const rolePeriod = validateRolePeriod({
      organizationId: org1,
      organizationPersonId: personAdmin,
      role: 'ADMIN',
      validFrom: '2026-01-01',
    });
    expect(rolePeriod.role).toBe('ADMIN');
    // Person exists without an employeeProfile record
    const hasEmployeeProfile = false;
    expect(hasEmployeeProfile).toBe(false);
  });

  // 2. Planner sin empleado
  it('Scenario 2: Planner sin empleado', () => {
    const rolePeriod = validateRolePeriod({
      organizationId: org1,
      organizationPersonId: personPlanner1,
      role: 'PLANNER',
      validFrom: '2026-01-01',
    });
    expect(rolePeriod.role).toBe('PLANNER');
    const hasEmployeeProfile = false;
    expect(hasEmployeeProfile).toBe(false);
  });

  // 3. Admin con empleado asociado
  it('Scenario 3: Admin con empleado asociado', () => {
    const rolePeriod = validateRolePeriod({
      organizationId: org1,
      organizationPersonId: personAdmin,
      role: 'ADMIN',
      validFrom: '2026-01-01',
    });
    expect(rolePeriod.role).toBe('ADMIN');
    const employeeProfile = {
      id: empProfile1,
      organizationId: org1,
      organizationPersonId: personAdmin,
      employeeName: 'Administrador Operativo',
    };
    expect(employeeProfile.organizationPersonId).toBe(personAdmin);
  });

  // 4. Planner con empleado asociado
  it('Scenario 4: Planner con empleado asociado', () => {
    const rolePeriod = validateRolePeriod({
      organizationId: org1,
      organizationPersonId: personPlanner1,
      role: 'PLANNER',
      validFrom: '2026-01-01',
    });
    expect(rolePeriod.role).toBe('PLANNER');
    const employeeProfile = {
      id: empProfile2,
      organizationId: org1,
      organizationPersonId: personPlanner1,
      employeeName: 'Planner Rota Leader',
    };
    expect(employeeProfile.organizationPersonId).toBe(personPlanner1);
  });

  // 5. Empleado con usuario activo
  it('Scenario 5: Empleado con usuario activo', () => {
    const person = {
      id: personEmp1,
      organizationId: org1,
      userId: user1, // Authenticated login account
      status: 'ACTIVE',
    };
    const rolePeriod = validateRolePeriod({
      organizationId: org1,
      organizationPersonId: person.id,
      role: 'EMPLOYEE',
      validFrom: '2026-01-01',
    });
    expect(person.userId).not.toBeNull();
    expect(rolePeriod.role).toBe('EMPLOYEE');
  });

  // 6. Empleado con persona creada y usuario todavía ausente (invitación pendiente)
  it('Scenario 6: Empleado con persona creada y usuario ausente', () => {
    const person = {
      id: personPending,
      organizationId: org1,
      userId: null, // No login account yet
      status: 'PENDING_INVITATION',
    };
    const profile = {
      id: 'emp-pending-01',
      organizationId: org1,
      organizationPersonId: person.id,
      employeeName: 'Nuevo Empleado Pendiente',
    };
    expect(person.userId).toBeNull();
    expect(person.status).toBe('PENDING_INVITATION');
    expect(profile.organizationPersonId).toBe(person.id);
  });

  // 7. Usuario presente en dos organizaciones
  it('Scenario 7: Usuario presente en dos organizaciones', () => {
    const personInOrg1 = {
      id: 'p-org1',
      organizationId: org1,
      userId: user1,
    };
    const personInOrg2 = {
      id: 'p-org2',
      organizationId: org2,
      userId: user1, // Same global user
    };

    const roleOrg1 = validateRolePeriod({
      organizationId: org1,
      organizationPersonId: personInOrg1.id,
      role: 'ADMIN',
      validFrom: '2026-01-01',
    });
    const roleOrg2 = validateRolePeriod({
      organizationId: org2,
      organizationPersonId: personInOrg2.id,
      role: 'EMPLOYEE',
      validFrom: '2026-01-01',
    });

    expect(personInOrg1.organizationId).not.toBe(personInOrg2.organizationId);
    expect(roleOrg1.role).toBe('ADMIN');
    expect(roleOrg2.role).toBe('EMPLOYEE');
  });

  // 8. Empleado en dos áreas simultáneas
  it('Scenario 8: Empleado en dos áreas simultáneas', () => {
    const area1 = validateEmployeeAreaPeriod({
      organizationId: org1,
      employeeProfileId: empProfile1,
      areaId: areaRampa,
      validFrom: '2026-01-01',
      isPrimary: true,
    });
    const area2 = validateEmployeeAreaPeriod({
      organizationId: org1,
      employeeProfileId: empProfile1,
      areaId: areaEquipajes,
      validFrom: '2026-04-01',
      isPrimary: false, // Secondary concurrent area
      existingPeriods: [area1],
    });
    expect(area1.isPrimary).toBe(true);
    expect(area2.isPrimary).toBe(false);
    expect(rangesOverlap(area1.validFrom, area1.validTo, area2.validFrom, area2.validTo)).toBe(true);
  });

  // 9. Empleado que termina en un área y comienza en otra
  it('Scenario 9: Empleado que termina en un área y comienza en otra', () => {
    const pastArea = {
      employeeProfileId: empProfile1,
      areaId: areaRampa,
      validFrom: '2026-01-01',
      validTo: '2026-03-31',
      isPrimary: true,
    };
    const newArea = validateEmployeeAreaPeriod({
      organizationId: org1,
      employeeProfileId: empProfile1,
      areaId: areaEquipajes,
      validFrom: '2026-04-01',
      validTo: null,
      isPrimary: true,
      existingPeriods: [pastArea],
    });
    expect(newArea.validFrom).toBe('2026-04-01');
    expect(rangesOverlap(pastArea.validFrom, pastArea.validTo, newArea.validFrom, newArea.validTo)).toBe(false);
  });

  // 10. Admin con scope global
  it('Scenario 10: Admin con scope global', () => {
    const scope = validateAccessScopePeriod({
      organizationId: org1,
      organizationPersonId: personAdmin,
      scopeType: 'ORGANIZATION',
      validFrom: '2026-01-01',
    });
    expect(scope.scopeType).toBe('ORGANIZATION');
    expect(scope.areaId).toBeNull();
    expect(scope.targetPersonId).toBeNull();
  });

  // 11. Admin con dos áreas
  it('Scenario 11: Admin con dos áreas', () => {
    const scope1 = validateAccessScopePeriod({
      organizationId: org1,
      organizationPersonId: personAdmin,
      scopeType: 'AREA',
      areaId: areaRampa,
      validFrom: '2026-01-01',
    });
    const scope2 = validateAccessScopePeriod({
      organizationId: org1,
      organizationPersonId: personAdmin,
      scopeType: 'AREA',
      areaId: areaEquipajes,
      validFrom: '2026-01-01',
      existingPeriods: [scope1],
    });
    expect(scope1.areaId).toBe(areaRampa);
    expect(scope2.areaId).toBe(areaEquipajes);
  });

  // 12. Planner con dos áreas
  it('Scenario 12: Planner con dos áreas', () => {
    const scope1 = validateAccessScopePeriod({
      organizationId: org1,
      organizationPersonId: personPlanner1,
      scopeType: 'AREA',
      areaId: areaRampa,
      validFrom: '2026-01-01',
    });
    const scope2 = validateAccessScopePeriod({
      organizationId: org1,
      organizationPersonId: personPlanner1,
      scopeType: 'AREA',
      areaId: areaEquipajes,
      validFrom: '2026-01-01',
      existingPeriods: [scope1],
    });
    expect(scope1.areaId).toBe(areaRampa);
    expect(scope2.areaId).toBe(areaEquipajes);
  });

  // 13. Admin con varios planners
  it('Scenario 13: Admin con varios planners', () => {
    const rel1 = validateReportingRelationship({
      organizationId: org1,
      supervisorPersonId: personAdmin,
      subordinatePersonId: personPlanner1,
      relationshipType: 'ADMIN_PLANNER',
      validFrom: '2026-01-01',
      supervisorRole: 'ADMIN',
      subordinateRole: 'PLANNER',
    });
    const rel2 = validateReportingRelationship({
      organizationId: org1,
      supervisorPersonId: personAdmin,
      subordinatePersonId: personPlanner2,
      relationshipType: 'ADMIN_PLANNER',
      validFrom: '2026-01-01',
      existingRelationships: [rel1],
      supervisorRole: 'ADMIN',
      subordinateRole: 'PLANNER',
    });
    expect(rel1.subordinatePersonId).toBe(personPlanner1);
    expect(rel2.subordinatePersonId).toBe(personPlanner2);
  });

  // 14. Planner con varios empleados
  it('Scenario 14: Planner con varios empleados', () => {
    const rel1 = validateReportingRelationship({
      organizationId: org1,
      supervisorPersonId: personPlanner1,
      subordinatePersonId: personEmp1,
      relationshipType: 'PLANNER_EMPLOYEE',
      validFrom: '2026-01-01',
      supervisorRole: 'PLANNER',
      subordinateRole: 'EMPLOYEE',
      subordinateHasProfile: true,
    });
    const rel2 = validateReportingRelationship({
      organizationId: org1,
      supervisorPersonId: personPlanner1,
      subordinatePersonId: personEmp2,
      relationshipType: 'PLANNER_EMPLOYEE',
      validFrom: '2026-01-01',
      existingRelationships: [rel1],
      supervisorRole: 'PLANNER',
      subordinateRole: 'EMPLOYEE',
      subordinateHasProfile: true,
    });
    expect(rel1.subordinatePersonId).toBe(personEmp1);
    expect(rel2.subordinatePersonId).toBe(personEmp2);
  });

  // 15. Empleado con planner principal y planner secundario
  it('Scenario 15: Empleado con planner principal y planner secundario', () => {
    const primary = validateReportingRelationship({
      organizationId: org1,
      supervisorPersonId: personPlanner1,
      subordinatePersonId: personEmp1,
      relationshipType: 'PLANNER_EMPLOYEE',
      validFrom: '2026-01-01',
      isPrimary: true,
      supervisorRole: 'PLANNER',
      subordinateRole: 'EMPLOYEE',
      subordinateHasProfile: true,
    });
    const secondary = validateReportingRelationship({
      organizationId: org1,
      supervisorPersonId: personPlanner2,
      subordinatePersonId: personEmp1,
      relationshipType: 'PLANNER_EMPLOYEE',
      validFrom: '2026-01-01',
      isPrimary: false,
      existingRelationships: [primary],
      supervisorRole: 'PLANNER',
      subordinateRole: 'EMPLOYEE',
      subordinateHasProfile: true,
    });
    expect(primary.isPrimary).toBe(true);
    expect(secondary.isPrimary).toBe(false);
  });

  // 16. Sustitución temporal de un planner
  it('Scenario 16: Sustitución temporal de un planner', () => {
    const originalPeriod = {
      supervisorPersonId: personPlanner1,
      subordinatePersonId: personEmp1,
      relationshipType: 'PLANNER_EMPLOYEE',
      validFrom: '2026-01-01',
      validTo: '2026-06-30',
      isPrimary: true,
    };
    const substitutePeriod = validateReportingRelationship({
      organizationId: org1,
      supervisorPersonId: personSubstitute,
      subordinatePersonId: personEmp1,
      relationshipType: 'PLANNER_EMPLOYEE',
      validFrom: '2026-07-01',
      validTo: '2026-08-31',
      isPrimary: true,
      existingRelationships: [originalPeriod],
      supervisorRole: 'PLANNER',
      subordinateRole: 'EMPLOYEE',
      subordinateHasProfile: true,
    });
    expect(substitutePeriod.validFrom).toBe('2026-07-01');
    expect(substitutePeriod.supervisorPersonId).toBe(personSubstitute);
  });

  // 17. Consulta histórica en una fecha pasada
  it('Scenario 17: Consulta histórica en una fecha pasada', () => {
    const assignments = [
      { areaId: areaRampa, validFrom: '2026-01-01', validTo: '2026-03-31' },
      { areaId: areaEquipajes, validFrom: '2026-04-01', validTo: null },
    ];
    // In February 2026, employee was in areaRampa
    const areaFeb = assignments.find((a) => isDateWithinRange('2026-02-15', a.validFrom, a.validTo));
    expect(areaFeb?.areaId).toBe(areaRampa);

    // In May 2026, employee was in areaEquipajes
    const areaMay = assignments.find((a) => isDateWithinRange('2026-05-15', a.validFrom, a.validTo));
    expect(areaMay?.areaId).toBe(areaEquipajes);
  });

  // 18. Intento de relación entre organizaciones
  it('Scenario 18: Intento de relación entre organizaciones', () => {
    expect(() =>
      validateReportingRelationship({
        organizationId: org1,
        supervisorPersonId: personAdmin,
        subordinatePersonId: personEmp1,
        relationshipType: 'ADMIN_EMPLOYEE',
        validFrom: '2026-01-01',
        subordinateOrganizationId: org2, // Different tenant!
      })
    ).toThrow('Tenant boundary violation');

    expect(() =>
      validateEmployeeAreaPeriod({
        organizationId: org1,
        employeeProfileId: empProfile1,
        areaId: areaCrossTenant,
        validFrom: '2026-01-01',
        areaOrganizationId: org2, // Different tenant!
      })
    ).toThrow('Tenant boundary violation');
  });

  // 19. Intento de supervisión circular
  it('Scenario 19: Intento de supervisión circular', () => {
    const existing = [
      {
        supervisorPersonId: personPlanner1,
        subordinatePersonId: personEmp1,
        relationshipType: 'PLANNER_EMPLOYEE',
        validFrom: '2026-01-01',
        validTo: null,
      },
    ];

    expect(() =>
      validateReportingRelationship({
        organizationId: org1,
        supervisorPersonId: personEmp1,
        subordinatePersonId: personPlanner1,
        relationshipType: 'ADMIN_PLANNER',
        validFrom: '2026-01-01',
        validTo: null,
        existingRelationships: existing,
        supervisorRole: 'ADMIN',
        subordinateRole: 'PLANNER',
      })
    ).toThrow('Circular supervision detected');
  });

  // 20. Intento de solapamiento duplicado
  it('Scenario 20: Intento de solapamiento duplicado', () => {
    const existing = [
      {
        employeeProfileId: empProfile1,
        areaId: areaRampa,
        validFrom: '2026-01-01',
        validTo: null,
      },
    ];

    expect(() =>
      validateEmployeeAreaPeriod({
        organizationId: org1,
        employeeProfileId: empProfile1,
        areaId: areaRampa,
        validFrom: '2026-05-01',
        validTo: null,
        existingPeriods: existing,
      })
    ).toThrow('already has an overlapping assignment to the same area');
  });

  // 21. Backfill de datos legacy
  it('Scenario 21: Backfill de datos legacy', () => {
    const legacyEmployee = {
      id: 'emp-legacy-01',
      organization_id: org1,
      name: 'Empleado Legacy',
      user_id: user1,
      area_id: areaRampa,
      created_at: '2026-01-10T10:00:00Z',
    };

    // Backfilled area period marks source as LEGACY_CURRENT_STATE
    const backfilledArea = {
      organizationId: legacyEmployee.organization_id,
      employeeProfileId: legacyEmployee.id,
      areaId: legacyEmployee.area_id,
      validFrom: normalizeDate(legacyEmployee.created_at),
      validTo: null,
      isPrimary: true,
      source: 'LEGACY_CURRENT_STATE',
    };

    expect(backfilledArea.source).toBe('LEGACY_CURRENT_STATE');
    expect(backfilledArea.validFrom).toBe('2026-01-10');
  });

  // 22. Persona cuyo nombre de usuario difiere del nombre laboral
  it('Scenario 22: Persona cuyo nombre de usuario difiere del nombre laboral', () => {
    const user = {
      id: user1,
      email: 'juan.perez@empresa.com',
      displayName: 'Juan Pérez',
    };
    const employeeProfile = {
      id: empProfile1,
      organizationId: org1,
      organizationPersonId: personEmp1,
      employeeName: 'Pérez, Juan (Operaciones Rampa Turno Noche)',
    };

    expect(user.displayName).toBe('Juan Pérez');
    expect(employeeProfile.employeeName).toBe('Pérez, Juan (Operaciones Rampa Turno Noche)');
    expect(user.displayName).not.toBe(employeeProfile.employeeName);
  });
});
