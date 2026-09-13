import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadFixture() {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'invitations-fixture.json'), 'utf8')) as {
    tokensByProject: Record<string, { createToken: string; linkToken: string }>;
  };
}

async function openInvitation(page: Page, token: string) {
  const requestPromise = page.waitForRequest((request) => request.url().includes('/api/invitations/validate'));
  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/invitations/validate'));
  await page.goto(`/accept-invitation#token=${encodeURIComponent(token)}`);
  const request = await requestPromise;
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers().pragma).toBe('no-cache');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(await response.text()).not.toContain(token);
  return request;
}

// The three removed fields must never exist in the DOM — not merely hidden
// by CSS — in either acceptance mode.
async function expectRemovedFieldsAbsent(page: Page) {
  await expect(page.locator('#invitation-displayName')).toHaveCount(0);
  await expect(page.locator('#invitation-locale')).toHaveCount(0);
  await expect(page.locator('#invitation-theme')).toHaveCount(0);
  await expect(page.locator('#invitation-email')).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
}

test('cuenta nueva limpia el fragmento, no pide nombre/idioma/tema y envía payload mínimo', async ({ page }, testInfo) => {
  const fixture = loadFixture();
  const tokens = fixture.tokensByProject[testInfo.project.name];
  const request = await openInvitation(page, tokens.createToken);
  expect(request.method()).toBe('POST');
  expect(request.url()).not.toContain('token=');
  await expect.poll(() => page.url()).toMatch(/\/accept-invitation$/);
  await expect(page.locator('#invitation-password')).toBeVisible();
  await expect(page.getByTestId('invitation-email-display')).toBeVisible();
  await expectRemovedFieldsAbsent(page);

  await page.locator('#invitation-password').fill('E2e-new-only-1234');
  await page.locator('#invitation-passwordConfirmation').fill('E2e-new-only-1234');
  const acceptRequest = page.waitForRequest((r) => r.url().includes('/api/invitations/accept') && r.method() === 'POST');
  await page.getByRole('button', { name: /crear cuenta y aceptar/i }).click();
  const sent = await acceptRequest;
  const sentBody = JSON.parse(sent.postData() ?? '{}');
  expect(Object.keys(sentBody).sort()).toEqual(['password', 'token']);
  expect(sentBody).not.toHaveProperty('displayName');
  expect(sentBody).not.toHaveProperty('locale');
  expect(sentBody).not.toHaveProperty('theme');
  expect(sentBody).not.toHaveProperty('email');
  expect(sentBody).not.toHaveProperty('passwordConfirmation');
  await expect(page.getByText(/Acceso activado$|Access activated$/i)).toBeVisible();

  // Reopening the same consumed fixture token must resolve to the neutral
  // unavailable state, never expose an internal status or reopen the form.
  await page.goto('/login');
  await page.goto(`/accept-invitation#token=${encodeURIComponent(tokens.createToken)}`);
  await expect(page.getByRole('heading', { name: /Esta invitación ya no está disponible|This invitation is no longer available/i })).toBeVisible();
  await expect(page.getByText(/Puede que ya la hayas aceptado|You may have already accepted/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Volver a ShiftImport|Back to ShiftImport/i })).toBeVisible();
});

test('cuenta existente se enlaza sin mostrar ni enviar contraseña, nombre, idioma o tema', async ({ page }, testInfo) => {
  const fixture = loadFixture();
  const tokens = fixture.tokensByProject[testInfo.project.name];
  const request = await openInvitation(page, tokens.linkToken);
  expect(request.method()).toBe('POST');
  expect(request.url()).not.toContain('token=');
  await expect(page.locator('#invitation-password')).toHaveCount(0);
  await expect(page.getByTestId('invitation-email-display')).toBeVisible();
  await expectRemovedFieldsAbsent(page);
  await expect(page.getByText(/Tu cuenta ya existe|Your account already exists/i)).toBeVisible();

  const acceptRequest = page.waitForRequest((r) => r.url().includes('/api/invitations/accept') && r.method() === 'POST');
  await page.getByRole('button', { name: /añadir acceso y aceptar|add access and accept/i }).click();
  const sent = await acceptRequest;
  const sentBody = JSON.parse(sent.postData() ?? '{}');
  expect(Object.keys(sentBody)).toEqual(['token']);
  await expect(page.getByText(/Acceso activado$|Access activated$/i)).toBeVisible();
});
