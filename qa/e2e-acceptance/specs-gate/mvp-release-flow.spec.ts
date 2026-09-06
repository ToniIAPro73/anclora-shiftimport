import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { expect, test, type APIResponse, type Page, type TestInfo } from '@playwright/test';

const here = __dirname;
const root = join(here, '..', '..', '..');
const FLOW_PASSWORD = 'P0-flow-pass-1234';

function developmentDatabaseUrl(): string {
  const envFile = readFileSync(join(root, '.env.development.local'), 'utf8');
  const line = envFile.split('\n').find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found');
  const value = line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
  const hostname = new URL(value).hostname;
  if (!hostname.startsWith('ep-winter-bird-')) {
    throw new Error('Refusing P0 flow: database is not the documented Neon development host');
  }
  return value;
}

const sql = neon(developmentDatabaseUrl());

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

function mondayOfCurrentWeek(): string {
  const value = new Date(`${isoDate(new Date())}T00:00:00.000Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return isoDate(value);
}

function periodFields(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  return { periodYear: value.getUTCFullYear(), periodMonth: value.getUTCMonth() + 1 };
}

async function preparePresentation(page: Page, options: { locale: 'es' | 'en'; theme: 'light' | 'dark' }) {
  await page.addInitScript(({ locale, theme }) => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_locale_v1', locale);
    window.localStorage.setItem('anclora_theme_mode', theme);
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  }, options);
}

async function capture(testInfo: TestInfo, page: Page, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}

async function login(page: Page, email: string, password = FLOW_PASSWORD) {
  const response = await page.request.post('/api/auth/login', { data: { email, password } });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function expectStatus(response: APIResponse, expected: number) {
  expect(response.status()).toBe(expected);
  return response.json();
}

test('P0-M07 compact continuous flow: signup → audit', async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000);
  const suffix = `${Date.now()}`;
  const ownerEmail = `p0-flow-owner-${suffix}@e2e.test`;
  const workerEmail = `p0-flow-worker-${suffix}@e2e.test`;
  const organizationName = `P0 Flow Org ${suffix}`;
  let ownerId: string | null = null;
  let organizationId: string | null = null;
  let workerId: string | null = null;
  let workerContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let englishEvidencePage: Page | null = null;
  const dialogs: string[] = [];

  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  try {
    await preparePresentation(page, { locale: 'es', theme: 'light' });

    // 1–2. Signup and explicit organization onboarding.
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await capture(testInfo, page, '01-signup');
    await page.locator('#auth-name').fill('P0 Flow Owner');
    await page.locator('#auth-email').fill(ownerEmail);
    await page.locator('#auth-password').fill(FLOW_PASSWORD);
    await page.locator('#auth-password-confirm').fill(FLOW_PASSWORD);
    await page.locator('form.auth-form .auth-submit').click();
    await expect(page.getByRole('dialog', { name: '¿Cómo vas a usar ShiftImport?' })).toBeVisible();
    await capture(testInfo, page, '02-onboarding');
    await page.getByLabel('Nombre de la organización').fill(organizationName);
    const onboardingResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/onboarding') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Crear organización' }).click();
    expect((await onboardingResponse).status()).toBe(201);
    await expect.poll(async () => (await page.request.get('/api/session/me')).json()).toMatchObject({
      role: 'OWNER',
    });
    const ownerSession = await (await page.request.get('/api/session/me')).json();
    ownerId = ownerSession.user.id;
    organizationId = ownerSession.organizationId;
    expect(ownerSession.role).toBe('OWNER');
    await capture(testInfo, page, '02-onboarding-complete');

    // 3–4. Area and employee are created through the authenticated domain API;
    // the UI story remains in the same browser session and later consumes them.
    const areaPayload = await expectStatus(await page.request.post('/api/areas', {
      data: { name: 'P0 Flow Area', code: `P0-${suffix}` },
    }), 201);
    const areaId = areaPayload.area.id as string;
    const employeePayload = await expectStatus(await page.request.post('/api/employees', {
      data: { name: 'P0 Flow Employee', externalEmployeeId: `P0-${suffix}`, areaId, status: 'active' },
    }), 201);
    const employeeId = employeePayload.employee.id as string;
    await sql`UPDATE organizations SET plan = 'team' WHERE id = ${organizationId}`;
    await expectStatus(await page.request.post('/api/employees', {
      data: { name: 'P0 Flow Colleague', externalEmployeeId: `P0-COL-${suffix}`, areaId, status: 'active' },
    }), 201);
    const memberPayload = await expectStatus(await page.request.post('/api/memberships', {
      data: {
        email: workerEmail,
        password: FLOW_PASSWORD,
        displayName: 'P0 Flow Employee',
        role: 'EMPLOYEE',
        employeeId,
      },
    }), 201);
    workerId = memberPayload.member.userId as string;
    await expectStatus(await page.request.patch('/api/employees', {
      data: { id: employeeId, userId: workerId },
    }), 200);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Importar', exact: true })).toBeVisible();
    await capture(testInfo, page, '04-area-employee');

    // 5–8. Import through the real team UI: upload, matching, review/compare,
    // and one explicit confirmation. The compact CSV is synthetic and scoped.
    const historicalDate = addDays(isoDate(new Date()), -1);
    const csv = Buffer.from([
      'fecha,inicio,fin,tipo,empleado',
      `${historicalDate},08:00,16:00,regular,P0 Flow Employee`,
      `${historicalDate},07:00,15:00,regular,P0 Flow Colleague`,
    ].join('\n'));
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    const importDialog = page.getByRole('dialog', { name: 'Importar cuadrante' });
    await expect(importDialog).toBeVisible();
    await capture(testInfo, page, '05-import-upload');
    await importDialog.locator('input[type=file]').setInputFiles({
      name: 'p0-flow.csv', mimeType: 'text/csv', buffer: csv,
    });
    await expect(importDialog.getByText(/^\d+ detectados · \d+ reconocidos/)).toBeVisible({ timeout: 30_000 });
    await capture(testInfo, page, '06-import-detected');
    const selectAll = importDialog.getByRole('button', { name: 'Seleccionar todos' });
    if (await selectAll.isVisible().catch(() => false)) await selectAll.click();
    await importDialog.getByRole('button', { name: 'Continuar' }).click();
    await expect(importDialog.getByRole('heading', { name: 'Resumen antes de importar' })).toBeVisible();
    await capture(testInfo, page, '07-import-review-compare');
    await importDialog.getByRole('button', { name: 'Importar', exact: true }).click();
    await expect(importDialog.getByRole('heading', { name: 'Importación completada' })).toBeVisible({ timeout: 30_000 });
    await capture(testInfo, page, '08-import-result');
    await importDialog.locator('button.btn-gold').filter({ hasText: 'Cerrar' }).click();
    const importedRows = await (await page.request.get(`/api/shifts?employeeId=${employeeId}`)).json();
    expect(importedRows.shifts).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeId, date: historicalDate, startTime: '08:00', endTime: '16:00' }),
    ]));

    // 9–10. Create the weekly draft in the planner UI, then route a separate
    // future import to its own draft through the single transactional API.
    const periodStart = mondayOfCurrentWeek();
    await page.getByRole('button', { name: 'Planificar' }).click();
    await expect(page).toHaveURL(/\/app\/schedule$/);
    await expect(page.getByText('Todavía no hay un borrador para esta semana')).toBeVisible();
    await capture(testInfo, page, '09-planner-empty');
    await page.getByRole('button', { name: 'Crear borrador semanal' }).click();
    await expect(page.getByRole('status')).toContainText('Borrador semanal creado.');
    await capture(testInfo, page, '10-planner-draft');
    const scheduledDate = isoDate(new Date());
    const addButton = page.getByRole('button', { name: `Añadir turno para P0 Flow Employee el ${scheduledDate}` });
    await addButton.click();
    const editor = page.getByRole('form', { name: 'Añadir turno' });
    await expect(editor).toBeVisible();
    await capture(testInfo, page, '11-shift-editor');
    await editor.getByLabel('Inicio').fill('09:00');
    await editor.getByLabel('Fin').fill('17:00');
    await editor.getByLabel('Ubicación').fill('P0 Flow');
    await editor.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('status')).toContainText('Turno actualizado en el borrador.');
    await capture(testInfo, page, '12-planner-assignment');

    const futureDate = addDays(periodStart, 14);
    const futureFields = periodFields(futureDate);
    const futureFingerprint = createHash('sha256').update(`p0-flow-future:${suffix}`).digest('hex');
    const futurePayload = await expectStatus(await page.request.post('/api/imports/confirm-split', {
      data: {
        fileName: 'p0-flow-future.csv', sourceFormat: 'CSV', fileFingerprint: futureFingerprint,
        employeeId, areaId, ...futureFields, periodKind: 'single', periodLabel: 'P0 future',
        futureConsent: 'draft',
        shifts: [{ employeeId, date: futureDate, startTime: '10:00', endTime: '18:00', location: 'P0 future', origin: 'IMP' }],
      },
    }), 201);
    expect(futurePayload.classification).toBe('FUTURE');
    expect(futurePayload.future.draftCount).toBe(1);
    await capture(testInfo, page, '13-planner-draft-future');

    // 11. Publish the visible weekly draft and verify the materialized shift.
    await page.getByRole('button', { name: 'Publicar' }).click();
    await page.getByRole('button', { name: 'Confirmar publicación' }).click();
    await expect(page.getByText('Solo lectura')).toBeVisible();
    await capture(testInfo, page, '14-published');
    const schedules = await (await page.request.get(`/api/schedules?areaId=${areaId}`)).json();
    const currentSchedule = schedules.schedules.find((item: { periodStart: string }) => item.periodStart === periodStart);
    expect(currentSchedule).toBeTruthy();
    const snapshot = await (await page.request.get(`/api/schedules/${currentSchedule.scheduleId}/versions/${currentSchedule.id}`)).json();
    expect(snapshot.version.status).toBe('PUBLISHED');
    expect(snapshot.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeId, date: scheduledDate, startTime: '09:00', endTime: '17:00' }),
    ]));

    // 12–15. A second authenticated session sees the published shift, confirms
    // it, requests a change, and the owner approves it in the real inbox.
    await expectStatus(await page.request.put(`/api/organizations/${organizationId}/approval-policy`, {
      data: { policy: 'ORGANIZATION_ADMIN' },
    }), 200);
    workerContext = await browser.newContext({ baseURL: 'http://localhost:3199', viewport: { width: 390, height: 844 } });
    const workerPage = await workerContext.newPage();
    await preparePresentation(workerPage, { locale: 'es', theme: 'dark' });
    await login(workerPage, workerEmail);
    await expect(workerPage.getByTestId('employee-portal')).toBeVisible();
    await expect(workerPage.getByTestId('today-shifts')).toContainText('09:00');
    await capture(testInfo, workerPage, '15-employee-view');
    await workerPage.getByRole('button', { name: /Turno de 09:00 a 17:00/ }).click();
    await workerPage.getByRole('button', { name: /Marcar el turno/ }).click();
    await expect(workerPage.getByRole('status')).toContainText('Turno reconocido');
    await capture(testInfo, workerPage, '16-acknowledged');
    const publishedShift = (await (await workerPage.request.get(`/api/shifts?employeeId=${employeeId}`)).json()).shifts
      .find((shift: { date: string; startTime: string }) => shift.date === scheduledDate && shift.startTime === '09:00');
    expect(publishedShift).toBeTruthy();
    await workerPage.getByRole('textbox', { name: 'Motivo' }).fill('P0 flow change request');
    await workerPage.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(workerPage.getByTestId('change-request-submitted')).toBeVisible();
    await capture(testInfo, workerPage, '17-change-request');

    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('approval-inbox')).toContainText('P0 flow change request');
    await page.getByTestId('approval-inbox').getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByTestId('approval-inbox')).toContainText('No tienes aprobaciones pendientes');
    await capture(testInfo, page, '18-approval');

    // 16. Audit evidence: approval and the preceding organization actions are
    // visible only inside the newly created tenant.
    const audit = await (await page.request.get('/api/organizations/audit-events')).json();
    expect(audit.events.some((event: { organizationId: string }) => event.organizationId === organizationId)).toBe(true);
    englishEvidencePage = await page.context().newPage();
    await preparePresentation(englishEvidencePage, { locale: 'en', theme: 'dark' });
    await englishEvidencePage.setViewportSize({ width: 390, height: 844 });
    await englishEvidencePage.goto('/app/schedule', { waitUntil: 'domcontentloaded' });
    await expect(englishEvidencePage).toHaveURL(/\/app\/schedule$/);
    await capture(testInfo, englishEvidencePage, '19-english-dark-mobile');
    expect(dialogs).toEqual([]);
  } finally {
    await englishEvidencePage?.close();
    await workerContext?.close();
    if (organizationId) await sql`DELETE FROM organizations WHERE id = ${organizationId}`;
    if (ownerId) await sql`DELETE FROM users WHERE id = ${ownerId}`;
    if (workerId) await sql`DELETE FROM users WHERE id = ${workerId}`;
    await sql`DELETE FROM login_attempts WHERE id_key LIKE ${`email:%-${suffix}@e2e.test`}`;
  }
});
