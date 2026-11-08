/* 11/7 C-1：仕事・アルバイトを公開のデータへ。入口 → 何をするか → 国籍 → 在留資格（v0.5.32：目的が先）→ 全体 */
import { expect, flow } from '../lib';

flow({
  id: 'todo1107-job',
  title: '11/7 C-1：仕事・アルバイト（公開）と、作者 11/7 の K-12〜K-14',
  touches: ['data/events.json', 'data/questions.json', 'data/cards/zairyu-shikakugai.json', 'scripts/bundle-to-data.mjs'],
  evidence: ['docs/TODO_2026-11-07.md', 'tests/core/job.test.ts'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  await page.goto('/');
  await snap({ name: '入口', input: '/ を開く', expected: '入口のメニュー：引っ越し → ごみ → 届いた書類 → 病院 → 仕事・アルバイト → 銀行の口座 → 探す', why: 'C-1：公開。A-10 の順（在留期間の更新はまだ下書き）' },
    async () => { await expect(page.locator('a[href="/e/E-job"]')).toBeVisible(); });
  await page.locator('a[href="/e/E-job"]').click();
  await snap({ name: '何をするか', input: '仕事・アルバイト', expected: '最初に「何をしますか？」アルバイトを始める／就職・転職する／アルバイトを辞める／仕事を辞める・辞めた／個人事業を始める・やめる（下に、会社・基本情報）', why: 'D-1・v0.5.32（目的を最初に聞く）' }, async () => { await expect(h1).toHaveText('何をしますか？'); });
  await tap(/^アルバイトを始める/);
  await snap({ name: '国籍', input: 'アルバイトを始める', expected: '「国籍は？」（絵付きの2つ）', why: 'B-4' }, async () => { await expect(h1).toHaveText('国籍は？'); });
  await tap(/^日本以外の国籍/);
  await snap({ name: '在留資格', input: '日本以外の国籍', expected: '「在留資格は？」絵付きの7つ', why: 'B-4' }, async () => { await expect(h1).toHaveText('在留資格は？'); });
  await tap(/^留学/);
  await snap({ name: '資格外活動許可', input: "アルバイトを始める", expected: '「「資格外活動許可」を受けていますか？」（包括許可・個別許可・両方・まだ・わからない）', why: '留学・家族滞在だけに聞く' }, async () => { await expect(h1).toContainText('資格外活動許可'); });
  await tap(/^まだ|^いいえ/);
  await page.getByRole('link', { name: '全体' }).first().click();
  await snap({ name: '全体', input: 'まだ → 全体', expected: '資格外活動許可・最低賃金・労働条件・求人・困ったとき・社会保険など。公式のルールは要確認のまま', why: 'C-1：needs_check・ai_checked のまま公開' }, async () => { await expect(page.getByText('資格外活動許可').first()).toBeVisible(); });
  for (const [name, to, text, why] of [
    ['最低賃金', '/e/E-job/c/job-saitei-chingin', '1,195円', 'K-13：「1時間 1,195円です」と最小限。くわしくは愛知労働局のリンク（↗）'],
    ['会社の保険・年金', '/e/E-job/c/job-shakai-hoken', '週20時間', 'K-13：何の案内か分かる題（会社の保険・年金に入るか）'],
    ['在留期間の更新', '/e/E-stay-renew/c/zairyu-koshin', '必要な書類', 'K-12：入管の「在留期間更新許可申請」のページへのリンク（↗）'],
    ['口座を作る（注意）', '/e/E-bank/c/bank-account-open', '売ったり渡したり', 'K-14：「口座を売らない」は手続きのカードではなく、口座を作るときの注意'],
  ] as const) {
    await page.goto(to);
    await snap({ name, input: to, expected: '「' + text + '」が見える', why }, async () => { await expect(page.locator('main')).toContainText(text); });
  }
});
