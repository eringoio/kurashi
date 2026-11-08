/* 書類の検索（v0.5.31）：/letter の検索の欄（説明の言葉でも探せる）と、入口の検索の「書類」 */
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('/letter：書類だけの中を、説明の言葉でも探せる。選ぶと説明が開く', async ({ page }) => {
  await page.goto('/letter');
  // 写真の読み取りが使える設定なら「一覧から選ぶ」へ
  const pick = page.getByRole('button', { name: /一覧から選ぶ/ });
  if (await pick.isVisible().catch(() => false)) await pick.click();
  const box = page.getByRole('searchbox', { name: /書類を探す/ });
  await expect(box).toBeVisible();
  const list = page.locator('ul.list').last();
  await expect(list.getByRole('button')).toHaveCount(17); // 16件と「わからない」
  await box.fill('訴訟');
  await expect(list.getByRole('button', { name: /架空請求/ })).toBeVisible();
  await expect(list.getByRole('button')).toHaveCount(2);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/letter-search.png', fullPage: true });
  await box.fill('zzzz');
  await expect(page.getByRole('note').filter({ hasText: '見つかりません' })).toBeVisible();
  await box.fill('加入記録');
  await list.getByRole('button', { name: /ねんきん定期便/ }).click();
  await expect(page.locator('#screen-title')).toContainText('ねんきん定期便');
});

test('入口の検索：書類も出て、説明の画面へ進める', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('定期便');
  const docs = page.getByRole('region', { name: /書類/ }).or(page.locator('section.group').filter({ has: page.getByRole('heading', { name: /書類/ }) }));
  await expect(docs.getByRole('link', { name: /ねんきん定期便/ })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/home-search-doc.png', fullPage: true });
  await docs.getByRole('link', { name: /ねんきん定期便/ }).click();
  await expect(page).toHaveURL(/\/doc\/nenkin-teikibin$/);
});
