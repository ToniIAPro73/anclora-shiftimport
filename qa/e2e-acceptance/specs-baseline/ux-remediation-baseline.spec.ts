import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { translate } from '../../../src/lib/i18n';

/**
 * UXR-F0-M01 / UXR-F0-M08 — reproducible baseline for the UX remediation
 * spec (sdd/features/ux-remediation-codex-2026-09/). Guest mode / local-first
 * only: no session, no Neon, no vercel dev — so the matrix never depends on
 * server-side timing or authenticated-role data (that gap is declared
 * explicitly below, not silently worked around).
 *
 * Determinism mitigations (see docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md):
 *  - Frozen Date (FIXED_TIME) via context.addInitScript, before any app code runs.
 *  - `reducedMotion: 'reduce'` (playwright.uxr-f0-baseline.config.ts) + an
 *    injected stylesheet forcing zero animation/transition duration.
 *  - `document.fonts.ready` awaited before every screenshot.
 *  - Fixed timezoneId (Europe/Madrid) in the config.
 *  - Explicit `deviceScaleFactor: 1` on every context — the manifest records
 *    it, so it must be controlled here rather than inherited from a default.
 *  - Screenshots are captured through `stableScreenshot()`, which re-captures
 *    until two consecutive buffers are byte-identical, and content assertions
 *    wait for a populated render (day-cell / plan-card counts) rather than
 *    `toBeAttached()`, which only proves a node exists in the DOM.
 *  - Scroll is reset to the top before capture, so a residual scroll offset
 *    can never differ between runs.
 *  - Scrollbars are never hidden — this is real Chromium via @playwright/test,
 *    not agent-browser (UXR-F0-M05): no hide-scrollbars flag exists to set.
 *
 * AC-1 VERIFICATION — measured, not assumed. Byte-identical sha256 across two
 * runs is NOT achievable on this stack and the reason is documented rather
 * than worked around: within one browser launch captures are byte-identical
 * (4/4 verified), but across separate processes the same settled DOM
 * rasterizes with sub-perceptual antialiasing jitter on glyph edges — measured
 * 13-107 differing pixels of 329 160 (0.004-0.033%), maxDelta 4-10 of 765,
 * with identical DOM and identical stylesheet order. So AC-1 is verified with
 * a documented tolerance by `compare-baseline-runs.mjs`, not by hash equality.
 * The sha256 in the manifest stays as an exact-identity fingerprint; it is not
 * the pass criterion.
 *
 *   UXR_BASELINE_RUN_ID=run1 npx playwright test --config playwright.uxr-f0-baseline.config.ts
 *   UXR_BASELINE_RUN_ID=run2 npx playwright test --config playwright.uxr-f0-baseline.config.ts
 *   node compare-baseline-runs.mjs run1 run2
 */

const FIXED_TIME = new Date('2026-09-15T10:00:00.000Z').getTime();

// Derived from the frozen clock, not hardcoded: the calendar under test always
// renders the month of FIXED_TIME (September 2026 → 30 day cells).
const FIXED_DATE = new Date(FIXED_TIME);
const DAYS_IN_FIXED_MONTH = new Date(
  Date.UTC(FIXED_DATE.getUTCFullYear(), FIXED_DATE.getUTCMonth() + 1, 0),
).getUTCDate();

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1728x1117', width: 1728, height: 1117 },
  { name: '844x390', width: 844, height: 390 },
] as const;

const THEMES = ['light', 'dark'] as const;
const LOCALES = ['es', 'en'] as const;

// Reduced cells for import-preview / pricing, matching the Fase 1 acceptance
// matrix (04_ACCEPTANCE_TEST_PLAN.md) rather than the full 8-viewport grid —
// documented decision, not a silent omission.
const REDUCED_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

// Each run lands in its own directory so two runs can be compared without one
// overwriting the other — AC-1 is a statement about two runs, so the artifacts
// of both have to survive. Defaults to `latest` when no run id is given.
const RUN_ID = process.env.UXR_BASELINE_RUN_ID ?? 'latest';
const OUT_DIR = join(__dirname, '..', 'artifacts', 'ux-remediation-baseline', RUN_ID);
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json');

type ManifestEntry = {
  id: string;
  screen: 'calendar' | 'import-preview' | 'pricing';
  viewport: string;
  theme: 'light' | 'dark';
  locale: 'es' | 'en';
  path: string;
  sha256: string;
  tool: '@playwright/test';
  browser: 'chromium';
  deviceScaleFactor: number;
  environment: 'LOCAL_BUILD';
  head: string;
  generatedAt: string;
  /** False when the render never stopped changing — a declared unstable cell,
   *  never silently folded into a "passing" baseline. */
  settled: boolean;
  settleTries: number;
};

const manifest: ManifestEntry[] = [];

async function seedGuestContext(context: BrowserContext, theme: 'light' | 'dark', locale: 'es' | 'en'): Promise<void> {
  // This config runs plain `vite dev` with no backend behind its /api proxy
  // (unlike playwright.local.config.ts, which needs vercel dev + Neon). A
  // proxy connection failure is NOT the same as a clean 401: src/lib/session.ts
  // fetchSession() only treats an explicit 401 as "guest" — anything else
  // (network/5xx) is left "unknown" and src/App.tsx redirects to /login
  // rather than risk exposing local drafts. So /api/session/me must be
  // faked as a real 401 here, or every capture lands on the login screen
  // instead of the guest dashboard.
  await context.route('**/api/session/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthenticated' }) }));

  await context.addInitScript(
    ({ fixedTime, theme, locale }) => {
      // Frozen clock: every `new Date()` and `Date.now()` resolves to fixedTime.
      class FixedDate extends Date {
        constructor(...args: ConstructorParameters<typeof Date>) {
          if (args.length === 0) {
            super(fixedTime);
          } else {
            super(...(args as []));
          }
        }
        static now(): number {
          return fixedTime;
        }
      }
      window.Date = FixedDate as DateConstructor;

      window.localStorage.setItem(
        'anclora_shiftimport_onboarding_v1',
        JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }),
      );
      window.localStorage.setItem(
        'anclora-cookie-consent-v1',
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
      window.localStorage.setItem('anclora_theme_mode', theme);
      window.localStorage.setItem('anclora_shiftimport_locale_v1', locale);
    },
    { fixedTime: FIXED_TIME, theme, locale },
  );
}

async function disableMotionAndWaitFonts(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`,
  });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Capture only once the rendered output has stopped changing. Returns the
 * first buffer that repeats byte-for-byte; if it never settles within
 * `attempts`, returns the last one and reports how many tries it took so the
 * caller can declare a genuinely unstable cell instead of hiding it.
 */
async function stableScreenshot(
  page: Page,
  { attempts = 10, settleMs = 200 }: { attempts?: number; settleMs?: number } = {},
): Promise<{ buffer: Buffer; settled: boolean; tries: number }> {
  await page.evaluate(() => window.scrollTo(0, 0));
  let previous = await page.screenshot({ fullPage: false });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.waitForTimeout(settleMs);
    const next = await page.screenshot({ fullPage: false });
    if (next.equals(previous)) {
      return { buffer: next, settled: true, tries: attempt };
    }
    previous = next;
  }
  return { buffer: previous, settled: false, tries: attempts };
}

function recordAndHash(
  capture: { buffer: Buffer; settled: boolean; tries: number },
  entry: Omit<
    ManifestEntry,
    'sha256' | 'path' | 'tool' | 'browser' | 'environment' | 'generatedAt' | 'head' | 'settled' | 'settleTries'
  >,
): void {
  const { buffer } = capture;
  const fileName = `${entry.screen}-${entry.locale}-${entry.theme}-${entry.viewport}.png`;
  const filePath = join(OUT_DIR, fileName);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(filePath, buffer);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  manifest.push({
    ...entry,
    path: `qa/e2e-acceptance/artifacts/ux-remediation-baseline/${RUN_ID}/${fileName}`,
    sha256,
    tool: '@playwright/test',
    browser: 'chromium',
    environment: 'LOCAL_BUILD',
    head: process.env.UXR_BASELINE_HEAD ?? 'UNKNOWN',
    generatedAt: process.env.UXR_BASELINE_RUN_ID ?? new Date().toISOString(),
    settled: capture.settled,
    settleTries: capture.tries,
  });
}

test.describe.configure({ mode: 'serial' });

for (const theme of THEMES) {
  for (const locale of LOCALES) {
    for (const vp of VIEWPORTS) {
      test(`calendar ${locale} ${theme} ${vp.name}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await seedGuestContext(context, theme, locale);
        const page = await context.newPage();
        await page.goto('/app');
        await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
        // Populated, not merely attached: every day cell of the frozen month
        // must be rendered before the grid can be considered stable.
        await expect(page.locator('.month-day-cell')).toHaveCount(DAYS_IN_FIXED_MONTH);
        await disableMotionAndWaitFonts(page);
        const capture = await stableScreenshot(page);
        recordAndHash(capture, { id: `calendar-${locale}-${theme}-${vp.name}`, screen: 'calendar', viewport: vp.name, theme, locale, deviceScaleFactor: 1 });
        await context.close();
      });
    }
  }
}

for (const theme of THEMES) {
  for (const locale of LOCALES) {
    for (const vp of REDUCED_VIEWPORTS) {
      test(`pricing ${locale} ${theme} ${vp.name}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await seedGuestContext(context, theme, locale);
        const page = await context.newPage();
        await page.goto('/pricing');
        await expect(page.locator('body')).toBeVisible();
        // All plan cards rendered before capture (PLAN_IDS: free/personal/team).
        await expect(page.locator('.pricing-card')).toHaveCount(3);
        await disableMotionAndWaitFonts(page);
        const capture = await stableScreenshot(page);
        recordAndHash(capture, { id: `pricing-${locale}-${theme}-${vp.name}`, screen: 'pricing', viewport: vp.name, theme, locale, deviceScaleFactor: 1 });
        await context.close();
      });
    }
  }
}

const FIXTURE_PATH = join(__dirname, '..', '..', '..', 'test-data', 'fixtures', 'manual-qa-state-contract', '01_READY_structured.csv');

for (const theme of THEMES) {
  for (const locale of LOCALES) {
    for (const vp of REDUCED_VIEWPORTS) {
      test(`import-preview ${locale} ${theme} ${vp.name}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        await seedGuestContext(context, theme, locale);
        const page = await context.newPage();
        await page.goto('/app');
        await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
        const mobileMenu = page.locator('[data-testid="app-shell-mobile-menu"]');
        if (await mobileMenu.isVisible().catch(() => false)) {
          await mobileMenu.click();
        }
        await page.locator('[data-testid="sidebar-import"]').click();
        await expect(page.locator('.import-modal')).toBeVisible();
        await page.locator('.import-modal input[type=file]').first().setInputFiles(FIXTURE_PATH);
        await page.getByRole('button', { name: translate(locale, 'importModal.process') }).click();
        await expect(page.locator('.import-modal__shifts-list table tbody tr')).toHaveCount(5, { timeout: 20_000 });
        await disableMotionAndWaitFonts(page);
        const capture = await stableScreenshot(page);
        recordAndHash(capture, { id: `import-preview-${locale}-${theme}-${vp.name}`, screen: 'import-preview', viewport: vp.name, theme, locale, deviceScaleFactor: 1 });
        await context.close();
      });
    }
  }
}

test.afterAll(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
});
