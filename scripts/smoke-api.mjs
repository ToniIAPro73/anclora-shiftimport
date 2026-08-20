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
import membershipsHandler from '../api/memberships/index.js';

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

const req = (method, { body, query, cookie, orgHeader } = {}) => ({
  method,
  body,
  query: query ?? {},
  headers: {
    ...(cookie ? { cookie } : {}),
    ...(orgHeader ? { 'x-organization-id': orgHeader } : {}),
  },
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

  // ---- Fase 1.1: memberships + multi-org --------------------------------
  // ADMIN A adds user B as EMPLOYEE of org A, linked to emp2.
  const addB = await call(membershipsHandler, req('POST', {
    cookie: cookieA,
    body: { email: `smoke-b-${suffix}@example.com`, role: 'EMPLOYEE', employeeId: emp2 },
  }));
  check('ADMIN adds existing user as member + employee link', addB.statusCode === 201);

  const membersA = await call(membershipsHandler, req('GET', { cookie: cookieA }));
  check('membership list org-scoped', membersA.statusCode === 200 && membersA.body.members.length === 2);

  // B now has 2 memberships: without header there is NO active org.
  const meBmulti = await call(meHandler, req('GET', { cookie: cookieB }));
  check('multi-org session without selection has no active org', meBmulti.statusCode === 200 && meBmulti.body.organizationId === null);
  const noOrg = await call(shiftsHandler, req('GET', { cookie: cookieB, query: {} }));
  check('data endpoint without org selection → 400', noOrg.statusCode === 400);

  // B explicitly selects org A: role EMPLOYEE linked to emp2.
  const meBinA = await call(meHandler, req('GET', { cookie: cookieB, orgHeader: orgA }));
  check('explicit org selection validated', meBinA.statusCode === 200 && meBinA.body.role === 'EMPLOYEE' && meBinA.body.employeeId === emp2);

  // B (EMPLOYEE in A) cannot write shifts for another employee of A.
  const empWrite = await call(shiftsHandler, req('PATCH', {
    cookie: cookieB,
    orgHeader: orgA,
    body: { employeeId: selfA, upserts: [{ employeeId: selfA, date: '2026-09-06', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' }] },
  }));
  const selfAAfter = await call(shiftsHandler, req('GET', { cookie: cookieA, query: { employeeId: selfA } }));
  check('EMPLOYEE write forced to own employee (no cross write)', empWrite.statusCode === 200 && selfAAfter.body.shifts.length === 1);
  const emp2After = await call(shiftsHandler, req('GET', { cookie: cookieA, query: { employeeId: emp2 } }));
  check('forced write landed on own employee', emp2After.body.shifts.length === 2);

  // B cannot manage memberships (no privilege escalation).
  const escB = await call(membershipsHandler, req('POST', { cookie: cookieB, orgHeader: orgA, body: { email: 'x@example.com', role: 'ADMIN', password: 'temporal-123' } }));
  check('EMPLOYEE cannot add members (403)', escB.statusCode === 403);

  // Last ADMIN protections.
  const demoteSelf = await call(membershipsHandler, req('PATCH', { cookie: cookieA, body: { userId: meA.body.user.id, role: 'MANAGER' } }));
  check('last ADMIN cannot be demoted (400)', demoteSelf.statusCode === 400);
  const removeSelf = await call(membershipsHandler, req('DELETE', { cookie: cookieA, body: { userId: meA.body.user.id } }));
  check('self-removal blocked (400)', removeSelf.statusCode === 400);

  // Remove B from org A; employee link released.
  const removeB = await call(membershipsHandler, req('DELETE', { cookie: cookieA, body: { userId: meBmulti.body.user.id } }));
  check('ADMIN removes membership', removeB.statusCode === 200);
  const meBafter = await call(meHandler, req('GET', { cookie: cookieB, orgHeader: orgA }));
  check('revoked membership no longer activates org', meBafter.statusCode === 200 && meBafter.body.organizationId === null);

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
