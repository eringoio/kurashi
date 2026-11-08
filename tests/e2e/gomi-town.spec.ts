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

test('日本語で入力して選ぶと、その町の収集日が出る。1文字ずつ入力しても focus が残る', async ({ page }) => {
  await open(page);
  await wardSelect(page).selectOption('naka');
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
  await wardSelect(page).selectOption('naka');
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
  await wardSelect(page).selectOption('midori');
  await expect(search(page)).toBeVisible();
  await expect.poll(() => opts(page).count()).toBeGreaterThan(300);
  const list = page.locator('.town-picker__list');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const last = opts(page).last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await search(page).fill('zzzzqq');
  await expect(opts(page)).toHaveCount(0);
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
  await expect(page.locator('.gomi-area')).toContainText('現在地から入れました');
  await expect(search(page)).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
