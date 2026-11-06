/* 付き添い（SPEC 6A.6）の e2e。A1 の経路で「区役所の3つを今日に決めた」状態まで画面の操作だけで行き、
   今日 → 行く前 → 窓口で → 終わったら → 結果 を確かめる。各画面で axe 0 と、幅 320px で横スクロール 0。
   URL にクエリ文字列と数字を入れない（13.4）。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// 日を固定する（平日の 2026-11-04 水曜。区役所が休みの日に「今日」が押せなくなるため。フローと同じ日）
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-04T09:00:00+09:00')); });

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
}
function cleanUrl(page: Page, what: string) {
  const u = new URL(page.url());
  expect(u.search, what + ' クエリ文字列').toBe('');
  expect(u.pathname, what + ' 数字').not.toMatch(/\d/);
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();

/** A1 の経路で、区役所の3つ（住所の届け・国保・年金）を今日に決めて、つぎへ まで。保存に同意する */
async function planWardToday(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  await tap(page, '日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^部屋の鍵/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap(page, 'つぎへ');
  await tap(page, '書いてある');
  await tap(page, /^学生$/);
  await tap(page, '20歳から59歳まで');
  await expect(h1(page)).toHaveText('これからのこと');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  const answerThenNext = async (name: string | RegExp) => {
    await tap(page, name);
    await expect(page.locator('.k-change__line')).toHaveText(/になりました$/);
  };
  await answerThenNext('まだどれにも入っていない');
  await answerThenNext(/^どちらでもない（厚生年金/);
  await answerThenNext(/^ない$/);
  await answerThenNext(/^はい$/);
  await expect(h1(page)).toHaveText('いつ、区役所に行きますか？');
  await tap(page, /^今日/);
  await expect(page.locator('.k-change__line')).toHaveText(/に決めました$/);
  await expect(h1(page)).toHaveText('今日は行く日です'); // 今日に決めたので、今日の予定を先に出す（K-35）
}

/** 今日 → 区役所の付き添いを始める（行く前） */
async function startVisit(page: Page) {
  await planWardToday(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole('link', { name: '区役所へ行く準備をする' }).click();
  await expect(page).toHaveURL(/\/visit\/ward_office$/);
  await expect(h1(page)).toHaveText('持ち物を確かめましょう');
}
async function toAfter(page: Page) {
  await tap(page, '区役所に着いた');
  await tap(page, '終わった');
  await expect(h1(page)).toHaveText('どうでしたか？');
}

test('付き添い：行く前 → 窓口で → 終わったら → 全部できた', async ({ page }) => {
  await startVisit(page);
  cleanUrl(page, '行く前');
  await expect(page.locator('main')).toContainText('行く前');
  await check(page, '行く前');

  const bring = page.locator('.k-check');
  await expect(bring).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^在留カード/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^パスポート/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^学生証/ })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await expect(bring.nth(i)).toHaveAttribute('aria-pressed', 'false');
    await bring.nth(i).click();
    await expect(bring.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }
  await check(page, '持ち物を入れた');

  await tap(page, '区役所に着いた');
  await expect(page).toHaveURL(/\/visit\/ward_office\/counter$/);
  cleanUrl(page, '窓口で');
  await expect(h1(page)).toHaveText('この画面を窓口の人に見せましょう');
  await expect(page.locator('section.k-counter')).toHaveCount(3);
  await expect(page.locator('main')).toContainText('転入届（住居地の届出）の手続きをしたいです。');
  await check(page, '窓口で');

  await tap(page, '終わった');
  await expect(page).toHaveURL(/\/visit\/ward_office\/after$/);
  cleanUrl(page, '終わったら');
  await expect(h1(page)).toHaveText('どうでしたか？');
  // B-7（作者 11/6）：一番上に「全部できた」。手続きごとに できた／できなかった。行けなかったは下のリンク
  await expect(page.getByRole('button', { name: '全部できた' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'できた', exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'できなかった', exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: '記録する' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '行けなかった' })).toBeVisible();
  await check(page, '終わったら');

  await tap(page, '全部できた');
  await expect(page.locator('.eyebrow')).toHaveText('記録しました');
  await expect(h1(page)).toHaveText('区役所の手続きが、できました');
  cleanUrl(page, '結果');
  await check(page, '結果');
  await tap(page, 'つぎへ');
  await expect(page).toHaveURL(/\/now$/);
});

// B-7（作者 11/6）：手続きごとの2択。できなかったの理由は任意。選んでいない手続きは未確認（今日の予定に残る）
const row = (page: Page, name: RegExp) => page.getByRole('group', { name });

test('付き添い：国保だけ「できなかった（別の書類が要る）」、住所の届けは「できた」、年金は選ばない → 未確認は今日の予定に残る', async ({ page }) => {
  await startVisit(page);
  await toAfter(page);
  await row(page, /国民健康保険/).getByRole('button', { name: 'できなかった', exact: true }).click();
  await row(page, /国民健康保険/).getByRole('button', { name: '別の書類が要ると言われた' }).click();
  await row(page, /住所の届け/).getByRole('button', { name: 'できた', exact: true }).click();
  await check(page, '手続きごとに選んだ');
  await tap(page, '記録する');
  await expect(h1(page)).toHaveText('記録しました');
  await expect(page.locator('main')).toContainText('国民健康保険');
  await expect(page.locator('main')).toContainText('未確認');
  cleanUrl(page, '結果（手続きごと）');
  await check(page, '結果（手続きごと）');
  await tap(page, 'つぎへ');
  await expect(page).toHaveURL(/\/now$/);
  // できた：住所の届けは日が残らない。国保は「確かめること」。年金（未確認）は今日の予定に残る
  await page.goto('/all');
  await expect(page.locator('main')).toContainText('国民健康保険');
  await page.goto('/today');
  await expect(page.locator('main')).toContainText('国民年金');
  await expect(page.locator('main')).not.toContainText('住所の届け');
});

test('付き添い：全部「できなかった（ここではない）」→ 記録する', async ({ page }) => {
  await startVisit(page);
  await toAfter(page);
  for (const name of [/住所の届け/, /国民健康保険/, /国民年金/]) {
    await row(page, name).getByRole('button', { name: 'できなかった', exact: true }).click();
    await row(page, name).getByRole('button', { name: 'ここではないと言われた' }).click();
  }
  await check(page, 'ここではない');
  await tap(page, '記録する');
  await expect(h1(page)).toHaveText('記録しました');
  cleanUrl(page, '結果（ここではない）');
  await check(page, '結果（ここではない）');
});

test('付き添い：行けなかった → 日を決め直す', async ({ page }) => {
  await startVisit(page);
  await toAfter(page);
  await tap(page, '行けなかった');
  await expect(h1(page)).toHaveText('いつ、区役所に行きますか？');
  cleanUrl(page, '日を決め直す');
  await check(page, '日を決め直す');
  await tap(page, /^(今週のうちに|次の休みの日)/);
  await expect(h1(page)).toHaveText(/に決めました$/);
  await check(page, '決め直した結果');
  await tap(page, 'つぎへ');
  await expect(page).toHaveURL(/\/now$/);
});

test('付き添い：窓口の段階で開き直すと、同じ段階から', async ({ page }) => {
  await startVisit(page);
  await tap(page, '区役所に着いた');
  await expect(page).toHaveURL(/\/visit\/ward_office\/counter$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/visit\/ward_office\/counter$/);
  await expect(h1(page)).toHaveText('この画面を窓口の人に見せましょう');
});

test('付き添い：English では、日本語の文（lang=ja）と英語の意味が並ぶ', async ({ page }) => {
  await startVisit(page);
  await tap(page, '区役所に着いた');
  await page.getByRole('button', { name: /^(設定\s?・Language|Settings · 設定)$/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('fieldset').nth(0).locator('button.seg').nth(2).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const first = page.locator('section.k-counter').first();
  await expect(first.locator('.k-counter__ja[lang="ja"]')).toContainText('転入届');
  await expect(first.locator('.k-counter__mean[lang="en"]')).not.toBeEmpty();
  await check(page, '窓口で（English）');
  // 読み上げは、日本語の声があるときだけ出る
  const hasVoice = await page.evaluate(() => 'speechSynthesis' in window && speechSynthesis.getVoices().some((v) => v.lang.startsWith('ja')));
  if (hasVoice) await expect(first.locator('button.speak')).toBeVisible();
});
