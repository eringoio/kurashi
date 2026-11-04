// 仮のロゴ（public/icons/logo.svg）から、ホーム画面用の PNG を作る。Windows の Edge で描く。
// 使い方：npm run icons
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/logo.svg', 'utf8');
const sizes = [
  ['public/icons/apple-touch-icon.png', 180, 0],
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/icon-512.png', 512, 0],
  // maskable：まわりを切られても絵が残るように、余白を取る
  ['public/icons/icon-512-maskable.png', 512, 0.12],
];
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const [file, size, pad] of sizes) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#fffdf8;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg style="width:${inner}px;height:${inner}px" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: false });
  console.log(file);
}
await browser.close();
