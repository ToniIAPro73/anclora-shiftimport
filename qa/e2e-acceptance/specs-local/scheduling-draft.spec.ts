import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

async function loginAs(page: Page, email: string) {
  await page.request.post('/api/auth/logout');
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(fixture.password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.ok(),
  );
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

test('planner creates one weekly draft and cannot widen an area scope', async ({ page }) => {
  await loginAs(page, fixture.emails.planner);
  const headers = { 'x-organization-id': fixture.orgA };
  const body = { areaId: fixture.areaA, periodStart: '2026-09-07' };

  const created = await page.request.post('/api/schedules', { headers, data: body });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ versionNumber: 1, status: 'DRAFT' });

  const duplicate = await page.request.post('/api/schedules', { headers, data: body });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ code: 'SCHEDULE_DRAFT_EXISTS' });

  const widened = await page.request.post('/api/schedules', {
    headers,
    data: { periodStart: '2026-09-14' },
  });
  expect(widened.status()).toBe(403);
  expect(await widened.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });

  await page.getByRole('button', { name: 'Salir' }).click();
});

test('employee cannot create a scheduling draft', async ({ page }) => {
  await loginAs(page, fixture.emails.emp);
  const response = await page.request.post('/api/schedules', {
    headers: { 'x-organization-id': fixture.orgA },
    data: { areaId: fixture.areaA, periodStart: '2026-09-21' },
  });
  expect(response.status()).toBe(403);
  await page.getByRole('button', { name: 'Salir' }).click();
});

test('planner can create, edit, and delete a draft assignment', async ({ page }) => {
  await loginAs(page, fixture.emails.planner);
  const headers = { 'x-organization-id': fixture.orgA };
  const scheduleResponse = await page.request.post('/api/schedules', {
    headers,
    data: { areaId: fixture.areaA, periodStart: '2026-09-28' },
  });
  expect(scheduleResponse.status()).toBe(201);
  const schedule = await scheduleResponse.json();
  const assignmentUrl = `/api/schedules/${schedule.scheduleId}/versions/${schedule.scheduleVersionId}/assignments`;
  const created = await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA1, date: '2026-09-29', startTime: '09:00', endTime: '17:00', location: 'Front desk' },
  });
  expect(created.status()).toBe(201);
  const assignment = await created.json();
  const assignmentItemUrl = `${assignmentUrl}/${assignment.assignment.id}`;

  const updated = await page.request.patch(assignmentItemUrl, { headers, data: { location: 'Lobby' } });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).assignment.location).toBe('Lobby');

  const deleted = await page.request.delete(assignmentItemUrl, { headers });
  expect(deleted.status()).toBe(204);
  await page.getByRole('button', { name: 'Salir' }).click();
});
