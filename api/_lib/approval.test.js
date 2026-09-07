import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireApprovalAdmin, resolveApprovers } from './approval.js';

const context = (role) => ({
  organizationId: 'org-1',
  role,
  user: { id: 'user-1' },
});

describe('resolveApprovers', () => {
  it('routes NO_APPROVAL and ORGANIZATION_ADMIN to unique organization admins', () => {
    expect(resolveApprovers({ areaId: 'area-1' }, 'NO_APPROVAL', {
      areaResponsibleUserIds: ['admin-1'], organizationAdminUserIds: ['admin-2'],
    })).toEqual(['admin-2']);

    expect(resolveApprovers({}, 'ORGANIZATION_ADMIN', {
      organizationAdminUserIds: ['admin-1', 'admin-1', 'admin-2'],
    })).toEqual(['admin-1', 'admin-2']);
  });

  it('filters out employee user id from approver list to prevent self-approval', () => {
    expect(resolveApprovers({ areaId: 'area-1' }, 'ORGANIZATION_ADMIN', {
      organizationAdminUserIds: ['user-1', 'admin-2'],
      employeeUserId: 'user-1',
    })).toEqual(['admin-2']);
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

describe('requireApprovalAdmin', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each(['OWNER', 'ADMIN'])('allows %s at organization scope', (role) => {
    expect(() => requireApprovalAdmin(context(role), 'test-endpoint')).not.toThrow();
  });

  it.each(['PLANNER', 'EMPLOYEE'])('rejects %s and records the denial', (role) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(() => requireApprovalAdmin(context(role), 'test-endpoint')).toThrow('Insufficient role');
    expect(info).toHaveBeenCalledWith('[approval] authorization denied', expect.objectContaining({
      role,
      reason: 'role_insufficient',
    }));
  });
});
