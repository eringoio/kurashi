/* 11/7 A-4：入口の大きいロゴを消し、帯のロゴを幅で切り替える（480px〜 ロゴ、それより狭いとマーク）。帯は1段 */
import { expect, flow } from '../lib';

flow({
  id: 'todo1107-bar',
  title: '11/7 A-4：上の帯のロゴ（幅 320・360・390・480・1280）',
  touches: ['src/App.tsx', 'src/pages/Home.tsx', 'src/styles/app.css', 'public/icons/kurashi-mark.svg'],
  evidence: ['docs/TODO_2026-11-07.md'],
}, async (page, snap) => {
  for (const w of [320, 360, 390, 480, 1280]) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto('/');
    const full = w >= 480;
    await snap({ name: '入口 幅' + w, input: '/ を開く（幅 ' + w + 'px）', expected: (w >= 640 ? '帯にロゴ「Kurashi」と「試作」' : full ? '帯にロゴ「Kurashi」（「試作」の札は無し）' : '帯にマークだけ（「試作」の札は無し）') + '。帯は1段。本文に大きいロゴは無い', why: 'A-4：ロゴは帯だけ。320px で2段にしない' },
      async () => {
        await expect(page.locator(full ? '.brand__logo--full' : '.brand__logo--mark')).toBeVisible();
        await expect(page.locator('.art__logo')).toHaveCount(0);
        const h = await page.locator('header.bar').evaluate((e) => e.getBoundingClientRect().height);
        expect(h).toBeLessThan(70);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
  }
});
