// End-to-end smoke test of the Phase 1 API against the real dev database.
// Creates two organizations (two users), exercises isolation invariants,
// then removes every row it created. Usage:
//   node --env-file=.env.development.local scripts/smoke-api.mjs
import { neon } from '@neondatabase/serverless';
import registerHandler from '../api/auth/register.js';
import loginHandler from '../api/auth/login.js';
import meHandler from '../api/session/me.js';
import employeesHandler from '../api/employees/index.js';
import shiftsHandler from '../api/shifts/index.js';
import importsHandler from '../api/imports/index.js';

const sql = neon(process.env.DATABASE_URL);
const suffix = Date.now().toString(36);

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
  return res;
}

const req = (method, { body, query, cookie } = {}) => ({
  method,
  body,
  query: query ?? {},
  headers: cookie ? { cookie } : {},
});

const call = async (handler, request) => {
  const res = mockRes();
  await handler(request, res);
  return res;
};

const results = [];
const check = (name, ok) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const run = async () => {
  // Tenant A
  const regA = await call(registerHandler, req('POST', {
    body: { email: `smoke-a-${suffix}@example.com`, password: 'smoke-pass-1234', displayName: 'Smoke A' },
  }));
  check('register A', regA.statusCode === 201);
  const cookieA = String(regA.headers['set-cookie']).split(';')[0];

  // Tenant B
  const regB = await call(registerHandler, req('POST', {
    body: { email: `smoke-b-${suffix}@example.com`, password: 'smoke-pass-1234', displayName: 'Smoke B' },
  }));
  const cookieB = String(regB.headers['set-cookie']).split(';')[0];

  const meA = await call(meHandler, req('GET', { cookie: cookieA }));
  check('session A resolves org+role+employee', meA.body.role === 'ADMIN' && Boolean(meA.body.organizationId) && Boolean(meA.body.employeeId));
  const orgA = meA.body.organizationId;
  const selfA = meA.body.employeeId;
  const orgB = (await call(meHandler, req('GET', { cookie: cookieB }))).body.organizationId;
  check('two tenants are distinct organizations', orgA !== orgB);

  // A creates second employee (inline alta)
  const created = await call(employeesHandler, req('POST', { cookie: cookieA, body: { name: 'Empleada Dos', externalEmployeeId: `E${suffix}` } }));
  check('ADMIN creates employee without user', created.statusCode === 201 && created.body.employee.userId === null);
  const emp2 = created.body.employee.id;

  // Import record + shifts: two employees, same date, no conflict
  const imp = await call(importsHandler, req('POST', { cookie: cookieA, body: { fileName: 'smoke.pdf', sourceFormat: 'pdf', periodYear: 2026, periodMonth: 8 } }));
  check('import registered', imp.statusCode === 201);
  const importId = imp.body.import.id;

  const upsert = await call(shiftsHandler, req('PATCH', {
    cookie: cookieA,
    body: {
      employeeId: selfA,
      upserts: [
        { employeeId: selfA, importId, date: '2026-09-04', startTime: '17:00', endTime: '01:00', location: 'Regular', origin: 'IMP' },
        { employeeId: emp2, importId, date: '2026-09-04', startTime: '14:00', endTime: '22:00', location: 'Regular', origin: 'IMP' },
      ],
    },
  }));
  check('multi-employee same-day upsert (no conflict)', upsert.statusCode === 200 && upsert.body.saved === 2);

  const listSelf = await call(shiftsHandler, req('GET', { cookie: cookieA, query: { employeeId: selfA } }));
  const listEmp2 = await call(shiftsHandler, req('GET', { cookie: cookieA, query: { employeeId: emp2 } }));
  check('per-employee isolation inside org', listSelf.body.shifts.length === 1 && listEmp2.body.shifts.length === 1
    && listSelf.body.shifts[0].startTime === '17:00' && listEmp2.body.shifts[0].startTime === '14:00');

  // Cross-tenant: B tries to read A's employee and to write into it
  const crossRead = await call(shiftsHandler, req('GET', { cookie: cookieB, query: { employeeId: selfA } }));
  check('cross-tenant read blocked (403)', crossRead.statusCode === 403);
  const crossWrite = await call(shiftsHandler, req('PATCH', {
    cookie: cookieB,
    body: { employeeId: selfA, upserts: [{ employeeId: selfA, date: '2026-09-05', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' }] },
  }));
  check('cross-tenant write blocked (403)', crossWrite.statusCode === 403);

  // Re-import idempotency: same shift upserted again keeps single row
  const again = await call(shiftsHandler, req('PATCH', {
    cookie: cookieA,
    body: { employeeId: selfA, upserts: [{ id: listSelf.body.shifts[0].id, employeeId: selfA, importId, date: '2026-09-04', startTime: '17:00', endTime: '01:00', location: 'Regular', origin: 'IMP' }] },
  }));
  const afterReimport = await call(shiftsHandler, req('GET', { cookie: cookieA, query: { employeeId: selfA } }));
  check('re-import idempotent (still 1 shift)', again.statusCode === 200 && afterReimport.body.shifts.length === 1);

  // Unauthenticated blocked
  const anon = await call(shiftsHandler, req('GET', { query: {} }));
  check('anonymous request blocked (401)', anon.statusCode === 401);

  // Login/logout roundtrip for A
  const loginA = await call(loginHandler, req('POST', { body: { email: `smoke-a-${suffix}@example.com`, password: 'smoke-pass-1234' } }));
  check('login A', loginA.statusCode === 200);

  // Cleanup: deleting organizations cascades employees/imports/shifts/memberships.
  const emailPattern = `smoke-%-${suffix}@example.com`;
  await sql`DELETE FROM organizations WHERE id = ${orgA} OR id = ${orgB}`;
  await sql`DELETE FROM users WHERE email LIKE ${emailPattern}`;

  const failed = results.filter(([, ok]) => !ok);
  console.log(failed.length === 0 ? `\nSMOKE OK (${results.length} checks)` : `\nSMOKE FAILED (${failed.length})`);
  process.exit(failed.length === 0 ? 0 : 1);
};

run().catch(async (error) => {
  console.error('smoke error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
