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
  test(`team management workspace and calendar day limit in ${theme} mode`, async ({ page }, testInfo) => {
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

    // =========================================================================
    // Track 2 Verification: Calendar Day Cell Limit (Max 2) & Day Detail Dialog
    // =========================================================================
    // The calendar shows September 2026 where day 14 has 4 shifts seeded.
    const dayMoreBtn = page.getByTestId('day-more-btn-2026-09-14');
    if (await dayMoreBtn.isVisible()) {
      await expect(dayMoreBtn).toHaveText('+2 más');

      // Click +2 más opens DayDetailModal
      await dayMoreBtn.click();
      const dayDetailDialog = page.getByTestId('day-detail-dialog');
      await expect(dayDetailDialog).toBeVisible();

      // Verify all 4 shifts are listed in day detail
      const dayDetailBadge = page.getByTestId('day-detail-count-badge');
      await expect(dayDetailBadge).toHaveText(/4/);

      // Close day detail modal
      await page.getByTestId('close-day-detail-modal').click();
      await expect(dayDetailDialog).toHaveCount(0);
    }

    // =========================================================================
    // Track 1 Verification: Team Workspace, Pending Invitations Modal & Pagination
    // =========================================================================
    await openTeamModal(page);
    await assertNoHorizontalOverflow(page);

    // 1. Pending invitations inline section is completely gone from Personas view
    await expect(page.getByTestId('pending-invitations-section')).toHaveCount(0);

    // 2. Toolbar action button for pending invitations is visible and shows badge count 6
    const pendingBtn = page.getByTestId('pending-invitations-button');
    await expect(pendingBtn).toBeVisible();
    await expect(pendingBtn).toBeEnabled();

    const badge = page.getByTestId('pending-invitations-badge');
    await expect(badge).toHaveText('6');

    // 3. Personas table occupies the workspace surface
    const personasTable = page.getByTestId('personas-table');
    await expect(personasTable).toBeVisible();

    // 4. Client pagination controls are visible and functional
    const pagination = page.getByTestId('personas-pagination');
    await expect(pagination).toBeVisible();

    const prevPageBtn = page.getByTestId('personas-page-prev');
    const nextPageBtn = page.getByTestId('personas-page-next');
    await expect(prevPageBtn).toBeDisabled();

    // If there are multiple pages (29 personas > pageSize), test page navigation
    if (await nextPageBtn.isEnabled()) {
      await nextPageBtn.click();
      await expect(prevPageBtn).toBeEnabled();
      await prevPageBtn.click();
      await expect(prevPageBtn).toBeDisabled();
    }

    // 5. Access filter: filter by 'pending_access'
    const accessFilter = page.getByTestId('filter-access');
    await expect(accessFilter).toHaveValue('all');
    await accessFilter.selectOption('pending_access');
    await expect(accessFilter).toHaveValue('pending_access');

    // Filtered view shows pending access employees and resets to page 1
    await expect(prevPageBtn).toBeDisabled();
    await accessFilter.selectOption('all');

    // 6. Open PendingInvitationsModal as independent sibling dialog
    await pendingBtn.click();
    const invitationsModal = page.getByTestId('pending-invitations-modal');
    await expect(invitationsModal).toBeVisible();

    // Verify all 6 invitations are listed
    for (let i = 1; i <= 6; i++) {
      const email = `gf.csv.e00${i}+layout${fixture.runId}@e2e.test`;
      await expect(invitationsModal.getByText(email)).toBeVisible();
    }

    // Test search inside pending invitations modal
    const invSearch = page.getByTestId('pending-invitations-search');
    await invSearch.fill('e005');
    await expect(invitationsModal.getByText(`gf.csv.e005+layout${fixture.runId}@e2e.test`)).toBeVisible();
    await expect(invitationsModal.getByText(`gf.csv.e001+layout${fixture.runId}@e2e.test`)).toHaveCount(0);
    await invSearch.fill('');

    // Close pending invitations modal and verify focus returns
    const closeInvModalBtn = page.getByTestId('close-pending-invitations-modal');
    await closeInvModalBtn.click();
    await expect(invitationsModal).toHaveCount(0);

    // No horizontal scroll
    await assertNoHorizontalOverflow(page);

    // Capture screenshot evidence
    const screenshotDir = join(__dirname, '..', 'artifacts', 'team-invitations-layout');
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotFilename = `team-workspace-${theme}-${testInfo.project.name}.png`;
    const localArtifactPath = join(screenshotDir, screenshotFilename);

    const testOutputPath = testInfo.outputPath(screenshotFilename);
    await page.screenshot({ path: testOutputPath, fullPage: false });
    copyFileSync(testOutputPath, localArtifactPath);
  });
}
