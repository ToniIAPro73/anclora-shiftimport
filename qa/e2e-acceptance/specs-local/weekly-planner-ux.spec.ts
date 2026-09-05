import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
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

function plannerDayLabel(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
}

test('weekly planner is a bounded, filterable workspace', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    window.localStorage.setItem('anclora_theme_mode', 'dark');
  });

  const periodStart = plannerMonday();
  const employees = Array.from({ length: 26 }, (_, offset) => ({
    id: `ux-employee-${offset + 1}`,
    name: `UX Employee ${String(offset + 1).padStart(2, '0')}`,
    externalEmployeeId: `UX-${offset + 1}`,
    areaId: fixture.areaA,
  }));
  const candidateStarts = [-28, -21, -14, -7, 0, 7, 14, 21, 28].map((offset) => addDays(periodStart, offset));
  const versions = candidateStarts.flatMap((mondayStart) => {
    const sundayStart = addDays(mondayStart, -1);
    return [
      { id: `version-monday-${mondayStart}`, scheduleId: `schedule-monday-${mondayStart}`, areaId: fixture.areaA, versionNumber: 1, status: 'DRAFT', periodStart: mondayStart, periodEnd: addDays(mondayStart, 6) },
      { id: `version-sunday-${mondayStart}`, scheduleId: `schedule-sunday-${mondayStart}`, areaId: fixture.areaA, versionNumber: 1, status: 'DRAFT', periodStart: sundayStart, periodEnd: addDays(sundayStart, 6) },
    ];
  });
  await page.route('**/api/schedules**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    if (request.method() === 'GET' && parts.length === 2) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schedules: versions }) });
      return;
    }
    if (request.method() === 'GET' && parts.length === 5) {
      const selectedVersion = versions.find((version) => version.id === parts[4]) ?? versions[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: selectedVersion, employees, assignments: [] }),
      });
      return;
    }
    await route.continue();
  });

  await loginAs(page, fixture.emails.planner);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Planificar' })).toBeVisible();
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page).toHaveURL(/\/app\/schedule$/);

  const plannerState = page.getByTestId('weekly-planner');
  await expect(plannerState).toHaveAttribute('data-state', /ready|empty/);
  if (await page.getByRole('button', { name: 'Crear borrador semanal' }).count()) {
    await page.getByRole('button', { name: 'Crear borrador semanal' }).click();
  }
  await expect(plannerState).toHaveAttribute('data-state', 'ready');
  const planner = plannerState;
  const grid = page.locator('.weekly-planner__grid-wrap');
  const editor = page.getByRole('form', { name: 'Añadir turno' });
  const actualPeriodStart = await page.locator('.weekly-planner__grid thead th[data-day]').first().getAttribute('data-day');
  expect(actualPeriodStart).toBeTruthy();
  const selectedDateIso = addDays(actualPeriodStart!, 1);

  await expect(page.locator('.weekly-planner__grid tbody tr')).toHaveCount(26);
  expect(await planner.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.height <= window.innerHeight + 1;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight)).toBe(true);
  expect(await grid.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await editor.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight + 1)).toBe(true);
  expect(await grid.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(planner.getByRole('button', { name: /Cambiar tema/ })).toHaveCount(0);
  await expect(planner.getByRole('button', { name: /Cambiar idioma/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('planner-top-dark.png'), fullPage: false });

  await grid.evaluate((element) => { element.scrollTop = Math.floor(element.scrollHeight / 2); });
  await page.screenshot({ path: testInfo.outputPath('planner-middle-dark.png'), fullPage: false });
  await grid.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(grid.getByText('UX Employee 24')).toBeVisible();
  await expect(page.locator('.weekly-planner__grid thead th').first()).toHaveCSS('position', 'sticky');
  const gridViewButton = page.getByRole('button', { name: 'Cuadrícula' });
  const tableViewButton = page.getByRole('button', { name: 'Tabla accesible' });
  await expect(gridViewButton).toHaveAttribute('title', 'Cuadrícula');
  await expect(tableViewButton).toHaveAttribute('title', 'Tabla accesible');
  await tableViewButton.hover();
  await expect.poll(async () => tableViewButton.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('1');
  await tableViewButton.click();
  const accessibleTable = page.locator('.weekly-planner__table-wrap');
  await expect(accessibleTable).toBeVisible();
  await accessibleTable.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(accessibleTable.locator('thead th').first()).toHaveCSS('position', 'sticky');
  expect(await accessibleTable.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('planner-accessible-table-bottom-dark.png'), fullPage: false });
  await gridViewButton.click();
  await page.screenshot({ path: testInfo.outputPath('planner-bottom-dark.png'), fullPage: false });

  const filter = page.getByRole('button', { name: 'Empleado' });
  await filter.click();
  await page.locator('.modal-select-option').filter({ hasText: 'UX Employee 24' }).click();
  await expect(page.locator('.weekly-planner__grid tbody tr')).toHaveCount(1);
  await expect(grid.getByText('UX Employee 24')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('planner-filtered-dark.png'), fullPage: false });

  const addButton = page.getByRole('button', { name: `Añadir turno para UX Employee 24 el ${selectedDateIso}` });
  const windowScrollBefore = await page.evaluate(() => window.scrollY);
  const gridScrollBefore = await grid.evaluate((element) => element.scrollTop);
  await addButton.click();
  await expect(editor.getByLabel('Empleado')).toHaveValue(/.+/);
  await expect(editor.getByLabel('Fecha')).toHaveValue(selectedDateIso);
  await expect(addButton.locator('xpath=ancestor::td')).toHaveAttribute('data-selected', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBe(windowScrollBefore);
  expect(await grid.evaluate((element) => element.scrollTop)).toBe(gridScrollBefore);
  await page.screenshot({ path: testInfo.outputPath('planner-selected-cell-dark.png'), fullPage: false });

  await editor.getByRole('button', { name: 'Cancelar' }).click();
  await expect(addButton.locator('xpath=ancestor::td')).not.toHaveAttribute('data-selected', 'true');

  await filter.click();
  await page.locator('.modal-select-option').filter({ hasText: 'Todos los empleados' }).click();
  await expect(page.locator('.weekly-planner__grid tbody tr')).toHaveCount(26);

  const weekStart = page.getByRole('button', { name: 'Inicio de semana' });
  await weekStart.click();
  await page.locator('.modal-select-option').filter({ hasText: 'Domingo' }).click();
  await expect(weekStart).toContainText('Domingo');
  await expect(page.locator('.weekly-planner__grid thead th').nth(1)).toContainText('dom,');
  await page.screenshot({ path: testInfo.outputPath('planner-sunday-start-dark.png'), fullPage: false });

  await weekStart.click();
  await page.locator('.modal-select-option').filter({ hasText: 'Lunes' }).click();
  await expect(weekStart).toContainText('Lunes');
  await expect(page.locator('.weekly-planner__grid thead th').nth(1)).toContainText('lun,');

  const activeDayLabel = plannerDayLabel(selectedDateIso);
  const activeDayButton = page.getByRole('button', { name: activeDayLabel });
  await activeDayButton.click();
  await expect(activeDayButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`.weekly-planner__grid thead th[data-day="${selectedDateIso}"]`)).toHaveAttribute('data-active-day', 'true');

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Cambiar tema/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page).toHaveURL(/\/app\/schedule$/);
  await expect(page.getByTestId('weekly-planner')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: testInfo.outputPath('planner-light-grid.png'), fullPage: false });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(planner).toBeVisible();
    await expect(page.locator('.weekly-planner__grid-region')).toBeVisible();
    await expect(editor).toBeVisible();
    expect(await planner.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight + 1)).toBe(true);
    expect(await editor.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight + 1)).toBe(true);
    if (viewport.width === 390) {
      await page.screenshot({ path: testInfo.outputPath('planner-mobile-light.png'), fullPage: false });
    }
  }

  expect(consoleErrors).toEqual([]);
});
