import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Fixture {
  runId: string;
  organizationId: string;
  ownerEmail: string;
  ownerPassword: string;
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'team-invitations-layout-fixture.json'), 'utf8'));
}

async function loginAsOwner(page: Page, fixture: Fixture) {
  await page.goto('/login');
  await page.locator('#auth-email').fill(fixture.ownerEmail);
  await page.locator('#auth-password').fill(fixture.ownerPassword);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function openTeamModal(page: Page) {
  const membersLoaded = page.waitForResponse((r) => r.url().includes('/api/memberships') && r.request().method() === 'GET' && r.ok());
  const mobileMenu = page.locator('[data-testid="app-shell-mobile-menu"]');
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click();
  }
  await page.locator('[data-testid="sidebar-team"]').click();
  await membersLoaded;
  await expect(page.getByTestId('equipo-modal')).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // 1px tolerance for subpixel rounding
}

for (const theme of ['light', 'dark'] as const) {
  test(`invitations layout and personas table coexistence in ${theme} mode`, async ({ page }, testInfo) => {
    await page.addInitScript((mode) => {
      window.localStorage.setItem('anclora_theme_mode', mode);
      window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
        necessary: true, analytics: false, marketing: false,
        updatedAt: new Date().toISOString(), version: 'v1',
      }));
      window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
        version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
      }));
    }, theme);

    const fixture = loadFixture();
    await loginAsOwner(page, fixture);
    await openTeamModal(page);
    await assertNoHorizontalOverflow(page);

    // 1. Pending invitations section is visible and properly bounded
    const invitationsSection = page.getByTestId('pending-invitations-section');
    await expect(invitationsSection).toBeVisible();

    const title = page.locator('#pending-invitations-title');
    await expect(title).toBeVisible();

    const invitationsList = page.getByTestId('pending-invitations-list');
    await expect(invitationsList).toBeVisible();

    // Verify 6 pending invitations exist
    const items = invitationsList.locator('[data-testid^="pending-invitation-"]');
    await expect(items).toHaveCount(6);

    // 2. Scroll to the 6th item and verify it is not cut off
    const lastItem = items.nth(5);
    await lastItem.scrollIntoViewIfNeeded();
    await expect(lastItem).toBeVisible();

    // Verify action buttons on the 6th item are intact and reachable
    const resendBtn = lastItem.locator('[data-testid^="resend-invitation-"]');
    const revokeBtn = lastItem.locator('[data-testid^="revoke-invitation-"]');
    await expect(resendBtn).toBeVisible();
    await expect(revokeBtn).toBeVisible();
    await expect(resendBtn).toBeEnabled();
    await expect(revokeBtn).toBeEnabled();

    // 3. Personas table is visible simultaneously below invitations section
    const tableContainer = page.locator('.equipo-modal__table-container');
    await expect(tableContainer).toBeVisible();

    const personasTable = page.getByTestId('personas-table');
    await expect(personasTable).toBeVisible();

    // Table contains employees
    await expect(personasTable.getByText('Ana Torres Vidal')).toBeVisible();
    await expect(personasTable.getByText('Marc Ferragut Bosch')).toBeVisible();

    // 4. Verify status filter functionality
    const statusSelect = page.getByTestId('filter-status');
    await expect(statusSelect).toHaveValue('all');

    // Filter by pending access
    await statusSelect.selectOption('pending_access');
    await expect(statusSelect).toHaveValue('pending_access');

    // Filtered table should still show pending employees
    await expect(personasTable.getByText('Ana Torres Vidal')).toBeVisible();
    // Inactive or active uninvited employees should be filtered out
    await expect(personasTable.getByText('Marc Ferragut Bosch')).toHaveCount(0);

    // Pending invitations section remains visible while filtered
    await expect(invitationsSection).toBeVisible();

    // Switch back to "all"
    await statusSelect.selectOption('all');
    await expect(statusSelect).toHaveValue('all');
    await expect(personasTable.getByText('Marc Ferragut Bosch')).toBeVisible();

    // No horizontal scroll
    await assertNoHorizontalOverflow(page);

    // Capture screenshot
    const screenshotDir = join(__dirname, '..', 'artifacts', 'team-invitations-layout');
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotFilename = `invitations-layout-${theme}-${testInfo.project.name}.png`;
    const localArtifactPath = join(screenshotDir, screenshotFilename);

    const testOutputPath = testInfo.outputPath(screenshotFilename);
    await page.screenshot({ path: testOutputPath, fullPage: false });
    copyFileSync(testOutputPath, localArtifactPath);
  });
}
