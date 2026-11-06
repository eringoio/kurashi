/* 11/7 C-1：仕事・アルバイトを公開のデータへ。入口 → 国籍 → 在留資格（B-4 の2段）→ 何をするか → 全体 */
import { expect, flow } from '../lib';

flow({
  id: 'todo1107-job',
  title: '11/7 C-1：仕事・アルバイト（公開）',
  touches: ['data/events.json', 'data/questions.json', 'data/cards/zairyu-shikakugai.json', 'scripts/bundle-to-data.mjs'],
  evidence: ['docs/TODO_2026-11-07.md', 'tests/core/job.test.ts'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  await page.goto('/');
  await snap({ name: '入口', input: '/ を開く', expected: '入口のメニュー：引っ越し → ごみ → 届いた書類 → 病院 → 仕事・アルバイト → 銀行の口座 → 探す', why: 'C-1：公開。A-10 の順（在留期間の更新はまだ下書き）' },
    async () => { await expect(page.locator('a[href="/e/E-job"]')).toBeVisible(); });
  await page.locator('a[href="/e/E-job"]').click();
  await snap({ name: '国籍', input: '仕事・アルバイト', expected: '「国籍は？」（絵付きの2つ）', why: 'B-4' }, async () => { await expect(h1).toHaveText('国籍は？'); });
  await tap(/^日本以外の国籍/);
  await snap({ name: '在留資格', input: '日本以外の国籍', expected: '「在留資格は？」絵付きの7つ', why: 'B-4' }, async () => { await expect(h1).toHaveText('在留資格は？'); });
  await tap(/^留学/);
  await snap({ name: '何をするか', input: '留学', expected: '「何をしますか？」アルバイトを始めたい／就職する・した／辞める・辞めた', why: 'D-1' }, async () => { await expect(h1).toHaveText('何をしますか？'); });
  await tap(/^アルバイトを始めたい/);
  await snap({ name: '資格外活動許可', input: 'アルバイトを始めたい', expected: '「「資格外活動許可」をもう受けていますか？」', why: '留学・家族滞在だけに聞く' }, async () => { await expect(h1).toContainText('資格外活動許可'); });
  await tap(/^まだ|^いいえ/);
  await page.getByRole('link', { name: '全体' }).first().click();
  await snap({ name: '全体', input: 'まだ → 全体', expected: '資格外活動許可・最低賃金・労働条件・求人・困ったとき・社会保険など。公式のルールは要確認のまま', why: 'C-1：needs_check・ai_checked のまま公開' }, async () => { await expect(page.getByText('資格外活動許可').first()).toBeVisible(); });
});
