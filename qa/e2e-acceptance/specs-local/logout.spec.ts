import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deterministic logout E2E (authenticated, real Neon dev via `vercel dev`).
 *
 * Contract: logout must always end on the login screen with NO authenticated
 * chrome left (no team bar, no employee selector, no members button, no
 * "Salir" button), and the transition must survive reload and browser back.
 */

const here = __dirname;
const fixture = JSON.parse(readFileSync(join(here, '..', 'artifacts', 'local-fixture.json'), 'utf8'));

// First-run overlays (cookie consent + onboarding guide) are contractual UX
// but noise for flow tests: pre-seed both as already handled.
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

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(fixture.password);
  await page.locator('form .auth-submit').click();
}

/** Every piece of authenticated chrome that must be gone after logout. */
async function expectNoAuthenticatedChrome(page: Page) {
  await expect(page.locator('.team-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Empleado:' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Usuarios de la organización' })).toHaveCount(0);
}

test.describe('Deterministic logout', () => {
  test('login → logout lands on the login screen; reload keeps it there', async ({ page }) => {
    await loginAs(page, fixture.emails.admin);
    await expect(page.getByRole('button', { name: 'Empleado:' })).toBeVisible();

    await page.getByRole('button', { name: 'Salir' }).click();

    // Login screen, no authenticated chrome, no app shell with null user.
    await expect(page.locator('#auth-email')).toBeVisible();
    await expectNoAuthenticatedChrome(page);

    // The session was invalidated server-side: a reload must NOT recover it.
    await page.reload();
    await expect(page.locator('#auth-email')).toBeVisible();
    await expectNoAuthenticatedChrome(page);
  });

  test('logout after normal navigation (members modal, employee switch, month change)', async ({ page }) => {
    await loginAs(page, fixture.emails.admin);
    await expect(page.getByRole('button', { name: 'Empleado:' })).toBeVisible();

    // Open and close the members modal (ESC).
    await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    // Switch employee via the SearchableSelect.
    await page.getByRole('button', { name: 'Empleado:' }).click();
    await page.getByRole('option', { name: /E2E Uno/ }).click();
    await expect(page.locator('.month-shift-badge')).toHaveCount(2);

    // Normal month navigation (icon buttons, no accessible name).
    await page.locator('.month-nav-button').last().click();

    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.locator('#auth-email')).toBeVisible();
    await expectNoAuthenticatedChrome(page);
  });

  test('logout → browser back never restores an authenticated shell', async ({ page }) => {
    await loginAs(page, fixture.emails.admin);
    await expect(page.getByRole('button', { name: 'Empleado:' })).toBeVisible();

    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.locator('#auth-email')).toBeVisible();

    await page.goBack();

    // Two acceptable end states: the bfcache-restored page re-validates the
    // dead session and returns to /login, or the browser reloads /app as a
    // plain guest. In BOTH cases no authenticated chrome may survive.
    await expect(
      page.locator('#auth-email').or(page.getByRole('button', { name: 'Iniciar sesión' })),
    ).toBeVisible();
    await expectNoAuthenticatedChrome(page);
  });

  test('logout clicked while post-login hydration is still in flight stays deterministic', async ({ page }) => {
    // Slow down the roster request so the logout races the hydration.
    await page.route('**/api/employees', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    await loginAs(page, fixture.emails.admin);
    // Click "Salir" as soon as the authenticated chrome appears, without
    // waiting for shifts/roster to finish loading.
    await page.getByRole('button', { name: 'Salir' }).click();

    await expect(page.locator('#auth-email')).toBeVisible();
    await expectNoAuthenticatedChrome(page);

    // After the slow request lands, no org data may leak into the guest view.
    await page.waitForTimeout(1500);
    await expect(page.locator('.month-shift-badge')).toHaveCount(0);
  });

  test('a 401 mid-session (cookie invalidated elsewhere) leaves the authenticated shell', async ({ page }) => {
    await loginAs(page, fixture.emails.admin);
    await expect(page.getByRole('button', { name: 'Empleado:' })).toBeVisible();

    // Session dies server-side while the page is open (e.g. logout from
    // another tab/device): the next authenticated call answers 401.
    await page.context().clearCookies();
    await page.getByRole('button', { name: 'Usuarios de la organización' }).click();

    await expect(page.locator('#auth-email')).toBeVisible();
    await expectNoAuthenticatedChrome(page);
  });
});
