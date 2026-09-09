import { describe, expect, it } from 'vitest';
import { classifyUserRow } from './classify-user-row';
import { RemoteEmployee, RemoteMember } from './remote';
import { UserCsvRow } from './bulk-import-csv';

function makeRow(overrides: Partial<UserCsvRow> = {}): UserCsvRow {
  return {
    email: 'nueva@empresa.test',
    name: 'Nueva Persona',
    role: 'EMPLOYEE',
    externalEmployeeId: '',
    ...overrides,
  };
}

function makeEmployee(overrides: Partial<RemoteEmployee> = {}): RemoteEmployee {
  return {
    id: 'emp-1',
    organizationId: 'org-1',
    externalEmployeeId: '1001',
    name: 'Empleado Uno',
    userId: null,
    status: 'active',
    ...overrides,
  };
}

function makeMember(overrides: Partial<RemoteMember> = {}): RemoteMember {
  return {
    userId: 'user-1',
    email: 'existente@empresa.test',
    displayName: 'Persona Existente',
    role: 'EMPLOYEE',
    ...overrides,
  };
}

describe('classifyUserRow', () => {
  // UXR-F2-M05 AC-1: a brand-new email with no external_employee_id must be
  // distinguishable from "already a member" — the summary bucket depends on it.
  it('AC-1: classifies a new email without external id as "new, unlinked" — never as already a member', () => {
    const seenEmails = new Map<string, number>();
    const seenIds = new Map<string, number>();
    const result = classifyUserRow(makeRow({ email: 'nueva@empresa.test', externalEmployeeId: '' }), 0, seenEmails, seenIds, [], []);
    expect(result.status).toBe('new_no_employee');
    expect(result.status).not.toBe('no_employee');
  });

  it('classifies an existing member with a matching employee link as existing_and_link', () => {
    const employees = [makeEmployee({ externalEmployeeId: '1001', userId: null })];
    const members: RemoteMember[] = [makeMember({ email: 'existente@empresa.test' })];
    const result = classifyUserRow(
      makeRow({ email: 'existente@empresa.test', externalEmployeeId: '1001' }),
      0,
      new Map(),
      new Map(),
      members,
      employees,
    );
    expect(result.status).toBe('existing_and_link');
  });

  it('classifies an existing member without any employee link as no_employee (existing, not new)', () => {
    const members: RemoteMember[] = [makeMember({ email: 'existente@empresa.test' })];
    const result = classifyUserRow(
      makeRow({ email: 'existente@empresa.test', externalEmployeeId: '' }),
      0,
      new Map(),
      new Map(),
      members,
      [],
    );
    expect(result.status).toBe('no_employee');
  });

  // UXR-F2-M05 AC-2: two rows claiming the same new external_employee_id in
  // the same file must not both silently resolve as independent "new" rows.
  it('AC-2: the second of two rows with the same new external_employee_id is flagged as a duplicate, referencing the first', () => {
    const employees = [makeEmployee({ id: 'emp-1', externalEmployeeId: '2002', userId: null })];
    const seenEmails = new Map<string, number>();
    const seenIds = new Map<string, number>();

    const first = classifyUserRow(
      makeRow({ email: 'primero@empresa.test', externalEmployeeId: '2002' }),
      0,
      seenEmails,
      seenIds,
      [],
      employees,
    );
    expect(first.status).toBe('new_and_link');

    const second = classifyUserRow(
      makeRow({ email: 'segundo@empresa.test', externalEmployeeId: '2002' }),
      1,
      seenEmails,
      seenIds,
      [],
      employees,
    );
    expect(second.status).toBe('duplicate_employee_id_in_file');
    expect(second.duplicateOfIndex).toBe(0);
  });

  it('does not flag two rows with different external ids, or two rows that both omit it', () => {
    const seenEmails = new Map<string, number>();
    const seenIds = new Map<string, number>();
    classifyUserRow(makeRow({ email: 'a@empresa.test', externalEmployeeId: '' }), 0, seenEmails, seenIds, [], []);
    const second = classifyUserRow(makeRow({ email: 'b@empresa.test', externalEmployeeId: '' }), 1, seenEmails, seenIds, [], []);
    expect(second.status).toBe('new_no_employee');
  });

  it('still flags a repeated email as duplicate_in_file, unaffected by the id tracking', () => {
    const seenEmails = new Map<string, number>();
    const seenIds = new Map<string, number>();
    classifyUserRow(makeRow({ email: 'dup@empresa.test' }), 0, seenEmails, seenIds, [], []);
    const second = classifyUserRow(makeRow({ email: 'dup@empresa.test' }), 1, seenEmails, seenIds, [], []);
    expect(second.status).toBe('duplicate_in_file');
    expect(second.duplicateOfIndex).toBe(0);
  });

  it('invalid email and invalid role are still caught before any duplicate/link resolution', () => {
    expect(classifyUserRow(makeRow({ email: '' }), 0, new Map(), new Map(), [], []).status).toBe('invalid_email');
    expect(classifyUserRow(makeRow({ role: '' }), 0, new Map(), new Map(), [], []).status).toBe('invalid_role');
  });

  it('external id that matches no employee is employee_not_found, not silently new', () => {
    const result = classifyUserRow(
      makeRow({ email: 'x@empresa.test', externalEmployeeId: '9999' }),
      0,
      new Map(),
      new Map(),
      [],
      [makeEmployee({ externalEmployeeId: '1001' })],
    );
    expect(result.status).toBe('employee_not_found');
  });
});
