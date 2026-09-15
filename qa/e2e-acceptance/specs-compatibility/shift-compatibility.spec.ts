import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  runId: string;
  password: string;
  orgA: string;
  areaA: string;
  empA1: string;
  emails: { admin: string; planner: string };
};

function databaseUrl() {
  const env = readFileSync(join(__dirname, '..', '..', '..', '.env.local'), 'utf8');
  const line = env.split('\n').find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found in .env.local');
  return line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
}

const sql = neon(databaseUrl());

function isoDate(offset: number) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function mondayOfCurrentWeek() {
  const value = new Date(`${isoDate(0)}T00:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function shiftId() {
  return crypto.randomUUID();
}

async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { email: fixture.emails.admin, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function prepareBrowser(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript(({ selectedTheme }) => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
    window.localStorage.setItem('anclora_theme_mode', selectedTheme);
  }, { selectedTheme: theme });
}

async function createScenario(page: Page, date: string) {
  const response = await page.request.patch('/api/shifts', {
    data: {
      employeeId: fixture.empA1,
      upserts: [
        { id: shiftId(), employeeId: fixture.empA1, date, startTime: '08:00', endTime: '11:00', location: 'Regular', shiftType: 'Regular', countsAsWork: true, origin: 'IMP' },
        { id: shiftId(), employeeId: fixture.empA1, date, startTime: '11:00', endTime: '12:00', location: 'Ausencia', shiftType: 'Ausencia', countsAsWork: false, origin: 'IMP' },
        { id: shiftId(), employeeId: fixture.empA1, date, startTime: '12:00', endTime: '16:00', location: 'Regular', shiftType: 'Regular', countsAsWork: true, origin: 'IMP' },
      ],
    },
  });
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.saved).toHaveLength(3);
  expect(payload.saved.filter((item: { shiftType: string }) => item.shiftType === 'Ausencia')).toHaveLength(1);
  return payload.saved as Array<{ id: string }>;
}

test.describe.serial('shift compatibility against Neon main', () => {
  test('creates three segments through API, verifies SQL and calendar detail, and rejects real overlap', async ({ page }) => {
    test.setTimeout(120_000);
    const scenarioDate = isoDate(4);
    await prepareBrowser(page);
    await login(page);
    await createScenario(page, scenarioDate);
    await page.reload({ waitUntil: 'networkidle' });

    const sqlRows = await sql`
      SELECT id, shift_type, counts_as_work, start_time, end_time
      FROM shifts
      WHERE organization_id = ${fixture.orgA} AND employee_id = ${fixture.empA1} AND date = ${scenarioDate}
      ORDER BY start_time
    `;
    expect(sqlRows).toHaveLength(3);
    expect(sqlRows.map((row) => row.shift_type)).toEqual(['Regular', 'Ausencia', 'Regular']);
    expect(sqlRows.map((row) => row.counts_as_work)).toEqual([true, false, true]);
    expect(sqlRows.map((row) => `${row.start_time}-${row.end_time}`)).toEqual(['08:00-11:00', '11:00-12:00', '12:00-16:00']);

    const overlap = await page.request.patch('/api/shifts', {
      data: {
        employeeId: fixture.empA1,
        upserts: [{ id: shiftId(), employeeId: fixture.empA1, date: scenarioDate, startTime: '10:00', endTime: '13:00', location: 'Ausencia', shiftType: 'Ausencia', countsAsWork: false, origin: 'IMP' }],
      },
    });
    expect(overlap.status()).toBe(422);
    const overlapPayload = await overlap.json();
    expect(overlapPayload.code).toBe('OVERLAP');
    expect(JSON.stringify(overlapPayload)).not.toContain('Libre');

    await expect(page.getByRole('button', { name: 'Empleado:' })).toBeVisible();
    await page.getByRole('button', { name: 'Empleado:' }).click();
    await page.getByRole('option', { name: /E2E Uno/ }).click();
    const cell = page.locator('.month-day-cell').filter({ has: page.locator(`button[aria-label*="${scenarioDate}"]`) });
    await expect(cell.locator('.month-shift-badge')).toHaveCount(2);
    await expect(cell.locator('.month-day-more-button')).toHaveText('+1 más');
    await cell.locator('.month-day-more-button').click();
    const detail = page.getByRole('dialog');
    await expect(detail).toContainText('Regular');
    await expect(detail).toContainText('Ausencia');
    await expect(detail).toContainText('08:00 – 11:00');
    await expect(detail).toContainText('11:00 – 12:00');
    await expect(detail).toContainText('12:00 – 16:00');
    await page.getByTestId('close-day-detail-modal').click();

    const sidebarDate = isoDate(-1);
    await page.getByTestId('sidebar-add-shift').click();
    const sidebarDialog = page.getByRole('dialog', { name: 'Programar Turno' });
    await sidebarDialog.locator('input[type="date"]').fill(sidebarDate);
    await sidebarDialog.locator('input[type="time"]').nth(0).fill('08:00');
    await sidebarDialog.locator('input[type="time"]').nth(1).fill('09:00');
    await sidebarDialog.getByRole('button', { name: 'Tipo' }).click();
    await page.getByRole('option', { name: 'Ausencia', exact: true }).click();
    expect(await sidebarDialog.locator('input[type="date"]').inputValue()).toBe(sidebarDate);
    expect(await sidebarDialog.locator('input[type="time"]').nth(0).inputValue()).toBe('08:00');
    expect(await sidebarDialog.locator('input[type="time"]').nth(1).inputValue()).toBe('09:00');
    const sidebarSave = page.waitForResponse((response) => response.url().endsWith('/api/shifts') && response.request().method() === 'PATCH');
    await sidebarDialog.getByRole('button', { name: 'Confirmar' }).click();
    expect((await sidebarSave).status()).toBe(200);
    await expect(sidebarDialog).toHaveCount(0);

    const draftResponse = await page.request.post('/api/schedules', {
      data: { areaId: fixture.areaA, periodStart: mondayOfCurrentWeek() },
    });
    expect(draftResponse.status()).toBe(201);
    await page.getByTestId('sidebar-planner').click();
    await expect(page).toHaveURL(/\/app\/schedule$/);
    await expect(page.getByTestId('weekly-planner')).toBeVisible();
    const createDraft = page.getByRole('button', { name: 'Crear borrador semanal' });
    if (await createDraft.count()) {
      await createDraft.click();
      await expect(page.getByRole('table')).toBeVisible();
    }
    const addAssignment = page.getByRole('button', { name: /Añadir turno para E2E Uno/ }).first();
    await addAssignment.click();
    const plannerForm = page.getByRole('form', { name: 'Añadir turno' });
    const plannerDate = isoDate(1);
    await plannerForm.locator('#planner-editor-date').fill(plannerDate);
    await plannerForm.locator('#planner-editor-start').fill('11:00');
    await plannerForm.locator('#planner-editor-end').fill('12:00');
    await plannerForm.getByRole('button', { name: 'Tipo de turno (opcional)' }).click();
    await page.getByRole('option', { name: 'Ausencia', exact: true }).click();
    await expect(plannerForm.locator('#planner-editor-date')).toHaveValue(plannerDate);
    await expect(plannerForm.locator('#planner-editor-start')).toHaveValue('11:00');
    await expect(plannerForm.locator('#planner-editor-end')).toHaveValue('12:00');
    await plannerForm.getByRole('button', { name: 'Guardar' }).click();
    await expect(plannerForm).toHaveCount(0);
  });

  test('absence token remains AA-readable in light and dark themes', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const scenarioDate = isoDate(3);
    await prepareBrowser(page, 'light');
    await login(page);
    await createScenario(page, scenarioDate);
    await page.reload({ waitUntil: 'networkidle' });
    const viewports = [[1440, 900], [390, 844]] as const;
    let currentTheme = await page.locator('html').getAttribute('data-theme') as 'light' | 'dark';
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const theme of ['light', 'dark'] as const) {
        if (theme !== currentTheme) {
          // Pin the persisted mode without reloading so the visual assertions are deterministic.
          // The control's three-state cycle is covered by the theme unit tests.
          await page.evaluate((nextTheme) => {
            window.localStorage.setItem('anclora_theme_mode', nextTheme);
            document.documentElement.dataset.theme = nextTheme;
          }, theme);
          currentTheme = theme;
        }
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.getByRole('button', { name: 'Empleado:' }).click();
        await page.getByRole('option', { name: /E2E Uno/ }).click();
        const cell = page.locator('.month-day-cell').filter({ has: page.locator(`button[aria-label*="${scenarioDate}"]`) });
        const absence = cell.locator('.month-shift-badge[data-shift-visual="absence"]');
        await expect(absence).toBeVisible();
        const colors = await absence.evaluate((element) => {
          const style = getComputedStyle(element);
          const container = getComputedStyle(element.closest('.month-day-cell') as HTMLElement);
          return { foreground: style.color, background: style.backgroundColor, border: style.borderTopColor, cell: container.backgroundColor };
        });
        const textRatio = await page.evaluate(({ foreground, background }) => {
        const parse = (value: string) => value.match(/rgba?\(([^)]+)\)/)?.[1].split(',').map((item) => Number(item.trim().replace(/[^\d.].*$/, ''))) ?? [];
        const lum = (value: string) => {
          const rgb = parse(value).slice(0, 3).map((item) => Number(item) / 255);
          return rgb.reduce((sum, channel, index) => sum + (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0);
        };
        const a = lum(foreground); const b = lum(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        }, colors);
        const borderRatio = await page.evaluate(({ border, background: cardBackground }) => {
        const parse = (value: string) => value.match(/rgba?\(([^)]+)\)/)?.[1].split(',').map((item) => Number(item.trim().replace(/[^\d.].*$/, ''))) ?? [];
        const lum = (value: string) => {
          const rgb = parse(value).slice(0, 3).map((item) => Number(item) / 255);
          return rgb.reduce((sum, channel, index) => sum + (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0);
        };
          const a = lum(border); const b = lum(cardBackground);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        }, colors);
        expect(textRatio, `${width}x${height} ${theme} absence text`).toBeGreaterThanOrEqual(4.5);
        expect(borderRatio, `${width}x${height} ${theme} absence border`).toBeGreaterThanOrEqual(3);
        await page.screenshot({ path: testInfo.outputPath(`compatibility-${width}x${height}-${theme}.png`), fullPage: false });
        await cell.locator('.month-day-more-button').click();
        await expect(page.getByRole('dialog')).toContainText('Ausencia');
        if (width === 390 && theme === 'dark') {
          await page.screenshot({ path: testInfo.outputPath(`compatibility-${width}x${height}-${theme}-detail.png`), fullPage: false });
        }
        await page.getByTestId('close-day-detail-modal').click();
      }
    }
  });
});
