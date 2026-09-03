import { describe, expect, it } from 'vitest';
import {
  bulkCreateEmployees,
  createEmployee,
  createImport,
  listEmployees,
  listImports,
  listShifts,
  updateEmployee,
  upsertShifts,
} from './data.js';

/**
 * Areas 0..N (migration 0008): optional area model semantics, roster area
 * resolution, area-scoped imports, shift area snapshots, area history and
 * tenant/area isolation. Uses the same fake-sql style as data.test.js.
 */

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const EMP_A1 = 'emp-a1';
const AREA_OPS = 'area-ops';
const AREA_ADM = 'area-adm';
const AREA_FOREIGN = 'area-b1';
const USER_ADMIN = 'user-admin';

const adminCtx = {
  user: { id: USER_ADMIN },
  organizationId: ORG_A,
  role: 'ADMIN',
  employeeId: null,
  plan: 'team',
};

const areaRow = (id, org, over = {}) => ({
  id,
  organization_id: org,
  name: `Area ${id}`,
  code: null,
  active: true,
  ...over,
});

const employeeRow = (id, org, over = {}) => ({
  id,
  organization_id: org,
  external_employee_id: null,
  name: `Name ${id}`,
  user_id: null,
  area_id: null,
  status: 'active',
  deactivated_at: null,
  ...over,
});

function makeFakeSql({ employees = [], imports = [], shifts = [], areas = [], users = [] } = {}) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });

    if (text.startsWith('SELECT id, name, code FROM areas')) {
      return Promise.resolve(areas.filter((a) => a.organization_id === values[0] && a.active !== false));
    }
    if (text.startsWith('SELECT id FROM areas') && text.includes('lower(trim(name))')) {
      const normalized = values[1];
      return Promise.resolve(areas.filter(
        (a) => a.organization_id === values[0] && a.active !== false
          && (a.name.trim().toLowerCase() === normalized
            || (a.code && a.code.trim().toLowerCase() === normalized)),
      ).map((a) => ({ id: a.id })));
    }
    if (text.startsWith('SELECT id FROM areas')) {
      return Promise.resolve(areas.filter(
        (a) => a.id === values[0] && a.organization_id === values[1] && a.active !== false,
      ).map((a) => ({ id: a.id })));
    }
    if (text.startsWith('SELECT area_id FROM imports')) {
      const found = imports.find((i) => i.id === values[0] && i.organization_id === values[1]);
      return Promise.resolve(found ? [{ area_id: found.area_id ?? null }] : []);
    }
    if (text.startsWith('SELECT area_id FROM employees')) {
      const found = employees.find((e) => e.id === values[0] && e.organization_id === values[1]);
      return Promise.resolve(found ? [{ area_id: found.area_id ?? null }] : []);
    }
    if (text.startsWith('SELECT count(*) AS count FROM employees')) {
      return Promise.resolve([{
        count: String(employees.filter((e) => e.organization_id === values[0] && e.status === 'active').length),
      }]);
    }
    if (text.startsWith('SELECT id, status FROM employees')) {
      return Promise.resolve(
        employees
          .filter((e) => e.id === values[0] && e.organization_id === values[1])
          .map((e) => ({ id: e.id, status: e.status })),
      );
    }
    if (text.startsWith('SELECT * FROM employees WHERE id =')) {
      return Promise.resolve(employees.filter((e) => e.id === values[0]));
    }
    if (text.includes('FROM employees') && text.includes('area_id =') && text.startsWith('SELECT *')) {
      return Promise.resolve(employees.filter((e) => e.organization_id === values[0] && e.area_id === values[1]));
    }
    if (text.startsWith('SELECT * FROM employees')) {
      return Promise.resolve(employees.filter((e) => e.organization_id === values[0]));
    }
    if (text.startsWith('INSERT INTO employees')) {
      const hasArea = text.includes(', area_id');
      // Bulk path: status is a SQL literal ('pending_access'), so the area id
      // shifts one position earlier than in the parameterized single create.
      const onConflict = text.includes('ON CONFLICT');
      const row = employeeRow(`emp-new-${employees.length}`, values[0], {
        external_employee_id: values[1],
        name: values[2],
        status: onConflict ? 'pending_access' : (values[3] ?? 'pending_access'),
        area_id: hasArea ? (onConflict ? values[3] : values[4]) : null,
      });
      employees.push(row);
      return Promise.resolve([row]);
    }
    if (text.startsWith('UPDATE employees')) {
      const target = employees.find((e) => e.id === values[6] && e.organization_id === values[7]);
      if (target) {
        target.name = values[0];
        target.area_id = values[4];
      }
      return Promise.resolve([target ?? employeeRow(values[6], values[7])]);
    }
    // createImport area_name_snapshot lookup (values: [areaId, organizationId])
    if (text.startsWith('SELECT name FROM areas')) {
      const found = areas.find((a) => a.id === values[0] && a.organization_id === values[1]);
      return Promise.resolve(found ? [{ name: found.name }] : []);
    }
    if (text.startsWith('SELECT i.*, u.display_name')) {
      const orgRows = imports.filter((i) => i.organization_id === values[0]);
      const scoped = text.includes('i.area_id') ? orgRows.filter((i) => i.area_id === values[1]) : orgRows;
      return Promise.resolve(scoped.map((row) => ({
        ...row,
        imported_by_user_name: users.find((u) => u.id === row.imported_by_user_id)?.display_name ?? null,
      })));
    }
    if (text.startsWith('INSERT INTO imports')) {
      // Every inserted column is a bound parameter, so the parenthesized
      // column list lines up 1:1 with `values`.
      const columns = text.match(/INSERT INTO imports \( ([^)]+) \)/)[1].split(',').map((c) => c.trim());
      const record = {};
      columns.forEach((col, index) => { record[col] = values[index]; });
      const row = {
        id: `import-${imports.length}`,
        organization_id: record.organization_id,
        imported_by_user_id: record.imported_by_user_id,
        file_name: record.file_name,
        source_format: record.source_format,
        period_year: record.period_year,
        period_month: record.period_month,
        status: record.status ?? 'completed',
        area_id: record.area_id ?? null,
        import_mode: record.import_mode ?? 'individual',
        period_kind: record.period_kind ?? 'single',
        period_label: record.period_label ?? '',
        scope_type: record.scope_type ?? 'global',
        area_name_snapshot: record.area_name_snapshot ?? null,
        employee_count: record.employee_count ?? 0,
        shift_count: record.shift_count ?? 0,
        created_shift_count: record.created_shift_count ?? 0,
        existing_shift_count: record.existing_shift_count ?? 0,
        deleted_at: null,
        deleted_by_user_id: null,
        created_at: new Date(),
      };
      imports.push(row);
      return Promise.resolve([row]);
    }
    if (text.includes('FROM shifts') && text.includes('AND area_id =')) {
      return Promise.resolve(shifts.filter(
        (s) => s.organization_id === values[0] && s.area_id === values[1],
      ));
    }
    if (text.includes('FROM shifts')) {
      return Promise.resolve(shifts.filter((s) => s.organization_id === values[0]));
    }
    if (text.startsWith('SELECT DISTINCT employee_id FROM shifts')) {
      const distinct = [...new Set(shifts.filter((s) => s.organization_id === values[0]).map((s) => s.employee_id))];
      return Promise.resolve(distinct.map((employee_id) => ({ employee_id })));
    }
    if (text.startsWith('INSERT INTO shifts')) {
      const row = {
        id: values[0],
        organization_id: values[1],
        employee_id: values[2],
        import_id: values[3],
        area_id: values[4],
        date: values[5],
        start_time: values[6],
        end_time: values[7],
        location: values[8],
        origin: values[9],
      };
      shifts.push(row);
      return Promise.resolve([row]);
    }
    return Promise.resolve([]);
  };
  return { sql, calls, employees, imports, shifts, areas };
}

const shiftInput = (over = {}) => ({
  employeeId: EMP_A1,
  date: '2026-09-04',
  startTime: '17:00',
  endTime: '01:00',
  location: 'Regular',
  origin: 'IMP',
  ...over,
});

describe('areas: no-area organization (0 areas)', () => {
  it('employee with areaId null is valid (organization-direct)', async () => {
    const { sql } = makeFakeSql();
    const created = await createEmployee(sql, adminCtx, { name: 'Sin Area' });
    expect(created.areaId).toBeNull();
  });

  it('bulk roster with empty area column creates employees with areaId null', async () => {
    const { sql } = makeFakeSql();
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Nora Campos', externalEmployeeId: 'NOAREA-001', areaName: '' },
    ]);
    expect(results[0].status).toBe('created');
    expect(results[0].employee.areaId).toBeNull();
  });

  it('import with areaId null is organization-scoped', async () => {
    const { sql } = makeFakeSql();
    const created = await createImport(sql, adminCtx, { fileName: 'a.csv', sourceFormat: 'csv' });
    expect(created.areaId).toBeNull();
  });

  it('shift with no area context gets areaId null', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    const [saved] = await upsertShifts(sql, adminCtx, [shiftInput()]);
    expect(saved.areaId).toBeNull();
  });
});

describe('areas: roster area resolution (bulkCreateEmployees)', () => {
  const areas = [
    areaRow(AREA_OPS, ORG_A, { name: 'Operaciones', code: 'OPS' }),
    areaRow(AREA_ADM, ORG_A, { name: 'Administración', code: 'ADM' }),
  ];

  it('known area name resolves (case/whitespace normalized, no duplicates)', async () => {
    const { sql } = makeFakeSql({ areas });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Ana Soler', externalEmployeeId: 'ANC-OPS-001', areaName: 'Operaciones' },
      { key: 'k2', name: 'Bruno Martí', externalEmployeeId: 'ANC-OPS-002', areaName: 'operaciones' },
      { key: 'k3', name: 'Carla Puig', externalEmployeeId: 'ANC-OPS-003', areaName: ' OPERACIONES' },
    ]);
    expect(results.map((r) => r.status)).toEqual(['created', 'created', 'created']);
    expect(results.every((r) => r.employee.areaId === AREA_OPS)).toBe(true);
  });

  it('area code resolves too', async () => {
    const { sql } = makeFakeSql({ areas });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Ana Soler', areaName: 'ops' },
    ]);
    expect(results[0].employee.areaId).toBe(AREA_OPS);
  });

  it('valid areaId resolves directly for bulk roster rows', async () => {
    const { sql } = makeFakeSql({ areas });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Ana Soler', externalEmployeeId: 'ANC-OPS-004', areaId: AREA_OPS },
    ]);
    expect(results[0].status).toBe('created');
    expect(results[0].employee.areaId).toBe(AREA_OPS);
  });

  it('unknown areaId fails only that row (unknown_area)', async () => {
    const { sql } = makeFakeSql({ areas });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Ana Soler', areaId: AREA_FOREIGN },
      { key: 'k2', name: 'Bruno Martí', areaId: AREA_OPS },
    ]);
    expect(results[0]).toMatchObject({ status: 'failed', reason: 'unknown_area' });
    expect(results[1]).toMatchObject({ status: 'created' });
  });

  it('unknown area fails only that row (unknown_area), never auto-creates', async () => {
    const { sql, areas: after } = makeFakeSql({ areas });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Ana Soler', areaName: 'Logística' },
      { key: 'k2', name: 'Bruno Martí', areaName: 'Operaciones' },
    ]);
    expect(results[0]).toMatchObject({ status: 'failed', reason: 'unknown_area' });
    expect(results[0].areaError).toContain('Logística');
    expect(results[1].status).toBe('created');
    expect(after).toHaveLength(2);
  });
});

describe('areas: employee area context', () => {
  const areas = [areaRow(AREA_OPS, ORG_A, { name: 'Operaciones' })];

  it('createEmployee accepts a valid areaId', async () => {
    const { sql } = makeFakeSql({ areas });
    const created = await createEmployee(sql, adminCtx, { name: 'Con Area', areaId: AREA_OPS });
    expect(created.areaId).toBe(AREA_OPS);
  });

  it('createEmployee resolves areaName', async () => {
    const { sql } = makeFakeSql({ areas });
    const created = await createEmployee(sql, adminCtx, { name: 'Con Area', areaName: 'operaciones' });
    expect(created.areaId).toBe(AREA_OPS);
  });

  it('unknown areaName is a 400, never stored', async () => {
    const { sql } = makeFakeSql({ areas });
    await expect(createEmployee(sql, adminCtx, { name: 'X', areaName: 'Inexistente' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('listEmployees filters by area when areaId is given', async () => {
    const { sql } = makeFakeSql({
      employees: [
        employeeRow(EMP_A1, ORG_A, { area_id: AREA_OPS }),
        employeeRow('emp-a2', ORG_A, { area_id: AREA_ADM }),
        employeeRow('emp-a3', ORG_A, { area_id: null }),
      ],
    });
    const all = await listEmployees(sql, adminCtx);
    const onlyOps = await listEmployees(sql, adminCtx, { areaId: AREA_OPS });
    expect(all).toHaveLength(3);
    expect(onlyOps.map((e) => e.id)).toEqual([EMP_A1]);
  });
});

describe('areas: area-scoped imports + shift snapshot', () => {
  const areas = [areaRow(AREA_OPS, ORG_A, { name: 'Operaciones' })];

  it('createImport with org area stores areaId (area-scoped import)', async () => {
    const { sql } = makeFakeSql({ areas });
    const created = await createImport(sql, adminCtx, { fileName: 'a.csv', sourceFormat: 'csv', areaId: AREA_OPS });
    expect(created.areaId).toBe(AREA_OPS);
  });

  it('listImports filters by area', async () => {
    const { sql } = makeFakeSql({
      imports: [
        { id: 'imp-1', organization_id: ORG_A, area_id: AREA_OPS, created_at: new Date() },
        { id: 'imp-2', organization_id: ORG_A, area_id: null, created_at: new Date() },
      ],
    });
    const all = await listImports(sql, adminCtx);
    const scoped = await listImports(sql, adminCtx, { areaId: AREA_OPS });
    expect(all.imports).toHaveLength(2);
    expect(scoped.imports.map((i) => i.id)).toEqual(['imp-1']);
  });

  it('shift inherits area from area-scoped import', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A)],
      imports: [{ id: 'imp-1', organization_id: ORG_A, area_id: AREA_OPS }],
    });
    const [saved] = await upsertShifts(sql, adminCtx, [shiftInput({ importId: 'imp-1' })]);
    expect(saved.areaId).toBe(AREA_OPS);
  });

  it('org-scoped import falls back to the employee current area at write time', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { area_id: AREA_OPS })],
      imports: [{ id: 'imp-1', organization_id: ORG_A, area_id: null }],
    });
    const [saved] = await upsertShifts(sql, adminCtx, [shiftInput({ importId: 'imp-1' })]);
    expect(saved.areaId).toBe(AREA_OPS);
  });

  it('explicit shift areaId wins over import/employee area', async () => {
    const { sql } = makeFakeSql({
      areas: [areaRow(AREA_OPS, ORG_A), areaRow(AREA_ADM, ORG_A)],
      employees: [employeeRow(EMP_A1, ORG_A, { area_id: AREA_OPS })],
      imports: [{ id: 'imp-1', organization_id: ORG_A, area_id: AREA_OPS }],
    });
    const [saved] = await upsertShifts(sql, adminCtx, [shiftInput({ importId: 'imp-1', areaId: AREA_ADM })]);
    expect(saved.areaId).toBe(AREA_ADM);
  });

  it('listShifts filters org-wide list by area', async () => {
    const { sql } = makeFakeSql({
      shifts: [
        { id: 's1', organization_id: ORG_A, employee_id: EMP_A1, area_id: AREA_OPS, date: '2026-09-01' },
        { id: 's2', organization_id: ORG_A, employee_id: 'emp-a2', area_id: AREA_ADM, date: '2026-09-01' },
      ],
    });
    const scoped = await listShifts(sql, adminCtx, '', { areaId: AREA_OPS });
    expect(scoped.map((s) => s.id)).toEqual(['s1']);
  });
});

describe('areas: area change keeps history (section 17)', () => {
  it('moving an employee only updates employees.area_id, never shifts/imports', async () => {
    const areas = [areaRow(AREA_OPS, ORG_A, { name: 'Operaciones' }), areaRow(AREA_ADM, ORG_A, { name: 'Administración' })];
    const { sql, calls } = makeFakeSql({
      areas,
      employees: [employeeRow(EMP_A1, ORG_A, { area_id: AREA_OPS })],
      shifts: [{ id: 's1', organization_id: ORG_A, employee_id: EMP_A1, area_id: AREA_OPS }],
      imports: [{ id: 'imp-1', organization_id: ORG_A, area_id: AREA_OPS }],
    });
    const updated = await updateEmployee(sql, adminCtx, { id: EMP_A1, areaId: AREA_ADM });
    expect(updated.areaId).toBe(AREA_ADM);
    const update = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(update.values[4]).toBe(AREA_ADM);
    expect(calls.some((call) => call.text.startsWith('UPDATE shifts'))).toBe(false);
    expect(calls.some((call) => call.text.startsWith('UPDATE imports'))).toBe(false);
  });

  it('areaId null moves the employee back to organization-direct', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { area_id: AREA_OPS })],
    });
    const updated = await updateEmployee(sql, adminCtx, { id: EMP_A1, areaId: null });
    expect(updated.areaId).toBeNull();
  });
});

describe('areas: tenant + area isolation (section 22)', () => {
  const foreignAreas = [areaRow(AREA_FOREIGN, ORG_B, { name: 'Area B1' })];

  it('ADMIN of org A cannot assign an employee to an area of org B (403)', async () => {
    const { sql } = makeFakeSql({ areas: foreignAreas });
    await expect(createEmployee(sql, adminCtx, { name: 'X', areaId: AREA_FOREIGN }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('ADMIN of org A cannot update an employee into org B area (403)', async () => {
    const { sql } = makeFakeSql({
      areas: foreignAreas,
      employees: [employeeRow(EMP_A1, ORG_A)],
    });
    await expect(updateEmployee(sql, adminCtx, { id: EMP_A1, areaId: AREA_FOREIGN }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('ADMIN of org A cannot create an import scoped to org B area (403)', async () => {
    const { sql } = makeFakeSql({ areas: foreignAreas });
    await expect(createImport(sql, adminCtx, { fileName: 'a.csv', sourceFormat: 'csv', areaId: AREA_FOREIGN }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('ADMIN of org A cannot create a shift with org B area (403)', async () => {
    const { sql } = makeFakeSql({
      areas: foreignAreas,
      employees: [employeeRow(EMP_A1, ORG_A)],
    });
    await expect(upsertShifts(sql, adminCtx, [shiftInput({ areaId: AREA_FOREIGN })]))
      .rejects.toMatchObject({ status: 403 });
  });

  it('foreign area name never resolves in roster bulk (unknown_area)', async () => {
    const { sql } = makeFakeSql({ areas: foreignAreas });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Ana Soler', areaName: 'Area B1' },
    ]);
    expect(results[0]).toMatchObject({ status: 'failed', reason: 'unknown_area' });
  });

  it('list filters with a foreign area id match nothing (no leak)', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { area_id: AREA_OPS })],
    });
    const filtered = await listEmployees(sql, adminCtx, { areaId: AREA_FOREIGN });
    expect(filtered).toHaveLength(0);
  });
});
