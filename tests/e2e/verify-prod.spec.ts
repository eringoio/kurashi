/* VERIFY-01：本番ビルド（npm run build → npm run preview、4173）への反例。
   VERIFY_PREVIEW=1 のときだけ動く。通常の npx playwright test では飛ばす。 */
import { expect, test, type Page } from '@playwright/test';

const PREVIEW = 'http://localhost:4173';
const DEV = 'http://localhost:5179';
test.skip(!process.env.VERIFY_PREVIEW, 'VERIFY_PREVIEW=1 と npm run preview が必要');

const dump = (page: Page) => page.evaluate(() => new Promise<Record<string, number> | null>((ok) => {
  const r = indexedDB.open('kurashi');
  r.onerror = () => ok(null);
  r.onsuccess = () => {
    const db = r.result; const out: Record<string, number> = {};
    const names = Array.from(db.objectStoreNames);
    if (!names.length) { db.close(); return ok(out); }
    const tx = db.transaction(names, 'readonly'); let n = 0;
    for (const s of names) { const c = tx.objectStore(s).count(); c.onsuccess = () => { out[s] = c.result; if (++n === names.length) { db.close(); ok(out); } }; }
  };
}));
const putRaw = (page: Page, store: string, key: string, val: unknown) => page.evaluate(([s, k, v]) => new Promise<void>((ok, ng) => {
  const r = indexedDB.open('kurashi');
  r.onsuccess = () => { const tx = r.result.transaction(s as string, 'readwrite'); tx.objectStore(s as string).put(v, k as string); tx.oncomplete = () => { r.result.close(); ok(); }; tx.onerror = () => ng(tx.error); };
}), [store, key, val] as const);

async function seedVerified(page: Page, base: string) {
  await page.goto(base + '/');
  await page.waitForLoadState('networkidle');
  // アプリの保存の形で入れる：同意 yes、review_mode=verified、答え
  await page.evaluate(() => new Promise<void>((ok) => {
    const r = indexedDB.open('kurashi');
    r.onsuccess = () => { r.result.close(); ok(); };
  }));
  const names = await page.evaluate(() => new Promise<string[]>((ok) => { const r = indexedDB.open('kurashi'); r.onsuccess = () => { const n = Array.from(r.result.objectStoreNames); r.result.close(); ok(n); }; }));
  expect(names).toContain('settings');
  await putRaw(page, 'consent', 'value', 'yes');
  await putRaw(page, 'settings', 'review_mode', 'verified');
  await putRaw(page, 'profile', 'Q-origin', 'abroad');
}

test('本番：保存に review_mode=verified があっても、見本の帯が出ず、下書きの手続きも出ない', async ({ page }) => {
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  await seedVerified(page, PREVIEW);
  for (const p of ['/move', '/all', '/review', '/e/E-lost-wallet', '/e/E-fx-marriage', '/dev/patterns']) {
    await page.goto(PREVIEW + p);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.k-notice'), p).toHaveCount(0);
    const html = await page.content();
    expect(html, p).not.toContain('lost-card-stop');
    expect(html, p).not.toContain('財布');
    expect(html, p).not.toMatch(/結婚/);
  }
  expect(reqs.filter((u) => /bundle|drafts|fixtures/.test(u))).toEqual([]);
});

test('対照：開発サーバー（5179）では同じ保存で見本の帯が出る＝この検査は効く', async ({ page }) => {
  await seedVerified(page, DEV);
  await page.goto(DEV + '/all');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.k-notice')).toHaveCount(1);
});

test('保存：同意の前は IndexedDB に何も書かれない（画面を一通り使っても）', async ({ page }) => {
  await page.goto(PREVIEW + '/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await page.getByRole('button', { name: 'はい' }).first().click();
  await page.getByRole('button', { name: '日本の外から' }).first().click();
  await page.getByRole('button', { name: /^在留カード/ }).first().click();
  await page.getByRole('button', { name: 'つぎへ' }).first().click();
  await page.getByRole('button', { name: '書いてある' }).first().click();
  await expect(page.getByRole('region', { name: /残しますか/ })).toBeVisible();
  const before = await dump(page);
  expect(Object.values(before ?? {}).reduce((a, b) => a + b, 0), JSON.stringify(before)).toBe(0);
  expect(page.url()).not.toMatch(/[?]|abroad|2026/);
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await expect.poll(async () => (await dump(page))?.profile ?? 0).toBeGreaterThan(0);
  // 全部消す
  await page.getByRole('button', { name: /設定|Settings|せってい/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: '全部消す' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '全部消す' }).first().click();
  await expect.poll(async () => Object.values((await dump(page)) ?? {}).reduce((a, b) => a + b, 0)).toBe(0);
});
