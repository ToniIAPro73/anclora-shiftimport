import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireApprovalAdmin, resolveApprovers } from './approval.js';

const context = (role) => ({
  organizationId: 'org-1',
  role,
  user: { id: 'user-1' },
});

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
