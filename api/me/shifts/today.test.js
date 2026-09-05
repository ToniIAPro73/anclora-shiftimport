import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-today';
const EMPLOYEE = 'employee-today';
const USER = 'user-today';
const TOKEN = 'today-token';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./today.js');

function makeFakeSql(shifts = []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) {
      return Promise.resolve(values[0] === tokenHash(TOKEN)
        ? [{ id: USER, email: 'employee@example.com', display_name: 'Employee' }]
        : []);
    }
    if (text.includes('FROM memberships')) {
      return Promise.resolve([{ organization_id: ORG, role: 'EMPLOYEE', scoped_area_id: null, organization_name: 'Org Today', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('FROM shifts') && text.includes('CURRENT_DATE')) {
      return Promise.resolve(shifts.filter((shift) => shift.organization_id === values[0] && shift.employee_id === values[1]));
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
}

async function call({ token = TOKEN, method = 'GET' } = {}) {
  const res = response();
  await handler({ method, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { sql: makeFakeSql([{
    id: 'shift-today', organization_id: ORG, employee_id: EMPLOYEE, import_id: 'import-1',
    area_id: null, date: '2026-09-05', start_time: '09:00', end_time: '17:00', location: 'Front desk', origin: 'IMP',
  }, {
    id: 'shift-other-employee', organization_id: ORG, employee_id: 'employee-other', import_id: null,
    area_id: null, date: '2026-09-05', start_time: '10:00', end_time: '18:00', location: 'Other', origin: 'MAN',
  }, {
    id: 'shift-other-tenant', organization_id: 'org-other', employee_id: EMPLOYEE, import_id: null,
    area_id: null, date: '2026-09-05', start_time: '11:00', end_time: '19:00', location: 'Other tenant', origin: 'IMP',
  }]) };
});

describe('GET /api/me/shifts/today', () => {
  it('returns only the linked employee shift in the session organization', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.shifts.map((shift) => shift.id)).toEqual(['shift-today']);
    const query = state.sql.calls.find((call) => call.text.includes('FROM shifts'));
    expect(query.text).toContain('CURRENT_DATE');
    expect(query.values).toEqual([ORG, EMPLOYEE]);
  });

  it('rejects anonymous requests before reading shifts', async () => {
    const res = await call({ token: null });
    expect(res.statusCode).toBe(401);
    expect(state.sql.calls.some((call) => call.text.includes('FROM shifts'))).toBe(false);
  });

  it('rejects non-GET methods', async () => {
    const res = await call({ method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET');
  });
});
