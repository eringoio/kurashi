/* 作者 11/7 K-13：仕事の「就職する・した」と「辞める・辞めた」の流れ（仕事の在留資格の人）。全体に出る手続きを見せる */
import { expect, flow } from '../lib';

flow({
  id: 'todo1107-job-flow',
  title: '仕事：就職したとき・辞めたとき',
  touches: ['data/cards/job-employ-hoken.json', 'data/cards/job-leave-kokuho.json', 'data/events.json'],
  evidence: ['docs/TODO_2026-11-07.md', 'tests/core/job.test.ts'],
}, async (page, snap) => {
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  for (const [goal, label, cards] of [
    ['就職', /^就職・転職する/, '会社の健康保険・厚生年金・雇用保険／国民健康保険をやめる／入管に所属機関を届ける（転職したとき）／住民税は給料から'],
    ['退職', /^仕事を辞める/, '国民健康保険・国民年金に入る／住民税は自分で払う／入管に届ける（辞めたとき）・3か月の注意／（あとで）失業給付'],
  ] as const) {
    await page.goto('/e/E-job');
    await snap({ name: goal + '：何をするか', input: '仕事・アルバイト', expected: '最初に「何をしますか？」アルバイト／就職・転職／アルバイトを辞める／仕事を辞める／個人事業／会社／基本情報', why: 'K-13・v0.5.32（目的を最初に聞く）' }, async () => { await expect(page.locator('h1')).toHaveText('何をしますか？'); });
    await tap(label);
    await tap(/^日本以外の国籍/);
    await tap(/^技術・人文知識/);
    await page.getByRole('link', { name: '全体' }).first().click();
    await snap({ name: goal + '：全体', input: label.source, expected: cards, why: 'K-13（作者 11/7：就職と退職の流れも入れる）' }, async () => { await expect(page.locator('h1')).toHaveText('これからのこと'); });
  }
});
