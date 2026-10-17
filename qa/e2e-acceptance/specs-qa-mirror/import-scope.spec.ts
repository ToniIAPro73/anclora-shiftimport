import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { CONTEXT_FILE, STATE_DIR, assertQaOrganization, ensureStateDir, qaLib, type QaContext } from '../helpers/qa-mirror';

/**
 * Functional (no screenshots): the DOCUMENT defines the import scope, the dashboard selection does not. QA mirror only, synthetic files.
 *  - single-employee TRYP workbook of Sebastián while the dashboard shows another employee: target = Sebastián / 84881 and the
 *    diff is computed against Sebastián's calendar (not against the selected employee, who holds identical shifts).
 *  - multi-employee roster: scope defaults to "Todos los empleados"; choosing one limits it.
 */
let ctx: QaContext;
async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}
test.beforeAll(() => { ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext; });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'functional scenario: desktop project only');

test('ADMIN viewing another employee imports Sebastián\'s workbook: target and diff follow the DOCUMENT', async ({ page }) => {
  const pilot = (await withDb((q) => q(`SELECT id FROM employees WHERE organization_id = $1 AND external_employee_id = '84881'`, [ctx.organizationId])))[0];
  const other = (await withDb((q) => q(`SELECT id, name FROM employees WHERE organization_id = $1 AND status = 'active' AND external_employee_id IS NOT NULL AND external_employee_id <> '84881' AND user_id IS NULL ORDER BY name LIMIT 1`, [ctx.organizationId])))[0];
  const headers = { 'x-organization-id': ctx.organizationId };
  await page.request.post('/api/employees/identifiers', { headers, data: { employeeId: pilot.id, sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888', documentName: 'Sebastian Pozo Mendoza' } });
  const DAYS = ['2026-04-07', '2026-04-08'];
  await withDb(async (q) => {
    await q(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = ANY($2::uuid[]) AND date = ANY($3::date[])`, [ctx.organizationId, [pilot.id, other.id], DAYS]);
    for (const d of DAYS) {
      // the OTHER employee (shown in the dashboard) holds exactly the rows of the document; Sebastián holds none of them
      await q(`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, shift_type, counts_as_work, location, legacy_origin, layer, provenance, effective_state)
               VALUES ($1,$2,$3,'09:00','17:00','Regular',true,'Regular','PDF','COMPANY_PLAN','COMPANY_IMPORT','EFFECTIVE')`, [ctx.organizationId, other.id, d]);
    }
  });
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Calendario empleado');
  sheet.addRow(['Copia no Controlada si se Imprime - Calendario empleado']); sheet.addRow(['Sebastian Pozo Mendoza Calendario 2026']);
  sheet.addRow([null, ...Array.from({ length: 31 }, (_, i) => i + 1)]);
  ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].forEach((month, m) => {
    const row: Array<string | null> = [month, ...Array.from({ length: 31 }, () => null)];
    if (m === 3) { row[7] = '09:00 \n17:00'; row[8] = '09:00 \n17:00'; }
    sheet.addRow(row);
  });
  const legend = wb.addWorksheet('Leyenda');
  legend.addRow(['Filtrado', 'Filtrado']); legend.addRow(['Calendario', 'Empleado']); legend.addRow(['Nómina', '6888']);
  legend.addRow(['Nombre Completo', 'Sebastian Pozo Mendoza']); legend.addRow(['Fecha inicio', '01/01/2026']); legend.addRow(['Fecha fin', '31/12/2026']);
  ensureStateDir();
  const file = join(STATE_DIR, `qa-scope-${Date.now()}.xlsx`);
  writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer));

  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: String(other.name) }).first().click(); // dashboard = ANOTHER employee
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  await page.getByRole('button', { name: /Importar turnos/ }).first().click();
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 8_000 }).catch(() => undefined);

  await expect(page.getByTestId('import-target-name')).toHaveValue(/Sebastián Pozo Mendoza — QA/, { timeout: 60_000 });
  await expect(page.getByTestId('import-target-id')).toHaveValue('84881');
  await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 30_000 });
  // computed against Sebastián (2 new), not against the selected employee (who holds identical rows => would be 0)
  await expect(page.getByRole('button', { name: /Confirmar Importación \(2 nuevos de 2 filas\)/ })).toBeVisible({ timeout: 30_000 });
});

test('multi-employee roster: scope defaults to "Todos los empleados"; choosing one employee limits it', async ({ page }) => {
  const people = await withDb((q) => q(`SELECT name, external_employee_id ext FROM employees WHERE organization_id = $1 AND status = 'active' AND external_employee_id IS NOT NULL AND external_employee_id <> '84881' AND user_id IS NULL ORDER BY name LIMIT 3`, [ctx.organizationId]));
  const lines = ['nombre,id,fecha,inicio,fin,tipo'];
  for (const p of people) lines.push(`${p.name},${p.ext},2026-04-14,09:00,17:00,Regular`);
  ensureStateDir();
  const file = join(STATE_DIR, `qa-scope-roster-${Date.now()}.csv`);
  writeFileSync(file, `${lines.join('\n')}\n`);
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Importar turnos/ }).first().click();
  await page.locator('input[type="file"]').first().setInputFiles(file);
  const scope = page.getByTestId('team-import-scope');
  await expect(scope).toHaveValue('ALL', { timeout: 30_000 });
  await expect(page.getByText('3 seleccionados de 3')).toBeVisible();
  await scope.selectOption({ index: 2 });
  await expect(page.getByText('1 seleccionados de 3')).toBeVisible();
  await scope.selectOption('ALL');
  await expect(page.getByText('3 seleccionados de 3')).toBeVisible();
});
