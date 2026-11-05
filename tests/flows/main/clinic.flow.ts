/* 病院の案内（SPEC 6A.13）：どこが困っている → 診療科 → 行く前に。こどもは #8000 も出る */
import { expect, flow } from '../lib';

flow({
  id: 'clinic',
  title: '病院の案内（歯・口、こども）',
  touches: ['tests/e2e/clinic.spec.ts', 'src/pages/Clinic.tsx', 'src/ui/BodyMap.tsx', 'src/core/clinic.ts', 'data/clinic.json'],
  evidence: ['docs/SPEC.md', 'docs/prompts/kurashi_autorun/03_CLINIC.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  const band = page.locator('aside.clinic__band');

  await page.goto('/clinic');
  await snap({ name: '1 どこが（空）', input: '/clinic を開く', expected: '「どこが困っていますか？」。言葉で探す欄、からだの絵と場所のボタン。「つぎへ」は押せない。119・#7119 の帯', why: '場所を選ぶまで進めない（6A.13）' },
    async () => { await expect(h1).toHaveText('どこが困っていますか？'); await expect(page.getByRole('button', { name: 'つぎへ' })).toBeDisabled(); await expect(band).toBeVisible(); });

  await page.getByLabel('言葉で探す').fill('tooth');
  await snap({ name: '1 tooth と打つ', input: '「tooth」', expected: '候補に「歯・口」のボタンが出る', why: '言葉から場所を探せる' },
    async () => { await expect(page.locator('.chips').first().getByRole('button', { name: /歯・口/ })).toBeVisible(); });

  await page.locator('.chips').first().getByRole('button', { name: /歯・口/ }).click();
  await snap({ name: '1 歯・口を選ぶ', input: '歯・口', expected: '「歯・口」が選ばれ、「つぎへ」が押せる。#8000 は出ない', why: 'こどもを選んだときだけ #8000' },
    async () => { await expect(page.getByRole('button', { name: 'つぎへ' })).toBeEnabled(); await expect(band).not.toContainText('#8000'); });

  await tap('つぎへ');
  await snap({ name: '2 まず、ここへ', input: 'つぎへ', expected: '「まず、ここへ行ってみましょう」。1つめは歯科。「どこに行くかは、あなたが決めます」', why: '診断せず、見る所の順番だけ示す' },
    async () => { await expect(h1).toHaveText('まず、ここへ行ってみましょう'); await expect(page.locator('.clinic__first h2')).toContainText('歯科'); });

  await tap('つぎへ');
  await snap({ name: '3 行く前に', input: 'つぎへ', expected: '「行く前に」。「近くの歯科を探す」の公式ページへのリンク、持ち物、受付で見せる言葉「歯が痛いです。」', why: '探すのは公式の検索ページ。URL にクエリを付けない' },
    async () => {
      await expect(h1).toHaveText('行く前に');
      await expect(page.getByRole('link', { name: /^近くの歯科を探す/ })).toHaveAttribute('href', 'https://www.iryou.teikyouseido.mhlw.go.jp/');
      await expect(page.locator('.k-counter', { hasText: '歯が痛いです' }).first()).toBeVisible();
    });

  await page.goto('/clinic');
  await page.getByRole('button', { name: /^子ども/ }).click();
  await snap({ name: 'こども 帯に #8000', input: 'こども（絵にないもの）', expected: '帯の項目が 2 つから 3 つになる（こどもの電話 #8000 が加わる）。※いまは電話番号の数字が帯に出ていない（要修正）', why: '#8000 はこどものときだけ' },
    async () => { await expect(band.locator('li')).toHaveCount(3); });
});
