import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface ConflictProjectTokens {
  createToken: string;
  linkToken: string;
  conflictOrgId: string;
  conflictOwnerEmail: string;
  conflictKeepEmail: string;
  conflictKeepToken: string;
  conflictSwitchEmail: string;
  conflictSwitchToken: string;
  sameIdentityToken: string;
}

function loadFixture() {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'invitations-fixture.json'), 'utf8')) as {
    tokensByProject: Record<string, ConflictProjectTokens>;
    existingEmail: string;
    existingPassword: string;
  };
}

const OWNER_PASSWORD = 'E2e-owner-only-1234';
const NEW_ACCOUNT_PASSWORD = 'E2e-new-only-1234';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect.poll(() => page.url()).toMatch(/\/app/);
}

/** Reads the server's authoritative idea of who this page's cookies belong
 * to — never trusts client-side state. */
async function currentSessionEmail(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/session/me');
  if (response.status() !== 200) return null;
  const body = await response.json();
  return body.user?.email ?? null;
}

test.describe('invitation acceptance never silently replaces another identity\'s session', () => {
  test('accepting a different identity\'s invitation activates it but keeps the owner signed in; F5 and "keep session" both preserve the owner', async ({ context, page }, testInfo) => {
    const fixture = loadFixture();
    const tokens = fixture.tokensByProject[testInfo.project.name];

    // Page 1: owner A logs in normally.
    await loginAs(page, tokens.conflictOwnerEmail, OWNER_PASSWORD);
    expect(await currentSessionEmail(page)).toBe(tokens.conflictOwnerEmail);

    // Page 2, same BrowserContext (shared cookies) — opens B's invitation
    // while A's tab is still open and authenticated.
    const page2 = await context.newPage();
    await page2.goto(`/accept-invitation#token=${encodeURIComponent(tokens.conflictKeepToken)}`);
    await page2.locator('#invitation-password').fill(NEW_ACCOUNT_PASSWORD);
    await page2.locator('#invitation-passwordConfirmation').fill(NEW_ACCOUNT_PASSWORD);
    await page2.getByRole('button', { name: /crear cuenta y aceptar/i }).click();

    await expect(page2.getByText('Cuenta activada')).toBeVisible();
    await expect(page2.getByText(`La cuenta ${tokens.conflictKeepEmail} ya está preparada.`)).toBeVisible();
    await expect(page2.getByText(`Actualmente tienes una sesión iniciada como ${tokens.conflictOwnerEmail}.`)).toBeVisible();

    // The server session backing BOTH tabs still belongs to A — accepting
    // B's invitation must not have installed or replaced any session.
    expect(await currentSessionEmail(page2)).toBe(tokens.conflictOwnerEmail);

    // F5 on page 1: still authenticated as A.
    await page.reload();
    await expect.poll(() => page.url()).toMatch(/\/app/);
    expect(await currentSessionEmail(page)).toBe(tokens.conflictOwnerEmail);

    // The invitation is no longer pending; B now has active access.
    const directory = await page.request.get('/api/invitations', {
      headers: { 'x-organization-id': tokens.conflictOrgId },
    });
    expect(directory.status()).toBe(200);
    const directoryBody = await directory.json() as {
      invitations: Array<{ email: string; status: string }>;
      people: Array<{ email: string | null; status: string }>;
    };
    expect(directoryBody.invitations.find((i) => i.email === tokens.conflictKeepEmail)?.status).toBe('ACCEPTED');
    expect(directoryBody.people.find((p) => p.email === tokens.conflictKeepEmail)?.status).toBe('ACTIVE');

    // "Mantener la sesión actual" — explicit, no session change.
    await page2.getByRole('button', { name: 'Mantener la sesión actual' }).click();
    await expect.poll(() => page2.url()).toMatch(/\/app$/);
    expect(await currentSessionEmail(page2)).toBe(tokens.conflictOwnerEmail);
  });

  test('switching accounts requires an explicit logout and a fresh login as the invited identity', async ({ context, page }, testInfo) => {
    const fixture = loadFixture();
    const tokens = fixture.tokensByProject[testInfo.project.name];

    await loginAs(page, tokens.conflictOwnerEmail, OWNER_PASSWORD);

    const page2 = await context.newPage();
    await page2.goto(`/accept-invitation#token=${encodeURIComponent(tokens.conflictSwitchToken)}`);
    await page2.locator('#invitation-password').fill(NEW_ACCOUNT_PASSWORD);
    await page2.locator('#invitation-passwordConfirmation').fill(NEW_ACCOUNT_PASSWORD);
    await page2.getByRole('button', { name: /crear cuenta y aceptar/i }).click();
    await expect(page2.getByText('Cuenta activada')).toBeVisible();

    // Server session is still A's right up until the explicit switch.
    expect(await currentSessionEmail(page2)).toBe(tokens.conflictOwnerEmail);

    await page2.getByRole('button', { name: 'Cerrar sesión e iniciar con la nueva cuenta' }).click();
    await expect.poll(() => page2.url()).toMatch(/\/login/);
    await expect(page2.getByLabel('Correo electrónico')).toHaveValue(tokens.conflictSwitchEmail);
    await expect(page2.getByLabel('Contraseña')).toHaveValue('');

    // The old session is gone (real logout) — not merely a UI state change.
    expect(await currentSessionEmail(page2)).toBeNull();

    await page2.getByLabel('Contraseña').fill(NEW_ACCOUNT_PASSWORD);
    await page2.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect.poll(() => page2.url()).toMatch(/\/app/);

    // Only now, after explicit authentication, does the session belong to B.
    expect(await currentSessionEmail(page2)).toBe(tokens.conflictSwitchEmail);
  });

  test('an already-signed-in identity accepting its own invitation is unaffected (no conflict screen)', async ({ page }, testInfo) => {
    const fixture = loadFixture();
    const tokens = fixture.tokensByProject[testInfo.project.name];

    await loginAs(page, fixture.existingEmail, fixture.existingPassword);
    expect(await currentSessionEmail(page)).toBe(fixture.existingEmail);

    await page.goto(`/accept-invitation#token=${encodeURIComponent(tokens.sameIdentityToken)}`);
    await expect(page.locator('#invitation-password')).toHaveCount(0);
    await page.getByRole('button', { name: /añadir acceso y aceptar/i }).click();

    await expect(page.getByText('Acceso activado')).toBeVisible();
    await expect(page.getByText('Cuenta activada')).not.toBeVisible();
    expect(await currentSessionEmail(page)).toBe(fixture.existingEmail);
  });
});
