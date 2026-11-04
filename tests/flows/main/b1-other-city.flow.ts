/* B1：ほかの市から来た人の経路（本番データ）。同じ画面とデータの追加だけで動く */
import { expect, flow } from '../lib';

flow({
  id: 'b1-other-city',
  title: 'B1：ほかの市から来た',
  touches: ['tests/e2e/a1.spec.ts', 'tests/core/b1.test.ts', 'src/pages/**', 'src/core/entry.ts', 'data/**'],
  evidence: ['nagoya-tennyu-todoke', 'move-out-notice', 'nagoya-tennyu-juukyochi', 'nenkin-at-20', 'docs/VERIFY_DEMO.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();

  await page.goto('/move/from');
  await snap({ name: 'どこから', expected: '「どこから引っ越しましたか？」', why: '経路を分ける質問（A1・B1・X2）' },
    async () => { await expect(h1).toHaveText('どこから引っ越しましたか？'); });

  await tap('ほかの市・町・村から');
  await snap({ name: '持ち物', input: 'ほかの市・町・村から', expected: '「持っている物を、全部さわってください」', why: 'A1 と同じ画面。経路でデータだけが違う' },
    async () => { await expect(h1).toHaveText('持っている物を、全部さわってください'); });

  await page.getByRole('button', { name: /^マイナンバーカード/ }).click();
  await page.getByRole('button', { name: /^自分で借りた部屋の鍵/ }).click();
  await snap({ name: '2つ選んだ', input: 'マイナンバーカード・部屋の鍵', expected: '2つが選ばれた印', why: 'マイナンバーカードがあると、転出届をカードで出せる可能性（B1）' },
    async () => { await expect(page.getByRole('button', { name: /^マイナンバーカード/ })).toHaveAttribute('aria-pressed', 'true'); });

  await tap('つぎへ');
  await snap({ name: '立場', input: 'つぎへ', expected: '「今のおもな立場」。B1 は在留カードの裏の質問が無い', why: '在留カードを持たない経路なので、住所の確かめは聞かない' },
    async () => { await expect(h1).toHaveText(/今のおもな立場/); });

  await tap(/^学生$/);
  await tap('20歳未満');
  await snap({ name: '全体', input: '学生・20歳未満', expected: '「これからのこと」。国外からの経路のカード（住所の届け）は「関係なかったもの」に理由つきで入る', why: 'origin=other_city のとき、国外からの経路のカードは入口で対象外（tests/core/b1.test.ts。制度の対象外とは言わない）' },
    async () => {
      await expect(h1).toHaveText('これからのこと');
      await page.locator('summary', { hasText: '関係なかったもの' }).click();
      await expect(page.getByRole('link', { name: /住所の届け/ })).toBeVisible();
    });

  await page.getByRole('link', { name: 'いま', exact: true }).click();
  await snap({ name: '転出届を出したか', input: 'いま', expected: '「前に住んでいた市区町村で、転出届を出しましたか？」', why: '転入届の前提（転出届 or 転出証明書）を確かめる' },
    async () => { await expect(h1).toHaveText('前に住んでいた市区町村で、転出届を出しましたか？'); });

  await tap('マイナンバーカードを使って出した');
  await snap({ name: '答えで変わったこと', input: 'マイナンバーカードを使って出した', expected: '「この答えで変わったこと」と結果', why: '転出届は済み（カード）。この答えを手続きの表示に反映する' },
    async () => { await expect(page.locator('.eyebrow')).toHaveText('この答えで変わったこと'); });
});
