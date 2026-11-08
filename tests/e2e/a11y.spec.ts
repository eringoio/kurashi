/* アクセシビリティの自動の検査（SPEC 15.2）。新しい画面を足したら、PAGES に1行足す。
   11/7 5章（作者：テストが多すぎる）：全画面（PAGES）は ふつうの日本語 × 幅 320・1280 × 文字の大きさ0 だけ。
   代表の5画面（FULL：入口・できごとの全体・質問・手続きのページ＝くわしく・病院）だけ、3つの表示レベル × 文字の大きさ3つ × 幅3つ。
   代表の画面では、次を確かめる：
   - axe（WCAG 2.2 AA のタグ）の違反 0
   - 幅 320px（400% の拡大と同じ）と 640px（200% の拡大と同じ）で横スクロール 0
   - 文字の間隔を広げても（1.4.12）横スクロール 0
   - <html lang> が表示レベルと合う。見出し h1 が1つ
   シート（設定・相談窓口）も同じに確かめる。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

export const PAGES = ['/', '/info/out-of-scope', '/info/coming-soon', '/info/disclaimer', '/info/about', '/info/privacy', '/about', '/move', '/move/from', '/move/objects', '/move/basis', '/move/check', '/now', '/all', '/c/nagoya-tennyu-juukyochi', '/c/bank-account-open', '/review', '/search', '/gomi', '/visit/ward_office', '/today', '/s/ward-office', '/qr', '/here', '/letter', '/doc/tennyugaku-tsuchisho', '/doc/tennyu-todoke', '/doc/kakuu-seikyu', '/calendar', '/words', '/clinic', '/e/E-move-within', '/e/E-bank', '/e/E-bank/c/bank-resident-change', '/c/mail-forward', '/e/E-job', '/e/E-job/c/zairyu-shikakugai', '/e/E-job/c/job-side-work', '/e/E-house-search', '/e/E-house-search/c/housing-search', '/e/E-house-search/c/housing-initial-costs', '/e/E-house-search/c/housing-public', '/e/E-stay-renew', '/e/E-stay-renew/c/zairyu-koshin', '/e/E-move-out', '/g/family', '/e/E-marriage', '/e/E-divorce', '/e/E-familyship', '/e/E-lost-wallet', '/e/E-license', '/e/E-house-search/c/housing-move-in', '/e/E-house-search/c/life-water', '/e/E-license/c/license-gaimen-kirikae'];
/** 全部の組み合わせで見る代表の画面 */
export const FULL = ['/', '/all', '/move/basis', '/c/nagoya-tennyu-juukyochi', '/clinic'];
const LEVELS = [
  { id: 'ja', lang: 'ja' },
  { id: 'ja_easy', lang: 'ja' },
  { id: 'en', lang: 'en' },
];
const SIZES = [0, 1, 2];
const WIDTHS = [320, 640, 1280];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// 上の帯の「設定・Language」。ふりがなの所で名前に空白が入ることがある（「設定 ・Language」）
const SETTINGS = /^(設定\s?・Language|Settings · 設定)$/;

async function setPrefs(page: Page, level: string, size: number) {
  // 設定のシートから選ぶ（人と同じ操作）
  await page.getByRole('button', { name: SETTINGS }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('fieldset').nth(0).locator('button.seg').nth(LEVELS.findIndex((l) => l.id === level)).click();
  await dlg.locator('fieldset').nth(1).locator('button.seg').nth(size).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function noHorizontalScroll(page: Page, width: number) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, `横スクロール（幅 ${width}px）`).toBeLessThanOrEqual(width);
}
async function axe(page: Page, what: string, include?: string) {
  let b = new AxeBuilder({ page }).withTags(TAGS);
  if (include) b = b.include(include);
  const r = await b.analyze();
  const msg = r.violations.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect(r.violations, `${what}\n${msg}`).toEqual([]);
}
const SPACING = `* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }`;

for (const path of PAGES) {
  const full = FULL.includes(path);
  for (const lv of full ? LEVELS : LEVELS.slice(0, 1)) {
    test(`${path} ${lv.id}`, async ({ page }) => {
      for (const width of full ? WIDTHS : [320, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        for (const size of full ? SIZES : [0]) {
          await page.goto(path);
          await setPrefs(page, lv.id, size);
          const what = `${path} ${lv.id} 文字${size} 幅${width}`;
          await expect(page.locator('html')).toHaveAttribute('lang', lv.lang);
          await expect(page.locator('h1')).toHaveCount(1);
          await noHorizontalScroll(page, width);
          await axe(page, what);
          if (width === 320) {
            const tag = await page.addStyleTag({ content: SPACING });
            await noHorizontalScroll(page, width);
            await tag.evaluate((el) => (el as Element).remove());
          }
        }
      }
    });
  }
}

for (const lv of LEVELS) {
  test(`シート ${lv.id}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await setPrefs(page, lv.id, 2);
    for (const name of [SETTINGS, /^(相談窓口|相談|Help)$/]) {
      await page.getByRole('button', { name }).click();
      const dlg = page.getByRole('dialog');
      await expect(dlg).toBeVisible();
      // 開くと「閉じる」にフォーカス（SPEC 15.2）
      await expect(dlg.locator('.close')).toBeFocused();
      await noHorizontalScroll(page, 320);
      await axe(page, `シート ${lv.id}`, '.sheet');
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
    }
  });
}

test('保存の同意・見るだけ・全部消す', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => 'vault' in ((window as unknown as { __kurashi?: object }).__kurashi ?? {}));
  // 進捗を作る（開発のときだけの入口）
  await page.evaluate(() => (window as unknown as { __kurashi: { vault: { put: (s: string, k: string, v: unknown) => Promise<void> } } }).__kurashi.vault.put('profile', 'Q-origin', 'abroad'));
  const consent = page.getByRole('region', { name: /残しますか/ });
  await expect(consent).toBeVisible();
  await axe(page, '保存の同意');
  await consent.getByRole('button', { name: '残す', exact: true }).click();
  await expect(consent).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => 'vault' in ((window as unknown as { __kurashi?: object }).__kurashi ?? {}));
  // 残したので、開き直しても答えがある
  const kept = await page.evaluate(() => (window as unknown as { __kurashi: { vault: { get: (s: string, k: string) => unknown } } }).__kurashi.vault.get('profile', 'Q-origin'));
  expect(kept).toBe('abroad');
  // 見るだけ：帯が出て、答えは読まない
  await page.getByRole('button', { name: SETTINGS }).click();
  await page.getByRole('button', { name: /見るだけにする/ }).click();
  await expect(page.locator('.viewonly')).toContainText('見るだけ（保存しません）');
  await axe(page, '見るだけ');
  await page.getByRole('button', { name: '終わる', exact: true }).click();
  // 全部消す
  await page.getByRole('button', { name: SETTINGS }).click();
  await page.getByRole('dialog').getByRole('button', { name: '全部消す' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '全部消す' }).first().click();
  await expect(page.locator('[aria-live="polite"]')).toHaveText('全部消しました。');
  await page.reload();
  await page.waitForFunction(() => 'vault' in ((window as unknown as { __kurashi?: object }).__kurashi ?? {}));
  const gone = await page.evaluate(() => (window as unknown as { __kurashi: { vault: { get: (s: string, k: string) => unknown } } }).__kurashi.vault.get('profile', 'Q-origin'));
  expect(gone).toBeUndefined();
});
