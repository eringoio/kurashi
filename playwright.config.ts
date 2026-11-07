import { defineConfig } from '@playwright/test';

// ブラウザは Windows に入っている Edge を使う（Playwright のブラウザを別に入れない）
export default defineConfig({
  testDir: 'tests/e2e',
  // a11y.spec.ts は1つのテストで 3つの幅×3つの文字の大きさを axe で見る。大きい画面（/review など）は60秒を超える
  timeout: 180_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { channel: 'msedge', locale: 'ja-JP' },
  projects: [
    { name: 'main', testIgnore: /drafts[\/]/, use: { baseURL: 'http://localhost:5179' } },
  ],
  webServer: [
    { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true, timeout: 60_000 },
  ],
});
