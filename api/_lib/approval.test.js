import { describe, expect, it } from 'vitest';
import { resolveApprovers } from './approval.js';

describe('resolveApprovers', () => {
  it('returns no approvers for NO_APPROVAL', () => {
    expect(resolveApprovers({ areaId: 'area-1' }, 'NO_APPROVAL', {
      areaResponsibleUserIds: ['admin-1'], organizationAdminUserIds: ['admin-2'],
    })).toEqual([]);
  });

  it('routes ORGANIZATION_ADMIN to unique organization admins', () => {
    expect(resolveApprovers({}, 'ORGANIZATION_ADMIN', {
      organizationAdminUserIds: ['admin-1', 'admin-1', 'admin-2'],
    })).toEqual(['admin-1', 'admin-2']);
  });

  it('routes AREA_RESPONSIBLE and falls back to organization admins', () => {
    const candidates = { areaResponsibleUserIds: ['area-admin'], organizationAdminUserIds: ['org-admin'] };
    expect(resolveApprovers({ areaId: 'area-1' }, 'AREA_RESPONSIBLE', candidates)).toEqual(['area-admin']);
    expect(resolveApprovers({ areaId: 'area-1' }, 'AREA_RESPONSIBLE', {
      areaResponsibleUserIds: [], organizationAdminUserIds: ['org-admin'],
    })).toEqual(['org-admin']);
    expect(resolveApprovers({}, 'AREA_RESPONSIBLE', candidates)).toEqual(['org-admin']);
  });
});
