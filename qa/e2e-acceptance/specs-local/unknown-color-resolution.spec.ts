import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const FIXTURE_PATH = resolve(__dirname, '../../../test-data/fixtures/parser-regression/Turnos_Sebastian_Pozo_Mendoza.xlsx');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1'
    }));
    window.localStorage.setItem('anclora_shiftimport_shift_types_v1', JSON.stringify({
      types: [
        { id: 'guardia_activa', label: 'Guardia Especial', shortLabel: 'GE', color: '#ff9900', countsAsWork: true },
        { id: 'tipo_archivado', label: 'Turno Obsoleto', shortLabel: 'TO', color: '#999999', countsAsWork: false, archived: true }
      ],
      aliases: {}
    }));
  });

  // Mock authenticated session
  await page.route('**/api/session/me', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'u1', email: 'admin@example.com', displayName: 'Admin' },
        organizationId: 'org-1',
        role: 'OWNER',
        plan: 'team',
        employeeId: 'emp-1',
        memberships: [{ organizationId: 'org-1', organizationName: 'Test Org', role: 'OWNER' }]
      })
    });
  });

  await page.route('**/api/employees**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ employees: [] }) });
  });

  await page.route('**/api/shifts**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shifts: [] }) });
  });

  await page.route('**/api/areas**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ areas: [] }) });
  });
});

test.describe('P5.5-R11-HOTFIX-2 — visible unknown color resolution controls', () => {
  test('renders visible panel, swatches, selectors, ignores technical IDs and unblocks confirm button', async ({ page }) => {
    await page.goto('http://localhost:5173/app');
    await page.waitForTimeout(1000);

    // Open import modal
    await page.locator('[data-testid="sidebar-import"]').click();
    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible();

    const fileInput = modal.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Process file
    const processBtn = modal.locator('.import-process-button').first();
    await processBtn.click();

    // Section 22: Visibility assertions
    const panel = modal.locator('[data-testid="unknown-color-resolutions"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const title = panel.locator('h4');
    await expect(title).toBeVisible();
    await expect(title).toHaveText(/Clasificar colores detectados|Classify detected colors/);

    const rows = modal.locator('[data-testid="unknown-color-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toBeVisible();
    await expect(rows.nth(1)).toBeVisible();

    const swatches = modal.locator('[data-testid="color-swatch"]');
    await expect(swatches).toHaveCount(2);
    await expect(swatches.nth(0)).toBeVisible();
    await expect(swatches.nth(1)).toBeVisible();

    // Swatch colors (green and blue)
    const bg0 = await swatches.nth(0).evaluate(el => window.getComputedStyle(el).backgroundColor);
    const bg1 = await swatches.nth(1).evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(bg0).toBe('rgb(174, 252, 4)');
    expect(bg1).toBe('rgb(169, 208, 245)');

    const selects = modal.locator('[data-testid="unknown-color-row"] select');
    await expect(selects).toHaveCount(2);
    await expect(selects.nth(0)).toBeVisible();
    await expect(selects.nth(1)).toBeVisible();

    const ignoreButtons = modal.locator('[data-testid="unknown-color-row"] button');
    await expect(ignoreButtons).toHaveCount(2);
    await expect(ignoreButtons.nth(0)).toBeVisible();
    await expect(ignoreButtons.nth(1)).toBeVisible();

    // Section 24: No technical IDs visible in UI text
    const textContent = await modal.innerText();
    expect(textContent).not.toContain('__xlsx_style__');
    expect(textContent).not.toContain('AEFC04');
    expect(textContent).not.toContain('A9D0F5');

    // Section 25: Active shift types only (includes custom active, excludes archived)
    const options = await selects.nth(0).locator('option').allTextContents();
    expect(options).toContain('Vacaciones');
    expect(options).toContain('Libre');
    expect(options).toContain('Guardia Especial'); // custom active
    expect(options).not.toContain('Turno Obsoleto'); // archived

    // Section 10 & 23: Enablement & Interaction
    const confirmBtn = modal.getByRole('button', { name: /Confirmar Importación/i });
    await expect(confirmBtn).toBeDisabled();

    // Step 1: Resolve color 1 to Vacaciones
    await selects.nth(0).selectOption({ label: 'Vacaciones' });
    await expect(confirmBtn).toBeDisabled();

    // Step 2: Ignore color 2
    await ignoreButtons.nth(1).click();
    await expect(confirmBtn).toBeEnabled({ timeout: 5000 });
  });
});
