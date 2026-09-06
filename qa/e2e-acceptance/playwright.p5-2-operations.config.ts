import { defineConfig, devices } from '@playwright/test';

/** One compact P5.2 browser journey; role/time combinations stay in unit,
 * integration and API tests to keep the gate deterministic and fast. */
export default defineConfig({
  testDir: './specs-gate',
  testMatch: ['**/p5-2-operations.spec.ts'],
  outputDir: './test-results-p5-2-operations',
  timeout: 120_000,
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
    { name: 'chromium-operations', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
  ],
});
