import { expect, test, type Page } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';
import { readFileSync } from 'node:fs';

const XLSX = process.env.SEBASTIAN_CALENDAR_XLSX;
let ctx: QaContext;

type QaLibModule = Awaited<ReturnType<typeof qaLib>>;
type QaDb = Awaited<ReturnType<QaLibModule['connect']>>;
type DbRow = Record<string, string>;

async function readOnlySourceFingerprint(db: QaDb, sourceId: string, lib: QaLibModule) {
  const queries = {
    employees: 'SELECT id, name, external_employee_id, user_id, status, area_id FROM employees WHERE organization_id=$1 ORDER BY id',
    shifts: 'SELECT id, employee_id, date, start_time, end_time, shift_type, effective_state, layer, plan_revision, change_id, import_id, updated_at FROM shifts WHERE organization_id=$1 ORDER BY id',
    calendar_changes: 'SELECT id, employee_id, date, change_type, reason, before_state, after_state, created_at FROM calendar_changes WHERE organization_id=$1 ORDER BY id',
    imports: 'SELECT id, file_name, status, shift_count, updated_at FROM imports WHERE organization_id=$1 ORDER BY id',
    schedules: 'SELECT id, area_id, period_start, period_end FROM schedules WHERE organization_id=$1 ORDER BY id',
    annual_targets: 'SELECT id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes, updated_at FROM employee_annual_targets WHERE organization_id=$1 ORDER BY id',
    memberships: 'SELECT user_id, role FROM memberships WHERE organization_id=$1 ORDER BY user_id',
    areas: 'SELECT id, name, code, active FROM areas WHERE organization_id=$1 ORDER BY id',
  };
  const parts: Record<string, { rows: number; sha256: string }> = {};
  for (const [name, sql] of Object.entries(queries)) {
    const rows = (await db.query(sql, [sourceId])).rows;
    parts[name] = { rows: rows.length, sha256: lib.sha256(JSON.stringify(rows)) };
  }
  return { parts, overall: lib.sha256(JSON.stringify(parts)) };
}

async function withDb<T>(fn: (db: QaDb, lib: QaLibModule) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(db, lib); } finally { await db.end(); }
}

async function pilotId(db: QaDb, organizationId: string) {
  const rows = (await db.query("SELECT id FROM employees WHERE organization_id=$1 AND external_employee_id='84881' AND status='active'", [organizationId])).rows;
  if (rows.length !== 1) throw new Error('Expected exactly one active QA pilot employee');
  return rows[0].id as string;
}

async function pilotShifts(db: QaDb, organizationId: string, employeeId: string) {
  return (await db.query(
    "SELECT id, TO_CHAR(date,'YYYY-MM-DD') AS date, COALESCE(start_time,'') AS start_time, COALESCE(end_time,'') AS end_time, shift_type, origin, layer, effective_state FROM shifts WHERE organization_id=$1 AND employee_id=$2 AND date BETWEEN '2026-01-01' AND '2026-12-31' AND effective_state IN ('EFFECTIVE','REQUIRES_REVIEW') ORDER BY date,start_time,id",
    [organizationId, employeeId],
  )).rows;
}

async function openImport(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Importar turnos/ }).first().click();
}

test.beforeAll(() => { ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext; });
test.skip(!XLSX, 'set SEBASTIAN_CALENDAR_XLSX to the real Downloads workbook');
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'actual workbook import scenario: desktop only');

test('real Sebastian XLSX: candidate, pending diff, explicit QA mapping, semantic preview and safe historical skip', async ({ page }) => {
  if (!XLSX) return;
  const startedAt = new Date(Date.now() - 5_000).toISOString();
  const state = await withDb(async (db, lib) => {
    const source = await lib.resolveSourceOrganization(db);
    const beforeSource = await readOnlySourceFingerprint(db, source.id, lib);
    const employeeId = await pilotId(db, ctx.organizationId);
    const mapping = (await db.query("SELECT id FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888'", [ctx.organizationId])).rows;
    const imports = (await db.query('SELECT id FROM imports WHERE organization_id=$1', [ctx.organizationId])).rows.map((row: DbRow) => row.id);
    const shifts = await pilotShifts(db, ctx.organizationId, employeeId);
    return { source, beforeSource, employeeId, mappingExists: mapping.length > 0, importIds: imports, shifts, shiftFingerprint: lib.sha256(JSON.stringify(shifts)) };
  });
  expect(state.mappingExists).toBe(false);
  let mappingCreated = false;

  try {
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(XLSX);
    await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 10_000 }).catch(() => undefined);
    await expect(page.getByText('319 encontrados')).toBeVisible({ timeout: 60_000 });

    const panel = page.getByTestId('source-identity-panel');
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('source-identity-candidate')).toContainText('Sebastián Pozo Mendoza');
    await expect(page.getByTestId('source-identity-candidate-id')).toContainText('84881');
    await expect(page.getByTestId('source-identity-reference')).toContainText('6888');
    await expect(page.getByTestId('source-identity-select')).toHaveCount(0);
    await expect(page.getByTestId('import-target-id')).toHaveValue('84881');
    await expect(page.getByTestId('import-diff-state')).toHaveAttribute('data-diff-status', 'PENDING_IDENTITY');
    await expect(page.getByTestId('import-diff-state')).toContainText('Identifica al empleado');
    await expect(page.getByRole('button', { name: /Identifica al empleado/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /291 nuevos/ })).toHaveCount(0);

    await withDb(async (db) => {
      const mapping = (await db.query("SELECT employee_id FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888'", [ctx.organizationId])).rows;
      expect(mapping).toHaveLength(0); // no mapping before explicit action
    });

    mappingCreated = true; // ensure finally cleans up even if the subsequent read-back fails
    await page.getByTestId('source-identity-associate').click();
    await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 30_000 }); // server read-back is MAPPED
    const mapping = await withDb(async (db) => (await db.query("SELECT employee_id FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888'", [ctx.organizationId])).rows);
    expect(mapping).toEqual([{ employee_id: state.employeeId }]);

    await expect(page.getByTestId('import-diff-state')).toHaveCount(0, { timeout: 60_000 }); // target calendar loaded before diff
    await expect(page.getByTestId('import-historical-count')).toContainText('291');
    await expect(page.getByTestId('import-future-count')).toContainText('28');
    await expect(page.getByText('290 ya existentes')).toBeVisible();
    await expect(page.getByText('1 cambio', { exact: true })).toBeVisible();
    const confirm = page.getByRole('button', { name: 'Confirmar importación (1 cambio)' });
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(page.getByRole('dialog', { name: 'Conflicto de importación' })).toContainText('11:00');
    await expect(page.getByRole('dialog', { name: 'Conflicto de importación' })).toContainText('10:00');
    await page.getByRole('button', { name: 'Omitir turno' }).click(); // preserve the schedule row; never silently replace it

    const after = await withDb(async (db, lib) => {
      const shifts = await pilotShifts(db, ctx.organizationId, state.employeeId);
      const sourceNow = await readOnlySourceFingerprint(db, state.source.id, lib);
      const imports = (await db.query('SELECT id FROM imports WHERE organization_id=$1', [ctx.organizationId])).rows.map((row: DbRow) => row.id);
      return { shifts, shiftFingerprint: lib.sha256(JSON.stringify(shifts)), sourceNow, newImportIds: imports.filter((id: string) => !state.importIds.includes(id)) };
    });
    expect(after.shiftFingerprint).toBe(state.shiftFingerprint);
    expect(after.sourceNow.overall).toBe(state.beforeSource.overall);
    expect(after.newImportIds.length).toBeLessThanOrEqual(1);
  } finally {
    await withDb(async (db) => {
      if (mappingCreated) {
        await db.query("DELETE FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888' AND employee_id=$2", [ctx.organizationId, state.employeeId]);
      }
      const newImports = (await db.query("SELECT id FROM imports WHERE organization_id=$1 AND employee_id=$2 AND file_name='Calendario_empleado_Sebastian.xlsx' AND created_at >= $3", [ctx.organizationId, state.employeeId, startedAt])).rows;
      for (const row of newImports) await db.query('DELETE FROM imports WHERE organization_id=$1 AND id=$2', [ctx.organizationId, row.id]);
      const mapping = (await db.query("SELECT id FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888'", [ctx.organizationId])).rows;
      expect(mapping).toHaveLength(0);
    });
  }
});
