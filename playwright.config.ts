import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:1420', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
  // Every test intercepts the API; no authenticated Python bridge is needed.
  webServer: { command: 'npm run dev:ui', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI, timeout: 45000 },
});
