import { describe, expect, it } from 'vitest';
import { listEmployees, listImports, listShifts, upsertShifts } from './data.js';

const ORG = 'org-scope';
const AREA_A = 'area-a';
const AREA_B = 'area-b';
const EMP_A = 'employee-a';
const EMP_B = 'employee-b';
const IMPORT_A = '11111111-1111-4111-8111-111111111111';
const SHIFT_A = '22222222-2222-4222-8222-222222222222';

const employees = [
  { id: EMP_A, organization_id: ORG, area_id: AREA_A, user_id: 'planner', status: 'active', name: 'Area A' },
  { id: EMP_B, organization_id: ORG, area_id: AREA_B, user_id: 'other', status: 'active', name: 'Area B' },
];

const imports = [{
  id: IMPORT_A,
  organization_id: ORG,
  employee_id: EMP_A,
  area_id: AREA_A,
  imported_by_user_id: 'planner',
  imported_by_user_name: 'Planner',
  file_name: 'area-a.pdf',
  source_format: 'pdf',
  period_year: 2026,
  period_month: 8,
  status: 'completed',
  created_at: new Date().toISOString(),
}];

const shifts = [{
  id: SHIFT_A,
  organization_id: ORG,
  employee_id: EMP_A,
  import_id: IMPORT_A,
  area_id: AREA_A,
  date: '2026-09-04',
  start_time: '09:00',
  end_time: '17:00',
  location: 'Area A',
  origin: 'IMP',
}];

function makeScopeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.startsWith('SELECT id, status FROM employees')) {
      return Promise.resolve(employees.filter((row) => row.id === values[0] && row.organization_id === values[1]));
    }
    if (text.startsWith('SELECT area_id FROM employees')) {
      return Promise.resolve(employees.filter((row) => row.id === values[0] && row.organization_id === values[1]).map((row) => ({ area_id: row.area_id })));
    }
    if (text.includes('FROM employees')) {
      const orgRows = employees.filter((row) => row.organization_id === values[0]);
      return Promise.resolve(text.includes('area_id = ?')
        ? orgRows.filter((row) => row.area_id === values[1])
        : text.includes('id = ?')
          ? orgRows.filter((row) => row.id === values[1])
          : orgRows);
    }
    if (text.includes('FROM imports')) {
      const orgRows = imports.filter((row) => row.organization_id === values[0]);
      const filtered = text.includes('i.area_id = ?')
        ? orgRows.filter((row) => row.area_id === values[1])
        : text.includes('i.employee_id = ?')
          ? orgRows.filter((row) => row.employee_id === values[1])
          : orgRows;
      return Promise.resolve(filtered);
    }
    if (text.includes('FROM shifts')) {
      const orgRows = shifts.filter((row) => row.organization_id === values[0]);
      const filtered = text.includes('employee_id = ?')
        ? orgRows.filter((row) => row.employee_id === values[1])
        : text.includes('area_id = ?')
          ? orgRows.filter((row) => row.area_id === values[1])
          : orgRows;
      return Promise.resolve(filtered);
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}

const planner = {
  user: { id: 'planner' }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA_A, employeeId: null,
};
const employee = {
  user: { id: 'planner' }, organizationId: ORG, role: 'EMPLOYEE', scopedAreaId: null, employeeId: EMP_A,
};

describe('scope enforcement across employee/import/shift data access', () => {
  it('limits an AREA planner to the assigned area across all three resources', async () => {
    const sql = makeScopeSql();
    const listedEmployees = await listEmployees(sql, planner);
    const listedImports = await listImports(sql, planner);
    const listedShifts = await listShifts(sql, planner, '');

    expect(listedEmployees.map((row) => row.id)).toEqual([EMP_A]);
    expect(listedImports.imports.map((row) => row.id)).toEqual([IMPORT_A]);
    expect(listedShifts.map((row) => row.id)).toEqual([SHIFT_A]);
  });

  it('rejects an AREA planner query or write outside the assigned area', async () => {
    const sql = makeScopeSql();
    await expect(listEmployees(sql, planner, { areaId: AREA_B }))
      .rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    await expect(upsertShifts(sql, planner, [{
      employeeId: EMP_B,
      date: '2026-09-05',
      startTime: '09:00',
      endTime: '17:00',
      location: 'Area B',
      origin: 'MAN',
    }])).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
  });

  it('limits an EMPLOYEE to the linked employee across all three resources', async () => {
    const sql = makeScopeSql();
    const listedEmployees = await listEmployees(sql, employee);
    const listedImports = await listImports(sql, employee);
    const listedShifts = await listShifts(sql, employee, EMP_B);

    expect(listedEmployees.map((row) => row.id)).toEqual([EMP_A]);
    expect(listedImports.imports.map((row) => row.id)).toEqual([IMPORT_A]);
    expect(listedShifts.map((row) => row.employeeId)).toEqual([EMP_A]);
  });
});
