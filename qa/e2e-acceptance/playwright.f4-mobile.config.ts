import { defineConfig, devices } from '@playwright/test';

/**
 * F4 mobile E2E (F4-M04): the canonical QA runtime (scripts/qa/dev-runtime.mjs: vercel dev on the canonical Neon database) with a
 * run-scoped synthetic tenant (E2E-SHIFT-<runId>) seeded/removed by f4-mobile-setup.ts / f4-mobile-teardown.ts, built on qa-lib
 * (the local-setup.ts battery depends on a Docker database that this repo's QA does not use).
 *
 * Run: npm --prefix qa/e2e-acceptance run test:f4-mobile
 * Uses the system Google Chrome (`channel: 'chrome'`) with mobile emulation; no browser download. WebKit/Safari is NOT covered.
 */
export default defineConfig({
  testDir: './specs-f4-mobile',
  outputDir: './test-results-f4-mobile',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './f4-mobile-setup.ts',
  globalTeardown: './f4-mobile-teardown.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
    channel: 'chrome',
  },
  webServer: {
    // F2/F4 time-off surfaces are behind flags (server + client).
    command: 'TIME_OFF_ENABLED=true VITE_TIME_OFF_ENABLED=true node scripts/qa/dev-runtime.mjs',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 180_000,
    cwd: '../..',
  },
  projects: [
    {
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
});
