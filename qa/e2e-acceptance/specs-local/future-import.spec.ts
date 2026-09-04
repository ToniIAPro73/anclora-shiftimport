import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  orgB: string;
  areaA: string;
  empA1: string;
  empA2: string;
  empB1: string;
  emails: Record<string, string>;
};

const today = new Date().toISOString().slice(0, 10);
const futureDate = (weeks: number, day = 2) => {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7 + day);
  return date.toISOString().slice(0, 10);
};
const pastDate = () => {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCFullYear(2025, 0, 15);
  return date.toISOString().slice(0, 10);
};
const shift = (date: string, employeeId = fixture.empA1) => ({
  employeeId,
  date,
  startTime: '09:00',
  endTime: '17:00',
  location: 'M14 E2E',
  origin: 'IMP',
});

async function login(request: APIRequestContext, email: string, orgId: string) {
  const response = await request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBeTruthy();
  await request.get('/api/session/me', { headers: { 'x-organization-id': orgId } });
}

async function confirm(request: APIRequestContext, shifts: unknown[], fingerprint: string, employeeId = fixture.empA1, extra: Record<string, unknown> = {}) {
  return request.post('/api/imports/confirm-split', {
    headers: { 'x-organization-id': fixture.orgA },
    data: {
      fileName: 'm14-e2e.csv',
      sourceFormat: 'CSV',
      fileFingerprint: fingerprint,
      employeeId,
      shifts,
      periodYear: 2026,
      periodMonth: 9,
      periodKind: 'multi',
      periodLabel: 'M14 E2E',
      areaId: fixture.areaA,
      ...extra,
    },
  });
}

test.describe('R3-M14 future import integration', () => {
  test('A/B/D/F/G/L: historical compatibility, future/mixed atomicity, multiweek drafts, idempotency and provenance', async ({ page }) => {
    await login(page.request, fixture.emails.planner, fixture.orgA);

    const futureFingerprint = 'a'.repeat(64);
    const futureResponse = await confirm(page.request, [shift(futureDate(20))], futureFingerprint);
    expect(futureResponse.status()).toBe(201);
    const futureBody = await futureResponse.json();
    expect(futureBody.classification).toBe('FUTURE');
    expect(futureBody.future.createdAssignmentCount).toBe(1);
    expect(futureBody.future.draftCount).toBe(1);
    expect(futureBody.future.drafts[0].areaId).toBe(fixture.areaA);

    const schedules = await (await page.request.get(`/api/schedules?areaId=${fixture.areaA}`, {
      headers: { 'x-organization-id': fixture.orgA },
    })).json();
    const schedule = schedules.schedules.find((item: { periodStart: string }) => item.periodStart === futureBody.future.drafts[0].periodStart);
    expect(schedule).toBeTruthy();
    const snapshot = await (await page.request.get(`/api/schedules/${schedule.scheduleId}/versions/${schedule.id}`, {
      headers: { 'x-organization-id': fixture.orgA },
    })).json();
    expect(snapshot.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeId: fixture.empA1, importId: futureBody.importId }),
    ]));

    const mixedFingerprint = 'b'.repeat(64);
    const mixedResponse = await confirm(page.request, [shift(pastDate()), shift(futureDate(21))], mixedFingerprint);
    expect(mixedResponse.status()).toBe(201);
    const mixedBody = await mixedResponse.json();
    expect(mixedBody.classification).toBe('MIXED');
    expect(mixedBody.historical.persistedCount).toBe(1);
    expect(mixedBody.future.createdAssignmentCount).toBe(1);

    const multiweekShifts = [shift(futureDate(23)), shift(futureDate(24))];
    const multiweekFingerprint = 'c'.repeat(64);
    const multiweekResponse = await confirm(page.request, multiweekShifts, multiweekFingerprint);
    expect(multiweekResponse.status()).toBe(201);
    const multiweekBody = await multiweekResponse.json();
    expect(multiweekBody.future.draftCount).toBe(2);
    expect(multiweekBody.future.createdAssignmentCount).toBe(2);

    const repeatResponse = await confirm(page.request, multiweekShifts, multiweekFingerprint);
    expect(repeatResponse.status()).toBe(200);
    const repeatBody = await repeatResponse.json();
    expect(repeatBody.deduplicated).toBe(true);
    expect(repeatBody.future.createdAssignmentCount).toBe(0);
    expect(repeatBody.future.existingAssignmentCount).toBe(2);

    const historicalResponse = await page.request.post('/api/imports', {
      headers: { 'x-organization-id': fixture.orgA },
      data: {
        fileName: 'm14-historical.csv', sourceFormat: 'CSV', fileFingerprint: 'd'.repeat(64),
        employeeId: fixture.empA1, periodYear: 2026, periodMonth: 9, areaId: fixture.areaA,
      },
    });
    expect(historicalResponse.status()).toBe(201);
    const historicalImportId = (await historicalResponse.json()).import.id as string;
    const historicalWrite = await page.request.patch('/api/shifts', {
      headers: { 'x-organization-id': fixture.orgA },
      data: { employeeId: fixture.empA1, upserts: [{ ...shift(pastDate()), importId: historicalImportId, areaId: fixture.areaA }] },
    });
    expect(historicalWrite.status()).toBe(200);
    const historicalWriteBody = await historicalWrite.json();
    expect(historicalWriteBody.saved).toHaveLength(1);

    // Real DB rollback proof: reuse an existing primary key with different
    // semantic data after the import/draft queries have started. PostgreSQL
    // aborts the transaction, so neither the new import nor its draft lands.
    const collisionId = historicalWriteBody.saved[0].id as string;
    const importCountBeforeFailure = (await (await page.request.get('/api/imports?pageSize=50', { headers: { 'x-organization-id': fixture.orgA } })).json()).total;
    const scheduleCountBeforeFailure = (await (await page.request.get(`/api/schedules?areaId=${fixture.areaA}`, { headers: { 'x-organization-id': fixture.orgA } })).json()).schedules.length;
    const inducedFailure = await confirm(page.request, [
      { ...shift(pastDate()), id: collisionId, location: 'M14 collision' },
      shift(futureDate(26)),
    ], '3'.repeat(64));
    expect(inducedFailure.status()).toBe(500);
    const importCountAfterFailure = (await (await page.request.get('/api/imports?pageSize=50', { headers: { 'x-organization-id': fixture.orgA } })).json()).total;
    const scheduleCountAfterFailure = (await (await page.request.get(`/api/schedules?areaId=${fixture.areaA}`, { headers: { 'x-organization-id': fixture.orgA } })).json()).schedules.length;
    expect(importCountAfterFailure).toBe(importCountBeforeFailure);
    expect(scheduleCountAfterFailure).toBe(scheduleCountBeforeFailure);
  });

  test('C/E/K: no capability, mixed rejection and cross-tenant requests fail closed with zero transaction writes', async ({ page }) => {
    await login(page.request, fixture.emails.emp, fixture.orgA);
    const before = await (await page.request.get('/api/imports?pageSize=50', { headers: { 'x-organization-id': fixture.orgA } })).json();
    const denied = await confirm(page.request, [shift(futureDate(22))], 'e'.repeat(64));
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe('FUTURE_IMPORT_REQUIRES_PLANNING');
    const after = await (await page.request.get('/api/imports?pageSize=50', { headers: { 'x-organization-id': fixture.orgA } })).json();
    expect(after.total).toBe(before.total);
    const mixedDenied = await confirm(page.request, [shift(pastDate()), shift(futureDate(22))], 'd'.repeat(64));
    expect(mixedDenied.status()).toBe(403);
    expect((await mixedDenied.json()).code).toBe('FUTURE_IMPORT_REQUIRES_PLANNING');

    await login(page.request, fixture.emails.planner, fixture.orgA);
    const crossTenant = await confirm(page.request, [shift(futureDate(23), fixture.empB1)], 'f'.repeat(64), fixture.empB1, { areaId: fixture.areaA });
    expect(crossTenant.status()).toBe(403);
    expect((await crossTenant.json()).code).toBe('TENANT_FORBIDDEN');
  });

  test('I/J: an AREA planner may import inside the area but cannot write outside it', async ({ page }) => {
    await login(page.request, fixture.emails.owner, fixture.orgA);
    const areaResponse = await page.request.post('/api/areas', {
      headers: { 'x-organization-id': fixture.orgA },
      data: { name: 'M14 Outside Area', code: 'M14-OUT' },
    });
    expect(areaResponse.status()).toBe(201);
    const outsideArea = (await areaResponse.json()).area.id as string;
    const employeeResponse = await page.request.post('/api/employees', {
      headers: { 'x-organization-id': fixture.orgA },
      data: { name: 'M14 Outside Employee', areaId: outsideArea },
    });
    expect(employeeResponse.status()).toBe(201);
    const outsideEmployee = (await employeeResponse.json()).employee.id as string;

    await login(page.request, fixture.emails.planner, fixture.orgA);
    const valid = await confirm(page.request, [shift(futureDate(24))], '1'.repeat(64));
    expect(valid.status()).toBe(201);
    const invalid = await confirm(page.request, [shift(futureDate(25), outsideEmployee)], '2'.repeat(64), outsideEmployee, { areaId: outsideArea });
    expect(invalid.status()).toBe(403);
    expect((await invalid.json()).code).toBe('SCOPE_FORBIDDEN');
  });
});
