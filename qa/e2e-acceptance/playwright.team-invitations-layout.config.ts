import { defineConfig, devices } from '@playwright/test';

const PRODUCTION_BASE_URL = 'https://shiftimport.anclora.com';
if (process.env.INVITATIONS_LAYOUT_BASE_URL && process.env.INVITATIONS_LAYOUT_BASE_URL !== PRODUCTION_BASE_URL) {
  throw new Error(`Invitations layout E2E is restricted to ${PRODUCTION_BASE_URL}`);
}

export default defineConfig({
  testDir: './specs-team-invitations-layout',
  testMatch: '**/team-invitations-layout.spec.ts',
  outputDir: './artifacts/team-invitations-layout',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './team-invitations-layout-setup.ts',
  globalTeardown: './team-invitations-layout-teardown.ts',
  use: {
    baseURL: PRODUCTION_BASE_URL,
    trace: 'retain-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'desktop-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1366x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'tablet-1024x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'tablet-768x1024', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-360x800', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
  ],
});
