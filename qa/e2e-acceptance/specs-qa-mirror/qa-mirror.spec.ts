import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';

const ctx = (): QaContext => JSON.parse(readFileSync(CONTEXT_FILE, 'utf8'));

const SHOTS = join(__dirname, '..', 'test-results-qa-mirror', 'screenshots');
const shot = (name: string) => { mkdirSync(SHOTS, { recursive: true }); return join(SHOTS, `${test.info().project.name}-${name}.png`); };

/** Admins see an employee picker: select the pilot employee (external id 84881) of the mirror. */
async function selectPilot(page: import('@playwright/test').Page) {
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
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
    await selectPilot(page);
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
    await selectPilot(page);
    const button = page.getByTestId('calendar-reconciliation-button');
    const shown = await button.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    if (!shown) test.skip(true, 'no pending reconciliation in the mirror');
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Diferencias' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('recon-range')).toBeVisible();
    await expect(dialog.getByText(/\[run |[0-9a-f]{8}-[0-9a-f]{4}-/)).toHaveCount(0);
    await dialog.screenshot({ path: test.info().outputPath('recon.png') });
  });
});

test.describe('QA mirror — review scenarios (2026 only, pilot employee)', () => {
  test('calendar 2026, statistics, annual target and reconciliation show the mirror data', async ({ page }) => {
    await selectPilot(page);
    await page.screenshot({ path: shot('calendar-2026') });

    await page.getByTestId('calendar-stats-button').click();
    const stats = page.getByRole('dialog', { name: 'Estadísticas' });
    await stats.getByRole('tab', { name: /Año/ }).click();
    await expect(stats.getByTestId('eff-year-effective')).not.toHaveText(/^0 h$/);
    await stats.screenshot({ path: shot('statistics-2026') });
    await stats.getByRole('tab', { name: /Objetivo|Target/ }).click();
    await expect(stats.getByTestId('eff-contract-minimum')).toContainText('1529');
    await expect(stats.getByTestId('eff-contract-maximum')).toContainText('1540');
    await expect(stats.getByTestId('eff-contract-unconfigured')).toHaveCount(0);
    await stats.screenshot({ path: shot('annual-target') });
    await page.keyboard.press('Escape');

    await page.getByTestId('calendar-reconciliation-button').click();
    const recon = page.getByRole('dialog', { name: 'Diferencias' });
    await expect(recon.getByTestId('recon-range')).toBeVisible();
    expect(await recon.innerText()).not.toMatch(/\[run |[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    await recon.screenshot({ path: shot('reconciliation') });
    await page.keyboard.press('Escape');
  });

  test('calendar 2025 has no operational data in the mirror', async ({ page }) => {
    await selectPilot(page);
    // Oct 2026 -> Dec 2025
    for (let i = 0; i < 10; i += 1) await page.getByRole('button', { name: /Mes anterior|Previous month/ }).click();
    await expect(page.locator('.month-nav-label')).toContainText('Diciembre 2025');
    await expect(page.locator('.month-shift-badge')).toHaveCount(0);
    await page.screenshot({ path: shot('calendar-2025-empty') });
    await page.getByTestId('calendar-stats-button').click();
    const stats = page.getByRole('dialog', { name: 'Estadísticas' });
    await stats.getByRole('tab', { name: /Año 2025/ }).click();
    await expect(stats.getByTestId('eff-year-no-data')).toBeVisible();
  });
});

test.describe('QA mirror — annual target tab fits without scrolling', () => {
  test('desktop 1536×864: Objetivo anual shows everything with no vertical scroll', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop-only layout contract');
    await page.setViewportSize({ width: 1536, height: 864 });
    await selectPilot(page);
    await page.getByTestId('calendar-stats-button').click();
    const dialog = page.getByRole('dialog', { name: 'Estadísticas' });
    await dialog.getByRole('tab', { name: /Objetivo/ }).click();
    await expect(dialog.getByTestId('eff-contract-minimum')).toBeVisible();

    // four target cards on ONE row
    const tops = await dialog.locator('.metric-grid--target .metric-card:not(.metric-card--status)').evaluateAll(
      (cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)),
    );
    expect(tops).toHaveLength(4);
    expect(new Set(tops).size).toBe(1);

    await expect(dialog.getByTestId('eff-contract-status')).toBeVisible();
    await expect(dialog.getByTestId('eff-contract-projection')).toBeVisible();
    await expect(dialog.getByTestId('stats-modal-close')).toBeVisible();

    // the real scroll container of the modal must not overflow
    const overflow = await dialog.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 1);
    await dialog.screenshot({ path: shot('annual-target-1536x864-dark') });

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    const light = await dialog.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(light.scrollHeight).toBeLessThanOrEqual(light.clientHeight + 1);
    await dialog.screenshot({ path: shot('annual-target-1536x864-light') });
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
