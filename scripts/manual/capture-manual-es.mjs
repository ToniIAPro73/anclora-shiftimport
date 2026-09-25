#!/usr/bin/env node
/**
 * Captura QA-safe de las pantallas del manual de usuario en español
 * (docs/manual/manual-usuario.md) contra PRODUCCIÓN.
 *
 * Reglas:
 *  - Solo la identidad QA qa.shiftimport@anclora.test y su organización QA.
 *  - El script NUNCA contiene, lee, pide ni escribe contraseñas: el inicio de
 *    sesión lo hace Toni en una ventana visible y se guarda el storageState en
 *    tmp/manual-auth/qa-state.json (tmp/ está en .gitignore).
 *  - Fase de siembra (omitible con --no-seed), idempotente y solo en la
 *    organización QA: importación de equipo GS-03, 3 turnos manuales en un día
 *    pasado y publicación de la semana del 5-oct-2026.
 *  - Todo lo demás es de solo lectura: abrir diálogo, capturar, cancelar.
 *    Nunca se pulsan confirmaciones destructivas (transferir, eliminar,
 *    restaurar, revocar).
 *
 * Uso: bash scripts/manual/capture-manual-es.sh [--only a.png,b.png] [--list] [--no-seed]
 * Variables: MANUAL_APP_URL (por defecto https://shiftimport.anclora.com),
 *            MANUAL_QA_ORG_ID (obligatoria si la cuenta QA tiene varias organizaciones),
 *            MANUAL_ALLOW_BULK_EMPLOYEE_RESULT=1 (opcional, ver bulk-result-dark.png).
 */
import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ─── Configuración ──────────────────────────────────────────────────────────
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.env.MANUAL_APP_URL || 'https://shiftimport.anclora.com').replace(/\/$/, '');
const QA_EMAIL = process.env.MANUAL_QA_EMAIL || 'qa.shiftimport@anclora.test';
const OUT_DIR = path.join(root, 'docs', 'manual', 'screenshots');
const TMP = path.join(root, 'tmp');
const STATE_PATH = process.env.MANUAL_QA_STATE_PATH || path.join(TMP, 'manual-auth', 'qa-state.json');
const DEBUG_DIR = path.join(TMP, 'manual-capture-debug');
const FIXTURES_DIR = path.join(TMP, 'manual-fixtures');
const LOG_PATH = path.join(TMP, 'manual-capture-log.json');
const CORPUS = path.join(root, 'src', 'ingestion', 'fixtures', 'acceptance-corpus', 'fixtures');

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  narrow: { viewport: { width: 768, height: 900 }, deviceScaleFactor: 1.5 },
};

// Datos sintéticos de la siembra (fixture GS-03: 1–14 oct 2026, 3 empleados).
const GS03_IDS = ['H-201', 'H-202', 'H-301'];
const SEED_EMPLOYEE = { externalId: 'H-201', nameRe: /Ana López/ };
const PLANNER_WEEK = '2026-10-05';
const SEED_SHIFTS = [
  { type: 'Regular', start: '08:00', end: '11:00' },
  { type: 'Ausencia', start: '11:00', end: '12:00' },
  { type: 'Regular', start: '12:00', end: '16:00' },
];

// Día pasado para los 3 turnos manuales: ayer (si hoy es día 1, cae en el mes anterior).
const TODAY = new Date();
const SEED_DAY = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 1);
const SEED_DATE = isoDate(SEED_DAY);
const SEED_PREV_MONTH = SEED_DAY.getMonth() !== TODAY.getMonth();

// ─── Argumentos ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const onlyIndex = argv.indexOf('--only');
const ONLY = onlyIndex >= 0 && argv[onlyIndex + 1]
  ? new Set(argv[onlyIndex + 1].split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const LIST = argv.includes('--list');
const NO_SEED = argv.includes('--no-seed');
const CONFIRM_TEAM_IMPORT = process.env.MANUAL_CONFIRM_TEAM_IMPORT === '1';

// ─── Utilidades ─────────────────────────────────────────────────────────────
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const want = (file) => !ONLY || ONLY.has(file);
const log = (...parts) => console.log(...parts);
class Pending extends Error {}
const pending = (reason) => { throw new Pending(reason); };
const shortError = (error) => String(error?.message ?? error).split('\n')[0].slice(0, 300);

const captured = new Set();          // capturas hechas (también desde grupos/siembra)
const pendingReasons = new Map();    // pendientes decididos dentro de un grupo
const seedLog = [];                  // acciones de siembra

// ─── Playwright ─────────────────────────────────────────────────────────────
async function loadChromium() {
  const candidates = [
    path.join(root, 'qa', 'e2e-acceptance', 'node_modules', 'playwright-core', 'index.mjs'),
    'playwright',
    '@playwright/test',
  ];
  for (const candidate of candidates) {
    try {
      if (candidate.endsWith('.mjs')) {
        if (!existsSync(candidate)) continue;
        const mod = await import(pathToFileURL(candidate).href);
        if (mod.chromium) return mod.chromium;
      } else {
        const mod = await import(candidate);
        if (mod.chromium) return mod.chromium;
      }
    } catch { /* siguiente candidato */ }
  }
  console.error('✗ No se encontró Playwright. Ejecuta: npm run e2e:install:chromium (y npm --prefix qa/e2e-acceptance ci si faltan dependencias).');
  process.exit(1);
}

let chromium;
async function launchBrowser(headless) {
  try {
    return await chromium.launch({ channel: 'chrome', headless });
  } catch (chromeError) {
    try {
      log('  (Google Chrome no disponible; se usa el Chromium de Playwright)');
      return await chromium.launch({ headless });
    } catch (bundledError) {
      console.error('✗ No se pudo abrir ningún navegador.');
      console.error(`  Chrome: ${shortError(chromeError)}`);
      console.error(`  Chromium: ${shortError(bundledError)}`);
      console.error('  Instala Google Chrome o ejecuta: npm run e2e:install:chromium');
      process.exit(1);
    }
  }
}

// Script inyectado en cada página: consentimiento, onboarding, idioma, tema y
// organización activa fijada a la organización QA.
function appInitScript({ consent, userId, orgId }) {
  try {
    if (consent) {
      localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
        necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1',
      }));
    }
    localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
    localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    localStorage.setItem('anclora_theme_mode', 'dark');
    if (userId && orgId) {
      const map = JSON.parse(localStorage.getItem('anclora_shiftimport_active_org_v1') || '{}');
      map[userId] = orgId;
      localStorage.setItem('anclora_shiftimport_active_org_v1', JSON.stringify(map));
    }
  } catch { /* about:blank u origen sin storage */ }
}

async function fetchSession(page) {
  return page.evaluate(async () => {
    try {
      const response = await fetch('/api/session/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      return { status: response.status, body: await response.json().catch(() => null) };
    } catch (error) {
      return { status: 0, error: String(error) };
    }
  });
}

async function logoutFromPage(page) {
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null)).catch(() => null);
}

// ─── Autenticación sin contraseñas ──────────────────────────────────────────
async function ensureAuth() {
  mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  let session = null;

  if (existsSync(STATE_PATH)) {
    const browser = await launchBrowser(true);
    try {
      const context = await browser.newContext({ storageState: STATE_PATH });
      const page = await context.newPage();
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      const result = await fetchSession(page);
      if (result.status === 200 && result.body?.user?.email === QA_EMAIL) session = result.body;
      else log('  La sesión guardada no es válida; hay que iniciar sesión de nuevo.');
    } finally {
      await browser.close();
    }
    if (!session) unlinkSync(STATE_PATH);
  }

  if (!session) {
    const browser = await launchBrowser(false);
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.addInitScript(appInitScript, { consent: true });
    const page = await context.newPage();
    await page.goto(`${BASE}/login?email=${encodeURIComponent(QA_EMAIL)}`, { waitUntil: 'domcontentloaded' });
    log(`\n▶ Inicia sesión en la ventana con la cuenta QA ${QA_EMAIL}…`);
    log('  (El script no ve ni guarda tu contraseña; espera hasta 10 minutos.)');
    const deadline = Date.now() + 10 * 60 * 1000;
    let result = null;
    while (Date.now() < deadline) {
      await sleep(2000);
      result = await fetchSession(page).catch(() => null); // puede fallar durante una navegación
      if (result?.status === 200) break;
    }
    if (result?.status !== 200) {
      await browser.close();
      throw new Error('No se completó el inicio de sesión en 10 minutos.');
    }
    if (result.body?.user?.email !== QA_EMAIL) {
      await logoutFromPage(page);
      await browser.close();
      if (existsSync(STATE_PATH)) unlinkSync(STATE_PATH);
      throw new Error(`La sesión iniciada es de "${result.body?.user?.email}", no de ${QA_EMAIL}. Se ha cerrado la sesión y se aborta.`);
    }
    await context.storageState({ path: STATE_PATH });
    await browser.close();
    session = result.body;
    log('  ✓ Sesión QA guardada en tmp/manual-auth/qa-state.json');
  }

  // Organización QA: única membresía o la fijada por MANUAL_QA_ORG_ID.
  const memberships = session.memberships ?? [];
  let membership = null;
  if (process.env.MANUAL_QA_ORG_ID) {
    membership = memberships.find((m) => m.organizationId === process.env.MANUAL_QA_ORG_ID) ?? null;
    if (!membership) throw new Error(`MANUAL_QA_ORG_ID=${process.env.MANUAL_QA_ORG_ID} no es una organización de ${QA_EMAIL}.`);
  } else if (memberships.length === 1) {
    membership = memberships[0];
  } else {
    throw new Error(`${QA_EMAIL} tiene ${memberships.length} organizaciones. Define MANUAL_QA_ORG_ID con la organización QA.`);
  }
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    throw new Error(`El rol QA en la organización es ${membership.role}; se necesita OWNER o ADMIN.`);
  }
  return { userId: session.user.id, orgId: membership.organizationId, orgName: membership.organizationName, role: membership.role };
}

// ─── Contextos y páginas ────────────────────────────────────────────────────
let browser;
let QA = null;
const pages = new Map();
let lastPage = null; // página usada por la última pantalla (para la captura de depuración)

async function getPage(role, size = 'desktop', { consent = true } = {}) {
  const key = `${role}:${size}:${consent}`;
  if (pages.has(key)) {
    lastPage = pages.get(key);
    return lastPage;
  }
  const context = await browser.newContext({
    ...VIEWPORTS[size],
    locale: 'es-ES',
    colorScheme: 'dark',
    ...(role === 'admin' ? { storageState: STATE_PATH } : {}),
  });
  await context.addInitScript(appInitScript, {
    consent,
    userId: role === 'admin' ? QA.userId : null,
    orgId: role === 'admin' ? QA.orgId : null,
  });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  pages.set(key, page);
  lastPage = page;
  return page;
}

// Llamada a la API desde la página (misma cookie de sesión y cabecera de organización QA).
async function api(page, apiPath) {
  const result = await page.evaluate(async ({ apiPath: p, orgId }) => {
    const response = await fetch(p, { credentials: 'same-origin', headers: { Accept: 'application/json', 'x-organization-id': orgId } });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { apiPath, orgId: QA.orgId });
  if (result.status !== 200) throw new Error(`API ${apiPath} → HTTP ${result.status}`);
  return result.body;
}

async function openApp(page, route = '/app') {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('sidebar-calendar').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1200);
  // El consentimiento puede aparecer en un contexto de navegador nuevo aunque
  // el estado de la aplicación ya esté preparado. Cerrar solo este banner
  // necesario evita que cubra los controles del workspace.
  const cookieDialog = page.locator('[role="dialog"][aria-labelledby="shiftimport-cookie-title"]');
  if (await cookieDialog.waitFor({ timeout: 1_500 }).then(() => true).catch(() => false)) {
    await cookieDialog.getByRole('button', { name: 'Aceptar todas', exact: true }).click();
    await page.waitForTimeout(300);
  }
  // Formatos de cuadrante aprendidos en ejecuciones anteriores del script:
  // un modal de migración ("Formatos aprendidos en este dispositivo") puede
  // aparecer y bloquear el resto de la página hasta decidir. Se descarta sin
  // migrar para no alterar nada fuera de esta sesión de captura.
  const learnedFormatsModal = page.getByRole('dialog', { name: 'Formatos aprendidos en este dispositivo', exact: true });
  if (await learnedFormatsModal.waitFor({ timeout: 2_000 }).then(() => true).catch(() => false)) {
    await learnedFormatsModal.getByRole('button', { name: 'Mantener solo en este dispositivo', exact: true }).click().catch(() => null);
    await page.waitForTimeout(300);
  }
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready).catch(() => null);
  await page.waitForTimeout(600);
}

async function shotPage(page, file) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT_DIR, file) });
  captured.add(file);
}

async function shotEl(locator, file) {
  await locator.waitFor({ state: 'visible' });
  await settle(locator.page());
  await locator.screenshot({ path: path.join(OUT_DIR, file) });
  captured.add(file);
}

const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });

// Captura solo si el archivo está seleccionado (--only); el flujo sigue igual.
async function maybe(file, fn) {
  if (want(file)) await fn();
}

// Ejecuta una vez un grupo de capturas compartido por varias pantallas.
const groupRuns = new Map();
async function runGroup(name, fn) {
  if (!groupRuns.has(name)) groupRuns.set(name, fn().then(() => null, (error) => error));
  const error = await groupRuns.get(name);
  if (error) throw error;
}
function requireCaptured(file) {
  if (captured.has(file)) return;
  if (pendingReasons.has(file)) pending(pendingReasons.get(file));
  throw new Error('El flujo terminó sin producir esta captura.');
}

// Estrangula la CPU para poder fotografiar estados transitorios (análisis en curso).
async function withCpuThrottle(page, fn) {
  let cdp = null;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  } catch { cdp = null; }
  try {
    return await fn();
  } finally {
    if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => null);
  }
}

async function selectSeedEmployee(page) {
  const trigger = page.getByRole('button', { name: 'Empleado:', exact: true });
  if (!(await trigger.count())) return false;
  await trigger.first().click();
  await page.getByRole('option', { name: SEED_EMPLOYEE.nameRe }).first().click();
  await page.waitForTimeout(1500);
  return true;
}

async function openSeedCalendar(page) {
  await openApp(page);
  const ok = await selectSeedEmployee(page);
  if (!ok) throw new Error('No aparece el selector "Empleado:"; ¿existe Ana López (H-201) en la organización QA?');
  if (SEED_PREV_MONTH) {
    await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    await page.waitForTimeout(1200);
  }
}

async function openEquipo(page, tab = 'tab-personas') {
  await openApp(page);
  await page.getByTestId('sidebar-team').click();
  const team = dialog(page, 'Gestión de equipo');
  await team.waitFor();
  await page.getByTestId(tab).click();
  await page.waitForTimeout(1500);
  return team;
}

async function openSettings(page) {
  await openApp(page);
  await page.getByTestId('sidebar-settings').click();
  const settings = page.locator('.modal-content').filter({ has: page.getByRole('heading', { name: 'Ajustes', exact: true }) });
  await settings.waitFor();
  return settings;
}

async function openPlanner(page, date) {
  await page.goto(`${BASE}/app/schedule?date=${date}`, { waitUntil: 'domcontentloaded' });
  const planner = page.getByTestId('weekly-planner');
  await planner.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="weekly-planner"]')?.getAttribute('data-state') !== 'loading', null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  return planner;
}

async function schedules(page) {
  return (await api(page, '/api/schedules')).schedules ?? [];
}

// Semana en borrador (editable, con turnos) para las capturas de solo lectura del planificador.
async function pickDraftWeek(page) {
  const today = isoDate(TODAY);
  const drafts = (await schedules(page))
    .filter((s) => s.status === 'DRAFT' && s.periodEnd >= today)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return (drafts.find((s) => s.periodStart === '2026-10-12') ?? drafts[0])?.periodStart ?? null;
}

// ─── Fixtures sintéticas en tmp/manual-fixtures ─────────────────────────────
const FX = {
  gs03: path.join(FIXTURES_DIR, 'cuadrante-hotel-qa-octubre-2026.pdf'),
  gs10: path.join(FIXTURES_DIR, 'cuadrante-eva-octubre-2026.csv'),
  empty: path.join(FIXTURES_DIR, 'documento-sin-turnos.pdf'),
  employeesCsv: path.join(FIXTURES_DIR, 'empleados-demo.csv'),
  usersCsv: path.join(FIXTURES_DIR, 'usuarios-demo.csv'),
  usersErrorsCsv: path.join(FIXTURES_DIR, 'usuarios-con-errores.csv'),
  employeeResultCsv: path.join(FIXTURES_DIR, 'empleado-demo-manual.csv'),
};

function prepareFixtures() {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  copyFileSync(path.join(CORPUS, 'GS-03_hospitality', 'source.pdf'), FX.gs03);
  copyFileSync(path.join(CORPUS, 'GS-10_domain-edge-cases', 'source.csv'), FX.gs10);
  copyFileSync(path.join(CORPUS, '_negative', 'GN-03_empty-document', 'source.pdf'), FX.empty);
  writeFileSync(FX.employeesCsv, [
    'externalEmployeeId,name,area',
    'H-201,Ana López,',
    'DEMO-501,Lucía Demo,',
    'DEMO-502,Pablo Demo,',
  ].join('\n') + '\n');
  writeFileSync(FX.usersCsv, [
    'email,displayName,role,externalEmployeeId,locale',
    'lucia.demo@anclora.test,Lucía Demo,EMPLOYEE,,es',
    'pablo.demo@anclora.test,Pablo Demo,PLANNER,,es',
  ].join('\n') + '\n');
  writeFileSync(FX.usersErrorsCsv, [
    'email,displayName,role,externalEmployeeId,locale',
    'lucia.demo@anclora.test,Lucía Demo,EMPLOYEE,,es',
    ',Sin Correo Demo,EMPLOYEE,,es',
    'rol.invalido@anclora.test,Rol Inválido Demo,JEFE,,es',
    'idioma.invalido@anclora.test,Idioma Demo,EMPLOYEE,,fr',
  ].join('\n') + '\n');
  writeFileSync(FX.employeeResultCsv, ['externalEmployeeId,name,area', 'DEMO-MANUAL-01,Ficha Demo Manual,'].join('\n') + '\n');
}

// ─── Flujos compartidos ─────────────────────────────────────────────────────
// Importación de equipo GS-03. confirm=true solo en la siembra y si faltan empleados.
async function teamImportFlow(page, { confirm }) {
  log('  [team-import] abrir aplicación');
  await openApp(page);
  log('  [team-import] abrir importador');
  await page.getByTestId('sidebar-import').click();
  const modal = dialog(page, 'Importar cuadrante');
  await modal.waitFor();
  log('  [team-import] cargar fixture');
  await modal.locator('input[type="file"]').setInputFiles(FX.gs03);

  // Primera vez que se importa este formato en una organización: el asistente
  // de formato encadena preguntas (fila propia, códigos sin reconocer...)
  // antes de dejar continuar. Sin formato aprendido previo no hay forma de
  // saltarlo; se resuelven igual que lo haría un operador humano: la fila
  // sembrada (Ana López) como identidad, y cualquier código sin reconocer
  // (p.ej. «Recepción», una cabecera de área, no un turno) se ignora.
  const applyButton = modal.locator('button:visible').filter({ hasText: 'Aplicar y continuar' }).last();
  const selectAllButton = modal.locator('button:visible').filter({ hasText: 'Seleccionar todos' }).last();
  for (let i = 0; i < 10 && !(await selectAllButton.count()); i += 1) {
    const question = modal.locator('text=/¿.*\\?/').last();
    if (!(await question.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false))) break;
    const questionText = await question.textContent();
    log(`  [team-import] resolver pregunta ${i + 1}: ${questionText}`);
    if (questionText?.includes('eres tú')) {
      await modal.locator('button:visible').filter({ hasText: SEED_EMPLOYEE.nameRe }).last().click({ timeout: 8_000, force: true });
    } else {
      const ignoreOption = modal.locator('button:visible').filter({ hasText: 'Ignorar este código o color' }).last();
      if (await ignoreOption.count()) await ignoreOption.click({ timeout: 8_000, force: true });
      else pending(`Asistente de formato con pregunta inesperada: ${questionText}`);
    }
    await page.waitForTimeout(1_200);
    // A veces la app avanza sola tras resolver la última pregunta y el botón
    // desaparece antes de que lleguemos a pulsarlo: un intento corto que se
    // ignora si no lo encuentra, en vez de esperar (hasta 20s por defecto) a
    // que un botón que ya no va a aparecer se quede "habilitado".
    await applyButton.click({ timeout: 8_000, force: true }).catch(() => {});
  }

  log('  [team-import] esperar selección de empleados');
  await selectAllButton.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);
  await maybe('team-import-dark.png', () => shotEl(modal, 'team-import-dark.png'));

  if (confirm) {
    const bulk = modal.getByRole('button', { name: /^Crear \d+ empleados nuevos$/ });
    if (await bulk.count()) {
      await bulk.click();
      await modal.getByRole('button', { name: /^Crear \d+ empleados$/ }).click();
      await modal.getByText(/\d+ creados ·/).waitFor({ timeout: 60_000 });
      seedLog.push({ action: 'crear empleados GS-03 (en bloque)', result: 'ok' });
    }
    // Respaldo: filas que sigan como «Nuevo» se crean una a una.
    for (let i = 0; i < 5; i += 1) {
      const rowCreate = modal.getByRole('button', { name: 'Crear', exact: true });
      if (!(await rowCreate.count())) break;
      await rowCreate.first().click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Crear', exact: true }).click();
      await page.waitForTimeout(2000);
    }
  }

  await modal.getByRole('button', { name: 'Seleccionar todos', exact: true }).click();
  await modal.getByRole('button', { name: 'Continuar', exact: true }).click();
  await modal.getByRole('heading', { name: 'Resumen antes de importar' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await maybe('team-preview-dark.png', () => shotEl(modal, 'team-preview-dark.png'));

  const draftOption = modal.getByLabel('Importar históricos y añadir los futuros a planificación en borrador');
  if (await draftOption.count()) {
    await draftOption.check();
    await maybe('future-decision-dark.png', () => shotPage(page, 'future-decision-dark.png'));
  } else {
    pendingReasons.set('future-decision-dark.png', 'El resumen no mostró la decisión sobre fechas futuras (¿no quedan turnos nuevos?).');
  }

  const importButton = modal.getByRole('button', { name: 'Importar', exact: true });
  if (confirm && await importButton.isEnabled()) {
    await importButton.click();
    await modal.getByRole('heading', { name: 'Importación completada' }).waitFor({ timeout: 180_000 });
    await maybe('import-success-dark.png', () => shotEl(modal, 'import-success-dark.png'));
    seedLog.push({ action: 'importar GS-03 con futuros en borrador', result: 'ok' });
  } else {
    pendingReasons.set('import-success-dark.png', 'La importación GS-03 ya estaba sembrada (o --no-seed): el resultado solo aparece al importar por primera vez. Se conserva la captura existente.');
  }
  await modal.getByRole('button', { name: 'Cerrar' }).first().click().catch(() => page.keyboard.press('Escape'));
}

// Importador individual como invitado (nunca guarda turnos).
async function openGuestImporter(page) {
  await openApp(page);
  await page.getByTestId('sidebar-import').click();
  const modal = dialog(page, 'Importar cuadrante');
  await modal.waitFor();
  return modal;
}

async function setImportPeriod(page, modal, monthName, year) {
  const triggers = modal.locator('.modal-select-trigger');
  await triggers.nth(0).click();
  await page.getByRole('option', { name: monthName, exact: true }).click();
  await triggers.nth(1).click();
  await page.getByRole('option', { name: String(year), exact: true }).click();
}

// Resuelve el asistente sin guardar formato: ignora códigos y aplica.
async function resolveAssistant(page) {
  const assistant = page.locator('section[aria-label="Asistente de formato"]');
  if (!(await assistant.count())) return;
  log('  [assistant] resolver formato individual');
  const save = assistant.getByLabel('Guardar este formato para próximos meses');
  if (await save.count() && await save.isChecked()) await save.uncheck();
  const ignores = assistant.locator('button:visible').filter({ hasText: 'Ignorar este código o color' });
  const total = await ignores.count();
  log(`  [assistant] ignorar ${total} códigos`);
  for (let i = 0; i < total; i += 1) await ignores.nth(i).click({ force: true });
  await page.waitForTimeout(500);
  const apply = assistant.locator('button:visible').filter({ hasText: 'Aplicar y continuar' }).last();
  log('  [assistant] aplicar y continuar');
  // Igual que en teamImportFlow: un intento corto que se ignora si el botón
  // ya no está (la app pudo avanzar sola), en vez de fiarse de un único
  // isEnabled() comprobado antes de que el re-render de React lo refleje.
  await apply.click({ timeout: 8_000, force: true }).catch(() => {});
  await assistant.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(1500);
}

// ─── Siembra (solo organización QA) ─────────────────────────────────────────
async function seedPhase(page) {
  log('\n▶ Siembra en la organización QA (idempotente)');

  // (a) Importación de equipo GS-03 (confirma solo si faltan H-201/H-202/H-301).
  try {
    const employees = (await api(page, '/api/employees')).employees ?? [];
    const present = new Set(employees.map((e) => e.externalEmployeeId));
    const seeded = GS03_IDS.every((id) => present.has(id));
    if (seeded) seedLog.push({ action: 'importación GS-03', result: 'no se confirma: H-201/H-202/H-301 ya existen' });
    await runGroup('team-import', () => teamImportFlow(page, { confirm: !seeded }));
  } catch (error) {
    seedLog.push({ action: 'importación GS-03', result: 'error', error: shortError(error) });
    // Un fallo a mitad de la importación deja el modal abierto y bloquea
    // todas las capturas siguientes en esta misma página (mismo contexto
    // reutilizado). Se cierra explícitamente antes de continuar.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // (b) 3 turnos manuales en un día pasado para Ana López.
  try {
    const employees = (await api(page, '/api/employees')).employees ?? [];
    const ana = employees.find((e) => e.externalEmployeeId === SEED_EMPLOYEE.externalId);
    if (!ana) throw new Error('No existe H-201 (Ana López); la importación GS-03 no se completó.');
    const dayShifts = async () => ((await api(page, `/api/shifts?employeeId=${encodeURIComponent(ana.id)}`)).shifts ?? [])
      .filter((s) => String(s.date).slice(0, 10) === SEED_DATE);
    const existing = await dayShifts();
    const missing = SEED_SHIFTS.filter((seed) => !existing.some((s) => String(s.startTime).slice(0, 5) === seed.start));
    if (missing.length === 0) {
      seedLog.push({ action: `3 turnos manuales ${SEED_DATE}`, result: 'omitido: ya existen' });
    } else {
      if (existing.length > 0) seedLog.push({ action: `turnos manuales ${SEED_DATE}`, result: `hay ${existing.length} turnos previos; se añaden solo los que faltan` });
      await openSeedCalendar(page);
      for (const seed of missing) {
        await page.getByTestId('sidebar-add-shift').click();
        const modal = dialog(page, 'Programar Turno');
        await modal.waitFor();
        await modal.locator('input[type="date"]').fill(SEED_DATE);
        await modal.getByRole('button', { name: 'Tipo', exact: true }).click();
        await page.getByRole('option', { name: seed.type, exact: true }).click();
        const times = modal.locator('input[type="time"]');
        await times.nth(0).fill(seed.start);
        await times.nth(1).fill(seed.end);
        await modal.getByRole('button', { name: 'Confirmar' }).click();
        await modal.waitFor({ state: 'hidden', timeout: 30_000 });
        await page.waitForTimeout(1200);
      }
      seedLog.push({ action: `turnos manuales ${SEED_DATE} (Ana López)`, result: `ok: ${(await dayShifts()).length} turnos ese día` });
    }
  } catch (error) {
    seedLog.push({ action: `turnos manuales ${SEED_DATE}`, result: 'error', error: shortError(error) });
  }

  // (c) Publicar la semana del 5-oct-2026 (si no lo está ya).
  try {
    const week = (await schedules(page)).find((s) => s.periodStart === PLANNER_WEEK);
    if (week?.status === 'PUBLISHED') {
      seedLog.push({ action: `publicar semana ${PLANNER_WEEK}`, result: 'omitido: ya publicada' });
    } else {
      const planner = await openPlanner(page, PLANNER_WEEK);
      const createDraft = planner.getByRole('button', { name: 'Crear borrador semanal' });
      if (await createDraft.count()) {
        await createDraft.click();
        await page.waitForTimeout(2500);
        seedLog.push({ action: `crear borrador ${PLANNER_WEEK}`, result: 'ok' });
      }
      const publish = planner.getByRole('button', { name: 'Publicar', exact: true });
      if (await publish.count() && !(await publish.isEnabled())) {
        // Borrador vacío: se añade un turno Regular 09:00–17:00 por defecto.
        await planner.locator('.weekly-planner__add-cell').first().click();
        const editor = dialog(page, 'Añadir turno');
        await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
        await editor.waitFor({ state: 'hidden', timeout: 30_000 });
      }
      await publish.click();
      const confirmDialog = dialog(page, 'Publicar planificación');
      await confirmDialog.waitFor();
      await confirmDialog.getByRole('button', { name: 'Confirmar publicación', exact: true }).click();
      await confirmDialog.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => null);
      const after = (await schedules(page)).find((s) => s.periodStart === PLANNER_WEEK);
      seedLog.push({ action: `publicar semana ${PLANNER_WEEK}`, result: after?.status === 'PUBLISHED' ? 'ok' : `estado final ${after?.status ?? 'desconocido'}` });
    }
  } catch (error) {
    seedLog.push({ action: `publicar semana ${PLANNER_WEEK}`, result: 'error', error: shortError(error) });
  }

  for (const entry of seedLog) log(`  · ${entry.action}: ${entry.result}${entry.error ? ` — ${entry.error}` : ''}`);
}

// ─── Pantallas ──────────────────────────────────────────────────────────────
const NO_EMPLOYEE = 'Sin identidad QA con rol EMPLOYEE: crearla exige aceptar una invitación que llega por correo y @anclora.test no puede recibir correo.';

const screens = [
  // Invitado
  { file: 'hero-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await shotPage(page, 'hero-dark.png');
  } },
  { file: 'login-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    await page.goto(`${BASE}/login`, { waitUntil: 'load' });
    await shotEl(page.locator('.auth-card'), 'login-dark.png');
  } },
  { file: 'signup-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    await page.goto(`${BASE}/signup`, { waitUntil: 'load' });
    // Solo nombre y correo sintéticos; las contraseñas quedan vacías y no se envía nada.
    await page.locator('#auth-name').fill('Marta Demo');
    await page.locator('#auth-email').fill('marta.demo@anclora.test');
    await shotEl(page.locator('.auth-card'), 'signup-dark.png');
  } },
  { file: 'onboarding-choice-dark.png', role: 'guest', mode: 'pending', reason: 'Requiere registrar una cuenta adicional sin organización (no permitido).' },
  { file: 'guest-empty-calendar-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    await openApp(page);
    await shotPage(page, 'guest-empty-calendar-dark.png');
  } },
  { file: 'accept-invitation-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    await page.goto(`${BASE}/accept-invitation`, { waitUntil: 'load' });
    await page.getByTestId('accept-invitation-screen').waitFor();
    await shotPage(page, 'accept-invitation-dark.png');
  } },
  { file: 'pricing-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    await page.goto(`${BASE}/pricing`, { waitUntil: 'load' });
    await shotPage(page, 'pricing-dark.png');
  } },
  { file: 'cookies-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest', 'desktop', { consent: false });
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.getByRole('dialog', { name: 'Preferencias de cookies' }).waitFor();
    await shotPage(page, 'cookies-dark.png');
  } },

  // Importador individual (invitado, GS-10; no se guarda nada)
  ...['import-upload-dark.png', 'import-file-selected-dark.png', 'import-processing-dark.png', 'import-assistant-dark.png'].map((file) => ({
    file, role: 'guest', mode: 'auto', run: async () => {
      await runGroup('guest-import-gs10', async () => {
        const page = await getPage('guest');
        const modal = await openGuestImporter(page);
        await setImportPeriod(page, modal, 'Octubre', 2026);
        await maybe('import-upload-dark.png', () => shotEl(modal, 'import-upload-dark.png'));
        await modal.locator('input[type="file"]').setInputFiles(FX.gs10);
        await page.waitForTimeout(800);
        await maybe('import-file-selected-dark.png', () => shotPage(page, 'import-file-selected-dark.png'));
        await withCpuThrottle(page, async () => {
          await modal.getByRole('button', { name: 'Procesar archivo' }).click();
          await page.waitForTimeout(250);
          await maybe('import-processing-dark.png', () => shotEl(modal, 'import-processing-dark.png'));
        });
        const assistant = page.locator('section[aria-label="Asistente de formato"]');
        const asked = await assistant.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
        if (asked) await maybe('import-assistant-dark.png', () => shotPage(page, 'import-assistant-dark.png'));
        else pendingReasons.set('import-assistant-dark.png', 'GS-10 no generó preguntas del asistente en este análisis.');
        await modal.getByRole('button', { name: 'Cerrar importación' }).click().catch(() => null);
      });
      requireCaptured(file);
    },
  })),
  { file: 'employee-matching-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    const modal = await openGuestImporter(page);
    await setImportPeriod(page, modal, 'Octubre', 2026);
    await modal.locator('input[type="file"]').setInputFiles(FX.gs03);
    await modal.getByRole('button', { name: 'Procesar archivo' }).click();
    await page.getByText('¿Cuál de estas filas eres tú?').waitFor({ timeout: 60_000 });
    await shotPage(page, 'employee-matching-dark.png');
    await modal.getByRole('button', { name: 'Cerrar importación' }).click().catch(() => null);
  } },
  { file: 'import-unsupported-dark.png', role: 'guest', mode: 'auto', run: async () => {
    const page = await getPage('guest');
    const modal = await openGuestImporter(page);
    await modal.locator('input[type="file"]').setInputFiles(FX.empty);
    await modal.getByRole('button', { name: 'Procesar archivo' }).click();
    await modal.getByTestId('import-diagnostics').waitFor({ timeout: 60_000 }).catch(() => null);
    await page.waitForTimeout(1500);
    await shotEl(modal, 'import-unsupported-dark.png');
    await modal.getByRole('button', { name: 'Cerrar importación' }).click().catch(() => null);
  } },

  // Calendario (admin)
  { file: 'calendar-month-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openSeedCalendar(page);
    await shotPage(page, 'calendar-month-dark.png');
  } },
  { file: 'day-more-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openSeedCalendar(page);
    const more = page.getByTestId(`day-more-btn-${SEED_DATE}`);
    if (!(await more.count())) pending(`El día ${SEED_DATE} no tiene más de 2 turnos (¿siembra omitida o fallida?).`);
    await more.scrollIntoViewIfNeeded();
    await shotEl(page.locator('.calendar-stage'), 'day-more-dark.png');
  } },
  { file: 'day-detail-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openSeedCalendar(page);
    const more = page.getByTestId(`day-more-btn-${SEED_DATE}`);
    if (!(await more.count())) pending(`El día ${SEED_DATE} no tiene más de 2 turnos (¿siembra omitida o fallida?).`);
    await more.click();
    const detail = page.getByRole('dialog').filter({ has: page.getByTestId('day-detail-dialog') });
    await shotEl(detail, 'day-detail-dark.png');
    await page.getByTestId('close-day-detail-modal').click();
  } },
  { file: 'sidebar-collapsed-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openSeedCalendar(page);
    await page.getByTestId('sidebar-collapse').click();
    await page.waitForTimeout(600);
    await shotPage(page, 'sidebar-collapsed-dark.png');
    await page.getByTestId('sidebar-collapse').click(); // se deja expandida
  } },
  { file: 'calendar-mobile-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin', 'mobile');
    await openApp(page);
    await selectSeedEmployee(page).catch(() => false);
    await shotPage(page, 'calendar-mobile-dark.png');
  } },
  { file: 'manual-create-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openSeedCalendar(page);
    await page.getByTestId('sidebar-add-shift').click();
    const modal = dialog(page, 'Programar Turno');
    await modal.locator('input[type="date"]').fill(SEED_DATE);
    await shotEl(modal, 'manual-create-dark.png');
    await modal.getByRole('button', { name: 'Cerrar' }).click(); // sin confirmar
  } },

  // Importación de equipo (producida en la siembra o, con --no-seed, en solo lectura)
  ...['team-import-dark.png', 'team-preview-dark.png', 'future-decision-dark.png', 'import-success-dark.png'].map((file) => ({
    file, role: 'admin', mode: 'auto', run: async () => {
      await runGroup('team-import', async () => teamImportFlow(await getPage('admin'), { confirm: CONFIRM_TEAM_IMPORT }));
      requireCaptured(file);
    },
  })),
  // Importador individual como admin (GS-10, un empleado); se cierra SIN confirmar.
  ...['import-preview-dark.png', 'preview-edit-dark.png', 'preview-delete-dark.png'].map((file) => ({
    file, role: 'admin', mode: 'auto', run: async () => {
      await runGroup('admin-import-gs10', async () => {
        const page = await getPage('admin');
        log('  [admin-import] abrir aplicación');
        await openApp(page);
        log('  [admin-import] abrir importador');
        await page.getByTestId('sidebar-import').click();
        log('  [admin-import] cargar fixture');
        await dialog(page, 'Importar cuadrante').locator('input[type="file"]').setInputFiles(FX.gs10);
        // Un solo empleado: la app cambia al importador individual y analiza automáticamente.
        const modal = page.locator('.import-modal[role="dialog"]');
        await modal.waitFor({ timeout: 60_000 });
        await page.locator('section[aria-label="Asistente de formato"]').or(modal.getByTestId('import-quality-state')).first().waitFor({ timeout: 60_000 });
        await resolveAssistant(page);
        await modal.getByTestId('import-quality-state').waitFor({ timeout: 60_000 });
        await maybe('import-preview-dark.png', () => shotPage(page, 'import-preview-dark.png'));
        const endInput = modal.getByLabel(/^Hora de fin, turno /).first();
        await endInput.fill('07:00');
        await endInput.blur();
        await maybe('preview-edit-dark.png', () => shotPage(page, 'preview-edit-dark.png'));
        await modal.getByRole('button', { name: /^Eliminar turno / }).first().click();
        await maybe('preview-delete-dark.png', () => shotPage(page, 'preview-delete-dark.png'));
        await modal.getByRole('button', { name: 'Cerrar importación' }).click();
      });
      requireCaptured(file);
    },
  })),

  // Formatos aprendidos
  { file: 'format-profiles-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const modal = await openFormats(await getPage('admin'));
    await shotEl(modal, 'format-profiles-dark.png');
  } },
  { file: 'format-history-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const modal = await openFormats(await getPage('admin'));
    const versions = modal.getByRole('button', { name: /^Ver versiones anteriores/ });
    if (!(await versions.count())) pending('Ningún formato QA tiene versiones anteriores.');
    await versions.first().click();
    await shotEl(modal, 'format-history-dark.png');
  } },
  { file: 'format-rename-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const modal = await openFormats(await getPage('admin'));
    await modal.getByRole('button', { name: 'Renombrar', exact: true }).first().click();
    await modal.getByLabel('Nuevo nombre').fill('Recepción mensual');
    await shotEl(modal, 'format-rename-dark.png');
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click(); // no se guarda
  } },

  // Historial de importaciones
  { file: 'history-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const modal = await openHistory(await getPage('admin'));
    await shotEl(modal, 'history-dark.png');
  } },
  { file: 'history-filters-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const modal = await openHistory(page);
    await modal.getByLabel('Estado', { exact: true }).selectOption('completed');
    await page.waitForTimeout(1500);
    await shotEl(modal, 'history-filters-dark.png');
  } },
  { file: 'history-delete-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const modal = await openHistory(page);
    const del = modal.getByRole('button', { name: 'Eliminar importación', exact: true });
    if (!(await del.count())) pending('No hay importaciones activas en el historial QA.');
    await del.first().click();
    const confirmDialog = page.getByRole('alertdialog', { name: 'Confirmar eliminación' });
    await shotEl(confirmDialog, 'history-delete-dark.png');
    await page.locator('#confirm-dialog-cancel').click(); // Nunca se confirma.
  } },
  { file: 'history-deleted-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openApp(page);
    const deleted = await api(page, '/api/imports?status=deleted&pageSize=1');
    if (!deleted.total) pending('Destructivo: solo se captura si ya existe una importación eliminada en el historial QA, y no hay ninguna.');
    const modal = await openHistory(page);
    await modal.getByLabel('Estado', { exact: true }).selectOption('deleted');
    await page.waitForTimeout(1500);
    await shotEl(modal, 'history-deleted-dark.png');
  } },

  // Planificador (/app/schedule)
  { file: 'planner-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openApp(page);
    await openPlanner(page, (await pickDraftWeek(page)) ?? PLANNER_WEEK);
    await shotPage(page, 'planner-dark.png');
  } },
  { file: 'planner-responsive-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin', 'narrow');
    await openApp(page);
    await openPlanner(page, (await pickDraftWeek(page)) ?? PLANNER_WEEK);
    await page.getByTestId('planner-overflow-hint').waitFor().catch(() => null);
    await shotPage(page, 'planner-responsive-dark.png');
  } },
  { file: 'planner-assignment-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openApp(page);
    const week = await pickDraftWeek(page);
    if (!week) pending('No hay ninguna semana en borrador editable en la organización QA.');
    const planner = await openPlanner(page, week);
    const add = planner.locator('.weekly-planner__add-cell');
    if (!(await add.count())) pending(`La semana ${week} no tiene celdas libres para abrir el editor.`);
    await add.first().click();
    const editor = dialog(page, 'Añadir turno');
    await shotEl(editor, 'planner-assignment-dark.png');
    await editor.getByRole('button', { name: 'Cancelar', exact: true }).click(); // sin guardar
  } },
  { file: 'publish-confirmation-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openApp(page);
    const week = await pickDraftWeek(page);
    if (!week) pending('No hay ninguna semana en borrador con turnos para abrir el diálogo de publicación.');
    const planner = await openPlanner(page, week);
    const publish = planner.getByRole('button', { name: 'Publicar', exact: true });
    if (!(await publish.count()) || !(await publish.isEnabled())) pending(`La semana ${week} no se puede publicar (sin turnos).`);
    await publish.click();
    const modal = dialog(page, 'Publicar planificación');
    await shotEl(modal, 'publish-confirmation-dark.png');
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click(); // solo lectura
  } },
  { file: 'planner-published-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await requirePublishedWeek(page);
    await openPlanner(page, PLANNER_WEEK);
    await shotPage(page, 'planner-published-dark.png');
  } },
  { file: 'planner-history-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await requirePublishedWeek(page);
    const planner = await openPlanner(page, PLANNER_WEEK);
    await planner.getByRole('button', { name: 'Historial de versiones', exact: true }).click();
    const modal = dialog(page, 'Historial de planificación');
    await modal.getByText('Cargando historial…').waitFor({ state: 'hidden' }).catch(() => null);
    await shotEl(modal, 'planner-history-dark.png');
  } },

  // Empleado y solicitudes
  { file: 'employee-calendar-dark.png', role: 'admin', mode: 'pending', reason: NO_EMPLOYEE },
  { file: 'employee-detail-dark.png', role: 'admin', mode: 'pending', reason: NO_EMPLOYEE },
  { file: 'request-new-dark.png', role: 'admin', mode: 'pending', reason: NO_EMPLOYEE },
  { file: 'request-pending-dark.png', role: 'admin', mode: 'pending', reason: NO_EMPLOYEE },
  { file: 'request-reject-dark.png', role: 'admin', mode: 'pending', reason: `${NO_EMPLOYEE} Sin una solicitud de un empleado no hay nada que rechazar.` },
  { file: 'requests-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openApp(page);
    await page.getByTestId('sidebar-approvals').click();
    const modal = dialog(page, 'Solicitudes');
    await modal.getByTestId('approval-inbox').or(modal.getByTestId('approval-inbox-empty')).first().waitFor({ timeout: 30_000 });
    await shotEl(modal, 'requests-dark.png');
    return (await modal.getByTestId('approval-inbox-empty').count()) ? 'Capturada la bandeja vacía (no hay solicitudes de empleados).' : undefined;
  } },

  // Equipo
  { file: 'equipo-personas-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const team = await openEquipo(await getPage('admin'), 'tab-personas');
    await shotEl(team, 'equipo-personas-dark.png');
  } },
  { file: 'pending-invitations-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    await openEquipo(page, 'tab-personas');
    const count = Number((await page.getByTestId('pending-invitations-badge').innerText()).trim()) || 0;
    if (count === 0) pending('No hay invitaciones pendientes y crear una enviaría un correo real de invitación.');
    await page.getByTestId('pending-invitations-button').click();
    const modal = page.getByRole('dialog').filter({ has: page.getByTestId('pending-invitations-modal') });
    await shotEl(modal, 'pending-invitations-dark.png');
    await page.getByTestId('close-pending-invitations-modal').click(); // sin reenviar ni revocar
  } },
  { file: 'team-add-person-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    log('  [team-add] abrir equipo');
    await openEquipo(page, 'tab-personas');
    log('  [team-add] abrir alta');
    const addPerson = page.locator('[data-testid="add-persona-button"]:visible').last();
    await addPerson.scrollIntoViewIfNeeded();
    await addPerson.click({ force: true });
    log('  [team-add] rellenar nombre');
    const wizard = page.getByTestId('add-persona-wizard');
    await page.getByTestId('wizard-name-input').fill('Marta Demo');
    log('  [team-add] nombre rellenado');
    await shotEl(wizard, 'team-add-person-dark.png');
    log('  [team-add] captura lista');
    await page.keyboard.press('Escape');
  } },
  { file: 'grant-access-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const team = await openEquipo(page, 'tab-personas');
    await page.waitForTimeout(2500);
    const grant = team.getByRole('button', { name: 'Conceder acceso', exact: true });
    if (!(await grant.count())) pending('No hay fichas sin acceso en la primera página de Personas.');
    await grant.first().scrollIntoViewIfNeeded();
    await grant.first().click({ force: true });
    const modal = page.getByRole('dialog', { name: /^Conceder acceso a / });
    await page.getByTestId('grant-access-email-input').fill('ana.lopez.demo@anclora.test');
    await shotEl(modal, 'grant-access-dark.png');
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click(); // no se envía invitación
  } },
  { file: 'equipo-roles-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const team = await openEquipo(await getPage('admin'), 'tab-roles');
    await shotEl(team, 'equipo-roles-dark.png');
  } },
  { file: 'planner-scope-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const team = await openEquipo(page, 'tab-roles');
    const manage = team.locator('[data-testid^="manage-scope-"]');
    if (await manage.count()) {
      await manage.first().click();
      const modal = page.getByRole('dialog', { name: /^Cambiar rol de / });
      await shotEl(modal, 'planner-scope-dark.png');
      await modal.getByRole('button', { name: 'Cancelar', exact: true }).click(); // sin guardar
      return undefined;
    }
    await page.getByTestId('tab-assignments').click();
    await page.getByTestId('subtab-planner-scopes').click();
    await page.waitForTimeout(1000);
    await shotEl(team, 'planner-scope-dark.png');
    return 'No hay PLANIFICADOR en la organización QA: se capturó la subpestaña «Planificadores → Ámbitos».';
  } },
  { file: 'equipo-areas-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const team = await openEquipo(await getPage('admin'), 'tab-areas');
    await shotEl(team, 'equipo-areas-dark.png');
  } },
  { file: 'equipo-asignaciones-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const team = await openEquipo(page, 'tab-assignments');
    await page.getByTestId('subtab-employees-to-area').click();
    await page.waitForTimeout(800);
    await shotEl(team, 'equipo-asignaciones-dark.png');
  } },
  { file: 'ownership-transfer-dark.png', role: 'admin', mode: 'auto', run: async () => {
    if (QA.role !== 'OWNER') pending(`El rol QA es ${QA.role}; solo el propietario ve «Transferir propiedad».`);
    const page = await getPage('admin');
    await openEquipo(page, 'tab-roles');
    await page.getByTestId('transfer-ownership-button').click();
    const modal = dialog(page, 'Transferir la propiedad de la organización');
    await shotEl(modal, 'ownership-transfer-dark.png');
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click(); // Nunca se confirma.
  } },

  // CSV masivo (solo vistas previas; nunca se confirma salvo la opción explícita de bulk-result)
  { file: 'bulk-employees-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const { page, modal } = await openBulk('employees', FX.employeesCsv);
    await shotEl(modal, 'bulk-employees-dark.png');
    await closeBulk(page, modal);
  } },
  { file: 'bulk-users-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const { page, modal } = await openBulk('users', FX.usersCsv);
    await shotEl(modal, 'bulk-users-dark.png');
    await closeBulk(page, modal); // Confirmar enviaría invitaciones reales.
  } },
  { file: 'bulk-errors-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const { page, modal } = await openBulk('users', FX.usersErrorsCsv);
    await shotEl(modal, 'bulk-errors-dark.png');
    await closeBulk(page, modal);
  } },
  { file: 'bulk-result-dark.png', role: 'admin', mode: 'auto', run: async () => {
    // Las filas «Sin cambios» no son procesables (Confirmar queda desactivado): no existe un
    // resultado sin escritura. Opcional y explícito: crear UNA ficha sintética DEMO-MANUAL-01.
    if (process.env.MANUAL_ALLOW_BULK_EMPLOYEE_RESULT !== '1') {
      pending('No hay resultado CSV sin escritura: las filas «Sin cambios» no se pueden confirmar. Con MANUAL_ALLOW_BULK_EMPLOYEE_RESULT=1 se crea una ficha sintética (DEMO-MANUAL-01) para capturarlo.');
    }
    const { page, modal } = await openBulk('employees', FX.employeeResultCsv);
    const confirmButton = modal.getByRole('button', { name: 'Confirmar importación', exact: true });
    if (!(await confirmButton.isEnabled())) {
      await closeBulk(page, modal);
      pending('DEMO-MANUAL-01 ya existe (fila sin cambios); se conserva la captura existente.');
    }
    await confirmButton.click();
    await modal.getByRole('heading', { name: 'Resultado' }).waitFor({ timeout: 60_000 });
    await shotEl(modal, 'bulk-result-dark.png');
    seedLog.push({ action: 'ficha sintética DEMO-MANUAL-01 (bulk-result)', result: 'ok' });
    await closeBulk(page, modal);
  } },

  // Ajustes
  { file: 'settings-profile-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Perfil', exact: true }).click().catch(() => null);
    await shotEl(settings, 'settings-profile-dark.png');
    await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
  } },
  { file: 'settings-shifttypes-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Tipos de turno', exact: true }).click();
    await shotEl(settings, 'settings-shifttypes-dark.png');
    await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
  } },
  { file: 'settings-danger-dark.png', role: 'admin', mode: 'auto', run: async () => {
    const page = await getPage('admin');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Equipo', exact: true }).click();
    await settings.getByRole('button', { name: 'Restaurar estado inicial', exact: true }).click();
    const modal = dialog(page, 'Restaurar organización');
    await shotEl(modal, 'settings-danger-dark.png');
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click(); // Nunca se escribe RESTABLECER.
  } },
];

// ─── Ayudantes de pantallas ─────────────────────────────────────────────────
async function openFormats(page) {
  await openApp(page);
  await page.getByTestId('sidebar-formats').click();
  const modal = dialog(page, 'Formatos aprendidos');
  await modal.waitFor();
  await modal.getByText('Cargando…').waitFor({ state: 'hidden' }).catch(() => null);
  await page.waitForTimeout(800);
  if (await modal.getByText('Todavía no se ha aprendido ningún formato').count()) pending('La organización QA no tiene formatos aprendidos.');
  return modal;
}

async function openHistory(page) {
  await openApp(page);
  await page.getByTestId('sidebar-history').click();
  const modal = dialog(page, 'Historial de importaciones');
  await modal.waitFor();
  await modal.getByText('Cargando historial…').waitFor({ state: 'hidden' }).catch(() => null);
  await page.waitForTimeout(800);
  return modal;
}

async function requirePublishedWeek(page) {
  await openApp(page);
  const week = (await schedules(page)).find((s) => s.periodStart === PLANNER_WEEK);
  if (week?.status !== 'PUBLISHED') pending(`La semana ${PLANNER_WEEK} no está publicada (¿siembra omitida o fallida?).`);
}

async function openBulk(kind, csvPath) {
  const page = await getPage('admin');
  await openEquipo(page, 'tab-personas');
  await page.getByTestId(kind === 'employees' ? 'bulk-import-employees-button' : 'bulk-import-users-button').click();
  const modal = dialog(page, kind === 'employees' ? 'Importar empleados desde CSV' : 'Importar usuarios y accesos desde CSV');
  await modal.waitFor();
  await page.locator(`#bulk-file-${kind}`).setInputFiles(csvPath);
  await modal.getByRole('heading', { name: 'Vista previa' }).waitFor();
  await page.waitForTimeout(600);
  return { page, modal };
}

async function closeBulk(page, modal) {
  const cancel = modal.getByRole('button', { name: 'Cancelar', exact: true });
  if (await cancel.count()) await cancel.click();
  else await page.keyboard.press('Escape');
}

// ─── Ejecución ──────────────────────────────────────────────────────────────
function printList() {
  log('Modo     Rol    Archivo');
  for (const screen of screens) {
    log(`${screen.mode.padEnd(8)} ${screen.role.padEnd(6)} ${screen.file}${screen.reason ? `  — ${screen.reason}` : ''}`);
  }
}

async function main() {
  if (LIST) { printList(); return; }
  if (ONLY) {
    const unknown = [...ONLY].filter((file) => !screens.some((s) => s.file === file));
    if (unknown.length) throw new Error(`Capturas desconocidas en --only: ${unknown.join(', ')} (usa --list).`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(DEBUG_DIR, { recursive: true });
  prepareFixtures();

  chromium = await loadChromium();
  log(`▶ Destino: ${BASE}`);
  QA = await ensureAuth();
  log(`▶ Organización QA: ${QA.orgName ?? '(sin nombre)'} · id ${QA.orgId} · rol ${QA.role}`);
  log(`▶ Día pasado para los turnos de ejemplo: ${SEED_DATE}`);

  browser = await launchBrowser(true);
  const results = [];
  try {
    if (!NO_SEED) {
      const page = await getPage('admin');
      await openApp(page);
      await seedPhase(page);
    } else {
      log('\n▶ Siembra omitida (--no-seed)');
    }

    log('\n▶ Capturas');
    for (const screen of screens.filter((s) => want(s.file))) {
      if (screen.mode === 'pending') {
        results.push({ file: screen.file, status: 'pending', reason: screen.reason });
        log(`  … ${screen.file} — pendiente: ${screen.reason}`);
        continue;
      }
      lastPage = null;
      try {
        const note = await screen.run();
        results.push({ file: screen.file, status: 'ok', ...(note ? { reason: note } : {}) });
        log(`  ✓ ${screen.file}${note ? ` — ${note}` : ''}`);
      } catch (error) {
        if (error instanceof Pending) {
          results.push({ file: screen.file, status: 'pending', reason: error.message });
          log(`  … ${screen.file} — pendiente: ${error.message}`);
          continue;
        }
        results.push({ file: screen.file, status: 'failed', error: shortError(error) });
        log(`  ✗ ${screen.file} — ${shortError(error)}`);
        if (lastPage) await lastPage.screenshot({ path: path.join(DEBUG_DIR, screen.file) }).catch(() => null);
      }
    }
  } finally {
    await browser.close().catch(() => null);
  }

  writeFileSync(LOG_PATH, JSON.stringify({
    base: BASE,
    qa: { email: QA_EMAIL, orgId: QA.orgId, role: QA.role },
    seedDate: SEED_DATE,
    seed: seedLog,
    results,
    finishedAt: new Date().toISOString(),
  }, null, 2));

  // Resumen
  const count = (status) => results.filter((r) => r.status === status).length;
  log('\n┌──────────┬────────┐');
  log(`│ ok       │ ${String(count('ok')).padStart(6)} │`);
  log(`│ pending  │ ${String(count('pending')).padStart(6)} │`);
  log(`│ failed   │ ${String(count('failed')).padStart(6)} │`);
  log('└──────────┴────────┘');
  for (const r of results.filter((x) => x.status !== 'ok')) log(`  ${r.status.padEnd(8)} ${r.file.padEnd(34)} ${r.reason ?? r.error ?? ''}`);
  if (seedLog.length) {
    log('\nSiembra:');
    for (const entry of seedLog) log(`  · ${entry.action}: ${entry.result}${entry.error ? ` — ${entry.error}` : ''}`);
  }
  log(`\nRegistro: ${path.relative(root, LOG_PATH)} · Depuración: ${path.relative(root, DEBUG_DIR)}/`);
  if (count('failed') > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n✗ ${shortError(error)}`);
  process.exit(1);
});
