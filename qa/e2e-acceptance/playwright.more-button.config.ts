import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.MORE_BUTTON_BASE_URL ?? 'http://localhost:3199';

export default defineConfig({
  testDir: './specs-more-button',
  outputDir: './test-results-more-button',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  ...(process.env.MORE_BUTTON_BASE_URL ? {} : {
    webServer: {
      command: 'npx vercel dev --listen 3199 --yes',
      url: 'http://localhost:3199',
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: '../..',
    },
  }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
