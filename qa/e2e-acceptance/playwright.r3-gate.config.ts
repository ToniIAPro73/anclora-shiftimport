import { defineConfig, devices } from '@playwright/test';

/**
 * Deterministic R3 Final Gate battery.
 *
 * The default local battery remains the exhaustive 45-test regression suite.
 * This profile is the release gate: it retains the cross-domain risk matrix
 * and removes only duplicated UI/login coverage already gated by R1/R2/R3.
 */
export default defineConfig({
  testDir: './specs-local',
  testMatch: [
    '**/auth-import-security.spec.ts',
    '**/cross-tenant-isolation.spec.ts',
    '**/future-import.spec.ts',
    '**/import-integrity.spec.ts',
    '**/scheduling-authz.spec.ts',
    '**/scheduling-e2e.spec.ts',
  ],
  outputDir: './test-results-r3-gate',
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
