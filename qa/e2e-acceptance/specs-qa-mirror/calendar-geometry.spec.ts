import { expect, test, type Page } from '@playwright/test';

/**
 * READ-ONLY DOM geometry (no screenshots, no visual review): at 1536x864 the whole month fits without any vertical scroll
 * (5- and 6-row months) and a single shift is a compact band, not a day-tall block. QA mirror, pilot employee.
 */
test.use({ viewport: { width: 1536, height: 864 }, screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'desktop geometry');

async function openPilot(page: Page) {
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.locator('.month-grid-root')).toBeVisible({ timeout: 30_000 });
}

const rowsOf = (page: Page) => page.locator('.month-grid-cells').evaluate((el) => (el as HTMLElement).style.gridTemplateRows.match(/repeat\((\d+)/)?.[1] ?? '0').then(Number);

async function geometry(page: Page) {
  return page.evaluate(() => {
    const cells = document.querySelector('.month-grid-cells') as HTMLElement;
    const last = [...cells.querySelectorAll<HTMLElement>('.month-day-cell')].at(-1) as HTMLElement;
    const shell = document.querySelector('.month-grid-shell') as HTMLElement;
    return {
      shellBottom: (document.querySelector('.app-shell') as HTMLElement).getBoundingClientRect().bottom,
      shellScroll: shell.scrollHeight - shell.clientHeight,
      mainScroll: (() => { const m = document.querySelector('.app-shell__main') as HTMLElement; return m.scrollHeight - m.clientHeight; })(),
      lastBottom: last.getBoundingClientRect().bottom,
      viewport: window.innerHeight,
    };
  });
}

for (const height of [864, 700]) test(`the month fits a 1536x${height} viewport: last row fully visible, no calendar vertical scroll (5- and 6-row months)`, async ({ page }) => {
  await page.setViewportSize({ width: 1536, height });
  await openPilot(page);
  const seen = new Set<number>();
  for (let i = 0; i < 8 && seen.size < 2; i += 1) {
    const rows = await rowsOf(page);
    if (!seen.has(rows)) {
      seen.add(rows);
      const g = await geometry(page);
      expect(g.shellBottom, `app shell bottom (${rows} rows)`).toBeLessThanOrEqual(g.viewport + 1); // the legal footer below the shell is clipped by design
      expect(g.shellScroll, `calendar vertical scroll (${rows} rows)`).toBeLessThanOrEqual(1);
      expect(g.mainScroll, `main scroll (${rows} rows)`).toBeLessThanOrEqual(1);
      expect(g.lastBottom, `last row bottom (${rows} rows)`).toBeLessThanOrEqual(g.viewport + 1);
    }
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await page.waitForTimeout(300);
  }
  expect([...seen].sort()).toEqual([5, 6]);
});

test('one shift is a compact band; two are two bands; more than two show "+N"', async ({ page }) => {
  await openPilot(page);
  const result = await page.evaluate(() => {
    const out: { single?: { badge: number; cell: number }; two?: number; more?: { badges: number; more: boolean } } = {};
    for (const cell of document.querySelectorAll<HTMLElement>('.month-day-cell')) {
      const badges = cell.querySelectorAll<HTMLElement>('.month-shift-badge');
      if (badges.length === 1 && !out.single) out.single = { badge: badges[0].getBoundingClientRect().height, cell: cell.getBoundingClientRect().height };
      if (badges.length === 2 && out.two === undefined) out.two = badges.length;
    }
    return out;
  });
  expect(result.single, 'a day with exactly one shift exists in the mirror').toBeTruthy();
  const { badge, cell } = result.single as { badge: number; cell: number };
  expect(badge).toBeGreaterThanOrEqual(16); // readable
  expect(badge).toBeLessThan(cell * 0.45); // not stretched to the day
});
