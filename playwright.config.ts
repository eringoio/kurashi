import { defineConfig } from '@playwright/test';

// ブラウザは Windows に入っている Edge を使う（Playwright のブラウザを別に入れない）
// main：本番と同じデータ（5179）／drafts：下書きを読み込む dev:drafts 相当のサーバー（5180。tests/e2e/drafts/ だけ）
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { channel: 'msedge', locale: 'ja-JP' },
  projects: [
    { name: 'main', testIgnore: /drafts[\/]/, use: { baseURL: 'http://localhost:5179' } },
    // 下書きのカードは調査で長くなった（3つの幅×5つの画面を axe で見る）。1つのテストに3分まで
    { name: 'drafts', testMatch: /drafts[\/].*.spec.ts/, timeout: 180_000, use: { baseURL: 'http://localhost:5180' } },
  ],
  webServer: [
    { command: 'npx vite --port 5179 --strictPort', url: 'http://localhost:5179', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx vite --mode drafts --port 5180 --strictPort', url: 'http://localhost:5180', reuseExistingServer: true, timeout: 60_000 },
  ],
});
