import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  emails: Record<string, string>;
};

async function prepare(page: Page, locale: 'es' | 'en', theme: 'light' | 'dark') {
  await page.addInitScript(({ nextLocale, nextTheme }) => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', nextLocale);
    window.localStorage.setItem('anclora_theme_mode', nextTheme);
  }, { nextLocale: locale, nextTheme: theme });
}

async function login(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
}

async function assertNoAxeViolations(page: Page, label: string, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  expect(results.violations, `${label} accessibility violations`).toEqual([]);
}

test('focused axe pass: planner desktop and unified employee shell mobile', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  const plannerPage = await context.newPage();
  try {
    await prepare(plannerPage, 'es', 'light');
    await login(plannerPage, fixture.emails.planner);
    await plannerPage.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(plannerPage.getByTestId('app-shell')).toBeVisible();
    await expect(plannerPage.getByText('Anclora ShiftImport', { exact: true })).toBeVisible();
    await assertNoAxeViolations(plannerPage, 'dashboard-es-light-desktop', testInfo);
    await plannerPage.getByRole('button', { name: 'Planificar' }).click();
    await expect(plannerPage).toHaveURL(/\/app\/schedule$/);
    await expect(plannerPage.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
    await assertNoAxeViolations(plannerPage, 'planner-es-light-desktop', testInfo);

    const employeePage = await context.newPage({ viewport: { width: 390, height: 844 } });
    await prepare(employeePage, 'en', 'dark');
    await login(employeePage, fixture.emails.emp);
    await employeePage.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(employeePage.getByTestId('app-shell')).toBeVisible();
    await assertNoAxeViolations(employeePage, 'employee-en-dark-mobile', testInfo);
  } finally {
    await context.close();
  }
});
