import { describe, expect, it } from 'vitest';
import handler, { mapWithConcurrency, processRow, resolveEmployee } from './bulk.js';

function responseDouble() {
  return {
    statusCode: null, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

/** Fake `sql` tagged-template: returns queued rows in call order, ignoring
 * the actual query text — matches the exact sequence of queries the code
 * under test issues (documented per test). Throws if called more times
 * than queued, so an unexpectedly-reached query fails loudly. */
function queueSql(...responses) {
  let i = 0;
  return async () => {
    if (i >= responses.length) throw new Error(`sql called more times (${i + 1}) than queued (${responses.length})`);
    return responses[i++];
  };
}

const ctx = { organizationId: 'org-1', user: { id: 'actor-1' }, role: 'ADMIN' };

describe('bulk invitation worker', () => {
  it('rejects non-POST without opening a database connection', async () => {
    const res = responseDouble();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('keeps bounded concurrency and preserves input order', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    }, 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('resolveEmployee — tenant-scoped, per-row', () => {
  it('returns null without querying when no externalEmployeeId is given', async () => {
    const sql = () => { throw new Error('must not query'); };
    await expect(resolveEmployee(sql, 'org-1', '')).resolves.toBeNull();
  });

  it('rejects an unknown external id', async () => {
    const sql = queueSql([]);
    await expect(resolveEmployee(sql, 'org-1', 'EMP-404')).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_FOUND', status: 400 });
  });

  it('rejects an ambiguous external id (never silently picks one)', async () => {
    const sql = queueSql([{ id: 'e1', user_id: null, status: 'active' }, { id: 'e2', user_id: null, status: 'active' }]);
    await expect(resolveEmployee(sql, 'org-1', 'EMP-DUP')).rejects.toMatchObject({ code: 'EMPLOYEE_REFERENCE_AMBIGUOUS', status: 409 });
  });

  it('rejects an employee already linked to a user', async () => {
    const sql = queueSql([{ id: 'e1', user_id: 'someone', status: 'active' }]);
    await expect(resolveEmployee(sql, 'org-1', 'EMP-1')).rejects.toMatchObject({ code: 'EMPLOYEE_ALREADY_LINKED', status: 409 });
  });

  it('rejects an inactive employee', async () => {
    const sql = queueSql([{ id: 'e1', user_id: null, status: 'inactive' }]);
    await expect(resolveEmployee(sql, 'org-1', 'EMP-1')).rejects.toMatchObject({ code: 'EMPLOYEE_INACTIVE', status: 409 });
  });
});

describe('processRow — server-side re-validation of every CSV row', () => {
  it('rejects OWNER (never assignable via CSV), before touching the database', async () => {
    const sql = () => { throw new Error('must not query'); };
    const row = { row: 1, email: 'a@e2e.test', role: 'OWNER' };
    await expect(processRow(sql, ctx, row, { defaultLocale: 'es' })).rejects.toMatchObject({ code: 'OWNER_NOT_ASSIGNABLE', status: 400 });
  });

  it('rejects an unrecognized role string', async () => {
    const sql = () => { throw new Error('must not query'); };
    const row = { row: 1, email: 'a@e2e.test', role: 'SUPERADMIN' };
    await expect(processRow(sql, ctx, row, { defaultLocale: 'es' })).rejects.toMatchObject({ code: 'INVALID_ROLE', status: 400 });
  });

  it('rejects a row whose external employee id does not exist in this org', async () => {
    const sql = queueSql([]); // resolveEmployee's own query
    const row = { row: 1, email: 'a@e2e.test', role: 'EMPLOYEE', externalEmployeeId: 'EMP-404' };
    await expect(processRow(sql, ctx, row, { defaultLocale: 'es' })).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_FOUND' });
  });

  it('rejects a suspended global account', async () => {
    const sql = queueSql([{ id: 'u1', account_status: 'SUSPENDED', membership_role: null }]); // users query (no externalEmployeeId, resolveEmployee skips its query)
    const row = { row: 1, email: 'a@e2e.test', role: 'EMPLOYEE' };
    await expect(processRow(sql, ctx, row, { defaultLocale: 'es' })).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE', status: 409 });
  });

  it('rejects when the employee is already the access record of a DIFFERENT existing member', async () => {
    const sql = queueSql(
      [{ id: 'emp-1', user_id: null, status: 'active' }], // resolveEmployee
      [{ id: 'u1', account_status: 'ACTIVE', membership_role: 'EMPLOYEE' }], // users (existing member with a role already)
      [], // linked check: employee is NOT linked to this same user
    );
    const row = { row: 1, email: 'a@e2e.test', role: 'EMPLOYEE', externalEmployeeId: 'EMP-1' };
    await expect(processRow(sql, ctx, row, { defaultLocale: 'es' })).rejects.toMatchObject({ code: 'EMPLOYEE_ACCESS_CONFLICT', status: 409 });
  });

  it('reports UNCHANGED when the existing member already has the requested role', async () => {
    const sql = queueSql([{ id: 'u1', account_status: 'ACTIVE', membership_role: 'EMPLOYEE' }]); // users only — no externalEmployeeId
    const row = { row: 1, email: 'a@e2e.test', role: 'EMPLOYEE' };
    const result = await processRow(sql, ctx, row, { defaultLocale: 'es' });
    expect(result).toMatchObject({ status: 'UNCHANGED' });
  });

  it('reports UNCHANGED_PENDING instead of creating a second pending invitation', async () => {
    const sql = queueSql(
      [], // users: no existing account
      [{ id: 'inv-1', status: 'PENDING' }], // pending invitation already exists
    );
    const row = { row: 1, email: 'a@e2e.test', role: 'EMPLOYEE' };
    const result = await processRow(sql, ctx, row, { defaultLocale: 'es' });
    expect(result).toMatchObject({ status: 'UNCHANGED_PENDING', invitationStatus: 'PENDING' });
  });
});
