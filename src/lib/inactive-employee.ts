import { RemoteEmployee, updateRemoteEmployee } from './remote';
import { Role } from './session';

export type InactiveMatchResolution =
  | { kind: 'reactivated'; employee: RemoteEmployee }
  | { kind: 'kept_inactive' }
  | { kind: 'not_admin' };

/**
 * Bloque E: an import match against an inactive employee is never silently
 * reactivated and never duplicated. Only an ADMIN may reactivate, and only
 * after an explicit confirmation; any other outcome aborts the import for
 * that employee (the caller surfaces the message).
 */
export async function resolveInactiveEmployeeMatch(input: {
  employee: RemoteEmployee;
  role: Role | null;
  confirmReactivate: () => boolean;
}): Promise<InactiveMatchResolution> {
  if (input.role !== 'ADMIN') {
    return { kind: 'not_admin' };
  }
  if (!input.confirmReactivate()) {
    return { kind: 'kept_inactive' };
  }
  const employee = await updateRemoteEmployee({ id: input.employee.id, status: 'active' });
  return { kind: 'reactivated', employee };
}
