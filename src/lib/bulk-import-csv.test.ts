import { describe, expect, it } from 'vitest';
import { parseEmployeesCsv, parseUsersCsv } from './bulk-import-csv';

describe('parseEmployeesCsv', () => {
  it('parses the minimal canonical format', () => {
    const csv = 'external_employee_id,name\nSI120001,Adriana Molina Serra\nSI120002,Andrés Costa Ferrer';
    const rows = parseEmployeesCsv(csv);
    expect(rows).toEqual([
      { externalEmployeeId: 'SI120001', name: 'Adriana Molina Serra' },
      { externalEmployeeId: 'SI120002', name: 'Andrés Costa Ferrer' },
    ]);
  });

  it('tolerates and ignores extra columns', () => {
    const csv = 'external_employee_id,name,department\nSI1,Ana,Sales';
    const rows = parseEmployeesCsv(csv);
    expect(rows).toEqual([{ externalEmployeeId: 'SI1', name: 'Ana' }]);
  });

  it('returns null when required columns are missing', () => {
    expect(parseEmployeesCsv('name\nAna')).toBeNull();
    expect(parseEmployeesCsv('external_employee_id\nSI1')).toBeNull();
  });

  it('returns null for an unparseable/quoted file', () => {
    expect(parseEmployeesCsv('not,a,valid\ntable"with,quotes')).toBeNull();
  });
});

describe('parseUsersCsv', () => {
  it('parses the full format with role validation', () => {
    const csv = 'email,name,role,external_employee_id\n'
      + 'persona1@example.com,Adriana Molina,EMPLOYEE,SI120001\n'
      + 'manager@example.com,Laura Riera,MANAGER,';
    const rows = parseUsersCsv(csv);
    expect(rows).toEqual([
      { email: 'persona1@example.com', name: 'Adriana Molina', role: 'EMPLOYEE', externalEmployeeId: 'SI120001', rowError: undefined },
      { email: 'manager@example.com', name: 'Laura Riera', role: 'MANAGER', externalEmployeeId: '', rowError: undefined },
    ]);
  });

  it('flags missing email and invalid role as row errors instead of silently coercing', () => {
    const csv = 'email,role\n,EMPLOYEE\nsomeone@example.com,SUPERADMIN';
    const rows = parseUsersCsv(csv);
    expect(rows?.[0].rowError).toBe('missingEmail');
    expect(rows?.[1].rowError).toBe('invalidRole');
    expect(rows?.[1].role).toBe('');
  });

  it('normalizes email to lowercase and role to uppercase', () => {
    const csv = 'email,role\nSomeone@Example.com,employee';
    const rows = parseUsersCsv(csv);
    expect(rows?.[0].email).toBe('someone@example.com');
    expect(rows?.[0].role).toBe('EMPLOYEE');
  });

  it('returns null when email/role columns are missing', () => {
    expect(parseUsersCsv('name\nAna')).toBeNull();
  });
});
