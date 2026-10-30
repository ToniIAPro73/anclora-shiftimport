import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * F1 accessibility on the real runtime (QA mirror identity, read-only navigation): compact month + day panel, account menu with the
 * context moved out of the compact TopBar, planner day-focus and overflow hint. Axe is only part of it: keyboard, focus, accessible
 * names and the accessibility tree are asserted explicitly. The import consent / result surfaces are covered by
 * qa/mobile-diagnostics/harness/a11y.mjs (they need a file import to be reached through the real UI).
 */
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const seriousOnly = (violations: Array<{ impact?: string | null; id: string; nodes: unknown[] }>) =>
  violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}(${v.nodes.length})`);

async function openCalendar(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 60_000 });
}

test.describe('compact month (≤640px)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1440) > 640, 'compact layout only');

  test('day panel: selectable by keyboard, announced state, accessible names, no serious axe violations', async ({ page }) => {
    await openCalendar(page);
    const agenda = page.getByTestId('month-day-agenda');
    await expect(agenda).toBeVisible();
    await expect(agenda).toHaveAttribute('aria-labelledby', /month-day-agenda-title-/);

    const days = page.locator('[data-testid^="month-day-select-"]');
    expect(await days.count()).toBeGreaterThan(27);
    const target = days.nth(10);
    await expect(target).toHaveAttribute('aria-label', /.+/); // accessible name
    await target.focus();
    await page.keyboard.press('Enter');
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('[data-testid^="month-day-select-"][aria-pressed="true"]').count()).toBe(1);
    await expect(agenda).toHaveAttribute('data-date', (await target.getAttribute('data-testid'))!.replace('month-day-select-', ''));

    // focus must be visible on the day button
    const focus = await target.evaluate((el) => { const s = getComputedStyle(el); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; });
    expect(focus).toBe(true);

    // touch targets: day buttons ≥ 24px (WCAG 2.5.8); the panel actions are comfortable (≥ 40px)
    const dayBox = await target.boundingBox();
    expect(Math.min(dayBox!.width, dayBox!.height)).toBeGreaterThanOrEqual(24);
    for (const id of ['month-day-agenda-add', 'month-day-agenda-detail']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(40);
    }

    // shift chips keep the FULL accessible name although only the short label is visible
    const chip = page.locator('.month-shift-badge[aria-label]').first();
    if (await chip.count()) {
      const name = await chip.getAttribute('aria-label');
      const visible = (await chip.innerText()).trim();
      expect(name!.length).toBeGreaterThanOrEqual(visible.length);
    }

    const axe = await new AxeBuilder({ page }).include('.month-grid-shell').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(seriousOnly(axe.violations)).toEqual([]);
    expect(await page.locator('.month-grid-shell').ariaSnapshot()).toContain('button');
  });

  test('compact TopBar: only the organization on the main line; role and employee stay reachable from the account menu (focus managed)', async ({ page }) => {
    await openCalendar(page);
    const topbarItems = page.locator('.app-shell__topbar .app-shell__context-summary-item:visible');
    await expect(topbarItems).toHaveCount(1);
    const trigger = page.getByTestId('app-shell-user-menu');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const context = page.getByTestId('app-shell-menu-context');
    await expect(context).toBeVisible();
    await expect(context).toHaveAttribute('role', 'group');
    expect(await context.getAttribute('aria-label')).toBeTruthy();
    await expect(context.locator('.app-shell__context-summary-item:visible')).toHaveCount(2); // role + employee (organization stays on the TopBar)
    const menuAxe = await new AxeBuilder({ page }).include('#app-shell-user-menu').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(seriousOnly(menuAxe.violations)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused(); // focus returns to the trigger
  });
});

test.describe('planner (day-focus and overflow hint)', () => {
  test('day-focus is a named, keyboard-operable group (never a ~10px strip) and the hint sits above the grid', async ({ page }) => {
    await page.goto('/app/schedule');
    const planner = page.getByTestId('weekly-planner');
    await expect(planner).toBeVisible({ timeout: 60_000 });
    const createDraft = page.getByRole('button', { name: 'Crear borrador semanal' });
    // The toolbar renders for any loaded week (draft or published). Only when the week has no version at all is a draft created:
    // a permitted QA write (the QA identity belongs to the QA mirror only).
    if (!(await page.locator('.weekly-planner__toolbar').isVisible().catch(() => false)) && await createDraft.isVisible().catch(() => false)) await createDraft.click();
    await expect(page.locator('.weekly-planner__toolbar')).toBeVisible({ timeout: 60_000 });
    const group = page.locator('.weekly-planner__day-focus');
    await expect(group).toHaveAttribute('role', 'group');
    expect(await group.getAttribute('aria-label')).toBeTruthy();
    const box = await group.boundingBox();
    expect(box!.width).toBeGreaterThan(150); // regression: it used to collapse to ~10px
    const buttons = group.locator('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(9);
    for (const index of [0, 1, 2]) expect(await buttons.nth(index).getAttribute('aria-label') ?? await buttons.nth(index).innerText()).toBeTruthy();
    // past days are disabled by design (temporal restriction preserved), so walk the ENABLED buttons
    const enabled = group.locator('button:not([disabled])');
    expect(await enabled.count()).toBeGreaterThanOrEqual(3);
    await enabled.first().focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.weekly-planner__day-focus') !== null)).toBe(true); // Tab walks the buttons
    const hint = page.getByTestId('planner-overflow-hint');
    if (await hint.isVisible()) {
      const hintBox = await hint.boundingBox();
      const gridBox = await page.locator('.weekly-planner__grid-wrap, .weekly-planner__table-wrap').first().boundingBox();
      expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(gridBox!.y + 1); // above, not beside
      await expect(hint).toHaveAttribute('aria-hidden', 'true'); // decorative; the grid itself is the keyboard-scrollable region
    }
    const axe = await new AxeBuilder({ page }).include('.weekly-planner__toolbar').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(seriousOnly(axe.violations)).toEqual([]);
  });
});
