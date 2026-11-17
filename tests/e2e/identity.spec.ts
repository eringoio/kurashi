/* 手続きの名前と行き先がずれていないか（早い検査。幅 320px の1ページを使い回す）。
   - 作った全てのできごと × 手続き：/e/<event>/c/<card> が開き、見出し h1 が「見つかりません」ではない
   - どのページにも undefined を含むリンクが無い
   - /search：英語の語 housing で候補が出る（すべてのできごとを検索する）
   - /all の輪：どの項目も輪の箱の中（幅 320・640・1280） */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const events = (JSON.parse(readFileSync('data/events.json', 'utf8')) as { events: { id: string; status?: string; card_ids: string[] }[] }).events;
const built = events.filter((e) => (e.status ?? 'built') === 'built');
const strings = JSON.parse(readFileSync('data/ui/strings.json', 'utf8')) as Record<string, { ja: string }>;
const notFound = strings['card.notFound'].ja.replace(/\{([^|}]+)\|[^}]+\}/g, '$1');

/* できごとごとに1つのテスト。ページを開くのは1回だけで、手続きの間は画面の中で移る（router は popstate を聞く）。
   前は 163 回 page.goto して、忙しい機械で 240 秒を超えていた（Fable 監査 FD-4） */
test.describe.configure({ mode: 'parallel' });
for (const e of built) {
  test(`${e.id} の手続き：見出しがあり、見つかりませんではなく、undefined のリンクが無い`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    const bad: string[] = [];
    expect(e.card_ids.length).toBeGreaterThan(0);
    for (const [i, c] of e.card_ids.entries()) {
      const to = `/e/${e.id}/c/${c}`;
      if (i === 0) await page.goto(to);
      else {
        await page.evaluate((p) => { history.pushState(null, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, to);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      }
      await expect(page).toHaveURL(new RegExp(to + '$'));
      const h1 = page.locator('h1');
      await expect(h1, to).toBeVisible();
      const t = (await h1.innerText()).replace(/s+/g, '');
      if (t.includes(notFound.replace(/s+/g, '')) || t === '') bad.push(`${to}: h1=${t}`);
      const n = await page.locator('a[href*="undefined"]').count();
      if (n) bad.push(`${to}: undefined href x${n}`);
    }
    expect(bad).toEqual([]);
  });
}

test('検索：housing で候補が出る', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/search');
  await page.getByRole('searchbox').fill('housing');
  await expect(page.locator('main a[href^="/"]').first()).toBeVisible();
  const hrefs = await page.locator('main a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.filter((h) => h && h.includes('housing')).length).toBeGreaterThan(0);
  expect(hrefs.filter((h) => h?.includes('undefined'))).toEqual([]);
});

test('/all の道：縦（320・640）と横（1280）。キャラクターは1つ（v0.5.31）', async ({ page }) => {
  await page.goto('/all');
  for (const width of [320, 640, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.road')).toBeVisible();
    await expect(page.locator('.road__you')).toHaveCount(1);
    const dir = await page.locator('.road__stages').evaluate((el) => getComputedStyle(el).flexDirection);
    expect(dir, `/all ${width}`).toBe(width >= 1024 ? 'row' : 'column');
  }
});
