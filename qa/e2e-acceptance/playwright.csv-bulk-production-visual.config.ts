import { defineConfig, devices } from '@playwright/test';

const PRODUCTION_BASE_URL = 'https://shiftimport.anclora.com';
if (process.env.CSV_BULK_PRODUCTION_BASE_URL && process.env.CSV_BULK_PRODUCTION_BASE_URL !== PRODUCTION_BASE_URL) {
  throw new Error(`CSV bulk-import Production E2E is restricted to ${PRODUCTION_BASE_URL}`);
}

// Visual-states-only run (task's 5 contract viewports x light/dark): opens
// both importers and reaches a real preview, but never confirms an import —
// no invitation is created, no email is ever sent by this spec.
export default defineConfig({
  testDir: './specs-csv-bulk-production',
  testMatch: '**/csv-bulk-production-visual.spec.ts',
  outputDir: './test-results-csv-bulk-production-visual',
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
    locale: 'es-ES',
  },
  projects: [
    { name: 'desktop-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1366x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'tablet-1024x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-360x800', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
  ],
});
