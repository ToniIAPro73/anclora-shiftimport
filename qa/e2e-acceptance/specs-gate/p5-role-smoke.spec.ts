import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  areaA: string;
  empA1: string;
  empA2: string;
  shiftToday: string;
  shiftA2: string;
  emails: Record<string, string>;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false, version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, step: 'CONFIRMED',
    }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    window.localStorage.setItem('anclora_theme_mode', 'dark');
  });
});

async function loginApi(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
}

async function logoutApi(page: Page) {
  const response = await page.request.post('/api/auth/logout');
  expect(response.ok()).toBe(true);
}

function mondayOfCurrentWeek(): string {
  const date = new Date();
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

test('P5 role smoke: scoped planner, admin eligibility, employee portal', async ({ page }) => {
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });

  // PLANNER authorization variants stay in the same browser context and need
  // no UI navigation: the API is the authoritative scope boundary.
  await loginApi(page, fixture.emails.planner);
  const plannerHeaders = { 'x-organization-id': fixture.orgA };
  const currentWeek = mondayOfCurrentWeek();
  const scopedDraft = await page.request.post('/api/schedules', {
    headers: plannerHeaders,
    data: { areaId: fixture.areaA, periodStart: currentWeek },
  });
  expect(scopedDraft.status()).toBe(201);

  const widenedDraft = await page.request.post('/api/schedules', {
    headers: plannerHeaders,
    data: { periodStart: currentWeek },
  });
  expect(widenedDraft.status()).toBe(403);
  await logoutApi(page);

  // ADMIN UI: active Employees are schedulable; admin-only memberships are not.
  await loginApi(page, fixture.emails.admin);
  await page.goto('/app/schedule', { waitUntil: 'domcontentloaded' });
  const planner = page.getByTestId('weekly-planner');
  await expect(planner).toHaveAttribute('data-state', 'ready');
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Uno$/ })).toBeVisible();
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Z Admin Employee$/ })).toBeVisible();
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Admin$/ })).toHaveCount(0);
  await logoutApi(page);

  // EMPLOYEE UI/API: own data is available, planner is not.
  await loginApi(page, fixture.emails.emp);
  const ownShift = await page.request.get(`/api/me/shifts/${fixture.shiftToday}`);
  expect(ownShift.status()).toBe(200);
  const otherEmployeeShift = await page.request.get(`/api/me/shifts/${fixture.shiftA2}`);
  expect(otherEmployeeShift.status()).toBe(404);
  await page.goto('/app/schedule', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('employee-portal')).toBeVisible();

  expect(nativeDialogs).toEqual([]);
});
