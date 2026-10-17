import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { CONTEXT_FILE, STATE_DIR, assertQaOrganization, ensureStateDir, qaLib, type QaContext } from '../helpers/qa-mirror';

/**
 * Functional smoke (no screenshots): a MIXED employee calendar confirmed with "historical-and-plan" — admin, QA mirror only.
 * A historical day differs from the calendar (11:00-19:00 vs 10:00-18:00). The legacy row-by-row conflict prompt must NOT appear, the
 * request must not carry deleteIds, the existing shift must survive and the import must complete (modal closes, no error).
 */
let ctx: QaContext;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}

test.beforeAll(() => { ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext; });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'functional scenario: desktop project only');

test('MIXED + historical-and-plan: no legacy conflict prompt, no deleteIds, existing shift preserved, import completes', async ({ page }) => {
  const cutoff = new Date().toLocaleDateString('sv', { timeZone: 'Europe/Madrid' });
  const past = addDays(cutoff, -2); const future = addDays(cutoff, 3);
  const pilot = (await withDb((q) => q(`SELECT id FROM employees WHERE organization_id = $1 AND external_employee_id = '84881'`, [ctx.organizationId])))[0];
  const headers = { 'x-organization-id': ctx.organizationId };
  await page.request.post('/api/employees/identifiers', { headers, data: { employeeId: pilot.id, sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888', documentName: 'Sebastian Pozo Mendoza' } });
  await withDb(async (q) => {
    await q(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date BETWEEN $3 AND $4`, [ctx.organizationId, pilot.id, addDays(cutoff, -5), addDays(cutoff, 8)]);
  });
  const seeded = await page.request.patch('/api/shifts', { headers, data: { employeeId: pilot.id, deleteIds: [], upserts: [{ id: crypto.randomUUID(), employeeId: pilot.id, date: past, startTime: '11:00', endTime: '19:00', shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin: 'IMP' }] } });
  const existingId = (await seeded.json()).saved[0].id as string;

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Calendario empleado');
  sheet.addRow(['Copia no Controlada si se Imprime - Calendario empleado']); sheet.addRow(['Sebastian Pozo Mendoza Calendario 2026']);
  sheet.addRow([null, ...Array.from({ length: 31 }, (_, i) => i + 1)]);
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const cell = (iso: string) => ({ m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });
  months.forEach((month, m) => {
    const row: Array<string | null> = [month, ...Array.from({ length: 31 }, () => null)];
    if (cell(past).m === m) row[cell(past).d] = '10:00 \n18:00';
    if (cell(future).m === m) row[cell(future).d] = '13:00 \n21:00';
    sheet.addRow(row);
  });
  const legend = wb.addWorksheet('Leyenda');
  legend.addRow(['Filtrado', 'Filtrado']); legend.addRow(['Calendario', 'Empleado']); legend.addRow(['Nómina', '6888']);
  legend.addRow(['Nombre Completo', 'Sebastian Pozo Mendoza']); legend.addRow(['Fecha inicio', '01/01/2026']); legend.addRow(['Fecha fin', '31/12/2026']);
  ensureStateDir();
  const file = join(STATE_DIR, `qa-mixed-${Date.now()}.xlsx`);
  writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer));

  const confirmBodies: Array<{ deleteIds?: unknown[] }> = [];
  page.on('request', (r) => { if (r.url().includes('/api/imports/confirm-split') && r.method() === 'POST') confirmBodies.push(JSON.parse(r.postData() ?? '{}')); });

  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  await page.getByRole('button', { name: /Importar turnos/ }).first().click();
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 8_000 }).catch(() => undefined);
  await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('radio', { name: /Importar históricos y crear\/actualizar planificación futura/ }).check();
  const confirm = page.getByRole('button', { name: /Confirmar Importación/ });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  const conflict = page.getByRole('dialog', { name: 'Conflicto de importación' });
  let conflictShown = false;
  for (let i = 0; i < 240 && await page.locator('.import-modal').isVisible(); i += 1) {
    if (await conflict.isVisible().catch(() => false)) { conflictShown = true; break; }
    await page.waitForTimeout(250);
  }
  expect(conflictShown).toBe(false); // the legacy row-by-row prompt is bypassed
  await expect(page.locator('.import-modal')).toBeHidden({ timeout: 30_000 }); // completed: nothing left to retry
  await expect(page.getByText('No se pudieron guardar los turnos importados')).toHaveCount(0);
  expect(confirmBodies.length).toBeGreaterThanOrEqual(1);
  expect(confirmBodies.every((body) => (body.deleteIds ?? []).length === 0)).toBe(true);
  const still = await withDb((q) => q(`SELECT 1 FROM shifts WHERE id = $1`, [existingId]));
  expect(still).toHaveLength(1); // not destructively deleted
});
