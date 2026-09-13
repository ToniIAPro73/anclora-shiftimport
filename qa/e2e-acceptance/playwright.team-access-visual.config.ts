import { defineConfig, devices } from '@playwright/test';

const PRODUCTION_BASE_URL = 'https://shiftimport.anclora.com';
if (process.env.TEAM_ACCESS_BASE_URL && process.env.TEAM_ACCESS_BASE_URL !== PRODUCTION_BASE_URL) {
  throw new Error(`Team-access E2E is restricted to ${PRODUCTION_BASE_URL}`);
}

// Visual-states-only run (section 10 review): revoke confirmation and
// grant-access modal, in light and dark (handled inside the spec), across
// the 3 contract viewports. Never submits either modal, so it never creates
// an invitation or sends an email — safe to run at any viewport count.
export default defineConfig({
  testDir: './specs-team-access',
  testMatch: '**/team-access-visual.spec.ts',
  outputDir: './test-results-team-access-visual',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './team-access-setup.ts',
  globalTeardown: './team-access-teardown.ts',
  use: {
    baseURL: PRODUCTION_BASE_URL,
    trace: 'retain-on-failure',
    locale: 'es-ES',
  },
  projects: [
    { name: 'desktop-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet-1024x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
});
