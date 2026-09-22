import { expect, test, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  emails: Record<string, string>;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    window.localStorage.setItem('anclora_theme_mode', 'dark');
    window.localStorage.removeItem('anclora_shiftimport_sidebar_v1');
  });
});

async function loginApi(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', { data: { email, password: fixture.password } });
  expect(response.ok()).toBe(true);
}

async function measureCalendar(page: Page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('.calendar-toolbar')?.getBoundingClientRect();
    const calendar = document.querySelector('.calendar-stage')?.getBoundingClientRect();
    return { calendarTop: calendar?.top ?? -1, calendarHeight: calendar?.height ?? -1, toolbarHeight: toolbar?.height ?? -1 };
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('P5.1 shell: owner workspace, compact nav, drawer and account menu', async ({ page }, testInfo) => {
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });

  await loginApi(page, fixture.emails.owner);
  await page.goto('/app', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('calendar-toolbar')).toBeVisible();
  await expect(page.getByRole('main', { name: 'Espacio de trabajo principal' })).toBeVisible();

  const before = await measureCalendar(page);
  await capture(page, testInfo, 'owner-expanded-dark-1366');

  await page.getByTestId('sidebar-collapse').click();
  await expect(page.getByTestId('app-shell')).toHaveClass(/is-collapsed/);
  await expect(page.getByTestId('sidebar-import')).toHaveAttribute('title', 'Importar turnos');
  await capture(page, testInfo, 'owner-collapsed-dark-1366');

  await page.getByTestId('sidebar-collapse').click();
  await expect(page.getByTestId('app-shell')).toHaveClass(/is-expanded/);

  await page.getByTestId('sidebar-import').click();
  await expect(page.locator('[data-import-modal]')).toBeVisible();
  await page.locator('[data-import-modal]').getByRole('button').first().click();
  await expect(page.locator('[data-import-modal]')).toHaveCount(0);

  await page.getByTestId('sidebar-team').click();
  await expect(page.getByTestId('equipo-modal')).toBeVisible();
  await page.getByRole('dialog').getByRole('button').first().click();
  await expect(page.getByTestId('equipo-modal')).toHaveCount(0);

  await page.getByTestId('sidebar-planner').click();
  await expect(page).toHaveURL(/\/app\/schedule$/);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('weekly-planner')).toBeVisible();
  await page.getByRole('dialog', { name: 'Planificador semanal' }).getByRole('button', { name: 'Cerrar planificador' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('calendar-toolbar')).toBeVisible();

  await page.getByTestId('app-shell-user-menu').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Salir' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await capture(page, testInfo, 'owner-expanded-light-1366');
  await page.getByTestId('sidebar-collapse').click();
  await capture(page, testInfo, 'owner-collapsed-light-1366');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const mobileMenu = page.getByTestId('app-shell-mobile-menu');
  const sidebar = page.getByTestId('app-shell-sidebar');
  const openDrawerAndAssert = async () => {
    await expect(mobileMenu).toBeVisible();
    await expect(mobileMenu).toHaveAttribute('aria-label', /Abrir navegación/);
    await expect(mobileMenu).toHaveAttribute('aria-expanded', 'false');
    await mobileMenu.click();
    await expect(page.getByTestId('app-shell')).toHaveClass(/is-drawer-open/);
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('.ac-drawer-backdrop')).toBeVisible();
    await expect(page.getByTestId('sidebar-import')).toBeVisible();
    await expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Cerrar navegación');
    const focusableCount = await sidebar.locator('button:not([disabled]), a[href]').count();
    for (let index = 0; index < focusableCount; index += 1) {
      await page.keyboard.press('Tab');
      await expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="app-shell-sidebar"]')))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    await expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="app-shell-sidebar"]')))).toBe(true);
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(axe.violations, JSON.stringify(axe.violations)).toEqual([]);
  };

  await openDrawerAndAssert();
  const drawerWidth = await page.getByTestId('app-shell-sidebar').evaluate((element) => element.getBoundingClientRect().width);
  console.log(`P5.1 mobile drawer width=${drawerWidth}`);
  expect(drawerWidth).toBeGreaterThan(240);
  await capture(page, testInfo, 'owner-mobile-drawer');
  await page.locator('.ac-drawer-backdrop').click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('app-shell')).not.toHaveClass(/is-drawer-open/);
  await expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('app-shell-mobile-menu');
  await openDrawerAndAssert();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('app-shell')).not.toHaveClass(/is-drawer-open/);
  await expect(page.locator('.ac-drawer-backdrop')).toBeHidden();
  await expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('app-shell-mobile-menu');

  await page.getByRole('button', { name: /Cambiar tema/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await openDrawerAndAssert();
  await capture(page, testInfo, 'owner-mobile-drawer-light');
  await page.getByRole('button', { name: 'Cerrar navegación' }).click();
  await expect(page.getByTestId('app-shell')).not.toHaveClass(/is-drawer-open/);
  await expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('app-shell-mobile-menu');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDrawerAndAssert();
  await expect(sidebar).toHaveCSS('transition-duration', '0s');
  await page.getByTestId('sidebar-calendar').click();
  await expect(page.getByTestId('app-shell')).not.toHaveClass(/is-drawer-open/);

  await page.getByRole('button', { name: /Cambiar idioma/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(mobileMenu).toHaveAttribute('aria-label', /Open navigation/);
  await mobileMenu.click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByTestId('app-shell')).not.toHaveClass(/is-drawer-open/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('app-shell')).toBeVisible();
  const after = await measureCalendar(page);
  console.log(`P5.1 calendar metrics 1366 baseline=${JSON.stringify(before)} after1440=${JSON.stringify(after)}`);
  expect(after.calendarHeight).toBeGreaterThan(0);
  expect(nativeDialogs).toEqual([]);
});
