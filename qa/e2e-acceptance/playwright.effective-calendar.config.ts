import { defineConfig, devices } from '@playwright/test';

/**
 * Optional fallback: effective calendar acceptance on local Docker PostgreSQL.
 * It is not a required development QA gate; ordinary QA uses the persistent
 * QA Mirror on Neon Production main. The spec's synthetic tenant is removed.
 *
 * Run only when the local Docker fallback is explicitly enabled. The default
 * `npm run dev` remains connected to Neon Production main.
 *      EFFECTIVE_CALENDAR_DATABASE_URL=<local docker url> \
 *      npx playwright test --config qa/e2e-acceptance/playwright.effective-calendar.config.ts
 */
export default defineConfig({
  testDir: './specs-effective-calendar',
  outputDir: './test-results-effective-calendar',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
