import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadFixture() {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'invitations-fixture.json'), 'utf8')) as {
    createToken: string;
    linkToken: string;
  };
}

async function openInvitation(page: Page, token: string) {
  const requestPromise = page.waitForRequest((request) => request.url().includes('/api/invitations/validate'));
  await page.goto(`/accept-invitation#token=${encodeURIComponent(token)}`);
  const request = await requestPromise;
  return request;
}

test('cuenta nueva limpia el fragmento, usa POST y completa la aceptación', async ({ page }) => {
  const fixture = loadFixture();
  const request = await openInvitation(page, fixture.createToken);
  expect(request.method()).toBe('POST');
  expect(request.url()).not.toContain('token=');
  await expect.poll(() => page.url()).toMatch(/\/accept-invitation$/);
  await expect(page.locator('#invitation-displayName')).toBeVisible();
  await expect(page.locator('#invitation-password')).toBeVisible();
  await page.locator('#invitation-displayName').fill('E2E New Account');
  await page.locator('#invitation-password').fill('E2e-new-only-1234');
  await page.locator('#invitation-passwordConfirmation').fill('E2e-new-only-1234');
  await page.getByRole('button', { name: /crear cuenta y aceptar/i }).click();
  await expect(page.getByText(/invitación aceptada|invitation accepted/i)).toBeVisible();
});

test('cuenta existente se enlaza sin mostrar ni enviar contraseña', async ({ page }) => {
  const fixture = loadFixture();
  const request = await openInvitation(page, fixture.linkToken);
  expect(request.method()).toBe('POST');
  expect(request.url()).not.toContain('token=');
  await expect(page.locator('#invitation-password')).toHaveCount(0);
  await expect(page.getByText(/Tu cuenta ya existe|Your account already exists/i)).toBeVisible();
  await page.getByRole('button', { name: /añadir acceso y aceptar|add access and accept/i }).click();
  await expect(page.getByText(/invitación aceptada|invitation accepted/i)).toBeVisible();
});
