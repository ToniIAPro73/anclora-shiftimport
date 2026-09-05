import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-detail';
const EMPLOYEE = 'employee-detail';
const USER = 'user-detail';
const TOKEN = 'detail-token';
const SHIFT_ID = '11111111-1111-4111-8111-111111111111';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./[id].js');

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
      return Promise.resolve([{ organization_id: ORG, role: 'EMPLOYEE', scoped_area_id: null, organization_name: 'Org Detail', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('FROM shifts s')) {
      return Promise.resolve(shifts.filter((shift) => shift.id === values[0]
        && shift.organization_id === values[1]
        && shift.employee_id === values[2]));
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
}

async function call({ id = SHIFT_ID, token = TOKEN, method = 'GET' } = {}) {
  const res = response();
  await handler({ method, query: { id }, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { sql: makeFakeSql([
    {
      id: SHIFT_ID, organization_id: ORG, employee_id: EMPLOYEE, import_id: 'import-1', area_id: 'area-1',
      date: '2026-09-05', start_time: '09:00', end_time: '17:00', location: 'Front desk', origin: 'IMP', area_name: 'Recepción',
    },
    {
      id: '22222222-2222-4222-8222-222222222222', organization_id: ORG, employee_id: 'employee-other', import_id: null, area_id: null,
      date: '2026-09-05', start_time: '10:00', end_time: '18:00', location: 'Other', origin: 'MAN', area_name: null,
    },
    {
      id: '33333333-3333-4333-8333-333333333333', organization_id: 'org-other', employee_id: EMPLOYEE, import_id: null, area_id: null,
      date: '2026-09-05', start_time: '11:00', end_time: '19:00', location: 'Other tenant', origin: 'IMP', area_name: null,
    },
  ]) };
});

describe('GET /api/me/shifts/:id', () => {
  it('returns the linked employee shift with its optional area', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.shift).toMatchObject({ id: SHIFT_ID, date: '2026-09-05', startTime: '09:00', endTime: '17:00', location: 'Front desk', areaName: 'Recepción' });
    const query = state.sql.calls.find((call) => call.text.includes('FROM shifts s'));
    expect(query.values).toEqual([SHIFT_ID, ORG, EMPLOYEE]);
    expect(query.text).toContain('s.employee_id');
    expect(query.text).not.toContain("TO_CHAR(s.start_time, 'HH24:MI')");
    expect(query.text).not.toContain("TO_CHAR(s.end_time, 'HH24:MI')");
  });

  it('returns uniform 404 for another employee and another tenant', async () => {
    const foreignEmployee = await call({ id: '22222222-2222-4222-8222-222222222222' });
    const foreignTenant = await call({ id: '33333333-3333-4333-8333-333333333333' });
    expect(foreignEmployee.statusCode).toBe(404);
    expect(foreignEmployee.body).toEqual({ error: 'Shift not found' });
    expect(foreignTenant.statusCode).toBe(404);
    expect(foreignTenant.body).toEqual({ error: 'Shift not found' });
  });

  it('rejects malformed ids before authentication or data access', async () => {
    const res = await call({ id: 'not-a-uuid', token: null });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Shift not found' });
    expect(state.sql.calls).toHaveLength(0);
  });

  it('rejects anonymous requests without reading a shift', async () => {
    const res = await call({ token: null });
    expect(res.statusCode).toBe(401);
    expect(state.sql.calls.some((call) => call.text.includes('FROM shifts s'))).toBe(false);
  });

  it('rejects non-GET methods', async () => {
    const res = await call({ method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET');
  });
});
