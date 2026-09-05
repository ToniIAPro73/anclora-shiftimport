import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  areaA: string;
  emails: Record<string, string>;
};

test.setTimeout(180_000);

function plannerMonday(): string {
  const date = new Date();
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
}

test('weekly planner is a bounded, filterable workspace', async ({ page }, testInfo) => {
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

  await loginAs(page, fixture.emails.admin);
  const employeeResponses = await Promise.all(Array.from({ length: 24 }, (_, offset) => {
    const index = offset + 1;
    return page.request.post('/api/employees', {
      headers: { 'x-organization-id': fixture.orgA },
      data: { name: `UX Employee ${String(index).padStart(2, '0')}`, externalEmployeeId: `UX-${index}`, areaId: fixture.areaA, status: 'active' },
    });
  }));
  for (const response of employeeResponses) {
    expect(response.status()).toBe(201);
  }

  await loginAs(page, fixture.emails.planner);
  const periodStart = plannerMonday();
  const draftResponse = await page.request.post('/api/schedules', {
    headers: { 'x-organization-id': fixture.orgA },
    data: { periodStart, areaId: fixture.areaA },
  });
  expect([201, 409]).toContain(draftResponse.status());
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Planificar' })).toBeVisible();
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page).toHaveURL(/\/app\/schedule$/);

  await expect(page.getByTestId('weekly-planner')).toHaveAttribute('data-state', 'ready');
  const planner = page.getByTestId('weekly-planner');
  const grid = page.locator('.weekly-planner__grid-wrap');
  const editor = page.getByRole('form', { name: 'Añadir turno' });
  const selectedDate = new Date(`${periodStart}T00:00:00Z`);
  selectedDate.setUTCDate(selectedDate.getUTCDate() + 1);
  const selectedDateIso = selectedDate.toISOString().slice(0, 10);

  await expect(page.locator('.weekly-planner__grid tbody tr')).toHaveCount(26);
  expect(await planner.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.height <= window.innerHeight + 1;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight)).toBe(true);
  expect(await grid.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await editor.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight + 1)).toBe(true);
  expect(await grid.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('planner-top-dark.png'), fullPage: false });

  await grid.evaluate((element) => { element.scrollTop = Math.floor(element.scrollHeight / 2); });
  await page.screenshot({ path: testInfo.outputPath('planner-middle-dark.png'), fullPage: false });
  await grid.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(grid.getByText('UX Employee 24')).toBeVisible();
  await expect(page.locator('.weekly-planner__grid thead th').first()).toHaveCSS('position', 'sticky');
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

  await page.getByRole('button', { name: /Cambiar tema/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: testInfo.outputPath('planner-light-mobile.png'), fullPage: false });

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
