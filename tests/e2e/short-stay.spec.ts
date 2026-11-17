/* 短期滞在の人（R-10 / O-4）：専用の画面へ。住民登録の形・立場・年齢は聞かない。使える入口が並ぶ。 */
import { expect, test, type Page } from '@playwright/test';

const h1 = (p: Page) => p.locator('#screen-title');
const go = async (p: Page, to: string) => { await p.evaluate((x) => { history.pushState(null, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, to); await p.waitForTimeout(300); };
const tap = (p: Page, name: string | RegExp) => p.getByRole('button', { name }).first().click();
test.use({ viewport: { width: 390, height: 844 } });

test('引っ越し → 日本以外の国籍 → 短期滞在：専用の画面。立場・年齢・住民登録の形は聞かない', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  await tap(page, '日本以外の国籍');
  await expect(h1(page)).toHaveText('在留資格は？');
  await tap(page, /短期滞在/);
  await expect(page).toHaveURL(/\/short-stay$/);
  await expect(h1(page)).toHaveText('短期滞在の人へ');
  await expect(page.locator('main')).toContainText('住民登録');
  await expect(page.locator('main')).toContainText('国民健康保険');
  await expect(page.locator('main')).toContainText('要確認');
  // 使える入口
  for (const name of [/ごみ/, /病院/, /防災/]) await expect(page.locator('main a.tile', { hasText: name }).first()).toBeVisible();
  // 官庁の案内（開いたときだけ）
  await page.locator('summary', { hasText: 'もっと長くいたいとき' }).click();
  await expect(page.locator('main a[href*="isa/applications/status/temporaryvisitor"]')).toBeVisible();
  // もどっても、立場・年齢は聞かれない
  await page.goto('/move/basis');
  await expect(page.locator('body')).not.toContainText('立場は？');
});

test('短期滞在と答えたあと：市外へ出る・市内の引っ越しの直接の URL も専用の画面。入口の上に1行。ごみは使える', async ({ page }) => {
  await page.goto('/about');
  await tap(page, '日本以外の国籍');
  await page.getByRole('button', { name: /短期滞在/ }).first().click();
  for (const url of ['/e/E-move-out', '/e/E-move-within']) {
    await go(page, url);
    await expect(h1(page)).toHaveText('短期滞在の人へ');
  }
  await go(page, '/');
  await expect(page.getByRole('link', { name: /短期滞在の人へ/ })).toBeVisible();
  await go(page, '/gomi');
  await expect(h1(page)).not.toHaveText('短期滞在の人へ');
  await go(page, '/e/E-stay-renew');
  await expect(h1(page)).not.toHaveText('短期滞在の人へ');
});

test('古い保存（住民登録の形が短期滞在・在留資格は未回答）でも引っ越しは専用の画面', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  await tap(page, '日本以外の国籍');
  await tap(page, /^留学/);
  await tap(page, '20歳から59歳まで');
  await tap(page, '日本の外から');
  await tap(page, 'つぎへ');
  await expect(h1(page)).toHaveText(/住民登録について/);
  await tap(page, /短い滞在|短期/);
  await expect(page).toHaveURL(/\/short-stay$/);
});

test('HB-3：留学の人が「住むためではない、短い滞在」と答えても、画面に理由が出て、答えを変えれば引っ越しの案内にもどれる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap(page, 'はい');
  await tap(page, '日本以外の国籍');
  await tap(page, /^留学/);
  await tap(page, '20歳から59歳まで');
  await tap(page, '日本の外から');
  await tap(page, 'つぎへ');
  await expect(h1(page)).toHaveText(/住民登録について/);
  await tap(page, /短い滞在|短期/);
  await expect(page).toHaveURL(/\/short-stay$/);
  // どの答えでこの画面になったかが出る。在留資格（留学）が原因ではない
  await expect(page.locator('main')).toContainText('住むためではない、短い滞在');
  await expect(page.locator('main')).not.toContainText('「在留資格」を「短期滞在」と答えた');
  await page.getByRole('link', { name: '住民登録の答えを変える' }).click();
  await expect(page).toHaveURL(/\/move\/basis$/);
  await expect(page.locator('main')).toContainText('住民登録について');
  await tap(page, /あとで届く/);
  await expect(page).not.toHaveURL(/\/short-stay$/);
  // 答えを変えたあとは、短期滞在の画面ではなく引っ越しの案内（いま）にもどる
  await expect(page).toHaveURL(/\/now$/);
  await expect(page.locator('main')).not.toContainText('短期滞在の人へ');
});
