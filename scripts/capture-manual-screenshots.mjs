/**
 * Captura pantallazos reales para el manual de usuario, contra la
 * aplicación local (`vercel dev`) con datos de demostración sintéticos
 * sembrados por scripts/seed-manual-demo.mjs.
 *
 * Uso:
 *   node --env-file=.env.development.local scripts/seed-manual-demo.mjs
 *   npx vercel dev --listen 3199
 *   node scripts/capture-manual-screenshots.mjs
 *
 * Reutiliza el playwright-core ya instalado en qa/e2e-acceptance/node_modules
 * (Chromium de Playwright) — no añade una dependencia nueva al repo.
 */
import { chromium } from '../qa/e2e-acceptance/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'docs', 'manual', 'screenshots');
const BASE = process.env.MANUAL_APP_URL ?? 'http://localhost:3199';
const W = 1440;
const H = 900;

const fixture = JSON.parse(readFileSync(path.join(root, 'tmp', 'manual-demo-fixture.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

function initScript() {
  const set = (key, value) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  };
  set('anclora-cookie-consent-v1', {
    necessary: true, analytics: false, marketing: false,
    updatedAt: new Date().toISOString(), version: 'v1',
  });
  set('anclora_shiftimport_onboarding_v1', {
    version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
  });
}

async function newPage({ mobile = false, skipInit = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: W, height: H },
    deviceScaleFactor: mobile ? 2 : 1.5,
  });
  if (!skipInit) {
    await context.addInitScript(initScript);
  }
  return context.newPage();
}

async function loginAs(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await page.waitForSelector('#auth-email', { state: 'detached' }).catch(() => {});
  await page.waitForTimeout(700);
}

async function shot(page, filename, { fullPage = false } = {}) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, filename), fullPage });
  console.log(`✓ ${filename}`);
}

// ── 1. Landing (invitado) ──────────────────────────────────────────────────
{
  const page = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await shot(page, 'hero-dark.png');
  await page.close();
}

// ── 2. Login ────────────────────────────────────────────────────────────────
{
  const page = await newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await shot(page, 'login-dark.png');
  await page.close();
}

// ── 3. Pricing ──────────────────────────────────────────────────────────────
{
  const page = await newPage();
  await page.goto(`${BASE}/pricing`, { waitUntil: 'load' });
  await shot(page, 'pricing-dark.png');
  await page.close();
}

// ── 4. Cookies (banner reseteado a estado inicial) ─────────────────────────
{
  const page = await newPage({ skipInit: true });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await shot(page, 'cookies-dark.png');
  await page.close();
}

// ── 5. Elección de tipo de cuenta (registro nuevo, sin completar) ──────────
{
  const page = await newPage();
  await page.goto(`${BASE}/signup`, { waitUntil: 'load' });
  const stamp = Date.now();
  await page.locator('#auth-email').fill(`manual-onboarding-${stamp}@demo.local`);
  await page.locator('#auth-password').fill('Manual-Demo-2026');
  const confirmPassword = page.locator('input[name="confirmPassword"], #auth-confirm-password');
  if (await confirmPassword.count() > 0) {
    await confirmPassword.fill('Manual-Demo-2026');
  }
  const registerResponse = page.waitForResponse((r) => r.url().includes('/api/auth/register') && r.ok());
  await page.locator('form .auth-submit').click();
  await registerResponse.catch(() => {});
  await page.waitForTimeout(1000);
  await shot(page, 'onboarding-choice-dark.png');
  await page.close();
  console.log(`(cuenta de descarte creada: manual-onboarding-${stamp}@demo.local — limpiar con scripts/cleanup-manual-demo.mjs)`);
}

// ── 6. Calendario vacío en modo invitado ───────────────────────────────────
{
  const page = await newPage();
  await page.goto(`${BASE}/app`, { waitUntil: 'load' });
  await shot(page, 'guest-empty-calendar-dark.png');
  await page.close();
}

// ── 7. Calendario con turnos (empleado con cuenta) ─────────────────────────
let employeePage;
{
  const page = await newPage();
  await loginAs(page, fixture.emails.admin, fixture.password);
  await page.goto(`${BASE}/app`, { waitUntil: 'load' });
  await shot(page, 'calendar-month-dark.png');
  employeePage = page;
}

// ── 8. Formatos aprendidos ──────────────────────────────────────────────────
{
  const page = employeePage;
  const btn = page.getByRole('button', { name: 'Formatos aprendidos' });
  await btn.click();
  await page.waitForTimeout(600);
  await shot(page, 'format-profiles-dark.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 9. Ajustes: perfil ──────────────────────────────────────────────────────
{
  const page = employeePage;
  await page.getByRole('button', { name: 'Abrir ajustes' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'settings-profile-dark.png');
}

// ── 10. Ajustes: tipos de turno ────────────────────────────────────────────
{
  const page = employeePage;
  const tab = page.getByRole('button', { name: 'Tipos de turno' });
  if (await tab.count() > 0) {
    await tab.click();
    await page.waitForTimeout(500);
    await shot(page, 'settings-shifttypes-dark.png');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 11. Usuarios de la organización ────────────────────────────────────────
{
  const page = employeePage;
  await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'members-dark.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 12. Áreas de la organización ───────────────────────────────────────────
{
  const page = employeePage;
  await page.getByRole('button', { name: 'Áreas' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'areas-dark.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 13. Importación de equipo (ADMIN) ──────────────────────────────────────
{
  const page = employeePage;
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.waitForTimeout(600);
  await shot(page, 'team-import-dark.png');
  await page.keyboard.press('Escape').catch(() => {});
  await page.close();
}

// ── 14-16. Importar cuadrante individual (empleado, GS-03 fixture) ────────
{
  const page = await newPage();
  await loginAs(page, fixture.emails.empleado, fixture.password);
  await page.goto(`${BASE}/app`, { waitUntil: 'load' });

  const GS03_PDF = path.join(root, 'src/ingestion/fixtures/acceptance-corpus/fixtures/GS-03_hospitality/source.pdf');

  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, 'import-upload-dark.png');

  // Ajustar mes/año al del documento sintético (octubre 2026).
  const triggers = page.locator('.modal-select-trigger');
  await triggers.nth(0).click();
  await page.getByRole('option', { name: 'Octubre', exact: true }).click();
  await triggers.nth(1).click();
  await page.getByRole('option', { name: '2026', exact: true }).click();

  await page.locator('input[type="file"]').first().setInputFiles(GS03_PDF);
  await page.getByRole('button', { name: 'Procesar archivo' }).click();

  // Espera determinista: el análisis termina cuando desaparece el spinner
  // "Procesando archivo" (nunca un timeout fijo a ciegas).
  await page.getByText('Procesando archivo', { exact: false }).waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});

  const rowQuestion = page.getByText('¿Cuál de estas filas eres tú?');
  const rowVisible = await rowQuestion.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  if (rowVisible) {
    await page.locator('.modal-overlay').getByRole('button', { name: /López/ }).first().click();
    // Tras elegir la fila, el asistente abre una ronda de seguimiento con
    // preguntas de código de turno — esperar a que aparezca esa ronda
    // (nunca un timeout fijo a ciegas) antes de capturar la pantalla, para
    // que la captura ilustre una pregunta de código, no solo la de fila.
    await page.locator('.modal-overlay').getByRole('button', { name: 'Turno de trabajo' }).first()
      .waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {});
  }

  // Captura del asistente mostrando una pregunta real (código de turno si ya
  // se resolvió la fila; si no, la propia pregunta de selección de fila).
  await shot(page, 'import-assistant-dark.png');

  // Responder cualquier pregunta de código de turno visible para llegar a la vista previa.
  const workButtons = page.locator('.modal-overlay').getByRole('button', { name: 'Turno de trabajo' });
  const count = await workButtons.count();
  for (let i = 0; i < count; i += 1) {
    await workButtons.nth(i).click();
  }
  const timeInputs = page.locator('.modal-overlay input[type="time"]');
  const timeCount = await timeInputs.count();
  for (let i = 0; i < timeCount; i += 1) {
    const value = await timeInputs.nth(i).inputValue();
    if (!value) await timeInputs.nth(i).fill(i % 2 === 0 ? '08:00' : '16:00');
  }
  const applyBtn = page.locator('.modal-overlay').getByRole('button', { name: 'Aplicar y continuar' });
  if (await applyBtn.count() > 0) {
    await applyBtn.click();
    // Esperar a que el asistente termine (desaparezca) o pase a una ronda
    // de seguimiento — nunca un timeout fijo a ciegas.
    await page.getByText('Asistente de formato').waitFor({ state: 'detached', timeout: 8_000 }).catch(() => {});
  }
  await page.getByTestId('import-quality-state').waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await shot(page, 'import-preview-dark.png');
  await page.close();
}

await browser.close();
console.log('\n✅ Capturas guardadas en docs/manual/screenshots/');
