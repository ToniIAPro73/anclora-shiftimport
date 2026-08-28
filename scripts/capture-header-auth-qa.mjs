/**
 * QA visual del auth-state flash del PublicHeader (Fase 12): escenarios
 * A (guest), B (autenticada), C (resolución de sesión lenta, ~1800 ms, con
 * medición DOM before/after) + regresiones (theme/language toggle, /login,
 * /signup, /app). Screenshots en qa/public-header-auth/.
 *
 * Requiere `vercel dev` en :3199. Fixture autocontenida (org + usuaria
 * EMPLOYEE propia, cleanup al final), patrón de capture-vlm-fallback-qa.mjs.
 *
 * Uso: node scripts/capture-header-auth-qa.mjs
 *      QA_SESSIONS=A,B,C,reg node scripts/capture-header-auth-qa.mjs  (subset)
 */
import { chromium } from '../qa/e2e-acceptance/node_modules/playwright-core/index.mjs';
import { neon } from '@neondatabase/serverless';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../api/_lib/passwords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'qa', 'public-header-auth');
const BASE = 'http://localhost:3199';
const PASSWORD = 'Header-QA-2026-pass';
const SLOW_SESSION_MS = 1800;

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
const email = `hdr-qa-${stamp}@qa.test`;
const hash = hashPassword(PASSWORD);
const org = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`HDR-QA Org ${stamp}`}, 'company', 'team') RETURNING id`)[0].id;
const userId = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hash}, 'Ana Martinez') RETURNING id`)[0].id;
await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${userId}, ${org}, 'EMPLOYEE')`;
await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id) VALUES (${org}, 'Ana Martinez', ${userId}, '1001')`;
console.log(`✓ fixture: org=${org} user=${email}`);

// --------------------------------------------------------------- helpers --
const results = { shots: [], assertions: [], dom: {} };
const assert = (name, ok, detail = '') => {
  results.assertions.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗ FALLA'} [assert] ${name}${detail ? ` — ${detail}` : ''}`);
};

const ONLY = (process.env.QA_SESSIONS || '').split(',').filter(Boolean);
const runSession = (name) => ONLY.length === 0 || ONLY.includes(name);

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
  page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
  return { context, page };
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await page.waitForSelector('#auth-email', { state: 'detached', timeout: 15_000 });
}

/** Retrasa la resolución de sesión (unknown prolongado) sin alterarla. */
async function slowSessionMe(page, delayMs = SLOW_SESSION_MS) {
  await page.route('**/api/session/me', async (route) => {
    await new Promise((resolve) => { setTimeout(resolve, delayMs); });
    await route.continue();
  });
}

/** Calienta la caché de fuentes del contexto con una carga normal de '/'
 * (font-display: swap provoca un reflow de ~5px en la PRIMERA visita fría que
 * contamina la medición del slot; es preexistente e independiente del auth).
 * Después instala el delay de sesión y recarga — la medición before/after es
 * entonces atribuible solo a la resolución de sesión. */
async function warmFontsThenSlowLoad(page, path = '/') {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('.public-header').waitFor({ state: 'visible', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await slowSessionMe(page);
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: 'commit' });
  await page.locator('.public-header').waitFor({ state: 'visible', timeout: 30_000 });
  // Asentar las fuentes ANTES de medir/capturar (con caché caliente resuelve
  // en ~100-300 ms, muy dentro de la ventana unknown de 1800 ms).
  await page.evaluate(() => document.fonts.ready);
  return t0;
}

async function shot(page, filename) {
  await page.screenshot({ path: path.join(OUT, filename) });
  results.shots.push(filename);
  console.log(`✓ ${filename}`);
}

/** Medición DOM del header: rects del header, CTA (rect+texto), slot
 * secundario (rect + contenido visible) y ancho del nav. */
const measureHeader = (page) => page.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 };
  };
  const slotEl = document.querySelector('.public-header-secondary-slot');
  const visibleContent = slotEl
    ? [...slotEl.querySelectorAll('button')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => el.textContent.trim())
    : [];
  return {
    header: rect('.public-header'),
    cta: { ...rect('.public-header-cta'), text: document.querySelector('.public-header-cta')?.textContent?.trim() ?? null },
    slot: { ...rect('.public-header-secondary-slot'), visibleContent },
    navWidth: rect('.public-nav')?.w ?? null,
    fonts: document.fonts.status,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
});

const fmtRect = (r) => (r ? `x=${r.x} y=${r.y} w=${r.w} h=${r.h}` : 'null');

/** Compara before/after y concluye sobre layout shift. Devuelve bool. */
function compareDom(label, before, after) {
  if (before.fonts !== 'loaded' || after.fonts !== 'loaded') {
    console.log(`[DOM ${label}] AVISO: fuentes no asentadas (before=${before.fonts}, after=${after.fonts}) — medición contaminada por font-swap`);
  }
  const ctaStable = before.cta.text === after.cta.text
    && before.cta.w === after.cta.w && before.cta.x === after.cta.x && before.cta.h === after.cta.h;
  const slotStable = before.slot.w === after.slot.w && before.slot.x === after.slot.x && before.slot.h === after.slot.h;
  const navStable = before.navWidth === after.navWidth;
  const headerStable = before.header.w === after.header.w && before.header.h === after.header.h && before.header.y === after.header.y;
  console.log(`\n[DOM ${label}] before: header(${fmtRect(before.header)}) cta(${fmtRect(before.cta)} "${before.cta.text}") slot(${fmtRect(before.slot)} visible=${JSON.stringify(before.slot.visibleContent)}) navW=${before.navWidth}`);
  console.log(`[DOM ${label}] after:  header(${fmtRect(after.header)}) cta(${fmtRect(after.cta)} "${after.cta.text}") slot(${fmtRect(after.slot)} visible=${JSON.stringify(after.slot.visibleContent)}) navW=${after.navWidth}`);
  console.log(`[DOM ${label}] LAYOUT_SHIFT_OBSERVED=${ctaStable && slotStable && navStable && headerStable ? 'NO' : 'YES'}`);
  assert(`${label}: CTA estable (texto+rect)`, ctaStable, `"${before.cta.text}"→"${after.cta.text}" w ${before.cta.w}→${after.cta.w}`);
  assert(`${label}: slot secundario rect constante`, slotStable, `w ${before.slot.w}→${after.slot.w} x ${before.slot.x}→${after.slot.x}`);
  assert(`${label}: ancho nav constante`, navStable, `${before.navWidth}→${after.navWidth}`);
  assert(`${label}: header rect constante`, headerStable);
  return ctaStable && slotStable && navStable && headerStable;
}

// ------------------------------------------------------------------ run --
const browser = await chromium.launch({ headless: true });
try {
  // ============================ A: no autenticada =========================
  if (runSession('A')) {
    for (const theme of ['dark', 'light']) {
      const { context, page } = await newSession(browser, { width: 1440, height: 900, theme });
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await page.getByRole('button', { name: 'Empezar gratis' }).first().waitFor({ state: 'visible', timeout: 30_000 });
      // Post-resolución guest: login visible.
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(300);
      assert(`A ${theme}: CTA "Empezar gratis" + login visibles`, true);
      await shot(page, `A-landing-guest-${theme}-1440.png`);
      await page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(300);
      await shot(page, `A-pricing-guest-${theme}-1440.png`);
      await context.close();
    }

    const { context, page } = await newSession(browser, { width: 1024, height: 768, theme: 'dark' });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot(page, 'A-landing-guest-dark-1024.png');
    await page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot(page, 'A-pricing-guest-dark-1024.png');
    await context.close();

    const mobile = await newSession(browser, { width: 390, height: 844, theme: 'dark' });
    await mobile.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await mobile.page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await mobile.page.waitForTimeout(300);
    const m390 = await measureHeader(mobile.page);
    assert('A 390: sin overflow horizontal', m390.scrollWidth <= m390.innerWidth + 1, `scrollWidth=${m390.scrollWidth} inner=${m390.innerWidth}`);
    await shot(mobile.page, 'A-landing-guest-dark-390.png');
    await mobile.page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' });
    await mobile.page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await mobile.page.waitForTimeout(300);
    const p390 = await measureHeader(mobile.page);
    assert('A 390 pricing: sin overflow horizontal', p390.scrollWidth <= p390.innerWidth + 1, `scrollWidth=${p390.scrollWidth}`);
    await shot(mobile.page, 'A-pricing-guest-dark-390.png');
    await mobile.context.close();
  }

  // ============================ B: autenticada ============================
  if (runSession('B')) {
    for (const theme of ['dark', 'light']) {
      const { context, page } = await newSession(browser, { width: 1440, height: 900, theme });
      await login(page);
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Ir a ShiftImport' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(300);
      const ctaText = await page.locator('.public-header-cta').textContent();
      assert(`B ${theme}: CTA principal sigue siendo "Empezar gratis"`, ctaText.trim() === 'Empezar gratis', ctaText);
      assert(`B ${theme}: secundaria "Ir a ShiftImport"`, await page.getByRole('button', { name: 'Ir a ShiftImport' }).isVisible());
      assert(`B ${theme}: sin "Iniciar sesión"`, await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).count() === 0);
      await shot(page, `B-landing-auth-${theme}-1440.png`);
      await page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Ir a ShiftImport' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(300);
      await shot(page, `B-pricing-auth-${theme}-1440.png`);
      // Navegación de la secundaria → /app (volver a landing primero).
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Ir a ShiftImport' }).click();
      await page.waitForURL('**/app', { timeout: 15_000 });
      await page.getByRole('button', { name: 'Importar', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
      assert(`B ${theme}: "Ir a ShiftImport" navega a /app`, page.url().includes('/app'));
      if (theme === 'dark') await shot(page, 'B-navigation-app-dark-1440.png');
      await context.close();
    }

    const { context, page } = await newSession(browser, { width: 390, height: 844, theme: 'dark' });
    await login(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ir a ShiftImport' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
    const m390 = await measureHeader(page);
    assert('B 390: sin overflow horizontal', m390.scrollWidth <= m390.innerWidth + 1, `scrollWidth=${m390.scrollWidth}`);
    await shot(page, 'B-landing-auth-dark-390.png');
    await context.close();
  }

  // ============================ C: auth lenta (CRÍTICO) ===================
  if (runSession('C')) {
    // C1: autenticada con sesión lenta, dark + light.
    for (const theme of ['dark', 'light']) {
      const { context, page } = await newSession(browser, { width: 1440, height: 900, theme });
      await login(page); // cookie válida ya instalada
      const t0 = await warmFontsThenSlowLoad(page);
      await shot(page, `C-auth-slow-t0-${theme}-1440.png`);

      await page.waitForTimeout(Math.max(0, 500 - (Date.now() - t0)));
      const before = await measureHeader(page);
      await shot(page, `C-auth-slow-t500-${theme}-1440.png`);
      assert(`C auth ${theme}: en t=500ms aún unknown (sin login/goToApp visible)`, before.slot.visibleContent.length === 0, JSON.stringify(before.slot.visibleContent));

      await page.waitForTimeout(Math.max(0, 1500 - (Date.now() - t0)));
      await shot(page, `C-auth-slow-t1500-${theme}-1440.png`);

      await page.getByRole('button', { name: 'Ir a ShiftImport' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(150);
      const after = await measureHeader(page);
      await shot(page, `C-auth-slow-resolved-${theme}-1440.png`);
      assert(`C auth ${theme}: post-resolución visible "Ir a ShiftImport"`, after.slot.visibleContent.includes('Ir a ShiftImport'), JSON.stringify(after.slot.visibleContent));
      results.dom[`auth-${theme}`] = { before, after };
      compareDom(`C auth ${theme}`, before, after);
      await context.close();
    }

    // C2: sin sesión (guest) con /api/session/me lento, dark.
    {
      const { context, page } = await newSession(browser, { width: 1440, height: 900, theme: 'dark' });
      const t0 = await warmFontsThenSlowLoad(page);
      await page.waitForTimeout(Math.max(0, 500 - (Date.now() - t0)));
      const before = await measureHeader(page);
      await shot(page, 'C-guest-slow-t500-dark-1440.png');
      assert('C guest: en t=500ms aún unknown', before.slot.visibleContent.length === 0);
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(150);
      const after = await measureHeader(page);
      await shot(page, 'C-guest-slow-resolved-dark-1440.png');
      assert('C guest: post-resolución visible "Iniciar sesión"', after.slot.visibleContent.includes('Iniciar sesión'));
      results.dom['guest-dark'] = { before, after };
      compareDom('C guest dark', before, after);
      await context.close();
    }

    // C3: spot móvil — autenticada lenta en 390.
    {
      const { context, page } = await newSession(browser, { width: 390, height: 844, theme: 'dark' });
      await login(page);
      await warmFontsThenSlowLoad(page);
      await page.waitForTimeout(400);
      const before = await measureHeader(page);
      await shot(page, 'C-auth-slow-t500-dark-390.png');
      await page.getByRole('button', { name: 'Ir a ShiftImport' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(150);
      const after = await measureHeader(page);
      await shot(page, 'C-auth-slow-resolved-dark-390.png');
      assert('C auth 390: sin overflow horizontal tras resolver', after.scrollWidth <= after.innerWidth + 1, `scrollWidth=${after.scrollWidth}`);
      results.dom['auth-390'] = { before, after };
      compareDom('C auth 390', before, after);
      await context.close();
    }
  }

  // ============================ Regresiones ===============================
  if (runSession('reg')) {
    const { context, page } = await newSession(browser, { width: 1440, height: 900, theme: 'dark' });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });

    // Theme toggle: dark → light.
    await page.locator('.public-header .theme-toggle:not(.lang-toggle)').click();
    await page.waitForTimeout(250);
    const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
    assert('Reg: theme toggle cambia a light', themeAfter === 'light', themeAfter);
    await shot(page, 'R-theme-toggle-light-1440.png');

    // Language toggle: es → en; el slot NO debe saltar (sizer apila ambos).
    const slotBefore = (await measureHeader(page)).slot;
    await page.locator('.public-header .lang-toggle').click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(250);
    const after = await measureHeader(page);
    const slotAfter = after.slot;
    console.log(`[DOM lang-toggle] slot es → en: w ${slotBefore.w} → ${slotAfter.w} (textos "${slotBefore.visibleContent}" → "${slotAfter.visibleContent}")`);
    assert('Reg: idioma cambia a EN (CTA "Start for free")', after.cta.text === 'Start for free', after.cta.text);
    assert('Reg: secundaria EN "Sign in" dentro del slot', slotAfter.visibleContent.includes('Sign in'));
    assert('Reg: slot no se desborda del header en EN', slotAfter.x + slotAfter.w <= after.header.x + after.header.w + 1);
    await shot(page, 'R-language-en-1440.png');
    await page.locator('.public-header .lang-toggle').click(); // volver a ES
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

    // Navegación: /login y /signup.
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL('**/login', { timeout: 10_000 });
    await page.locator('#auth-email').waitFor({ state: 'visible', timeout: 15_000 });
    assert('Reg: login navega a /login', page.url().includes('/login'));
    await shot(page, 'R-navigation-login-dark-1440.png');

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Empezar gratis' }).first().click();
    await page.waitForURL('**/signup', { timeout: 10_000 });
    assert('Reg: CTA navega a /signup', page.url().includes('/signup'));
    await shot(page, 'R-navigation-signup-dark-1440.png');
    await context.close();

    // Language toggle en 390 (longitudes ES/EN en header estrecho).
    const mobile = await newSession(browser, { width: 390, height: 844, theme: 'dark' });
    await mobile.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await mobile.page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await mobile.page.locator('.public-header .lang-toggle').click();
    await mobile.page.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await mobile.page.waitForTimeout(250);
    const en390 = await measureHeader(mobile.page);
    assert('Reg 390 EN: sin overflow horizontal', en390.scrollWidth <= en390.innerWidth + 1, `scrollWidth=${en390.scrollWidth}`);
    await shot(mobile.page, 'R-language-en-dark-390.png');
    await mobile.context.close();
  }
} finally {
  await browser.close();
  await sql`DELETE FROM organizations WHERE id = ${org}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;
  console.log('✓ fixture eliminada');
}

// --------------------------------------------------------------- resumen --
console.log('\n================ RESUMEN QA HEADER AUTH ================');
console.log(`Screenshots (${results.shots.length}):`);
for (const s of results.shots) console.log(`  qa/public-header-auth/${s}`);
const failed = results.assertions.filter((a) => !a.ok);
console.log(`\nAssertions: ${results.assertions.length - failed.length}/${results.assertions.length} OK`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
  process.exitCode = 1;
}
