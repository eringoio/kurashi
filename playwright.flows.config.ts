import { defineConfig } from '@playwright/test';

// 操作の段階ごとのスクリーンショット記録（npm run shots）。ふだんの検査（npm run test:a11y）とは分ける。
// 順に1つずつ動かす（同時に動かすと、フォントの読み込みなどで画像がぶれることがあるため）
export default defineConfig({
  testDir: 'tests/flows',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { channel: 'msedge', locale: 'ja-JP' },
  projects: [
    { name: 'flows-main', testMatch: /main[\/].*\.flow\.ts/, use: { baseURL: 'http://localhost:5179' } },
  ],
  webServer: [
    { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true, timeout: 60_000 },
  ],
});
