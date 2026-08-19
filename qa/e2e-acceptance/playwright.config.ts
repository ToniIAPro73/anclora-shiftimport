import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone acceptance battery for the deployed development app.
 * Run: npx playwright test --config qa/e2e-acceptance/playwright.config.ts
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  timeout: 35 * 60 * 1000, // OCR + security-checkpoint retry budget
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1, // shared deployed target + deterministic localStorage per case
  retries: 1, // one fresh-state retry, per battery protocol (absorbs checkpoint flakes)
  reporter: [['list'], ['json', { outputFile: 'artifacts/playwright-report.json' }]],
  use: {
    baseURL: 'https://anclora-shiftimport-git-development-pmi140979-6354s-projects.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    locale: 'es-ES',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
