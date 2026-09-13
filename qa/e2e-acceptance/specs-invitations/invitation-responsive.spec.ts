import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadFixture() {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'invitations-fixture.json'), 'utf8')) as {
    tokensByProject: Record<string, { createToken: string; linkToken: string }>;
  };
}

// Contract viewports for the accept-invitation surface — every one must
// render the whole card, with the CTA fully visible, with zero vertical or
// horizontal scroll. This is validated against the real rendered UI (actual
// layout/measurements in a live browser), not a DOM snapshot.
const VIEWPORTS = [
  { name: '1440x900 desktop', width: 1440, height: 900 },
  { name: '1366x768 desktop', width: 1366, height: 768 },
  { name: '1024x768 tablet', width: 1024, height: 768 },
  { name: '390x844 mobile', width: 390, height: 844 },
  { name: '360x800 mobile', width: 360, height: 800 },
];

test('la superficie de aceptación cabe sin scroll en los 5 viewports contractuales, cuenta nueva y existente', async ({ page }, testInfo) => {
  // Reading (validating) a token never consumes it, so the same fixture
  // tokens can be reused across every viewport check below without
  // interfering with the accept-flow tests in invitations.spec.ts, which
  // run in separate browser contexts.
  test.skip(testInfo.project.name !== 'chromium-desktop', 'viewport contract only needs to be checked once, not once per project');
  const fixture = loadFixture();
  const tokens = fixture.tokensByProject['chromium-desktop'];

  for (const mode of ['createToken', 'linkToken'] as const) {
    await page.goto(`/accept-invitation#token=${encodeURIComponent(tokens[mode])}`);
    await expect(page.locator('[data-testid="accept-invitation-screen"]')).toBeVisible();
    await expect.poll(() => page.url()).toMatch(/\/accept-invitation$/);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // Let layout settle after the resize before measuring.
      await page.waitForTimeout(50);

      const measurements = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
      }));
      expect(measurements.scrollWidth, `${mode} @ ${viewport.name}: no horizontal scroll`).toBeLessThanOrEqual(measurements.clientWidth);
      expect(measurements.scrollHeight, `${mode} @ ${viewport.name}: no vertical scroll`).toBeLessThanOrEqual(measurements.clientHeight);

      const cta = page.getByRole('button', { name: /crear cuenta y aceptar|añadir acceso y aceptar/i });
      await expect(cta, `${mode} @ ${viewport.name}: CTA visible`).toBeVisible();
      const box = await cta.boundingBox();
      expect(box, `${mode} @ ${viewport.name}: CTA has a bounding box`).not.toBeNull();
      if (box) {
        expect(box.x, `${mode} @ ${viewport.name}: CTA left edge inside viewport`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${mode} @ ${viewport.name}: CTA top edge inside viewport`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${mode} @ ${viewport.name}: CTA right edge inside viewport`).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y + box.height, `${mode} @ ${viewport.name}: CTA bottom edge inside viewport`).toBeLessThanOrEqual(viewport.height + 1);
      }
    }
  }
});
