/* 報告ボタン（作者の指示 2026-11-06 A-9）。手元はメモリに置き、一覧のトークンは dev-token（vite.config.ts） */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function check(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(',')), what).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), what + ' 横スクロール').toBeLessThanOrEqual(320);
}

test('報告：手続きのページの下から送る → ありがとう → /review で作者が読む（名前・連絡先は聞かない）', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/c/nagoya-tennyu-juukyochi');
  await page.getByRole('button', { name: '案内とちがうところを知らせる' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('button', { name: '送る' })).toBeDisabled();
  await expect(d.getByRole('textbox')).toHaveCount(1); // 名前・連絡先の欄は無い
  const word = 'テスト報告' + Date.now();
  await d.getByLabel('違ったところ').fill(word + '：窓口ではパスポートも見せた');
  await check(page, '報告のシート');
  await d.getByRole('button', { name: '送る' }).click();
  await expect(d).toContainText('ありがとうございます');

  await page.goto('/review');
  await page.getByLabel('トークン').fill('dev-token');
  await page.getByRole('button', { name: '読む' }).click();
  const sec = page.getByRole('region', { name: '報告' });
  await expect(sec).toContainText(word);
  await expect(sec).toContainText('/c/nagoya-tennyu-juukyochi');
});

test('報告：入口・設定などのページにはボタンを出さない。トークンが違えば読めない', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '案内とちがうところを知らせる' })).toHaveCount(0);
  await page.goto('/review');
  await page.getByLabel('トークン').fill('wrong');
  await page.getByRole('button', { name: '読む' }).click();
  await expect(page.getByRole('alert')).toContainText('401');
});
