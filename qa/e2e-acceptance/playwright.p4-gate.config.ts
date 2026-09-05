import { defineConfig, devices } from '@playwright/test';

/** Compact P4 browser contract: one synthetic planner journey, several viewports. */
export default defineConfig({
  testDir: './specs-gate',
  testMatch: ['**/p4-responsive-a11y.spec.ts'],
  outputDir: '/tmp/shiftimport-p4-gate-results',
  timeout: 120_000,
  expect: { timeout: 30_000 },
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
    { name: 'chromium-p4', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
