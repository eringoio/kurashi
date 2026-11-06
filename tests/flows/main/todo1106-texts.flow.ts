/* 11/6 の直し（I-1〜I-4）：範囲外・準備中・免責の文と、相談窓口のシート */
import { expect, flow } from '../lib';

flow({
  id: 'todo1106-texts',
  title: '11/6 の直し：範囲外・準備中・免責・相談窓口',
  touches: ['src/pages/Info.tsx', 'src/ui/HelpSheet.tsx', 'src/core/help.ts', 'data/help.json', 'data/ui/strings.json'],
  evidence: ['docs/TODO_2026-11-06.md', 'data/help.json'],
}, async (page, snap) => {
  const main = page.locator('main');
  await page.goto('/info/out-of-scope');
  await snap({ name: '範囲外', input: '/info/out-of-scope', expected: '「名古屋市に住む人の手続きを案内しています。あなたの場合は、名古屋市の公式サイトで確かめてください。」とリンク。仮の文の印は無い', why: 'I-1（作者 11/6）' },
    async () => { await expect(main).toContainText('名古屋市の公式サイトで確かめてください'); await expect(page.locator('.draftmark')).toHaveCount(0); });
  await page.goto('/info/coming-soon');
  await snap({ name: '準備中', input: '/info/coming-soon', expected: '「まだ作っていません。名古屋市の公式サイトで確かめてください。」とリンク。準備中の一覧は無い', why: 'I-2' },
    async () => { await expect(page.getByRole('link', { name: /名古屋市の公式サイト/ })).toBeVisible(); await expect(main).not.toContainText('準備中の出来事'); });
  await page.goto('/info/disclaimer');
  await snap({ name: '免責', input: '/info/disclaimer', expected: '法律の助言ではない・判断は窓口など、AI チェックの印の説明', why: 'I-3' },
    async () => { await expect(main).toContainText('法律の助言ではなく'); await expect(main).toContainText('AIチェックの印'); });
  await page.getByRole('button', { name: /^相談/ }).click();
  await snap({ name: '相談窓口', input: '上の帯の「相談」', expected: '名古屋国際センター・入管のインフォメーションセンター・よりそいホットライン・#7119。押すと電話。公式ページのリンク', why: 'I-4（番号と時間は公式ページで確かめた）' },
    async () => { await expect(page.getByRole('dialog').getByRole('link', { name: /052-581-0100/ })).toHaveAttribute('href', 'tel:0525810100'); });
});
