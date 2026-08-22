import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as remote from './remote';
import { RemoteEmployee } from './remote';
import { resolveInactiveEmployeeMatch } from './inactive-employee';

vi.mock('./remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./remote')>();
  return { ...actual, updateRemoteEmployee: vi.fn() };
});

const mockedUpdateRemoteEmployee = vi.mocked(remote.updateRemoteEmployee);

beforeEach(() => {
  vi.clearAllMocks();
});

const inactiveEmployee = (over: Partial<RemoteEmployee> = {}): RemoteEmployee => ({
  id: 'emp-1',
  organizationId: 'org-1',
  externalEmployeeId: '1001',
  name: 'Ana Martinez',
  userId: null,
  status: 'inactive',
  ...over,
});

describe('resolveInactiveEmployeeMatch (Bloque E)', () => {
  it('ADMIN + confirm: reactivates via PATCH status active and returns the updated employee', async () => {
    const reactivated = inactiveEmployee({ status: 'active' });
    mockedUpdateRemoteEmployee.mockResolvedValue(reactivated);

    const result = await resolveInactiveEmployeeMatch({
      employee: inactiveEmployee(),
      role: 'ADMIN',
      confirmReactivate: () => true,
    });

    expect(mockedUpdateRemoteEmployee).toHaveBeenCalledTimes(1);
    expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({ id: 'emp-1', status: 'active' });
    expect(result).toEqual({ kind: 'reactivated', employee: reactivated });
  });

  it('ADMIN + decline: keeps the employee inactive, never PATCHes', async () => {
    const result = await resolveInactiveEmployeeMatch({
      employee: inactiveEmployee(),
      role: 'ADMIN',
      confirmReactivate: () => false,
    });

    expect(result).toEqual({ kind: 'kept_inactive' });
    expect(mockedUpdateRemoteEmployee).not.toHaveBeenCalled();
  });

  it.each(['EMPLOYEE', null] as const)('role %s: blocked without ever calling update', async (role) => {
    const confirmReactivate = vi.fn(() => true);
    const result = await resolveInactiveEmployeeMatch({
      employee: inactiveEmployee(),
      role,
      confirmReactivate,
    });

    expect(result).toEqual({ kind: 'not_admin' });
    expect(confirmReactivate).not.toHaveBeenCalled();
    expect(mockedUpdateRemoteEmployee).not.toHaveBeenCalled();
  });
});
