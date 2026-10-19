import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, request as pwRequest, test, type Page } from '@playwright/test';
import { ACTIVE_ORG_KEY, BASE_URL, CONTEXT_FILE, STATE_DIR, assertQaOrganization, ensureStateDir, qaLib, type QaContext } from '../helpers/qa-mirror';

/**
 * EMPLOYEE role in the browser (qa.employee@anclora.test, QA mirror only):
 *  - MIXED document: own history is imported, the future is shown as excluded, no plan option, no drafts/assignments.
 *  - FUTURE-only document: nothing is written and the reason is explained.
 * The QA employee's source number (TRYP 6888) is associated EXPLICITLY with their own employee record, as an admin would.
 */
const EMPLOYEE_STATE = join(STATE_DIR, 'qa-employee-storage-state.json');
const TRYP_EMP = join(__dirname, '..', '..', '..', 'src', 'ingestion', 'fixtures', 'real', 'emp.xlsx');
const SYNTHETIC_ID = '6888';
test.skip(!existsSync(TRYP_EMP), 'real TRYP export not available on this machine');
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

let ctx: QaContext;
let employeeId = '';

test.beforeAll(async () => {
  ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext;
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const env = lib.loadEnv(['.env.development.local']);
  ensureStateDir();
  const login = async (email: string, password: string) => {
    const api = await pwRequest.newContext({ baseURL: BASE_URL });
    const res = await api.post('/api/auth/login', { data: { email, password } });
    if (!res.ok()) throw new Error(`QA login failed (${res.status()})`);
    return api;
  };
  const admin = await login(lib.QA_IDENTITY, env.MANUAL_QA_PASSWORD);
  const employee = await login(lib.QA_EMPLOYEE_IDENTITY, env.MANUAL_QA_EMPLOYEE_PASSWORD);
  const me = await (await employee.get('/api/session/me', { headers: { 'x-organization-id': ctx.organizationId } })).json();
  employeeId = me.session?.employeeId ?? me.employeeId;
  expect(employeeId).toBeTruthy();
  // explicit, administrative association of the QA employee's source number (never inferred)
  const mapped = await admin.post('/api/employees/identifiers', {
    headers: { 'x-organization-id': ctx.organizationId },
    data: { employeeId, sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: SYNTHETIC_ID },
  });
  expect([200, 201, 409]).toContain(mapped.status());
  const state = await employee.storageState();
  state.origins = [{ origin: BASE_URL, localStorage: [
    { name: ACTIVE_ORG_KEY, value: JSON.stringify({ [me.user?.id ?? me.userId]: ctx.organizationId }) },
    { name: 'anclora_shiftimport_locale_v1', value: 'es' },
    { name: 'anclora-cookie-consent-v1', value: JSON.stringify({ necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1' }) },
    { name: 'anclora_shiftimport_onboarding_v1', value: JSON.stringify({ version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED' }) },
  ] }];
  writeFileSync(EMPLOYEE_STATE, JSON.stringify(state), { mode: 0o600 });
  await admin.dispose(); await employee.dispose();
});

async function counts() {
  const lib = await qaLib();
  const db = await lib.connect();
  try {
    const q = async (sql: string) => (await db.query(sql, [ctx.organizationId, employeeId])).rows[0].n as number;
    return {
      shifts: await q('SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND employee_id = $2'),
      futureShifts: await q("SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date >= (NOW() AT TIME ZONE 'Europe/Madrid')::date"),
      assignments: await q('SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 AND a.employee_id = $2'),
      revisions: await q('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1 AND $2::uuid IS NOT NULL'),
    };
  } finally { await db.end(); }
}

/** Mirror-only reset (guarded) so every run starts from the same "nothing imported yet" state for the QA employee. */
async function resetEmployeeImports() {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try {
    await db.query('DELETE FROM calendar_annotations WHERE organization_id = $1 AND employee_id = $2', [ctx.organizationId, employeeId]);
    await db.query('DELETE FROM calendar_changes WHERE organization_id = $1 AND employee_id = $2', [ctx.organizationId, employeeId]);
    await db.query('DELETE FROM shifts WHERE organization_id = $1 AND employee_id = $2', [ctx.organizationId, employeeId]);
  } finally { await db.end(); }
}

async function openImport(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  if ((page.viewportSize()?.width ?? 1440) < 900) await page.getByRole('button', { name: /Abrir navegación/ }).click();
  await page.getByRole('button', { name: /Importar (mis )?turnos/ }).first().click();
}

async function futureOnlyFile(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Calendario empleado');
  sheet.addRow(['Copia no Controlada si se Imprime - Calendario empleado']);
  sheet.addRow(['Persona Sintetica Calendario 2027']);
  sheet.addRow([null, ...Array.from({ length: 31 }, (_, i) => i + 1)]);
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  months.forEach((month, m) => sheet.addRow([month, ...Array.from({ length: 31 }, (_, d) => (m === 2 && d >= 1 && d <= 5 ? '09:00 \n17:00' : null))]));
  const legend = wb.addWorksheet('Leyenda');
  legend.addRow(['Filtrado', 'Filtrado']); legend.addRow(['Calendario', 'Empleado']); legend.addRow(['Nómina', SYNTHETIC_ID]);
  legend.addRow(['Nombre Completo', 'Persona Sintetica']); legend.addRow(['Fecha inicio', '01/01/2027']); legend.addRow(['Fecha fin', '31/12/2027']);
  const file = join(STATE_DIR, 'future-only-synthetic.xlsx');
  writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer));
  return file;
}

test.describe('EMPLOYEE import (browser, QA mirror)', () => {
  test('MIXED document: own history allowed, future excluded, no plan option, nothing planned', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ storageState: EMPLOYEE_STATE, baseURL, locale: 'es-ES', ...(test.info().project.use.viewport ? { viewport: test.info().project.use.viewport } : {}), ...(test.info().project.name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
    const page = await context.newPage();
    await resetEmployeeImports();
    const before = await counts();
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(TRYP_EMP);
    await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 10_000 }).catch(() => undefined);
    const summary = page.getByTestId('import-source-summary');
    await expect(summary).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 30_000 });
    // future is announced as excluded; there is NO plan option for an EMPLOYEE
    await expect(page.getByTestId('import-self-future-notice')).toBeVisible();
    await expect(page.getByTestId('import-future-consent')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    await page.getByTestId('import-self-future-notice').scrollIntoViewIfNeeded();
    const confirm = page.getByRole('button', { name: /Confirmar Importación/ });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    // Existing per-day conflicts are answered like a user would (keep the existing shift), until the import closes.
    const skip = page.getByRole('button', { name: 'Omitir turno' });
    for (let i = 0; i < 400 && await page.locator('.import-modal').isVisible(); i += 1) {
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => undefined);
      else await page.waitForTimeout(250);
    }
    await expect(page.locator('.import-modal')).toBeHidden({ timeout: 30_000 });
    const after = await counts();
    expect(after.shifts).toBeGreaterThan(before.shifts); // own history written
    expect(after.futureShifts).toBe(before.futureShifts); // no future schedule rows
    expect(after.assignments).toBe(before.assignments); // no assignments / drafts
    expect(after.revisions).toBe(before.revisions); // new imports never create a legacy revision
  });

  test('FUTURE-only document: nothing is written and the reason is explained', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ storageState: EMPLOYEE_STATE, baseURL, locale: 'es-ES', ...(test.info().project.use.viewport ? { viewport: test.info().project.use.viewport } : {}) });
    const page = await context.newPage();
    const file = await futureOnlyFile();
    const before = await counts();
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(file);
    await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 10_000 }).catch(() => undefined);
    await expect(page.getByTestId('import-source-summary')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('import-self-future-notice')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    const confirm = page.getByRole('button', { name: /Confirmar Importación/ });
    if (await confirm.isEnabled()) { await confirm.click(); await page.waitForTimeout(3000); }
    const after = await counts();
    expect(after).toEqual(before);
  });
});
