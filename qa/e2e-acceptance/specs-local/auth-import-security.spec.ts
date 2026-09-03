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
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(fixture.password);
  await page.locator('form .auth-submit').click();
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

const csvBuffer = Buffer.from([
  'fecha,inicio,fin,tipo,empleado',
  '2026-11-01,08:00,16:00,regular,E2E Uno',
  '2026-11-02,08:00,16:00,regular,E2E Uno',
].join('\n'));

const uiCsvBuffer = Buffer.from([
  'fecha,inicio,fin,tipo,empleado',
  '2026-09-20,08:00,16:00,regular,E2E Uno',
  '2026-09-21,08:00,16:00,regular,E2E Uno',
].join('\n'));

test('anonymous CSV preview cannot confirm or write local/remote data', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) {
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  await page.goto('/app');
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.locator('.modal-content input[type=file]').setInputFiles({
    name: 'anonymous.csv',
    mimeType: 'text/csv',
    buffer: csvBuffer,
  });
  await page.getByRole('button', { name: 'Procesar archivo', exact: true }).click();
  await expect(page.getByTestId('import-quality-state')).toBeVisible({ timeout: 30_000 });

  const confirm = page.locator('.import-modal__footer button');
  await expect(confirm).toBeDisabled();
  await expect(page.getByTestId('import-auth-required')).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('anclora_shifts_v1'))).toBeNull();
  expect(requests.filter((entry) => /api\/(imports|shifts)/.test(entry))).toEqual([]);
});

test('authenticated CSV import is idempotent server-side and rejects unauthorized employee writes', async ({ page }) => {
  await page.goto('/app');
  const anonymous = await page.request.get('/api/imports');
  expect(anonymous.status()).toBe(401);

  await loginAs(page, fixture.emails.admin);

  const foreignEmployee = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const forbidden = await page.request.patch('/api/shifts', {
    data: {
      employeeId: foreignEmployee,
      upserts: [{ employeeId: foreignEmployee, date: '2099-01-01', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'IMP' }],
    },
  });
  expect(forbidden.status()).toBe(403);

  const fingerprint = 'b'.repeat(64);
  const firstImport = await page.request.post('/api/imports', {
    data: {
      fileName: 'security.csv', sourceFormat: 'csv', fileFingerprint: fingerprint,
      employeeId: fixture.empA1, periodYear: 2099, periodMonth: 0,
      importMode: 'individual', periodKind: 'single', employeeCount: 1, shiftCount: 1,
      createdShiftCount: 1, existingShiftCount: 0,
    },
  });
  expect(firstImport.status()).toBe(201);
  const firstPayload = await firstImport.json();

  const secondImport = await page.request.post('/api/imports', {
    data: {
      fileName: 'security.csv', sourceFormat: 'csv', fileFingerprint: fingerprint,
      employeeId: fixture.empA1, periodYear: 2099, periodMonth: 0,
      importMode: 'individual', periodKind: 'single', employeeCount: 1, shiftCount: 1,
      createdShiftCount: 1, existingShiftCount: 0,
    },
  });
  expect(secondImport.status()).toBe(200);
  const secondPayload = await secondImport.json();
  expect(secondPayload.import.id).toBe(firstPayload.import.id);
  expect(secondPayload.import.deduplicated).toBe(true);

  const firstShift = await page.request.patch('/api/shifts', {
    data: {
      employeeId: fixture.empA1,
      upserts: [{ id: '11111111-1111-4111-8111-111111111111', employeeId: fixture.empA1, importId: firstPayload.import.id, date: '2099-01-01', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'IMP' }],
    },
  });
  expect(firstShift.status()).toBe(200);
  const secondShift = await page.request.patch('/api/shifts', {
    data: {
      employeeId: fixture.empA1,
      upserts: [{ id: '22222222-2222-4222-8222-222222222222', employeeId: fixture.empA1, importId: firstPayload.import.id, date: '2099-01-01', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'IMP' }],
    },
  });
  expect(secondShift.status()).toBe(200);
  const persisted = await page.request.get(`/api/shifts?employeeId=${fixture.empA1}`);
  const rows = (await persisted.json()).shifts.filter((shift: { date: string }) => shift.date === '2099-01-01');
  expect(rows).toHaveLength(1);
});

test('authenticated user can import the CSV in the UI and repeating it creates no duplicate', async ({ page }) => {
  await loginAs(page, fixture.emails.emp);

  const importCsvThroughUi = async (expectDuplicate = false) => {
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await page.locator('.modal-content input[type=file]').setInputFiles({
      name: 'authenticated.csv', mimeType: 'text/csv', buffer: uiCsvBuffer,
    });
    await page.getByRole('button', { name: 'Procesar archivo', exact: true }).click();
    await expect(page.getByTestId('import-quality-state')).toBeVisible({ timeout: 30_000 });
    const confirm = page.getByRole('button', { name: /Confirmar Importación/ });
    const assistantApply = page.getByRole('button', { name: 'Aplicar y continuar' });
    if (await assistantApply.isVisible().catch(() => false)) {
      const assistant = page.locator('section[aria-label="Asistente de formato"]');
      const candidate = assistant.getByRole('button', { name: /E2E Uno/ });
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
      }
      if (await assistantApply.isEnabled().catch(() => false)) {
        await assistantApply.click();
      }
    }
    if (expectDuplicate) {
      await expect(confirm).toBeDisabled();
      await expect(page.getByText(/turnos ya están en el sistema/)).toBeVisible();
      await page.getByRole('button', { name: 'Cerrar' }).click();
      return;
    }
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByRole('heading', { name: 'Importar cuadrante' })).toBeHidden({ timeout: 30_000 });
    const resultClose = page.getByRole('dialog').getByRole('button', { name: 'Cerrar' });
    if (await resultClose.isVisible().catch(() => false)) {
      await resultClose.click();
    }
  };

  await importCsvThroughUi();
  const first = await page.request.get(`/api/shifts?employeeId=${fixture.empA1}`);
  const firstRows = (await first.json()).shifts.filter((shift: { date: string }) => ['2026-09-20', '2026-09-21'].includes(shift.date));
  expect(firstRows).toHaveLength(2);

  await importCsvThroughUi(true);
  const second = await page.request.get(`/api/shifts?employeeId=${fixture.empA1}`);
  const secondRows = (await second.json()).shifts.filter((shift: { date: string }) => ['2026-09-20', '2026-09-21'].includes(shift.date));
  expect(secondRows).toHaveLength(2);
});
