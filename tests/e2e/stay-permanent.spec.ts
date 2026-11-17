/* HB-1：在留期間の更新の入口で「永住者・特別永住者」と答えた人に、「いまはすることはありません」ではなく、
   在留カード・特別永住者証明書の有効期間の更新の案内を出す。 */
import { expect, test, type Page } from '@playwright/test';

const h1 = (p: Page) => p.locator('#screen-title');
const tap = (p: Page, name: string | RegExp) => p.getByRole('button', { name }).first().click();
test.use({ viewport: { width: 390, height: 844 } });

test('在留期間の更新 → 日本以外の国籍 → 永住者・特別永住者：カードの更新の案内が出る（行き止まりにしない）', async ({ page }) => {
  await page.goto('/e/E-stay-renew');
  await expect(h1(page)).toBeVisible();
  await tap(page, '日本以外の国籍');
  await tap(page, /^永住者・特別永住者/);
  const main = page.locator('main');
  await expect(main).toContainText('在留期間の更新ではありません');
  await expect(main).toContainText('3か月前');
  await expect(main).toContainText('特別永住者証明書');
  await expect(main).not.toContainText('いまはすることはありません');
});
