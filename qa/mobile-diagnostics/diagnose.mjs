// F1-M00 — mobile overflow diagnosis. Read-only: the whole API is mocked in the browser
// (no backend, no Neon). Usage: node qa/mobile-diagnostics/diagnose.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'e2e-acceptance', 'package.json'));
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] ?? 'http://localhost:5199';
const outDir = process.argv[3] ?? join(here, "measurements");
mkdirSync(outDir, { recursive: true });

const ORG = '00000000-0000-4000-8000-000000000001';
const EMP = '00000000-0000-4000-8000-0000000000e1';
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

const employees = Array.from({ length: 14 }, (_, i) => ({
  id: i === 0 ? EMP : `00000000-0000-4000-8000-00000000e${String(i).padStart(3, '0')}`,
  organizationId: ORG,
  externalEmployeeId: String(35566 + i),
  name: i === 0 ? 'Alzamora Frontera, Antonio' : `Empleado Sintetico ${String(i).padStart(2, '0')}`,
  userId: null, areaId: null, status: 'active',
}));
const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
const shifts = Array.from({ length: 31 }, (_, i) => addDays(monthStart, i))
  .filter((d) => d.getUTCMonth() === monthStart.getUTCMonth() && d.getUTCDay() % 6 !== 2)
  .map((d, i) => ({
    id: `s-${i}`, employeeId: EMP, date: iso(d), startTime: i % 5 === 4 ? null : '05:00', endTime: i % 5 === 4 ? null : '13:00',
    location: '', origin: 'IMP', shiftType: i % 5 === 4 ? 'Libre' : 'Regular', countsAsWork: i % 5 !== 4,
    layer: 'CHANGE', provenance: 'COMPANY_IMPORT', effectiveState: 'EFFECTIVE',
  }));
const version = {
  id: 'v1', scheduleId: 'sc1', areaId: null, versionNumber: 1, status: 'DRAFT',
  periodStart: iso(monday), periodEnd: iso(addDays(monday, 6)),
};
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockApi(context) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const m = route.request().method();
    if (p === '/api/session/me') return json(route, {
      user: { id: 'u1', email: 'qa@example.invalid', displayName: 'Toni Balleste' },
      organizationId: ORG, role: 'OWNER', plan: 'team', employeeId: EMP,
      memberships: [{ organizationId: ORG, organizationName: 'ShiftImport', role: 'OWNER', scopedAreaId: null }],
    });
    if (p === '/api/organizations/current') return json(route, {
      organization: { id: ORG, name: 'ShiftImport', plan: 'team' },
      entitlement: { planId: 'team', features: { multiEmployeeImport: true, teamManagement: true, fullHistory: true }, limits: { maxEmployees: null, maxMonthlyImports: null }, usage: { activeEmployees: employees.length } },
    });
    if (p === '/api/employees') return json(route, { employees });
    if (p === '/api/shifts' && m === 'GET') return json(route, { shifts });
    if (p === '/api/schedules' && m === 'GET') return json(route, { schedules: [version] });
    if (/^\/api\/schedules\/[^/]+\/versions\/[^/]+$/.test(p)) return json(route, { version, employees: employees.map((e) => ({ id: e.id, name: e.name, externalEmployeeId: e.externalEmployeeId, areaId: null })), assignments: [], calendarShifts: [] });
    if (p === '/api/areas') return json(route, { areas: [] });
    if (p === '/api/approval-requests') return json(route, { requests: [] });
    if (p === '/api/imports') return json(route, { imports: [], total: 0, page: 1, pageSize: 20 });
    if (p.startsWith('/api/calendar/')) return json(route, { targets: [], annotations: [], changes: [] });
    if (p === '/api/me/notifications') return json(route, { notifications: [], unreadCount: 0 });
    if (p === '/api/memberships') return json(route, { members: [] });
    if (p === '/api/assignments') return json(route, { assignments: [] });
    return json(route, {}, m === 'GET' ? 200 : 404);
  });
}

// The app sets `html, body { overflow: hidden }`, which hides document overflow from
// `documentElement.scrollWidth` while mobile browsers still widen the layout viewport
// (zoom-out). So we also measure with the root overflow lifted and list *unclipped*
// offenders: elements past the viewport with no clipping ancestor below <body>.
const MEASURE = () => {
  const vw = innerWidth;
  const clips = (el) => {
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return a;
    }
    return null;
  };
  const describe = (el) => ({
    tag: el.tagName, className: typeof el.className === 'string' ? el.className.slice(0, 90) : '',
    testId: el.getAttribute?.('data-testid'), position: getComputedStyle(el).position,
    right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width),
  });
  const all = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > vw + 1);
  const unclipped = all.filter((el) => !clips(el)).filter((el) => getComputedStyle(el).visibility !== 'hidden');
  const root = { h: document.documentElement.style.overflow, b: document.body.style.overflow };
  document.documentElement.style.overflow = 'visible'; document.body.style.overflow = 'visible';
  const liftedScrollWidth = document.documentElement.scrollWidth;
  document.documentElement.style.overflow = root.h; document.body.style.overflow = root.b;
  return {
    innerWidth: vw,
    scrollWidth: document.documentElement.scrollWidth,
    liftedScrollWidth,
    rootOverflow: { html: getComputedStyle(document.documentElement).overflowX, body: getComputedStyle(document.body).overflowX },
    offenders: all.slice(0, 20).map(describe),
    unclippedOffenders: unclipped.slice(0, 20).map(describe),
    unclippedCount: unclipped.length,
  };
};

const widths = [360, 375, 390, 412, 430, 1440];
const screens = [
  { id: 'calendar', path: '/app', ready: '[data-testid="month-grid"], .month-grid-root' },
  { id: 'planner-grid', path: '/app/schedule', ready: '[data-testid="weekly-planner"]' },
  { id: 'planner-table', path: '/app/schedule', ready: '[data-testid="weekly-planner"]', action: async (page) => {
    const t = page.getByRole('button', { name: /tabla/i }).first();
    if (await t.count()) await t.click();
  } },
];

const browser = await chromium.launch();
const results = [];
for (const width of widths) {
  const mobile = width < 700;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 812 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, locale: 'es-ES' });
  await context.addInitScript(() => {
    localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1' }));
    localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED' }));
    localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    localStorage.setItem('anclora_theme_mode', 'dark');
  });
  await mockApi(context);
  for (const screen of screens) {
    const page = await context.newPage();
    try {
      await page.goto(baseUrl + screen.path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(screen.ready, { timeout: 15000 });
      if (screen.action) await screen.action(page);
      await page.waitForTimeout(500);
      const m = await page.evaluate(MEASURE);
      results.push({ screen: screen.id, width, ...m, documentOverflow: m.liftedScrollWidth > m.innerWidth });
      await page.screenshot({ path: join(outDir, `${screen.id}-${width}.png`) });
    } catch (error) {
      results.push({ screen: screen.id, width, error: String(error.message).split('\n')[0] });
      await page.screenshot({ path: join(outDir, `${screen.id}-${width}-error.png`) }).catch(() => {});
    }
    await page.close();
  }
  await context.close();
}
await browser.close();
writeFileSync(join(outDir, 'measurements.json'), JSON.stringify(results, null, 2));
for (const r of results) console.log(r.screen.padEnd(14), String(r.width).padStart(5), r.error ? `ERROR ${r.error}` : `inner=${r.innerWidth} scroll=${r.scrollWidth} lifted=${r.liftedScrollWidth} overflow=${r.documentOverflow} unclipped=${r.unclippedCount}`);
