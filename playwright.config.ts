import { defineConfig } from '@playwright/test';

// ブラウザは Windows に入っている Edge を使う（Playwright のブラウザを別に入れない）
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5179', channel: 'msedge', locale: 'ja-JP' },
  webServer: { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true, timeout: 60_000 },
});
