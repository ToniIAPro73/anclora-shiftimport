// F2-M05 visual + accessibility QA of the employee time-off surface (component level, whole API mocked in the page, no backend/database).
// Usage (vite harness running): node qa/mobile-diagnostics/harness/time-off-qa.mjs [baseUrl] [screenshotDir]
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

const browser = await chromium.launch();
for (const [width, height] of [[375, 812], [412, 915], [768, 1024], [1440, 900]]) {
  const mobile = width < 700;
  for (const [lang, theme] of [['es', 'dark'], ['en', 'light']]) {
    const tag = `${width}/${lang}/${theme}`;
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.goto(`${base}/qa/mobile-diagnostics/harness/index.html?surface=time-off&lang=${lang}&theme=${theme}`);
    await page.waitForSelector('[data-testid="time-off-section"] [data-testid="time-off-item"]');
    const section = page.locator('[data-testid="time-off-section"]');
    const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `time-off-${name}-${width}-${lang}-${theme}.png`), fullPage: true }); };
    await shot('list');

    check(`list renders four requests, status as text [${tag}]`, (await page.getByTestId('time-off-item').count()) === 4);
    const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, section: (document.querySelector('[data-testid="time-off-section"]')?.scrollWidth ?? 0) - (document.querySelector('[data-testid="time-off-section"]')?.clientWidth ?? 0) }));
    check(`no horizontal scroll [${tag}]`, overflow.doc <= 0 && overflow.section <= 0, JSON.stringify(overflow));
    let axe = await new AxeBuilder({ page }).include('[data-testid="time-off-section"]').withTags(TAGS).analyze();
    let serious = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    check(`list axe serious/critical [${tag}]`, serious.length === 0, serious.map((v) => `${v.id}(${v.nodes.length})`).join(','));
    check(`applied range of the partially applied approval is explained (OD-08) [${tag}]`, (await page.getByTestId('time-off-applied').innerText()).includes('4') && (await page.getByTestId('time-off-applied').innerText()).includes('3'));

    // open the form with the keyboard
    await page.getByTestId('time-off-new').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="time-off-form"]');
    check(`form opens by keyboard and has no type select (fixed to Vacaciones) [${tag}]`, (await page.getByTestId('time-off-form').getByRole('combobox').count()) === 0);
    const submit = page.getByTestId('time-off-submit');
    check(`submit is disabled until the range is valid [${tag}]`, await submit.isDisabled());

    // invalid range → inline error with aria-invalid + describedby
    const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()));
    const plus = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    await page.getByTestId('time-off-start').fill(plus(10));
    await page.getByTestId('time-off-end').fill(plus(5));
    await page.getByTestId('time-off-end').blur();
    const end = page.getByTestId('time-off-end');
    check(`inline error: aria-invalid + aria-describedby → message [${tag}]`, (await end.getAttribute('aria-invalid')) === 'true' && ((await page.locator(`[id="${await end.getAttribute('aria-describedby')}"]`).innerText()).length > 5));
    await shot('form-invalid');

    // valid range with impact
    await page.getByTestId('time-off-end').fill(plus(14));
    await page.waitForSelector('[data-testid="time-off-impact"] .time-off-form__impact-title');
    check(`impact block announces published shifts and drafts [${tag}]`, (await page.getByTestId('time-off-impact').innerText()).includes('3') && (await page.getByTestId('time-off-impact').getAttribute('aria-live')) === 'polite');
    check(`days pill shows 5 days [${tag}]`, (await page.getByTestId('time-off-days').innerText()).includes('5'));
    check(`submit enabled for a valid range [${tag}]`, !(await submit.isDisabled()));
    await shot('form-valid');
    axe = await new AxeBuilder({ page }).include('[data-testid="time-off-section"]').withTags(TAGS).analyze();
    serious = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    check(`form axe serious/critical [${tag}]`, serious.length === 0, serious.map((v) => `${v.id}(${v.nodes.length})`).join(','));

    // own overlap blocks the submit with role=alert
    await page.getByTestId('time-off-start').fill(plus(20));
    await page.getByTestId('time-off-end').fill(plus(22));
    await page.waitForSelector('[data-testid="time-off-overlap"]');
    check(`own overlap: role=alert and submit disabled [${tag}]`, (await page.getByTestId('time-off-overlap').getAttribute('role')) === 'alert' && await submit.isDisabled());
    await shot('form-overlap');

    // touch targets + focus visibility
    const targets = await page.evaluate(() => [...document.querySelectorAll('[data-testid="time-off-section"] button, [data-testid="time-off-section"] input, [data-testid="time-off-section"] select, [data-testid="time-off-section"] textarea')].map((el) => { const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }).filter((n) => n > 0));
    check(`touch targets ≥ 24px (WCAG 2.5.8) [${tag}]`, Math.min(...targets) >= 24, `min=${Math.min(...targets)}px`);
    await page.getByTestId('time-off-start').focus();
    const focus = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; });
    check(`focus is visible on inputs [${tag}]`, focus);

    // close returns to the list; cancel a pending request
    await page.getByRole('button', { name: lang === 'es' ? 'Cerrar formulario' : 'Close form' }).click();
    check(`closing the form removes it [${tag}]`, (await page.getByTestId('time-off-form').count()) === 0);
    await page.getByTestId('time-off-cancel').first().click();
    await page.waitForSelector('[data-testid="time-off-feedback"]');
    check(`cancel confirms with role=status [${tag}]`, (await page.getByTestId('time-off-feedback').getAttribute('role')) === 'status');
    await ctx.close();
  }
}
// empty state
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${base}/qa/mobile-diagnostics/harness/index.html?surface=time-off&lang=es&theme=dark&data=empty`);
await page.waitForSelector('[data-testid="time-off-empty"]');
check('empty state has truthful copy', (await page.getByTestId('time-off-empty').innerText()).includes('Todavía no has pedido vacaciones'));
if (shots) await page.screenshot({ path: join(shots, 'time-off-empty-375-es-dark.png'), fullPage: true });
await ctx.close();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
