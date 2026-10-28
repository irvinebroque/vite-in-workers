import { defineConfig } from '@playwright/test';
const port = process.env.TEST_PORT ?? '8790';
const localURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.js', workers: 1,
  timeout: 120_000,
  // Hosted builds allow 30 seconds of CPU, plus startup and network time.
  expect: { timeout: 45_000 },
  webServer: process.env.BUILD_URL ? undefined : {
    command: 'npm run dev', url: localURL, reuseExistingServer: false, timeout: 60_000,
    env: { TEST_PORT: port, TEST_STATE_DIR: '.cloudflare/browser-tests' }
  },
  use: { baseURL: process.env.BUILD_URL ?? localURL, browserName: 'chromium' },
  reporter: [['list'], ['json', { outputFile: `reports/browser-${process.env.BUILD_URL ? 'hosted' : 'local'}.json` }]]
});
