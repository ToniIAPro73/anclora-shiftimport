import { describe, expect, it } from 'vitest';
import {
  SeedAbortError,
  assertNonProduction,
  validateDataset,
  loadDataset,
  resolveOrganization,
  planEmployeeAction,
  runSeed,
  EXPECTED_EMPLOYEE_COUNT,
} from './seed-dev.mjs';

function makeDatasetEmployees(count = EXPECTED_EMPLOYEE_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    external_employee_id: `SI${String(index + 1).padStart(6, '0')}`,
    full_name: `Synthetic Person ${index + 1}`,
    email_synthetic: `synthetic.${index + 1}@example.invalid`,
    status: 'ACTIVE',
  }));
}

/** In-memory fake Neon `sql` tagged template: organizations + employees. */
function makeFakeSql({ organizations = [], employees = [] } = {}) {
  const orgs = [...organizations];
  const rows = [...employees];

  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();

    if (text.startsWith('SELECT id, name, type FROM organizations WHERE id')) {
      return Promise.resolve(orgs.filter((org) => org.id === values[0]));
    }
    if (text.startsWith('SELECT id, name, type FROM organizations WHERE name')) {
      return Promise.resolve(orgs.filter((org) => org.name === values[0]));
    }
    if (text.startsWith('SELECT external_employee_id, name, status, user_id FROM employees')) {
      const organizationId = values[0];
      return Promise.resolve(rows.filter((row) => row.organization_id === organizationId));
    }
    if (text.startsWith('INSERT INTO employees')) {
      const [organizationId, externalId, name, status] = values;
      rows.push({ organization_id: organizationId, external_employee_id: externalId, name, status, user_id: null });
      return Promise.resolve([]);
    }
    if (text.startsWith('UPDATE employees')) {
      const [name, status, organizationId, externalId] = values;
      const row = rows.find((candidate) => candidate.organization_id === organizationId && candidate.external_employee_id === externalId);
      if (row) {
        row.name = name;
        row.status = status;
      }
      return Promise.resolve([]);
    }

    throw new Error(`Unhandled fake query: ${text}`);
  };

  sql.rows = rows;
  return sql;
}

describe('assertNonProduction', () => {
  it('aborts when VERCEL_ENV=production', () => {
    expect(() => assertNonProduction({ VERCEL_ENV: 'production' })).toThrow(SeedAbortError);
  });

  it('aborts when NODE_ENV=production', () => {
    expect(() => assertNonProduction({ NODE_ENV: 'production' })).toThrow(SeedAbortError);
  });

  it('allows VERCEL_ENV=development (trusted platform signal)', () => {
    expect(() => assertNonProduction({ VERCEL_ENV: 'development' })).not.toThrow();
  });

  it('aborts on a plain local run with no explicit opt-in — never assumes dev from "it is a dev machine"', () => {
    expect(() => assertNonProduction({})).toThrow(SeedAbortError);
  });

  it('allows a local run with the explicit SEED_ALLOW_ENV=development opt-in', () => {
    expect(() => assertNonProduction({ SEED_ALLOW_ENV: 'development' })).not.toThrow();
  });

  it('VERCEL_ENV=production still wins even if SEED_ALLOW_ENV is set', () => {
    expect(() => assertNonProduction({ VERCEL_ENV: 'production', SEED_ALLOW_ENV: 'development' })).toThrow(SeedAbortError);
  });
});

describe('validateDataset', () => {
  it('accepts a well-formed 40-employee dataset', () => {
    const employees = validateDataset({ employees: makeDatasetEmployees() });
    expect(employees).toHaveLength(40);
  });

  it('rejects a dataset with the wrong employee count', () => {
    expect(() => validateDataset({ employees: makeDatasetEmployees(39) })).toThrow(SeedAbortError);
    expect(() => validateDataset({ employees: makeDatasetEmployees(41) })).toThrow(SeedAbortError);
  });

  it('rejects an employee with no external_employee_id', () => {
    const employees = makeDatasetEmployees();
    employees[0].external_employee_id = '';
    expect(() => validateDataset({ employees })).toThrow(SeedAbortError);
  });

  it('rejects duplicate external_employee_id within the dataset', () => {
    const employees = makeDatasetEmployees();
    employees[1].external_employee_id = employees[0].external_employee_id;
    expect(() => validateDataset({ employees })).toThrow(/Duplicate external_employee_id/);
  });

  it('rejects a suspicious credential-like field', () => {
    const employees = makeDatasetEmployees();
    employees[0].password = 'hunter2';
    expect(() => validateDataset({ employees })).toThrow(/credential-like/);
  });

  it('rejects a non-synthetic-looking email', () => {
    const employees = makeDatasetEmployees();
    employees[0].email_synthetic = 'real.person@gmail.com';
    expect(() => validateDataset({ employees })).toThrow(/non-synthetic/);
  });
});

describe('loadDataset', () => {
  it('aborts without writing/reading further when the dataset file does not exist', async () => {
    await expect(loadDataset('/nonexistent/path/does-not-exist.json')).rejects.toThrow(SeedAbortError);
  });
});

describe('resolveOrganization', () => {
  const orgs = [{ id: 'org-1', name: 'Test Co', type: 'company' }, { id: 'org-2', name: 'Test Co', type: 'company' }];

  it('resolves by exact organization id', async () => {
    const sql = makeFakeSql({ organizations: orgs });
    const org = await resolveOrganization(sql, { organizationId: 'org-1' });
    expect(org.id).toBe('org-1');
  });

  it('aborts when the given organization id does not exist', async () => {
    const sql = makeFakeSql({ organizations: orgs });
    await expect(resolveOrganization(sql, { organizationId: 'nope' })).rejects.toThrow(SeedAbortError);
  });

  it('aborts on an ambiguous organization name (never silently picks the first)', async () => {
    const sql = makeFakeSql({ organizations: orgs });
    await expect(resolveOrganization(sql, { organizationName: 'Test Co' })).rejects.toThrow(/ambiguous/);
  });

  it('aborts when neither --organization-id nor --organization-name is given', async () => {
    const sql = makeFakeSql({ organizations: orgs });
    await expect(resolveOrganization(sql, {})).rejects.toThrow(SeedAbortError);
  });
});

describe('planEmployeeAction', () => {
  it('CREATE when there is no existing row', () => {
    const action = planEmployeeAction({ external_employee_id: 'SI1', full_name: 'A', status: 'ACTIVE' }, undefined);
    expect(action.kind).toBe('CREATE');
  });

  it('SKIP when the existing row already matches', () => {
    const action = planEmployeeAction(
      { external_employee_id: 'SI1', full_name: 'A', status: 'ACTIVE' },
      { name: 'A', status: 'active' },
    );
    expect(action.kind).toBe('SKIP');
  });

  it('UPDATE when the name or status differs', () => {
    const action = planEmployeeAction(
      { external_employee_id: 'SI1', full_name: 'A Renamed', status: 'ACTIVE' },
      { name: 'A', status: 'active' },
    );
    expect(action.kind).toBe('UPDATE');
  });
});

describe('runSeed', () => {
  const org = { id: 'org-1', name: 'Test Co', type: 'company' };

  it('creates every employee on a fresh organization', async () => {
    const sql = makeFakeSql({ organizations: [org] });
    const totals = await runSeed(sql, makeDatasetEmployees(5), org);
    expect(totals).toEqual({ created: 5, updated: 0, skipped: 0, errors: 0 });
    expect(sql.rows).toHaveLength(5);
  });

  it('is idempotent: a second run against the same state is all SKIP, never duplicates', async () => {
    const sql = makeFakeSql({ organizations: [org] });
    const employees = makeDatasetEmployees(5);
    await runSeed(sql, employees, org);
    const second = await runSeed(sql, employees, org);
    expect(second).toEqual({ created: 0, updated: 0, skipped: 5, errors: 0 });
    expect(sql.rows).toHaveLength(5);
  });

  it('never overwrites an existing user_id (UPDATE only touches name/status)', async () => {
    const sql = makeFakeSql({
      organizations: [org],
      employees: [{ organization_id: 'org-1', external_employee_id: 'SI000001', name: 'Old Name', status: 'active', user_id: 'user-legit' }],
    });
    const employees = makeDatasetEmployees(1);
    employees[0].full_name = 'New Name'; // forces UPDATE
    await runSeed(sql, employees, org);
    const row = sql.rows.find((candidate) => candidate.external_employee_id === 'SI000001');
    expect(row.name).toBe('New Name');
    expect(row.user_id).toBe('user-legit');
  });

  it('does not affect another tenant sharing the same external_employee_id', async () => {
    const otherOrgRow = { organization_id: 'org-OTHER', external_employee_id: 'SI000001', name: 'Other Tenant Person', status: 'active', user_id: null };
    const sql = makeFakeSql({ organizations: [org], employees: [otherOrgRow] });
    await runSeed(sql, makeDatasetEmployees(1), org);
    // The other tenant's row is untouched, and a NEW row was created scoped to org-1.
    expect(sql.rows.find((row) => row.organization_id === 'org-OTHER')).toEqual(otherOrgRow);
    expect(sql.rows.find((row) => row.organization_id === 'org-1')).toBeTruthy();
  });

  it('dry-run reports the plan but writes nothing', async () => {
    const sql = makeFakeSql({ organizations: [org] });
    const totals = await runSeed(sql, makeDatasetEmployees(5), org, { dryRun: true });
    expect(totals.created).toBe(5);
    expect(sql.rows).toHaveLength(0);
  });
});
