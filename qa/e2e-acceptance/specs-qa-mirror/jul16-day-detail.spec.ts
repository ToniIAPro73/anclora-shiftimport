import { expect, test, type Page } from '@playwright/test';

/** 16/07/2026 on the QA mirror, opened for real (read-only): no false changed badge, human non-redundant history copy. */
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'desktop project only');

async function pilotJuly(page: Page) {
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: /Mes anterior|Previous month/ }).click();
  await expect(page.locator('.month-nav-label')).toContainText('Julio 2026');
}

for (const viewport of [{ width: 1366, height: 650 }, { width: 1440, height: 900 }]) {
  test(`16/07 detail ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await pilotJuly(page);
    await expect(page.getByTestId('day-history-btn-2026-07-16')).toHaveCount(0);
    await page.getByTestId('calendar-reconciliation-button').click();
    const recon = page.getByRole('dialog', { name: 'Diferencias' });
    await recon.getByRole('tab', { name: /Resueltos/ }).click();
    const view = recon.getByTestId('recon-review-2026-07-16');
    for (let i = 0; i < 120 && !(await view.isVisible().catch(() => false)); i += 1) {
      const next = recon.getByRole('button', { name: /Página siguiente/ });
      if (!(await next.isEnabled().catch(() => false))) break;
      await next.click();
    }
    await expect(view).toBeVisible();
    await view.click();
    const history = page.getByTestId('day-history');
    await expect(history).toBeVisible();
    const modal = page.getByTestId('day-detail-dialog');
    const text = (await history.innerText()).replace(/\s+/g, ' ');
    const modalText = (await modal.innerText()).replace(/\s+/g, ' ');
    console.log(`JUL16 ${viewport.width}x${viewport.height} HISTORY: ${text}`);
    console.log(`JUL16 VISIBLE: ${/Vacaciones/.test(modalText)}`);
    const auto = (text.match(/comprobaci[oó]n autom[aá]tica/gi) ?? []).length;
    console.log(`JUL16 AUTOMATIC_COUNT: ${auto}`);
    expect(text).not.toMatch(/Reconciled|HIGH|MEDIUM|LOW|company calendar|\brun\b|REQUIRES_REVIEW|[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(auto).toBe(1);
    expect(text).toContain('Sin cambios');
    expect(text).toContain('La información ya coincidía con el calendario');
    await page.screenshot({ path: test.info().outputPath(`jul16-${viewport.width}x${viewport.height}.png`) });
  });
}
