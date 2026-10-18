import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { CONTEXT_FILE, STATE_DIR, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';
import { EMPLOYEE_STATE, prepareEmployeeState } from '../helpers/employee-session';

/**
 * Legacy plan bootstrap — only what needs a browser (logic is proven by scripts/qa/plan-bootstrap-e2e.mjs):
 * the Preview shows "create the initial Plan Empresa" when the data already exists and no plan was ever recorded.
 * Synthetic roster of 2 mirror employees (2027-02), existing in the calendar, no plan revision. QA mirror only.
 */
let ctx: QaContext;
let A = { id: '', name: '', ext: '' };
let B = { id: '', name: '', ext: '' };
const DAYS = { a: [['2027-02-15', '13:00', '21:00'], ['2027-02-16', '13:00', '21:00'], ['2027-02-17', '', '']], b: [['2027-02-15', '05:00', '13:00'], ['2027-02-16', '', '']] };

async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}

async function reset() {
  await withDb(async (q) => {
    const org = ctx.organizationId;
    await q(`DELETE FROM shifts WHERE organization_id = $1 AND date >= '2027-01-01'`, [org]);
    await q(`DELETE FROM company_plan_revisions WHERE organization_id = $1 AND coverage_from >= '2027-01-01'`, [org]);
    await q(`DELETE FROM shift_assignments WHERE date >= '2027-01-01' AND schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1)`, [org]);
    await q(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01') AND id NOT IN (SELECT schedule_version_id FROM shift_assignments)`, [org]);
    await q(`DELETE FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01' AND id NOT IN (SELECT schedule_id FROM schedule_versions)`, [org]);
    await q(`DELETE FROM imports WHERE organization_id = $1 AND file_name LIKE 'qa-bootstrap-%'`, [org]);
    const ins = async (e: typeof A, rows: string[][]) => {
      for (const [date, s, en] of rows) {
        await q(`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, shift_type, counts_as_work, location, legacy_origin, layer, provenance, effective_state)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$6,'PDF','COMPANY_PLAN','COMPANY_IMPORT','EFFECTIVE')`, [org, e.id, date, s || null, en || null, s ? 'Regular' : 'Libre', Boolean(s)]);
      }
    };
    await ins(A, DAYS.a); await ins(B, DAYS.b);
  });
}

const counts = () => withDb(async (q) => ({
  shifts: (await q(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1`, [ctx.organizationId]))[0].n as number,
  assignments: (await q(`SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1`, [ctx.organizationId]))[0].n as number,
  revisions: (await q(`SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1`, [ctx.organizationId]))[0].n as number,
  pending: (await q(`SELECT COUNT(DISTINCT (employee_id, date))::int n FROM shifts WHERE organization_id = $1 AND effective_state = 'REQUIRES_REVIEW'`, [ctx.organizationId]))[0].n as number,
}));

function csvFile(): string {
  const lines = ['nombre,id,fecha,inicio,fin,tipo'];
  for (const [e, rows] of [[A, DAYS.a], [B, DAYS.b]] as const) {
    for (const [date, s, en] of rows) lines.push(`${e.name},${e.ext},${date},${s},${en},${s ? 'Regular' : 'Libre'}`);
  }
  const file = join(STATE_DIR, `qa-bootstrap-${Date.now()}.csv`);
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

test.beforeAll(async () => {
  ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext;
  const rows = await withDb((q) => q(`SELECT id, name, external_employee_id ext FROM employees WHERE organization_id = $1 AND status = 'active' AND external_employee_id IS NOT NULL AND external_employee_id <> '84881' AND user_id IS NULL ORDER BY name LIMIT 2`, [ctx.organizationId]));
  [A, B] = rows.map((r) => ({ id: String(r.id), name: String(r.name), ext: String(r.ext) }));
  expect(A && B).toBeTruthy();
});
test.afterAll(async () => { await reset().catch(() => undefined); await withDb((q) => q(`DELETE FROM shifts WHERE organization_id = $1 AND date >= '2027-01-01'`, [ctx.organizationId])).catch(() => undefined); });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

async function openTeamImportWithCsv(page: Page, label: RegExp) {
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  if ((page.viewportSize()?.width ?? 1440) < 900) await page.getByRole('button', { name: /Abrir navegación/ }).click();
  await page.getByRole('button', { name: label }).first().click();
  await page.locator('input[type="file"]').first().setInputFiles(csvFile());
}

test.describe('legacy plan bootstrap (QA mirror, synthetic roster)', () => {
  test.beforeEach(async () => { await reset(); });

  for (const mode of ['desktop', 'mobile'] as const) {
    test(`admin ${mode}: data already exists, no plan → no first-reference flow is shown and nothing is written by merely previewing`, async ({ page }) => {
      test.skip(test.info().project.name !== mode, `${mode} project only`);
      const before = await counts();
      await openTeamImportWithCsv(page, /Importar turnos/);
      await page.getByText('Seleccionar todos', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByRole('button', { name: /Importar/ }).first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(3000);
      await expect(page.getByTestId('team-plan-baseline-card')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toMatch(/Primera referencia|referencia inicial|Plan Empresa/i);
      expect(await counts()).toEqual(before);
    });
  }

  test('employee: no bootstrap action and nothing is written', async ({ browser, baseURL }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop project only');
    await prepareEmployeeState(ctx);
    const context = await browser.newContext({ storageState: EMPLOYEE_STATE, baseURL, locale: 'es-ES', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const before = await counts();
    await openTeamImportWithCsv(page, /Importar (mis )?turnos/);
    await page.waitForTimeout(4000);
    await expect(page.getByTestId('team-plan-baseline-card')).toHaveCount(0);
    await expect(page.getByTestId('plan-baseline-card')).toHaveCount(0);
    const after = await counts();
    expect(after).toEqual(before);
    await context.close();
  });
});

test.describe('reconciliation modal explains before / now / effective', () => {
  test('pilot with pending days: three columns and a reason, no technical ids', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop project only');
    await page.goto('/app');
    const filter = page.getByTestId('calendar-employee-filter');
    await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
    await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
    const button = page.getByTestId('calendar-reconciliation-button');
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Diferencias' });
    await expect(dialog).toBeVisible();
    for (const label of ['Información anterior', 'Nueva información', 'Calendario actual']) await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(dialog.locator('[data-testid^="recon-why-"]').first()).toBeVisible();
    expect(await dialog.innerText()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|fingerprint|\[run /i);
  });
});
