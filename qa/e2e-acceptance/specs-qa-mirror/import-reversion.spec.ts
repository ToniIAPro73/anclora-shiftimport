import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';

/**
 * Functional (no screenshots): revert an import from the history. The user selects ONE import; the server includes the later import that
 * depends on it, orders them (the order is only a detail) and executes one atomic operation. QA mirror only, synthetic data.
 */
let ctx: QaContext;
const fp = () => createHash('sha256').update(randomBytes(16)).digest('hex');
async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}
test.beforeAll(() => { ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext; });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'functional scenario: desktop project only');

test('history: revert one import -> the dependent import is included automatically, one confirmation, both end up Revertida', async ({ page }) => {
  const emp = (await withDb((q) => q(`SELECT id FROM employees WHERE organization_id = $1 AND status = 'active' AND external_employee_id IS NOT NULL AND external_employee_id <> '84881' AND user_id IS NULL ORDER BY name LIMIT 1`, [ctx.organizationId])))[0];
  await withDb(async (q) => {
    await q(`DELETE FROM company_plan_revisions WHERE organization_id = $1 AND coverage_from >= '2027-01-01'`, [ctx.organizationId]);
    await q(`DELETE FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 AND s.period_start >= '2027-01-01')`, [ctx.organizationId]);
    await q(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01')`, [ctx.organizationId]);
    await q(`DELETE FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01'`, [ctx.organizationId]);
    await q(`DELETE FROM imports WHERE organization_id = $1 AND file_name LIKE 'qa-revert-%'`, [ctx.organizationId]);
  });
  const headers = { 'x-organization-id': ctx.organizationId };
  const doc = (name: string, start: string) => ({
    fileName: `qa-revert-${name}.xlsx`, sourceFormat: 'excel', fileFingerprint: fp(), employeeId: emp.id, importMode: 'individual', periodKind: 'multi', periodYear: 2027, periodMonth: null,
    periodLabel: 'QA', weekStart: 'monday', futureConsent: 'historical-and-plan', sourceKind: 'PUBLISHED_CALENDAR_EXPORT', deleteIds: [],
    shifts: ['2027-06-01', '2027-06-02'].map((date) => ({ date, shiftType: 'Regular', startTime: start, endTime: '17:00', employeeId: emp.id, origin: 'IMP', sourceFormat: 'excel', location: 'Regular' })),
  });
  const first = await (await page.request.post('/api/imports/confirm-split', { headers, data: doc('a', '09:00') })).json();
  const second = await (await page.request.post('/api/imports/confirm-split', { headers, data: doc('b', '10:00') })).json();
  expect(first.importId && second.importId).toBeTruthy();

  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Historial/ }).first().click();
  const revertFirst = page.getByTestId(`import-revert-${first.importId}`);
  await expect(revertFirst).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Eliminar/ })).toHaveCount(0);
  await revertFirst.click();

  await expect(page.getByTestId('reversion-preview')).toBeVisible();
  await expect(page.getByTestId('reversion-related')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('reversion-related')).toContainText('qa-revert-b.xlsx');
  expect(await page.getByTestId('reversion-preview').innerText()).not.toMatch(/subir|bajar|ordenar/i); // no manual ordering controls
  await page.getByTestId('reversion-confirm').click();
  await expect(page.getByTestId('reversion-preview')).toBeHidden({ timeout: 30_000 });

  await expect(page.getByTestId(`import-row-${first.importId}`)).toContainText('Revertida', { timeout: 30_000 });
  await expect(page.getByTestId(`import-row-${second.importId}`)).toContainText('Revertida');
  await expect(page.getByTestId(`import-revert-${first.importId}`)).toHaveCount(0); // not offered again
  const state = await withDb((q) => q(`SELECT COUNT(*)::int n FROM imports WHERE id = ANY($1::uuid[]) AND reverted_at IS NOT NULL`, [[first.importId, second.importId]]));
  expect(state[0].n).toBe(2);
  await withDb(async (q) => {
    await q(`DELETE FROM company_plan_revisions WHERE organization_id = $1 AND coverage_from >= '2027-01-01'`, [ctx.organizationId]);
    await q(`DELETE FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 AND s.period_start >= '2027-01-01')`, [ctx.organizationId]);
    await q(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01')`, [ctx.organizationId]);
    await q(`DELETE FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01'`, [ctx.organizationId]);
  });
});
