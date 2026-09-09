import { defineConfig, devices } from '@playwright/test';

/**
 * UXR-F0-M01 / UXR-F0-M08 — reproducible visual baseline (guest mode,
 * local-first): runs against plain `vite dev`, NO vercel dev, NO Neon
 * backend, so the matrix never depends on authenticated-role data or
 * server-side timing. See docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md
 * for the full documented procedure (this file + the spec are the
 * executable half of it).
 *
 * Run: npx playwright test --config qa/e2e-acceptance/playwright.uxr-f0-baseline.config.ts
 */
export default defineConfig({
  testDir: './specs-baseline',
  outputDir: './test-results-uxr-f0-baseline',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'off',
    screenshot: 'off',
    timezoneId: 'Europe/Madrid',
    reducedMotion: 'reduce',
    // UXR-F0-M01 — variance reduction for rasterization. These remove real
    // sources of jitter (LCD subpixel AA, font hinting, GPU rasterization,
    // color profile) but they do NOT achieve byte-identical PNGs across
    // separate processes: measured residual is ~13-107 differing pixels out of
    // 329 160 (0.004-0.033%), maxDelta 4-10 of 765, scattered on glyph edges.
    // Within a single browser launch, captures ARE byte-identical (verified
    // 4/4). See the AC-1 tolerance decision in
    // docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md §M01.
    launchOptions: {
      args: [
        '--force-color-profile=srgb',
        '--font-render-hinting=none',
        '--disable-lcd-text',
        '--disable-gpu',
        '--disable-skia-runtime-opts',
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: '../..',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
