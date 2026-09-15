import { expect, test, type Page } from '@playwright/test';

const now = new Date();
const scenarioDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;

function seedGuestShifts(page: Page) {
  return page.addInitScript((date) => {
    localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: 'v1' }));
    localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }));
    localStorage.setItem('anclora_theme_mode', 'dark');
    localStorage.setItem('anclora_shifts_v1', JSON.stringify([
      { id: 'e2e-compact-1', date, startTime: '08:00', endTime: '11:00', location: 'Regular', origin: 'MAN' },
      { id: 'e2e-compact-2', date, startTime: '11:00', endTime: '12:00', location: 'Ausencia', origin: 'MAN' },
      { id: 'e2e-compact-3', date, startTime: '12:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ]));
  }, scenarioDate);
}

function scenarioCell(page: Page) {
  return page.locator('.month-day-cell').filter({ has: page.locator('.month-day-more-button') });
}

async function assertCompactGeometry(page: Page) {
  const cell = scenarioCell(page);
  const more = cell.locator('.month-day-more-button');
  await expect(more).toHaveText('+1');
  await expect(more).toHaveAttribute('aria-label', 'Mostrar 1 turno más');

  const geometry = await more.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const parentElement = element.closest('.month-day-cell')!;
    const parent = parentElement.getBoundingClientRect();
    const style = getComputedStyle(element);
    const parentStyle = getComputedStyle(parentElement);
    return {
      left: button.left - parent.left,
      right: parent.right - button.right,
      bottom: parent.bottom - button.bottom,
      width: button.width,
      height: button.height,
      cellWidth: parent.width,
      centered: Math.abs((button.left + button.right) / 2 - (parent.left + parent.right) / 2) < 1,
      inside: button.left >= parent.left && button.right <= parent.right && button.top >= parent.top && button.bottom <= parent.bottom,
      boxSizing: style.boxSizing,
      borderLeft: style.borderLeftWidth,
      borderRight: style.borderRightWidth,
      focusShadow: style.boxShadow,
      cellOverflow: parentStyle.overflow,
      horizontalOverflow: parentElement.scrollWidth > parentElement.clientWidth,
    };
  });

  expect(geometry.width).toBeLessThan(geometry.cellWidth * 0.6);
  expect(geometry.height).toBeGreaterThanOrEqual(24);
  expect(geometry.height).toBeLessThanOrEqual(30);
  expect(geometry.left).toBeGreaterThanOrEqual(8);
  expect(geometry.right).toBeGreaterThanOrEqual(8);
  expect(geometry.bottom).toBeGreaterThanOrEqual(6);
  expect(geometry.centered).toBe(true);
  expect(geometry.inside).toBe(true);
  expect(geometry.boxSizing).toBe('border-box');
  expect(geometry.borderLeft).not.toBe('0px');
  expect(geometry.borderRight).not.toBe('0px');
  expect(geometry.cellOverflow).toBe('hidden');
  expect(geometry.horizontalOverflow).toBe(false);

  const normalWidth = geometry.width;
  await more.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(more).toBeFocused();
  const focusState = await more.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    boxShadow: getComputedStyle(element).boxShadow,
    focusVisible: element.matches(':focus-visible'),
  }));
  expect(focusState.width).toBe(normalWidth);
  expect(focusState.height).toBe(geometry.height);
  expect(focusState.focusVisible).toBe(true);
  expect(focusState.boxShadow).toContain('inset');

  const box = await more.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  const activeState = await more.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }));
  expect(activeState.width).toBe(normalWidth);
  expect(activeState.height).toBe(geometry.height);
  await page.mouse.up();
}

test.describe('compact +N indicator', () => {
  test('desktop dark: compact chip keeps its indicator semantics and opens daily detail', async ({ page }) => {
    await seedGuestShifts(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: test.info().outputPath('01-desktop-dark-compact-more.png'), fullPage: false });
    await assertCompactGeometry(page);

    const cell = scenarioCell(page);
    await expect(cell.locator('.month-shift-badge')).toHaveCount(2);
    await expect(page.getByTestId('day-detail-dialog')).toBeVisible();
    await expect(page.getByTestId('day-detail-count-badge')).toHaveText('3 elementos');
  });

  test('mobile light: focus-visible chip remains compact and complete', async ({ page }) => {
    await seedGuestShifts(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const themeToggle = page.getByRole('button', { name: /Cambiar tema|Change theme/ });
    await themeToggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await assertCompactGeometry(page);

    await page.keyboard.press('Escape');
    const more = scenarioCell(page).locator('.month-day-more-button');
    await more.focus();
    await expect(more).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('02-mobile-light-compact-focus.png'), fullPage: false });
  });
});
