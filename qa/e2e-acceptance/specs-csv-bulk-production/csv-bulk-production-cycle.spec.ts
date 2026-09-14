import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../../api/_lib/passwords.js';

interface Fixture {
  runId: string;
  organizationId: string;
  ownerEmail: string;
  ownerPassword: string;
  nonAdminEmail: string;
  nonAdminPassword: string;
  areaId: string;
  areaName: string;
  existingAccountEmail: string;
  linkedEmployeeExternalId: string;
  existingEmployeeExternalId: string;
  existingEmployeeId: string;
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'csv-bulk-production-fixture.json'), 'utf8'));
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

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login'));
  await page.locator('form .auth-submit').click();
  await loginResponse;
}

async function openTeamModal(page: Page) {
  const membersLoaded = page.waitForResponse((r) => r.url().includes('/api/memberships') && r.request().method() === 'GET' && r.ok());
  const mobileMenu = page.locator('[data-testid="app-shell-mobile-menu"]');
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.locator('[data-testid="sidebar-team"]').click();
  await membersLoaded;
  await expect(page.getByTestId('equipo-modal')).toBeVisible();
}

async function openBulkModal(page: Page, kind: 'employees' | 'users') {
  await page.getByTestId(`bulk-import-${kind}-button`).click();
  await expect(page.getByTestId(`bulk-csv-${kind}`)).toBeVisible();
}

async function uploadCsv(page: Page, kind: 'employees' | 'users', csv: string) {
  await page.setInputFiles(`#bulk-file-${kind}`, {
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
}

async function orgCounts(organizationId: string) {
  const [employees, people, profiles, memberships, invitations] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM employees WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM organization_people WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employee_profiles WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM user_access_invitations WHERE organization_id = ${organizationId} AND status = 'PENDING'`,
  ]);
  return {
    employees: employees[0].count as number,
    people: people[0].count as number,
    profiles: profiles[0].count as number,
    memberships: memberships[0].count as number,
    pendingInvitations: invitations[0].count as number,
  };
}

/** Same technique as team-access-cycle.spec.ts's simulateAccept: token_hash
 * is DB-trigger-immutable so a real invitation created via the UI cannot be
 * accepted from outside the server without the plaintext token (only ever
 * sent by email). This reproduces acceptAccessInvitation's own transaction
 * via direct SQL to verify the full DB-state cycle. */
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
      VALUES (${email}, ${hashPassword('E2e-new-only-1234')}, 'Nueva Persona', 'ACTIVE')
      RETURNING id
    `)[0];
  }

  await sql.transaction((txn) => [
    txn`UPDATE organization_people SET user_id = ${user.id}, status = 'ACTIVE', updated_at = NOW() WHERE id = ${invitation.organization_person_id} AND organization_id = ${organizationId}`,
    txn`UPDATE employees SET user_id = ${user.id}, status = 'active', updated_at = NOW() WHERE organization_id = ${organizationId} AND id = (SELECT id FROM employee_profiles WHERE organization_person_id = ${invitation.organization_person_id} AND organization_id = ${organizationId})`,
    txn`INSERT INTO memberships (user_id, organization_id, role) VALUES (${user.id}, ${organizationId}, ${role}) ON CONFLICT (user_id, organization_id) DO NOTHING`,
    txn`UPDATE user_access_invitations SET status = 'ACCEPTED', accepted_at = NOW() WHERE id = ${invitation.id}`,
  ]);
  return user.id as string;
}

test('employees CSV: real template round-trip, then a mixed import verified across UI, POST body, DB and report', async ({ page }) => {
  const fixture = loadFixture();
  const org = fixture.organizationId;

  await login(page, fixture.ownerEmail, fixture.ownerPassword);
  await openTeamModal(page);
  await openBulkModal(page, 'employees');

  // Scenario 1: download the REAL template, verify headers/no-passwords,
  // then re-import it unmodified.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar plantilla' }).click(),
  ]);
  const templatePath = await download.path();
  const templateContent = readFileSync(templatePath!, 'utf8');
  expect(templateContent).toContain('externalEmployeeId');
  expect(templateContent).toContain('name');
  expect(templateContent.toLowerCase()).not.toContain('password');
  await uploadCsv(page, 'employees', templateContent);
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
  await expect(page.locator('.bulk-csv-modal__table')).toContainText('Crear');

  // Scenario 2: mixed import — creation, update, duplicate id with
  // contradictory rows (first proceeds, second is client-rejected), unknown
  // area (client-rejected), missing name (client-rejected), accented names.
  const before = await orgCounts(org);
  const csv = [
    'externalEmployeeId,name,area',
    `NUEVA-${fixture.runId},Núñez Muñoz Ánge,Operaciones`,
    `${fixture.existingEmployeeExternalId},Elena Vieja,Operaciones`,
    `DUP-${fixture.runId},Primero Duplicado,`,
    `DUP-${fixture.runId},Segundo Duplicado,`,
    `AREA-INVALIDA-${fixture.runId},Area Invalida Fila,ArroyoInexistente`,
    ',,',
  ].join('\n');
  await uploadCsv(page, 'employees', csv);
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
  await expect(page.getByText('El área no existe en esta organización')).toBeVisible();
  await expect(page.getByText('Duplicado con datos incompatibles')).toBeVisible();

  const postReq = page.waitForRequest((r) => r.url().includes('/api/employees/bulk') && r.method() === 'POST');
  const postRes = page.waitForResponse((r) => r.url().includes('/api/employees/bulk') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  const sentReq = await postReq;
  const sentBody = JSON.parse(sentReq.postData() ?? '{}');
  // Client-rejected rows (contradictory duplicate, unknown area, blank name)
  // must never reach the server.
  expect(sentBody.employees.length).toBe(3);
  expect(JSON.stringify(sentBody)).not.toContain('Segundo Duplicado');
  expect(JSON.stringify(sentBody)).not.toContain('Area Invalida Fila');
  const response = await postRes;
  expect(response.status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  await expect(page.getByText('2 creados')).toBeVisible();
  await expect(page.getByText('1 actualizados')).toBeVisible();

  const after = await orgCounts(org);
  expect(after.employees).toBe(before.employees + 2); // Núñez + first duplicate
  expect(after.people).toBe(before.people);
  expect(after.profiles).toBe(before.profiles);

  const created = (await sql`SELECT id, name FROM employees WHERE organization_id = ${org} AND external_employee_id = ${`NUEVA-${fixture.runId}`}`)[0];
  expect(created.name).toBe('Núñez Muñoz Ánge');
  const updated = (await sql`SELECT name FROM employees WHERE id = ${fixture.existingEmployeeId}`)[0];
  expect(updated.name).toBe('Elena Vieja');

  const [reportDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar informe CSV' }).click(),
  ]);
  const reportContent = readFileSync((await reportDownload.path())!, 'utf8');
  expect(reportContent).toContain('Núñez Muñoz Ánge');
  expect(reportContent).toContain('Crear');
  expect(reportContent).toContain('Actualizar');

  // Scenario 3: idempotent re-import of the exact same file — zero
  // duplicates, everything reported as unchanged, counters unchanged.
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await openBulkModal(page, 'employees');
  await uploadCsv(page, 'employees', csv);
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  await expect(page.getByText(/3 sin cambios/)).toBeVisible();

  const afterReimport = await orgCounts(org);
  expect(afterReimport.employees).toBe(after.employees);
  expect(afterReimport.people).toBe(after.people);
  expect(afterReimport.profiles).toBe(after.profiles);

  await page.getByRole('button', { name: 'Cancelar' }).click();
});

test('users CSV: real template, mixed import (invite/existing-account/rejections), acceptance, and Team Management refresh', async ({ page }) => {
  const fixture = loadFixture();
  const org = fixture.organizationId;
  const newRecipient = `nueva.persona+csvbulk${fixture.runId}@e2e.test`;

  await login(page, fixture.ownerEmail, fixture.ownerPassword);
  await openTeamModal(page);
  await openBulkModal(page, 'users');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar plantilla' }).click(),
  ]);
  const templateContent = readFileSync((await download.path())!, 'utf8');
  expect(templateContent).toContain('email');
  expect(templateContent).toContain('role');
  expect(templateContent.toLowerCase()).not.toContain('password');

  const before = await orgCounts(org);
  const csv = [
    'email,displayName,role,externalEmployeeId,locale',
    `${newRecipient},Nueva Persona,EMPLOYEE,,es`,
    `${fixture.existingAccountEmail},Cuenta Existente,EMPLOYEE,,es`,
    `not-an-email,Correo Invalido,EMPLOYEE,,es`,
    `${newRecipient},Duplicado En Archivo,EMPLOYEE,,es`,
    `sin.empleado+csvbulk${fixture.runId}@e2e.test,Sin Empleado,EMPLOYEE,NOEXISTE-${fixture.runId},es`,
    `ya.vinculado+csvbulk${fixture.runId}@e2e.test,Ya Vinculado,EMPLOYEE,${fixture.linkedEmployeeExternalId},es`,
    `rol.invalido+csvbulk${fixture.runId}@e2e.test,Rol Invalido,OWNER,,es`,
  ].join('\n');
  await uploadCsv(page, 'users', csv);
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
  // Client-side rejections visible with concrete reasons, not generic text.
  await expect(page.getByText('Rol no permitido; OWNER no se puede importar')).toBeVisible();
  await expect(page.getByText('El empleado ya está vinculado a otro usuario')).toBeVisible();
  await expect(page.getByText('Empleado no encontrado en esta organización')).toBeVisible();

  const postReq = page.waitForRequest((r) => r.url().includes('/api/invitations/bulk') && r.method() === 'POST');
  const postRes = page.waitForResponse((r) => r.url().includes('/api/invitations/bulk') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  const sentBody = JSON.parse((await postReq).postData() ?? '{}');
  expect(JSON.stringify(sentBody)).not.toContain('password');
  // Client-rejected rows (duplicate email, OWNER role, already-linked
  // employee) never reach the server payload. Email FORMAT is not
  // client-validated by contract — only presence is — so "not-an-email"
  // reaches the server, which is the authoritative validator (verified
  // below via its translated per-row rejection).
  expect(sentBody.users).toHaveLength(3);
  expect(JSON.stringify(sentBody)).not.toContain('Duplicado En Archivo');
  expect(JSON.stringify(sentBody)).not.toContain('rol.invalido');
  expect(JSON.stringify(sentBody)).not.toContain('ya.vinculado');
  const response = await postRes;
  expect(response.status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  // The server-authoritative email-format rejection is surfaced translated,
  // never as the raw INVALID_EMAIL code.
  await expect(page.getByText('Introduce un email válido.')).toBeVisible();

  const after = await orgCounts(org);
  // Exactly the two importable rows (new invite + existing-account invite)
  // produced pending invitations; the malformed-email and nonexistent-
  // employee rows are server-rejected with no side effects.
  expect(after.pendingInvitations).toBe(before.pendingInvitations + 2);
  expect(after.people).toBe(before.people + 2);
  expect(after.employees).toBe(before.employees + 2);
  expect(after.memberships).toBe(before.memberships); // no membership until accepted

  const preAcceptUser = await sql`SELECT id FROM users WHERE email = ${newRecipient}`;
  expect(preAcceptUser.length).toBe(0); // invitation only — no account/password generated by the import itself

  const pendingRow = (await sql`SELECT id FROM user_access_invitations WHERE organization_id = ${org} AND email_normalized = ${newRecipient} AND status = 'PENDING'`)[0];
  expect(pendingRow).toBeTruthy();

  // A second identical POST of the same importable rows must not duplicate
  // the pending invitation — this proves the retry-safety contract without
  // needing a simulated network failure.
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await openBulkModal(page, 'users');
  await uploadCsv(page, 'users', `email,displayName,role,externalEmployeeId,locale\n${newRecipient},Nueva Persona,EMPLOYEE,,es`);
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  await expect(page.getByText(/1 sin cambios/)).toBeVisible();
  const afterRetry = await orgCounts(org);
  expect(afterRetry.pendingInvitations).toBe(after.pendingInvitations); // no duplicate invitation
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // Acceptance: verify person/employee/user/membership/role, no temp
  // password created, invitation no longer pending, and Team Management
  // reflects the new access without F5-only visibility (we DO reload, which
  // the contract explicitly allows/expects).
  const acceptedUserId = await simulateAccept(org, newRecipient, 'EMPLOYEE');
  const acceptedUser = (await sql`SELECT password_hash FROM users WHERE id = ${acceptedUserId}`)[0];
  expect(acceptedUser.password_hash).toBeTruthy(); // set by simulateAccept itself, not by the import
  const stillPending = await sql`SELECT id FROM user_access_invitations WHERE organization_id = ${org} AND email_normalized = ${newRecipient} AND status = 'PENDING'`;
  expect(stillPending.length).toBe(0);
  const membership = (await sql`SELECT role FROM memberships WHERE organization_id = ${org} AND user_id = ${acceptedUserId}`)[0];
  expect(membership.role).toBe('EMPLOYEE');

  // A third import of the now-ACTIVE member with the same role must be
  // recognized client-side as already-current — "Sin cambios" in the
  // preview, with the confirm CTA correctly disabled (nothing importable),
  // never a pointless resubmission or a second invitation.
  await page.reload();
  await openTeamModal(page);
  await openBulkModal(page, 'users');
  await uploadCsv(page, 'users', `email,displayName,role,externalEmployeeId,locale\n${newRecipient},Nueva Persona,EMPLOYEE,,es`);
  await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
  await expect(page.locator('.bulk-csv-modal__table')).toContainText('Sin cambios');
  await expect(page.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
  const afterActiveReimport = await sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${org} AND user_id = ${acceptedUserId}`;
  expect(afterActiveReimport[0].count).toBe(1); // no duplicate membership
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.reload();
  await openTeamModal(page);
  await expect(page.locator(`[data-testid="persona-row-${acceptedUserId}"]`)).toContainText('Nueva Persona');
});

test('permissions: a non-admin actor is rejected by the backend even if the UI were bypassed, with zero writes', async ({ page, request }) => {
  const fixture = loadFixture();
  const org = fixture.organizationId;
  const before = await orgCounts(org);

  await login(page, fixture.nonAdminEmail, fixture.nonAdminPassword);
  // An EMPLOYEE-role member doesn't even get the "Equipo" nav entry — the
  // real backend gate (proven below) is what this test verifies either way.
  await expect(page.locator('[data-testid="sidebar-team"]')).toHaveCount(0);

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await request.post('/api/invitations/bulk', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: { users: [{ key: '1', email: `bypass+csvbulk${fixture.runId}@e2e.test`, displayName: 'Bypass Attempt', role: 'EMPLOYEE' }], locale: 'es' },
  });
  expect([401, 403]).toContain(res.status());

  const after = await orgCounts(org);
  expect(after).toEqual(before);
});
