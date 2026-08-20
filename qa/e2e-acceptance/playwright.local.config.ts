import { defineConfig, devices } from '@playwright/test';

/**
 * Local E2E battery (Fase 1.1): runs against `vercel dev` with the real
 * Neon development branch. Fixtures are seeded/removed by global setup /
 * teardown (qa/e2e-acceptance/local-*.ts).
 *
 * Run: npx playwright test --config qa/e2e-acceptance/playwright.local.config.ts
 * Requires: vercel link + .env.development.local (DATABASE_URL).
 */
export default defineConfig({
  testDir: './specs-local',
  outputDir: './test-results-local',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './local-setup.ts',
  globalTeardown: './local-teardown.ts',
  use: {
    baseURL: 'http://localhost:3199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  webServer: {
    command: 'npx vercel dev --listen 3199 --yes',
    url: 'http://localhost:3199',
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: '../..',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
