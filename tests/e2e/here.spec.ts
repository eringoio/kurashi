/* いまいる場所から（SPEC 6A.11）の e2e。位置は Playwright の geolocation で与える。
   各画面で axe 0 と、幅 320px で横スクロール 0。URL にクエリ文字列と数字を入れない・位置を保存しない（13章）。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// 日を固定する（平日の 2026-11-04 水曜。区役所が休みの日に「今日」が押せなくなるため。フローと同じ日）
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-04T09:00:00+09:00')); });

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
  expect(new URL(page.url()).search, what + ' クエリ文字列').toBe('');
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();

// 中区役所（data/places.json の naka-ward-office）
const NAKA = { latitude: 35.16898, longitude: 136.91008 };
const NEAR = { latitude: NAKA.latitude + 0.0009, longitude: NAKA.longitude, accuracy: 30 }; // 約100m北
const TOKYO = { latitude: 35.6812, longitude: 139.7671, accuracy: 20 };

type Pos = { latitude: number; longitude: number; accuracy: number };

/** pos なし = 許可しない（断る）。決まった動きにするため、位置の呼び出し自体を差し替えず、ブラウザの許可の状態で作る */
async function open(page: Page, context: BrowserContext, pos?: Pos) {
  await page.setViewportSize({ width: 320, height: 720 });
  if (pos) {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(pos);
  } else {
    await context.clearPermissions();
  }
  await page.goto('/here');
  await expect(h1(page)).toHaveText('いまいる場所から');
  await check(page, '最初');
}

test('いまいる場所：近い → 近くの質問 → ここでできること', async ({ page, context }) => {
  await open(page, context, NEAR);
  await tap(page, '位置を使う');
  await expect(h1(page)).toHaveText('中区役所の近くにいますか？');
  await check(page, '近くの質問');
  await tap(page, /^はい。ここでできることを見る/);
  await expect(h1(page)).toHaveText('ここでできること');
  await expect(page.locator('main')).toContainText('中区役所');
  await expect(page.locator('main a, main li').first()).toBeVisible();
  await check(page, 'ここでできること');

  // 位置を保存しない：IndexedDB のどこにも緯度・経度が入っていない。URL は /here のまま・数字なし
  const dump = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const out: Record<string, unknown> = {};
    for (const info of dbs) {
      if (!info.name) continue;
      const db: IDBDatabase = await new Promise((res, rej) => { const q = indexedDB.open(info.name!); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      for (const s of Array.from(db.objectStoreNames)) {
        const rows: unknown[] = await new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        out[info.name + '/' + s] = rows;
      }
      db.close();
    }
    return JSON.stringify(out);
  });
  expect(dump).not.toContain('35.16');
  expect(dump).not.toContain('136.91');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toMatch(/35\.16|136\.91/);
  const u = new URL(page.url());
  expect(u.pathname).toBe('/here');
  expect(u.pathname + u.search + u.hash).not.toMatch(/\d/);
});

test('いまいる場所：断ると、一覧とその理由', async ({ page, context }) => {
  await open(page, context);
  await tap(page, '位置を使う');
  await expect(h1(page)).toHaveText('どの区役所ですか？');
  await expect(page.locator('p[role=status]')).toHaveText('位置は使いません。一覧から選んでください。');
  await expect(page.locator('main ul.list button')).toHaveCount(16);
  await check(page, '断った一覧');
});

test('いまいる場所：誤差が大きいと、一覧とその理由', async ({ page, context }) => {
  await open(page, context, { ...NEAR, accuracy: 1000 });
  await tap(page, '位置を使う');
  await expect(h1(page)).toHaveText('どの区役所ですか？');
  await expect(page.locator('p[role=status]')).toHaveText('位置の誤差が大きいため、一覧から選んでください。');
  await check(page, '誤差が大きい一覧');
});

test('いまいる場所：遠いと、一覧から選べる', async ({ page, context }) => {
  await open(page, context, TOKYO);
  await tap(page, '位置を使う');
  await expect(h1(page)).toHaveText('どの区役所ですか？');
  await expect(page.locator('p[role=status]')).toHaveText('近くに区役所が見つかりませんでした。一覧から選んでください。');
  await check(page, '遠い一覧');
  await tap(page, '中区役所');
  await expect(h1(page)).toHaveText('ここでできること');
  await check(page, '一覧から選んだ');
});

test('いまいる場所：区の一覧から選ぶ（位置なし。理由の文は出ない）', async ({ page, context }) => {
  await open(page, context);
  await tap(page, '区の一覧から選ぶ');
  await expect(h1(page)).toHaveText('どの区役所ですか？');
  await expect(page.locator('p[role=status]')).toHaveCount(0);
});

test('いまいる場所：通っただけ → 入口へ', async ({ page, context }) => {
  await open(page, context, NEAR);
  await tap(page, '位置を使う');
  await expect(h1(page)).toHaveText('中区役所の近くにいますか？');
  await tap(page, '通っただけ');
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).search).toBe('');
});

test('いまいる場所：区役所へ行く日が今日なら、持ち物の確かめへ', async ({ page }) => {
  await planWardToday(page);
  await page.goto('/here');
  await tap(page, '区の一覧から選ぶ');
  await tap(page, '中区役所');
  await expect(h1(page)).toHaveText('ここでできること');
  await check(page, 'ここでできること（今日の予定あり）');
  await page.getByRole('link', { name: '今日の持ち物を確かめる（行く前）' }).click();
  await expect(page).toHaveURL(/\/visit\/ward_office$/);
  await expect(h1(page)).toHaveText('持ち物を確かめましょう');
});

test('いまいる場所：English でも崩れない', async ({ page, context }) => {
  await open(page, context, TOKYO);
  await page.getByRole('button', { name: /^(設定\s?・Language|Settings · 設定)$/ }).click();
  await page.getByRole('dialog').locator('fieldset').nth(0).locator('button.seg').nth(2).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await check(page, '最初（English）');
  await tap(page, /Use my location/);
  await expect(h1(page)).toContainText('Which ward office');
  await expect(page.locator('p[role=status]')).toContainText('No ward office was found nearby');
  await check(page, '一覧（English）');
});

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
