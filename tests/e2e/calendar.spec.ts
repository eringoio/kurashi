/* カレンダー（作者の指示 2026-11-05）：日を選ぶカレンダーで休みの日は押せない・日を決めたら .ics を作れる・カレンダーの画面 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// 2026-11-04（水）に固定。11/7（土）・11/8（日）は区役所が休み、11/23 は勤労感謝の日
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-11-04T09:00:00+09:00')); });

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
  expect(new URL(page.url()).search).toBe('');
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();

/** A1 の経路で、区役所の日を決める画面まで（visit.spec.ts と同じ操作） */
async function toWardDay(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  await tap(page, '日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap(page, 'つぎへ');
  await tap(page, '書いてある');
  await tap(page, /^学生$/);
  await tap(page, '20歳から59歳まで');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  for (const name of ['まだどれにも入っていない', /^どちらでもない（厚生年金/, /^ない$/, /^はい$/]) {
    await tap(page, name);
    await tap(page, 'つぎへ');
  }
  await expect(h1(page)).toHaveText('いつ、区役所に行きますか？');
}

test('日を選ぶカレンダー：区役所の休み（土日・祝日）は押せず、理由を文字で示す。開いている時間も出す', async ({ page }) => {
  await toWardDay(page);
  const cal = page.locator('.cal__table');
  await expect(cal.getByRole('columnheader')).toHaveCount(7);
  await expect(cal.getByRole('button', { name: /11月7日（土）、休み/ })).toBeDisabled();
  await expect(cal.getByRole('button', { name: /11月23日（月）.*祝日/ })).toBeDisabled();
  await expect(cal.getByRole('button', { name: /^11月6日（金）$/ })).toBeEnabled();
  await expect(page.locator('main')).toContainText('開いている時間：08:45〜17:15');
  // 「次の休みの日」の候補（土曜）は、区役所が休みなので押せない
  await expect(page.getByRole('button', { name: /^次の休みの日/ })).toBeDisabled();
  await check(page, '日を選ぶ（カレンダー）');
  await cal.getByRole('button', { name: /^11月6日（金）$/ }).click();
  await expect(h1(page)).toHaveText(/11月6日.*に決めました$/);
});

test('日を決めたら、端末のカレンダーに入れる .ics を作れる（住所は選んだときだけ）', async ({ page }) => {
  await toWardDay(page);
  await page.locator('.cal__table').getByRole('button', { name: /^11月6日（金）$/ }).click();
  const link = page.getByRole('link', { name: 'カレンダーに入れる' }).first();
  await expect(link).toHaveAttribute('download', 'kurashi-2026-11-06.ics');
  const before = decodeURIComponent((await link.getAttribute('href'))!);
  expect(before).toContain('DTSTART;VALUE=DATE:20261106');
  expect(before).toContain('在留カード');
  expect(before).not.toContain('栄四丁目');
  await page.getByRole('combobox', { name: /行く区役所/ }).selectOption({ label: '中区役所' });
  const after = decodeURIComponent((await link.getAttribute('href'))!);
  expect(after).toContain('栄四丁目1-8');
  await check(page, '日を決めた（.ics）');
  // 選んだ区役所は残さない
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('kurashi'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const out: string[] = [];
    for (const name of Array.from(db.objectStoreNames)) {
      const all = await new Promise<unknown[]>((res) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(r.result); });
      out.push(JSON.stringify(all));
    }
    return out.join('\n');
  });
  expect(stored).not.toContain('naka-ward-office');
});

test('カレンダーの画面：決めた日と行く所ごとに並ぶ', async ({ page }) => {
  await toWardDay(page);
  await page.locator('.cal__table').getByRole('button', { name: /^11月6日（金）$/ }).click();
  await page.goto('/calendar');
  await expect(h1(page)).toHaveText('カレンダー');
  await expect(page.getByRole('heading', { level: 2, name: /11月6日.*区役所/ })).toBeVisible();
  await check(page, 'カレンダーの画面');
});
