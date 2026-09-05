import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-week';
const EMPLOYEE = 'employee-week';
const USER = 'user-week';
const TOKEN = 'week-token';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./week.js');

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
      return Promise.resolve([{ organization_id: ORG, role: 'EMPLOYEE', scoped_area_id: null, organization_name: 'Org Week', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('FROM shifts')) {
      return Promise.resolve(shifts.filter((shift) => shift.organization_id === values[0] && shift.employee_id === values[1]));
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

async function call({ token = TOKEN, method = 'GET', weekStart = '2026-09-07' } = {}) {
  const res = response();
  await handler({ method, query: { week_start: weekStart }, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { sql: makeFakeSql([{
    id: 'shift-week', organization_id: ORG, employee_id: EMPLOYEE, import_id: 'import-1', area_id: null,
    date: '2026-09-09', start_time: '09:00', end_time: '17:00', location: 'Front desk', origin: 'IMP',
  }, {
    id: 'shift-other-employee', organization_id: ORG, employee_id: 'employee-other', import_id: null, area_id: null,
    date: '2026-09-09', start_time: '10:00', end_time: '18:00', location: 'Other', origin: 'MAN',
  }, {
    id: 'shift-other-tenant', organization_id: 'org-other', employee_id: EMPLOYEE, import_id: null, area_id: null,
    date: '2026-09-09', start_time: '11:00', end_time: '19:00', location: 'Other tenant', origin: 'IMP',
  }]) };
});

describe('GET /api/me/shifts/week', () => {
  it('returns only the session employee shifts for the requested Monday range', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ weekStart: '2026-09-07' });
    expect(res.body.days).toHaveLength(7);
    expect(res.body.days.find((day) => day.date === '2026-09-09').shifts.map((shift) => shift.id)).toEqual(['shift-week']);
    const query = state.sql.calls.find((call) => call.text.includes('FROM shifts'));
    expect(query.text).toContain("INTERVAL '7 days'");
    expect(query.text).not.toContain("TO_CHAR(start_time, 'HH24:MI')");
    expect(query.text).not.toContain("TO_CHAR(end_time, 'HH24:MI')");
    expect(query.values).toEqual([ORG, EMPLOYEE, '2026-09-07', '2026-09-07']);
  });

  it('rejects malformed and non-Monday week starts before authentication/data access', async () => {
    expect((await call({ weekStart: '2026-09-08' })).statusCode).toBe(400);
    expect((await call({ weekStart: 'not-a-date' })).statusCode).toBe(400);
    expect(state.sql.calls.some((call) => call.text.includes('FROM shifts'))).toBe(false);
  });

  it('materializes the seven dates across a year boundary', async () => {
    const res = await call({ weekStart: '2026-12-28' });
    expect(res.statusCode).toBe(200);
    expect(res.body.days.map((day) => day.date)).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
      '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });

  it('rejects anonymous requests without reading shifts', async () => {
    const res = await call({ token: null });
    expect(res.statusCode).toBe(401);
    expect(state.sql.calls.some((call) => call.text.includes('FROM shifts'))).toBe(false);
  });
});
