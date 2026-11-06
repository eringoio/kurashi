/* 位置を1つの流れに（A-6・A-12）と、共有のアイコン（A-5）。作者の指示 2026-11-06。
   位置：保存の同意のあと、入口で一度だけ聞く。答えだけを残す。使うなら近くの区役所の帯。設定で変えられる。
   共有：アイコンだけ（読み上げの名前「共有」）。いまの場面の入口の URL と QR。答え・日付は入れない。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-04T09:00:00+09:00')); });

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
  expect(new URL(page.url()).search, what + ' クエリ文字列').toBe('');
}
const ASK = /位置を使いますか/;
const NAKA_NEAR = { latitude: 35.16898 + 0.0009, longitude: 136.91008, accuracy: 30 };

/** 進捗を作って「残す」を選び、入口（アプリの中の移動）にもどる */
async function keptAndHome(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: ASK })).toHaveCount(0); // 同意の前は聞かない
  // A1 の流れで、最初の進捗まで（a1-visit のフローと同じ操作）
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap('はい');
  await tap('日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^自分で借りた部屋の鍵/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap('つぎへ');
  await tap('書いてある');
  await tap(/^学生$/);
  await tap('20歳から59歳まで');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.locator('a.brand').click();
}

test('位置：同意のあと入口で一度だけ聞く。「使わない」は残り、もう聞かない。設定で変えられる', async ({ page }) => {
  await keptAndHome(page);
  await expect(page.getByRole('heading', { name: ASK })).toBeVisible();
  await check(page, '入口（位置を聞く）');
  await page.getByRole('button', { name: '使わない', exact: true }).click();
  await expect(page.getByRole('heading', { name: ASK })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'いまいる場所から' })).toHaveCount(0); // 入口のリンクは消した
  await page.reload();
  await page.locator('a.brand').click();
  await expect(page.getByRole('heading', { name: ASK })).toHaveCount(0);
  await page.getByRole('button', { name: /^設定/ }).click();
  const loc = page.getByRole('group', { name: '位置' });
  await expect(loc.getByRole('button', { name: '使わない' })).toHaveAttribute('aria-pressed', 'true');
  await loc.getByRole('button', { name: '使う' }).click();
  await expect(loc.getByRole('button', { name: '使う' })).toHaveAttribute('aria-pressed', 'true');
});

test('位置：使う → 近くの区役所の帯 → ここでできること（URL に位置を入れない）', async ({ page, context }: { page: Page; context: BrowserContext }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(NAKA_NEAR);
  await keptAndHome(page);
  await page.getByRole('button', { name: '使う', exact: true }).click();
  const band = page.getByRole('button', { name: /中区役所の近くにいますか/ });
  await expect(band).toBeVisible();
  await check(page, '入口（近くの区役所）');
  await band.click();
  await expect(page.locator('h1')).toHaveText(/中区役所の近くにいますか/);
  expect(new URL(page.url()).pathname).toBe('/here');
});

test('共有：アイコンだけのボタン（名前は「共有」）。入口は / 、手続きのページは親の場面の URL と QR', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  const btn = page.getByRole('button', { name: '共有', exact: true });
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('');
  await btn.click();
  const d = page.getByRole('dialog');
  await expect(d).toContainText('https://kurashi.eringo.io/');
  await expect(d.getByRole('img', { name: /kurashi\.eringo\.io/ })).toBeVisible();
  await check(page, '共有のシート');
  await d.getByRole('button', { name: '閉じる' }).click();
  await page.goto('/c/nagoya-tennyu-juukyochi');
  await page.getByRole('button', { name: '共有', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('https://kurashi.eringo.io/s/ward-office');
});
