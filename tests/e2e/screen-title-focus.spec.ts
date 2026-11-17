/* UX-1・UX-2・C-6：画面ごとの document.title と、答えたあとのフォーカス（新しい見出しへ） */
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('document.title は「見出し — Kurashi」（ふりがなを含まない）', async ({ page }) => {
  await page.goto('/e/E-stay-renew');
  const h1 = page.locator('#screen-title');
  await expect(h1).toBeVisible();
  const text = ((await h1.locator('.bi__main').first().evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll('rt,rp,wbr').forEach((n) => n.remove());
    return c.textContent ?? '';
  })) || '').replace(/\s+/g, ' ').trim();
  expect(text.length).toBeGreaterThan(0);
  await expect.poll(() => page.title()).toBe(text + ' — Kurashi');
  await page.goto('/gomi');
  await expect.poll(() => page.title()).toMatch(/ — Kurashi$/);
  expect(await page.title()).not.toBe(text + ' — Kurashi');
});

test('質問に答えると、フォーカスは body に落ちず、画面の見出しにある', async ({ page }) => {
  await page.goto('/e/E-stay-renew');
  await page.getByRole('button', { name: /日本国籍/ }).first().click();
  await expect(page.locator('#screen-title')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test('C-6：全体の画面で答えると、何が変わったかを1行で言い、フォーカスはその行（body に落ちない）', async ({ page }) => {
  await page.goto('/e/E-lost-wallet');
  for (const name of [/^キャッシュカード/, /^在留カード/]) await page.getByRole('button', { name }).click();
  await page.getByRole('button', { name: 'つぎへ' }).click();
  await expect(page.locator('#screen-title')).toHaveText(/手続きの全体/);
  await page.getByRole('button', { name: '外（道など）' }).click();
  const st = page.locator('p.k-change__line[role=status]');
  await expect(st).toContainText('答えました：外（道など）');
  await expect(st).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test('Fable C-2：「最初から」は1回で消さず、何が消えるかを言って確かめる', async ({ page }) => {
  // 仕事の入口：最初の質問（何をしますか）の答えは、このできごとの記録に入る
  await page.goto('/e/E-job');
  await page.locator('main .k-answer').first().click();
  await expect(page.locator('#screen-title')).not.toHaveText(/何をしますか/);
  const start = page.getByRole('button', { name: '最初から', exact: true });
  await expect(start).toBeVisible();
  const title = await page.locator('#screen-title').innerText();
  await start.click();
  await expect(page.getByRole('alert')).toContainText('消えます');
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#screen-title')).toHaveText(title);
  await expect(start).toBeVisible();
});
