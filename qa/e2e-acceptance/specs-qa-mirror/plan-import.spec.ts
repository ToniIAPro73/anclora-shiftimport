import { existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * UI proof of the company-plan import flow with the two REAL documents (kept outside the repo).
 * Skipped when the documents are not on this machine. No data is written: the flows stop at the decision /
 * preview step (the write path is proven by scripts/qa/plan-import-e2e.mjs against the same mirror).
 */
const DIR = process.env.QA_REAL_DOCS_DIR ?? join(homedir(), 'Documents', 'Shiftimport-assets');
const XLSX = join(DIR, 'Copia no Controlada si se Imprime - Calendario empleado84881.xlsx');
const PDF = join(DIR, 'PDF FTPS 16-31 OCTUBRE PAX Y LL 2026.pdf');
const SHOTS = join(__dirname, '..', 'test-results-qa-mirror', 'screenshots');
const shot = (name: string) => { mkdirSync(SHOTS, { recursive: true }); return join(SHOTS, `${test.info().project.name}-${name}.png`); };

test.skip(!existsSync(XLSX) || !existsSync(PDF), 'real QA documents not available on this machine');
// The real documents show real names in the UI: never keep failure screenshots / traces of these flows.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

async function openImport(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
  const importButton = page.getByRole('button', { name: /Importar turnos/ }).first();
  if ((page.viewportSize()?.width ?? 1440) < 900) {
    await page.getByRole('button', { name: /Abrir navegación/ }).click(); // mobile: navigation lives in the drawer
  }
  await importButton.click();
}

test.describe('company plan import UI (QA mirror, real documents)', () => {
  // TODO(mobile): the decision block sits below the fold of the import sheet; the flow still needs a scroll-aware step.
  test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'desktop-only for now');
  test('XLSX individual (MIXED): explicit choice, safe default, plan summary stays a draft', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(XLSX);
    const consent = page.getByTestId('import-future-consent');
    await expect(consent).toBeVisible({ timeout: 60_000 });
    await expect(consent).toContainText('datos históricos y planificación futura');
    await expect(page.getByTestId('import-future-consent-counts')).toContainText(/Históricos detectados: \d+ · Futuros detectados: \d+/);
    // safe default: historical only; the plan option is explicit
    await expect(page.getByRole('radio', { name: /Importar solo históricos/ })).toBeChecked();
    await page.getByRole('radio', { name: /Importar históricos y crear\/actualizar planificación futura/ }).check();
    await expect(page.getByTestId('import-future-consent-plan-summary')).toContainText('no se publica automáticamente');
    expect(await page.getByTestId('import-future-consent').innerText()).not.toMatch(/publicar|[0-9a-f]{8}-[0-9a-f]{4}/i);
    await consent.screenshot({ path: shot('import-xlsx-mixed-consent') });
  });

  test('PDF team (FUTURE): planning-only decision with the reconciliation preview', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(PDF);
    // the team flow: pick everyone, continue to the summary
    await page.getByText('Seleccionar todos', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    const consent = page.getByTestId('team-import-future-consent');
    await expect(consent).toBeVisible({ timeout: 90_000 });
    await expect(consent).toContainText('planificación futura');
    await expect(page.getByRole('radio', { name: /Importar solo históricos/ })).toHaveCount(0);
    await page.getByRole('radio', { name: /Crear \/ actualizar planificación futura/ }).check();
    await expect(page.getByTestId('team-import-future-consent-document-class')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('team-import-future-consent-changes')).toBeVisible();
    await consent.screenshot({ path: shot('import-pdf-future-consent') }); // the decision block only: no employee names
  });
});
