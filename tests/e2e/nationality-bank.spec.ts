/* 日本国籍の人に「在留期間の更新」を出さない・銀行の口座のページに公式ページのリンクを出さない */
import { expect, test, type Page } from '@playwright/test';

const keep = async (page: Page) => {
  const consent = page.getByRole('region', { name: /残しますか/ });
  await consent.getByRole('button', { name: '残す', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await expect(consent).toHaveCount(0);
  await page.waitForFunction(() => new Promise((r) => { const q = indexedDB.open('kurashi'); q.onsuccess = () => { q.result.close(); r(true); }; q.onerror = () => r(true); }));
  await page.waitForTimeout(300);
};
const stayTile = (page: Page) => page.locator('a[href^="/e/E-stay-renew"], a[href="/g/zairyu"]');

test.use({ viewport: { width: 390, height: 844 } });

test('在留期間の更新：未回答では入口に出る。日本国籍と答えると、入口・直接の URL で対象外。答えを変えると戻る', async ({ page }) => {
  await page.goto('/');
  await expect(stayTile(page).first()).toBeVisible();
  await page.goto('/e/E-stay-renew');
  await page.getByRole('button', { name: /日本国籍/ }).first().click();
  await keep(page);
  await page.goto('/');
  await expect(stayTile(page)).toHaveCount(0);
  for (const url of ['/e/E-stay-renew', '/e/E-stay-renew/c/zairyu-koshin']) {
    await page.goto(url);
    await expect(page.locator('#screen-title')).toBeVisible();
    await expect(page.getByText('日本国籍の人には関係ありません')).toBeVisible();
    await expect(page.getByRole('link', { name: /入口にもどる/ }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /日本国籍ではない/ }).click();
  await expect(page.getByText('日本国籍の人には関係ありません')).toHaveCount(0);
  await page.goto('/');
  await expect(stayTile(page).first()).toBeVisible();
});

test('銀行の口座を開く：公式ページのリンクを出さず、銀行に直接確認する案内を出す', async ({ page }) => {
  await page.goto('/e/E-bank/c/bank-account-open');
  await expect(page.getByText('銀行に直接確認してください')).toBeVisible();
  await expect(page.locator('a.k-official')).toHaveCount(0);
  await expect(page.locator('main a[href*="moj.go.jp"], main a[href*="isa.go.jp"]')).toHaveCount(0);
});
