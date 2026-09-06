import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  emails: Record<string, string>;
};

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
  await page.goto('/app', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('calendar-toolbar')).toBeVisible();
  await expect(page.getByTestId('calendar-toolbar')).toContainText(/turnos/);
  await expect(page.getByTestId('sidebar-import')).toHaveAttribute('aria-label', 'Importar turnos');
  await expect(page.getByTestId('sidebar-add-shift')).toHaveAttribute('aria-label', 'Añadir turno');
  await expect(page.getByTestId('sidebar-approvals')).toBeVisible();
  await expect(page.getByTestId('app-shell-context-menu')).toBeVisible();

  const calendarBefore = await page.locator('.calendar-stage').boundingBox();
  await page.screenshot({ path: testInfo.outputPath('p5-2-owner-calendar.png'), fullPage: true });

  await page.getByTestId('sidebar-approvals').click();
  const approvals = page.getByRole('dialog', { name: 'Aprobaciones' });
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
  await expect(plannerDialog.getByText('Volver al calendario')).toHaveCount(0);
  await expect(plannerDialog.getByRole('button', { name: 'Cerrar planificador' })).toBeVisible();
  await plannerDialog.getByRole('button', { name: 'Cerrar planificador' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('app-shell-mobile-menu').click();
  await expect(page.getByTestId('app-shell')).toHaveClass(/is-drawer-open/);
  await expect(page.getByTestId('sidebar-planner')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('app-shell')).not.toHaveClass(/is-drawer-open/);

  const calendarAfter = await page.locator('.calendar-stage').boundingBox();
  console.log(`P5.2 calendar geometry before=${JSON.stringify(calendarBefore)} after=${JSON.stringify(calendarAfter)}`);
  expect(calendarAfter?.height ?? 0).toBeGreaterThan(0);
  expect(nativeDialogs).toEqual([]);
});
