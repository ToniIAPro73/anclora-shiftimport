import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  orgB: string;
  shiftToday: string;
  shiftEnglish: string;
  shiftA2: string;
  shiftB: string;
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
  });
});

async function loginAsEmployee(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { email: fixture.emails.emp, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
  const session = await page.request.get('/api/session/me', { headers: { 'x-organization-id': fixture.orgA } });
  expect(session.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('employee-portal')).toBeVisible();
}

async function openTodayShift(page: Page, locale: 'es' | 'en', hours = '09:00 to 17:00') {
  await expect(page.getByTestId('today-shifts')).toBeVisible();
  await page.getByRole('button', { name: locale === 'es' ? `Turno de ${hours.replace(' to ', ' a ')}` : `Shift from ${hours}` }).click();
  await expect(page.getByTestId('shift-detail')).toBeVisible();
}

test.describe('R4 employee portal E2E', () => {
  test('happy path: login → navigation → acknowledge → comment → request → cancel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsEmployee(page);

    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const navigation = page.getByTestId('employee-portal-nav');
    await expect(navigation.locator('button')).toHaveCount(4);
    await page.getByRole('button', { name: 'Semana' }).click();
    await expect(page.getByTestId('my-week')).toBeVisible();
    await page.getByRole('button', { name: 'Solicitudes' }).click();
    await expect(page.getByTestId('request-status')).toBeVisible();
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByTestId('employee-more')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

    await page.getByRole('button', { name: 'Hoy' }).click();
    await openTodayShift(page, 'es');
    await page.getByRole('button', { name: /Marcar el turno/ }).click();
    await expect(page.getByRole('button', { name: 'Turno reconocido' })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Turno reconocido');

    await page.getByRole('textbox', { name: 'Tu comentario' }).fill('Comentario E2E del portal');
    await page.getByRole('button', { name: 'Añadir comentario' }).click();
    await expect(page.getByText('Comentario E2E del portal')).toBeVisible();

    await page.getByRole('textbox', { name: 'Motivo' }).fill('Necesito solicitar un cambio de horario');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByTestId('change-request-submitted')).toBeVisible();

    await page.getByRole('button', { name: 'Solicitudes' }).click();
    await expect(page.getByTestId('request-status')).toBeVisible();
    await expect(page.getByLabel('Estado: Pendiente')).toBeVisible();
    await page.getByRole('button', { name: /Ver turno asociado/ }).click();
    await expect(page.getByRole('button', { name: 'Cancelar solicitud' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar solicitud' }).click();
    await expect(page.getByText('Solicitud cancelada')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('runs the core portal flow in English on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
    });
    await loginAsEmployee(page);
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await page.getByRole('button', { name: 'Today' }).click();
    await openTodayShift(page, 'en', '18:00 to 22:00');
    await expect(page.getByRole('button', { name: /Mark the .* shift as seen/ })).toBeVisible();
  });

  test('keeps intra-organization and cross-tenant employee data isolated', async ({ page }) => {
    await loginAsEmployee(page);

    const own = await page.request.get(`/api/me/shifts/${fixture.shiftToday}`);
    expect(own.status()).toBe(200);
    expect((await own.json()).shift.id).toBe(fixture.shiftToday);

    const otherEmployee = await page.request.get(`/api/me/shifts/${fixture.shiftA2}`);
    expect(otherEmployee.status()).toBe(404);

    const otherTenant = await page.request.get(`/api/me/shifts/${fixture.shiftB}`);
    expect(otherTenant.status()).toBe(404);
  });
});
