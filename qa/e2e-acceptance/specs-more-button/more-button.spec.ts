import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'more-button-fixture.json'), 'utf8')) as {
  runId: string;
  password: string;
  organizationId: string;
  employeeId: string;
  email: string;
};
const scenarioDate = '2026-09-10';

function databaseUrl(): string {
  const envFile = readFileSync(join(__dirname, '..', '..', '..', '.env.local'), 'utf8');
  const line = envFile.split(/\r?\n/).find((item) => item.startsWith('DATABASE_URL='));
  const value = line?.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error('DATABASE_URL not found in .env.local');
  return value;
}

const sql = neon(databaseUrl());

async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', { data: { email: fixture.email, password: fixture.password } });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  const toggle = page.getByRole('button', { name: /Cambiar tema|Change theme/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.locator('html').getAttribute('data-theme') === theme) return;
    await toggle.click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

function scenarioCell(page: Page) {
  return page.locator('.month-day-cell').filter({ has: page.locator(`button[aria-label*="${scenarioDate}"]`) });
}

async function assertGeometry(page: Page, expectedMinHeight: number) {
  const cell = scenarioCell(page);
  const more = cell.locator('.month-day-more-button');
  await expect(more).toHaveText('+1 más');
  const geometry = await more.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const parent = element.closest('.month-day-cell')!.getBoundingClientRect();
    const style = getComputedStyle(element);
    const sections = getComputedStyle(element.closest('.month-day-sections')!);
    return {
      left: button.left - parent.left,
      right: parent.right - button.right,
      bottom: parent.bottom - button.bottom,
      inside: button.left >= parent.left && button.right <= parent.right && button.top >= parent.top && button.bottom <= parent.bottom,
      width: button.width,
      height: button.height,
      boxSizing: style.boxSizing,
      borderLeft: style.borderLeftWidth,
      borderRight: style.borderRightWidth,
      outline: style.outlineStyle,
      overflow: sections.overflow,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(8);
  expect(geometry.right).toBeGreaterThanOrEqual(8);
  expect(geometry.bottom).toBeGreaterThanOrEqual(8);
  expect(geometry.inside).toBe(true);
  expect(geometry.boxSizing).toBe('border-box');
  expect(geometry.borderLeft).not.toBe('0px');
  expect(geometry.borderRight).not.toBe('0px');
  expect(geometry.height).toBeGreaterThanOrEqual(expectedMinHeight);
  expect(geometry.overflow).toBe('hidden');
  console.log(`[e2e-more] geometry ${JSON.stringify({ viewport: page.viewportSize(), left: geometry.left, right: geometry.right, bottom: geometry.bottom, width: geometry.width, height: geometry.height })}`);

  const normalWidth = geometry.width;
  await more.focus();
  const focusWidth = await more.evaluate((element) => element.getBoundingClientRect().width);
  expect(focusWidth).toBe(normalWidth);
  await page.mouse.move((await more.boundingBox())!.x + 10, (await more.boundingBox())!.y + 10);
  const hoverWidth = await more.evaluate((element) => element.getBoundingClientRect().width);
  expect(hoverWidth).toBe(normalWidth);
}

test('directed +N more layout and final empty day flow across three viewports', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
    localStorage.setItem('anclora_theme_mode', 'light');
  });
  await login(page);

  const initialApi = await page.request.get(`/api/shifts?employeeId=${fixture.employeeId}`);
  expect(initialApi.ok()).toBe(true);
  expect((await initialApi.json()).shifts.filter((shift: { date: string }) => shift.date === scenarioDate)).toHaveLength(3);
  const initialSql = await sql`
    SELECT shift_type, counts_as_work, start_time, end_time FROM shifts
    WHERE organization_id = ${fixture.organizationId} AND employee_id = ${fixture.employeeId} AND date = ${scenarioDate}
    ORDER BY start_time
  `;
  expect(initialSql).toHaveLength(3);
  expect(initialSql.map((row) => `${row.shift_type}:${row.start_time}-${row.end_time}`)).toEqual([
    'Regular:08:00-11:00', 'Ausencia:11:00-12:00', 'Regular:12:00-16:00',
  ]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(page, 'light');
  await assertGeometry(page, 40);
  const desktopCell = scenarioCell(page);
  await expect(desktopCell.locator('.month-shift-badge')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('01-desktop-light-more.png'), fullPage: false });

  await page.setViewportSize({ width: 768, height: 1024 });
  await setTheme(page, 'dark');
  await assertGeometry(page, 40);
  const tabletMore = scenarioCell(page).locator('.month-day-more-button');
  await tabletMore.focus();
  await expect(tabletMore).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('02-tablet-dark-focus.png'), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, 'light');
  await assertGeometry(page, 40);
  const mobileMore = scenarioCell(page).locator('.month-day-more-button');
  const mobileBox = await mobileMore.boundingBox();
  expect(mobileBox).not.toBeNull();
  await page.mouse.move(mobileBox!.x + mobileBox!.width / 2, mobileBox!.y + mobileBox!.height / 2);
  await page.mouse.down();
  await page.screenshot({ path: testInfo.outputPath('03-mobile-light-active.png'), fullPage: false });
  await page.mouse.up();
  await setTheme(page, 'dark');
  if (await page.getByTestId('day-detail-dialog').count() === 0) {
    await mobileMore.click();
  }

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('day-detail-count-badge')).toHaveText('3 elementos');
  await expect(page.locator('[data-testid^="day-detail-item-"]')).toHaveCount(3);

  for (const expectedCount of [2, 1, 0]) {
    const item = page.locator('[data-testid^="day-detail-item-"]').first();
    await item.getByTestId(/^delete-shift-btn-/).click();
    await page.getByTestId(/^confirm-delete-btn-/).click();
    await expect(page.getByTestId('day-detail-count-badge')).toHaveText(`${expectedCount} elementos`);
    await expect(page.locator('[data-testid^="day-detail-item-"]')).toHaveCount(expectedCount);
  }

  await expect(page.getByTestId('day-detail-empty-state')).toHaveText('No hay turnos registrados para este empleado el 10 de septiembre de 2026.');
  await expect(page.getByTestId('day-detail-dialog')).not.toContainText(/en de|on \.|undefined|null| {2}\./);
  await expect(scenarioCell(page).locator('.month-day-more-button')).toHaveCount(0);
  const finalApi = await page.request.get(`/api/shifts?employeeId=${fixture.employeeId}`);
  expect((await finalApi.json()).shifts.filter((shift: { date: string }) => shift.date === scenarioDate)).toHaveLength(0);
  const finalSql = await sql`
    SELECT count(*)::int AS count FROM shifts
    WHERE organization_id = ${fixture.organizationId} AND employee_id = ${fixture.employeeId} AND date = ${scenarioDate}
  `;
  expect(finalSql[0].count).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('04-mobile-dark-empty.png'), fullPage: false });
  expect(consoleErrors).toEqual([]);
});
