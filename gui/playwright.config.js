// @ts-check
/**
 * Playwright configuration for E2E tests.
 * - Spins up Vite dev server before running tests
 * - Uses baseURL so tests can call page.goto('/')
 */

import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.WEBQUANTUMSAVORY_PLAYWRIGHT_BASE_URL?.trim()
const developmentServer = externalBaseUrl
  ? undefined
  : {
      // Never let Vite silently move to 5174 and make Playwright probe another
      // worktree's server on 5173.
      command: 'npm run dev -- --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    }

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.GITHUB_ACTIONS ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl || 'http://localhost:5173',
    trace: 'on-first-retry',
    viewport: { width: 1920, height: 1080 },
  },
  webServer: developmentServer,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
