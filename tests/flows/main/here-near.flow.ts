/* いまいる場所から（SPEC 6A.11）。中区役所の近く → 近くの質問 → ここでできること。断ったときは一覧と理由 */
import { expect, flow } from '../lib';

flow({
  id: 'here-near',
  title: 'いまいる場所から',
  touches: ['tests/e2e/here.spec.ts', 'src/pages/Here.tsx', 'src/core/places.ts', 'src/pages/Scene.tsx', 'data/places.json', 'data/**'],
  evidence: ['data/places.json', 'research/logs/places_ward_offices_2026-11-05.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  const context = page.context();
  // 中区役所（35.16898, 136.91008）の約100m北
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35.16988, longitude: 136.91008, accuracy: 30 });

  await page.goto('/here');
  await snap({ name: '最初', input: '「いまいる場所から」を開く', expected: '「いまいる場所から」。「位置を使う」と「区の一覧から選ぶ」。位置は送らず残さないと書いてある', why: '位置は押したときだけ求める。使わない道（一覧）も同じ重さで置く（6A.11）' },
    async () => { await expect(h1).toHaveText('いまいる場所から'); await expect(page.getByRole('button', { name: '位置を使う' })).toBeVisible(); await expect(page.getByRole('button', { name: '区の一覧から選ぶ' })).toBeVisible(); });

  await tap('位置を使う');
  await snap({ name: '近くの質問', input: '位置を使う（中区役所の約100m・誤差30m）', expected: '「中区役所の近くにいますか？」。「はい。ここでできることを見る」と「通っただけ」', why: '300m 以内で誤差も 300m 以下なら、近くの区役所を1つだけ尋ねる' },
    async () => { await expect(h1).toHaveText('中区役所の近くにいますか？'); await expect(page.getByRole('button', { name: '通っただけ' })).toBeVisible(); });

  await tap(/^はい。ここでできることを見る/);
  await snap({ name: 'ここでできること', input: 'はい。ここでできることを見る', expected: '「ここでできること」。中区役所の名前と、区役所でできる手続きの行', why: '区役所の場所では、行く前の手続きの一覧を出す' },
    async () => { await expect(h1).toHaveText('ここでできること'); await expect(page.locator('main')).toContainText('中区役所'); expect(new URL(page.url()).pathname).toBe('/here'); });

  // 断った場合：新しい文脈ではなく、位置の許可を外して最初から
  await context.clearPermissions();
  await page.goto('/here');
  await tap('位置を使う');
  await snap({ name: '断った一覧', input: '位置を使う（許可しない）', expected: '「どの区役所ですか？」。「位置は使いません。一覧から選んでください。」と16の区役所', why: '断っても止まらない。一覧から選べる' },
    async () => { await expect(h1).toHaveText('どの区役所ですか？'); await expect(page.locator('p[role=status]')).toHaveText('位置は使いません。一覧から選んでください。'); await expect(page.locator('main ul.list button')).toHaveCount(16); });
});
