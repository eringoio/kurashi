/* 届いた書類を撮る（SPEC 6A.9）。見本の画像・実際のファイル入力・同意しない・選び直す・失敗・何も残らないこと。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
  expect(new URL(page.url()).search, what + ' クエリ文字列').toBe('');
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();
// 1x1 の PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/read-document')) calls.push(r.method()); });
  return calls;
}
async function toPreview(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/letter');
  await expect(h1(page)).toHaveText('届いた書類がわからないとき');
  await tap(page, '見本の書類で試す');
  await expect(h1(page)).toHaveText('この写真を送りますか？');
}

test('見本の画像：撮る → 確かめる → 送る → 確認 → 結果', async ({ page }) => {
  const calls = trackApi(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/letter');
  await check(page, '入口');
  await expect(page.locator('label', { hasText: '写真を撮る' })).toBeVisible();
  await tap(page, '見本の書類で試す');
  await expect(h1(page)).toHaveText('この写真を送りますか？');
  await expect(page.locator('.draftmark')).toBeVisible();
  expect(calls, '確かめる画面では送らない').toEqual([]);
  await check(page, '写真の確かめ');
  await tap(page, /^送る（同意する）/);
  await expect(page.locator('.eyebrow')).toHaveText('たぶん「国民健康保険の資格確認書」です');
  await expect(h1(page)).toHaveText('書類の上のほうに、この言葉がありますか？');
  expect(calls).toEqual(['POST']);
  await check(page, '確認');
  await tap(page, 'はい');
  await expect(h1(page)).toHaveText('国民健康保険の資格確認書');
  await expect(page.locator('.draftmark')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="letter-cards"]')).toContainText('国民健康保険');
  await expect(page.getByRole('note')).toContainText('期限・金額・番号');
  await check(page, '結果');
});

test('実際のファイル入力：選んだ画像が確かめの画面に出て、送ると確認へ', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/letter');
  await page.locator('input[type=file]').setInputFiles({ name: 'letter.png', mimeType: 'image/png', buffer: PNG });
  await expect(h1(page)).toHaveText('この写真を送りますか？');
  await expect(page.locator('img.letter__photo')).toBeVisible();
  // 実際の写真には「見本」の印が付かない
  await expect(page.locator('.draftmark')).toHaveCount(0);
  await check(page, '写真の確かめ（ファイル）');
  await tap(page, /^送る（同意する）/);
  await expect(h1(page)).toHaveText('書類の上のほうに、この言葉がありますか？');
});

test('同意しない：送らないを選ぶと、通信せず一覧へ', async ({ page }) => {
  const calls = trackApi(page);
  await toPreview(page);
  expect(calls).toEqual([]);
  await tap(page, /^送らない/);
  await expect(h1(page)).toHaveText('どの書類ですか？');
  await check(page, '一覧');
  await page.waitForTimeout(300);
  expect(calls, '/api/read-document への通信なし').toEqual([]);
});

test('いいえ → 一覧 → 国民年金の加入のお知らせ → 関係する手続き', async ({ page }) => {
  await toPreview(page);
  await tap(page, /^送る（同意する）/);
  await expect(h1(page)).toHaveText('書類の上のほうに、この言葉がありますか？');
  await tap(page, /^いいえ/);
  await expect(h1(page)).toHaveText('どの書類ですか？');
  await tap(page, /国民年金の加入のお知らせ/);
  await expect(h1(page)).toHaveText('国民年金の加入のお知らせ');
  await expect(page.locator('section[aria-labelledby="letter-cards"] li')).not.toHaveCount(0);
  await check(page, '結果（年金）');
});

test('わからない → わからないときは', async ({ page }) => {
  await toPreview(page);
  await tap(page, /^送る（同意する）/);
  await tap(page, 'わからない');
  await expect(h1(page)).toHaveText('わからないときは');
  await check(page, 'わからない');
});

test('読み取りに失敗しても止まらない', async ({ page }) => {
  await page.route('**/api/read-document', (r) => r.fulfill({ status: 502, body: '{"error":"read_failed"}' }));
  await toPreview(page);
  await tap(page, /^送る（同意する）/);
  await expect(h1(page)).toHaveText('読み取れませんでした');
  await expect(page.getByRole('button', { name: /一覧から選ぶ/ })).toBeVisible();
  await check(page, '失敗');
});

test('何も残らない：IndexedDB と localStorage に写真も書類 id もない', async ({ page }) => {
  await toPreview(page);
  await tap(page, /^送る（同意する）/);
  await tap(page, 'はい');
  await expect(h1(page)).toHaveText('国民健康保険の資格確認書');
  const dump = await page.evaluate(async () => {
    const out: string[] = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const info of dbs) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => { const q = indexedDB.open(info.name!); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      for (const name of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((res, rej) => { const q = db.transaction(name).objectStore(name).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        out.push(JSON.stringify(rows));
      }
      db.close();
    }
    return out.join('\n');
  });
  expect(dump).not.toContain('/9j/');
  expect(dump).not.toContain('data:image');
  expect(dump).not.toContain('kokuho-shikaku');
});

test('English：入口と確認が通る', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/letter');
  await page.getByRole('button', { name: /^(設定\s?・Language|Settings · 設定)$/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('fieldset').nth(0).locator('button.seg').nth(2).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await check(page, 'English 入口');
  await page.getByRole('button', { name: /Try with a sample letter/ }).click();
  await expect(page.locator('img.letter__photo')).toBeVisible();
  await page.getByRole('button', { name: /Send \(I agree\)/ }).first().click();
  await expect(page.getByRole('button', { name: /Yes/ }).first()).toBeVisible();
  await check(page, 'English 確認');
});
