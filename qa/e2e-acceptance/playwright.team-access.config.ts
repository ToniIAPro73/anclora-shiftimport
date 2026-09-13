import { defineConfig, devices } from '@playwright/test';

const PRODUCTION_BASE_URL = 'https://shiftimport.anclora.com';
if (process.env.TEAM_ACCESS_BASE_URL && process.env.TEAM_ACCESS_BASE_URL !== PRODUCTION_BASE_URL) {
  throw new Error(`Team-access E2E is restricted to ${PRODUCTION_BASE_URL}`);
}

export default defineConfig({
  testDir: './specs-team-access',
  testMatch: '**/team-access-cycle.spec.ts',
  outputDir: './test-results-team-access',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './team-access-setup.ts',
  globalTeardown: './team-access-teardown.ts',
  use: {
    baseURL: PRODUCTION_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'desktop-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
