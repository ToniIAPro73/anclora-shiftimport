// Measures + screenshots the F1 import surfaces. Usage: node qa/mobile-diagnostics/harness/measure.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(here, '..', '..', 'e2e-acceptance', 'package.json'))('@playwright/test');
const base = process.argv[2] ?? 'http://localhost:5199';
const out = process.argv[3] ?? join(here, '..', 'measurements');
mkdirSync(out, { recursive: true });
const cases = [];
for (const width of [360, 390, 430, 1440]) for (const surface of ['consent', 'result', 'result-published']) for (const [lang, theme] of [['es', 'dark'], ['en', 'light']]) cases.push({ width, surface, lang, theme });
const browser = await chromium.launch();
let failures = 0;
for (const c of cases) {
  const mobile = c.width < 700;
  const ctx = await browser.newContext({ viewport: { width: c.width, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}/qa/mobile-diagnostics/harness/index.html?surface=${c.surface}&lang=${c.lang}&theme=${c.theme}`);
  await page.waitForSelector(c.surface === 'consent' ? '[data-testid="harness-consent"]' : '[data-testid="import-result-complete"]', { timeout: 20000 });
  const m = await page.evaluate(() => {
    const lift = (v) => { document.documentElement.style.overflow = v; document.body.style.overflow = v; };
    lift('visible');
    const lifted = document.documentElement.scrollWidth;
    const dialog = document.querySelector('[role="dialog"]');
    const rect = dialog?.getBoundingClientRect();
    const btns = [...document.querySelectorAll('button')].map((b) => b.getBoundingClientRect()).filter((r) => r.width && r.height);
    return {
      innerWidth, lifted, dialogRight: rect ? Math.round(rect.right) : null, dialogBottom: rect ? Math.round(rect.bottom) : null,
      minTouch: Math.round(Math.min(...btns.map((r) => Math.min(r.width, r.height)))), radios: document.querySelectorAll('input[type=radio]').length,
    };
  });
  const ok = m.lifted <= m.innerWidth && (m.dialogRight === null || m.dialogRight <= m.innerWidth + 1);
  if (!ok) failures += 1;
  console.log(`${c.surface.padEnd(17)} ${String(c.width).padStart(4)} ${c.lang}/${c.theme} lifted=${m.lifted}/${m.innerWidth} dialogRight=${m.dialogRight} minTouch=${m.minTouch} ${ok ? 'OK' : 'OVERFLOW'}`);
  if (c.lang === 'es' && c.theme === 'dark' && (c.width === 360 || c.width === 1440)) await page.screenshot({ path: join(out, `harness-${c.surface}-${c.width}.png`) });
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
