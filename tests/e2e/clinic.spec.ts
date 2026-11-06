/* 病院の案内（SPEC 6A.13・AT-clinic-01〜05）：言葉・絵から場所を選び、診療科 → 行く前に */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-04T09:00:00+09:00')); });

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
  expect(new URL(page.url()).search).toBe('');
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();
const band = (page: Page) => page.locator('aside.clinic__band');
const SETTINGS = /^(設定\s?・Language|Settings · 設定)$/;

async function setLevel(page: Page, idx: number) {
  await page.getByRole('button', { name: SETTINGS }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('fieldset').nth(0).locator('button.seg').nth(idx).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function start(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
}
async function dbDump(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('kurashi'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const out: string[] = [];
    for (const name of Array.from(db.objectStoreNames)) {
      const all = await new Promise<unknown[]>((res) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(r.result); });
      out.push(JSON.stringify(all));
    }
    return out.join('\n');
  });
}

test('AT-clinic-01〜03：ホームから、tooth で探して 歯・口 → 歯科 → 行く前に', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: /体調が悪い・病院に行きたい/ }).click();
  await expect(page).toHaveURL(/\/clinic$/);
  await expect(h1(page)).toHaveText('困っている所を選んでください');
  await expect(page.getByRole('button', { name: 'つぎへ' })).toBeDisabled();
  await check(page, '1 どこが');
  await page.getByLabel('言葉で探す').fill('tooth');
  const sug = page.locator('.chips').first().getByRole('button', { name: /歯・口/ });
  await expect(sug).toBeVisible();
  await sug.click();
  await expect(sug).toHaveAttribute('aria-pressed', 'true');
  await check(page, '1 選んだ');
  await tap(page, 'つぎへ');
  await expect(page).toHaveURL(/\/clinic\/departments$/);
  await expect(h1(page)).toHaveText('この部分を一般的に診る診療科');
  await expect(page.locator('main')).toContainText('診断ではありません');
  await expect(page.locator('main')).not.toContainText('まず、ここへ');
  await expect(page.locator('.clinic__depts li').first()).toContainText('歯科');
  await check(page, '2 診療科');
  await tap(page, 'つぎへ');
  await expect(h1(page)).toHaveText('行く前に');
  const link = page.getByRole('link', { name: /^近くの歯科を探す/ });
  await expect(link).toHaveAttribute('href', 'https://www.iryou.teikyouseido.mhlw.go.jp/');
  expect(await link.getAttribute('href')).not.toContain('?');
  await expect(page.locator('.k-counter', { hasText: '歯が痛いです' }).first()).toBeVisible();
  await check(page, '3 行く前に');
  const hasVoice = await page.evaluate(() => 'speechSynthesis' in window && speechSynthesis.getVoices().some((v) => v.lang.startsWith('ja')));
  if (hasVoice) await expect(page.locator('.k-counter').first().locator('button.speak')).toBeVisible();
});

test('AT-clinic-01：知らない言葉では何も出ない', async ({ page }) => {
  await start(page);
  await page.goto('/clinic');
  await page.getByLabel('言葉で探す').fill('xyzzy');
  await expect(page.locator('main')).toContainText('見つかりません。絵から選んでください。');
  await expect(page.getByRole('button', { name: 'つぎへ' })).toBeDisabled();
});

test('絵の横の目ボタンで選ぶと、眼科が最初', async ({ page }) => {
  await start(page);
  await page.goto('/clinic');
  const eye = page.locator('.bodymap').getByRole('button', { name: /^目/ });
  await eye.click();
  await expect(eye).toHaveAttribute('aria-pressed', 'true');
  await tap(page, 'つぎへ');
  await expect(page.locator('.clinic__depts li').first()).toContainText('眼科');
});

test('AT-clinic-04：119・#7119・#8000 と救急車の呼び方は、3段ともいつも出る', async ({ page }) => {
  await start(page);
  await page.goto('/clinic');
  await expect(band(page)).toContainText('119');
  await expect(band(page)).toContainText('#7119');
  await page.getByLabel('言葉で探す').fill('tooth');
  await page.locator('.chips').first().getByRole('button', { name: /歯・口/ }).click();
  await expect(band(page)).toContainText('#8000');
  await expect(band(page).getByRole('link', { name: /救急車の呼び方/ })).toHaveAttribute('href', 'https://www.fdma.go.jp/publication/portal/post1.html');
  await tap(page, 'つぎへ');
  await expect(band(page)).toContainText('119');
  await expect(band(page)).toContainText('#7119');
  await expect(band(page)).toContainText('#8000');
  await expect(band(page).getByRole('link', { name: /救急車の呼び方/ })).toHaveAttribute('href', 'https://www.fdma.go.jp/publication/portal/post1.html');
  await tap(page, 'つぎへ');
  await expect(band(page)).toContainText('119');
  await expect(band(page)).toContainText('#7119');
  await expect(band(page)).toContainText('#8000');
  await expect(band(page).getByRole('link', { name: /救急車の呼び方/ })).toHaveAttribute('href', 'https://www.fdma.go.jp/publication/portal/post1.html');
  // こども
  await page.goto('/clinic');
  await page.getByRole('button', { name: /^子ども/ }).click();
  await expect(band(page)).toContainText('#8000');
  await expect(band(page)).toContainText('#7119');
  await tap(page, 'つぎへ');
  await expect(band(page)).toContainText('#8000');
  await tap(page, 'つぎへ');
  await expect(band(page)).toContainText('#8000');
  await expect(band(page)).toContainText('119');
});

test('AT-clinic-05：URL に場所の id が入らない。選ばずに 2・3 を開くと 1 にもどる', async ({ page }) => {
  await start(page);
  await page.goto('/clinic/before');
  await expect(page).toHaveURL(/\/clinic$/);
  await page.goto('/clinic/departments');
  await expect(page).toHaveURL(/\/clinic$/);
  await page.getByRole('button', { name: /^歯・口/ }).first().click();
  const paths: string[] = [];
  const rec = () => { const u = new URL(page.url()); paths.push(u.pathname); expect(u.search).toBe(''); expect(u.hash).toBe(''); };
  rec();
  await tap(page, 'つぎへ'); rec();
  await tap(page, 'つぎへ'); rec();
  expect(paths).toEqual(['/clinic', '/clinic/departments', '/clinic/before']);
});

test('AT-clinic-05：同意して残したあとに通しで動かしても、IndexedDB に病院の値が入らない', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  await tap(page, '日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap(page, 'つぎへ');
  await tap(page, '書いてある');
  await tap(page, /^学生$/);
  await tap(page, '20歳から59歳まで');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await expect.poll(async () => (await dbDump(page)).length).toBeGreaterThan(10);
  await page.goto('/clinic');
  await page.getByRole('button', { name: /^歯・口/ }).first().click();
  await tap(page, 'つぎへ');
  await tap(page, 'つぎへ');
  await expect(h1(page)).toHaveText('行く前に');
  const stored = await dbDump(page);
  for (const w of ['mouth', 'shika', 'clinic', '歯']) expect(stored, w).not.toContain(w);
});

for (const [idx, id] of [[1, 'やさしい日本語'], [2, 'English']] as const) {
  test(`AT-clinic-05：${id} で通しで動かす（axe 0・横スクロール 0・320px）`, async ({ page }) => {
    await start(page);
    await setLevel(page, idx);
    // 表示レベルは再読み込みで戻るので、ホームの項目から画面の中で移る
    await page.locator('a[href="/clinic"]').first().click();
    await expect(page).toHaveURL(/\/clinic$/);
    await check(page, `${id} 1`);
    await page.getByRole('searchbox').fill('tooth');
    await page.locator('.chips').first().getByRole('button').first().click();
    await check(page, `${id} 1 選んだ`);
    await page.locator('button.k-answer--primary').click();
    await expect(page).toHaveURL(/\/clinic\/departments$/);
    await check(page, `${id} 2`);
    await page.locator('button.k-answer--primary').click();
    await expect(page).toHaveURL(/\/clinic\/before$/);
    await check(page, `${id} 3`);
    await expect(page.locator('.k-counter', { hasText: /歯.*痛/ }).first()).toBeVisible();
    await expect(band(page)).toBeVisible();
  });
}
