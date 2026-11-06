/* 市内の引っ越し（公開。11/6 に転居届・転入届の2枚を公開にした）：別の区 → 区役所の日 */
import { expect, flow } from '../lib';

flow({
  id: 'move-within-public',
  title: '市内の引っ越し（公開の2枚）',
  touches: ['data/cards/move-within-tenkyo.json', 'data/cards/move-within-tennyu.json', 'data/events.json', 'data/questions.json', 'src/core/data.ts'],
  evidence: ['move-within-tenkyo', 'move-within-tennyu', 'docs/TODO_2026-11-06.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await page.getByRole('button', { name: 'はい' }).first().click();
  await page.getByRole('button', { name: /名古屋市の中で/ }).click();
  await snap({ name: '同じ区か', input: '引っ越し → はい → 名古屋市の中で', expected: '「引っ越した先は、前の住所と同じ区の中ですか？」（本番でも準備中にならない）', why: 'B-14 の 45：転居届・転入届を公開にした' },
    async () => { await expect(h1).toHaveText('引っ越した先は、前の住所と同じ区の中ですか？'); });
  await page.getByRole('button', { name: /別の区/ }).click();
  await snap({ name: '区役所の日', input: '別の区', expected: '「いつ、区役所に行きますか？」。下書きの帯は無い', why: '別の区は転入届' },
    async () => { await expect(h1).toHaveText('いつ、区役所に行きますか？'); await expect(page.locator('.draftband')).toHaveCount(0); });
});
