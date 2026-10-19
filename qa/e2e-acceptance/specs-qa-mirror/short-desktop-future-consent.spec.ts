import { expect, test, type Page } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';
import { readFileSync } from 'node:fs';

const XLSX = process.env.SEBASTIAN_CALENDAR_XLSX;
if (!XLSX) throw new Error('SEBASTIAN_CALENDAR_XLSX must point to the real Sebastian workbook');

let ctx: QaContext;
type QaLibModule = Awaited<ReturnType<typeof qaLib>>;
type QaDb = Awaited<ReturnType<QaLibModule['connect']>>;
type DbRow = Record<string, string>;

async function withDb<T>(fn: (db: QaDb, lib: QaLibModule) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(db, lib); } finally { await db.end(); }
}

async function sourceFingerprint(db: QaDb, sourceId: string, lib: QaLibModule) {
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

async function pilotShifts(db: QaDb, employeeId: string) {
  return (await db.query(
    "SELECT id, TO_CHAR(date,'YYYY-MM-DD') AS date, COALESCE(start_time,'') AS start_time, COALESCE(end_time,'') AS end_time, shift_type, origin, layer, effective_state FROM shifts WHERE organization_id=$1 AND employee_id=$2 AND date BETWEEN '2026-01-01' AND '2026-12-31' AND effective_state IN ('EFFECTIVE','REQUIRES_REVIEW') ORDER BY date,start_time,id",
    [ctx.organizationId, employeeId],
  )).rows;
}

async function openImport(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('sidebar-import').click();
  await page.locator('input[type="file"]').first().setInputFiles(XLSX!);
  await page.getByRole('button', { name: 'Procesar archivo' }).click();
  await expect(page.getByText('319 encontrados')).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(() => { ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext; });
test.use({ screenshot: 'off', trace: 'retain-on-failure', video: 'off' });

test('future import consent remains reachable at short desktop heights and responsive sizes', async ({ page }) => {
  const startedAt = new Date(Date.now() - 5_000).toISOString();
  const state = await withDb(async (db, lib) => {
    const source = await lib.resolveSourceOrganization(db);
    const beforeSource = await sourceFingerprint(db, source.id, lib);
    const employee = (await db.query("SELECT id FROM employees WHERE organization_id=$1 AND external_employee_id='84881' AND status='active'", [ctx.organizationId])).rows[0];
    if (!employee) throw new Error('QA Mirror pilot 84881 is missing');
    const aliases = (await db.query("SELECT id, employee_id FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888'", [ctx.organizationId])).rows;
    if (aliases.length > 1 || (aliases.length === 1 && aliases[0].employee_id !== employee.id)) throw new Error('QA alias 6888 has an unexpected mapping');
    const imports = (await db.query('SELECT id FROM imports WHERE organization_id=$1', [ctx.organizationId])).rows.map((row: DbRow) => row.id);
    const shifts = await pilotShifts(db, employee.id);
    return { source, beforeSource, employeeId: employee.id as string, mappingPreexisting: aliases.length === 1, importIds: imports, shifts, shiftFingerprint: lib.sha256(JSON.stringify(shifts)) };
  });
  expect(state.mappingPreexisting, 'the QA fixture must start with the source alias unresolved').toBe(false);
  let mappingCreated = false;

  try {
    await openImport(page);
    await expect(page.getByTestId('source-identity-panel')).toBeVisible();
    await expect(page.getByTestId('source-identity-candidate')).toContainText('Sebastián Pozo Mendoza');
    await expect(page.getByTestId('source-identity-candidate-id')).toContainText('84881');
    await expect(page.getByTestId('source-identity-reference')).toContainText('6888');
    await expect(page.getByTestId('import-target-id')).toHaveValue('84881');
    await expect(page.getByTestId('source-identity-select')).toHaveCount(0);
    if (!state.mappingPreexisting) {
      mappingCreated = true;
      await page.getByTestId('source-identity-associate').click();
    }
    await expect(page.getByTestId('source-identity-resolved')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('import-diff-state')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByTestId('import-historical-count')).toContainText('291');
    await expect(page.getByTestId('import-future-count')).toContainText('28');
    await expect(page.getByText('290 ya existentes')).toBeVisible();
    await expect(page.getByText('1 cambio', { exact: true })).toBeVisible();

    const historical = page.locator('[data-testid="import-future-consent"] input[value="historical-only"]');
    const future = page.locator('[data-testid="import-future-consent"] input[value="historical-and-plan"]');
    await expect(historical).toBeVisible();
    await expect(future).toBeVisible();
    const desktopSizes = [[1920, 1080], [1440, 900], [1366, 768], [1366, 650], [1280, 620]] as const;
    for (const [width, height] of desktopSizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(120);
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const node = document.querySelector(selector);
          if (!(node instanceof HTMLElement)) throw new Error(`Missing layout element: ${selector}`);
          const box = node.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, overflowY: getComputedStyle(node).overflowY };
        };
        return {
          modal: rect('.import-modal'), shiftsPanel: rect('.import-modal__shifts-panel'), shiftsList: rect('.import-modal__shifts-list'), review: rect('.import-modal-review-extra'), consent: rect('[data-testid="import-future-consent"]'), footer: rect('.import-modal__footer'),
          historical: rect('[data-testid="import-future-consent"] input[value="historical-only"]'), future: rect('[data-testid="import-future-consent"] input[value="historical-and-plan"]'),
          extraVerticalScrollers: [...document.querySelectorAll<HTMLElement>('.import-modal *')].filter((node) => {
            const style = getComputedStyle(node);
            return node.classList.contains('import-modal__shifts-list') === false && ['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
          }).map((node) => node.className || node.tagName.toLowerCase()),
        };
      });
      expect(geometry.modal.scrollHeight, `${width}x${height}: modal outer vertical overflow`).toBeLessThanOrEqual(geometry.modal.clientHeight + 2);
      expect(geometry.modal.overflowY, `${width}x${height}: modal must not scroll`).toBe('hidden');
      expect(geometry.modal.scrollWidth, `${width}x${height}: modal horizontal overflow`).toBeLessThanOrEqual(geometry.modal.clientWidth + 1);
      expect(geometry.shiftsPanel.scrollWidth, `${width}x${height}: shifts panel horizontal overflow`).toBeLessThanOrEqual(geometry.shiftsPanel.clientWidth + 1);
      expect(geometry.shiftsList.scrollHeight, `${width}x${height}: rows must remain scrollable`).toBeGreaterThan(geometry.shiftsList.clientHeight);
      expect(geometry.shiftsList.clientHeight, `${width}x${height}: list must leave a usable viewport below its header`).toBeGreaterThanOrEqual(64);
      expect(geometry.extraVerticalScrollers, `${width}x${height}: a second vertical scrolling region was found`).toEqual([]);
      expect(geometry.review.scrollHeight, `${width}x${height}: review block must not scroll`).toBeLessThanOrEqual(geometry.review.clientHeight + 1);
      expect(geometry.review.overflowY, `${width}x${height}: review overflow mode`).toBe('visible');
      expect(geometry.consent.bottom, `${width}x${height}: consent must clear the fixed footer`).toBeLessThanOrEqual(geometry.footer.top + 1);
      expect(geometry.historical.top, `${width}x${height}: historical choice above viewport`).toBeGreaterThanOrEqual(0);
      expect(geometry.historical.bottom, `${width}x${height}: historical choice behind footer`).toBeLessThanOrEqual(geometry.footer.top + 1);
      expect(geometry.future.bottom, `${width}x${height}: future choice below viewport`).toBeLessThanOrEqual(height);
      expect(geometry.future.bottom, `${width}x${height}: future choice behind footer`).toBeLessThanOrEqual(geometry.footer.top + 1);
      expect(geometry.footer.bottom, `${width}x${height}: footer below viewport`).toBeLessThanOrEqual(height);
      expect(geometry.future.top, `${width}x${height}: future choice behind footer`).toBeGreaterThanOrEqual(geometry.consent.top);
    }

    // Exercise both input modalities at the tightest required viewport without submitting the import.
    await page.setViewportSize({ width: 1366, height: 650 });
    await expect(historical).toBeChecked();
    await expect(future).toBeEnabled();
    await future.click();
    await expect(future).toBeChecked();
    await expect(page.getByTestId('import-future-consent-plan-summary')).toBeVisible();
    await expect(page.getByTestId('import-future-count')).toContainText('28');
    await expect(page.getByTestId('import-future-consent-plan-summary')).toContainText('No se publicarán automáticamente');
    await expect(page.locator('.import-modal__footer button')).toBeEnabled();
    for (const [width, height] of [[1366, 650], [1280, 620]] as const) {
      await page.setViewportSize({ width, height });
      const selectedGeometry = await page.evaluate(() => {
        const modal = document.querySelector('.import-modal') as HTMLElement;
        const list = document.querySelector('.import-modal__shifts-list') as HTMLElement;
        const review = document.querySelector('.import-modal-review-extra') as HTMLElement;
        const consent = document.querySelector('[data-testid="import-future-consent"]') as HTMLElement;
        const footer = document.querySelector('.import-modal__footer') as HTMLElement;
        const futureRadio = document.querySelector('[data-testid="import-future-consent"] input[value="historical-and-plan"]') as HTMLInputElement;
        return { modalHeight: modal.clientHeight, modalScrollHeight: modal.scrollHeight, listHeight: list.clientHeight, listScrollHeight: list.scrollHeight, reviewHeight: review.clientHeight, reviewScrollHeight: review.scrollHeight, consentBottom: consent.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top, footerBottom: footer.getBoundingClientRect().bottom, radioBottom: futureRadio.getBoundingClientRect().bottom };
      });
      expect(selectedGeometry.modalScrollHeight, `${width}x${height}: modal outer vertical overflow after choosing drafts`).toBeLessThanOrEqual(selectedGeometry.modalHeight + 2);
      expect(selectedGeometry.listHeight, `${width}x${height}: rows list must stay usable after choosing drafts`).toBeGreaterThanOrEqual(64);
      expect(selectedGeometry.listScrollHeight, `${width}x${height}: rows list must remain scrollable after choosing drafts`).toBeGreaterThan(selectedGeometry.listHeight);
      expect(selectedGeometry.reviewScrollHeight, `${width}x${height}: review must not scroll after choosing drafts`).toBeLessThanOrEqual(selectedGeometry.reviewHeight + 1);
      expect(selectedGeometry.consentBottom, `${width}x${height}: expanded consent must clear footer`).toBeLessThanOrEqual(selectedGeometry.footerTop + 1);
      expect(selectedGeometry.radioBottom, `${width}x${height}: future radio must clear footer`).toBeLessThanOrEqual(selectedGeometry.footerTop + 1);
      expect(selectedGeometry.footerBottom, `${width}x${height}: footer remains visible`).toBeLessThanOrEqual(height);
    }
    await page.setViewportSize({ width: 1366, height: 650 });
    await historical.click();
    await expect(historical).toBeChecked();
    await historical.focus();
    await page.keyboard.press('ArrowDown');
    await expect(future).toBeChecked();
    await historical.focus();
    await page.keyboard.press('Space');
    await expect(historical).toBeChecked();

    for (const [width, height] of [[1024, 768], [768, 1024], [390, 844], [844, 390]] as const) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(120);
      const sizes = await page.evaluate(() => {
        const modal = document.querySelector('.import-modal') as HTMLElement;
        const panel = document.querySelector('.import-modal__shifts-panel') as HTMLElement;
        return { modalClientWidth: modal.clientWidth, modalScrollWidth: modal.scrollWidth, panelClientWidth: panel.clientWidth, panelScrollWidth: panel.scrollWidth };
      });
      expect(sizes.modalScrollWidth, `${width}x${height}: modal horizontal overflow`).toBeLessThanOrEqual(sizes.modalClientWidth + 1);
      expect(sizes.panelScrollWidth, `${width}x${height}: panel horizontal overflow`).toBeLessThanOrEqual(sizes.panelClientWidth + 1);
      for (const choice of [historical, future]) {
        await choice.scrollIntoViewIfNeeded();
        await expect(choice).toBeVisible();
        await choice.click();
      }
      const footer = page.locator('.import-modal__footer');
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toBeVisible();
    }
  } finally {
    await withDb(async (db, lib) => {
      const aliases = (await db.query("SELECT employee_id FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888'", [ctx.organizationId])).rows;
      if (mappingCreated) {
        await db.query("DELETE FROM employee_source_identifiers WHERE organization_id=$1 AND source_system='TRYP_EMPLOYEE_CALENDAR' AND external_identifier='6888' AND employee_id=$2", [ctx.organizationId, state.employeeId]);
        expect(aliases.length).toBeLessThanOrEqual(1);
      } else if (state.mappingPreexisting) {
        expect(aliases).toEqual([{ employee_id: state.employeeId }]);
      }
      const shifts = await pilotShifts(db, state.employeeId);
      expect(lib.sha256(JSON.stringify(shifts))).toBe(state.shiftFingerprint);
      const sourceNow = await sourceFingerprint(db, state.source.id, lib);
      expect(sourceNow.overall).toBe(state.beforeSource.overall);
      const imports = (await db.query("SELECT id FROM imports WHERE organization_id=$1 AND file_name='Calendario_empleado_Sebastian.xlsx' AND created_at >= $2", [ctx.organizationId, startedAt])).rows.map((row: DbRow) => row.id);
      expect(imports.filter((id: string) => !state.importIds.includes(id))).toEqual([]);
    });
  }
});
