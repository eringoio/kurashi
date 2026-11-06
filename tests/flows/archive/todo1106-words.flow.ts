/* 語学学習の最初の版（作者が OK 2026-11-06。STATUS 10b）：ことばの一覧 → 言う文に★ → ★だけ */
import { expect, flow } from '../lib';

flow({
  id: 'todo1106-words',
  title: '11/6：ことば（語学学習の最初の版）',
  touches: ['src/ui/Words.tsx', 'src/core/words.ts', 'data/words.json', 'src/pages/Visit.tsx', 'src/pages/Letter.tsx'],
  evidence: ['docs/LANGUAGE_STUDY_REVIEW.md', 'tests/core/words.test.ts'],
}, async (page, snap) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^ことば/ }).click();
  await snap({ name: 'まだない', input: 'メニューの「ことば」', expected: '「まだありません」と、まず言えると便利な文（6つ）。点数・連続日数は無い', why: '窓口・書類で出会った言葉が自動で残る。最初は言う文から始められる' },
    async () => { await expect(page).toHaveURL(/\/words$/); await expect(page.locator('.word')).toHaveCount(6); });

  await page.getByRole('button', { name: /^大事にする：もう一度/ }).click();
  await snap({ name: '★を付けた', input: '「もう一度、ゆっくり言ってください」の☆', expected: '一覧の上にその文が★付きで残る', why: '★で大事にする（6A.8）' },
    async () => { await expect(page.locator('ul.words').first().locator('.word')).toHaveCount(1); });

  await page.getByRole('button', { name: /★だけ/ }).click();
  await snap({ name: '★だけ', input: '「★だけ」', expected: '★を付けた文だけ', why: '絞り込み（★・今日・種類・言葉で探す）' },
    async () => { await expect(page.getByRole('button', { name: /★だけ/ })).toHaveAttribute('aria-pressed', 'true'); });
});
