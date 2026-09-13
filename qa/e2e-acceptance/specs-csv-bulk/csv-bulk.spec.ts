import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Fixture {
  runId: string;
  owner: { email: string; password: string };
  area: { id: string; name: string };
  employees: {
    update: { externalId: string; originalName: string; updatedName: string };
    unchanged: { externalId: string; name: string };
    new: { externalId: string; name: string };
    assoc: { externalId: string };
    linked: { externalId: string };
    ghostExternalId: string;
  };
  invite: { assocEmail: string; roleRejectEmail: string; conflictEmail: string; duplicateEmail: string };
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'csv-bulk-fixture.json'), 'utf8'));
}

function csvOf(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.join(',')).join('\r\n') + '\r\n';
}

async function readDownload(download: Awaited<ReturnType<Page['waitForEvent']>>): Promise<string> {
  const path = await (download as { path: () => Promise<string | null> }).path();
  if (!path) throw new Error('Download produced no local path');
  return readFileSync(path, 'utf8');
}

// First-run overlays (cookie consent + onboarding guide) are contractual UX
// but noise for this flow: pre-seed both as already handled, same as the
// local Fase 1.1 E2E suite (specs-local/auth-flow.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  });
});

async function loginAsOwner(page: Page, fixture: Fixture) {
  await page.goto('/login');
  await page.locator('#auth-email').fill(fixture.owner.email);
  await page.locator('#auth-password').fill(fixture.owner.password);
  const loginResponse = page.waitForResponse((response) => response.url().includes('/api/auth/login') && response.ok());
  // App.tsx hydrates `employees`/`areas` state via GET /api/employees and
  // GET /api/areas right after login, and EquipoModal only ever sees those
  // as props (it never fetches its own copy) — without this wait, opening
  // the Team modal can race ahead of hydration and see empty arrays, so
  // every CSV row wrongly resolves as brand new / unknown area.
  const employeesLoaded = page.waitForResponse((response) => response.url().includes('/api/employees') && response.request().method() === 'GET' && response.ok());
  const areasLoaded = page.waitForResponse((response) => response.url().includes('/api/areas') && response.request().method() === 'GET' && response.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await expect(page.locator('#auth-email')).toHaveCount(0);
  await employeesLoaded;
  await areasLoaded;
}

// The CSV preview table and the underlying Personas list table both use the
// shared `.equipo-table` class — scope every row lookup to the bulk import
// modal's own container so it never picks up rows from the list underneath.
function csvRows(page: Page, kind: 'employees' | 'users') {
  return page.locator(`[data-testid="bulk-csv-${kind}"] .equipo-table tbody tr`);
}

async function openBulkModal(page: Page, kind: 'employees' | 'users') {
  const mobileMenu = page.locator('[data-testid="app-shell-mobile-menu"]');
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  // EquipoModal fetches its own `members` state via GET /api/memberships on
  // mount (never as a prop from App.tsx) — the users-CSV "already linked"
  // conflict check reads that state, so opening the bulk modal before it
  // resolves would silently see an empty members list.
  const membersLoaded = page.waitForResponse((response) => response.url().includes('/api/memberships') && response.request().method() === 'GET' && response.ok());
  await page.locator('[data-testid="sidebar-team"]').click();
  await membersLoaded;
  await page.locator(`[data-testid="bulk-import-${kind}-button"]`).click();
  await expect(page.locator(`[data-testid="bulk-csv-${kind}"]`)).toBeVisible();
}

async function uploadCsv(page: Page, kind: 'employees' | 'users', csv: string, expectedRows: number) {
  await page.locator(`#bulk-file-${kind}`).setInputFiles({
    name: `bulk-${kind}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await expect(csvRows(page, kind)).toHaveCount(expectedRows);
}

test('CSV de empleados: creación, actualización y registros sin cambios', async ({ page }) => {
  const fixture = loadFixture();
  await loginAsOwner(page, fixture);
  await openBulkModal(page, 'employees');

  const csv = csvOf(['externalEmployeeId', 'name', 'area'], [
    [fixture.employees.new.externalId, fixture.employees.new.name, fixture.area.name],
    [fixture.employees.update.externalId, fixture.employees.update.updatedName, ''],
    [fixture.employees.unchanged.externalId, fixture.employees.unchanged.name, fixture.area.name],
  ]);
  await uploadCsv(page, 'employees', csv, 3);

  const rows = csvRows(page, 'employees');
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('Crear');
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText('Actualizar');
  await expect(rows.nth(2).locator('td').nth(2)).toHaveText('Sin cambios');

  const importResponse = page.waitForResponse((response) => response.url().includes('/api/employees/bulk') && response.ok());
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  const response = await importResponse;
  const body = await response.json();
  // The UNCHANGED row is filtered out client-side and never sent — the
  // server only ever sees the two rows that actually change something.
  expect(body.results.map((result: { status: string }) => result.status)).toEqual(['created', 'updated']);
  await expect(page.getByText('Importación completada correctamente.')).toBeVisible();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar informe CSV' }).click(),
  ]).then(([d]) => d);
  const report = await readDownload(download);
  expect(report).toContain('created');
  expect(report).toContain('updated');
  expect(report).toContain('UNCHANGED');
});

test('CSV de usuarios: validación, asociación por externalEmployeeId e invitación segura sin contraseña temporal', async ({ page }) => {
  const fixture = loadFixture();
  await loginAsOwner(page, fixture);
  await openBulkModal(page, 'users');

  const csv = csvOf(['email', 'displayName', 'role', 'externalEmployeeId', 'locale'], [
    ['', 'Sin Email', 'EMPLOYEE', '', 'es'],
    [fixture.invite.assocEmail, 'Invitado Asociado', 'EMPLOYEE', fixture.employees.assoc.externalId, 'es'],
  ]);
  await uploadCsv(page, 'users', csv, 2);

  const rows = csvRows(page, 'users');
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('Error');
  await expect(rows.nth(0).locator('td').nth(3)).toHaveText('Falta el email');
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText('Invitar');

  const importResponse = page.waitForResponse((response) => response.url().includes('/api/invitations/bulk') && response.ok());
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  const response = await importResponse;
  // Only the one processable row is ever sent — the client-rejected row
  // never reaches the server.
  expect(JSON.parse(response.request().postData() ?? '{}').users).toHaveLength(1);
  const body = await response.json();
  expect(body.results).toHaveLength(1);
  expect(body.results[0]).toMatchObject({ email: fixture.invite.assocEmail, status: 'INVITED', invitationStatus: 'PENDING' });
  // Secure invitation contract: no temporary password is ever generated,
  // stored client-visibly, or returned by the bulk endpoint.
  expect(JSON.stringify(body)).not.toMatch(/password/i);
  await expect(page.getByText('Importación completada correctamente.')).toBeVisible();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar informe CSV' }).click(),
  ]).then(([d]) => d);
  const report = await readDownload(download);
  expect(report).toContain(fixture.invite.assocEmail);
  expect(report).toContain('INVITED');
  expect(report.toLowerCase()).not.toContain('password');
});

test('rechazo de duplicados, conflictos, roles y referencias inválidas', async ({ page }) => {
  const fixture = loadFixture();
  await loginAsOwner(page, fixture);
  await openBulkModal(page, 'users');

  const csv = csvOf(['email', 'displayName', 'role', 'externalEmployeeId', 'locale'], [
    [fixture.invite.roleRejectEmail, 'Role Reject', 'OWNER', '', 'es'],
    ['ghost-ref@e2e.test', 'Ghost Ref', 'EMPLOYEE', fixture.employees.ghostExternalId, 'es'],
    [fixture.invite.conflictEmail, 'Link Conflict', 'EMPLOYEE', fixture.employees.linked.externalId, 'es'],
    [fixture.invite.duplicateEmail, 'Dup User', 'EMPLOYEE', '', 'es'],
    [fixture.invite.duplicateEmail, 'Dup User', 'EMPLOYEE', '', 'es'],
  ]);
  await uploadCsv(page, 'users', csv, 5);

  const rows = csvRows(page, 'users');
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('Error');
  await expect(rows.nth(0).locator('td').nth(3)).toHaveText('Rol no permitido; OWNER no se puede importar');
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText('Error');
  await expect(rows.nth(1).locator('td').nth(3)).toHaveText('Empleado no encontrado en esta organización');
  await expect(rows.nth(2).locator('td').nth(2)).toHaveText('Error');
  await expect(rows.nth(2).locator('td').nth(3)).toHaveText('El empleado ya está vinculado a otro usuario');
  await expect(rows.nth(3).locator('td').nth(2)).toHaveText('Invitar');
  await expect(rows.nth(4).locator('td').nth(2)).toHaveText('Omitir duplicado');
  await expect(rows.nth(4).locator('td').nth(3)).toHaveText('Email duplicado en el archivo');

  await expect(page.getByText('5 filas · 1 procesables')).toBeVisible();

  const importResponse = page.waitForResponse((response) => response.url().includes('/api/invitations/bulk') && response.ok());
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  const response = await importResponse;
  const sentRows = JSON.parse(response.request().postData() ?? '{}').users;
  // The four rejected rows are filtered out client-side and never sent.
  expect(sentRows).toHaveLength(1);
  expect(sentRows[0].email).toBe(fixture.invite.duplicateEmail);
});

test('plantillas CSV descargables para empleados y usuarios', async ({ page }) => {
  const fixture = loadFixture();
  await loginAsOwner(page, fixture);
  await openBulkModal(page, 'employees');

  const employeeTemplate = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar plantilla' }).click(),
  ]).then(([d]) => d);
  expect(employeeTemplate.suggestedFilename()).toBe('shiftimport-empleados-plantilla.csv');
  expect(await readDownload(employeeTemplate)).toContain('externalEmployeeId,name,area');

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('[data-testid="bulk-csv-employees"]')).toHaveCount(0);
  await page.locator('[data-testid="bulk-import-users-button"]').click();
  await expect(page.locator('[data-testid="bulk-csv-users"]')).toBeVisible();

  const userTemplate = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar plantilla' }).click(),
  ]).then(([d]) => d);
  expect(userTemplate.suggestedFilename()).toBe('shiftimport-usuarios-plantilla.csv');
  expect(await readDownload(userTemplate)).toContain('email,displayName,role,externalEmployeeId,locale');
});

test.describe('responsive básico', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el modal de importación CSV es usable en móvil', async ({ page }) => {
    const fixture = loadFixture();
    await loginAsOwner(page, fixture);
    await openBulkModal(page, 'employees');

    await expect(page.locator('label[for="bulk-file-employees"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar plantilla' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();

    // A fresh externalId generated here, not the shared fixture.employees.new
    // — the "empleados" test already consumes that one earlier in this same
    // run (one globalSetup fixture for the whole file), and re-sending it
    // would resolve as UNCHANGED instead of CREATE.
    const mobileExternalId = `EMP-MOBILE-${fixture.runId}`;
    const csv = csvOf(['externalEmployeeId', 'name', 'area'], [
      [mobileExternalId, `Empleado Móvil ${fixture.runId}`, fixture.area.name],
    ]);
    await uploadCsv(page, 'employees', csv, 1);
    // The preview table scrolls within its own container instead of
    // widening the page at narrow viewports.
    const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(390 + 1);
    await expect(page.getByRole('button', { name: 'Confirmar importación' })).toBeEnabled();
  });
});
