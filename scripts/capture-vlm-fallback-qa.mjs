/**
 * QA visual del fallback VLM (Partes 24-26): capturas reales en navegador de
 * todos los estados del flujo (determinista, analyzing, success, partial,
 * failure, timeout, cancel) en 3 viewports x dark/light, más medición de
 * performance (determinista vs fallback) y regresión CSV.
 *
 * Requiere: `vercel dev` en :3199 con VLM_PROVIDER=fake (el comportamiento se
 * controla por petición vía los headers x-vlm-fake-behavior /
 * x-vlm-fake-delay-ms, inyectados aquí con page.route — ver
 * api/ingestion/vlm.js, seam dev/test-only).
 *
 * Fixture autocontenida (patrón format-memory.spec.ts): org + usuaria EMPLOYEE
 * "Ana Martinez" (1001), que coincide con la fila de A_legible.pdf; se borra
 * al terminar. El rate limit del endpoint (10/60min por org) se resetea por
 * SQL antes de cada estado para permitir iteraciones.
 *
 * Uso: node scripts/capture-vlm-fallback-qa.mjs
 */
import { chromium } from '../qa/e2e-acceptance/node_modules/playwright-core/index.mjs';
import { neon } from '@neondatabase/serverless';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../api/_lib/passwords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'qa', 'vlm-fallback');
const BASE = 'http://localhost:3199';
const FIXTURES = path.join(root, 'test-data', 'scenarios', 'anclora-group-shift-ingestion');
const PDF_A = path.join(FIXTURES, 'vlm', 'A_legible.pdf');
const PDF_B = path.join(FIXTURES, 'vlm', 'B_scanned_no_text.pdf');
const CSV_REGRESSION = path.join(FIXTURES, '02_turnos_logistica_2026-09_01-15.csv');
const PASSWORD = 'Vlm-QA-2026-pass';

function loadDatabaseUrl() {
  const envFile = readFileSync(path.join(root, '.env.development.local'), 'utf8');
  const match = envFile.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('DATABASE_URL not found in .env.development.local');
  return match[1].trim().replace(/^"|"$/g, '');
}

const sql = neon(loadDatabaseUrl());
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- fixture --
const stamp = Date.now();
const email = `vlm-qa-ana-${stamp}@qa.test`;
const hash = hashPassword(PASSWORD);
const org = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`VLM-QA Org ${stamp}`}, 'company', 'team') RETURNING id`)[0].id;
const userId = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hash}, 'Ana Martinez') RETURNING id`)[0].id;
await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${userId}, ${org}, 'EMPLOYEE')`;
await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id) VALUES (${org}, 'Ana Martinez', ${userId}, '1001')`;
console.log(`✓ fixture: org=${org} user=${email}`);

const resetVlmRateLimit = () => sql`DELETE FROM login_attempts WHERE id_key = ${`vlm:org:${org}`}`;

// --------------------------------------------------------------- helpers --
const results = { shots: [], perf: {}, assertions: [] };
const assert = (name, ok, detail = '') => {
  results.assertions.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗ FALLA'} [assert] ${name}${detail ? ` — ${detail}` : ''}`);
};

async function newSession(browser, { width, height, theme }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addInitScript((themeMode) => {
    window.localStorage.setItem('anclora_theme_mode', themeMode);
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  }, theme);
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 400)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 250));
  });

  // Control por petición del provider fake + registro de llamadas al endpoint.
  const vlm = { behavior: null, delayMs: null, requests: [] };
  await page.route('**/api/ingestion/vlm', async (route) => {
    vlm.requests.push(Date.now());
    const headers = { ...route.request().headers() };
    if (vlm.behavior) headers['x-vlm-fake-behavior'] = vlm.behavior;
    if (vlm.delayMs !== null) headers['x-vlm-fake-delay-ms'] = String(vlm.delayMs);
    await route.continue({ headers });
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/ingestion/vlm')) console.log(`[vlm response] ${r.status()}`);
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await page.waitForSelector('#auth-email', { state: 'detached', timeout: 15_000 });
  // Tras el login la app ya está en /app; no recargar (la restauración de
  // sesión tarda y no aporta nada).
  await page.getByRole('button', { name: 'Importar', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
  return { context, page, vlm };
}

async function shot(page, filename) {
  await page.screenshot({ path: path.join(OUT, filename) });
  results.shots.push(filename);
  console.log(`✓ ${filename}`);
}

async function openImportModal(page) {
  // Idempotente: si el modal ya está abierto (sección anterior lo dejó
  // abierto), no volver a pulsar Importar — el overlay interceptaría el click.
  if (await page.locator('.modal-overlay:visible').count() === 0) {
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
  }
  await page.locator('.modal-overlay').waitFor({ state: 'visible', timeout: 10_000 });
  // Identidad EMPLOYEE precargada desde el directorio remoto: esperar a que
  // llegue (si se procesa antes, employeePreset está vacío y el roster
  // pre-check no puede matchear → selfNotFound espurio).
  await page.getByTestId('import-employee-name-locked').filter({ hasText: 'Ana Martinez' })
    .waitFor({ state: 'visible', timeout: 20_000 });
  // Período Septiembre 2026 (mes de A_legible.pdf; el fake usa el hint).
  const triggers = page.locator('.modal-select-trigger');
  await triggers.nth(0).click();
  await page.getByRole('option', { name: 'Septiembre', exact: true }).click();
  await triggers.nth(1).click();
  await page.getByRole('option', { name: '2026', exact: true }).click();
}

async function uploadAndProcess(page, filePath) {
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await page.getByRole('button', { name: 'Procesar archivo' }).click();
}

const resetImport = async (page) => {
  const trash = page.locator('.import-file-summary button');
  if (await trash.count() > 0) await trash.first().click();
};

const now = (page) => page.evaluate(() => performance.now());

/** Badge wait con diagnóstico: si no aparece, vuelca el texto del modal y un
 * screenshot de depuración antes de lanzar el timeout. */
async function waitVlmBadge(page, timeout = 30_000) {
  try {
    await page.locator('[data-testid="import-visual-analysis-badge"]').waitFor({ state: 'visible', timeout });
  } catch (error) {
    const text = await page.locator('.modal-overlay').innerText().catch(() => '(sin modal)');
    console.log('--- badge timeout; modal text ---\n', text.slice(0, 1500));
    await page.screenshot({ path: path.join(root, 'tmp', 'debug-badge-timeout.png') }).catch(() => {});
    throw error;
  }
}

/** Igual para el estado analyzing (con volcado diagnóstico en timeout). */
async function waitAnalyzing(page, timeout = 20_000) {
  try {
    await page.getByText('análisis visual adicional').waitFor({ state: 'visible', timeout });
  } catch (error) {
    const text = await page.locator('.modal-overlay').innerText().catch(() => '(sin modal)');
    console.log('--- analyzing timeout; modal text ---\n', text.slice(0, 1500));
    await page.screenshot({ path: path.join(root, 'tmp', 'debug-analyzing-timeout.png') }).catch(() => {});
    throw error;
  }
}

/** Igual para el estado 1 (roster path: sin chip, espera el confirm con filas). */
async function waitDeterministicPreview(page, timeout = 60_000) {
  try {
    await page.getByRole('button', { name: /Confirmar Importación \([1-9]/ }).waitFor({ state: 'visible', timeout });
  } catch (error) {
    const text = await page.locator('.modal-overlay').innerText().catch(() => '(sin modal)');
    console.log('--- deterministic preview timeout; modal text ---\n', text.slice(0, 1500));
    await page.screenshot({ path: path.join(root, 'tmp', 'debug-deterministic-timeout.png') }).catch(() => {});
    throw error;
  }
}

// ------------------------------------------------------------------ run --
// Filtro opcional para iterar rápido: QA_SESSIONS=mobile,mobile-light
const ONLY = (process.env.QA_SESSIONS || '').split(',').filter(Boolean);
const runSession = (name) => ONLY.length === 0 || ONLY.includes(name);

const browser = await chromium.launch({ headless: true });
try {
  // ============================ 1440x900 dark: todos los estados ==========
  if (runSession('main')) {
    const { context, page, vlm } = await newSession(browser, { width: 1440, height: 900, theme: 'dark' });
    await openImportModal(page);

    // -- Estado 1: PDF normal (A) — determinista, SIN VLM ------------------
    // Nota: A_legible lleva 2 filas de empleado → el roster pre-check del
    // flujo EMPLOYEE (identityLocked) filtra a "Ana Martinez" y pinta la
    // preview directa (sin chip de diagnosis: comportamiento diseñado).
    await resetVlmRateLimit();
    const t0 = await now(page);
    await uploadAndProcess(page, PDF_A);
    await waitDeterministicPreview(page);
    const t1 = await now(page);
    await page.waitForTimeout(400);
    results.perf.deterministicMs = Math.round(t1 - t0);
    assert('A_legible: sin request a /api/ingestion/vlm', vlm.requests.length === 0, `${vlm.requests.length} requests`);
    assert('A_legible: sin badge "Análisis visual"', await page.locator('[data-testid="import-visual-analysis-badge"]').count() === 0);
    await shot(page, '01-pdf-normal-dark-1440.png');
    await resetImport(page);

    // -- Estados 2+3: fallback analyzing → success -------------------------
    await resetVlmRateLimit();
    vlm.behavior = 'success';
    vlm.delayMs = 3500;
    await uploadAndProcess(page, PDF_B);
    await waitAnalyzing(page);
    await page.waitForTimeout(300);
    await shot(page, '02-vlm-analyzing-dark-1440.png');
    await waitVlmBadge(page);
    await page.waitForTimeout(400);
    assert('VLM success: badge visible', true);
    await shot(page, '03-vlm-success-dark-1440.png');
    // Estado 7: preview completo con badge (scroll al final de la lista).
    const list = page.locator('.import-modal-right');
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; }).catch(() => {});
    await page.waitForTimeout(250);
    await shot(page, '07-preview-full-badge-dark-1440.png');
    await resetImport(page);

    // -- Estado 4: partial — diagnostics legibles --------------------------
    await resetVlmRateLimit();
    vlm.behavior = 'partial';
    vlm.delayMs = 0;
    await uploadAndProcess(page, PDF_B);
    await page.locator('[data-testid="import-quality-state"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(400);
    assert('VLM partial: diagnostics visibles', await page.locator('[data-testid="import-diagnostics"]').count() > 0);
    await shot(page, '04-vlm-partial-dark-1440.png');
    await resetImport(page);

    // -- Estado 5: provider-error — error controlado + retry ---------------
    await resetVlmRateLimit();
    vlm.behavior = 'provider-error';
    await uploadAndProcess(page, PDF_B);
    await page.getByText('El análisis visual adicional falló').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
    assert('VLM failure: archivo conservado', await page.locator('.import-file-summary').count() > 0);
    assert('VLM failure: retry (Procesar) habilitado', await page.getByRole('button', { name: 'Procesar archivo' }).isEnabled());
    await shot(page, '05-vlm-failure-dark-1440.png');
    await resetImport(page);

    // -- Estado 6: timeout — VLM_TIMEOUT controlado ------------------------
    await resetVlmRateLimit();
    vlm.behavior = 'timeout';
    await uploadAndProcess(page, PDF_B);
    await page.getByText('análisis visual adicional tardó demasiado').waitFor({ state: 'visible', timeout: 45_000 });
    await page.waitForTimeout(300);
    await shot(page, '06-vlm-timeout-dark-1440.png');
    await resetImport(page);

    // -- Estado 8: cancel durante analyzing --------------------------------
    await resetVlmRateLimit();
    vlm.behavior = 'success';
    vlm.delayMs = 4000;
    await uploadAndProcess(page, PDF_B);
    await waitAnalyzing(page);
    await page.keyboard.press('Escape');
    await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 8_000 });
    await page.waitForTimeout(400);
    await shot(page, '08-cancel-during-analyzing-dark-1440.png');
    // Sin estado zombie: al reabrir, el archivo se conserva (cerrar ≠
    // resetear — eso es el botón de papelera), el texto analyzing desaparece
    // y el botón Procesar (retry) queda habilitado.
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await page.locator('.modal-overlay').waitFor({ state: 'visible', timeout: 10_000 });
    const procesarBtn = page.locator('button.import-process-button', { hasText: 'Procesar archivo' });
    await procesarBtn.waitFor({ state: 'visible', timeout: 10_000 });
    assert('Cancel: retry habilitado tras reabrir', await procesarBtn.isEnabled());
    assert('Cancel: sin texto analyzing residual', await page.getByText('análisis visual adicional').count() === 0);
    await page.keyboard.press('Escape');
    await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 8_000 });
    assert('Cancel: segundo ESC cierra el modal', await page.locator('.modal-overlay:visible').count() === 0);

    // -- Performance: fallback con delay 0 ---------------------------------
    await resetVlmRateLimit();
    vlm.behavior = 'success';
    vlm.delayMs = 0;
    await openImportModal(page);
    const f0 = await now(page);
    await uploadAndProcess(page, PDF_B);
    await waitVlmBadge(page, 45_000);
    const f1 = await now(page);
    results.perf.fallbackDelay0Ms = Math.round(f1 - f0);
    await resetImport(page);

    // -- Regresión CSV (Parte 26): preview normal, sin badge ni request ----
    const csvRequestsBefore = vlm.requests.length;
    await openImportModal(page);
    await uploadAndProcess(page, CSV_REGRESSION);
    // EMPLOYEE + roster de equipo sin su fila → estado selfNotFound (sin chip
    // ni diagnostics); cualquiera de estos destinos es una resolución válida.
    await page.locator([
      '[data-testid="import-quality-state"]',
      '[data-testid="import-diagnostics"]',
      'text=No hemos encontrado tus turnos',
    ].join(', ')).first().waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => page.getByRole('button', { name: /Confirmar Importación/ }).waitFor({ state: 'visible', timeout: 10_000 }));
    await page.waitForTimeout(400);
    assert('CSV: sin request a /api/ingestion/vlm', vlm.requests.length === csvRequestsBefore);
    assert('CSV: sin badge "Análisis visual"', await page.locator('[data-testid="import-visual-analysis-badge"]').count() === 0);
    await shot(page, '09-csv-regression-dark-1440.png');

    await context.close();
  }

  // ============================ 1440x900 light: estados principales =======
  if (runSession('light')) {
    const { context, page, vlm } = await newSession(browser, { width: 1440, height: 900, theme: 'light' });
    await openImportModal(page);

    await resetVlmRateLimit();
    await uploadAndProcess(page, PDF_A);
    await waitDeterministicPreview(page);
    await page.waitForTimeout(400);
    await shot(page, '01-pdf-normal-light-1440.png');
    assert('A_legible light: sin request VLM', vlm.requests.length === 0);
    await resetImport(page);

    await resetVlmRateLimit();
    vlm.behavior = 'success';
    vlm.delayMs = 3500;
    await uploadAndProcess(page, PDF_B);
    await waitAnalyzing(page);
    await page.waitForTimeout(300);
    await shot(page, '02-vlm-analyzing-light-1440.png');
    await waitVlmBadge(page);
    await page.waitForTimeout(400);
    await shot(page, '03-vlm-success-light-1440.png');
    await resetImport(page);

    await resetVlmRateLimit();
    vlm.behavior = 'provider-error';
    vlm.delayMs = 0;
    await uploadAndProcess(page, PDF_B);
    await page.getByText('El análisis visual adicional falló').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot(page, '05-vlm-failure-light-1440.png');

    await context.close();
  }

  // ============================ 1024x768 dark: spot checks ================
  if (runSession('tablet')) {
    const { context, page, vlm } = await newSession(browser, { width: 1024, height: 768, theme: 'dark' });
    await openImportModal(page);

    await resetVlmRateLimit();
    vlm.behavior = 'success';
    vlm.delayMs = 3500;
    await uploadAndProcess(page, PDF_B);
    await waitAnalyzing(page);
    await page.waitForTimeout(300);
    await shot(page, '02-vlm-analyzing-dark-1024.png');
    await waitVlmBadge(page);
    await page.waitForTimeout(400);
    await shot(page, '03-vlm-success-dark-1024.png');
    await resetImport(page);

    await resetVlmRateLimit();
    vlm.behavior = 'provider-error';
    vlm.delayMs = 0;
    await uploadAndProcess(page, PDF_B);
    await page.getByText('El análisis visual adicional falló').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot(page, '05-vlm-failure-dark-1024.png');

    await context.close();
  }

  // ============================ 390x844 dark + spot light =================
  if (runSession('mobile')) {
    const { context, page, vlm } = await newSession(browser, { width: 390, height: 844, theme: 'dark' });
    await openImportModal(page);

    await resetVlmRateLimit();
    vlm.behavior = 'success';
    vlm.delayMs = 3500;
    await uploadAndProcess(page, PDF_B);
    await waitAnalyzing(page);
    await page.waitForTimeout(300);
    await shot(page, '02-vlm-analyzing-dark-390.png');
    await waitVlmBadge(page);
    await page.waitForTimeout(400);
    await shot(page, '03-vlm-success-dark-390.png');
    // Checklist móvil: el botón Confirmar debe ser alcanzable con el scroll
    // interno del modal (sin doble scroll que lo bloquee).
    const confirmMobile = page.getByRole('button', { name: /Confirmar Importación \(3\/3/ });
    await confirmMobile.scrollIntoViewIfNeeded();
    assert('Mobile: Confirmar alcanzable tras scroll', await confirmMobile.isVisible());
    await shot(page, '03b-vlm-success-scrolled-dark-390.png');
    await resetImport(page);

    await resetVlmRateLimit();
    vlm.behavior = 'partial';
    vlm.delayMs = 0;
    await uploadAndProcess(page, PDF_B);
    await page.locator('[data-testid="import-quality-state"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(400);
    await shot(page, '04-vlm-partial-dark-390.png');
    await resetImport(page);

    await resetVlmRateLimit();
    vlm.behavior = 'provider-error';
    await uploadAndProcess(page, PDF_B);
    await page.getByText('El análisis visual adicional falló').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot(page, '05-vlm-failure-dark-390.png');

    await context.close();
  }

  if (runSession('mobile-light')) {
    const { context, page, vlm } = await newSession(browser, { width: 390, height: 844, theme: 'light' });
    await openImportModal(page);
    await resetVlmRateLimit();
    vlm.behavior = 'success';
    vlm.delayMs = 0;
    await uploadAndProcess(page, PDF_B);
    await waitVlmBadge(page);
    await page.waitForTimeout(400);
    await shot(page, '03-vlm-success-light-390.png');
    await context.close();
  }
} finally {
  await browser.close();
  await sql`DELETE FROM organizations WHERE id = ${org}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
  console.log('✓ fixture eliminada');
}

// --------------------------------------------------------------- resumen --
console.log('\n================ RESUMEN QA VLM ================');
console.log(`Screenshots (${results.shots.length}):`);
for (const s of results.shots) console.log(`  qa/vlm-fallback/${s}`);
console.log(`\nPerformance:`);
console.log(`  determinista (A_legible.pdf): ${results.perf.deterministicMs} ms`);
console.log(`  fallback VLM delay 0 (B):     ${results.perf.fallbackDelay0Ms} ms`);
const failed = results.assertions.filter((a) => !a.ok);
console.log(`\nAssertions: ${results.assertions.length - failed.length}/${results.assertions.length} OK`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
  process.exitCode = 1;
}
