import { describe, expect, it } from 'vitest';
import {
  ROLES,
  SCOPE_TYPES,
  RELATIONSHIP_TYPES,
  normalizeDate,
  isDateWithinRange,
  rangesOverlap,
  getDayBefore,
  dateRangeContains,
  validateRolePeriod,
  validateEmployeeAreaPeriod,
  validateAccessScopePeriod,
  validateReportingRelationship,
  detectSupervisionCycle,
  closePeriod,
  transferOwnershipTemporal,
} from './temporal-org-model.js';

describe('temporal organizational model domain service', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const otherOrgId = '22222222-2222-4222-8222-222222222222';
  const personA = 'aaaa1111-1111-4111-8111-111111111111';
  const personB = 'bbbb2222-2222-4222-8222-222222222222';
  const personC = 'cccc3333-3333-4333-8333-333333333333';
  const area1 = 'area1111-1111-4111-8111-111111111111';
  const area2 = 'area2222-2222-4222-8222-222222222222';
  const empProfileA = 'empa1111-1111-4111-8111-111111111111';

  describe('temporal range utilities', () => {
    it('normalizes ISO dates and rejects invalid inputs', () => {
      expect(normalizeDate('2026-01-15T12:00:00Z')).toBe('2026-01-15');
      expect(normalizeDate('2026-06-30')).toBe('2026-06-30');
      expect(normalizeDate(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
      expect(normalizeDate(null)).toBeNull();
      expect(() => normalizeDate('not-a-date')).toThrow('Invalid date');
    });

    it('evaluates inclusive range containment correctly', () => {
      expect(isDateWithinRange('2026-03-15', '2026-01-01', '2026-06-30')).toBe(true);
      expect(isDateWithinRange('2026-01-01', '2026-01-01', '2026-06-30')).toBe(true);
      expect(isDateWithinRange('2026-06-30', '2026-01-01', '2026-06-30')).toBe(true);
      expect(isDateWithinRange('2026-07-01', '2026-01-01', '2026-06-30')).toBe(false);
      expect(isDateWithinRange('2025-12-31', '2026-01-01', '2026-06-30')).toBe(false);

      // Open-ended upper bound
      expect(isDateWithinRange('2026-10-01', '2026-01-01', null)).toBe(true);
      expect(isDateWithinRange('2025-12-31', '2026-01-01', null)).toBe(false);
    });

    it('detects overlapping ranges and allows non-overlapping adjacent ranges', () => {
      // Adjacent: Jan 1 -> Jun 30 and Jul 1 -> Dec 31 (no overlap)
      expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-07-01', '2026-12-31')).toBe(false);

      // Overlapping on boundary: Jun 30 and Jun 30
      expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-06-30', '2026-12-31')).toBe(true);

      // Overlapping intervals
      expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-03-01', '2026-09-30')).toBe(true);

      // Two open-ended ranges overlap
      expect(rangesOverlap('2026-01-01', null, '2026-04-01', null)).toBe(true);

      // Closed range completely before open range
      expect(rangesOverlap('2025-01-01', '2025-12-31', '2026-01-01', null)).toBe(false);

      // Inverted range throws error
      expect(() => rangesOverlap('2026-06-30', '2026-01-01', '2026-07-01', null)).toThrow('inverted');
    });

    it('closes an open period with closePeriod', () => {
      const open = { validFrom: '2026-01-01', validTo: null };
      const closed = closePeriod(open, '2026-06-30');
      expect(closed.validTo).toBe('2026-06-30');

      // Reject close before start
      expect(() => closePeriod(open, '2025-12-31')).toThrow('cannot be earlier than validFrom');
    });
  });

  describe('role periods validation', () => {
    it('accepts valid role assignments and rejects invalid roles', () => {
      const res = validateRolePeriod({
        organizationId: orgId,
        organizationPersonId: personA,
        role: 'ADMIN',
        validFrom: '2026-01-01',
      });
      expect(res.role).toBe('ADMIN');
      expect(res.validTo).toBeNull();

      expect(() =>
        validateRolePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          role: 'SUPERUSER',
          validFrom: '2026-01-01',
        })
      ).toThrow('Invalid role');
    });

    it('rejects inverted role periods', () => {
      expect(() =>
        validateRolePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          role: 'ADMIN',
          validFrom: '2026-06-30',
          validTo: '2026-01-01',
        })
      ).toThrow('cannot be earlier than validFrom');
    });

    it('rejects overlapping roles for the same person', () => {
      const existing = [
        {
          organizationPersonId: personA,
          role: 'PLANNER',
          validFrom: '2026-01-01',
          validTo: '2026-06-30',
        },
      ];

      // Overlap with existing
      expect(() =>
        validateRolePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          role: 'ADMIN',
          validFrom: '2026-04-01',
          validTo: '2026-12-31',
          existingPeriods: existing,
        })
      ).toThrow('Role period overlaps');

      // Non-overlapping role succeeding the previous one is accepted
      const validSuccession = validateRolePeriod({
        organizationId: orgId,
        organizationPersonId: personA,
        role: 'ADMIN',
        validFrom: '2026-07-01',
        validTo: null,
        existingPeriods: existing,
      });
      expect(validSuccession.role).toBe('ADMIN');
    });

    it('enforces single active OWNER invariant across the organization', () => {
      const existing = [
        {
          organizationPersonId: personA,
          role: 'OWNER',
          validFrom: '2026-01-01',
          validTo: null,
        },
      ];

      expect(() =>
        validateRolePeriod({
          organizationId: orgId,
          organizationPersonId: personB,
          role: 'OWNER',
          validFrom: '2026-03-01',
          existingPeriods: existing,
        })
      ).toThrow('already has an active OWNER');
    });
  });

  describe('employee area periods validation', () => {
    it('enforces tenant boundary between employee and area', () => {
      expect(() =>
        validateEmployeeAreaPeriod({
          organizationId: orgId,
          employeeProfileId: empProfileA,
          areaId: area1,
          validFrom: '2026-01-01',
          areaOrganizationId: otherOrgId, // Cross-tenant!
        })
      ).toThrow('Tenant boundary violation');
    });

    it('permits employee in two distinct areas simultaneously (Scenario 8)', () => {
      const existing = [
        {
          employeeProfileId: empProfileA,
          areaId: area1,
          validFrom: '2026-01-01',
          validTo: null,
          isPrimary: true,
        },
      ];

      // Assigning second area simultaneously without primary flag is ALLOWED
      const res = validateEmployeeAreaPeriod({
        organizationId: orgId,
        employeeProfileId: empProfileA,
        areaId: area2,
        validFrom: '2026-04-01',
        validTo: null,
        isPrimary: false,
        existingPeriods: existing,
      });
      expect(res.areaId).toBe(area2);
      expect(res.isPrimary).toBe(false);
    });

    it('rejects overlapping assignments for the exact SAME area', () => {
      const existing = [
        {
          employeeProfileId: empProfileA,
          areaId: area1,
          validFrom: '2026-01-01',
          validTo: '2026-06-30',
          isPrimary: true,
        },
      ];

      expect(() =>
        validateEmployeeAreaPeriod({
          organizationId: orgId,
          employeeProfileId: empProfileA,
          areaId: area1,
          validFrom: '2026-05-01',
          validTo: null,
          isPrimary: false,
          existingPeriods: existing,
        })
      ).toThrow('already has an overlapping assignment to the same area');
    });

    it('rejects multiple primary areas on overlapping dates', () => {
      const existing = [
        {
          employeeProfileId: empProfileA,
          areaId: area1,
          validFrom: '2026-01-01',
          validTo: null,
          isPrimary: true,
        },
      ];

      expect(() =>
        validateEmployeeAreaPeriod({
          organizationId: orgId,
          employeeProfileId: empProfileA,
          areaId: area2,
          validFrom: '2026-04-01',
          validTo: null,
          isPrimary: true, // Conflict: already has primary area!
          existingPeriods: existing,
        })
      ).toThrow('already has a primary area assigned');
    });

    it('supports employee terminating one area and starting another (Scenario 9)', () => {
      const existing = [
        {
          employeeProfileId: empProfileA,
          areaId: area1,
          validFrom: '2026-01-01',
          validTo: '2026-03-31',
          isPrimary: true,
        },
      ];

      const res = validateEmployeeAreaPeriod({
        organizationId: orgId,
        employeeProfileId: empProfileA,
        areaId: area2,
        validFrom: '2026-04-01',
        validTo: null,
        isPrimary: true,
        existingPeriods: existing,
      });
      expect(res.areaId).toBe(area2);
      expect(res.validFrom).toBe('2026-04-01');
    });
  });

  describe('access scope periods validation', () => {
    it('enforces structural integrity for scope types', () => {
      // ORGANIZATION requires null area and targetPerson
      expect(() =>
        validateAccessScopePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          scopeType: 'ORGANIZATION',
          areaId: area1,
          validFrom: '2026-01-01',
        })
      ).toThrow('ORGANIZATION scope must have both areaId and targetPersonId as null');

      // AREA requires areaId and null targetPerson
      expect(() =>
        validateAccessScopePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          scopeType: 'AREA',
          areaId: null,
          validFrom: '2026-01-01',
        })
      ).toThrow('AREA scope requires areaId');

      // PERSON requires targetPersonId and null areaId
      expect(() =>
        validateAccessScopePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          scopeType: 'PERSON',
          targetPersonId: null,
          validFrom: '2026-01-01',
        })
      ).toThrow('PERSON scope requires targetPersonId');
    });

    it('enforces tenant boundaries for scoped area and person', () => {
      expect(() =>
        validateAccessScopePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          scopeType: 'AREA',
          areaId: area1,
          validFrom: '2026-01-01',
          areaOrganizationId: otherOrgId,
        })
      ).toThrow('Tenant boundary violation');

      expect(() =>
        validateAccessScopePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          scopeType: 'PERSON',
          targetPersonId: personB,
          validFrom: '2026-01-01',
          targetPersonOrganizationId: otherOrgId,
        })
      ).toThrow('Tenant boundary violation');
    });

    it('permits a planner with two distinct areas (Scenario 12)', () => {
      const existing = [
        {
          organizationPersonId: personA,
          scopeType: 'AREA',
          areaId: area1,
          validFrom: '2026-01-01',
          validTo: null,
        },
      ];

      const res = validateAccessScopePeriod({
        organizationId: orgId,
        organizationPersonId: personA,
        scopeType: 'AREA',
        areaId: area2,
        validFrom: '2026-01-01',
        validTo: null,
        existingPeriods: existing,
      });
      expect(res.areaId).toBe(area2);
    });

    it('rejects duplicate overlapping scopes for the same target', () => {
      const existing = [
        {
          organizationPersonId: personA,
          scopeType: 'AREA',
          areaId: area1,
          validFrom: '2026-01-01',
          validTo: null,
        },
      ];

      expect(() =>
        validateAccessScopePeriod({
          organizationId: orgId,
          organizationPersonId: personA,
          scopeType: 'AREA',
          areaId: area1,
          validFrom: '2026-04-01',
          validTo: null,
          existingPeriods: existing,
        })
      ).toThrow('Duplicate or overlapping access scope detected');
    });
  });

  describe('reporting relationships and cycle detection', () => {
    it('forbids self-supervision', () => {
      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personA,
          subordinatePersonId: personA,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2026-01-01',
        })
      ).toThrow('Self-supervision forbidden');
    });

    it('enforces cross-tenant boundaries for supervision (Scenario 18)', () => {
      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personA,
          subordinatePersonId: personB,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2026-01-01',
          subordinateOrganizationId: otherOrgId,
        })
      ).toThrow('Tenant boundary violation');
    });

    it('detects direct circular supervision A -> B -> A (Scenario 19)', () => {
      const existing = [
        {
          supervisorPersonId: personA,
          subordinatePersonId: personB,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2026-01-01',
          validTo: null,
        },
      ];

      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personB,
          subordinatePersonId: personA,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2026-01-01',
          validTo: null,
          existingRelationships: existing,
          supervisorRole: 'ADMIN',
          subordinateRole: 'PLANNER',
        })
      ).toThrow('Circular supervision detected');
    });

    it('detects transitive circular supervision A -> B -> C -> A', () => {
      const existing = [
        {
          supervisorPersonId: personA,
          subordinatePersonId: personB,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2026-01-01',
          validTo: null,
        },
        {
          supervisorPersonId: personB,
          subordinatePersonId: personC,
          relationshipType: 'PLANNER_EMPLOYEE',
          validFrom: '2026-01-01',
          validTo: null,
        },
      ];

      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personC,
          subordinatePersonId: personA,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2026-01-01',
          validTo: null,
          existingRelationships: existing,
          supervisorRole: 'ADMIN',
          subordinateRole: 'PLANNER',
        })
      ).toThrow('Circular supervision detected');
    });

    it('allows reciprocal supervision in disjoint temporal intervals (no cycle)', () => {
      const existing = [
        {
          supervisorPersonId: personA,
          subordinatePersonId: personB,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2025-01-01',
          validTo: '2025-12-31',
        },
      ];

      // B supervises A in 2026 (disjoint from 2025): perfectly valid
      const res = validateReportingRelationship({
        organizationId: orgId,
        supervisorPersonId: personB,
        subordinatePersonId: personA,
        relationshipType: 'ADMIN_PLANNER',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        existingRelationships: existing,
        supervisorRole: 'ADMIN',
        subordinateRole: 'PLANNER',
      });
      expect(res.supervisorPersonId).toBe(personB);
      expect(res.subordinatePersonId).toBe(personA);
    });

    it('allows an employee with primary and secondary planners (Scenario 15)', () => {
      const existing = [
        {
          supervisorPersonId: personA, // Planner 1
          subordinatePersonId: personC, // Employee
          relationshipType: 'PLANNER_EMPLOYEE',
          validFrom: '2026-01-01',
          validTo: null,
          isPrimary: true,
        },
      ];

      // Second planner as non-primary is allowed
      const res = validateReportingRelationship({
        organizationId: orgId,
        supervisorPersonId: personB, // Planner 2
        subordinatePersonId: personC, // Employee
        relationshipType: 'PLANNER_EMPLOYEE',
        validFrom: '2026-01-01',
        validTo: null,
        isPrimary: false,
        existingRelationships: existing,
        supervisorRole: 'PLANNER',
        subordinateRole: 'EMPLOYEE',
        subordinateHasProfile: true,
      });
      expect(res.isPrimary).toBe(false);
      expect(res.supervisorPersonId).toBe(personB);

      // Attempting to make second planner ALSO primary fails
      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personB,
          subordinatePersonId: personC,
          relationshipType: 'PLANNER_EMPLOYEE',
          validFrom: '2026-01-01',
          validTo: null,
          isPrimary: true,
          existingRelationships: existing,
          supervisorRole: 'PLANNER',
          subordinateRole: 'EMPLOYEE',
          subordinateHasProfile: true,
        })
      ).toThrow('Subordinate already has a primary supervisor');
    });

    it('supports temporary planner substitution (Scenario 16)', () => {
      const existing = [
        {
          supervisorPersonId: personA,
          subordinatePersonId: personC,
          relationshipType: 'PLANNER_EMPLOYEE',
          validFrom: '2026-01-01',
          validTo: '2026-06-30', // Leave starts July 1
          isPrimary: true,
        },
      ];

      // Substitute planner takes over July 1 to August 31
      const sub = validateReportingRelationship({
        organizationId: orgId,
        supervisorPersonId: personB,
        subordinatePersonId: personC,
        relationshipType: 'PLANNER_EMPLOYEE',
        validFrom: '2026-07-01',
        validTo: '2026-08-31',
        isPrimary: true,
        existingRelationships: existing,
        supervisorRole: 'PLANNER',
        subordinateRole: 'EMPLOYEE',
        subordinateHasProfile: true,
      });
      expect(sub.supervisorPersonId).toBe(personB);
      expect(sub.validFrom).toBe('2026-07-01');
      expect(sub.validTo).toBe('2026-08-31');
    });

    it('validates role compatibility and subordinate profile for supervision types', () => {
      // Non-admin supervisor for ADMIN_PLANNER fails
      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personA,
          subordinatePersonId: personB,
          relationshipType: 'ADMIN_PLANNER',
          validFrom: '2026-01-01',
          supervisorRole: 'EMPLOYEE',
          subordinateRole: 'PLANNER',
        })
      ).toThrow('Incompatible supervisor role');

      // Missing subordinateHasProfile for PLANNER_EMPLOYEE fails
      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personA,
          subordinatePersonId: personB,
          relationshipType: 'PLANNER_EMPLOYEE',
          validFrom: '2026-01-01',
          supervisorRole: 'PLANNER',
          subordinateRole: 'EMPLOYEE',
          subordinateHasProfile: false,
        })
      ).toThrow('Subordinate person must have an active employee profile');

      // Non-planner supervisor for PLANNER_EMPLOYEE fails
      expect(() =>
        validateReportingRelationship({
          organizationId: orgId,
          supervisorPersonId: personA,
          subordinatePersonId: personB,
          relationshipType: 'PLANNER_EMPLOYEE',
          validFrom: '2026-01-01',
          supervisorRole: 'EMPLOYEE',
          subordinateRole: 'EMPLOYEE',
          subordinateHasProfile: true,
        })
      ).toThrow('Incompatible supervisor role for PLANNER_EMPLOYEE');
    });
  });

  describe('getDayBefore utility', () => {
    it('calculates the previous calendar day correctly across month and year boundaries', () => {
      expect(getDayBefore('2026-06-01')).toBe('2026-05-31');
      expect(getDayBefore('2026-03-01')).toBe('2026-02-28');
      expect(getDayBefore('2026-01-01')).toBe('2025-12-31');
    });
  });

  describe('dateRangeContains utility', () => {
    it('checks full containment correctly for open and closed ranges', () => {
      // Role 1 to 31 Jan, relation whole 2026: false
      expect(dateRangeContains('2026-01-01', '2026-01-31', '2026-01-01', '2026-12-31')).toBe(false);
      // Role open from 1 Jan, relation from Feb without end: true
      expect(dateRangeContains('2026-01-01', null, '2026-02-01', null)).toBe(true);
      // Role ended, relation later: false
      expect(dateRangeContains('2026-01-01', '2026-05-31', '2026-06-01', '2026-12-31')).toBe(false);
      // Role open from 1 Jan, relation within 2026: true
      expect(dateRangeContains('2026-01-01', null, '2026-03-01', '2026-08-31')).toBe(true);
    });
  });

  describe('transferOwnershipTemporal domain helper', () => {
    it('rejects if sql client is not provided', async () => {
      await expect(
        transferOwnershipTemporal(null, {
          organizationId: orgId,
          newOwnerPersonId: personB,
          effectiveDate: '2026-07-01',
        })
      ).rejects.toThrow('sql client is required');
    });

    it('rejects future-dated transfers without automated scheduler', async () => {
      const fakeSql = async () => [];
      await expect(
        transferOwnershipTemporal(fakeSql, {
          organizationId: orgId,
          newOwnerPersonId: personB,
          effectiveDate: '2099-01-01',
        })
      ).rejects.toThrow('Future-dated ownership transfers are not allowed without an automated scheduler');
    });

    it('propagates database error when target person has no user_id', async () => {
      const fakeSql = async (strings, ...values) => {
        const text = strings.join('?');
        if (text.includes('transfer_organization_ownership_temporal')) {
          throw new Error('New owner must have an associated user_id');
        }
        return [];
      };

      await expect(
        transferOwnershipTemporal(fakeSql, {
          organizationId: orgId,
          newOwnerPersonId: personB,
          effectiveDate: '2026-07-01',
        })
      ).rejects.toThrow('New owner must have an associated user_id');
    });

    it('propagates database error when target person is not in ACTIVE status', async () => {
      const fakeSql = async (strings, ...values) => {
        const text = strings.join('?');
        if (text.includes('transfer_organization_ownership_temporal')) {
          throw new Error('New owner must be in ACTIVE status');
        }
        return [];
      };

      await expect(
        transferOwnershipTemporal(fakeSql, {
          organizationId: orgId,
          newOwnerPersonId: personB,
          effectiveDate: '2026-07-01',
        })
      ).rejects.toThrow('New owner must be in ACTIVE status');
    });

    it('propagates database error when target person has no existing membership', async () => {
      const fakeSql = async (strings, ...values) => {
        const text = strings.join('?');
        if (text.includes('transfer_organization_ownership_temporal')) {
          throw new Error('New owner must have an existing membership in the organization');
        }
        return [];
      };

      await expect(
        transferOwnershipTemporal(fakeSql, {
          organizationId: orgId,
          newOwnerPersonId: personB,
          effectiveDate: '2026-07-01',
        })
      ).rejects.toThrow('New owner must have an existing membership in the organization');
    });

    it('propagates database error when incompatible future role periods exist', async () => {
      const fakeSql = async (strings, ...values) => {
        const text = strings.join('?');
        if (text.includes('transfer_organization_ownership_temporal')) {
          throw new Error('Ownership transfer conflict: Incompatible future role periods exist on or after effective date');
        }
        return [];
      };

      await expect(
        transferOwnershipTemporal(fakeSql, {
          organizationId: orgId,
          newOwnerPersonId: personB,
          effectiveDate: '2026-07-01',
        })
      ).rejects.toThrow('Ownership transfer conflict: Incompatible future role periods exist');
    });

    it('executes single stored function call compatible with neon() and returns transfer result', async () => {
      const executedCalls = [];
      const fakeSql = async (strings, ...values) => {
        const text = strings.join('?');
        executedCalls.push({ text, values });

        if (text.includes('transfer_organization_ownership_temporal')) {
          return [{
            transferred: true,
            organization_id: orgId,
            previous_owner_person_id: personA,
            new_owner_person_id: personB,
            effective_date: '2026-07-01',
            previous_owner_role: 'ADMIN',
          }];
        }
        return [];
      };

      const result = await transferOwnershipTemporal(fakeSql, {
        organizationId: orgId,
        currentOwnerPersonId: personA,
        newOwnerPersonId: personB,
        effectiveDate: '2026-07-01',
        newPreviousOwnerRole: 'ADMIN',
      });

      expect(result.transferred).toBe(true);
      expect(result.previousOwnerPersonId).toBe(personA);
      expect(result.newOwnerPersonId).toBe(personB);
      expect(result.effectiveDate).toBe('2026-07-01');
      expect(result.previousOwnerRole).toBe('ADMIN');

      // Verify single call to transfer_organization_ownership_temporal
      expect(executedCalls.length).toBe(1);
      expect(executedCalls[0].text).toContain('transfer_organization_ownership_temporal');
      expect(executedCalls[0].values).toContain(orgId);
      expect(executedCalls[0].values).toContain(personB);
      expect(executedCalls[0].values).toContain('2026-07-01');
      expect(executedCalls[0].values).toContain('ADMIN');
      expect(executedCalls[0].values).toContain(personA);
    });

    it('propagates database error when target is same as current owner', async () => {
      const fakeSql = async (strings, ...values) => {
        const text = strings.join('?');
        if (text.includes('transfer_organization_ownership_temporal')) {
          throw new Error('Target owner cannot be the same as current owner');
        }
        return [];
      };

      await expect(
        transferOwnershipTemporal(fakeSql, {
          organizationId: orgId,
          newOwnerPersonId: personA,
          effectiveDate: '2026-07-01',
        })
      ).rejects.toThrow('Target owner cannot be the same as current owner');
    });
  });
});
