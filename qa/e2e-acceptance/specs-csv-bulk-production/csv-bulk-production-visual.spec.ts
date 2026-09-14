import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Fixture {
  runId: string;
  ownerEmail: string;
  ownerPassword: string;
  existingEmployeeExternalId: string;
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'csv-bulk-production-fixture.json'), 'utf8'));
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
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page.locator('[data-testid="sidebar-team"]').click();
  await membersLoaded;
  await expect(page.getByTestId('equipo-modal')).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // 1px rounding tolerance
}

// Visual-states-only run (task's 5 contract viewports x light/dark): opens
// both importers and reaches a real preview (including a rejected row, so
// error-state styling is captured too), but never confirms an import — no
// invitation is created, no email is ever sent by this spec.
for (const theme of ['light', 'dark'] as const) {
  test(`employees and users CSV importers render correctly in ${theme} mode`, async ({ page }, testInfo) => {
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
    await assertNoHorizontalOverflow(page);

    // --- Employees importer: empty state ---
    await page.getByTestId('bulk-import-employees-button').click();
    await expect(page.getByTestId('bulk-csv-employees')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar importación' })).toBeVisible(); // CTA always visible
    await expect(page.getByText(/teamWorkspace\./)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`employees-empty-${theme}-${testInfo.project.name}.png`) });

    // --- Employees importer: preview with a valid row and a rejected row ---
    await page.setInputFiles('#bulk-file-employees', {
      name: 'import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`externalEmployeeId,name,area\nVISUAL-${fixture.runId},Persona Visible Ñoño,Inexistente\n${fixture.existingEmployeeExternalId},Elena Vieja,`, 'utf8'),
    });
    await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
    await expect(page.getByText('El área no existe en esta organización')).toBeVisible();
    await expect(page.getByText(/teamWorkspace\./)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirmar importación' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`employees-preview-${theme}-${testInfo.project.name}.png`) });
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // --- Users importer: empty state ---
    await page.getByTestId('bulk-import-users-button').click();
    await expect(page.getByTestId('bulk-csv-users')).toBeVisible();
    await expect(page.getByText(/teamWorkspace\./)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`users-empty-${theme}-${testInfo.project.name}.png`) });

    // --- Users importer: preview with a valid row and a rejected row ---
    await page.setInputFiles('#bulk-file-users', {
      name: 'import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`email,displayName,role,externalEmployeeId,locale\nvisual+csvbulk${fixture.runId}@e2e.test,Persona Visible,EMPLOYEE,,es\nrol.invalido.visual+csvbulk${fixture.runId}@e2e.test,Rol Invalido,OWNER,,es`, 'utf8'),
    });
    await expect(page.getByRole('heading', { name: 'Vista previa' })).toBeVisible();
    await expect(page.getByText('Rol no permitido; OWNER no se puede importar')).toBeVisible();
    await expect(page.getByText(/teamWorkspace\./)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`users-preview-${theme}-${testInfo.project.name}.png`) });
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
}
