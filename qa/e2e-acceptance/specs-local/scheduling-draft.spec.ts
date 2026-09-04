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

  const overlap = await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA1, date: '2026-09-29', startTime: '10:00', endTime: '12:00' },
  });
  expect(overlap.status()).toBe(422);
  expect(await overlap.json()).toMatchObject({ code: 'OVERLAP', conflictingAssignmentId: assignment.assignment.id });

  const adjacent = await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA1, date: '2026-09-30', startTime: '09:00', endTime: '17:00' },
  });
  expect(adjacent.status()).toBe(201);
  const adjacentAssignment = await adjacent.json();
  const adjacentItemUrl = `${assignmentUrl}/${adjacentAssignment.assignment.id}`;

  const updated = await page.request.patch(assignmentItemUrl, { headers, data: { location: 'Lobby' } });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).assignment.location).toBe('Lobby');

  const overlapOnUpdate = await page.request.patch(adjacentItemUrl, {
    headers, data: { date: '2026-09-29', startTime: '16:00', endTime: '20:00' },
  });
  expect(overlapOnUpdate.status()).toBe(422);
  expect(await overlapOnUpdate.json()).toMatchObject({ code: 'OVERLAP', conflictingAssignmentId: assignment.assignment.id });

  const deleted = await page.request.delete(assignmentItemUrl, { headers });
  expect(deleted.status()).toBe(204);
  const deletedAdjacent = await page.request.delete(adjacentItemUrl, { headers });
  expect(deletedAdjacent.status()).toBe(204);
  await page.getByRole('button', { name: 'Salir' }).click();
});

test('planner enforces 11 hours of rest and accepts the exact boundary', async ({ page }) => {
  await loginAs(page, fixture.emails.planner);
  const headers = { 'x-organization-id': fixture.orgA };
  const scheduleResponse = await page.request.post('/api/schedules', {
    headers,
    data: { areaId: fixture.areaA, periodStart: '2026-10-05' },
  });
  expect(scheduleResponse.status()).toBe(201);
  const schedule = await scheduleResponse.json();
  const assignmentUrl = `/api/schedules/${schedule.scheduleId}/versions/${schedule.scheduleVersionId}/assignments`;

  const firstResponse = await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA1, date: '2026-10-06', startTime: '09:00', endTime: '17:00' },
  });
  expect(firstResponse.status()).toBe(201);
  const first = await firstResponse.json();

  const tooLittleRest = await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA1, date: '2026-10-07', startTime: '03:59', endTime: '12:00' },
  });
  expect(tooLittleRest.status()).toBe(422);
  expect(await tooLittleRest.json()).toMatchObject({
    code: 'REST_RULE_VIOLATION', minimumRestHours: 11, conflictingAssignmentId: first.assignment.id,
  });

  const exactBoundary = await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA1, date: '2026-10-07', startTime: '04:00', endTime: '12:00' },
  });
  expect(exactBoundary.status()).toBe(201);
  const boundary = await exactBoundary.json();

  await page.request.delete(`${assignmentUrl}/${first.assignment.id}`, { headers });
  await page.request.delete(`${assignmentUrl}/${boundary.assignment.id}`, { headers });
  await page.getByRole('button', { name: 'Salir' }).click();
});

test('planner publishes atomically and excludes an employee deactivated before publication', async ({ page }) => {
  await loginAs(page, fixture.emails.planner);
  const headers = { 'x-organization-id': fixture.orgA };
  const scheduleResponse = await page.request.post('/api/schedules', {
    headers,
    data: { areaId: fixture.areaA, periodStart: '2026-11-02' },
  });
  expect(scheduleResponse.status()).toBe(201);
  const schedule = await scheduleResponse.json();
  const assignmentUrl = `/api/schedules/${schedule.scheduleId}/versions/${schedule.scheduleVersionId}/assignments`;
  expect((await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA1, date: '2026-11-03', startTime: '09:00', endTime: '17:00', location: 'Scheduled' },
  })).status()).toBe(201);
  expect((await page.request.post(assignmentUrl, {
    headers,
    data: { employeeId: fixture.empA2, date: '2026-11-03', startTime: '09:00', endTime: '17:00', location: 'Excluded' },
  })).status()).toBe(201);

  await loginAs(page, fixture.emails.owner);
  const deactivated = await page.request.patch('/api/employees', {
    headers,
    data: { id: fixture.empA2, status: 'inactive' },
  });
  expect(deactivated.status()).toBe(200);

  await loginAs(page, fixture.emails.planner);
  const published = await page.request.post(
    `/api/schedules/${schedule.scheduleId}/versions/${schedule.scheduleVersionId}/publish`,
    { headers },
  );
  expect(published.status()).toBe(200);
  expect(await published.json()).toMatchObject({
    status: 'PUBLISHED', createdShiftCount: 1, excludedAssignmentCount: 1,
  });

  const shifts = await page.request.get('/api/shifts?areaId=' + encodeURIComponent(fixture.areaA), { headers });
  expect(shifts.status()).toBe(200);
  expect((await shifts.json()).shifts.filter((shift: { date: string; origin: string }) => shift.date === '2026-11-03')).toEqual([
    expect.objectContaining({ origin: 'schedule', location: 'Scheduled' }),
  ]);

  const repeated = await page.request.post(
    `/api/schedules/${schedule.scheduleId}/versions/${schedule.scheduleVersionId}/publish`,
    { headers },
  );
  expect(repeated.status()).toBe(409);
  await page.getByRole('button', { name: 'Salir' }).click();
});

test('planner can open the weekly UI and create an empty draft', async ({ page }) => {
  await loginAs(page, fixture.emails.planner);
  await expect(page.getByRole('button', { name: 'Planificar' })).toBeVisible();
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page).toHaveURL(/\/app\/schedule$/);
  await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
  await expect(page.getByText('Todavía no hay un borrador para esta semana')).toBeVisible();

  await page.getByRole('button', { name: 'Crear borrador semanal' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /E2E Uno/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tabla accesible' }).click();
  await expect(page.getByRole('table')).toHaveClass(/weekly-planner__table/);
  await page.reload();
  await expect(page.getByRole('table')).toHaveClass(/weekly-planner__table/);
  const addButton = page.getByRole('button', { name: /Añadir turno para/ }).first();
  await addButton.focus();
  await expect(addButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('form', { name: 'Añadir turno' })).toBeVisible();
  await expect(page.locator('#planner-editor-employee')).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Volver al calendario' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole('button', { name: 'Salir' }).click();
});
