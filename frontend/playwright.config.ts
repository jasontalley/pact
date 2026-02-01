import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

// Resolve paths relative to this config file's location
// Note: __dirname works here because Playwright's TS loader uses CommonJS
// In Docker (CI=true), frontend is at /app so test-results go to /app/test-results
// On host, frontend is in a subdirectory so we go up one level to project root
const isDocker = process.env.CI === 'true';
const projectRoot = isDocker ? __dirname : path.resolve(__dirname, '..');

/**
 * Playwright E2E test configuration for Pact frontend
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use 4 workers in CI for faster execution, auto-detect locally
  workers: process.env.CI ? 4 : undefined,
  // Default timeout of 15s for test execution
  timeout: 15000,
  expect: {
    // Expect timeout of 10s for assertions
    timeout: 10000,
  },
  reporter: [
    // HTML reporter first to avoid directory conflicts
    // Use absolute path resolved from config file location
    ['html', { outputFolder: path.resolve(projectRoot, 'test-results/frontend/e2e/html-report') }],
    ['json', { outputFile: path.resolve(projectRoot, 'test-results/frontend/e2e/results.json') }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Action timeout for clicks, fills, etc.
    actionTimeout: 10000,
    // Navigation timeout
    navigationTimeout: 15000,
  },

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
    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Run local dev server before tests if not in CI
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3001',
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },

  // Output directory for test artifacts
  outputDir: path.resolve(projectRoot, 'test-results/frontend/e2e/artifacts'),
});
