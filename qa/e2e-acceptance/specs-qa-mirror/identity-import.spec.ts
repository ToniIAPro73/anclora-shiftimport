import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test, type Page } from '@playwright/test';
import { CONTEXT_FILE, STATE_DIR, assertQaOrganization, ensureStateDir, qaLib, type QaContext } from '../helpers/qa-mirror';
import { EMPLOYEE_STATE, prepareEmployeeState } from '../helpers/employee-session';

/**
 * Functional (no screenshots, no visual checks) proof of the individual TRYP XLSX identity flow, QA mirror only:
 *   ADMIN    selected employee fills Nombre + canonical id; document alias (6888) -> unique-name candidate -> explicit
 *            "Asociar y continuar" -> mapping persisted -> import saved; a second import resolves without any prompt.
 *   EMPLOYEE own calendar: self-binding of an unknown alias, historical rows imported, future rows excluded, no planning writes.
 * Synthetic workbooks only.
 */
let ctx: QaContext;
const PILOT_ALIAS = '6888';
const SELF_ALIAS = '7001';
const PILOT_DOC_NAME = 'Sebastian Pozo Mendoza'; // the mirror shows "Sebastián Pozo Mendoza — QA" (canonical 84881)
const ROWS = { past: ['03/03', '04/03'], future: ['10/12', '11/12'] }; // day/month of 2026

async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}

async function workbook(name: string, alias: string, kind: 'Empleado' | 'Publicado', withFuture: boolean): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(kind === 'Empleado' ? 'Calendario empleado' : 'Calendario publicado');
  sheet.addRow([`Copia no Controlada si se Imprime - Calendario ${kind === 'Empleado' ? 'empleado' : 'publicado'}`]);
  sheet.addRow([`${name} Calendario 2026`]);
  sheet.addRow([null, ...Array.from({ length: 31 }, (_, i) => i + 1)]);
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const cells: Record<string, string> = { [ROWS.past[0]]: '09:00 \n17:00 ! (DCF)', [ROWS.past[1]]: '10:00 \n18:00 [cambio sintetico]' };
  if (withFuture) { cells[ROWS.future[0]] = '09:00 \n17:00'; cells[ROWS.future[1]] = '09:00 \n17:00'; }
  months.forEach((month, m) => {
    const row: Array<string | null> = [month, ...Array.from({ length: 31 }, () => null)];
    for (const [key, value] of Object.entries(cells)) { const [d, mo] = key.split('/').map(Number); if (mo - 1 === m) row[d] = value; }
    sheet.addRow(row);
  });
  const legend = wb.addWorksheet('Leyenda');
  legend.addRow(['Filtrado', 'Filtrado']); legend.addRow(['Calendario', kind]); legend.addRow(['Nómina', alias]);
  legend.addRow(['Nombre Completo', name]); legend.addRow(['Fecha inicio', '01/01/2026']); legend.addRow(['Fecha fin', '31/12/2026']);
  ensureStateDir();
  const file = join(STATE_DIR, `qa-identity-${alias}-${kind}-${Date.now()}.xlsx`);
  writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer));
  return file;
}

async function openImport(page: Page, label: RegExp) {
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: label }).first().click();
}

test.beforeAll(() => { ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext; });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'functional scenario: desktop project only');

test('ADMIN: selected employee -> unique-name candidate -> explicit association persisted -> import saved -> second import has no prompt', async ({ page }) => {
  const pilot = (await withDb((q) => q(`SELECT id, name, external_employee_id ext FROM employees WHERE organization_id = $1 AND external_employee_id = '84881'`, [ctx.organizationId])))[0];
  await withDb(async (q) => {
    await q(`DELETE FROM employee_source_identifiers WHERE organization_id = $1 AND external_identifier = $2`, [ctx.organizationId, PILOT_ALIAS]);
    await q(`DELETE FROM calendar_annotations WHERE organization_id = $1 AND employee_id = $2`, [ctx.organizationId, pilot.id]);
    await q(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date BETWEEN '2026-03-01' AND '2026-03-31'`, [ctx.organizationId, pilot.id]);
  });
  const file = await workbook(PILOT_DOC_NAME, PILOT_ALIAS, 'Empleado', false);

  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  await page.getByRole('button', { name: /Importar turnos/ }).first().click();

  // the admin entry is the team importer: a single-employee file hands over to the individual flow
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 8_000 }).catch(() => undefined);
  // target = the SELECTED employee with the canonical id from the database (never the document's 6888)
  await expect(page.getByTestId('import-target-name')).toHaveValue(/Sebastián Pozo Mendoza — QA/, { timeout: 60_000 });
  await expect(page.getByTestId('import-target-id')).toHaveValue('84881');
  const candidate = page.getByTestId('source-identity-candidate');
  await expect(candidate).toContainText('Sebastián Pozo Mendoza — QA', { timeout: 60_000 });
  await expect(page.getByTestId('source-identity-candidate-id')).toHaveText('ID 84881');
  await expect(page.getByTestId('source-identity-select')).toHaveCount(0); // selector NOT shown: the employee was found
  await expect(page.getByTestId('import-target-id')).toHaveValue('84881');

  // nothing is stored until the explicit confirmation
  expect(await withDb((q) => q(`SELECT 1 FROM employee_source_identifiers WHERE organization_id = $1 AND external_identifier = $2`, [ctx.organizationId, PILOT_ALIAS]))).toHaveLength(0);
  await page.getByTestId('source-identity-associate').click();
  await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 30_000 });
  const mapping = await withDb((q) => q(`SELECT employee_id, source_system FROM employee_source_identifiers WHERE organization_id = $1 AND external_identifier = $2`, [ctx.organizationId, PILOT_ALIAS]));
  expect(mapping).toHaveLength(1); // persisted BEFORE the import
  expect(mapping[0].employee_id).toBe(pilot.id);

  const confirm = page.getByRole('button', { name: /Confirmar Importación/ });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  const skip = page.getByRole('button', { name: 'Omitir turno' });
  for (let i = 0; i < 120 && await page.locator('.import-modal').isVisible(); i += 1) {
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => undefined);
    else await page.waitForTimeout(250);
  }
  await expect(page.locator('.import-modal')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('No se pudieron guardar los turnos importados')).toHaveCount(0);
  const saved = await withDb((q) => q(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date IN ('2026-03-03','2026-03-04')`, [ctx.organizationId, pilot.id]));
  expect(saved[0].n).toBeGreaterThanOrEqual(2);
  const annotations = await withDb((q) => q(`SELECT kind FROM calendar_annotations WHERE organization_id = $1 AND employee_id = $2 ORDER BY kind`, [ctx.organizationId, pilot.id]));
  expect(annotations.map((a) => a.kind)).toEqual(['COMMENT', 'DCF']);

  // second import (published export of the same person): same alias namespace -> resolved automatically, no prompt
  await openImport(page, /Importar turnos/);
  await page.locator('input[type="file"]').first().setInputFiles(await workbook(PILOT_DOC_NAME, PILOT_ALIAS, 'Publicado', false));
  await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 10_000 }).catch(() => undefined);
  await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('source-identity-associate')).toHaveCount(0);
  await expect(page.getByTestId('source-identity-select')).toHaveCount(0);
});

test('EMPLOYEE: self-binding of their own alias, historical rows only, future excluded, no planning writes', async ({ browser, baseURL }) => {
  const { employeeId } = await prepareEmployeeState(ctx);
  const own = (await withDb((q) => q(`SELECT name FROM employees WHERE id = $1`, [employeeId])))[0];
  await withDb(async (q) => {
    await q(`DELETE FROM employee_source_identifiers WHERE organization_id = $1 AND external_identifier = $2`, [ctx.organizationId, SELF_ALIAS]);
    await q(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = $2`, [ctx.organizationId, employeeId]);
    await q(`DELETE FROM calendar_annotations WHERE organization_id = $1 AND employee_id = $2`, [ctx.organizationId, employeeId]);
  });
  const plan = () => withDb(async (q) => ({
    assignments: (await q(`SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1`, [ctx.organizationId]))[0].n,
    revisions: (await q(`SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1`, [ctx.organizationId]))[0].n,
    future: (await q(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date >= '2026-12-01'`, [ctx.organizationId, employeeId]))[0].n,
  }));
  const before = await plan();
  const context = await browser.newContext({ storageState: EMPLOYEE_STATE, baseURL, locale: 'es-ES', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await openImport(page, /Importar (mis )?turnos/);
  await page.locator('input[type="file"]').first().setInputFiles(await workbook(String(own.name), SELF_ALIAS, 'Empleado', true));
  await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 10_000 }).catch(() => undefined);
  await expect(page.getByTestId('source-identity-candidate')).toContainText(String(own.name), { timeout: 60_000 });
  await expect(page.getByTestId('source-identity-select')).toHaveCount(0);
  await page.getByTestId('source-identity-associate').click();
  await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 30_000 });
  expect(await withDb((q) => q(`SELECT employee_id FROM employee_source_identifiers WHERE organization_id = $1 AND external_identifier = $2`, [ctx.organizationId, SELF_ALIAS]))).toEqual([{ employee_id: employeeId }]);
  await expect(page.getByTestId('import-self-future-notice')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: /Confirmar Importación/ }).click();
  await expect(page.locator('.import-modal')).toBeHidden({ timeout: 90_000 });
  const saved = await withDb((q) => q(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date IN ('2026-03-03','2026-03-04')`, [ctx.organizationId, employeeId]));
  expect(saved[0].n).toBeGreaterThanOrEqual(2);
  const after = await plan();
  expect(after).toEqual(before); // no future shifts, assignments, or new legacy revisions
  await context.close();
});
