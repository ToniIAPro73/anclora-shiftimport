import { createHash } from 'node:crypto';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const AREA_A = '22222222-2222-4222-8222-222222222222';
const USER_PLANNER = '33333333-3333-4333-8333-333333333333';
const USER_EMPLOYEE = '44444444-4444-4444-8444-444444444444';
const TOKEN_PLANNER = 'planner-token';
const TOKEN_EMPLOYEE = 'employee-token';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./index.js');

function makeFakeSql() {
  const schedules = [];
  const versions = [];
  const areas = [{ id: AREA_A, organization_id: ORG_A, active: true }];
  const sessions = {
    [tokenHash(TOKEN_PLANNER)]: { userId: USER_PLANNER, role: 'PLANNER', scopedAreaId: null },
    [tokenHash(TOKEN_EMPLOYEE)]: { userId: USER_EMPLOYEE, role: 'EMPLOYEE', scopedAreaId: null },
  };
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.includes('FROM sessions')) {
      const session = sessions[values[0]];
      return Promise.resolve(session ? [{ id: session.userId, email: `${session.userId}@example.com`, display_name: 'Test User' }] : []);
    }
    if (text.includes('FROM memberships')) {
      const session = Object.values(sessions).find((item) => item.userId === values[0]);
      return Promise.resolve(session ? [{ organization_id: ORG_A, role: session.role, scoped_area_id: session.scopedAreaId, organization_name: 'Org A', organization_plan: 'team' }] : []);
    }
    if (text.includes('FROM employees')) return Promise.resolve([]);
    if (text.startsWith('SELECT id FROM areas')) {
      return Promise.resolve(areas.filter((area) => area.id === values[0] && area.organization_id === values[1] && area.active));
    }
    if (text.startsWith('INSERT INTO schedules')) {
      const [id, organizationId, areaId, periodStart, periodEnd, createdByUserId] = values;
      const exists = schedules.find((schedule) => schedule.organization_id === organizationId && schedule.area_id === areaId && schedule.period_start === periodStart);
      if (exists) return Promise.resolve([]);
      schedules.push({ id, organization_id: organizationId, area_id: areaId, period_start: periodStart, period_end: periodEnd, created_by_user_id: createdByUserId });
      return Promise.resolve([{ id }]);
    }
    if (text.startsWith('WITH target_schedule')) {
      const [organizationId, areaId, periodStart, versionId, createdByUserId] = values;
      const schedule = schedules.find((item) => item.organization_id === organizationId && item.area_id === areaId && item.period_start === periodStart);
      if (!schedule || versions.some((version) => version.schedule_id === schedule.id && version.status === 'DRAFT')) return Promise.resolve([]);
      const versionNumber = versions.filter((version) => version.schedule_id === schedule.id).reduce((max, version) => Math.max(max, version.version_number), 0) + 1;
      const version = { id: versionId, schedule_id: schedule.id, version_number: versionNumber, status: 'DRAFT', created_by_user_id: createdByUserId };
      versions.push(version);
      return Promise.resolve([version]);
    }
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => Promise.all(build(sql));
  sql.state = { schedules, versions };
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

async function call(method, { token = TOKEN_PLANNER, body } = {}) {
  const res = response();
  await handler({ method, body, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => { state = { sql: makeFakeSql() }; });

describe('POST /api/schedules', () => {
  it('creates the schedule and first DRAFT for a Monday period', async () => {
    const res = await call('POST', { body: { periodStart: '2026-09-07' } });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ versionNumber: 1, status: 'DRAFT' });
    expect(state.sql.state.schedules).toHaveLength(1);
    expect(state.sql.state.versions).toHaveLength(1);
  });

  it('reuses the schedule and returns 409 when a DRAFT already exists', async () => {
    expect((await call('POST', { body: { periodStart: '2026-09-07' } })).statusCode).toBe(201);
    const res = await call('POST', { body: { periodStart: '2026-09-07' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('draft');
    expect(state.sql.state.schedules).toHaveLength(1);
    expect(state.sql.state.versions).toHaveLength(1);
  });

  it('allows an area schedule for an organization-scoped planner', async () => {
    const res = await call('POST', { body: { areaId: AREA_A, periodStart: '2026-09-07' } });
    expect(res.statusCode).toBe(201);
    expect(state.sql.state.schedules[0].area_id).toBe(AREA_A);
  });

  it('allows a Sunday period for Sunday-first planning', async () => {
    const res = await call('POST', { body: { periodStart: '2026-09-06' } });
    expect(res.statusCode).toBe(201);
    expect(state.sql.state.schedules[0]).toMatchObject({
      period_start: '2026-09-06', period_end: '2026-09-12',
    });
  });

  it('rejects a period that is neither Monday nor Sunday', async () => {
    const res = await call('POST', { body: { periodStart: '2026-09-08' } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects EMPLOYEE before any schedule mutation', async () => {
    const res = await call('POST', { token: TOKEN_EMPLOYEE, body: { periodStart: '2026-09-07' } });
    expect(res.statusCode).toBe(403);
    expect(state.sql.state.schedules).toHaveLength(0);
  });
});

describe('schedule endpoint methods', () => {
  it('rejects unsupported methods', async () => {
    const res = await call('PATCH');
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
  });
});
