import { defineConfig, devices } from '@playwright/test';

/** One compact shell journey. API/domain coverage remains in P5; this spec
 * only observes the navigation and workspace boundaries that need a browser. */
export default defineConfig({
  testDir: './specs-gate',
  testMatch: ['**/p5-1-shell-smoke.spec.ts'],
  outputDir: './test-results-p5-1-shell',
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
  projects: [
    { name: 'chromium-shell', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
  ],
});
