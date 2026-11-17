/* O-8（B-5）：「仕事を辞める」の全体の画面から「このあと個人事業も始める」を足す。辞める手続きと開業届の両方が出る */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('仕事：辞める → 全体で「個人事業も始める」を足す → 国保と開業届の両方。読み上げの1行とフォーカス', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e/E-job');
  await page.getByRole('button', { name: /^仕事を辞める/ }).click();
  await page.getByRole('button', { name: '日本国籍' }).click();
  await page.getByRole('button', { name: '自分の職場の健康保険' }).click();
  // 次の勤め先の保険にすぐ入らない（国保へ）。そのあと雇用保険の質問が出れば「はい」
  await page.getByRole('button', { name: /^いいえ（間が空く/ }).click();
  const koyo = page.getByRole('button', { name: 'はい' });
  if (await koyo.count()) await koyo.click();
  await page.getByRole('link', { name: '全体' }).first().click();
  await expect(page.locator('h1')).toHaveText('これからのこと');
  const main = page.locator('main');
  await expect(main.getByText('開業届を出す').filter({ visible: true })).toHaveCount(0);
  const add = page.getByRole('button', { name: /このあと個人事業も始める/ });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await add.click();
  await expect(add).toHaveCount(0);
  // どちらも「関係なかったもの」の外にある（国保は「ほかに」の中なので開く）
  for (const more of await main.getByRole('button', { name: /^ほかに/ }).all()) await more.click();
  for (const id of ['biz-start-kaigyo', 'job-leave-kokuho']) {
    await expect(main.locator('a[href$="/c/' + id + '"]:not(details a)'), id).toHaveCount(1);
    await expect(main.locator('details a[href$="/c/' + id + '"]'), id).toHaveCount(0);
  }
  await expect(page.getByRole('status').filter({ hasText: '目的を足しました' })).toHaveCount(1);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('screen-title');
});
