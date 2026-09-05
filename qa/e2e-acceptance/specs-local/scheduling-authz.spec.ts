import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  orgB: string;
  areaA: string;
  areaB: string;
  emails: Record<string, string>;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    window.localStorage.setItem('anclora_theme_mode', 'dark');
  });
});

async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', { data: { email, password: fixture.password } });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

function mondayOfCurrentWeek(): string {
  const date = new Date();
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

test('EMPLOYEE UI does not expose planner and API rejects draft writes', async ({ page }) => {
  await loginAs(page, fixture.emails.emp);
  await page.goto('/app/schedule');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('weekly-planner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Planificar' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Planificador semanal');

  const response = await page.request.post('/api/schedules', {
    headers: { 'x-organization-id': fixture.orgA },
    data: { areaId: fixture.areaA, periodStart: '2027-06-07' },
  });
  expect(response.status()).toBe(403);
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
});

test('planner cannot cross tenant boundary even when another tenant has scheduling data', async ({ page }) => {
  await loginAs(page, fixture.emails.ownerB);
  const created = await page.request.post('/api/schedules', {
    headers: { 'x-organization-id': fixture.orgB },
    data: { areaId: fixture.areaB, periodStart: '2027-06-14' },
  });
  expect(created.status()).toBe(201);

  await loginAs(page, fixture.emails.owner);
  const foreignRead = await page.request.get(`/api/schedules?areaId=${fixture.areaB}`, {
    headers: { 'x-organization-id': fixture.orgB },
  });
  // The authenticated owner is not a member of Org B. Context resolution
  // fails closed before the scheduling query, so no foreign rows are read.
  expect(foreignRead.status()).toBe(400);

  const ownRead = await page.request.get(`/api/schedules?areaId=${fixture.areaA}`, {
    headers: { 'x-organization-id': fixture.orgA },
  });
  expect(ownRead.status()).toBe(200);
  const ownPayload = await ownRead.json();
  expect(ownPayload.schedules.every((schedule: { areaId: string }) => schedule.areaId === fixture.areaA)).toBe(true);

  await page.goto('/app/schedule');
  await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('E2E Org B');
  await expect(page.locator('body')).not.toContainText('E2E Area B');
  await page.getByRole('button', { name: 'Volver al calendario' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
});

test('planner surfaces use active Employee records, not administrative memberships', async ({ page }) => {
  await loginAs(page, fixture.emails.admin);
  const headers = { 'x-organization-id': fixture.orgA };
  const created = await page.request.post('/api/schedules', {
    headers,
    data: { areaId: fixture.areaA, periodStart: mondayOfCurrentWeek() },
  });
  expect(created.status()).toBe(201);

  await page.goto('/app/schedule');
  const planner = page.getByTestId('weekly-planner');
  await expect(planner).toHaveAttribute('data-state', 'ready');
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Uno$/ })).toBeVisible();
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Z Admin Employee$/ })).toBeVisible();
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Admin$/ })).toHaveCount(0);

  const employeeFilter = planner.getByRole('button', { name: 'Empleado' });
  await employeeFilter.click();
  const filterList = page.locator('[role="listbox"]:visible');
  await expect(filterList.getByRole('option', { name: 'Todos los empleados', exact: true })).toBeVisible();
  await expect(filterList.getByRole('option', { name: 'E2E Z Admin Employee', exact: true })).toBeVisible();
  await expect(filterList.getByRole('option', { name: 'E2E Admin', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  const editor = planner.getByRole('form', { name: 'Añadir turno' });
  await expect(editor.locator('#planner-editor-employee option')).toHaveText([
    /E2E Dos/, /E2E Uno/, /E2E Z Admin Employee/,
  ]);
  await expect(editor.locator('#planner-editor-employee option').filter({ hasText: /^E2E Admin$/ })).toHaveCount(0);

  await page.request.post('/api/auth/logout');
  await page.context().clearCookies();
  await loginAs(page, fixture.emails.adminEmployee);
  await page.goto('/app/schedule');
  const adminEmployeePlanner = page.getByTestId('weekly-planner');
  await expect(adminEmployeePlanner).toHaveAttribute('data-state', 'ready');
  await expect(adminEmployeePlanner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Z Admin Employee$/ })).toBeVisible();
  await expect(adminEmployeePlanner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Admin$/ })).toHaveCount(0);
});
