/* 報告ボタン（作者の指示 2026-11-06 A-9）：手続きのページの下 → シート → ありがとう */
import { expect, flow } from '../lib';

flow({
  id: 'todo1106-report',
  title: '11/6：報告ボタン',
  touches: ['src/ui/ReportSheet.tsx', 'worker/report.ts', 'src/pages/ReviewReports.tsx', 'src/App.tsx'],
  evidence: ['docs/TODO_2026-11-06.md', 'tests/e2e/report.spec.ts'],
}, async (page, snap) => {
  await page.goto('/c/nagoya-tennyu-juukyochi');
  await page.getByRole('button', { name: '案内とちがうところを知らせる' }).click();
  await page.getByRole('dialog').getByLabel('違ったところ').fill('窓口では、パスポートも見せるように言われました。');
  await snap({ name: 'シート', input: '手続きのページの下の「案内とちがうところを知らせる」', expected: '説明（名前・連絡先は書かない・送るのは場所・文・表示の言葉・日時だけ）・自由記述・「送る」', why: 'A-9：名前・連絡先は聞かない' },
    async () => { await expect(page.getByRole('dialog').getByRole('button', { name: '送る' })).toBeEnabled(); });
  await page.getByRole('dialog').getByRole('button', { name: '送る' }).click();
  await snap({ name: '送った', input: '送る', expected: '「ありがとうございます。作者が確かめて、案内を直します。」', why: '返事はしない' },
    async () => { await expect(page.getByRole('dialog')).toContainText('ありがとうございます'); });
});
