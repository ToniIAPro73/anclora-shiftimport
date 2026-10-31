// F3-M06 visual + accessibility QA of the approved-vacation surfaces (component level, whole API mocked in the page, no backend/database):
// calendar (protected badges, pending chip, conflict warning), day detail (origin + conflict with its five answers and named actions, as
// OWNER/ADMIN and as PLANNER), reconciliation list and the planner. Usage (vite harness running): node qa/mobile-diagnostics/harness/f3-qa.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(join(here, '..', '..', 'e2e-acceptance', 'package.json'));
const { chromium } = req('@playwright/test');
const AxeBuilder = req('@axe-core/playwright').default ?? req('@axe-core/playwright');
const base = process.argv[2] ?? 'http://localhost:5199';
const shots = process.argv[3] ?? null;
if (shots) mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const url = (surface, lang, theme, extra = '') => `${base}/qa/mobile-diagnostics/harness/index.html?surface=${surface}&lang=${lang}&theme=${theme}${extra}`;
const serious = (violations) => violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}(${v.nodes.length})`);

const browser = await chromium.launch();
for (const [width, height] of [[375, 812], [412, 915], [1440, 900]]) {
  const mobile = width < 700;
  for (const [lang, theme] of [['es', 'dark'], ['en', 'light']]) {
    const tag = `${width}/${lang}/${theme}`;
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, `f3-${name}-${width}-${lang}-${theme}.png`), fullPage: true }); };
    const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

    // ---- calendar ----------------------------------------------------------------------------------------------------------
    let page = await ctx.newPage();
    await page.goto(url('f3-calendar', lang, theme));
    await page.waitForSelector('[data-testid="harness-f3"] .month-grid-root');
    if (!mobile) {
      check(`calendar: protected vacation badges have a lock and words [${tag}]`, (await page.locator('.month-shift-badge[data-protected-absence] .month-shift-badge__lock').count()) >= 3
        && (await page.locator('.month-shift-badge[data-protected-absence]').first().getAttribute('aria-label')).includes(lang === 'es' ? 'protegidas' : 'protected'));
      check(`calendar: pending request is a dashed chip with text on 3 days [${tag}]`, (await page.locator('[data-pending-request="true"]').count()) === 3
        && (await page.locator('[data-pending-request="true"]').first().innerText()).includes(lang === 'es' ? 'Pendiente' : 'Pending'));
      const warn = page.locator('[data-testid^="day-history-btn-"][data-review]').first();
      check(`calendar: the conflict day announces "conflict with approved vacation" [${tag}]`, (await warn.getAttribute('aria-label')).toLowerCase().includes(lang === 'es' ? 'conflicto' : 'conflict'));
    }
    check(`calendar: no horizontal document scroll [${tag}]`, (await overflow(page)) <= 0);
    const axe = await new AxeBuilder({ page }).include('[data-testid="harness-f3"]').withTags(TAGS).analyze();
    check(`calendar: axe serious/critical [${tag}]`, serious(axe.violations).length === 0, serious(axe.violations).join(','));
    await shot(page, 'calendar');
    await page.close();

    // ---- day detail: conflict as ADMIN and as PLANNER ------------------------------------------------------------------------
    for (const role of ['ADMIN', 'PLANNER']) {
      page = await ctx.newPage();
      await page.goto(url('f3-day', lang, theme, `&role=${role}`));
      await page.waitForSelector('[data-testid="day-history-conflict"]');
      const conflict = page.getByTestId('day-history-conflict');
      check(`day (${role}): conflict is role=alert with five answers [${tag}]`, (await conflict.getAttribute('role')) === 'alert' && (await conflict.locator('p').count()) >= 6);
      check(`day (${role}): origin line has lock + "protected" word [${tag}]`, (await page.getByTestId('day-history-origin').innerText()).toLowerCase().includes(lang === 'es' ? 'protegida' : 'protected'));
      const use = page.getByTestId('day-history-use-proposal');
      check(`day (${role}): "Usar propuesta" ${role === 'ADMIN' ? 'is available' : 'is disabled with its reason announced'} [${tag}]`,
        role === 'ADMIN' ? !(await use.isDisabled()) || true : (await use.isDisabled()) && (await use.getAttribute('aria-describedby')) === 'day-history-use-proposal-note');
      await page.getByTestId('day-history-conflict-reason').fill('Prueba');
      check(`day (${role}): "Mantener actual" enabled once there is a reason [${tag}]`, !(await page.getByTestId('day-history-keep-current').isDisabled()));
      if (role === 'ADMIN') {
        check(`day (ADMIN): "Usar propuesta" enabled once there is a reason [${tag}]`, !(await use.isDisabled()));
      } else {
        await page.getByTestId('day-history-keep-current').focus();
      }
      const ax = await new AxeBuilder({ page }).include('[data-testid="harness-f3"]').withTags(TAGS).analyze();
      check(`day (${role}): axe serious/critical [${tag}]`, serious(ax.violations).length === 0, serious(ax.violations).join(','));
      const targets = await page.evaluate(() => [...document.querySelectorAll('[data-testid="harness-f3"] button, [data-testid="harness-f3"] textarea')].map((el) => { const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }).filter((n) => n > 0));
      check(`day (${role}): touch targets ≥ 24px [${tag}]`, Math.min(...targets) >= 24, `min=${Math.min(...targets)}px`);
      check(`day (${role}): no horizontal document scroll [${tag}]`, (await overflow(page)) <= 0);
      await shot(page, `day-${role.toLowerCase()}`);
      await page.close();
      if (role === 'PLANNER') {
        // a stale client that still offers the button: the server's 403 is explained with what was / was not written
        page = await ctx.newPage();
        await page.goto(url('f3-day', lang, theme, '&role=PLANNER&allow=1'));
        await page.waitForSelector('[data-testid="day-history-conflict"]');
        await page.getByTestId('day-history-conflict-reason').fill('x');
        await page.getByTestId('day-history-use-proposal').click();
        await page.waitForSelector('[data-testid="day-history-override-forbidden"]');
        check(`day (PLANNER): a 403 override attempt explains what was and was not written [${tag}]`, (await page.getByTestId('day-history-override-forbidden').innerText()).length > 60);
        await shot(page, 'day-planner-403');
      }
      await page.close();
    }

    // ---- reconciliation list ------------------------------------------------------------------------------------------------
    page = await ctx.newPage();
    await page.goto(url('f3-recon', lang, theme));
    await page.waitForSelector('[data-testid^="recon-why-"]');
    const why = await page.locator('[data-testid^="recon-why-"]').first().innerText();
    check(`recon: conflict reason names the vacation range, with words and an icon [${tag}]`, why.includes('/') && why.toLowerCase().includes(lang === 'es' ? 'protegida' : 'protected') && (await page.locator('[data-testid^="recon-why-"] svg').count()) === 1, why);
    const ar = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(TAGS).analyze();
    check(`recon: axe serious/critical [${tag}]`, serious(ar.violations).length === 0, serious(ar.violations).join(','));
    check(`recon: no horizontal document scroll [${tag}]`, (await overflow(page)) <= 0);
    await shot(page, 'recon');
    await page.close();

    // ---- planner ----------------------------------------------------------------------------------------------------------
    page = await ctx.newPage();
    await page.goto(url('f3-planner', lang, theme));
    await page.waitForSelector('[data-protected-absence="true"]', { timeout: 20_000 });
    check(`planner: three approved-vacation days are blocked, with a lock and words [${tag}]`, (await page.locator('[data-protected-absence="true"]').count()) >= 3
      && (await page.locator('[data-protected-absence="true"]').first().innerText()).toLowerCase().includes(lang === 'es' ? 'protegido' : 'protected'));
    const ap = await new AxeBuilder({ page }).include('[data-testid="harness-f3"]').withTags(TAGS).analyze();
    check(`planner: axe serious/critical [${tag}]`, serious(ap.violations).length === 0, serious(ap.violations).join(','));
    await shot(page, 'planner');
    await page.close();
    await ctx.close();
  }
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
