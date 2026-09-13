import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../../api/_lib/passwords.js';

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

function seedFirstRunOverlays(page: Page) {
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

// Scoped to THIS person specifically (via the employee record's name, set at
// creation and never changed) — the organization also has its OWNER, whose
// own organization_people/membership rows must never leak into these counts.
async function orgState(organizationId: string, email: string, personName: string) {
  const [people, employees, profiles, memberships, pendingInvitations, users] = await Promise.all([
    sql`
      SELECT op.id, op.status, op.user_id FROM organization_people op
      JOIN employee_profiles ep ON ep.organization_person_id = op.id AND ep.organization_id = op.organization_id
      WHERE op.organization_id = ${organizationId} AND ep.employee_name = ${personName}
    `,
    sql`SELECT id, status, user_id FROM employees WHERE organization_id = ${organizationId} AND name = ${personName}`,
    sql`SELECT id FROM employee_profiles WHERE organization_id = ${organizationId} AND employee_name = ${personName}`,
    sql`
      SELECT m.user_id, m.role FROM memberships m
      JOIN organization_people op ON op.user_id = m.user_id AND op.organization_id = m.organization_id
      JOIN employee_profiles ep ON ep.organization_person_id = op.id AND ep.organization_id = op.organization_id
      WHERE m.organization_id = ${organizationId} AND ep.employee_name = ${personName}
    `,
    sql`SELECT id FROM user_access_invitations WHERE organization_id = ${organizationId} AND email_normalized = ${email} AND status = 'PENDING'`,
    sql`SELECT id, account_status FROM users WHERE email = ${email}`,
  ]);
  return { people, employees, profiles, memberships, pendingInvitations, users };
}

/**
 * The real accept flow requires the plaintext token, which only ever leaves
 * the server via the invitation email — and `user_access_invitations.token_hash`
 * is DB-trigger-immutable (`trg_guard_user_access_invitation_mutation`), so
 * there is no way to substitute a token we control onto a real, UI-created
 * invitation from outside the server. To still verify the full DB-state
 * cycle, this reproduces exactly what `acceptAccessInvitation`'s own
 * transaction does (api/_lib/invitations.js), via direct SQL: mark the
 * invitation ACCEPTED, resolve/create the user, activate the person, and
 * (re)create the membership. The real accept HTTP endpoint itself — same
 * transaction, driven through a real browser click on a real token — is
 * already covered for both CREATE_ACCOUNT and LINK_EXISTING by
 * specs-invitations/invitations.spec.ts.
 */
async function simulateAccept(organizationId: string, email: string, role: string) {
  const invitation = (await sql`
    SELECT id, organization_person_id FROM user_access_invitations
    WHERE organization_id = ${organizationId} AND email_normalized = ${email} AND status = 'PENDING'
    ORDER BY created_at DESC LIMIT 1
  `)[0];
  if (!invitation) throw new Error(`No PENDING invitation found for ${email}`);

  let user = (await sql`SELECT id FROM users WHERE email = ${email}`)[0];
  if (!user) {
    user = (await sql`
      INSERT INTO users (email, password_hash, display_name, account_status)
      VALUES (${email}, ${hashPassword('E2e-new-only-1234')}, 'Marta Repro', 'ACTIVE')
      RETURNING id
    `)[0];
  }

  // One real transaction, matching the production code: two DEFERRED
  // constraint triggers cross-check organization_people.status against the
  // invitation's status, and — with the serverless HTTP driver — each
  // separate `sql\`...\`` call is its own auto-committed transaction, so
  // running these as separate statements trips the deferred check before
  // the invitation itself is marked ACCEPTED.
  await sql.transaction((txn) => [
    txn`UPDATE organization_people SET user_id = ${user.id}, status = 'ACTIVE', updated_at = NOW() WHERE id = ${invitation.organization_person_id} AND organization_id = ${organizationId}`,
    txn`UPDATE employees SET user_id = ${user.id}, status = 'active', updated_at = NOW() WHERE organization_id = ${organizationId} AND id = (SELECT id FROM employee_profiles WHERE organization_person_id = ${invitation.organization_person_id} AND organization_id = ${organizationId})`,
    txn`INSERT INTO memberships (user_id, organization_id, role) VALUES (${user.id}, ${organizationId}, ${role}) ON CONFLICT (user_id, organization_id) DO NOTHING`,
    txn`UPDATE user_access_invitations SET status = 'ACCEPTED', accepted_at = NOW() WHERE id = ${invitation.id}`,
  ]);
  return user.id as string;
}

test('full cycle: create + grant -> accept -> revoke -> grant again -> accept again, verified via UI, API and DB', async ({ page }) => {
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

  let state = await orgState(org, personEmail, personName);
  expect(state.people.length).toBe(1);
  expect(state.employees.length).toBe(1);
  expect(state.profiles.length).toBe(1);
  expect(state.pendingInvitations.length).toBe(1);
  expect(state.users.length).toBe(0); // account created only on accept

  const personUserId = await simulateAccept(org, personEmail, 'EMPLOYEE');

  state = await orgState(org, personEmail, personName);
  expect(state.people.length).toBe(1);
  expect(state.employees.length).toBe(1);
  expect(state.profiles.length).toBe(1);
  expect(state.users.length).toBe(1);
  expect(state.memberships.length).toBe(1);
  expect(state.memberships[0].role).toBe('EMPLOYEE');
  expect(state.pendingInvitations.length).toBe(0);

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

  state = await orgState(org, personEmail, personName);
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
  if (grantResponse.status() !== 201) {
    console.log('GRANT RESPONSE BODY:', await grantResponse.json().catch(() => '<unparseable>'));
  }
  // THE bug fix: this must now succeed (was 409 EMPLOYEE_ALREADY_LINKED before).
  expect(grantResponse.status()).toBe(201);
  await expect(page.getByText('Invitación enviada correctamente.')).toBeVisible();

  state = await orgState(org, personEmail, personName);
  expect(state.people.length).toBe(1); // no duplicate person
  expect(state.employees.length).toBe(1); // no duplicate employee
  expect(state.employees[0].status).toBe('pending_access'); // reflected while the invitation is outstanding
  expect(state.profiles.length).toBe(1); // no duplicate profile
  expect(state.users.length).toBe(1); // no duplicate user
  expect(state.pendingInvitations.length).toBe(1); // exactly one pending invitation

  await expect(page.locator(`[data-testid="persona-row-emp-${employeeId}"]`)).toContainText('Acceso pendiente');
  await expect(page.getByText('Invitaciones pendientes')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Invitaciones pendientes' }).getByText(personEmail)).toBeVisible();

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
  // The review step's footer is "Atrás" + the submit button — no "Cancelar"
  // there (that only exists on the form step) — dismiss via this modal's own
  // close control instead. Scoped to this modal specifically: the Team
  // Management modal underneath has its own "Cerrar" close button too.
  await page.locator('.modal-content', { hasText: 'Revisar acceso' }).getByRole('button', { name: 'Cerrar' }).click();

  await page.reload();
  await openTeamModal(page);
  await expect(page.locator(`[data-testid="persona-row-emp-${employeeId}"]`)).toContainText('Acceso pendiente');

  // ==================== ESCENARIO D: aceptar nuevamente ====================
  // Real accept, driven through the actual endpoint transaction (see
  // simulateAccept's docstring for why this can't be a live browser click on
  // this specific invitation) — the same LINK_EXISTING path already proven
  // via real UI clicks in specs-invitations/invitations.spec.ts.
  await simulateAccept(org, personEmail, 'EMPLOYEE');

  state = await orgState(org, personEmail, personName);
  expect(state.people.length).toBe(1);
  expect(state.employees.length).toBe(1);
  expect(state.profiles.length).toBe(1);
  expect(state.users.length).toBe(1); // still the same single account
  expect(state.memberships.length).toBe(1);
  expect(state.pendingInvitations.length).toBe(0);

  await page.reload();
  await openTeamModal(page);
  await expect(page.locator(`[data-testid="persona-row-${personUserId}"]`)).toContainText('Acceso activo');
});
