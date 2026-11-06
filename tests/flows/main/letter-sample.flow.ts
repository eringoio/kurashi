/* 届いた書類がわからない（SPEC 6A.9）：写真読み取りは既定で off。一覧から選ぶ → 見本の画像と大事な言葉 */
import { expect, flow } from '../lib';

flow({
  id: 'letter-sample',
  title: '届いた書類がわからない（一覧から選ぶ → 見本と大事な言葉）',
  touches: ['tests/e2e/letter.spec.ts', 'src/pages/Letter.tsx', 'src/core/documents.ts', 'data/documents.json', 'public/samples/**'],
  evidence: ['nagoya-kokuho-kanyu', 'docs/SPEC.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();

  await page.goto('/letter');
  await snap({ name: '入口', input: '/letter を開く', expected: '「届いた書類がわからないとき」。写真のボタンはなく、書類の一覧がそのまま出る', why: '写真の読み取りは公開するときまで off。写真を使わなくても進める（6A.9）' },
    async () => { await expect(h1).toHaveText('届いた書類がわからないとき'); await expect(page.locator('input[type=file]')).toHaveCount(0); await expect(page.getByRole('button', { name: /国民年金の加入のお知らせ/ })).toBeVisible(); });

  await tap(/国民年金の加入のお知らせ/);
  await snap({ name: '結果', input: '国民年金の加入のお知らせ', expected: '書類の名前の見出し、架空の見本の画像、大事な言葉（基礎年金番号など）、期限・金額・番号は読まない注意、関係する手続き', why: '一覧から選んだ書類を、見本と言葉で説明する。期限・金額は出さない' },
    async () => { await expect(h1).toHaveText('国民年金の加入のお知らせ'); await expect(page.locator('img.letter__photo')).toBeVisible(); await expect(page.locator('dl.letter__words')).toContainText(/基礎.*年金.*番号/); await expect(page.locator('section[aria-labelledby="letter-cards"] li')).not.toHaveCount(0); });
});
