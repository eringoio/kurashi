/* ごみの町名ピッカー（検索欄＋一覧）と、現在地の区の「提案」。320px。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SETTINGS = /^(設定\s?・Language|Settings · 設定)$/;
async function setLevel(page: Page, idx: number) {
  await page.getByRole('button', { name: SETTINGS }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('fieldset').nth(0).locator('button.seg').nth(idx).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function open(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/gomi');
  await expect(page.locator('h1')).toBeVisible();
}
const wardSelect = (page: Page) => page.locator('.gomi-area select.field').first();
const search = (page: Page) => page.locator('.town-picker input[type=search]');
const opts = (page: Page) => page.locator('.town-picker__opt');
const noScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
/** 町名の表（1.8MB。遅れて読む）を読み終わるまで待つ。読んでいる間は画面に「読み込んでいます」、.gomi-area の data-schedule は loading。
    機械が忙しいと5秒を超え、町名の欄を待つ expect が落ちた（11/16。D-5）。決まった時間ではなく、表の状態が ready になるのを待つ */
const scheduleReady = (page: Page) => expect(page.locator('.gomi-area')).toHaveAttribute('data-schedule', 'ready', { timeout: 60_000 });
async function pickWard(page: Page, ward: string) {
  await scheduleReady(page);
  await wardSelect(page).selectOption(ward);
}

test('日本語で入力して選ぶと、その町の収集日が出る。1文字ずつ入力しても focus が残る', async ({ page }) => {
  await open(page);
  await pickWard(page, 'naka');
  await expect(search(page)).toBeVisible();
  await expect.poll(() => opts(page).count()).toBeGreaterThan(30);
  await search(page).click();
  await page.keyboard.type('栄', { delay: 30 });
  await page.keyboard.type('四', { delay: 30 });
  await expect(search(page)).toBeFocused();
  await expect(opts(page)).toHaveCount(1);
  await opts(page).first().click();
  await expect(page.locator('.town-picker__done strong')).toHaveText('栄四丁目');
  await expect(page.locator('#gomi-week')).toBeVisible();
  await noScroll(page);
});

test('English：ローマ字で探せて、ローマ字（日本語）を画面に出す。算用数字でも探せる', async ({ page }) => {
  await open(page);
  await setLevel(page, 2);
  await pickWard(page, 'naka');
  await search(page).fill('sakae 4');
  await expect(opts(page)).toHaveCount(1);
  await expect(opts(page).first()).toContainText('Sakae 4-chome');
  await expect(opts(page).first()).toContainText('栄四丁目');
  await opts(page).first().click();
  await expect(page.locator('.town-picker__done strong')).toContainText('Sakae 4-chome（栄四丁目）');
  await noScroll(page);
});

test('町が多い区で、最初と最後の候補へ届く。候補なしの表示。町を変えると収集日が入れ替わる', async ({ page }) => {
  await open(page);
  await pickWard(page, 'midori');
  await expect(search(page)).toBeVisible();
  await expect.poll(() => opts(page).count()).toBeGreaterThan(300);
  const list = page.locator('.town-picker__list');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const last = opts(page).last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await search(page).fill('zzzzqq');
  await expect(opts(page)).toHaveCount(0);
  // 候補なしのときも axe の違反 0（aria-controls が無い一覧を指さない。Fable HC-6）
  const none = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(none.violations.map((v) => v.id)).toEqual([]);
  await search(page).fill('');
  await opts(page).last().click();
  await expect(page.locator('.town-picker__done')).toBeVisible();
  await page.getByRole('button', { name: /町名を変える/ }).click();
  await expect(search(page)).toBeVisible();
  await expect(search(page)).toHaveValue('');
});

test('現在地から選ぶと区が入る（作者 11/8）。家にいないときは選び直す、の1行', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35.16898, longitude: 136.91008, accuracy: 30 }); // 中区役所
  await open(page);
  await page.getByRole('button', { name: /現在地から選ぶ/ }).click();
  await expect(wardSelect(page)).toHaveValue('naka');
  await scheduleReady(page);
  await expect(page.locator('.gomi-area')).toContainText('現在地から入れました');
  await expect(search(page)).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

/* 年末年始（R-14）：市の年末年始の表の日をカレンダーに出す。非公式の1行・さんあ～る・市の原文の引用の表示（名古屋市環境局の回答 2026-11）。 */
test('年末年始：12/31〜1/3 は収集なし、1/4 から。非公式の1行と、市の原文の引用の表示。axe の違反 0', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-12-26T09:00:00+09:00') });
  await open(page);
  await expect(page.locator('.gomi-unofficial')).toContainText('非公式');
  await expect(page.locator('.gomi-unofficial a[href$="/1012188.html"]')).toBeVisible();
  await pickWard(page, 'naka');
  await search(page).fill('栄四');
  await opts(page).first().click();
  const week = page.locator('#gomi-week').locator('..');
  await expect(week.locator('.k-notice')).toContainText('年末年始');
  const day = (label: string) => week.locator('.gomi-week li', { hasText: label });
  await expect(day('12月28日（月）')).toContainText('可燃ごみ');
  for (const d of ['12月31日（木）', '1月1日（金）', '1月2日（土）', '1月3日（日）']) await expect(day(d).locator('.gomi-week__cat')).toHaveCount(0);
  await expect(day('1月4日（月）')).toContainText('可燃ごみ');
  await expect(week.locator('.gomi-week__unknown')).toHaveCount(0);
  await expect(week.locator('a[href$="/1054883.html"]')).toBeVisible();
  // 市の分別検索の表の備考は、原文のまま枠に入れ、すぐ下に市の決めた表示
  await page.locator('.search input[type=search]').fill('金庫');
  await page.getByRole('button', { name: /金庫（耐火）/ }).click();
  const q = page.locator('blockquote.gomi-quote');
  await expect(q).toContainText('080-5471-3253');
  await expect(q.locator('footer')).toContainText('名古屋市:名古屋市公式ウェブサイトから引用');
  await noScroll(page);
  await page.screenshot({ path: 'screenshots/candidate/gomi-year-end-1115.png', fullPage: true });
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
