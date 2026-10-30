// Accessibility checks for the F1 import surfaces (component level, synthetic props, no backend): axe + keyboard + focus + accessible tree.
// Usage (vite harness running): node qa/mobile-diagnostics/harness/a11y.mjs [baseUrl]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(join(here, '..', '..', 'e2e-acceptance', 'package.json'));
const { chromium } = req('@playwright/test');
const AxeBuilder = req('@axe-core/playwright').default ?? req('@axe-core/playwright');
const base = process.argv[2] ?? 'http://localhost:5199';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch();
for (const width of [375, 1440]) {
  const mobile = width < 700;
  for (const [lang, theme] of [['es', 'dark'], ['en', 'light']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: mobile, hasTouch: mobile });
    const tag = `${width}/${lang}/${theme}`;
    // ---- consent -------------------------------------------------------------------------------------------------------------
    let page = await ctx.newPage();
    await page.goto(`${base}/qa/mobile-diagnostics/harness/index.html?surface=consent&lang=${lang}&theme=${theme}`);
    await page.waitForSelector('[data-testid="harness-consent"]');
    const axe = await new AxeBuilder({ page }).include('[data-testid="harness-consent"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const bad = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    check(`consent axe serious/critical [${tag}]`, bad.length === 0, bad.map((v) => v.id).join(','));
    const radios = page.getByRole('radio');
    check(`consent radios have accessible names [${tag}]`, (await radios.count()) === 3 && (await Promise.all([0, 1, 2].map(async (i) => (await radios.nth(i).evaluate((el) => el.labels?.[0]?.textContent?.trim().length ?? 0)) > 0))).every(Boolean));
    check(`consent exposes a fieldset/legend group [${tag}]`, (await page.getByRole('group').count()) >= 1);
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.getAttribute('type'));
    check(`consent: Tab lands on the radio group (one tab stop) [${tag}]`, first === 'radio');
    const checkedBefore = await page.evaluate(() => document.querySelector('input[type=radio]:checked')?.getAttribute('value'));
    await page.keyboard.press('ArrowDown');
    const checkedAfter = await page.evaluate(() => document.querySelector('input[type=radio]:checked')?.getAttribute('value'));
    check(`consent: arrow keys move the selection [${tag}]`, checkedBefore !== checkedAfter, `${checkedBefore} → ${checkedAfter}`);
    const focusStyle = await page.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none' }; });
    check(`consent: focus is visible [${tag}]`, focusStyle.outline || focusStyle.shadow, JSON.stringify(focusStyle));
    const aria = await page.locator('[data-testid="harness-consent"]').ariaSnapshot();
    check(`consent accessible tree lists the three options [${tag}]`, (aria.match(/radio/g) ?? []).length === 3);
    await page.close();
    // ---- result modal --------------------------------------------------------------------------------------------------------
    for (const surface of ['result', 'result-published']) {
      page = await ctx.newPage();
      await page.goto(`${base}/qa/mobile-diagnostics/harness/index.html?surface=${surface}&lang=${lang}&theme=${theme}`);
      await page.waitForSelector('[data-testid="import-result-complete"]');
      const dlg = page.getByRole('dialog');
      check(`${surface}: role=dialog with aria-modal and a name [${tag}]`, (await dlg.count()) === 1 && (await dlg.getAttribute('aria-modal')) === 'true' && ((await dlg.getAttribute('aria-label')) || (await dlg.getAttribute('aria-labelledby'))) !== null);
      const status = page.locator('[data-testid="import-result-complete"]');
      check(`${surface}: result region is role=status aria-live=polite [${tag}]`, (await status.getAttribute('role')) === 'status' && (await status.getAttribute('aria-live')) === 'polite');
      const ax = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = ax.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
      check(`${surface}: axe serious/critical [${tag}]`, serious.length === 0, serious.map((v) => `${v.id}(${v.nodes.length})`).join(','));
      const inside = await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false);
      check(`${surface}: initial focus is inside the dialog [${tag}]`, inside);
      let stayed = true;
      for (let i = 0; i < 14; i += 1) { await page.keyboard.press('Tab'); stayed = stayed && await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false); }
      check(`${surface}: Tab never leaves the dialog (focus trap) [${tag}]`, stayed);
      const targets = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }).filter(Boolean));
      check(`${surface}: touch targets ≥ 24px (WCAG 2.5.8) [${tag}]`, Math.min(...targets) >= 24, `min=${Math.min(...targets)}px`);
      const ctas = await page.evaluate(() => ({ planner: !!document.querySelector('[data-testid="import-result-open-planner"]'), resolve: !!document.querySelector('[data-testid="import-result-resolve"]') }));
      check(`${surface}: CTAs are exactly the actionable ones [${tag}]`, surface === 'result' ? ctas.resolve && ctas.planner : !ctas.resolve && !ctas.planner);
      await page.keyboard.press('Escape');
      check(`${surface}: Escape asks to close [${tag}]`, (await page.evaluate(() => document.body.dataset.closed)) === '1');
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
