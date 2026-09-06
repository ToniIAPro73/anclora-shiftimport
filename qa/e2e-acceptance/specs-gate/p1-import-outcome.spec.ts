import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  emails: { admin: string };
};

test('P1: blocked import recovers and retries without native dialogs', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
  });

  const login = await page.request.post('/api/auth/login', {
    data: { email: fixture.emails.admin, password: fixture.password },
  });
  expect(login.ok()).toBe(true);

  const employeeName = `P1 Pending ${Date.now()}`;
  const employee = await page.request.post('/api/employees', {
    data: { name: employeeName, externalEmployeeId: `P1-${Date.now()}` },
  });
  expect(employee.status()).toBe(201);
  const pending = (await employee.json()).employee as { id: string };

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  const historicalDate = date.toISOString().slice(0, 10);
  const csv = Buffer.from([
    'fecha,inicio,fin,tipo,empleado',
    `${historicalDate},08:00,16:00,regular,${employeeName}`,
  ].join('\n'));

  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const uploadDialog = page.getByRole('dialog', { name: 'Importar cuadrante' });
  await uploadDialog.locator('input[type=file]').setInputFiles({
    name: 'p1-blocked.csv', mimeType: 'text/csv', buffer: csv,
  });
  await expect(uploadDialog.getByTestId('import-quality-state')).toBeVisible({ timeout: 30_000 });
  const assistant = page.locator('section[aria-label="Asistente de formato"]');
  if (await assistant.isVisible().catch(() => false)) {
    await assistant.getByRole('button', { name: employeeName }).click();
    const applyAssistant = assistant.getByRole('button', { name: 'Aplicar y continuar' });
    if (await applyAssistant.isEnabled().catch(() => false)) {
      await applyAssistant.click();
    }
  }
  const confirm = uploadDialog.getByRole('button', { name: /Confirmar Importación/i });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  const outcome = page.getByRole('dialog', { name: 'Importación detenida' });
  await expect(outcome).toBeVisible();
  await expect(outcome).toContainText(employeeName);
  await expect(outcome).toContainText('pendiente de activación');
  await outcome.getByRole('button', { name: 'Completar alta' }).click();

  const members = page.getByRole('dialog', { name: 'Usuarios de la organización' });
  await expect(members).toBeVisible();
  await members.getByRole('button', { name: 'Empleados', exact: true }).click();
  const row = members.locator('.members-emp-row').filter({ hasText: employeeName });
  await expect(row).toBeVisible();
  await row.locator('.employee-menu > button').click();
  await row.getByRole('menuitem', { name: 'Vincular usuario existente' }).click();
  await members.getByRole('button', { name: 'Usuario a vincular' }).click();
  await page.getByRole('option', { name: 'E2E Sin Vínculo' }).click();
  await members.getByRole('button', { name: 'Vincular', exact: true }).click();
  await members.getByRole('button', { name: 'Close' }).click();

  const restoredOutcome = page.getByRole('dialog', { name: 'Importación detenida' });
  await expect(restoredOutcome).toBeVisible();
  await restoredOutcome.getByRole('button', { name: 'Reintentar importación' }).click();
  await expect(page.getByRole('dialog', { name: 'Importación verificada' })).toBeVisible({ timeout: 30_000 });

  const shiftsResponse = await page.request.get(`/api/shifts?employeeId=${pending.id}`);
  expect(shiftsResponse.status()).toBe(200);
  expect((await shiftsResponse.json()).shifts).toEqual(expect.arrayContaining([
    expect.objectContaining({ employeeId: pending.id, date: historicalDate, startTime: '08:00', endTime: '16:00' }),
  ]));
  const historyResponse = await page.request.get('/api/imports?pageSize=50');
  const history = (await historyResponse.json()).imports as Array<{ status: string }>;
  expect(history.filter((item) => item.status === 'blocked')).toHaveLength(1);
  expect(history.filter((item) => item.status === 'completed')).toHaveLength(1);
  expect(dialogs).toEqual([]);
});
