/* A1 の経路（SPEC 18 の e2e。答えは画面の操作だけで入れる。AT-73）。
   入口 → 住む場所 → 日本の外から → 持ち物 → 在留カードの裏 → 最初の質問 → 全体（1回） → いまの1つの確かめ → 日を決める → 開き直す。
   各画面で axe の違反 0 と、幅 320px で横スクロール 0 を確かめる。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// 日を固定する（平日の 2026-11-04 水曜。区役所が休みの日に「今日」が押せなくなるため。フローと同じ日）
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-04T09:00:00+09:00')); });

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();

test('A1：日本の外から来た人の経路が、保存と一緒に動く', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await expect(h1(page)).toHaveText('最近、住む場所は変わりましたか？');
  await check(page, '住む場所');
  await tap(page, 'はい');
  await expect(h1(page)).toHaveText('どこから引っ越しましたか？');
  await tap(page, '日本の外から');

  await expect(h1(page)).toHaveText('持っている物を、全部さわってください');
  for (const name of [/^在留カード/, /^パスポート/, /^部屋の鍵/, /^学生証/]) {
    const b = page.getByRole('button', { name });
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
  }
  await check(page, '持ち物');
  await tap(page, 'つぎへ');

  await expect(h1(page)).toHaveText('在留カードの裏に、今の住所が書いてありますか？');
  // 最初の答えで、保存の同意が出る（画面をふさがない。9.9）
  await expect(page.getByRole('region', { name: /残しますか/ })).toBeVisible();
  await check(page, '在留カードの裏');
  await tap(page, '書いてある');

  await expect(h1(page)).toHaveText(/今のおもな立場/);
  await tap(page, /^学生$/);
  await expect(h1(page)).toHaveText('年齢は？');
  await tap(page, '20歳から59歳まで');

  // 最初の確かめのあと、全体が1回だけ開く（6A.4）
  await expect(h1(page)).toHaveText('これからのこと');
  await check(page, '全体');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();

  // いまの1つ：確かめの質問を順に（国保・年金・口座・住み始めたか）。答えるたびに「この答えで変わったこと」→ つぎへ（試作 D）
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  await expect(h1(page)).toHaveText('健康保険はどれに入っていますか？');
  await check(page, 'いまの1つ');
  const answerThenNext = async (name: string | RegExp) => {
    await tap(page, name);
    await expect(page.locator('.eyebrow')).toHaveText('この答えで変わったこと');
    await tap(page, 'つぎへ');
  };
  await answerThenNext('まだどれにも入っていない');
  await answerThenNext(/^どちらでもない（厚生年金/);
  await expect(h1(page)).toHaveText('日本の銀行に、自分の口座はありますか？');
  await answerThenNext(/^ない$/);
  await expect(h1(page)).toHaveText('新しい住所に、もう住み始めましたか？');
  await answerThenNext(/^はい$/);

  // 日を決める：今日／今週のうちに／次の休みの日。選ぶと「〇〇に決めました」→ つぎへ で次の項目へ進む
  // 同じ所（区役所）の項目は、行く日を一度に聞く（6A.5）
  await expect(h1(page)).toHaveText('いつ、区役所に行きますか？');
  await expect(page.locator('.together .k-check')).toHaveCount(3);
  await expect(page.locator('.together')).toContainText('住所の届け');
  await check(page, '日を決める');
  // 区役所は今日にする（銀行の日は、住所の届けの日から後だけ選べる）
  await tap(page, /^今日/);
  await expect(h1(page)).toHaveText(/に決めました$/);
  await tap(page, 'つぎへ');
  // 区役所の3つは同じ日に決まったので、次は銀行
  await expect(h1(page)).toHaveText('いつ、銀行に行きますか？');

  // ほかの項目へは、いつでも移れる（全体から銀行を先に開いて、日を決める）
  await page.getByRole('link', { name: '全体を見る' }).click();
  await page.getByRole('link', { name: /銀行の口座/ }).click();
  await expect(h1(page)).toHaveText('銀行の口座');
  await check(page, '銀行の口座');
  await tap(page, 'いつ行くか決める');
  await tap(page, /^今日/);
  await expect(h1(page)).toHaveText(/に決めました$/);
  // 開いた項目の中で結果を見せ、つぎへ で いまの1つへ
  await tap(page, 'つぎへ');
  await expect(page).toHaveURL(/\/now$/);

  // 開き直すと、保存した進捗から「いまの1つ」へ（6A.1 の出し分け）
  // 銀行の日を今日にしたので、開き直すと「今日は行く日」（6A.1 の出し分けの5）
  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await expect(h1(page)).toHaveText('今日の予定');
  await check(page, '今日は行く日');
  await page.goto('/c/nagoya-tennyu-juukyochi');
  await expect(page.locator('.planned')).toBeVisible();
});

test('A1：在留カードがない人には、住民登録の根拠を1問だけ聞く。短い滞在は範囲外', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/move/from');
  await tap(page, '日本の外から');
  await tap(page, 'つぎへ');
  await expect(h1(page)).toHaveText('日本での住民登録について、あてはまるものは？');
  await check(page, '住民登録の根拠');
  await tap(page, /^住むためではない/);
  await expect(h1(page)).toHaveText('このアプリでは、まだ案内していません');
});

test('B1：ほかの市から来た人も、同じ画面とデータの追加だけで動く', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/move/from');
  await tap(page, 'ほかの市・町・村から');
  await expect(h1(page)).toHaveText('持っている物を、全部さわってください');
  await page.getByRole('button', { name: /^マイナンバーカード/ }).click();
  await page.getByRole('button', { name: /^部屋の鍵/ }).click();
  await check(page, '持ち物（B1）');
  await tap(page, 'つぎへ');
  await tap(page, /^学生$/);
  await tap(page, '20歳未満');
  await expect(h1(page)).toHaveText('これからのこと');
  // 国外からの経路のカード（住所の届け）は「関係なかったもの」に理由つきで入る
  await page.locator('summary', { hasText: '関係なかったもの' }).click();
  await expect(page.getByRole('link', { name: /住所の届け/ })).toBeVisible();
  await check(page, '全体（B1）');
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  await expect(h1(page)).toHaveText('前に住んでいた市区町村で、転出届を出しましたか？');
  await tap(page, 'マイナンバーカードを使って出した');
  await expect(page.locator('.eyebrow')).toHaveText('この答えで変わったこと');
  await check(page, '答えの結果（B1）');
});
