import { Browser, expect, Page, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  areaA: string;
  adminId: string;
  ownerId: string;
  approvalShift: string;
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

async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function createLoggedInPage(browser: Browser, email: string) {
  const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  });
  const page = await context.newPage();
  await loginAs(page, email);
  return { context, page };
}

async function createApiClient(email: string) {
  const client = await playwrightRequest.newContext({
    baseURL: 'http://localhost:3199',
    extraHTTPHeaders: { 'x-organization-id': fixture.orgA },
  });
  const response = await client.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
  return client;
}

async function configureApproval(client: APIRequestContext, policy: 'NO_APPROVAL' | 'AREA_RESPONSIBLE' | 'ORGANIZATION_ADMIN') {
  const policyResponse = await client.put(`/api/organizations/${fixture.orgA}/approval-policy`, {
    data: { policy },
  });
  expect(policyResponse.ok()).toBe(true);
  if (policy === 'AREA_RESPONSIBLE') {
    const responsible = await client.post(`/api/areas/${fixture.areaA}/responsibles`, {
      data: { userId: fixture.adminId },
    });
    expect([201, 409]).toContain(responsible.status());
  }
}

async function createRequest(client: APIRequestContext, requestType: 'TIME_CHANGE' | 'OTHER', reason: string, start = '10:00', end = '18:00') {
  const response = await client.post(`/api/me/shifts/${fixture.approvalShift}/change-requests`, {
    data: {
      requestType,
      reason,
      ...(requestType === 'TIME_CHANGE' ? { requestedStartTime: start, requestedEndTime: end } : {}),
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ request: { id: string; status: string } }>;
}

test.describe('R5 Approval Lite E2E', () => {
  test('AREA_RESPONSIBLE happy path: employee request → approval → draft → employee status', async ({ browser }) => {
    const adminApi = await createApiClient(fixture.emails.admin);
    const employeeApi = await createApiClient(fixture.emails.emp);
    let admin: Awaited<ReturnType<typeof createLoggedInPage>> | null = null;
    try {
      await configureApproval(adminApi, 'AREA_RESPONSIBLE');
      const reason = `R5-M10 happy ${Date.now()}`;
      const created = await createRequest(employeeApi, 'TIME_CHANGE', reason);
      expect(created.request.status).toBe('PENDING');

      admin = await createLoggedInPage(browser, fixture.emails.admin);
      const inbox = admin.page.getByTestId('approval-inbox');
      await expect(inbox).toContainText(reason);
      await inbox.getByRole('button', { name: 'Aprobar' }).click();
      await expect(inbox).toHaveAttribute('data-testid', 'approval-inbox');
      await expect(inbox).toContainText('No tienes aprobaciones pendientes');

      const schedulesResponse = await adminApi.get(`/api/schedules?areaId=${fixture.areaA}`);
      expect(schedulesResponse.ok()).toBe(true);
      const schedules = (await schedulesResponse.json()).schedules as Array<{ id: string; scheduleId: string; periodStart: string; status: string }>;
      const draft = schedules.find((schedule) => schedule.periodStart === '2027-02-01' && schedule.status === 'DRAFT');
      expect(draft).toBeTruthy();
      const snapshotResponse = await adminApi.get(`/api/schedules/${draft?.scheduleId}/versions/${draft?.id}`);
      expect(snapshotResponse.ok()).toBe(true);
      const snapshot = await snapshotResponse.json();
      expect(snapshot.assignments).toEqual(expect.arrayContaining([
        expect.objectContaining({ employeeId: expect.any(String), date: '2027-02-03', startTime: '10:00', endTime: '18:00' }),
      ]));

      const employeeRequests = await employeeApi.get('/api/me/change-requests');
      expect(employeeRequests.ok()).toBe(true);
      expect((await employeeRequests.json()).requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ reason, status: 'APPROVED' }),
      ]));
    } finally {
      if (admin) await admin.context.close();
      await Promise.all([adminApi.dispose(), employeeApi.dispose()]);
    }
  });

  test('rejection path: approver reason is visible to the employee', async ({ browser }) => {
    const adminApi = await createApiClient(fixture.emails.admin);
    const employeeApi = await createApiClient(fixture.emails.emp);
    let admin: Awaited<ReturnType<typeof createLoggedInPage>> | null = null;
    try {
      await configureApproval(adminApi, 'AREA_RESPONSIBLE');
      const reason = `R5-M10 rejection ${Date.now()}`;
      await createRequest(employeeApi, 'OTHER', reason);

      admin = await createLoggedInPage(browser, fixture.emails.admin);
      const inbox = admin.page.getByTestId('approval-inbox');
      await expect(inbox).toContainText(reason);
      await inbox.getByRole('button', { name: 'Rechazar' }).click();
      await admin.page.getByLabel('Motivo del rechazo').fill('No hay cobertura suficiente.');
      await admin.page.getByRole('button', { name: 'Confirmar rechazo' }).click();
      await expect(inbox).toContainText('No tienes aprobaciones pendientes');

      const employeeRequests = await employeeApi.get('/api/me/change-requests');
      expect(employeeRequests.ok()).toBe(true);
      expect((await employeeRequests.json()).requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ reason, status: 'REJECTED', rejectionReason: 'No hay cobertura suficiente.' }),
      ]));
    } finally {
      if (admin) await admin.context.close();
      await Promise.all([adminApi.dispose(), employeeApi.dispose()]);
    }
  });

  test('NO_APPROVAL path: time change auto-approves and creates no pending envelope', async ({ browser }) => {
    const adminApi = await createApiClient(fixture.emails.admin);
    const employeeApi = await createApiClient(fixture.emails.emp);
    let admin: Awaited<ReturnType<typeof createLoggedInPage>> | null = null;
    try {
      await configureApproval(adminApi, 'NO_APPROVAL');
      const reason = `R5-M10 no approval ${Date.now()}`;
      const created = await createRequest(employeeApi, 'TIME_CHANGE', reason, '11:00', '19:00');
      expect(created.request.status).toBe('APPROVED');

      admin = await createLoggedInPage(browser, fixture.emails.admin);
      const pending = await adminApi.get('/api/approval-requests?status=pending');
      expect(pending.ok()).toBe(true);
      expect((await pending.json()).requests).toEqual([]);
      const schedulesResponse = await adminApi.get(`/api/schedules?areaId=${fixture.areaA}`);
      const schedules = (await schedulesResponse.json()).schedules as Array<{ id: string; scheduleId: string; periodStart: string; status: string }>;
      const draft = schedules.find((schedule) => schedule.periodStart === '2027-02-01' && schedule.status === 'DRAFT');
      expect(draft).toBeTruthy();
      const snapshot = await (await adminApi.get(`/api/schedules/${draft?.scheduleId}/versions/${draft?.id}`)).json();
      expect(snapshot.assignments).toEqual(expect.arrayContaining([
        expect.objectContaining({ date: '2027-02-03', startTime: '11:00', endTime: '19:00' }),
      ]));
    } finally {
      if (admin) await admin.context.close();
      await Promise.all([adminApi.dispose(), employeeApi.dispose()]);
    }
  });

  test('concurrent browser decisions: one wins and the other receives the refreshed conflict', async ({ browser }) => {
    const adminApi = await createApiClient(fixture.emails.admin);
    const ownerApi = await createApiClient(fixture.emails.owner);
    const employeeApi = await createApiClient(fixture.emails.emp);
    let admin: Awaited<ReturnType<typeof createLoggedInPage>> | null = null;
    try {
      await configureApproval(adminApi, 'ORGANIZATION_ADMIN');
      const reason = `R5-M10 concurrent ${Date.now()}`;
      await createRequest(employeeApi, 'OTHER', reason);
      const pendingBeforeDecision = await adminApi.get('/api/approval-requests?status=pending');
      expect(pendingBeforeDecision.ok()).toBe(true);
      const approvalRequest = ((await pendingBeforeDecision.json()).requests as Array<{ id: string; reason: string }>)
        .find((item) => item.reason === reason);
      expect(approvalRequest).toBeTruthy();
      admin = await createLoggedInPage(browser, fixture.emails.admin);
      let uiDecisionStatus = 0;
      admin.page.on('response', (response) => {
        if (response.url().includes(`/api/approval-requests/${approvalRequest?.id}/approve`)) {
          uiDecisionStatus = response.status();
        }
      });
      const inboxA = admin.page.getByTestId('approval-inbox');
      await expect(inboxA).toContainText(reason);
      const [ownerDecision] = await Promise.all([
        ownerApi.post(`/api/approval-requests/${approvalRequest?.id}/approve`, { data: {} }),
        inboxA.getByRole('button', { name: 'Aprobar' }).click(),
      ]);
      expect([200, 409]).toContain(ownerDecision.status());
      await expect.poll(() => uiDecisionStatus).toBeGreaterThan(0);
      expect([uiDecisionStatus, ownerDecision.status()]).toEqual(expect.arrayContaining([200, 409]));
      const pending = await adminApi.get('/api/approval-requests?status=pending');
      expect((await pending.json()).requests).toEqual([]);
    } finally {
      if (admin) await admin.context.close();
      await Promise.all([adminApi.dispose(), ownerApi.dispose(), employeeApi.dispose()]);
    }
  });
});
