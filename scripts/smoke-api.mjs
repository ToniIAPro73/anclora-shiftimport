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
import personalOnboardingHandler from '../api/onboarding/personal.js';
import companyOnboardingHandler from '../api/onboarding/company.js';
import requestResetHandler from '../api/auth/request-reset.js';
import resetPasswordHandler from '../api/auth/reset-password.js';

/** request-reset.js logs the reset link instead of emailing it (Fase
 * 1.2D.4 delivery gap) — capture that line to redeem the token in-process. */
async function callCapturingToken(handler, request) {
  const originalLog = console.log;
  let captured = null;
  console.log = (...args) => {
    const line = args.join(' ');
    const match = line.match(/token=([^\s&]+)/);
    if (match) {
      captured = match[1];
    }
    originalLog(...args);
  };
  try {
    const res = await call(handler, request);
    return { res, token: captured };
  } finally {
    console.log = originalLog;
  }
}

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

const req = (method, { body, query, cookie, orgHeader, ip } = {}) => ({
  method,
  body,
  query: query ?? {},
  headers: {
    ...(cookie ? { cookie } : {}),
    ...(orgHeader ? { 'x-organization-id': orgHeader } : {}),
    ...(ip ? { 'x-forwarded-for': ip } : {}),
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

  // Fase 1.2C: register no longer auto-creates an org — the "Para mí"
  // onboarding choice does, explicitly, right after signup.
  const onboardA = await call(personalOnboardingHandler, req('POST', { cookie: cookieA }));
  check('personal onboarding creates org+employee', onboardA.statusCode === 201);

  // Tenant B
  const regB = await call(registerHandler, req('POST', {
    body: { email: `smoke-b-${suffix}@example.com`, password: 'smoke-pass-1234', displayName: 'Smoke B' },
  }));
  const cookieB = String(regB.headers['set-cookie']).split(';')[0];
  const onboardB = await call(personalOnboardingHandler, req('POST', { cookie: cookieB }));
  check('personal onboarding is idempotency-guarded per user', onboardB.statusCode === 201);
  const onboardBAgain = await call(personalOnboardingHandler, req('POST', { cookie: cookieB }));
  check('repeating onboarding after completion is rejected (409)', onboardBAgain.statusCode === 409);

  const meA = await call(meHandler, req('GET', { cookie: cookieA }));
  check('session A resolves org+role+employee', meA.body.role === 'ADMIN' && Boolean(meA.body.organizationId) && Boolean(meA.body.employeeId));
  check('personal onboarding defaults plan to free', meA.body.plan === 'free');
  const orgA = meA.body.organizationId;
  const selfA = meA.body.employeeId;
  const meBInitial = await call(meHandler, req('GET', { cookie: cookieB }));
  check('personal onboarding (B) defaults plan to free', meBInitial.body.plan === 'free');
  const orgB = meBInitial.body.organizationId;
  check('two tenants are distinct organizations', orgA !== orgB);

  // Fase 1.2G: the multi-employee / membership infra checks below predate
  // plan enforcement and are not exercising plan gating themselves — lift
  // org A onto Team directly via SQL (same pattern as the rate-limit
  // window aging below) so they keep testing what they always tested.
  // Dedicated plan-enforcement checks run further down using org B.
  await sql`UPDATE organizations SET plan = 'team' WHERE id = ${orgA}`;

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
  check('multi-employee same-day upsert (no conflict)', upsert.statusCode === 200 && upsert.body.saved.length === 2);

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

  // ---- Fase 1.2C.4: company onboarding ("Para mi empresa") --------------
  const regC = await call(registerHandler, req('POST', {
    body: { email: `smoke-c-${suffix}@example.com`, password: 'smoke-pass-1234', displayName: '' },
  }));
  const cookieC = String(regC.headers['set-cookie']).split(';')[0];

  const companyMissingAdmin = await call(companyOnboardingHandler, req('POST', {
    cookie: cookieC,
    body: { companyName: 'Smoke Co' },
  }));
  check('company onboarding requires admin name when account has none', companyMissingAdmin.statusCode === 400);

  const companyOk = await call(companyOnboardingHandler, req('POST', {
    cookie: cookieC,
    body: { companyName: 'Smoke Co', adminName: 'Smoke Admin' },
  }));
  check('company onboarding creates org (no self employee)', companyOk.statusCode === 201);
  const orgC = companyOk.body.organizationId;

  const meC = await call(meHandler, req('GET', { cookie: cookieC }));
  check(
    'company onboarding: ADMIN role, org type company, no self employee',
    meC.body.role === 'ADMIN' && meC.body.employeeId === null
      && meC.body.memberships[0]?.organizationType === 'company',
  );
  check('company onboarding grants plan team (pre-billing trial grant, §4 pricing-hypothesis.md)', meC.body.plan === 'team');

  // ---- Fase 1.2G: plan model & entitlement enforcement -------------------
  // Org B is still on its default 'free' plan (untouched above) — use it to
  // exercise the real backend gates end to end.
  const blockedFreeEmployee = await call(employeesHandler, req('POST', { cookie: cookieB, body: { name: 'Segundo Empleado B' } }));
  check('FREE plan blocks a 2nd employee (403 PLAN_LIMIT)', blockedFreeEmployee.statusCode === 403 && blockedFreeEmployee.body.code === 'PLAN_LIMIT');

  const blockedFreeInvite = await call(membershipsHandler, req('POST', { cookie: cookieB, body: { email: `smoke-invite-${suffix}@example.com`, role: 'EMPLOYEE', password: 'temporal-123' } }));
  check('FREE plan blocks inviting a member (403 PLAN_LIMIT)', blockedFreeInvite.statusCode === 403 && blockedFreeInvite.body.code === 'PLAN_LIMIT');

  await sql`UPDATE organizations SET plan = 'personal' WHERE id = ${orgB}`;
  const blockedPersonalEmployee = await call(employeesHandler, req('POST', { cookie: cookieB, body: { name: 'Segundo Empleado B (personal)' } }));
  check('PERSONAL plan also blocks a 2nd employee (403 PLAN_LIMIT)', blockedPersonalEmployee.statusCode === 403 && blockedPersonalEmployee.body.code === 'PLAN_LIMIT');

  await sql`UPDATE organizations SET plan = 'team' WHERE id = ${orgB}`;
  const allowedTeamEmployee = await call(employeesHandler, req('POST', { cookie: cookieB, body: { name: 'Segundo Empleado B (team)' } }));
  check('TEAM plan allows a 2nd employee', allowedTeamEmployee.statusCode === 201);

  const allowedTeamInvite = await call(membershipsHandler, req('POST', { cookie: cookieB, body: { email: `smoke-invite-${suffix}@example.com`, role: 'EMPLOYEE', password: 'temporal-123' } }));
  check('TEAM plan allows inviting a member', allowedTeamInvite.statusCode === 201);

  // Commercial-intent routing (§1.2G.15): the client can send any plan it
  // likes, but personal onboarding only ever whitelists free|personal.
  const regD = await call(registerHandler, req('POST', {
    body: { email: `smoke-d-${suffix}@example.com`, password: 'smoke-pass-1234', displayName: 'Smoke D' },
  }));
  const cookieD = String(regD.headers['set-cookie']).split(';')[0];
  const onboardD = await call(personalOnboardingHandler, req('POST', { cookie: cookieD, body: { plan: 'team' } }));
  const meD = await call(meHandler, req('GET', { cookie: cookieD }));
  check('personal onboarding never grants team even if the client requests it', onboardD.statusCode === 201 && meD.body.plan === 'free');
  const orgD = meD.body.organizationId;

  // ---- Fase 1.2D: password recovery ---------------------------------
  const reqUnknown = await call(requestResetHandler, req('POST', { body: { email: `nobody-${suffix}@example.com` } }));
  const { res: reqA, token: resetTokenA } = await callCapturingToken(
    requestResetHandler,
    req('POST', { body: { email: `smoke-a-${suffix}@example.com` } }),
  );
  check(
    'request-reset responds identically for unknown vs known email (no enumeration)',
    reqUnknown.statusCode === 200 && reqA.statusCode === 200
      && JSON.stringify(reqUnknown.body) === JSON.stringify(reqA.body),
  );
  check('request-reset issues a token for a known email', Boolean(resetTokenA));

  const wrongToken = await call(resetPasswordHandler, req('POST', { body: { token: 'not-a-real-token', newPassword: 'new-pass-1234' } }));
  check('reset-password rejects an unknown token (400)', wrongToken.statusCode === 400);

  const resetOk = await call(resetPasswordHandler, req('POST', { body: { token: resetTokenA, newPassword: 'new-pass-1234' } }));
  check('reset-password accepts a valid token', resetOk.statusCode === 200);

  const oldLoginFails = await call(loginHandler, req('POST', { body: { email: `smoke-a-${suffix}@example.com`, password: 'smoke-pass-1234' } }));
  check('old password no longer works after reset', oldLoginFails.statusCode === 401);
  const newLoginWorks = await call(loginHandler, req('POST', { body: { email: `smoke-a-${suffix}@example.com`, password: 'new-pass-1234' } }));
  check('new password works after reset', newLoginWorks.statusCode === 200);

  const meAAfterReset = await call(meHandler, req('GET', { cookie: cookieA }));
  check('reset-password invalidated the pre-existing session', meAAfterReset.statusCode === 401);

  const reuseToken = await call(resetPasswordHandler, req('POST', { body: { token: resetTokenA, newPassword: 'another-pass-1234' } }));
  check('reset token is single-use (409/400 on reuse)', reuseToken.statusCode === 400);

  // ---- Fase 1.2E: distributed login rate limiting ------------------------
  const RL_IP = '198.51.100.77';
  const rlEmail = `smoke-rl-${suffix}@example.com`;
  const otherEmail = `smoke-rl-other-${suffix}@example.com`;

  const regRL = await call(registerHandler, req('POST', { body: { email: rlEmail, password: 'rl-correct-pass1', displayName: 'RL' } }));
  const cookieRL = String(regRL.headers['set-cookie']).split(';')[0];
  const onboardRL = await call(personalOnboardingHandler, req('POST', { cookie: cookieRL }));
  const orgRL = onboardRL.body.organizationId;

  // Allowed: attempts under the per-email threshold (10) all get a normal
  // 401, never 429.
  let allUnder429 = true;
  for (let i = 0; i < 5; i += 1) {
    const attempt = await call(loginHandler, req('POST', { ip: RL_IP, body: { email: rlEmail, password: 'wrong-pass' } }));
    if (attempt.statusCode !== 401) allUnder429 = false;
  }
  check('rate limit: attempts under the threshold are allowed through (401, not 429)', allUnder429);

  // Blocked: push past the per-email threshold.
  for (let i = 0; i < 6; i += 1) {
    await call(loginHandler, req('POST', { ip: RL_IP, body: { email: rlEmail, password: 'wrong-pass' } }));
  }
  const blocked = await call(loginHandler, req('POST', { ip: RL_IP, body: { email: rlEmail, password: 'wrong-pass' } }));
  check('rate limit: blocks once the per-email threshold is exceeded (429)', blocked.statusCode === 429);

  // Isolation: the same email from a different IP is still blocked (the
  // per-email limit does not depend on source IP)...
  const blockedOtherIp = await call(loginHandler, req('POST', { ip: '203.0.113.5', body: { email: rlEmail, password: 'wrong-pass' } }));
  check('rate limit: per-email block applies across different IPs', blockedOtherIp.statusCode === 429);

  // ...but a different identity on the same (now-implicated) IP is not
  // blocked by the email limiter — isolation between identities.
  const notBlockedOtherEmail = await call(loginHandler, req('POST', { ip: RL_IP, body: { email: otherEmail, password: 'whatever' } }));
  check('rate limit: a different identity on the same IP is not blocked by the email limiter', notBlockedOtherEmail.statusCode === 401);

  // Blocking happens before credential verification: even the correct
  // password is refused while rate-limited.
  const correctWhileBlocked = await call(loginHandler, req('POST', { ip: RL_IP, body: { email: rlEmail, password: 'rl-correct-pass1' } }));
  check('rate limit: blocks even the correct password once tripped', correctWhileBlocked.statusCode === 429);

  // Expiration: age the window back past 5 minutes (waiting on real
  // wall-clock time would be impractical here) and confirm the next
  // attempt is let through again.
  await sql`UPDATE login_attempts SET window_start = NOW() - INTERVAL '10 minutes' WHERE id_key = ${`email:${rlEmail}`}`;
  const afterExpiry = await call(loginHandler, req('POST', { ip: RL_IP, body: { email: rlEmail, password: 'rl-correct-pass1' } }));
  check('rate limit: expired window allows a fresh attempt through (successful login)', afterExpiry.statusCode === 200);

  // Success clears the counters: the very next wrong attempt starts a
  // fresh window instead of being instantly blocked.
  const freshAfterSuccess = await call(loginHandler, req('POST', { ip: RL_IP, body: { email: rlEmail, password: 'wrong-pass' } }));
  check('rate limit: a successful login clears the counters (next failure is not instantly blocked)', freshAfterSuccess.statusCode === 401);

  // Cleanup: deleting organizations cascades employees/imports/shifts/memberships.
  const emailPattern = `smoke-%-${suffix}@example.com`;
  await sql`DELETE FROM organizations WHERE id = ${orgA} OR id = ${orgB} OR id = ${orgC} OR id = ${orgD} OR id = ${orgRL}`;
  await sql`DELETE FROM users WHERE email LIKE ${emailPattern}`;
  await sql`DELETE FROM login_attempts WHERE id_key IN (${`ip:${RL_IP}`}, ${`ip:203.0.113.5`}, ${`email:${rlEmail}`}, ${`email:${otherEmail}`}, ${'ip:unknown'})`;

  const failed = results.filter(([, ok]) => !ok);
  console.log(failed.length === 0 ? `\nSMOKE OK (${results.length} checks)` : `\nSMOKE FAILED (${failed.length})`);
  process.exit(failed.length === 0 ? 0 : 1);
};

run().catch(async (error) => {
  console.error('smoke error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
