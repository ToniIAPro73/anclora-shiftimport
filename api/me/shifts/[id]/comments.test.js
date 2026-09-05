import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-comments';
const EMPLOYEE = 'employee-comments';
const USER = 'user-comments';
const TOKEN = 'comments-token';
const SHIFT_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_SHIFT_ID = '22222222-2222-4222-8222-222222222222';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./comments.js');

function makeFakeSql() {
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
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, organization_name: 'Org Comments', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('WITH owned_shift')) {
      if (values[0] !== SHIFT_ID || values[1] !== ORG || values[2] !== EMPLOYEE) {
        return Promise.resolve([]);
      }
      const row = {
        id: `comment-${state.created.length + 1}`,
        shift_id: SHIFT_ID,
        employee_id: EMPLOYEE,
        body: values[3],
        created_at: `2026-09-05T10:0${state.created.length}.000Z`,
      };
      state.created.push(row);
      return Promise.resolve([row]);
    }
    if (text.includes('FROM shifts')) {
      return Promise.resolve(values[0] === SHIFT_ID && values[1] === ORG && values[2] === EMPLOYEE ? [{ id: SHIFT_ID }] : []);
    }
    if (text.includes('FROM shift_comments')) {
      return Promise.resolve(state.comments);
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

async function call({ id = SHIFT_ID, token = TOKEN, method = 'GET', body } = {}) {
  const res = response();
  await handler({ method, query: { id }, body, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = {
    role: 'EMPLOYEE',
    created: [],
    comments: [
      { id: 'comment-1', shift_id: SHIFT_ID, employee_id: EMPLOYEE, body: 'Primero', created_at: '2026-09-05T08:00:00.000Z' },
      { id: 'comment-2', shift_id: SHIFT_ID, employee_id: EMPLOYEE, body: 'Segundo', created_at: '2026-09-05T09:00:00.000Z' },
    ],
    sql: null,
  };
  state.sql = makeFakeSql();
});

describe('/api/me/shifts/:id/comments', () => {
  it('lists only own comments in chronological order', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.comments.map((comment) => comment.body)).toEqual(['Primero', 'Segundo']);
    expect(res.body.comments[0]).toMatchObject({ shiftId: SHIFT_ID, employeeId: EMPLOYEE });
    expect(state.sql.calls.some((entry) => entry.text.includes('ORDER BY created_at ASC, id ASC'))).toBe(true);
  });

  it('creates a trimmed plain-text comment and returns 201', async () => {
    const res = await call({ method: 'POST', body: { body: '  <b>Nota</b>  ' } });
    expect(res.statusCode).toBe(201);
    expect(res.body.comment).toMatchObject({ shiftId: SHIFT_ID, employeeId: EMPLOYEE, body: '<b>Nota</b>' });
    expect(state.created).toHaveLength(1);
    expect(state.sql.calls.some((entry) => entry.text.includes('INSERT INTO shift_comments'))).toBe(true);
  });

  it('rejects empty and overlong bodies without a write', async () => {
    const empty = await call({ method: 'POST', body: { body: '   ' } });
    const tooLong = await call({ method: 'POST', body: { body: 'x'.repeat(2001) } });
    expect(empty.statusCode).toBe(400);
    expect(tooLong.statusCode).toBe(400);
    expect(state.created).toHaveLength(0);
    expect(state.sql.calls.some((entry) => entry.text.includes('INSERT INTO shift_comments'))).toBe(false);
  });

  it('returns uniform 404 for another employee or tenant', async () => {
    const res = await call({ id: FOREIGN_SHIFT_ID });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Shift not found' });
  });

  it('does not allow ADMIN to read or create employee comments', async () => {
    state.role = 'ADMIN';
    const list = await call();
    const create = await call({ method: 'POST', body: { body: 'Nope' } });
    expect(list.statusCode).toBe(403);
    expect(create.statusCode).toBe(403);
    expect(state.created).toHaveLength(0);
  });

  it('rejects malformed ids, anonymous requests and unsupported methods', async () => {
    expect((await call({ id: 'bad', token: null })).statusCode).toBe(404);
    expect((await call({ token: null })).statusCode).toBe(401);
    const method = await call({ method: 'DELETE' });
    expect(method.statusCode).toBe(405);
    expect(method.headers.allow).toBe('GET, POST');
  });
});
