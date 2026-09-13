import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs-csv-bulk',
  outputDir: './test-results-csv-bulk',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './csv-bulk-setup.ts',
  globalTeardown: './csv-bulk-teardown.ts',
  use: {
    baseURL: process.env.CSV_BULK_BASE_URL
      ?? 'https://anclora-shiftimport-git-development-pmi140979-6354s-projects.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
