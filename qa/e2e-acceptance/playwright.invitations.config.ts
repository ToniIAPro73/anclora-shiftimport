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
  // The 5 contract viewports for the accept-invitation surface.
  projects: [
    { name: 'desktop-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1366x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'tablet-1024x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-360x800', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
  ],
});
