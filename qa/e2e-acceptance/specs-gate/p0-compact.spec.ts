import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  areaA: string;
  empA1: string;
  empB1: string;
  areaB: string;
  emails: Record<string, string>;
};

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

async function login(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
}

function futureDate(weeks: number, day = 2) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + weeks * 7 + day);
  return date.toISOString().slice(0, 10);
}

function importPayload(date: string, fingerprint: string, employeeId = fixture.empA1) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return {
    fileName: 'p0-compact.csv',
    sourceFormat: 'CSV',
    fileFingerprint: fingerprint,
    employeeId,
    shifts: [{ employeeId, date, startTime: '09:00', endTime: '17:00', location: 'P0 Gate', origin: 'IMP' }],
    periodYear: parsed.getUTCFullYear(),
    periodMonth: parsed.getUTCMonth() + 1,
    periodKind: 'multi',
    periodLabel: 'P0 compact gate',
    areaId: fixture.areaA,
  };
}

test('P0 compact planner UI smoke', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await login(page, fixture.emails.planner);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Planificar' }).click();
  await expect(page).toHaveURL(/\/app\/schedule$/);
  await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('P0 compact tenant and role matrix', async ({ page }) => {
  const headers = { 'x-organization-id': fixture.orgA };
  const roles = [
    ['owner', 'OWNER'],
    ['admin', 'ADMIN'],
    ['planner', 'PLANNER'],
    ['emp', 'EMPLOYEE'],
  ] as const;

  for (const [emailKey, role] of roles) {
    await login(page, fixture.emails[emailKey]);
    const employeeMatch = await page.request.get('/api/employees', {
      headers, params: { match: '1', externalEmployeeId: 'B001' },
    });
    expect(employeeMatch.status(), role).toBe(200);
    expect((await employeeMatch.json()).employees, role).toEqual([]);

    const foreignShiftRead = await page.request.get('/api/shifts', {
      headers, params: { employeeId: fixture.empB1 },
    });
    expect([200, 403, 404], role).toContain(foreignShiftRead.status());
    if (foreignShiftRead.status() === 200) {
      expect((await foreignShiftRead.json()).shifts.every(
        (shift: { organizationId: string }) => shift.organizationId === fixture.orgA,
      ), role).toBe(true);
    }

    const members = await page.request.get('/api/memberships', { headers });
    if (role === 'OWNER' || role === 'ADMIN') {
      expect(members.status(), role).toBe(200);
      expect(JSON.stringify(await members.json()), role).not.toContain('owner-b@e2e.test');
    } else {
      expect(members.status(), role).toBe(403);
    }

    const foreignWrite = await page.request.patch('/api/employees', {
      headers, data: { id: fixture.empB1, name: 'P0 cross-tenant attempt' },
    });
    expect([403, 404], role).toContain(foreignWrite.status());
  }
});

test('P0 compact import future, idempotency, scope, and fail-closed checks', async ({ page }) => {
  const headers = { 'x-organization-id': fixture.orgA };
  const date = futureDate(30);
  const fingerprint = 'a'.repeat(63) + '1';
  await login(page, fixture.emails.planner);

  const first = await page.request.post('/api/imports/confirm-split', {
    headers, data: importPayload(date, fingerprint),
  });
  expect(first.status()).toBe(201);
  expect(await first.json()).toMatchObject({ classification: 'FUTURE' });

  const repeat = await page.request.post('/api/imports/confirm-split', {
    headers, data: importPayload(date, fingerprint),
  });
  expect(repeat.status()).toBe(200);
  expect(await repeat.json()).toMatchObject({ deduplicated: true });

  await login(page, fixture.emails.emp);
  const before = await (await page.request.get('/api/imports?pageSize=50', { headers })).json();
  const denied = await page.request.post('/api/imports/confirm-split', {
    headers, data: importPayload(futureDate(31), 'b'.repeat(63) + '2'),
  });
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({ code: 'FUTURE_IMPORT_REQUIRES_PLANNING' });
  const after = await (await page.request.get('/api/imports?pageSize=50', { headers })).json();
  expect(after.total).toBe(before.total);

  await login(page, fixture.emails.planner);
  const crossTenant = await page.request.post('/api/imports/confirm-split', {
    headers,
    data: importPayload(futureDate(32), 'c'.repeat(63) + '3', fixture.empB1),
  });
  expect(crossTenant.status()).toBe(403);
});

test('P0 compact employee portal and approval API smoke', async ({ page }) => {
  await login(page, fixture.emails.emp);
  const own = await page.request.get('/api/me/shifts/today');
  expect(own.status()).toBe(200);
  expect((await own.json()).shifts.every((shift: { employeeId: string }) => shift.employeeId === fixture.empA1)).toBe(true);

  const foreign = await page.request.get(`/api/me/shifts/${fixture.shiftB}`);
  expect([403, 404]).toContain(foreign.status());

  await login(page, fixture.emails.admin);
  const approvalPolicy = await page.request.get(`/api/organizations/${fixture.orgA}/approval-policy`, {
    headers: { 'x-organization-id': fixture.orgA },
  });
  expect([200, 404]).toContain(approvalPolicy.status());
});
