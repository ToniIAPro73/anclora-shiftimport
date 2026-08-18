import { chromium } from 'playwright-core';
import fs from 'node:fs';

const EXE = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';
const OUT = 'qa/phase1a-mobile';
const BASE = 'http://localhost:5199';
const CSV = 'qa/phase1a-mobile/fixture-roster.csv';

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch({ executablePath: EXE });

async function newPage(locale, theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(([loc, th]) => {
    localStorage.setItem('anclora_shiftimport_locale_v1', loc);
    localStorage.setItem('anclora_theme_mode', th);
  }, [locale, theme]);
  return { ctx, page };
}

async function overflowInfo(page) {
  return page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > 390,
  }));
}

async function xInsideCard(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => /cerrar|close/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    if (!buttons.length) return { found: false, inside: null };
    const btn = buttons[0];
    const card = btn.closest('[class*="modal"], [role="dialog"]') || btn.parentElement;
    const b = btn.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return { found: true, inside: b.left >= c.left && b.right <= c.right && b.top >= c.top && b.bottom <= c.bottom };
  });
}

for (const [locale, theme] of [['es', 'dark'], ['en', 'light']]) {
  const tag = `${locale}-${theme}`;
  const { ctx, page } = await newPage(locale, theme);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 0. Dismiss cookie consent if present
  const cookieDialog = page.locator('[aria-labelledby="shiftimport-cookie-title"]');
  if (await cookieDialog.isVisible().catch(() => false)) {
    const accept = cookieDialog.locator('button').filter({ hasText: /Aceptar|Accept/ }).first();
    if (await accept.isVisible().catch(() => false)) await accept.click();
    await page.waitForTimeout(400);
  }

  // 1. Onboarding visible (first-run)
  const onboardingVisible = await page.locator('text=/Bienvenido|Welcome/').first().isVisible().catch(() => false);
  check(`${tag} onboarding visible`, onboardingVisible);
  await page.screenshot({ path: `${OUT}/01-onboarding-step1-${tag}.png` });
  let o = await overflowInfo(page);
  check(`${tag} onboarding no overflow-x`, !o.overflowX, `scrollWidth=${o.docW}`);
  let x = await xInsideCard(page);
  check(`${tag} onboarding X inside card`, x.found && x.inside === true);

  // 2. Step 2: choose source -> upload
  const sourceBtn = page.locator('.onboarding-source-grid button, [class*="source"] button').first();
  if (await sourceBtn.isVisible().catch(() => false)) { await sourceBtn.click(); }
  await page.screenshot({ path: `${OUT}/02-onboarding-upload-${tag}.png` });
  o = await overflowInfo(page);
  check(`${tag} upload step no overflow-x`, !o.overflowX, `scrollWidth=${o.docW}`);

  // 3. Upload CSV -> import modal preview
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(CSV);
    await page.waitForTimeout(2500);
  } else {
    check(`${tag} file input present`, false);
  }
  await page.screenshot({ path: `${OUT}/03-import-preview-${tag}.png` });
  o = await overflowInfo(page);
  check(`${tag} preview no overflow-x`, !o.overflowX, `scrollWidth=${o.docW}`);
  x = await xInsideCard(page);
  check(`${tag} import modal X inside card`, x.found && x.inside === true);
  const qualityChip = await page.locator('text=/Correcto|Ready|Revisar|Review|No reconocido|Not recognized/').first().isVisible().catch(() => false);
  check(`${tag} quality chip visible`, qualityChip);

  // 4. Confirm import if button enabled
  const confirmBtn = page.locator('button').filter({ hasText: /Confirmar|Confirm|Importar|Import/ }).last();
  if (await confirmBtn.isEnabled().catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${OUT}/04-calendar-${tag}.png` });
  o = await overflowInfo(page);
  check(`${tag} calendar no overflow-x`, !o.overflowX, `scrollWidth=${o.docW}`);
  // internal clipped overflow (element scrollWidth > clientWidth without page overflow)
  const clipped = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('main *, [class*="grid"], [class*="calendar"]')) {
      if (el.scrollWidth - el.clientWidth > 8 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll') {
        bad.push((el.className || el.tagName).toString().slice(0, 50));
      }
    }
    return [...new Set(bad)];
  });
  check(`${tag} no clipped internal overflow`, clipped.length === 0, clipped.join(' | '));
  // sanity: theme + locale applied
  const applied = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, lang: document.querySelector('h1, header')?.textContent?.slice(0, 30) }));
  check(`${tag} theme applied`, applied.theme === theme, `theme=${applied.theme}`);

  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results.txt`, results.join('\n') + '\n');
console.log(results.join('\n'));
