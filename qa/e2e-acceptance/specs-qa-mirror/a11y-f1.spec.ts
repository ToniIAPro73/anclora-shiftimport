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
    // F5: `month-day-agenda-detail` only exists when the selected day has something to open (MonthDayAgenda, e0a5233); `add` is always there.
    for (const id of ['month-day-agenda-add', 'month-day-agenda-detail']) {
      if (id.endsWith('detail') && (await page.getByTestId(id).count()) === 0) continue;
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

  test('compact TopBar: the whole context (organization, role, employee) lives in the account menu (focus managed)', async ({ page }) => {
    await openCalendar(page);
    const topbarItems = page.locator('.app-shell__topbar .app-shell__context-summary-item:visible');
    // F5: implemented behaviour (1a84f21, validated on device in F4): at ≤640px NO context item stays on the TopBar; nothing is lost, it moves to the menu.
    await expect(topbarItems).toHaveCount(0);
    const trigger = page.getByTestId('app-shell-user-menu');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const context = page.getByTestId('app-shell-menu-context');
    await expect(context).toBeVisible();
    await expect(context).toHaveAttribute('role', 'group');
    expect(await context.getAttribute('aria-label')).toBeTruthy();
    expect(await context.locator('.app-shell__context-summary-item:visible').count()).toBeGreaterThanOrEqual(3); // organization + role + employee (+ area when it applies)
    const menuAxe = await new AxeBuilder({ page }).include('#app-shell-user-menu').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(seriousOnly(menuAxe.violations)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused(); // focus returns to the trigger
  });
});

test.describe('compact planner (≤640px): Agenda | Tabla | Gestionar', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1440) > 640, 'compact layout only');
  test('mobile bar, view switch and Manage sheet are operable and have no serious axe violations', async ({ page }) => {
    await page.goto('/app/schedule');
    const planner = page.getByTestId('weekly-planner');
    await expect(planner).toBeVisible({ timeout: 60_000 });
    const createDraft = page.getByRole('button', { name: 'Crear borrador semanal' });
    if (!(await page.getByTestId('planner-manage-open').isVisible().catch(() => false)) && await createDraft.isVisible().catch(() => false)) await createDraft.click(); // permitted QA write (QA mirror only)
    const manage = page.getByTestId('planner-manage-open');
    await expect(manage).toBeVisible({ timeout: 60_000 });
    expect((await manage.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    const axe = await new AxeBuilder({ page }).include('[data-testid="weekly-planner"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(seriousOnly(axe.violations)).toEqual([]);
    await manage.click();
    await expect(page.locator('.planner-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.planner-sheet')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); // no document-level horizontal overflow
  });
});

test.describe('planner (day-focus and overflow hint)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1440) <= 640, 'desktop/tablet grid only: the compact planner replaces the toolbar (see the compact planner test)');
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
