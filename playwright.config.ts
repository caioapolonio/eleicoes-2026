import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const channel = process.env.PLAYWRIGHT_CHANNEL
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  globalTimeout: 240_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
  // E2E_BASE_URL lets the same tests exercise the production nginx container in CI.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'bun run preview --host 127.0.0.1 --port 4173 --ignore-lock',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 30_000,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 3_000 },
      },
})
