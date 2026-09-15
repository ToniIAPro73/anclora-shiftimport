import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs-compatibility',
  outputDir: './test-results-compatibility-production',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  globalSetup: './local-setup.ts',
  globalTeardown: './local-teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://shiftimport.anclora.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  projects: [{ name: 'chromium-production', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
