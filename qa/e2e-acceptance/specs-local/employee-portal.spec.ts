import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  emails: Record<string, string>;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
  });
  page.on('dialog', (dialog) => {
    throw new Error(`Native dialog in unified employee shell: ${dialog.type()}`);
  });
});

async function loginAsEmployee(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { email: fixture.emails.emp, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
}

test('compact unified employee shell journey', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsEmployee(page);

  await expect(page.getByTestId('sidebar-calendar')).toBeVisible();
  await expect(page.getByTestId('sidebar-self-import')).toBeVisible();
  await expect(page.getByTestId('sidebar-historical-add')).toBeVisible();
  await expect(page.getByTestId('sidebar-requests')).toBeVisible();
  await expect(page.getByTestId('calendar-employee-readonly')).toBeVisible();
  await expect(page.getByTestId('sidebar-planner')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-approvals')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-members')).toHaveCount(0);

  await page.getByTestId('sidebar-collapse').click();
  await expect(page.getByTestId('app-shell')).toHaveClass(/is-collapsed/);
  await page.getByTestId('sidebar-collapse').click();
  await expect(page.getByTestId('app-shell')).toHaveClass(/is-expanded/);

  // Previous month is entirely historical, so the calendar + must open the
  // canonical SELF historical-shift modal for the employee.
  await page.locator('.month-nav-button').first().click();
  await page.locator('.month-day-add-button').first().click();
  await expect(page.getByRole('dialog', { name: 'Programar Turno' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByTestId('sidebar-self-import').click();
  await expect(page.getByRole('dialog', { name: 'Importar cuadrante' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByTestId('sidebar-historical-add').click();
  await expect(page.getByRole('dialog', { name: 'Programar Turno' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByTestId('sidebar-requests').click();
  await expect(page.getByRole('dialog', { name: 'Solicitudes' })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva solicitud' }).click();
  await expect(page.getByRole('dialog', { name: 'Nueva solicitud' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).last().click();
  await page.getByRole('button', { name: 'Cerrar' }).last().click();

  await page.getByTestId('app-shell-user-menu').click();
  await expect(page.getByRole('menuitem', { name: 'Salir' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Salir' }).click();
  await expect(page.locator('#auth-email')).toBeVisible();
});

async function openRequests(page: Page) {
  await loginAsEmployee(page);
  await page.getByTestId('sidebar-requests').click();
  await expect(page.getByRole('dialog', { name: 'Solicitudes' })).toBeVisible();
  await expect(page.getByTestId('request-status').getByText('Cambio de horario').first()).toBeVisible();
}

async function expectAssociatedShiftOpen(page: Page) {
  await expect(page.getByRole('dialog', { name: 'Solicitudes' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Actualizar Turno' })).toBeVisible();
  await expect(page.getByTestId('calendar-toolbar')).toHaveText(/Septiembre 2026/);
  const dialog = page.getByRole('dialog', { name: 'Actualizar Turno' });
  await expect(dialog.locator('input[type="date"]')).toHaveValue('2026-09-17');
  await expect(dialog.locator('input[type="time"]').nth(0)).toHaveValue('19:00');
  await expect(dialog.locator('input[type="time"]').nth(1)).toHaveValue('03:00');
  await expect(page.locator('.modal-overlay')).toHaveCount(1);
}

test('associated shift CTA opens the shift from the request list', async ({ page }, testInfo) => {
  await openRequests(page);
  await page.screenshot({ path: testInfo.outputPath('list-before.png'), fullPage: true });

  await page.getByRole('button', { name: /Ver turno asociado/ }).click();
  await expectAssociatedShiftOpen(page);
  await page.screenshot({ path: testInfo.outputPath('list-after.png'), fullPage: true });
});

test('associated shift CTA opens the shift from request detail', async ({ page }, testInfo) => {
  await openRequests(page);
  await page.getByRole('button', { name: 'Ver', exact: true }).click();
  await expect(page.getByTestId('request-status-detail')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('detail-before.png'), fullPage: true });

  await page.getByRole('button', { name: /Ver turno asociado/ }).click();
  await expectAssociatedShiftOpen(page);
  await page.screenshot({ path: testInfo.outputPath('detail-after.png'), fullPage: true });
});
