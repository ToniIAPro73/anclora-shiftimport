import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test, type Page } from '@playwright/test';
import { CONTEXT_FILE, STATE_DIR, assertQaOrganization, ensureStateDir, qaLib, type QaContext } from '../helpers/qa-mirror';

/**
 * Individual TRYP calendar import (QA mirror only, synthetic workbook):
 *  - identity: an unmapped alias (6888) + a unique normalised name proposes the CANONICAL employee (name + id 84881),
 *    needs the explicit "Asociar y continuar", then resolves as MAPPED automatically on the next import;
 *  - desktop layout: no vertical scroll of the modal shell nor of the review block, both temporal options and the
 *    identity block visible together; only the detected-shifts list scrolls;
 *  - tablet / mobile: everything reachable (scrolling is allowed).
 */
let ctx: QaContext;
let pilotId = '';
const SOURCE_SYSTEM = 'TRYP_EMPLOYEE_CALENDAR';

async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>): Promise<T> {
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}
const unmapAlias = () => withDb((q) => q(`DELETE FROM employee_source_identifiers WHERE organization_id = $1 AND source_system = $2 AND external_identifier = '6888'`, [ctx.organizationId, SOURCE_SYSTEM]));

/** ~300 synthetic rows (past + future) of a TRYP "Calendario empleado" for the pilot, alias 6888, name without accent. */
async function bigCalendarFile(): Promise<string> {
  const year = Number(new Date().toLocaleDateString('sv', { timeZone: 'Europe/Madrid' }).slice(0, 4));
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Calendario empleado');
  sheet.addRow(['Copia no Controlada si se Imprime - Calendario empleado']); sheet.addRow([`Sebastian Pozo Mendoza Calendario ${year}`]);
  sheet.addRow([null, ...Array.from({ length: 31 }, (_, i) => i + 1)]);
  ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].forEach((month) => {
    sheet.addRow([month, ...Array.from({ length: 31 }, (_, d) => (d % 4 === 3 ? null : '09:00 \n17:00'))]);
  });
  const legend = wb.addWorksheet('Leyenda');
  legend.addRow(['Filtrado', 'Filtrado']); legend.addRow(['Calendario', 'Empleado']); legend.addRow(['Nómina', '6888']);
  legend.addRow(['Nombre Completo', 'Sebastian Pozo Mendoza']); legend.addRow(['Fecha inicio', `01/01/${year}`]); legend.addRow(['Fecha fin', `31/12/${year}`]);
  ensureStateDir();
  const file = join(STATE_DIR, `qa-layout-${Date.now()}.xlsx`);
  writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer));
  return file;
}

async function openImport(page: Page, file: string) {
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  const open = page.getByRole('button', { name: /Importar turnos/ }).first();
  if ((page.viewportSize()?.width ?? 1440) < 900) await page.getByRole('button', { name: /Abrir navegación/ }).click().catch(() => undefined);
  await open.click();
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 8_000 }).catch(() => undefined);
  await expect(page.getByTestId('source-identity-panel')).toBeVisible({ timeout: 60_000 });
}

const overflowsVertically = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => {
  const style = getComputedStyle(el);
  return { overflows: el.scrollHeight > el.clientHeight + 1, scrollable: ['auto', 'scroll'].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 1 };
});

test.beforeAll(async () => {
  ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext;
  pilotId = String((await withDb((q) => q(`SELECT id FROM employees WHERE organization_id = $1 AND external_employee_id = '84881'`, [ctx.organizationId])))[0].id);
});
test.afterAll(async () => { await unmapAlias().catch(() => undefined); });
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'the viewport matrix is driven explicitly by this spec (desktop project only)');

test.describe('identity: unmapped alias + unique name → explicit candidate with the canonical id', () => {
  test('candidate (no manual selector) → explicit association → read back as MAPPED → next import resolves automatically', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await unmapAlias();
    const file = await bigCalendarFile();
    await openImport(page, file);

    const panel = page.getByTestId('source-identity-panel');
    await expect(panel).toHaveAttribute('data-status', 'candidate');
    await expect(page.getByTestId('source-identity-select')).toHaveCount(0); // a unique candidate never asks to pick manually
    await expect(page.getByTestId('source-identity-candidate')).toContainText('Sebastián Pozo Mendoza');
    await expect(page.getByTestId('source-identity-candidate-id')).toContainText('84881');
    await expect(page.getByTestId('source-identity-reference')).toContainText('6888'); // the alias is only a document reference
    await expect(page.getByTestId('import-target-id')).toHaveValue('84881'); // never the alias
    expect(await page.getByTestId('import-target-id').inputValue()).not.toBe('6888');
    // nothing is linked silently: no mapping before the explicit click
    expect(await withDb((q) => q(`SELECT 1 FROM employee_source_identifiers WHERE organization_id = $1 AND external_identifier = '6888'`, [ctx.organizationId]))).toHaveLength(0);

    await page.getByTestId('source-identity-associate').click();
    await expect(panel).toHaveAttribute('data-status', 'resolved');
    const mapped = await withDb((q) => q(`SELECT employee_id FROM employee_source_identifiers WHERE organization_id = $1 AND source_system = $2 AND external_identifier = '6888'`, [ctx.organizationId, SOURCE_SYSTEM]));
    expect(mapped.map((r) => String(r.employee_id))).toEqual([pilotId]);

    // both temporal decisions are available; the second one is selectable and never publishes anything by itself
    const both = page.getByRole('radio', { name: /Importar solo los turnos anteriores/ });
    const plan = page.getByRole('radio', { name: /Importar también los turnos futuros/ });
    await expect(both).toBeChecked();
    await plan.check();
    await expect(plan).toBeChecked();

    // second cycle: same document, same alias → MAPPED automatically, no association asked
    await page.reload();
    await openImport(page, file);
    await expect(page.getByTestId('source-identity-panel')).toHaveAttribute('data-status', 'resolved');
    await expect(page.getByTestId('source-identity-associate')).toHaveCount(0);
  });
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
  test(`desktop ${viewport.width}x${viewport.height}: no nested vertical scroll; identity + both options + confirm visible together; only the list scrolls`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await unmapAlias();
    await openImport(page, await bigCalendarFile());
    const modal = page.locator('.import-modal');
    const box = (await modal.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    const shell = await overflowsVertically(page, '.import-modal');
    const extra = await overflowsVertically(page, '.import-modal-review-extra');
    const right = await overflowsVertically(page, '.import-modal-right');
    expect(shell.overflows, 'modal shell overflows').toBe(false);
    expect(extra.scrollable, 'review block is a second scroll region').toBe(false);
    expect(right.overflows, 'right panel clips its content').toBe(false);

    for (const locator of [page.getByTestId('source-identity-panel'), page.getByTestId('import-future-consent'), page.getByRole('radio', { name: /Importar solo los turnos anteriores/ }), page.getByRole('radio', { name: /Importar también los turnos futuros/ }), page.getByRole('button', { name: /Confirmar Importación/ })]) {
      await expect(locator).toBeInViewport({ ratio: 1 });
    }
    // the 300+ rows scroll inside their own list, and the controls stay put
    const list = page.locator('.import-modal__shifts-list');
    const listState = await list.evaluate((el) => ({ h: el.clientHeight, scrolls: el.scrollHeight > el.clientHeight + 1 }));
    expect(listState.h).toBeGreaterThan(100);
    expect(listState.scrolls).toBe(true);
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByTestId('source-identity-panel')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /Confirmar Importación/ })).toBeInViewport({ ratio: 1 });

    // mouse and keyboard
    const plan = page.getByRole('radio', { name: /Importar también los turnos futuros/ });
    await plan.check();
    await expect(plan).toBeChecked();
    await page.getByRole('radio', { name: /Importar solo los turnos anteriores/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(plan).toBeChecked();
    // no clipping / horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (viewport.width === 1366 || viewport.width === 1440) await page.screenshot({ path: test.info().outputPath(`import-${viewport.width}x${viewport.height}.png`) });
  });
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 800 }, { width: 844, height: 390 }]) {
  test(`${viewport.width}x${viewport.height}: identity, both temporal options and Confirmar are reachable`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await unmapAlias();
    await openImport(page, await bigCalendarFile());
    // narrow layouts collapse the identity block behind a toggle: expand it when present
    const toggle = page.locator('.import-modal-identity-summary button').first();
    if (await toggle.isVisible().catch(() => false)) await toggle.click().catch(() => undefined);
    for (const locator of [page.getByTestId('source-identity-panel'), page.getByRole('radio', { name: /Importar solo los turnos anteriores/ }), page.getByRole('radio', { name: /Importar también los turnos futuros/ }), page.getByRole('button', { name: /Confirmar Importación/ })]) {
      await locator.scrollIntoViewIfNeeded();
      await expect(locator).toBeInViewport();
    }
    const list = await page.locator('.import-modal__shifts-list').evaluate((el) => el.clientHeight);
    expect(list).toBeGreaterThan(0); // never collapses to 0px
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole('radio', { name: /Importar también los turnos futuros/ }).check();
    await expect(page.getByRole('radio', { name: /Importar también los turnos futuros/ })).toBeChecked();
  });
}
