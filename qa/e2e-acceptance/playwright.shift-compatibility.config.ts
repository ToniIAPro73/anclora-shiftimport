import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs-compatibility',
  outputDir: './test-results-compatibility',
  timeout: 120_000,
  expect: { timeout: 15_000 },
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
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
