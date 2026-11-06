/* 銀行の口座（作者の決定 2026-11-06 C）：口座がある → 来日6か月ぐらい → 一覧 → 居住者への変更 → 住み始めた日 → 6か月後をカレンダーに追加 */
import { expect, flow } from '../lib';

flow({
  id: 'todo1106-bank',
  title: '11/6：銀行の口座（ある・来日6か月）',
  touches: ['data/events.json', 'data/cards/bank-*.json', 'data/questions.json', 'src/ui/Reminder.tsx', 'src/core/engine.ts'],
  evidence: ['docs/TODO_2026-11-06.md', 'tests/core/bank-event.test.ts'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  await page.goto('/');
  await snap({ name: '入口', input: '/ を開く', expected: '入口のメニューに「銀行の口座」（よくある順の7番目）', why: 'C：デモに出すので公開のデータにした' },
    async () => { await expect(page.locator('a[href="/e/E-bank"]')).toBeVisible(); });
  await page.locator('a[href="/e/E-bank"]').click();
  await snap({ name: '口座があるか', input: '銀行の口座', expected: '「日本の銀行に、自分の口座はありますか？」（一度だけ聞いて残す）', why: 'C：ある人とない人で出す手続きが違う' },
    async () => { await expect(h1).toHaveText('日本の銀行に、自分の口座はありますか？'); });
  await tap(/^ある$/);
  await snap({ name: '国籍', input: 'ある', expected: '「国籍は？」と、絵付きの2つ（日本国籍・日本以外の国籍）。一度だけ聞く', why: 'B-4（11/7）：日本国籍の人には「居住者への変更」を出さない' },
    async () => { await expect(page.locator('h1')).toHaveText('国籍は？'); });
  await tap(/^日本以外の国籍/);
  await snap({ name: '来日の時期', input: '日本以外の国籍', expected: '「日本に住み始めて、どのくらいですか？」', why: '来日6か月の前後の人だけに「居住者への変更」を出す' },
    async () => { await expect(h1).toHaveText('日本に住み始めて、どのくらいですか？'); });
  await tap(/^6か月ぐらい/);
  await page.getByRole('link', { name: '全体' }).first().click();
  await snap({ name: '全体', input: '6か月ぐらい → 全体', expected: 'いま：口座を売らない・登録を変える・やめる・別の口座を作る。あとで（3）：カードを止める・新しいカード・居住者への変更。口座を作るは「関係なかったもの」', why: 'C（作者 11/6）' },
    async () => { await expect(page.locator('main')).toContainText('別の口座を作る'); await expect(page.locator('main')).toContainText('あとで'); });
  // 答えを残してから（同意の前はメモリだけ）、「あとで」の中のページを直接開く
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await expect(page.getByRole('region', { name: /残しますか/ })).toHaveCount(0); // 保存が始まってから開き直す（ときどき落ちたため）
  await page.waitForTimeout(300);
  await page.goto('/e/E-bank/c/bank-resident-change');
  await page.getByLabel('日本に住み始めた日').fill('2026-06-01');
  await snap({ name: '居住者への変更', input: '住み始めた日 2026-06-01', expected: '「12月1日ごろです（住み始めた日から6か月）」と「カレンダーに追加」', why: '6か月後のリマインダーを .ics で（AddToCalendar と同じ仕組み）' },
    async () => { await expect(page.getByRole('button', { name: 'カレンダーに追加' })).toBeVisible(); });
});
