import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs-invitations',
  outputDir: './test-results-invitations',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './invitations-setup.ts',
  globalTeardown: './invitations-teardown.ts',
  use: {
    baseURL: process.env.INVITATIONS_BASE_URL
      ?? 'https://anclora-shiftimport-git-development-pmi140979-6354s-projects.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'chromium-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
