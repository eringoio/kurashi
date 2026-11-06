/* 11/7 の小さい直し：A-3（届いた書類がわからない）・病院（A-5、作者 11/7 の K-1〜K-4）・ことば（K-5） */
import { expect, flow } from '../lib';

flow({
  id: 'todo1107-small',
  title: '11/7 の小さい直し：届いた書類・病院の帯・ことば',
  touches: ['src/pages/Clinic.tsx', 'src/core/clinic.ts', 'data/clinic.json', 'src/ui/Words.tsx', 'src/pages/Letter.tsx', 'data/ui/strings.json'],
  evidence: ['docs/TODO_2026-11-07.md', 'tests/e2e/clinic.spec.ts'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  await page.goto('/');
  await snap({ name: '入口 届いた書類', input: '/ を開く', expected: '入口のメニューに「届いた書類がわからない」', why: 'A-3' },
    async () => { await expect(page.getByRole('link', { name: /届いた書類がわからない/ })).toBeVisible(); });
  await page.getByRole('link', { name: /届いた書類がわからない/ }).click();
  await snap({ name: '届いた書類 見出し', input: '「届いた書類がわからない」', expected: '見出し「届いた書類がわからないとき」', why: 'A-3' },
    async () => { await expect(h1).toHaveText('届いた書類がわからないとき'); });

  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.goto('/clinic');
    await snap({ name: '病院 帯 幅' + w, input: '/clinic（幅 ' + w + 'px）', expected: '題「困っている所を選んでください」と一文「病院の種類とアドバイスが出ます。」。白い枠の帯の中に、番号＋短い名前の3行と「救急車の呼び方」だけ（「番号のくわしく」は無い）', why: 'A-5a・K-1・K-2（作者 11/7）' },
      async () => { await expect(page.locator('.clinic__tel')).toHaveCount(3); await expect(page.getByRole('button', { name: '番号のくわしく' })).toHaveCount(0); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); });
  }
  await page.getByRole('button', { name: /^子ども/ }).first().click();
  await page.getByRole('button', { name: 'つぎへ' }).click();
  await snap({ name: '病院 2 診療科と公式のリンク', input: '子ども → つぎへ', expected: '「診断ではありません。…」。診療科のカード。下に「病院を探す公式のページ」はカードではなくリンクの一覧（↗）。大きな病院の料金は無い', why: 'K-3・K-4（作者 11/7：シンプルに）' },
    async () => { await expect(page.locator('.clinic__ext')).toHaveCount(3); await expect(page.getByText('大きな病院の初診の料金')).toHaveCount(0); });

  await page.goto('/words');
  await snap({ name: 'ことば', input: '/words（ふつうの日本語）', expected: '言う文は、ふりがな付きのやさしい日本語（例：日本語が少ししか話せません）と、下に英語の意味', why: 'K-5（作者 11/7：英語で表示しているときと同じ形）' },
    async () => { await expect(page.locator('.word__ja ruby').first()).toBeVisible(); await expect(page.locator('.word__mean[lang="en"]').first()).toBeVisible(); });
});
