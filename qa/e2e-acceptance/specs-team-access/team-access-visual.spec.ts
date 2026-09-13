import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Fixture {
  visualOwnerEmail: string;
  visualOwnerPassword: string;
  screenshotActive: { userId: string; name: string; email: string };
  screenshotRevoked: { employeeId: string; name: string; email: string };
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'team-access-fixture.json'), 'utf8'));
}

async function loginAsOwner(page: Page, fixture: Fixture) {
  await page.goto('/login');
  await page.locator('#auth-email').fill(fixture.visualOwnerEmail);
  await page.locator('#auth-password').fill(fixture.visualOwnerPassword);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function openTeamModal(page: Page) {
  const membersLoaded = page.waitForResponse((r) => r.url().includes('/api/memberships') && r.request().method() === 'GET' && r.ok());
  const mobileMenu = page.locator('[data-testid="app-shell-mobile-menu"]');
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.locator('[data-testid="sidebar-team"]').click();
  await membersLoaded;
  await expect(page.getByTestId('equipo-modal')).toBeVisible();
}

// Screenshots only — never submits either modal, so no invitation is ever
// created and no email is ever sent by this spec.
for (const theme of ['light', 'dark'] as const) {
  test(`revoke confirmation and grant-access modal render correctly in ${theme} mode`, async ({ page }, testInfo) => {
    await page.addInitScript((mode) => window.localStorage.setItem('anclora_theme_mode', mode), theme);
    await page.addInitScript(() => {
      window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
        necessary: true, analytics: false, marketing: false,
        updatedAt: new Date().toISOString(), version: 'v1',
      }));
      window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
        version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
      }));
    });

    const fixture = loadFixture();
    await loginAsOwner(page, fixture);
    await openTeamModal(page);

    // --- Revoke confirmation dialog ---
    await page.locator(`[data-testid="revoke-access-${fixture.screenshotActive.userId}"]`).click();
    await expect(page.getByRole('heading', { name: 'Revocar acceso' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`revoke-dialog-${theme}-${testInfo.project.name}.png`) });
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // --- Grant-access modal: form step (email prefilled) ---
    await page.locator(`[data-testid="grant-access-emp-${fixture.screenshotRevoked.employeeId}"]`).click();
    await expect(page.getByRole('heading', { name: `Conceder acceso a ${fixture.screenshotRevoked.name}` })).toBeVisible();
    await expect(page.getByTestId('grant-access-email-input')).toHaveValue(fixture.screenshotRevoked.email);
    await page.screenshot({ path: testInfo.outputPath(`grant-access-form-${theme}-${testInfo.project.name}.png`) });

    // --- Grant-access modal: review step ---
    await page.getByTestId('grant-access-next').click();
    await expect(page.getByRole('heading', { name: 'Revisar acceso' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`grant-access-review-${theme}-${testInfo.project.name}.png`) });
  });
}
