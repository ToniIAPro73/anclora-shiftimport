import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Employee action menu (MembersModal ⋮) — elevated-surface contract.
 *
 * Regression guard for the transparent-menu bug: the menu used --glass-bg
 * (8% alpha in dark, 72% in light), letting the rows behind bleed through.
 * It must render as an opaque surface in BOTH themes.
 */

const here = __dirname;
const fixture = JSON.parse(readFileSync(join(here, '..', 'artifacts', 'local-fixture.json'), 'utf8'));

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

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.locator('#auth-email').fill(fixture.emails.admin);
  await page.locator('#auth-password').fill(fixture.password);
  await page.locator('form .auth-submit').click();
  await expect(page.getByRole('button', { name: 'Usuarios de la organización' })).toBeVisible();
}

async function openEmployeeMenu(page: Page) {
  await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
  await expect(page.locator('.modal-overlay')).toBeVisible();
  // The modal opens on the "Usuarios" tab; the ⋮ action menu lives under "Empleados".
  await page.locator('.modal-overlay').getByRole('button', { name: 'Empleados', exact: true }).click();
  await page.getByRole('button', { name: 'Acciones de E2E Dos' }).click();
  const menu = page.locator('.employee-menu-list');
  await expect(menu).toBeVisible();
  return menu;
}

/** Alpha channel of the computed background-color (1 when fully opaque). */
async function backgroundAlpha(menu: ReturnType<Page['locator']>) {
  return menu.evaluate((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    const match = bg.match(/rgba?\(([^)]+)\)/);
    if (!match) {
      return -1;
    }
    const parts = match[1].split(',').map((part) => part.trim());
    return parts.length === 4 ? parseFloat(parts[3]) : 1;
  });
}

test.describe('Employee action menu surface', () => {
  test('is fully opaque in dark theme (default)', async ({ page }) => {
    await loginAsAdmin(page);
    const menu = await openEmployeeMenu(page);

    await expect(page.getByRole('menuitem', { name: 'Editar' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Eliminar definitivamente' })).toBeVisible();
    expect(await backgroundAlpha(menu)).toBe(1);
  });

  test('is fully opaque in light theme', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('anclora_theme_mode', 'light');
    });
    await loginAsAdmin(page);
    const menu = await openEmployeeMenu(page);

    expect(await backgroundAlpha(menu)).toBe(1);
    await expect(page.getByRole('menuitem', { name: 'Eliminar definitivamente' })).toBeVisible();
  });

  test('closes on ESC and on click outside, without clipping', async ({ page }) => {
    await loginAsAdmin(page);
    const menu = await openEmployeeMenu(page);

    // Fully inside the viewport (no clipping against the modal edge).
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    await page.keyboard.press('Escape');
    await expect(page.locator('.employee-menu-list')).toHaveCount(0);

    // Reopen, then close via pointer-down outside the menu. ESC may also have
    // closed the modal itself (both listen on document); reopen as needed.
    if ((await page.locator('.modal-overlay').count()) === 0) {
      await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
    }
    await page.getByRole('button', { name: 'Acciones de E2E Dos' }).click();
    await expect(page.locator('.employee-menu-list')).toBeVisible();
    await page.locator('.modal-overlay').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.employee-menu-list')).toHaveCount(0);
  });
});
