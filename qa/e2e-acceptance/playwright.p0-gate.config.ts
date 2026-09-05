import { defineConfig, devices } from '@playwright/test';

/**
 * Compact P0 release-gate profile.
 *
 * The default local profile remains the exhaustive historical regression
 * battery. This profile runs one focused scenario per critical contract so a
 * Gate does not spend time repeating login, menu, locale, and teardown flows
 * already covered by the component/integration suites.
 */
export default defineConfig({
  testDir: './specs-gate',
  testMatch: ['**/p0-compact.spec.ts'],
  outputDir: '/tmp/shiftimport-p0-gate-results',
  timeout: 180_000,
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
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
