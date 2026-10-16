import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';

const ctx = (): QaContext => JSON.parse(readFileSync(CONTEXT_FILE, 'utf8'));

/** Admins see an employee picker: choose the employee with the most calendar rows in the mirror. */
async function selectBusiestEmployee(page: import('@playwright/test').Page) {
  const c = ctx();
  const lib = await qaLib();
  const db = await lib.connect();
  let employeeId: string;
  let employeeName: string;
  try {
    const row = (await db.query(
      `SELECT s.employee_id, e.name FROM shifts s JOIN employees e ON e.id = s.employee_id
       WHERE s.organization_id = $1 GROUP BY s.employee_id, e.name ORDER BY COUNT(*) DESC LIMIT 1`, [c.organizationId],
    )).rows[0];
    employeeId = row.employee_id;
    employeeName = row.name;
  } finally { await db.end(); }
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: new RegExp(employeeName) }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  return employeeId;
}

test.describe('QA mirror — read flows', () => {
  test('session is the QA identity inside the QA mirror and the calendar shows data', async ({ page, request }) => {
    const c = ctx();
    await assertQaOrganization(c.organizationId);
    const me = await request.get('/api/session/me', { headers: { 'x-organization-id': c.organizationId } });
    expect(me.ok()).toBeTruthy();
    await page.goto('/app');
    await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
    await expect(page.locator('.month-grid-root')).toBeVisible();
    // calendar-first: no legacy stats cards, grid near the top
    await expect(page.locator('.eff-stats')).toHaveCount(0);
    const top = await page.locator('.month-grid-root').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(320);
  });

  test('statistics modal renders effective data with shift colour tokens', async ({ page }) => {
    await selectBusiestEmployee(page);
    // navigate to a month known to hold data in the mirror (Feb 2026 from the source baseline)
    await page.getByTestId('calendar-stats-button').click();
    const dialog = page.getByRole('dialog', { name: 'Estadísticas' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: /Año/ }).click();
    await expect(dialog.getByTestId('eff-year-effective')).toBeVisible();
    await expect(dialog.locator('.hero-metric')).toBeVisible();
    await expect(dialog.getByTestId('eff-year-regular')).toHaveAttribute('style', /--shift-regular-border/);
    await dialog.screenshot({ path: test.info().outputPath('stats-year.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('reconciliation modal lists pending days when present', async ({ page }) => {
    await selectBusiestEmployee(page);
    const button = page.getByTestId('calendar-reconciliation-button');
    const shown = await button.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    if (!shown) test.skip(true, 'no pending reconciliation in the mirror');
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Reconciliación de días' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('recon-range')).toBeVisible();
    await expect(dialog.getByText(/\[run |[0-9a-f]{8}-[0-9a-f]{4}-/)).toHaveCount(0);
    await dialog.screenshot({ path: test.info().outputPath('recon.png') });
  });
});

test.describe('QA mirror — write scope', () => {
  test('writes go ONLY to the QA mirror; the source organization is untouched', async ({ request }) => {
    const c = ctx();
    await assertQaOrganization(c.organizationId); // abort before any write
    const headers = { 'x-organization-id': c.organizationId };
    const employees = await request.get('/api/employees', { headers });
    expect(employees.ok()).toBeTruthy();
    const list = (await employees.json()).employees as Array<{ id: string }>;
    expect(list.length).toBeGreaterThan(0);
    const employeeId = list[0].id;

    const lib = await qaLib();
    const db = await lib.connect();
    try {
      const countSource = async () => (await db.query('SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1', [c.sourceOrganizationId])).rows[0].n;
      const sourceBefore = await countSource();

      const imp = await request.post('/api/imports', { headers, data: {
        fileName: 'qa-fixture.csv', sourceFormat: 'csv', fileFingerprint: createHash('sha256').update(`qa-fixture-${Date.now()}`).digest('hex'), employeeId,
        periodYear: 2024, periodMonth: 2, importMode: 'individual', periodKind: 'single', periodLabel: 'QA fixture', employeeCount: 1, shiftCount: 1, createdShiftCount: 1, existingShiftCount: 0,
      } });
      expect(imp.ok(), `import ${imp.status()} ${(await imp.text()).slice(0, 200)}`).toBeTruthy();
      const importId = (await imp.json()).import.id as string;
      const shiftId = crypto.randomUUID();
      const saved = await request.patch('/api/shifts', { headers, data: {
        employeeId, importId, deleteIds: [], upserts: [{ id: shiftId, employeeId, importId, date: '2024-02-10', startTime: '09:00', endTime: '17:00', shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin: 'IMP' }],
      } });
      expect(saved.ok(), `shifts ${saved.status()} ${(await saved.text()).slice(0, 200)}`).toBeTruthy();

      const row = (await db.query('SELECT organization_id FROM shifts WHERE employee_id = $1 AND date = $2 AND start_time = $3', [employeeId, '2024-02-10', '09:00'])).rows;
      expect(row.length).toBeGreaterThan(0);
      expect(row.every((r: { organization_id: string }) => r.organization_id === c.organizationId)).toBe(true);
      expect((await db.query('SELECT organization_id FROM imports WHERE id = $1', [importId])).rows[0].organization_id).toBe(c.organizationId);
      expect(await countSource()).toBe(sourceBefore);

      // leave the mirror as found
      await request.patch('/api/shifts', { headers, data: { employeeId, upserts: [], deleteIds: [shiftId] } });
    } finally { await db.end(); }
  });

  test('the guard refuses the source organization', async () => {
    const c = ctx();
    await expect(assertQaOrganization(c.sourceOrganizationId)).rejects.toThrow(/QA GUARD/);
  });
});
