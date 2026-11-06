/* 11/7 の小さい直し：A-3（届いた書類がわからない）・A-5（病院の帯・公式ページ・料金はシート）・B-9（ことばの意味は2段） */
import { expect, flow } from '../lib';

flow({
  id: 'todo1107-small',
  title: '11/7 の小さい直し：届いた書類・病院の帯・ことば',
  touches: ['src/pages/Clinic.tsx', 'src/core/clinic.ts', 'data/clinic.json', 'src/ui/Words.tsx', 'src/pages/Letter.tsx', 'data/ui/strings.json'],
  evidence: ['docs/TODO_2026-11-07.md', 'tests/e2e/clinic.spec.ts'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  await page.goto('/');
  await snap({ name: '入口 届いた書類', input: '/ を開く', expected: '入口のメニューに「届いた書類がわからない」', why: 'A-3' },
    async () => { await expect(page.getByRole('link', { name: /届いた書類がわからない/ })).toBeVisible(); });
  await page.getByRole('link', { name: /届いた書類がわからない/ }).click();
  await snap({ name: '届いた書類 見出し', input: '「届いた書類がわからない」', expected: '見出し「届いた書類がわからないとき」', why: 'A-3' },
    async () => { await expect(h1).toHaveText('届いた書類がわからないとき'); });

  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.goto('/clinic');
    await snap({ name: '病院 帯 幅' + w, input: '/clinic（幅 ' + w + 'px）', expected: '白い背景・細い枠の帯。電話の絵＋番号＋短い名前が3行（119 救急車・火事／#7119 救急の相談／#8000 子どもの急な病気の相談）。下に「救急車の呼び方」「番号のくわしく」', why: 'A-5a：オレンジの帯をやめ、コンパクトに。横スクロール 0' },
      async () => { await expect(page.locator('.clinic__tel')).toHaveCount(3); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); });
  }
  await page.getByRole('button', { name: '番号のくわしく' }).click();
  await snap({ name: '病院 番号のシート', input: '「番号のくわしく」', expected: 'シートに3つの番号の長い説明（通訳・24時間・つながらないときの番号）', why: 'A-5a：長い説明はシートへ' },
    async () => { await expect(page.getByRole('dialog')).toContainText('052-951-7119'); });
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
  await page.locator('.chips').getByRole('button', { name: /^子ども/ }).click().catch(async () => { await page.getByRole('button', { name: /^子ども/ }).first().click(); });
  await page.getByRole('button', { name: 'つぎへ' }).click();
  await snap({ name: '病院 2 公式のページが先', input: '子ども → つぎへ', expected: '「診断ではありません。病院の種類を説明する情報です。」。すぐ下に「病院を探す公式のページ」3つ。「まず近くのクリニックへ／小さな病院／大きな病院」は無い。下に「大きな病院の初診の料金」のリンク', why: 'A-5b・A-5c' },
    async () => { await expect(page.getByText('病院の種類を説明する情報です')).toBeVisible(); await expect(page.getByText('まず近くのクリニックへ')).toHaveCount(0); });
  await page.getByRole('button', { name: '大きな病院の初診の料金' }).click();
  await snap({ name: '病院 料金のシート', input: '「大きな病院の初診の料金」', expected: 'シートに特別の料金（7,000円以上・歯科5,000円以上・救急は除く。要確認）', why: 'A-5c：料金はシートだけ' },
    async () => { await expect(page.getByRole('dialog')).toContainText('7,000'); });
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  await page.goto('/words');
  await snap({ name: 'ことば 2段', input: '/words（ふつうの日本語）', expected: '意味は「やさしい日本語」と「English」の2段', why: 'B-9' },
    async () => { await expect(page.locator('.word__mean2').first()).toBeVisible(); });
});
