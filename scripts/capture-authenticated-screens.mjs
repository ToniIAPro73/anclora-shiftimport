/**
 * Segunda pasada: capturas autenticadas con esperas deterministas por
 * contenido real (nunca timeouts fijos a ciegas). Sustituye a los bloques
 * 7-13 de capture-manual-screenshots.mjs, que capturaban antes de que
 * cargaran los datos (estado "Cargando..." o vacío).
 */
import { chromium } from '../qa/e2e-acceptance/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'docs', 'manual', 'screenshots');
const BASE = 'http://localhost:3199';
const fixture = JSON.parse(readFileSync(path.join(root, 'tmp', 'manual-demo-fixture.json'), 'utf8'));

function initScript() {
  const set = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
  set('anclora-cookie-consent-v1', { necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1' });
  set('anclora_shiftimport_onboarding_v1', { version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED' });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await context.addInitScript(initScript);
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.locator('#auth-email').fill(fixture.emails.admin);
await page.locator('#auth-password').fill(fixture.password);
const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
await page.locator('form .auth-submit').click();
await loginResponse;
await page.waitForSelector('#auth-email', { state: 'detached' }).catch(() => {});

async function waitAndShot(locatorOrText, filename, { inModal = true } = {}) {
  const target = typeof locatorOrText === 'string' ? page.getByText(locatorOrText) : locatorOrText;
  await target.first().waitFor({ state: 'visible', timeout: 12_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, filename) });
  console.log(`✓ ${filename}`);
}

// Calendario con turnos.
await page.goto(`${BASE}/app`, { waitUntil: 'load' });
await waitAndShot(page.locator('.month-shift-badge').first(), 'calendar-month-dark.png');

// Formatos aprendidos: esperar el nombre real de un perfil sembrado.
await page.getByRole('button', { name: 'Formatos aprendidos' }).click();
await waitAndShot('Cuadrante mensual recepción', 'format-profiles-dark.png');
await page.keyboard.press('Escape');
await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

// Ajustes: perfil.
await page.getByRole('button', { name: 'Abrir ajustes' }).click();
await waitAndShot(page.getByRole('heading', { name: 'Ajustes' }), 'settings-profile-dark.png');

// Ajustes: tipos de turno.
const shiftTypesTab = page.getByRole('button', { name: 'Tipos de turno' });
await shiftTypesTab.click();
await waitAndShot('Regular', 'settings-shifttypes-dark.png');
await page.keyboard.press('Escape');
await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

// Usuarios de la organización: esperar el correo real del admin en la lista.
await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
await waitAndShot(fixture.emails.admin, 'members-dark.png');
await page.keyboard.press('Escape');
await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

// Áreas: esperar el nombre real de un área sembrada.
await page.getByRole('button', { name: 'Áreas', exact: true }).click();
await waitAndShot('Recepción', 'areas-dark.png');
await page.keyboard.press('Escape');
await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

// Importación de equipo (ADMIN): esperar a que cargue el formulario de subida.
await page.getByRole('button', { name: 'Importar', exact: true }).click();
await waitAndShot('Sube el CSV de turnos del equipo', 'team-import-dark.png');

await browser.close();
console.log('\n✅ Capturas autenticadas regeneradas.');
