import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Responsive layout battery — guest mode (no session, localStorage-backed),
 * no backend required. Asserts the app stays fully reachable on short
 * landscape viewports (Defect: clipped content with blocked page scroll) and
 * that the logo never deforms into an ellipse (Defect: squashed .brand-mark).
 *
 * Guest dashboard lives at /app; '/' is the public landing page.
 */

interface ViewportCase {
  name: string;
  width: number;
  height: number;
}

const LANDSCAPE_VIEWPORTS: ViewportCase[] = [
  { name: '1280x600', width: 1280, height: 600 },
  { name: '1024x600', width: 1024, height: 600 },
  { name: '844x390', width: 844, height: 390 },
  { name: '800x360', width: 800, height: 360 },
  // Portrait regression: existing mobile behavior must keep working.
  { name: '390x844-portrait', width: 390, height: 844 },
];

// Desktop shells must stay exactly as today: fixed layout, no page scroll.
const DESKTOP_VIEWPORTS: ViewportCase[] = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

/** Dismiss first-run overlays (onboarding wizard + cookie consent) before app code runs. */
async function seedGuestContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'anclora_shiftimport_onboarding_v1',
      JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }),
    );
    window.localStorage.setItem(
      'anclora-cookie-consent-v1',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
}

async function gotoGuestApp(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.locator('.dashboard-header')).toBeVisible();
  await expect(page.locator('.month-grid-cells')).toBeAttached();
}

for (const vp of LANDSCAPE_VIEWPORTS) {
  test.describe(`guest layout ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('everything reachable, no clipping, square logo', async ({ page, context }) => {
      await seedGuestContext(context);
      await gotoGuestApp(page);

      // 1. No page-level horizontal overflow. (The calendar's own internal
      //    horizontal scroll under 980px is intended and lives inside
      //    .month-grid-shell, so documentElement must not overflow.)
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(horizontalOverflow, 'page-level horizontal overflow').toBeLessThanOrEqual(1);

      // 2. Header visible and horizontally within the viewport.
      const headerBox = await page.locator('.dashboard-header').boundingBox();
      expect(headerBox, 'header bounding box').not.toBeNull();
      expect(headerBox!.x, 'header left edge').toBeGreaterThanOrEqual(-1);
      expect(headerBox!.x + headerBox!.width, 'header right edge').toBeLessThanOrEqual(vp.width + 1);

      // 3. Logo stays square (regression: ellipse when the grid squeezed it).
      const logoBox = await page.locator('.dashboard-header .brand-mark').boundingBox();
      expect(logoBox, 'logo bounding box').not.toBeNull();
      expect(Math.abs(logoBox!.width - logoBox!.height), 'logo aspect').toBeLessThanOrEqual(1);

      // 4. Page scroll must not be blocked: when content is taller than the
      //    viewport, scrolling to the bottom has to move scrollY.
      const scrollProbe = await page.evaluate(() => {
        const before = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, maxScroll);
        return {
          before,
          after: window.scrollY,
          maxScroll,
        };
      });
      if (scrollProbe.maxScroll > 1) {
        expect(scrollProbe.after, 'page scroll is blocked').toBeGreaterThan(scrollProbe.before);
      }

      // 5. After scrolling to the bottom, the footer is actually in view.
      const footerBox = await page.locator('.legal-footer').boundingBox();
      expect(footerBox, 'footer bounding box').not.toBeNull();
      expect(footerBox!.y + footerBox!.height, 'footer reachable via scroll').toBeLessThanOrEqual(
        vp.height + 1,
      );

      // 6. Calendar reachable via vertical scroll and day cells not collapsed.
      const grid = page.locator('.month-grid-cells');
      await grid.scrollIntoViewIfNeeded();
      const gridBox = await grid.boundingBox();
      expect(gridBox, 'calendar bounding box').not.toBeNull();
      expect(gridBox!.y + gridBox!.height, 'calendar above viewport bottom').toBeGreaterThan(0);
      expect(gridBox!.y, 'calendar below viewport top').toBeLessThan(vp.height);

      const dayCellHeight = await page
        .locator('.month-day-cell')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(dayCellHeight, 'day cell collapsed to zero').toBeGreaterThanOrEqual(28);
    });
  });
}

for (const vp of DESKTOP_VIEWPORTS) {
  test.describe(`desktop regression ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('fixed shell unchanged: app fits, no page scroll', async ({ page, context }) => {
      await seedGuestContext(context);
      await gotoGuestApp(page);

      // The fixed 100dvh shell keeps the document exactly viewport-sized:
      // no vertical page scroll is possible (nor needed) on desktop.
      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(metrics.scrollHeight, 'unexpected vertical page scroll').toBeLessThanOrEqual(
        metrics.innerHeight + 1,
      );
      expect(metrics.scrollWidth - metrics.clientWidth, 'horizontal overflow').toBeLessThanOrEqual(1);

      const logoBox = await page.locator('.dashboard-header .brand-mark').boundingBox();
      expect(logoBox).not.toBeNull();
      expect(Math.abs(logoBox!.width - logoBox!.height), 'logo aspect').toBeLessThanOrEqual(1);
    });
  });
}
