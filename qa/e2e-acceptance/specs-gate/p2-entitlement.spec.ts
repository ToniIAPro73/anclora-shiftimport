import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgFresh: string;
  emails: Record<string, string>;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
  });
});

async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', { data: { email: fixture.emails.fresh, password: fixture.password } });
  expect(response.ok()).toBe(true);
}

test('Personal announces gated team actions before effort and keeps the API gate', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await login(page);
  const entitlement = await page.request.get('/api/organizations/current');
  expect(entitlement.ok()).toBe(true);
  expect(await entitlement.json()).toMatchObject({
    entitlement: {
      planId: 'personal',
      features: { teamManagement: false, multiEmployeeImport: false },
      limits: { maxEmployees: 1 },
      usage: { activeEmployees: 1 },
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  const membersButton = page.getByRole('button', { name: 'Usuarios de la organización' });
  await expect(membersButton).toBeVisible();
  await membersButton.click();
  const members = page.getByRole('dialog', { name: 'Usuarios de la organización' });
  await expect(members.getByText('Esta función está disponible en Team')).toBeVisible();
  await expect(members.getByText(/Añadir usuarios y gestionar accesos requiere el plan Team/)).toBeVisible();
  await expect(members.getByPlaceholder('Email del usuario')).toBeDisabled();
  await expect(members.getByRole('textbox', { name: 'Contraseña' })).toBeDisabled();
  await members.getByRole('button', { name: 'Close' }).click();

  const rejected = await page.request.post('/api/memberships', {
    data: { email: 'plan-gate@e2e.test', role: 'EMPLOYEE', password: 'NeverStored-123' },
  });
  expect(rejected.status()).toBe(403);
  expect(await rejected.json()).toMatchObject({ code: 'PLAN_LIMIT' });
  expect(dialogs).toEqual([]);
});
