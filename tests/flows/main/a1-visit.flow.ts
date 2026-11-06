/* A1：区役所へ付き添い（SPEC 6A.6）。今日 → 行く前 → 持ち物 → 窓口で → 終わったら → 全部できた */
import { expect, flow } from '../lib';

flow({
  id: 'a1-visit',
  title: 'A1：区役所の付き添い',
  touches: ['tests/e2e/visit.spec.ts', 'src/pages/Visit.tsx', 'src/core/accompany.ts', 'src/pages/Entry.tsx', 'data/**'],
  evidence: ['nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu', 'docs/VERIFY_DEMO.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();

  // 準備：A1 の経路で、区役所の3つを今日に決める（a1-abroad と同じ操作）
  await page.goto('/');
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap('はい');
  await tap('日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^部屋の鍵/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap('つぎへ');
  await tap('書いてある');
  await tap(/^学生$/);
  await tap('20歳から59歳まで');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  const answerThenNext = async (name: string | RegExp) => { await tap(name); await expect(page.locator('.k-change__line')).toHaveText(/になりました$/); };
  await answerThenNext('まだどれにも入っていない');
  await answerThenNext(/^どちらでもない（厚生年金/);
  await answerThenNext(/^ない$/);
  await answerThenNext(/^はい$/);
  await tap(/^今日/);

  await page.goto('/');
  await snap({ name: '今日は行く日', input: '開き直す（区役所を今日に決めた）', expected: '「今日の予定」。区役所の見出しの下に3つの手続きと「区役所へ行く準備をする」', why: '今日が決めた日なら「今日は行く日」（6A.1）。行く所ごとにまとめて付き添いを始める（6A.6）' },
    async () => { await expect(page).toHaveURL(/\/today$/); await expect(h1).toHaveText('今日の予定'); await expect(page.getByRole('link', { name: '区役所へ行く準備をする' })).toBeVisible(); });

  await page.getByRole('link', { name: '区役所へ行く準備をする' }).click();
  await snap({ name: '行く前', input: '区役所へ行く準備をする', expected: '「持ち物を確かめましょう」。今日の3つの手続きと、持っている物（在留カード・パスポート・学生証）が並ぶ', why: '区役所に持っていく物のうち、持ち物の答えで「持っている」にした物だけ出す（bring_to: ward_office）' },
    async () => { await expect(page).toHaveURL(/\/visit\/ward_office$/); await expect(h1).toHaveText('持ち物を確かめましょう'); await expect(page.locator('.k-check')).toHaveCount(3); });

  for (const name of [/^在留カード/, /^パスポート/, /^学生証/]) await page.getByRole('button', { name }).click();
  await snap({ name: '持ち物を入れた', input: '在留カード・パスポート・学生証', expected: '3つに入れた印（aria-pressed）', why: '出かける前に、自分で入れたか確かめる' },
    async () => { for (const b of await page.locator('.k-check').all()) await expect(b).toHaveAttribute('aria-pressed', 'true'); });

  await tap('区役所に着いた');
  await snap({ name: '窓口で', input: '区役所に着いた', expected: '「この画面を窓口の人に見せましょう」。手続きごとに「転入届（住居地の届出）の手続きをしたいです。」などの日本語の文', why: '窓口で言うことは、カードの正式名と決まった文から作る（AI で作らない）' },
    async () => { await expect(page).toHaveURL(/\/visit\/ward_office\/counter$/); await expect(h1).toHaveText('この画面を窓口の人に見せましょう'); await expect(page.locator('section.k-counter')).toHaveCount(3); await expect(page.locator('main')).toContainText(/転入届.*住居地.*届出.*手続.*したいです/); });

  await tap('終わった');
  await snap({ name: '終わったら', input: '終わった', expected: '「どうでしたか？」。一番上に「全部できた」。手続きごとに できた／できなかった。下に「行けなかった」', why: 'B-7（作者 11/6）：手続きごとの2択。選んでいない手続きは未確認' },
    async () => { await expect(page).toHaveURL(/\/visit\/ward_office\/after$/); await expect(h1).toHaveText('どうでしたか？'); await expect(page.getByRole('button', { name: '全部できた' })).toBeVisible(); await expect(page.getByRole('button', { name: 'できた', exact: true })).toHaveCount(3); });

  await tap('全部できた');
  await snap({ name: '結果', input: '全部できた', expected: '「記録しました」「区役所の手続きが、できました」と「つぎへ」', why: '操作のあとは結果と「つぎへ」。3つが済みになる' },
    async () => { await expect(page.locator('.eyebrow')).toHaveText('記録しました'); await expect(h1).toHaveText('区役所の手続きが、できました'); });

  await tap('つぎへ');
  await snap({ name: 'つぎへ', input: 'つぎへ', expected: '「いまの1つ」へ戻る（/now）', why: '区役所が済んだので、次の確かめへ' },
    async () => { await expect(page).toHaveURL(/\/now$/); });
});
