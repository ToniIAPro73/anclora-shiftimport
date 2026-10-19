import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { computeEffectiveStats } from '../../../src/lib/effective-calendar.js';
import { CONTEXT_FILE, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';

let context: QaContext;
let pilotId: string;

test.beforeAll(async () => {
  context = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext;
  await assertQaOrganization(context.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try {
    pilotId = String((await db.query(
      "SELECT id FROM employees WHERE organization_id = $1 AND external_employee_id = '84881'",
      [context.organizationId],
    )).rows[0].id);
  } finally { await db.end(); }
});

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'off' });

async function openNovemberStatistics(page: Page) {
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.locator('.month-nav-label')).toContainText('Octubre 2026');
  await page.getByRole('button', { name: /Mes siguiente|Next month/ }).click();
  await expect(page.locator('.month-nav-label')).toContainText('Noviembre 2026');
  await page.getByTestId('calendar-stats-button').click();
  const dialog = page.getByRole('dialog', { name: 'Estadísticas' });
  await expect(dialog.getByRole('tab', { name: 'Mes seleccionado' })).toBeVisible();
  return dialog;
}

const hourLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60).toLocaleString('es-ES');
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
};

test('November statistics use the planned bucket and match effective calendar rows', async ({ page }) => {
  const headers = { 'x-organization-id': context.organizationId };
  const response = await page.request.get(`/api/calendar/stats?employeeId=${encodeURIComponent(pilotId)}&year=2026&month=11`, { headers });
  expect(response.ok()).toBeTruthy();
  const stats = await response.json();
  const shiftsResponse = await page.request.get(`/api/shifts?employeeId=${encodeURIComponent(pilotId)}`, { headers });
  expect(shiftsResponse.ok()).toBeTruthy();
  const shifts = (await shiftsResponse.json()).shifts;
  const calendar = computeEffectiveStats(shifts, { from: '2026-11-01', to: '2026-11-30', today: stats.today });
  expect(stats.today).toBe('2026-10-19');
  expect(calendar.realized.effectiveMinutes).toBe(0);
  expect(calendar.planned.effectiveMinutes).toBe(stats.monthStats.planned.effectiveMinutes);

  const dialog = await openNovemberStatistics(page);
  await expect(dialog.getByText('Horas planificadas')).toBeVisible();
  await expect(dialog.getByTestId('eff-month-effective')).toContainText(hourLabel(stats.monthStats.planned.effectiveMinutes));
  await expect(dialog.getByTestId('eff-month-regular')).toContainText(hourLabel(stats.monthStats.planned.regularMinutes));
  await expect(dialog.getByTestId('eff-month-worked-days')).toContainText(`${stats.monthStats.planned.workedDays} d`);
  await expect(dialog.getByTestId('eff-month-no-data')).toHaveCount(0);
  await expect(dialog.getByTestId('eff-month-planned')).toHaveCount(0);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 650 }, { width: 1280, height: 620 }]) {
    await page.setViewportSize(viewport);
    const geometry = await dialog.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(geometry.scrollHeight, `${viewport.width}x${viewport.height} outer vertical scroll`).toBeLessThanOrEqual(geometry.clientHeight + 1);
    expect(geometry.scrollWidth, `${viewport.width}x${viewport.height} horizontal overflow`).toBeLessThanOrEqual(geometry.clientWidth + 1);
    await expect(dialog.getByTestId('stats-modal-close')).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`statistics-november-${viewport.width}x${viewport.height}.png`) });
  }

  for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(dialog.getByRole('tab', { name: 'Mes seleccionado' })).toBeVisible();
    await expect(dialog.getByTestId('stats-modal-close')).toBeVisible();
    await dialog.getByTestId('eff-month-sick-days').scrollIntoViewIfNeeded();
    await expect(dialog.getByTestId('eff-month-sick-days')).toBeInViewport();
    const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  }
});
