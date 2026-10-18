import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Desktop modal contract (QA mirror, pilot employee): Estadísticas and Diferencias never need an OUTER vertical scroll
 * on desktop; tablet / mobile may scroll but everything stays reachable. Measured by DOM, not by screenshot.
 */
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'the viewport matrix is driven explicitly by this spec (desktop project only)');

async function selectPilot(page: Page) {
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
}

const outerScroll = (dialog: Locator) => dialog.evaluate((el) => {
  const style = getComputedStyle(el);
  return { scrollable: ['auto', 'scroll'].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 1, sh: el.scrollHeight, ch: el.clientHeight, oy: style.overflowY };
});
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// 1366x650 / 1280x620 are what a 1366x768 / 1440x900 SCREEN really leaves to a browser tab (toolbars, tab strip, OS bars).
const DESKTOP = [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1366, height: 650 }, { width: 1280, height: 620 }];
const RESPONSIVE = [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 800 }, { width: 844, height: 390 }];

for (const viewport of DESKTOP) {
  test(`desktop ${viewport.width}x${viewport.height}: Estadísticas (Mes actual + Año) without outer vertical scroll`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await selectPilot(page);
    await page.getByTestId('calendar-stats-button').click();
    const dialog = page.getByRole('dialog', { name: 'Estadísticas' });
    await expect(dialog).toBeVisible();
    for (const tab of [/Mes/, /Año/]) {
      await dialog.getByRole('tab', { name: tab }).first().click();
      await expect(dialog.locator('.hero-metric')).toBeVisible();
      const state = await outerScroll(dialog);
      expect(state.scrollable, `outer scroll on ${tab}: ${JSON.stringify(state)}`).toBe(false);
      const box = (await dialog.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(page.getByTestId('stats-modal-close')).toBeInViewport({ ratio: 0.99 });
      await expect(dialog.getByRole('tab', { name: tab }).first()).toBeInViewport({ ratio: 0.99 });
      // every card and the last visible element of the panel are fully inside the viewport
      const cards = dialog.locator('.metric-card, .planned-card, .hero-metric');
      const count = await cards.count();
      for (let i = 0; i < count; i += 1) await expect(cards.nth(i)).toBeInViewport({ ratio: 0.99 });
      expect(await noHorizontalOverflow(page)).toBe(true);
    }
    if (viewport.width === 1366) await page.screenshot({ path: test.info().outputPath('stats-1366x768.png') });
  });

  test(`desktop ${viewport.width}x${viewport.height}: Diferencias (page of results) without outer vertical scroll`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await selectPilot(page);
    await page.getByTestId('calendar-reconciliation-button').click();
    const dialog = page.getByRole('dialog', { name: 'Diferencias' });
    await expect(dialog.getByTestId('recon-range')).toBeVisible();
    const state = await outerScroll(dialog);
    expect(state.scrollable, `outer scroll: ${JSON.stringify(state)}`).toBe(false);
    const box = (await dialog.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.getByTestId('recon-modal-close')).toBeInViewport({ ratio: 0.99 });
    await expect(dialog.getByRole('tab').first()).toBeInViewport({ ratio: 0.99 });
    const rows = dialog.locator('[data-testid^="recon-row-"]');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i += 1) await expect(rows.nth(i)).toBeInViewport({ ratio: 0.99 });
    await expect(dialog.getByTestId('recon-range')).toBeInViewport({ ratio: 0.99 });
    // the pager works and the modal still fits
    const next = dialog.getByRole('button', { name: /Página siguiente/ });
    if (await next.isEnabled().catch(() => false)) {
      await next.click();
      expect((await outerScroll(dialog)).scrollable).toBe(false);
      await expect(dialog.getByTestId('recon-range')).toBeInViewport({ ratio: 0.99 });
    }
    expect(await noHorizontalOverflow(page)).toBe(true);
    if (viewport.width === 1366) await page.screenshot({ path: test.info().outputPath('recon-1366x768.png') });
  });
}

for (const viewport of RESPONSIVE) {
  test(`${viewport.width}x${viewport.height}: modals stay reachable (scroll allowed), no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await selectPilot(page);
    await page.getByTestId('calendar-stats-button').click();
    const stats = page.getByRole('dialog', { name: 'Estadísticas' });
    await expect(page.getByTestId('stats-modal-close')).toBeVisible();
    await expect(stats.getByRole('tab').first()).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(stats).toBeHidden();
    await page.getByTestId('calendar-reconciliation-button').click();
    const recon = page.getByRole('dialog', { name: 'Diferencias' });
    await expect(page.getByTestId('recon-modal-close')).toBeVisible();
    const pager = recon.getByRole('button', { name: /Página siguiente/ });
    await pager.scrollIntoViewIfNeeded();
    await expect(pager).toBeInViewport();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}
