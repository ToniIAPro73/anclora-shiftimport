import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  emails: Record<string, string>;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
  });
});

async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', { data: { email: fixture.emails.admin, password: fixture.password } });
  expect(response.ok()).toBe(true);
}

test('destructive employee action uses the persistent alertdialog contract', async ({ page }) => {
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await login(page);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
  const members = page.getByRole('dialog', { name: 'Usuarios de la organización' });
  await members.getByRole('button', { name: 'Empleados', exact: true }).click();
  await members.getByRole('button', { name: 'Acciones de E2E Uno' }).click();
  await members.getByRole('menuitem', { name: 'Desactivar' }).click();

  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('¿Desactivar a E2E Uno?');
  await confirmation.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(nativeDialogs).toEqual([]);
});
