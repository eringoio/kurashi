/* QR から開く（SPEC 9.8・docs/QR_SCENES.md）。場面は共通（固有の名前なし）。
   各画面で axe の違反 0 と、幅 320px で横スクロール 0 を確かめる。URL に答えを入れない（13.4）。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
  expect(new URL(page.url()).search, what + ' URL にクエリなし').toBe('');
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();
const SETTINGS = /^(設定\s?・Language|Settings · 設定)$/;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
});

/** A1 の経路で、区役所の3つ（住所の届け・国保・年金）を今日に決めて、つぎへ まで。保存に同意する */
async function planWardToday(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  await tap(page, '日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^自分で借りた部屋の鍵/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap(page, 'つぎへ');
  await tap(page, '書いてある');
  await tap(page, /^学生$/);
  await tap(page, '20歳から59歳まで');
  await expect(h1(page)).toHaveText('これからのこと');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  const answerThenNext = async (name: string | RegExp) => {
    await tap(page, name);
    await expect(page.locator('.eyebrow')).toHaveText('この答えで変わったこと');
    await tap(page, 'つぎへ');
  };
  await answerThenNext('まだどれにも入っていない');
  await answerThenNext(/^どちらでもない（厚生年金/);
  await answerThenNext(/^ない$/);
  await answerThenNext(/^はい$/);
  await expect(h1(page)).toHaveText('いつ、区役所に行きますか？');
  await tap(page, /^今日/);
  await expect(h1(page)).toHaveText(/に決めました$/);
  await tap(page, 'つぎへ');
  await expect(h1(page)).toHaveText('いつ、銀行に行きますか？');
}

test('区役所の QR：ここで行う手続きが出る', async ({ page }) => {
  await page.goto('/s/ward-office');
  await expect(h1(page)).toHaveText('区役所で行う手続き');
  await expect(page.getByRole('heading', { level: 2, name: 'ここで行う手続き' })).toBeVisible();
  await expect(page.locator('main a[href^="/c/"]').first()).toBeVisible();
  await check(page, '区役所の QR');
});

test('古い /pack/ の URL でも開く', async ({ page }) => {
  await page.goto('/pack/ward-office');
  await expect(h1(page)).toHaveText('区役所で行う手続き');
});

test('始める場面：/s/move は /move のページになる。戻るで /s/move に戻らない', async ({ page }) => {
  await page.goto('/');
  await page.goto('/s/move');
  await expect(page).toHaveURL(/\/move$/);
  await expect(h1(page)).toHaveText('最近、住む場所は変わりましたか？');
  await check(page, '/s/move');
  await page.goBack();
  expect(new URL(page.url()).pathname).not.toBe('/s/move');
  await expect(h1(page)).not.toHaveText('この QR の場面は、見つかりませんでした');
});

test('始める場面：/s/search（ごみは公開前なので、場面に入れていない）', async ({ page }) => {
  await page.goto('/s/search');
  await expect(page).toHaveURL(/\/search$/);
  await expect(h1(page)).toHaveText('手続きを探す');
  await check(page, '/s/search');
});

test('知らない場面の ID は、見つからない画面', async ({ page }) => {
  await page.goto('/s/no-such-scene');
  await expect(h1(page)).toHaveText('この QR の場面は、見つかりませんでした');
  await check(page, '場面なし');
});

test('区役所へ行く日が今日なら、区役所の QR に「窓口で見せる画面を開く」が出る', async ({ page }) => {
  await planWardToday(page);
  await page.goto('/s/ward-office');
  await expect(h1(page)).toHaveText('区役所で行う手続き');
  await page.getByRole('link', { name: '窓口で見せる画面を開く' }).click();
  await expect(page).toHaveURL(/\/visit\/ward_office\/counter$/);
  await expect(h1(page)).toHaveText('この画面を、窓口の人に見せましょう');
});

test('英語の表示でも、区役所の QR は検査に通る', async ({ page }) => {
  await page.goto('/s/ward-office');
  await page.getByRole('button', { name: SETTINGS }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('fieldset').nth(0).locator('button.seg').nth(2).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await check(page, '区役所の QR（English）');
});

test('QR を作る（作者用）：場面を選ぶと QR と「kurashi で開く」。? の入ったパスは作らない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/qr');
  await expect(h1(page)).toHaveText('QR を作る（作者用）');
  await page.getByRole('button', { name: '区役所で行う手続き' }).click();
  await expect(page.getByRole('img', { name: 'QR コード：https://kurashi.eringo.io/s/ward-office' })).toBeVisible();
  await expect(page.locator('.qrcard__name')).toHaveText('kurashi で開く：区役所で行う手続き');
  await expect(page.getByRole('link', { name: /印刷用の画像を保存する/ })).toHaveAttribute('download', 'ward-office-label.svg');
  await check(page, 'QR を作る');
  const input = page.getByRole('textbox', { name: 'アプリの中のパス' });
  await input.fill('/c/bank-account-open');
  await expect(page.locator('.qrcard__name')).toHaveText('kurashi で開く：銀行の口座');
  await input.fill('/move?x=1');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.qrcard')).toHaveCount(0);
});
