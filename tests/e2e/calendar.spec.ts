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
async function check1280(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
}
const h1 = (page: Page) => page.locator('h1');
const tap = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first().click();

/** A1 の経路で、区役所の日を決める画面まで（visit.spec.ts と同じ操作） */
async function toWardDay(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  // あなたについて（v0.5.17）は答えずに進む（この試験は道のりを見る）
  await page.getByRole('button', { name: '答えずに進む' }).click();
  await tap(page, '日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap(page, 'つぎへ');
  await tap(page, '書いてある');
  await tap(page, /^学生$/);
  await tap(page, '20歳から59歳まで');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  // 答えたあとは結果の画面を出さず、次の1つへ（SPEC 6A.5 v0.5.14）
  for (const name of ['まだどれにも入っていない', /^どちらでもない（厚生年金/, /^ない$/, /^はい$/]) await tap(page, name);
  await expect(h1(page)).toHaveText('いつ、区役所に行きますか？');
}
/** カレンダーは「ほかの日を選ぶ」を押したときだけ開く（K-42） */
async function openCal(page: Page) {
  const b = page.getByRole('button', { name: 'ほかの日を選ぶ' });
  await expect(b).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.cal__table')).toHaveCount(0);
  await b.click();
  await expect(b).toHaveAttribute('aria-expanded', 'true');
}
const decided = (page: Page) => page.locator('.k-change__line');

test('日を選ぶカレンダー：区役所の休み（土日・祝日）は押せず、理由を文字で示す。開いている時間も出す', async ({ page }) => {
  await toWardDay(page);
  await openCal(page);
  const cal = page.locator('.cal__table');
  await expect(cal.getByRole('columnheader')).toHaveCount(7);
  await expect(cal.getByRole('button', { name: /11月7日（土）、休み/ })).toBeDisabled();
  await expect(cal.getByRole('button', { name: /11月23日（月）.*祝日/ })).toBeDisabled();
  await expect(cal.getByRole('button', { name: /^11月6日（金）$/ })).toBeEnabled();
  // 開いている時間は1行（A-4）。年末年始などは「くわしく」のシート
  await expect(page.locator('main')).toContainText('平日 8:45〜17:15（要確認）');
  // 日曜・祝日は赤い数字。「祝」の印は出さず、読み上げに祝日の名前を残す（A-3）
  await expect(cal.getByRole('button', { name: /11月23日（月）.*勤労感謝の日/ })).toHaveClass(/cal__day--red/);
  await expect(cal.locator('.cal__mark', { hasText: '祝' })).toHaveCount(0);
  // 「次の休みの日」の候補（土曜）は、区役所が休みなので押せない
  await expect(page.getByRole('button', { name: /^次の休みの日/ })).toBeDisabled();
  await check(page, '日を選ぶ（カレンダー）');
  await cal.getByRole('button', { name: /^11月6日（金）$/ }).click();
  await expect(decided(page)).toHaveText(/11月6日.*に決めました$/);
  await expect(h1(page)).toHaveText('いつ、銀行に行きますか？');
});

test('日を決めたら、端末のカレンダーに入れる .ics を作れる（住所は選んだときだけ）', async ({ page }) => {
  await toWardDay(page);
  await openCal(page);
  await page.locator('.cal__table').getByRole('button', { name: /^11月6日（金）$/ }).click();
  // 決めた日の1行に小さな「カレンダーに追加」→ シートの中に区役所の選択とファイルを作るボタン（A-2）
  await page.getByRole('button', { name: 'カレンダーに追加' }).click();
  const link = page.getByRole('dialog').getByRole('link', { name: '予定のファイルを作る' });
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

test('行く日が今日なら、カレンダーに追加は出さない（A-1）', async ({ page }) => {
  await toWardDay(page);
  await openCal(page);
  await page.locator('.cal__table').getByRole('button', { name: /^11月4日（水）/ }).click();
  await expect(decided(page)).toHaveText(/11月4日.*に決めました$/);
  await expect(page.getByRole('button', { name: 'カレンダーに追加' })).toHaveCount(0);
});

test('カレンダーの画面：決めた日と行く所ごとに並ぶ', async ({ page }) => {
  await toWardDay(page);
  await openCal(page);
  await page.locator('.cal__table').getByRole('button', { name: /^11月6日（金）$/ }).click();
  // 次の手続きの日を選ぶカレンダーにも、決めた日に ● と「行く日」が付く（K-34）
  // 開いたままのことも、閉じているときもある
  if (!(await page.locator('.cal__table').count())) await page.getByRole('button', { name: 'ほかの日を選ぶ' }).click();
  await expect(page.locator('.cal__table .cal__day--planned')).toContainText('11月6日（金）、行く日');
  await expect(page.locator('.cal__table .cal__day--planned')).toContainText('●');
  await page.goto('/calendar');
  await expect(h1(page)).toHaveText('カレンダー');
  await expect(page.getByRole('heading', { level: 2, name: /11月6日.*区役所/ })).toBeVisible();
  // 見るだけのカレンダー：決めた日に ●、読み上げに「行く日」、凡例。押せない
  const day = page.locator('.cal__day--planned');
  await expect(day).toHaveCount(1);
  await expect(day).toContainText('●');
  await expect(day).toContainText('11月6日（金）、行く日');
  await expect(page.locator('.cal__legend')).toContainText('行く日');
  await expect(page.locator('.cal__table button')).toHaveCount(0);
  await check(page, 'カレンダーの画面');
  await page.setViewportSize({ width: 1280, height: 800 });
  await check1280(page, 'カレンダーの画面 1280');
});

test('カレンダーの画面：予定が無いときは短い文と「いまの1つにもどる」', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/calendar');
  await expect(page.locator('.cal__day--planned')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'いまの1つにもどる' })).toBeVisible();
  await check(page, 'カレンダーの画面（空）');
});
