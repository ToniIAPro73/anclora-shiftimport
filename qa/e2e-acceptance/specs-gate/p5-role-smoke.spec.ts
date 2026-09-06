import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  orgB: string;
  orgFresh: string;
  areaA: string;
  empA1: string;
  empA2: string;
  empB1: string;
  empInactive: string;
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
  const session = await page.request.get('/api/session/me');
  expect(session.ok()).toBe(true);
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

test('P5 role smoke: scoped planner, admin eligibility, unified employee shell', async ({ page }) => {
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

  // D-05: an unassigned planner is blocked when active areas exist, while
  // an unassigned planner in an organization without areas remains global.
  await loginApi(page, fixture.emails.plannerNoArea);
  const blockedPlannerRead = await page.request.get('/api/schedules', { headers: plannerHeaders });
  expect(blockedPlannerRead.status()).toBe(403);
  expect((await blockedPlannerRead.json()).code).toBe('SCOPE_UNAVAILABLE');
  const resetDenied = await page.request.post('/api/organizations/reset', { headers: plannerHeaders });
  expect(resetDenied.status()).toBe(403);
  await page.goto('/app/schedule', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('planner-scope-unavailable')).toBeVisible();
  await logoutApi(page);

  await loginApi(page, fixture.emails.plannerGlobal);
  const globalPlannerRead = await page.request.get('/api/schedules', {
    headers: { 'x-organization-id': fixture.orgFresh },
  });
  expect(globalPlannerRead.status()).toBe(200);
  await logoutApi(page);

  // ADMIN UI: active Employees are schedulable; admin-only memberships are not.
  await loginApi(page, fixture.emails.admin);
  await page.goto('/app/schedule', { waitUntil: 'domcontentloaded' });
  const planner = page.getByTestId('weekly-planner');
  await expect(planner).toHaveAttribute('data-state', 'ready');
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Uno$/ })).toBeVisible();
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Z Admin Employee$/ })).toBeVisible();
  await expect(planner.locator('.weekly-planner__grid tbody th span').filter({ hasText: /^E2E Admin$/ })).toHaveCount(0);
  const members = await page.request.get('/api/memberships', { headers: { 'x-organization-id': fixture.orgA } });
  expect(members.status()).toBe(200);
  const adminEmployees = await page.request.get('/api/employees', { headers: { 'x-organization-id': fixture.orgA } });
  expect(adminEmployees.status()).toBe(200);
  const adminAreas = await page.request.get('/api/areas', { headers: { 'x-organization-id': fixture.orgA } });
  expect(adminAreas.status()).toBe(200);
  const adminImports = await page.request.get('/api/imports?pageSize=1', { headers: { 'x-organization-id': fixture.orgA } });
  expect(adminImports.status()).toBe(200);
  await logoutApi(page);

  // EMPLOYEE UI/API: own data is available, planner is not.
  await loginApi(page, fixture.emails.emp);
  const ownShift = await page.request.get(`/api/me/shifts/${fixture.shiftToday}`);
  expect(ownShift.status()).toBe(200);
  const otherEmployeeShift = await page.request.get(`/api/me/shifts/${fixture.shiftA2}`);
  expect(otherEmployeeShift.status()).toBe(404);
  const selfWrite = await page.request.patch('/api/shifts', {
    data: {
      employeeId: fixture.empA1,
      upserts: [{ employeeId: fixture.empA1, date: '2025-01-15', startTime: '09:00', endTime: '17:00', location: 'P5 self import', origin: 'IMP' }],
    },
  });
  expect(selfWrite.status()).toBe(200);
  const foreignWrite = await page.request.patch('/api/shifts', {
    data: {
      employeeId: fixture.empA2,
      upserts: [{ employeeId: fixture.empA2, date: '2025-01-16', startTime: '09:00', endTime: '17:00', location: 'P5 forbidden', origin: 'IMP' }],
    },
  });
  expect(foreignWrite.status()).toBe(403);
  expect((await foreignWrite.json()).code).toBe('SCOPE_FORBIDDEN');
  const futureSelfWrite = await page.request.patch('/api/shifts', {
    data: {
      employeeId: fixture.empA1,
      upserts: [{ employeeId: fixture.empA1, date: '2099-01-15', startTime: '09:00', endTime: '17:00', location: 'P5 future forbidden', origin: 'IMP' }],
    },
  });
  expect(futureSelfWrite.status()).toBe(403);
  expect((await futureSelfWrite.json()).code).toBe('SELF_IMPORT_FUTURE_FORBIDDEN');
  const crossTenantWrite = await page.request.patch('/api/shifts', {
    data: {
      employeeId: fixture.empB1,
      upserts: [{ employeeId: fixture.empB1, date: '2025-01-17', startTime: '09:00', endTime: '17:00', location: 'P5 cross tenant', origin: 'IMP' }],
    },
  });
  expect(crossTenantWrite.status()).toBe(403);
  expect(['TENANT_FORBIDDEN', 'SCOPE_FORBIDDEN']).toContain((await crossTenantWrite.json()).code);
  await page.goto('/app/schedule', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('sidebar-calendar')).toBeVisible();
  await expect(page.getByTestId('sidebar-self-import')).toBeVisible();
  await expect(page.getByTestId('sidebar-historical-add')).toBeVisible();
  await expect(page.getByTestId('sidebar-requests')).toBeVisible();
  await logoutApi(page);

  // An inactive Employee cannot obtain SELF scope and therefore cannot
  // receive new shifts, even when the membership remains EMPLOYEE. The
  // browser shell is covered by the linked active-employee journey; this
  // inactive case stays API-only to avoid a redundant navigation.
  await loginApi(page, fixture.emails.inactiveEmployee);
  const inactiveShifts = await page.request.get(`/api/shifts?employeeId=${fixture.empInactive}`);
  expect(inactiveShifts.status()).toBe(403);
  await logoutApi(page);

  // ADMIN reset capability is checked last because it intentionally clears
  // the synthetic organization data before teardown.
  await loginApi(page, fixture.emails.admin);
  const reset = await page.request.post('/api/organizations/reset', {
    headers: { 'x-organization-id': fixture.orgA },
  });
  expect(reset.status()).toBe(200);
  await logoutApi(page);

  expect(nativeDialogs).toEqual([]);
});
