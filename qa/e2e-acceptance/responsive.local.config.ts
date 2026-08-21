import { defineConfig, devices } from '@playwright/test';

/**
 * Responsive E2E battery (guest mode, local-first): runs against plain
 * `vite dev` — NO vercel dev, NO Neon backend. Covers short landscape
 * viewports (tablet/phone landscape) plus portrait/desktop regressions.
 *
 * Run: npx playwright test --config qa/e2e-acceptance/responsive.local.config.ts
 */
export default defineConfig({
  testDir: './specs-responsive',
  outputDir: './test-results-responsive',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
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
