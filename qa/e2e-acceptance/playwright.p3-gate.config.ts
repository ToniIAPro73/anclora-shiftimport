import { defineConfig, devices } from '@playwright/test';

/** One browser smoke for the dialog contract; surface variants stay in fast component tests. */
export default defineConfig({
  testDir: './specs-gate',
  testMatch: ['**/p3-dialogs.spec.ts'],
  outputDir: '/tmp/shiftimport-p3-gate-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
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
    { name: 'chromium-p3', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
