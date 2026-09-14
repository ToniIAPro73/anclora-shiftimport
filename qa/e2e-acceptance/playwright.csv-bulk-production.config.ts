import { defineConfig, devices } from '@playwright/test';

const PRODUCTION_BASE_URL = 'https://shiftimport.anclora.com';
if (process.env.CSV_BULK_PRODUCTION_BASE_URL && process.env.CSV_BULK_PRODUCTION_BASE_URL !== PRODUCTION_BASE_URL) {
  throw new Error(`CSV bulk-import Production E2E is restricted to ${PRODUCTION_BASE_URL}`);
}

// Functional cycle — one viewport, real UI + API + DB. The existing
// playwright.csv-bulk.config.ts targets the development preview deployment
// and stays as the fast regression suite; this config is Production-only,
// mirroring the team-access harness pattern.
export default defineConfig({
  testDir: './specs-csv-bulk-production',
  testMatch: '**/csv-bulk-production-cycle.spec.ts',
  outputDir: './test-results-csv-bulk-production',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './csv-bulk-production-setup.ts',
  globalTeardown: './csv-bulk-production-teardown.ts',
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
