/* 届いた書類を撮る（SPEC 6A.9）：見本の書類で、入口 → 写真の確かめ → 確認 → 結果 */
import { expect, flow } from '../lib';

flow({
  id: 'letter-sample',
  title: '届いた書類を撮る（見本）',
  touches: ['tests/e2e/letter.spec.ts', 'src/pages/Letter.tsx', 'src/core/documents.ts', 'data/documents.json', 'worker/**'],
  evidence: ['nagoya-kokuho-kanyu', 'docs/SPEC.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();

  await page.goto('/letter');
  await snap({ name: '入口', input: '/letter を開く', expected: '「届いた書類がわからないとき」。「写真を撮る」と、一覧から選ぶ・見本で試すの2つ', why: '写真を使わなくても進める（6A.9）' },
    async () => { await expect(h1).toHaveText('届いた書類がわからないとき'); await expect(page.locator('label', { hasText: '写真を撮る' })).toBeVisible(); });

  await tap('見本の書類で試す');
  await snap({ name: '写真の確かめ', input: '見本の書類で試す', expected: '「この写真を送りますか？」。見本の印と、送る前の同意の説明。まだ送っていない', why: '送る前に毎回、本人が確かめて同意する（13.1）' },
    async () => { await expect(h1).toHaveText('この写真を送りますか？'); await expect(page.locator('.draftmark')).toBeVisible(); });

  await tap(/^送る（同意する）/);
  await snap({ name: '確認', input: '送る（同意する）', expected: '「たぶん「国民健康保険の資格確認書」です」と、「書類の上のほうに、この言葉がありますか？」', why: 'AI の答えは候補。本人が書類の言葉で確かめる' },
    async () => { await expect(page.locator('.eyebrow')).toHaveText('たぶん「国民健康保険の資格確認書」です'); await expect(h1).toHaveText('書類の上のほうに、この言葉がありますか？'); });

  await tap('はい');
  await snap({ name: '結果', input: 'はい', expected: '書類の名前の見出し、説明、期限・金額は読まない注意、関係する手続きに国民健康保険', why: '確かめた書類だけ説明する。期限・金額は出さない' },
    async () => { await expect(h1).toHaveText('国民健康保険の資格確認書'); await expect(page.locator('section[aria-labelledby="letter-cards"]')).toContainText('国民健康保険'); });
});
