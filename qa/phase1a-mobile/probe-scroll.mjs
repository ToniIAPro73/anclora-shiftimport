import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('anclora_shiftimport_locale_v1', JSON.stringify('es'));
  localStorage.setItem('anclora_theme_mode', JSON.stringify('dark'));
});
await page.goto('http://localhost:5199', { waitUntil: 'networkidle' });
const cookie = page.locator('[aria-labelledby="shiftimport-cookie-title"] button').filter({ hasText: /Aceptar|Accept/ }).first();
if (await cookie.isVisible().catch(() => false)) await cookie.click();
await page.locator('.onboarding-source-grid button').first().click();
await page.locator('input[type="file"]').first().setInputFiles('qa/phase1a-mobile/fixture-roster.csv');
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /Confirmar/.test(b.textContent || ''));
  const overlays = [...document.querySelectorAll('.modal-overlay, [role="dialog"], .modal-content, [class*="modal"]')];
  const scrollers = overlays.map(el => ({
    cls: (el.className || '').toString().slice(0, 60),
    scrollH: el.scrollHeight, clientH: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  })).filter(s => s.scrollH > s.clientH || s.clientH > 0);
  return {
    btnRect: btn ? btn.getBoundingClientRect().toJSON() : null,
    viewportH: window.innerHeight,
    bodyScroll: { scrollH: document.body.scrollHeight, clientH: document.documentElement.clientHeight },
    scrollers,
  };
});
console.log(JSON.stringify(info, null, 1));

// try scrolling the modal content to reach the button
await page.evaluate(() => {
  const els = [...document.querySelectorAll('.modal-content, [role="dialog"] > div')];
  for (const el of els) if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForTimeout(300);
const btn2 = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /Confirmar/.test(b.textContent || ''));
  return btn ? btn.getBoundingClientRect().toJSON() : null;
});
console.log('after scroll:', JSON.stringify(btn2));
await page.screenshot({ path: 'qa/phase1a-mobile/05-scrolled-modal-es-dark.png' });
await browser.close();
