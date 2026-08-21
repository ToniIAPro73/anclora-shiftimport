import { readFileSync } from 'node:fs';
import path from 'node:path';
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

  describe('hardening (real-world repro cases)', () => {
    it('Case 1: UTF-8 without BOM imports', () => {
      const csv = 'external_employee_id,name\n38248,Roberto Jaime';
      expect(parseEmployeesCsv(csv)).toEqual([{ externalEmployeeId: '38248', name: 'Roberto Jaime' }]);
    });

    it('Case 2: UTF-8 with BOM imports identically to the no-BOM version', () => {
      const csv = '\uFEFFexternal_employee_id,name\n38248,Roberto Jaime';
      expect(parseEmployeesCsv(csv)).toEqual([{ externalEmployeeId: '38248', name: 'Roberto Jaime' }]);
    });

    it('Case 3: a quoted name with an embedded comma stays one field, never splits into two columns', () => {
      const csv = 'external_employee_id,name\n30394,"Casero Bosquet, Ana Maria"';
      expect(parseEmployeesCsv(csv)).toEqual([{ externalEmployeeId: '30394', name: 'Casero Bosquet, Ana Maria' }]);
    });

    it('Case 4: CRLF line endings import', () => {
      const csv = 'external_employee_id,name\r\n38248,"Bosch Noguera, Roberto Jaime"\r\n85919,Joan Cerda';
      expect(parseEmployeesCsv(csv)).toEqual([
        { externalEmployeeId: '38248', name: 'Bosch Noguera, Roberto Jaime' },
        { externalEmployeeId: '85919', name: 'Joan Cerda' },
      ]);
    });

    it('Case 5: LF line endings import', () => {
      const csv = 'external_employee_id,name\n38248,Roberto Jaime\n85919,Joan Cerda';
      expect(parseEmployeesCsv(csv)).toEqual([
        { externalEmployeeId: '38248', name: 'Roberto Jaime' },
        { externalEmployeeId: '85919', name: 'Joan Cerda' },
      ]);
    });

    it('Case 6: a wrong/unrecognized header fails explicitly (null), never silently accepted', () => {
      expect(parseEmployeesCsv('id,full_name\n38248,Roberto Jaime')).toBeNull();
    });

    it('Case 7: duplicate external_employee_id rows are both returned by the parser — dedup policy lives in the caller', () => {
      const csv = 'external_employee_id,name\n38248,Roberto Jaime\n38248,Roberto Jaime Duplicate';
      expect(parseEmployeesCsv(csv)).toEqual([
        { externalEmployeeId: '38248', name: 'Roberto Jaime' },
        { externalEmployeeId: '38248', name: 'Roberto Jaime Duplicate' },
      ]);
    });

    it('semicolon-delimited CSV imports (Spanish/German/French Excel default export)', () => {
      const csv = 'external_employee_id;name\n38248;Roberto Jaime\n85919;Joan Cerda';
      expect(parseEmployeesCsv(csv)).toEqual([
        { externalEmployeeId: '38248', name: 'Roberto Jaime' },
        { externalEmployeeId: '85919', name: 'Joan Cerda' },
      ]);
    });

    it('semicolon-delimited CSV with a quoted comma-name still keeps the comma inside the field', () => {
      const csv = 'external_employee_id;name\n30394;"Casero Bosquet, Ana Maria"';
      expect(parseEmployeesCsv(csv)).toEqual([{ externalEmployeeId: '30394', name: 'Casero Bosquet, Ana Maria' }]);
    });

    it('Case 8: a realistic multi-row file with quoted comma-names and BOM imports every row', () => {
      const csv = '\uFEFFexternal_employee_id,name\n'
        + '38248,"Bosch Noguera, Roberto Jaime"\n'
        + '85919,"Cerda Cerda, Joan"\n'
        + '89622,"Garau Femenia, Maria Mercedes"\n'
        + '30394,"Casero Bosquet, Ana Maria"';
      expect(parseEmployeesCsv(csv)).toEqual([
        { externalEmployeeId: '38248', name: 'Bosch Noguera, Roberto Jaime' },
        { externalEmployeeId: '85919', name: 'Cerda Cerda, Joan' },
        { externalEmployeeId: '89622', name: 'Garau Femenia, Maria Mercedes' },
        { externalEmployeeId: '30394', name: 'Casero Bosquet, Ana Maria' },
      ]);
    });
  });

  describe('P0.3: 58-employee file (synthetic — same structure as the real preload file: quoted "Apellidos, Nombre" names, no BOM)', () => {
    it('imports exactly 58 rows, all with a non-empty id and name, no unexpected duplicates', () => {
      const csv = readFileSync(
        path.join(__dirname, 'fixtures', 'synthetic-58-employees.csv'),
        'utf-8',
      );
      const rows = parseEmployeesCsv(csv);
      expect(rows).not.toBeNull();
      expect(rows).toHaveLength(58);
      rows!.forEach((row) => {
        expect(row.externalEmployeeId).not.toBe('');
        expect(row.name).not.toBe('');
      });
      const ids = rows!.map((row) => row.externalEmployeeId);
      expect(new Set(ids).size).toBe(58);
    });
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
