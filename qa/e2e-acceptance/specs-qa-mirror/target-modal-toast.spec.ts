import { expect, test, type Locator, type Page } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization } from '../helpers/qa-mirror';
import { readFileSync } from 'node:fs';

/**
 * Target modal composition (DOM geometry, not screenshots) and transient-feedback Toast (no dashboard reflow).
 * QA mirror only: every write is preceded by the fail-closed organization guard.
 */
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900, desktop: true },
  { name: 'desktop-1366x768', width: 1366, height: 768, desktop: true },
  { name: 'mobile-390x844', width: 390, height: 844, desktop: false },
];

async function openTarget(page: Page, theme: 'dark' | 'light', locale: 'es' | 'en') {
  await page.addInitScript(([t, l]) => {
    localStorage.setItem('anclora_theme_mode', t);
    localStorage.setItem('anclora_shiftimport_locale_v1', l);
  }, [theme, locale]);
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('calendar-stats-button').click();
  const stats = page.getByRole('dialog', { name: locale === 'es' ? 'Estadísticas' : 'Statistics' });
  await stats.getByRole('tab', { name: locale === 'es' ? /Objetivo anual/ : /Annual target/ }).first().click();
  await stats.locator('[data-testid="eff-contract-configure"], [data-testid="eff-contract-edit"]').first().click();
  const dialog = page.getByRole('dialog', { name: locale === 'es' ? 'Objetivo de jornada' : 'Working time target' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('annual-target-save')).toBeVisible();
  return dialog;
}

async function measure(page: Page, dialog: Locator) {
  return dialog.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const scrollers: string[] = [];
    for (const node of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
      const style = getComputedStyle(node);
      if (['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        scrollers.push(`${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]}`);
      }
    }
    const footer = el.querySelector('.annual-target__footer') as HTMLElement | null;
    const f = footer?.getBoundingClientRect();
    return {
      box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      viewport: { w: innerWidth, h: innerHeight },
      scrollers,
      footerInViewport: !!f && f.top >= 0 && f.bottom <= innerHeight + 1 && f.left >= 0 && f.right <= innerWidth + 1,
      docHorizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      dialogHorizontalOverflow: el.scrollWidth > el.clientWidth + 1,
    };
  });
}

for (const vp of VIEWPORTS) {
  for (const theme of ['dark', 'light'] as const) {
    test(`target modal ${vp.name} ES ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const dialog = await openTarget(page, theme, 'es');
      const m = await measure(page, dialog);
      test.info().annotations.push({ type: 'geometry', description: JSON.stringify(m) });
      expect(m.docHorizontalOverflow).toBe(false);
      expect(m.dialogHorizontalOverflow).toBe(false);
      expect(m.footerInViewport, 'footer (Cancelar / Guardar) fully inside the viewport').toBe(true);
      await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeInViewport({ ratio: 0.99 });
      await expect(dialog.getByTestId('annual-target-save')).toBeInViewport({ ratio: 0.99 });
      await expect(page.getByTestId('close-annual-target-modal')).toBeInViewport({ ratio: 0.99 });
      expect(m.box.y).toBeGreaterThanOrEqual(0);
      expect(m.box.y + m.box.h).toBeLessThanOrEqual(vp.height + 1);
      if (vp.desktop) {
        // The whole form fits: nothing in the modal may need vertical scroll except the (variable) history region.
        const avoidable = m.scrollers.filter((s) => !s.includes('annual-target__history'));
        expect(avoidable, `avoidable scroll regions: ${m.scrollers.join(', ')}`).toEqual([]);
        // It really uses the horizontal space: wide, two-column composition.
        expect(m.box.w).toBeGreaterThanOrEqual(Math.min(900, vp.width * 0.6));
        const columns = await dialog.locator('.annual-target__column').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
        expect(new Set(columns.map((x) => Math.round(x))).size, 'two columns side by side').toBeGreaterThanOrEqual(2);
        const details = dialog.locator('details.annual-target__history');
        if (await details.count()) {
          await details.locator('summary').click();
          const open = await measure(page, dialog);
          expect(open.scrollers.filter((s) => !s.includes('annual-target__history')), `history open: ${open.scrollers.join(', ')}`).toEqual([]);
          expect(open.footerInViewport).toBe(true);
        }
      } else {
        const columns = await dialog.locator('.annual-target__column').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
        expect(new Set(columns).size, 'single column on mobile').toBe(1);
      }
      await page.screenshot({ path: test.info().outputPath(`target-${vp.name}-${theme}.png`) });
    });
  }
}

test('target modal EN smoke (desktop 1440x900)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialog = await openTarget(page, 'dark', 'en');
  const m = await measure(page, dialog);
  expect(m.docHorizontalOverflow).toBe(false);
  expect(m.footerInViewport).toBe(true);
  expect(m.scrollers.filter((s) => !s.includes('annual-target__history'))).toEqual([]);
});

async function createShift(page: Page) {
  await page.getByTestId('sidebar-add-shift').click();
  const form = page.getByRole('dialog', { name: 'Programar Turno' });
  const d = new Date(); d.setDate(d.getDate() - (3 + Math.floor(Math.random() * 300))); // a random past day: never collides with earlier QA shifts
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const minute = String(Math.floor(Math.random() * 50) + 5).padStart(2, '0');
  await form.locator('input[type="date"]').fill(iso);
  await form.locator('input[type="time"]').nth(0).fill(`03:${minute}`);
  await form.locator('input[type="time"]').nth(1).fill(`04:${minute}`);
  await form.getByRole('button', { name: 'Tipo' }).click();
  await page.getByRole('option', { name: 'Ausencia', exact: true }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/shifts') && r.request().method() === 'PATCH');
  await form.getByRole('button', { name: 'Confirmar' }).click();
  expect((await saved).status()).toBe(200);
}

test('shift-saved Toast is an overlay: dashboard geometry does not change', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as { organizationId: string };
  await assertQaOrganization(ctx.organizationId); // fail closed: only "<source> — QA Mirror"
  await page.addInitScript(() => localStorage.setItem('anclora_shiftimport_locale_v1', 'es'));
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 30_000 });

  const geom = () => page.evaluate(() => {
    const pick = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
    return { root: pick('.month-grid-root'), shell: pick('.month-grid-shell'), main: pick('.app-shell__main'), cells: pick('.month-grid-cells') };
  });
  const before = await geom();

  await createShift(page);

  const toast = page.getByTestId('app-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Turno guardado correctamente');
  const stack = page.getByTestId('app-toast-stack');
  await expect(stack).toHaveAttribute('aria-live', 'polite');
  await expect(toast).toHaveAttribute('role', 'status');
  expect(await stack.evaluate((e) => getComputedStyle(e).position), 'overlay, out of normal flow').toBe('fixed');

  const during = await geom();
  expect(during, 'dashboard geometry with Toast visible').toEqual(before);

  // dismissible by keyboard
  const dismiss = toast.getByRole('button');
  await dismiss.focus();
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toast).toHaveCount(0);
  expect(await geom(), 'dashboard geometry after dismiss').toEqual(before);
});

test('Toast auto-dismisses and honours reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  const ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as { organizationId: string };
  await assertQaOrganization(ctx.organizationId);
  await page.addInitScript(() => localStorage.setItem('anclora_shiftimport_locale_v1', 'es'));
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 30_000 });
  await createShift(page);
  const toast = page.getByTestId('app-toast');
  await expect(toast).toBeVisible();
  const motion = await toast.evaluate((e) => { const s = getComputedStyle(e); return { animation: s.animationDuration, transition: s.transitionDuration }; });
  test.info().annotations.push({ type: 'reduced-motion', description: JSON.stringify(motion) });
  for (const value of `${motion.animation},${motion.transition}`.split(',')) expect(parseFloat(value)).toBeLessThan(0.05);
  await expect(toast).toHaveCount(0, { timeout: 9_000 }); // 5 s lifecycle
});
