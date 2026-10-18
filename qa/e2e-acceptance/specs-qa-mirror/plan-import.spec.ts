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
// Local-only copy of a real TRYP employee export (gitignored): structure-detected, DCF + observations + 6888.
const TRYP_EMP = join(__dirname, '..', '..', '..', 'src', 'ingestion', 'fixtures', 'real', 'emp.xlsx');
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

/** Real-user scroll: wheel over the review region until the target is fully inside the visible modal. */
async function scrollIntoReach(page: Page, testId: string) {
  const region = page.locator('.import-modal-review-extra');
  const target = page.getByTestId(testId);
  const box = await region.boundingBox();
  if (!box) throw new Error('review region not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
  for (let i = 0; i < 12; i += 1) {
    const t = await target.boundingBox();
    const r = await region.boundingBox();
    if (t && r && t.y >= r.y - 1 && t.y + t.height <= r.y + r.height + 1) return;
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(120);
  }
}

test.describe('source-aware import UI, desktop + mobile (QA mirror, real TRYP employee export)', () => {
  test.skip(!existsSync(TRYP_EMP), 'real TRYP export not available on this machine');
  test('employee calendar: detected source, identity gate and the decision are reachable by scrolling', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(TRYP_EMP);
    await page.getByRole('button', { name: 'Procesar archivo' }).click();
    const summary = page.getByTestId('import-source-summary');
    await expect(summary).toBeVisible({ timeout: 60_000 });
    await expect(summary).toHaveAttribute('data-source-kind', 'EMPLOYEE_CALENDAR_EXPORT');
    await expect(summary).toContainText('Calendario del empleado');
    await expect(summary).toContainText('Incidencias DCF: 5');
    expect(await summary.innerText()).not.toMatch(/EMPLOYEE_CALENDAR_EXPORT|COMPANY_PLAN|[0-9a-f]{8}-[0-9a-f]{4}/);
    await expect(page.getByTestId('source-identity-panel')).toBeVisible();
    await expect(page.getByTestId('import-future-consent')).toBeAttached();
    await scrollIntoReach(page, 'import-future-consent');
    const radio = page.getByRole('radio', { name: /Importar anteriores y añadir los futuros a Planificación/ });
    await expect(radio).toBeInViewport();
    await radio.check();
    await expect(page.getByTestId('import-future-consent-plan-summary')).toContainText('no se publican automáticamente');
    // the confirm button stays reachable and the row list keeps some room
    await expect(page.getByRole('button', { name: /Confirmar Importación/ })).toBeInViewport();
    const list = await page.locator('.import-modal__shifts-list').boundingBox();
    expect(list?.height ?? 0).toBeGreaterThan(100);
  });
});

test.describe('company plan import UI (QA mirror, real documents)', () => {
  // TODO(mobile): the decision block sits below the fold of the import sheet; the flow still needs a scroll-aware step.
  test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'desktop-only for now');
  test('XLSX individual (MIXED): explicit choice, safe default, plan summary stays a draft', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(XLSX);
    await page.getByRole('button', { name: 'Procesar archivo' }).click({ timeout: 10_000 }).catch(() => undefined);
    const consent = page.getByTestId('import-future-consent');
    await expect(consent).toBeVisible({ timeout: 60_000 });
    await expect(consent).toContainText('turnos anteriores y futuros');
    await expect(page.getByTestId('import-future-consent-counts')).toContainText(/Turnos anteriores: \d+ · Turnos futuros: \d+/);
    // safe default: historical only; the plan option is explicit
    await expect(page.getByRole('radio', { name: /Importar solo anteriores/ })).toBeChecked();
    await page.getByRole('radio', { name: /Importar anteriores y añadir los futuros a Planificación/ }).check();
    await expect(page.getByTestId('import-future-consent-plan-summary')).toContainText('no se publican automáticamente');
    expect(await page.getByTestId('import-future-consent').innerText()).not.toMatch(/publicar|[0-9a-f]{8}-[0-9a-f]{4}/i);
    await consent.screenshot({ path: shot('import-xlsx-mixed-consent') });
  });

  test('PDF team (FUTURE): planning-only decision with the reconciliation preview', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type="file"]').first().setInputFiles(PDF);
    // the team flow: pick everyone, continue to the summary
    await page.getByText('Seleccionar todos', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    // Precondition: the PDF must still bring something new. The mirror is a copy of the source calendar, which may already
    // hold these rows (then the team flow has nothing to plan and, correctly, shows no decision).
    const summaryText = await page.getByRole('dialog').first().innerText();
    test.skip(/\b0\s*Turnos nuevos/.test(summaryText.replace(/\s+/g, ' ')) && /\b0\s*Conflictos/.test(summaryText.replace(/\s+/g, ' ')), 'the mirror already contains every row of this PDF');
    const consent = page.getByTestId('team-import-future-consent');
    await expect(consent).toBeVisible({ timeout: 90_000 });
    await expect(consent).toContainText(/turnos futuros/i);
    // the PDF's earlier rows age into the past as time passes: the document may be FUTURE-only or MIXED
    await page.getByRole('radio', { name: /añadir los futuros a Planificación/i }).first().check();
    await expect(page.getByTestId('team-import-future-consent-document-class')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('team-import-future-consent-changes')).toBeVisible();
    await consent.screenshot({ path: shot('import-pdf-future-consent') }); // the decision block only: no employee names
  });
});
