import { defineConfig, devices } from '@playwright/test';

/**
 * Effective calendar acceptance (local Docker PostgreSQL only).
 * Seeds its own synthetic organization inside the spec and removes it after.
 *
 * Run: npm run dev   # vercel dev on :5173 against the Docker database
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
