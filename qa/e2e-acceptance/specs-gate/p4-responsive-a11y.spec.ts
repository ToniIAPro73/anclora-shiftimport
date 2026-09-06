import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  areaA: string;
  emails: Record<string, string>;
};

function plannerMonday(): string {
  const date = new Date();
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
}

async function assertNoBodyHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'body horizontal overflow').toBeLessThanOrEqual(1);
}

test('P4 compact planner responsive and accessible controls', async ({ page }, testInfo) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    window.localStorage.setItem('anclora_theme_mode', 'dark');
  });

  const periodStart = plannerMonday();
  const version = {
    id: 'p4-version',
    scheduleId: 'p4-schedule',
    areaId: fixture.areaA,
    versionNumber: 1,
    status: 'DRAFT',
    periodStart,
    periodEnd: addDays(periodStart, 6),
  };
  const employees = Array.from({ length: 18 }, (_, index) => ({
    id: `p4-employee-${index + 1}`,
    name: `P4 Employee ${String(index + 1).padStart(2, '0')}`,
    externalEmployeeId: `P4-${index + 1}`,
    areaId: fixture.areaA,
  }));

  await page.route('**/api/schedules**', async (route) => {
    const request = route.request();
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean);
    if (request.method() === 'GET' && parts.length === 2) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schedules: [version] }) });
      return;
    }
    if (request.method() === 'GET' && parts.length === 5) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version, employees, assignments: [] }) });
      return;
    }
    await route.continue();
  });

  await loginAs(page, fixture.emails.admin);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Abrir ajustes' }).click();
  await page.getByRole('button', { name: 'Tipos de turno' }).click();
  const colorInputs = page.locator('input[type="color"]');
  await expect(colorInputs).not.toHaveCount(0);
  for (let index = 0; index < await colorInputs.count(); index += 1) {
    await expect(colorInputs.nth(index)).toHaveAttribute('aria-label', /.+/);
  }
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page).toHaveURL(/\/app\/schedule$/);
  const planner = page.getByTestId('weekly-planner');
  await expect(planner).toHaveAttribute('data-state', 'ready');

  const grid = page.locator('.weekly-planner__grid-wrap');
  await expect(page.locator('.weekly-planner__grid tbody tr')).toHaveCount(employees.length);
  expect(await grid.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await grid.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(page.locator('.weekly-planner__grid thead th').first()).toHaveCSS('position', 'sticky');
  await assertNoBodyHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('p4-planner-dark-desktop.png'), fullPage: false });

  await page.setViewportSize({ width: 834, height: 768 });
  await page.getByRole('button', { name: 'Tabla accesible' }).click();
  const tableWrap = page.locator('.weekly-planner__table-wrap');
  await expect(tableWrap).toBeVisible();
  expect(await tableWrap.evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto');
  await expect(tableWrap).toHaveAttribute('tabindex', '0');
  await expect(page.locator('.weekly-planner__table thead th').first()).toHaveCSS('position', 'sticky');
  await assertNoBodyHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('p4-table-dark-tablet.png'), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Cuadrícula' }).click();
  await expect(grid).toBeVisible();
  await expect(page.locator('.weekly-planner__add-cell').first()).toBeVisible();
  await assertNoBodyHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('p4-planner-dark-mobile.png'), fullPage: false });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(page.locator('#public-header-navigation')).toHaveAttribute('data-mobile-open', 'true');
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false');
  await assertNoBodyHorizontalOverflow(page);

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page.getByTestId('weekly-planner')).toBeVisible();
  await assertNoBodyHorizontalOverflow(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Cambiar tema/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page.getByTestId('weekly-planner')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('p4-planner-light-desktop.png'), fullPage: false });
  await assertNoBodyHorizontalOverflow(page);

  expect(dialogs).toEqual([]);
});
