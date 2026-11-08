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
  await page.getByRole('button', { name: 'まちがいを知らせる' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('button', { name: '送る' })).toBeDisabled();
  await expect(d.getByRole('textbox')).toHaveCount(1); // 名前・連絡先の欄は無い
  const word = 'テスト報告' + Date.now();
  await d.getByLabel('違ったところ').fill(word + '：窓口ではパスポートも見せた');
  await check(page, '報告のシート');
  await d.getByRole('button', { name: '送る' }).click();
  await expect(d).toContainText('ありがとうございます');

  await page.goto('/review');
  await page.getByRole('region', { name: '報告' }).getByLabel('トークン').fill('dev-token');
  await page.getByRole('region', { name: '報告' }).getByRole('button', { name: '読む' }).click();
  const sec = page.getByRole('region', { name: '報告' });
  await expect(sec).toContainText(word);
  await expect(sec).toContainText('/c/nagoya-tennyu-juukyochi');
});

test('報告：どの画面にもボタンがある（v0.5.17。作者の画面にはない）。トークンが違えば読めない', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'まちがいを知らせる' })).toHaveCount(1);
  await page.goto('/review');
  await expect(page.getByRole('button', { name: 'まちがいを知らせる' })).toHaveCount(0);
  await page.getByRole('region', { name: '報告' }).getByLabel('トークン').fill('wrong');
  await page.getByRole('region', { name: '報告' }).getByRole('button', { name: '読む' }).click();
  await expect(page.getByRole('alert')).toContainText('401');
});

test('報告：1文字ずつ打ってもフォーカスが入力欄に残る。Escape で閉じると開いたボタンに戻る', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/c/nagoya-tennyu-juukyochi');
  const opener = page.getByRole('button', { name: 'まちがいを知らせる' });
  await opener.click();
  const ta = page.getByRole('dialog').getByLabel('違ったところ');
  await ta.focus();
  for (const ch of 'abcあい') {
    await ta.pressSequentially(ch);
    await expect(ta).toBeFocused();
  }
  await expect(ta).toHaveValue('abcあい');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('報告：HTML の 200（SPA の代わりの返事）は送れたことにしない。入力は残り、直して送れる', async ({ page }) => {
  await page.route('**/api/report', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
  await page.goto('/c/nagoya-tennyu-juukyochi');
  await page.getByRole('button', { name: 'まちがいを知らせる' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('違ったところ').fill('テストです');
  await d.getByRole('button', { name: '送る' }).click();
  await expect(d.getByRole('alert')).toBeVisible();
  await expect(d).not.toContainText('ありがとうございます');
  await expect(d.getByLabel('違ったところ')).toHaveValue('テストです');
  await expect(d.getByRole('button', { name: '送る' })).toBeEnabled();
});

test('報告：シートの見出しと「閉じる」は、小さい画面でも見えて押せる', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/c/nagoya-tennyu-juukyochi');
  await page.getByRole('button', { name: 'まちがいを知らせる' }).click();
  const x = page.getByRole('dialog').getByRole('button', { name: '閉じる' });
  const b = await x.boundingBox();
  expect(b!.y).toBeGreaterThanOrEqual(0);
  expect(b!.width).toBeGreaterThanOrEqual(44);
  expect(b!.height).toBeGreaterThanOrEqual(44);
  await x.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
