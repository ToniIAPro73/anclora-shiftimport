import { defineConfig, devices } from '@playwright/test';
import { STATE_FILE } from './helpers/qa-mirror';

/**
 * Autonomous QA against the persistent QA mirror (development code, production
 * database, dedicated QA identity). No manual login, no real accounts.
 *
 *   node scripts/qa/ensure-qa-identity.mjs && node scripts/qa/refresh-qa-mirror.mjs --apply
 *   vercel dev --local --listen 5173          # in another shell
 *   npm --prefix qa/e2e-acceptance run test:qa-mirror
 */
export default defineConfig({
  testDir: './specs-qa-mirror',
  outputDir: './test-results-qa-mirror',
  globalSetup: './qa-mirror-setup.ts',
  globalTeardown: './qa-mirror-teardown.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    storageState: STATE_FILE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
