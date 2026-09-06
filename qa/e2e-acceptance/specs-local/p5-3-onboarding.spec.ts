import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

const root = join(__dirname, '..', '..', '..');
const password = 'P5.3-flow-pass-1234';

function developmentDatabaseUrl(): string {
  const envFile = readFileSync(join(root, '.env.development.local'), 'utf8');
  const line = envFile.split('\n').find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found');
  const value = line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
  if (!new URL(value).hostname.startsWith('ep-winter-bird-')) {
    throw new Error('Refusing P5.3 flow: database is not the documented Neon development host');
  }
  return value;
}

test('P5.3 compact browser smoke: Team owner-only onboarding is valid', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}`;
  const email = `p5-3-owner-${suffix}@e2e.test`;
  const organizationName = `P5.3 Owner Only ${suffix}`;
  const sql = neon(developmentDatabaseUrl());
  let userId: string | null = null;
  let organizationId: string | null = null;
  const dialogs: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    window.localStorage.setItem('anclora_theme_mode', 'light');
  });
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });

  try {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await page.locator('#auth-name').fill('P5.3 Owner');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(password);
    await page.locator('#auth-password-confirm').fill(password);
    await page.locator('form.auth-form .auth-submit').click();

    const wizard = page.getByRole('dialog', { name: '¿Cómo vas a usar ShiftImport?' });
    await expect(wizard).toBeVisible();
    await wizard.getByRole('radio', { name: /^Team / }).click();
    await expect(wizard.getByRole('radio', { name: /^Team / })).toHaveAttribute('aria-checked', 'true');

    await wizard.getByRole('button', { name: 'Continuar' }).click();
    await wizard.getByLabel('Nombre de la organización').fill(organizationName);
    await wizard.getByRole('button', { name: 'Continuar' }).click();
    await wizard.getByRole('button', { name: 'Continuar' }).click();
    await wizard.getByRole('button', { name: 'Continuar' }).click();
    await wizard.getByRole('button', { name: 'Continuar' }).click();
    await expect(wizard).toContainText('Sin áreas');
    await expect(wizard).toContainText('Sin Employee vinculado');

    const onboardingResponse = page.waitForResponse((response) => response.url().endsWith('/api/onboarding') && response.request().method() === 'POST');
    await wizard.getByRole('button', { name: 'Crear organización' }).click();
    expect((await onboardingResponse).status()).toBe(201);
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByText('Configuración incompleta')).toHaveCount(0);
    await expect(page.getByText('No vinculado', { exact: true })).toBeVisible();

    const session = await (await page.request.get('/api/session/me')).json();
    expect(session.role).toBe('OWNER');
    expect(session.plan).toBe('team');
    expect(session.employeeId).toBeNull();
    userId = session.user.id;
    organizationId = session.organizationId;
    const counts = await sql`
      SELECT
        (SELECT count(*)::int FROM memberships WHERE organization_id = ${organizationId} AND role = 'OWNER') AS owners,
        (SELECT count(*)::int FROM memberships WHERE organization_id = ${organizationId} AND role = 'ADMIN') AS admins,
        (SELECT count(*)::int FROM employees WHERE organization_id = ${organizationId}) AS employees,
        (SELECT count(*)::int FROM areas WHERE organization_id = ${organizationId}) AS areas,
        (SELECT plan FROM organizations WHERE id = ${organizationId}) AS plan
    `;
    expect(counts[0]).toMatchObject({ owners: 1, admins: 0, employees: 0, areas: 0, plan: 'team' });
    expect(dialogs).toEqual([]);
  } finally {
    if (organizationId) await sql`DELETE FROM organizations WHERE id = ${organizationId}`;
    if (userId) await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql`DELETE FROM login_attempts WHERE id_key LIKE ${`email:%-${suffix}@e2e.test`}`;
  }
});
