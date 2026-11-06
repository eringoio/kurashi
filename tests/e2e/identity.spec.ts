/* 手続きの名前と行き先がずれていないか（早い検査。幅 320px の1ページを使い回す）。
   - 作った全てのできごと × 手続き：/e/<event>/c/<card> が開き、見出し h1 が「見つかりません」ではない
   - どのページにも undefined を含むリンクが無い
   - /search：英語の語 housing で候補が出る（すべてのできごとを検索する）
   - /all の輪：どの項目も輪の箱の中（幅 320・640・1280） */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const events = (JSON.parse(readFileSync('data/events.json', 'utf8')) as { events: { id: string; status?: string; card_ids: string[] }[] }).events;
const built = events.filter((e) => (e.status ?? 'built') === 'built');
const strings = JSON.parse(readFileSync('data/ui/strings.json', 'utf8')) as Record<string, { ja: string }>;
const notFound = strings['card.notFound'].ja.replace(/\{([^|}]+)\|[^}]+\}/g, '$1');

test('全てのできごと × 手続き：見出しがあり、見つかりませんではなく、undefined のリンクが無い', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 320, height: 720 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const bad: string[] = [];
  expect(built.length).toBeGreaterThan(0);
  for (const e of built) {
    for (const c of e.card_ids) {
      const to = `/e/${e.id}/c/${c}`;
      await page.goto(to);
      const h1 = page.locator('h1');
      await expect(h1, to).toBeVisible();
      const t = (await h1.innerText()).replace(/\s+/g, '');
      if (t.includes(notFound.replace(/\s+/g, '')) || t === '') bad.push(`${to}: h1=${t}`);
      const n = await page.locator('a[href*="undefined"]').count();
      if (n) bad.push(`${to}: undefined href x${n}`);
    }
  }
  expect(bad).toEqual([]);
  await ctx.close();
});

test('検索：housing で候補が出る', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/search');
  await page.getByRole('searchbox').fill('housing');
  await expect(page.locator('main a[href^="/"]').first()).toBeVisible();
  const hrefs = await page.locator('main a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.filter((h) => h && h.includes('housing')).length).toBeGreaterThan(0);
  expect(hrefs.filter((h) => h?.includes('undefined'))).toEqual([]);
});

async function insideWorld(page: Page, what: string) {
  const ring = (await page.locator('.world').boundingBox())!;
  const items = await page.locator('.world__item').all();
  expect(items.length, what).toBeGreaterThan(0);
  for (const it of items) {
    const r = (await it.boundingBox())!;
    expect(r.x, what).toBeGreaterThanOrEqual(ring.x - 0.5);
    expect(r.y, what).toBeGreaterThanOrEqual(ring.y - 0.5);
    expect(r.x + r.width, what).toBeLessThanOrEqual(ring.x + ring.width + 0.5);
    expect(r.y + r.height, what).toBeLessThanOrEqual(ring.y + ring.height + 0.5);
  }
}

test('/all の輪：どの項目も輪の箱の中（320・640・1280）', async ({ page }) => {
  await page.goto('/all');
  for (const width of [320, 640, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.world')).toBeVisible();
    await insideWorld(page, `/all ${width}`);
  }
});
