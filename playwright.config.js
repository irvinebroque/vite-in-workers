import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'browser.spec.js', workers: 1,
  timeout: 120_000,
  // Hosted builds allow 30 seconds of CPU, plus startup and network time.
  expect: { timeout: 45_000 },
  webServer: process.env.BUILD_URL ? undefined : {
    command: 'npm run dev', url: 'http://localhost:8787', reuseExistingServer: true, timeout: 60_000
  },
  use: { baseURL: process.env.BUILD_URL ?? 'http://localhost:8787', browserName: 'chromium' },
  reporter: [['list'], ['json', { outputFile: `reports/browser-${process.env.BUILD_URL ? 'hosted' : 'local'}.json` }]]
});
