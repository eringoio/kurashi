/* 部品の見本ページ（/dev/patterns）の検査。このページは開発サーバーにだけある（本番ビルドには入らない）ので、
   a11y.spec.ts の PAGES には入れず、別のファイルにした。npm run test:a11y は開発サーバーで回るので、同じ手順で動く。
   3つの表示レベル × 幅 320・640・1280：axe 違反 0、横スクロール 0、文字の間隔を広げても 0、h1 は1つ。 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const LEVELS = [{ id: 0, lang: 'ja' }, { id: 1, lang: 'ja' }, { id: 2, lang: 'en' }];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SPACING = `* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }`;

async function setLevel(page: Page, i: number, size: number) {
  await page.getByRole('button', { name: /^(設定\s?・Language|Settings · 設定)$/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('fieldset').nth(0).locator('button.seg').nth(i).click();
  await dlg.locator('fieldset').nth(1).locator('button.seg').nth(size).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

for (const lv of LEVELS) {
  test(`/dev/patterns level${lv.id}`, async ({ page }) => {
    for (const width of [320, 640, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      for (const size of [0, 2]) {
        await page.goto('/dev/patterns');
        await setLevel(page, lv.id, size);
        await expect(page.locator('html')).toHaveAttribute('lang', lv.lang);
        await expect(page.locator('h1')).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(' | ')), `${width} 文字${size}`).toEqual([]);
        if (width === 320) {
          await page.addStyleTag({ content: SPACING });
          expect(await page.evaluate(() => document.documentElement.scrollWidth), '文字の間隔').toBeLessThanOrEqual(width);
        }
      }
    }
  });
}

test('/dev/patterns：キーボードで状態を選べる', async ({ page }) => {
  await page.goto('/dev/patterns');
  const btn = page.getByRole('button', { name: /停止した/ }).first();
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
});
