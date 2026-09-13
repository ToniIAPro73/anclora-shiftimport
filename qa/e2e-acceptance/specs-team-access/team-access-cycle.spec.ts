import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

interface Fixture {
  runSuffix: string;
  organizationId: string;
  ownerEmail: string;
  ownerPassword: string;
  areaId: string;
  areaName: string;
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'team-access-fixture.json'), 'utf8'));
}

function readEnvValue(name: string): string {
  const file = readFileSync(join(__dirname, '..', '..', '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

const sql = neon(readEnvValue('DATABASE_URL'));

/**
 * The real create-invitation call never returns the plaintext token (only
 * its recipient receives it, via email) — by design, the server persists
 * only its SHA-256 hash. To accept in this test environment we mint our own
 * token and overwrite that same PENDING row's stored hash to match it. This
 * never bypasses server logic: acceptance still runs the real
 * validate/accept endpoints against a real token whose hash genuinely
 * matches what is stored.
 */
async function mintAcceptableToken(organizationId: string, email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const rows = await sql`
    UPDATE user_access_invitations SET token_hash = ${tokenHash}
    WHERE id = (
      SELECT id FROM user_access_invitations
      WHERE organization_id = ${organizationId} AND email_normalized = ${email} AND status = 'PENDING'
      ORDER BY created_at DESC LIMIT 1
    )
    RETURNING id
  `;
  if (rows.length === 0) throw new Error(`No PENDING invitation found for ${email} to mint a token for`);
  return token;
}

function seedFirstRunOverlays(page: Page) {
  // First-run overlays are contractual UX but noise for this flow (same
  // seed used by the CSV-bulk Production E2E for the same reason).
  return page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  });
}

test.beforeEach(async ({ page }) => {
  await seedFirstRunOverlays(page);
});

async function loginAsOwner(page: Page, fixture: Fixture) {
  await page.goto('/login');
  await page.locator('#auth-email').fill(fixture.ownerEmail);
  await page.locator('#auth-password').fill(fixture.ownerPassword);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function openTeamModal(page: Page) {
  const membersLoaded = page.waitForResponse((r) => r.url().includes('/api/memberships') && r.request().method() === 'GET' && r.ok());
  const mobileMenu = page.locator('[data-testid="app-shell-mobile-menu"]');
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.locator('[data-testid="sidebar-team"]').click();
  await membersLoaded;
  await expect(page.getByTestId('equipo-modal')).toBeVisible();
}

async function orgState(organizationId: string, email: string) {
  const [people, employees, profiles, memberships, pendingInvitations, users] = await Promise.all([
    sql`SELECT id, status, user_id FROM organization_people WHERE organization_id = ${organizationId}`,
    sql`SELECT id, status, user_id FROM employees WHERE organization_id = ${organizationId}`,
    sql`SELECT id FROM employee_profiles WHERE organization_id = ${organizationId}`,
    sql`SELECT user_id, role FROM memberships WHERE organization_id = ${organizationId}`,
    sql`SELECT id FROM user_access_invitations WHERE organization_id = ${organizationId} AND status = 'PENDING'`,
    sql`SELECT id, account_status FROM users WHERE email = ${email}`,
  ]);
  return { people, employees, profiles, memberships, pendingInvitations, users };
}

test('full cycle: create + grant -> accept -> revoke -> grant again -> accept again, verified via UI, API and DB', async ({ page, browser }) => {
  const fixture = loadFixture();
  const personName = 'Marta Repro';
  const personEmail = `persona.taccess${fixture.runSuffix}@e2e.test`;
  const org = fixture.organizationId;

  // ==================== ESCENARIO A: creación y activación inicial ====================
  await loginAsOwner(page, fixture);
  await openTeamModal(page);

  await page.getByTestId('add-persona-button').click();
  await page.getByTestId('wizard-name-input').fill(personName);
  await page.getByTestId('wizard-next-button').click(); // 1 -> 2 (access: yes, default)
  await page.getByTestId('wizard-email-input').fill(personEmail);
  await page.getByTestId('wizard-next-button').click(); // 2 -> 3 (create employee: yes, default)
  await page.getByTestId('wizard-next-button').click(); // 3 -> 4 (role: EMPLOYEE, default)
  await page.getByTestId('wizard-next-button').click(); // 4 -> 5 (confirm)

  const createInviteRes = page.waitForResponse((r) => r.url().includes('/api/invitations') && r.request().method() === 'POST');
  await page.getByTestId('wizard-confirm-button').click();
  const createRes = await createInviteRes;
  expect(createRes.status()).toBe(201);
  await expect(page.getByTestId('add-persona-wizard')).toHaveCount(0, { timeout: 15_000 });

  let state = await orgState(org, personEmail);
  expect(state.people.length).toBe(1);
  expect(state.employees.length).toBe(1);
  expect(state.profiles.length).toBe(1);
  expect(state.pendingInvitations.length).toBe(1);
  expect(state.users.length).toBe(0); // account created only on accept

  // Accept as the invited person — a SEPARATE, unauthenticated browser
  // context: the owner's own session must stay untouched (session-conflict
  // handling is a different, already-covered feature; this test is about
  // the revoke/grant cycle itself).
  const token1 = await mintAcceptableToken(org, personEmail);
  const acceptContext1 = await browser.newContext();
  const acceptPage1 = await acceptContext1.newPage();
  await seedFirstRunOverlays(acceptPage1);
  await acceptPage1.goto(`/accept-invitation#token=${encodeURIComponent(token1)}`);
  await acceptPage1.locator('#invitation-password').fill('E2e-new-only-1234');
  await acceptPage1.locator('#invitation-passwordConfirmation').fill('E2e-new-only-1234');
  await acceptPage1.getByRole('button', { name: /crear cuenta y aceptar/i }).click();
  await expect(acceptPage1.getByText(/Acceso activado/i)).toBeVisible();
  await acceptContext1.close();

  state = await orgState(org, personEmail);
  expect(state.people.length).toBe(1);
  expect(state.employees.length).toBe(1);
  expect(state.profiles.length).toBe(1);
  expect(state.users.length).toBe(1);
  expect(state.memberships.length).toBe(1);
  expect(state.memberships[0].role).toBe('EMPLOYEE');
  expect(state.pendingInvitations.length).toBe(0);
  const personUserId = state.users[0].id as string;

  // ==================== ESCENARIO B: revocar acceso ====================
  await page.reload();
  await openTeamModal(page);

  const personaRow = page.locator(`[data-testid="persona-row-${personUserId}"]`);
  await expect(personaRow).toContainText(personName);
  await page.locator(`[data-testid="revoke-access-${personUserId}"]`).click();

  await expect(page.getByRole('heading', { name: 'Revocar acceso' })).toBeVisible();
  await expect(page.getByText(`${personName} dejará de poder entrar en esta organización. Su ficha de empleado y sus datos de trabajo se conservarán.`)).toBeVisible();
  await expect(page.getByText(/teamWorkspace\./)).toHaveCount(0);

  const revokeRes = page.waitForResponse((r) => r.url().includes('/api/memberships') && r.request().method() === 'DELETE');
  const confirmButtons = page.getByRole('button', { name: 'Revocar acceso' });
  await confirmButtons.last().click();
  const revokeResponse = await revokeRes;
  expect(revokeResponse.status()).toBe(200);
  await expect(page.getByText('Acceso revocado correctamente.')).toBeVisible();

  state = await orgState(org, personEmail);
  expect(state.people.length).toBe(1);
  expect(state.people[0].status).toBe('ACTIVE'); // persona preserved
  expect(state.employees.length).toBe(1);
  expect(state.employees[0].user_id).toBeNull(); // access link cleared
  expect(state.profiles.length).toBe(1); // ficha preserved
  expect(state.memberships.length).toBe(0); // access revoked
  expect(state.pendingInvitations.length).toBe(0);
  expect(state.users.length).toBe(1); // global account preserved
  expect(state.users[0].account_status).toBe('ACTIVE');
  const employeeId = state.employees[0].id as string;

  await page.reload();
  await openTeamModal(page);
  const revokedRow = page.locator(`[data-testid="persona-row-emp-${employeeId}"]`);
  await expect(revokedRow).toContainText(personName);
  await expect(revokedRow).toContainText('Sin acceso');

  // ==================== ESCENARIO C: volver a conceder acceso ====================
  await page.locator(`[data-testid="grant-access-emp-${employeeId}"]`).click();

  await expect(page.getByRole('heading', { name: `Conceder acceso a ${personName}` })).toBeVisible();
  await expect(page.getByText('Añadir nueva persona')).toHaveCount(0);
  await expect(page.getByText('Confirmar y crear persona')).toHaveCount(0);
  // Email already known from the prior access — prefilled, not asked again.
  await expect(page.getByTestId('grant-access-email-input')).toHaveValue(personEmail);

  await page.getByTestId('grant-access-next').click();
  await expect(page.getByRole('heading', { name: 'Revisar acceso' })).toBeVisible();

  const grantRes = page.waitForResponse((r) => r.url().includes('/api/invitations') && r.request().method() === 'POST');
  const grantReq = page.waitForRequest((r) => r.url().includes('/api/invitations') && r.method() === 'POST');
  await page.getByTestId('grant-access-submit').click();
  const sentReq = await grantReq;
  const sentBody = JSON.parse(sentReq.postData() ?? '{}');
  expect(sentBody).toMatchObject({ email: personEmail, employeeId, role: 'EMPLOYEE' });
  expect(sentBody).not.toHaveProperty('password');

  const grantResponse = await grantRes;
  // THE bug fix: this must now succeed (was 409 EMPLOYEE_ALREADY_LINKED before).
  expect(grantResponse.status()).toBe(201);
  await expect(page.getByText('Invitación enviada correctamente.')).toBeVisible();

  state = await orgState(org, personEmail);
  expect(state.people.length).toBe(1); // no duplicate person
  expect(state.employees.length).toBe(1); // no duplicate employee
  expect(state.employees[0].status).toBe('pending_access'); // reflected while the invitation is outstanding
  expect(state.profiles.length).toBe(1); // no duplicate profile
  expect(state.users.length).toBe(1); // no duplicate user
  expect(state.pendingInvitations.length).toBe(1); // exactly one pending invitation

  await expect(page.getByText('Acceso pendiente')).toBeVisible();
  await expect(page.getByText('Invitaciones pendientes')).toBeVisible();
  await expect(page.getByText(personEmail)).toBeVisible();

  // Escenario E (regression): a second re-grant attempt while one is already
  // pending must fail, translated, with the form kept open.
  await page.locator(`[data-testid="grant-access-emp-${employeeId}"]`).click();
  await page.getByTestId('grant-access-next').click();
  const dupRes = page.waitForResponse((r) => r.url().includes('/api/invitations') && r.request().method() === 'POST');
  await page.getByTestId('grant-access-submit').click();
  const dupResponse = await dupRes;
  expect(dupResponse.status()).toBe(409);
  await expect(page.getByText('Ya existe una invitación pendiente para este email.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revisar acceso' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.reload();
  await openTeamModal(page);
  await expect(page.getByText('Acceso pendiente')).toBeVisible();

  // ==================== ESCENARIO D: aceptar nuevamente ====================
  const token2 = await mintAcceptableToken(org, personEmail);
  const acceptContext2 = await browser.newContext();
  const acceptPage2 = await acceptContext2.newPage();
  await seedFirstRunOverlays(acceptPage2);
  await acceptPage2.goto(`/accept-invitation#token=${encodeURIComponent(token2)}`);
  await expect(acceptPage2.locator('#invitation-password')).toHaveCount(0); // existing account: no password requested
  await acceptPage2.getByRole('button', { name: /añadir acceso y aceptar/i }).click();
  await expect(acceptPage2.getByText(/Acceso activado/i)).toBeVisible();
  await acceptContext2.close();

  state = await orgState(org, personEmail);
  expect(state.people.length).toBe(1);
  expect(state.employees.length).toBe(1);
  expect(state.profiles.length).toBe(1);
  expect(state.users.length).toBe(1); // still the same single account
  expect(state.memberships.length).toBe(1);
  expect(state.pendingInvitations.length).toBe(0);
});
