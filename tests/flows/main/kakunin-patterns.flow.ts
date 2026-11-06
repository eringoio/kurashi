/* 11/7 A-6：「要確認」の見本。札が付く3つの場合（ルールが原文で未確認・「わからない」と答えた・聞く質問が無い）と、
   文の中の「（要確認）」の4つを、いまの形（札「要確認」）とおすすめの形（札「窓口で確認」）で撮る。作者が見て決めるまで文は変えない。
   経路は B1（ほかの市から）で、転出届に「わからない」と答える：転入届＝未確認、転出届＝わからない、国民年金＝質問が無い */
import { expect, flow } from '../lib';

flow({
  id: 'kakunin-patterns',
  title: '11/7 A-6：「要確認」の見本（いまの形・おすすめの形 × 4）',
  touches: ['src/ui/guide.tsx', 'data/ui/strings.json'],
  evidence: ['docs/TODO_2026-11-07.md'],
}, async (page, snap) => {
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  await page.goto('/move/from');
  await tap('ほかの市・町・村から');
  await tap('つぎへ');
  await tap(/^学生$/);
  await tap('20歳未満');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('前に住んでいた市区町村で、転出届を出しましたか？');
  await tap(/^わからない$/);
  await expect(page.locator('.k-change__line')).toHaveText(/になりました$/);

  const PAT: [string, string, string, string][] = [
    ['ルールが未確認', '/c/nagoya-tennyu-todoke', 'まだ公式の原文で確かめていません', '(1) ルールが公式の原文で未確認'],
    ['「わからない」と答えた', '/c/move-out-notice', '「わからない」と答えた', '(2) 質問に「わからない」と答えた'],
    ['質問が無い', '/c/kokumin-nenkin-kanyu', '確かめる質問がありません', '(3) 聞く質問がアプリに無い'],
    ['文の中の（要確認）', '/c/mail-forward', '要確認', '(4) 文の中の目安の印（札とは別）'],
  ];
  for (const alt of [false, true]) {
    if (alt) { await page.evaluate(() => sessionStorage.setItem('kurashi:kakunin_alt', 'on')); await page.reload(); }
    const form = alt ? 'おすすめ' : 'いま';
    for (const [name, to, text, why] of PAT) {
      await page.goto(to);
      await snap({ name: form + '：' + name, input: to, expected: (alt ? '札「窓口で確認」' : '札「要確認」') + '。理由の一文「' + text + '」', why: 'A-6 ' + why + '。作者が見て決める' },
        async () => { await expect(page.locator('main')).toContainText(text); });
    }
  }
});
