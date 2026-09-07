import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  areaA: string;
  empA1: string;
  emails: Record<string, string>;
};

function mondayOfCurrentWeek(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loginApi(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', { data: { email, password: fixture.password } });
  expect(response.ok()).toBe(true);
}

test('P5.2 compact owner smoke: operational navigation and temporal boundaries', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    window.localStorage.setItem('anclora_theme_mode', 'dark');
    window.localStorage.removeItem('anclora_shiftimport_sidebar_v1');
  });
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });

  await loginApi(page, fixture.emails.owner);
  // The visual gate must show the planner's real grid, not the empty-state
  // branch. Seed one current-week draft through the existing scheduling API;
  // teardown removes it with the synthetic organization.
  const currentWeek = mondayOfCurrentWeek();
  const draftResponse = await page.request.post('/api/schedules', {
    data: { areaId: fixture.areaA, periodStart: currentWeek },
  });
  expect(draftResponse.status()).toBe(201);
  const draft = await draftResponse.json() as { scheduleId: string; scheduleVersionId: string };
  const assignmentResponse = await page.request.post(
    `/api/schedules/${draft.scheduleId}/versions/${draft.scheduleVersionId}/assignments`,
    { data: { employeeId: fixture.empA1, date: addDays(currentWeek, 6), startTime: '09:00', endTime: '17:00', location: 'P5.2 visual fixture' } },
  );
  expect(assignmentResponse.status()).toBe(201);
  await page.goto('/app', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('calendar-toolbar')).toBeVisible();
  await expect(page.getByTestId('calendar-toolbar')).toContainText(/turnos/);
  await expect(page.getByTestId('sidebar-import')).toHaveAttribute('aria-label', 'Importar turnos');
  await expect(page.getByTestId('sidebar-add-shift')).toHaveAttribute('aria-label', 'Añadir turno');
  await expect(page.getByTestId('sidebar-approvals')).toBeVisible();
  await expect(page.getByTestId('app-shell-main-context')).toHaveCount(0);
  await expect(page.getByTestId('calendar-area-filter')).toHaveCount(0);
  await expect(page.getByTestId('app-shell-sidebar')).not.toContainText('Organización');
  await expect(page.getByText('Empleado', { exact: true })).toBeVisible();
  await expect(page.getByTestId('app-shell-context-menu')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('p5-2-owner-expanded-dark.png'), fullPage: true });

  const collapse = page.getByTestId('sidebar-collapse');
  await expect(collapse).toHaveAttribute('aria-label', 'Contraer navegación');
  await expect(collapse).toHaveText('');
  await collapse.click();
  await expect(collapse).toHaveAttribute('aria-label', 'Expandir navegación');
  await expect(collapse).toHaveText('');
  await page.screenshot({ path: testInfo.outputPath('p5-2-owner-collapsed-dark.png'), fullPage: true });
  await collapse.click();

  const calendarBefore = await page.locator('.calendar-stage').boundingBox();
  await page.screenshot({ path: testInfo.outputPath('p5-2-owner-calendar.png'), fullPage: true });

  await page.getByTestId('sidebar-approvals').click();
  const approvals = page.getByRole('dialog', { name: 'Solicitudes' });
  await expect(approvals).toBeVisible();
  await approvals.getByRole('button', { name: 'Cerrar' }).click();
  await expect(approvals).toHaveCount(0);

  await page.getByTestId('sidebar-add-shift').click();
  const addShift = page.getByRole('dialog', { name: 'Programar Turno' });
  await expect(addShift).toBeVisible();
  const maximum = await addShift.locator('input[type="date"]').getAttribute('max');
  expect(maximum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await addShift.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByTestId('sidebar-planner').click();
  await expect(page).toHaveURL(/\/app\/schedule$/);
  const plannerDialog = page.getByRole('dialog', { name: 'Planificador semanal' });
  await expect(plannerDialog).toBeVisible();
  await expect(plannerDialog.getByTestId('weekly-planner')).toBeVisible();
  await expect(plannerDialog).toHaveClass(/modal-content--fullscreen/);
  await expect(plannerDialog.getByTestId('weekly-planner')).not.toHaveAttribute('data-state', 'loading');
  const plannerBox = await plannerDialog.boundingBox();
  expect(plannerBox?.width ?? 0).toBeGreaterThanOrEqual(1300);
  expect(plannerBox?.height ?? 0).toBeGreaterThanOrEqual(740);
  await expect(plannerDialog.locator('.weekly-planner__editor')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('p5-2-planner-fullscreen-dark.png'), fullPage: true });
  await expect(plannerDialog.getByText('Volver al calendario')).toHaveCount(0);
  await expect(plannerDialog.getByRole('button', { name: 'Cerrar planificador' })).toBeVisible();
  await plannerDialog.getByRole('button', { name: 'Cerrar planificador' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const themeToggle = page.getByRole('button', { name: /Cambiar tema/ });
  await themeToggle.click();
  await page.getByRole('button', { name: /Cambiar tema/ }).click();
  await page.screenshot({ path: testInfo.outputPath('p5-2-owner-light.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('app-shell-mobile-menu').click();
  await expect(page.getByTestId('app-shell')).toHaveClass(/is-drawer-open/);
  const mobileSidebar = page.getByTestId('app-shell-sidebar');
  await expect(mobileSidebar).toBeVisible();
  await expect(mobileSidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(mobileSidebar).toContainText('Planificar');
  await page.screenshot({ path: testInfo.outputPath('p5-2-mobile-drawer-light.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('app-shell')).not.toHaveClass(/is-drawer-open/);

  const calendarAfter = await page.locator('.calendar-stage').boundingBox();
  console.log(`P5.2 calendar geometry before=${JSON.stringify(calendarBefore)} after=${JSON.stringify(calendarAfter)}`);
  expect(calendarAfter?.height ?? 0).toBeGreaterThan(0);
  expect(nativeDialogs).toEqual([]);
});
