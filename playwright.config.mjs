import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
      ...(process.env.PLAYWRIGHT_NO_SANDBOX === 'true' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // This is a static file server for the test page, NOT an RPC proxy.
  webServer: { command: 'node web/server.mjs', env: { PORT: '4173', HOST: '0.0.0.0' }, url: 'http://127.0.0.1:4173/health', reuseExistingServer: !process.env.CI },
});
