/* 11/6 の直し（A-1〜A-4・A-7・A-8・A-11）：ロゴと名前、日を選ぶカレンダー（日曜・祝日が赤）、開いている時間の1行とシート、
   カレンダーに追加（1つのボタン → シート）、病院の電話のボタンと公式のリンク */
import { expect, flow } from '../lib';

flow({
  id: 'todo1106-look',
  title: '11/6 の直し：ロゴ・カレンダー・病院の電話',
  touches: ['src/ui/AddToCalendar.tsx', 'src/ui/CalendarGrid.tsx', 'src/ui/guide.tsx', 'src/pages/Clinic.tsx', 'src/App.tsx', 'src/pages/Home.tsx', 'data/clinic.json', 'data/ui/strings.json'],
  evidence: ['docs/TODO_2026-11-06.md', 'docs/SPEC.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();

  await page.goto('/');
  await snap({ name: '入口のロゴ', input: '/ を開く', expected: '上の帯に Kurashi のロゴ（印＋名前）。入口の上にもロゴ', why: 'アプリ名の表記は「Kurashi」（A-11）' },
    async () => { await expect(page.getByRole('link', { name: /Kurashi/ }).first()).toBeVisible(); });

  // A1 の経路で、区役所の日を選ぶところまで
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap('はい');
  await tap('日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^自分で借りた部屋の鍵/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap('つぎへ');
  await tap('書いてある');
  await tap(/^学生$/);
  await tap('20歳から59歳まで');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  for (const name of ['まだどれにも入っていない', /^どちらでもない（厚生年金/, /^ない$/, /^はい$/]) { await tap(name); await tap('つぎへ'); }
  await expect(h1).toHaveText('いつ、区役所に行きますか？');
  await snap({ name: '日を選ぶ', input: '確かめの質問に答える', expected: '開いている時間は「平日 8:45〜17:15（要確認）」の1行と「くわしく」。カレンダーの日曜・祝日は赤い数字で、「祝」の印は無い', why: 'A-3・A-4（作者 11/6）' },
    async () => { await expect(page.locator('main')).toContainText('平日 8:45〜17:15（要確認）'); await expect(page.locator('.cal__mark', { hasText: '祝' })).toHaveCount(0); });

  await page.getByRole('button', { name: 'くわしく' }).first().click();
  await snap({ name: '開いている時間のシート', input: 'くわしく', expected: 'シートに、年末年始・日曜窓口の説明', why: '年末年始はシートへ（A-4）' },
    async () => { await expect(page.getByRole('dialog')).toContainText('12'); });
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  await page.locator('.cal__day:not([disabled]):not(.cal__day--today)').first().click();
  await snap({ name: '日を決めた', input: '今日より後の開いている日', expected: '「〇月〇日に決めました」。「カレンダーに追加」の1つのボタン（カレンダーの絵）', why: 'カレンダーに追加は日を決めた直後だけ（A-1・A-2）' },
    async () => { await expect(page.getByRole('button', { name: 'カレンダーに追加' })).toBeVisible(); });

  await tap('カレンダーに追加');
  await snap({ name: 'カレンダーに追加のシート', input: 'カレンダーに追加', expected: 'シートに1行の説明・行く区役所の選択・「予定のファイルを作る」', why: '区役所の選択と説明はシートの中（A-2）' },
    async () => { await expect(page.getByRole('dialog').getByRole('link', { name: '予定のファイルを作る' })).toBeVisible(); });
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  await page.goto('/clinic');
  await page.getByRole('button', { name: /^子ども/ }).click();
  await snap({ name: '病院の電話', input: '/clinic → こども', expected: '119・#7119・#8000 が電話のボタン（押すと電話）。#8000 は「子どもの病気の相談（夜・休みの日）」', why: 'A-7（作者 11/6）' },
    async () => { await expect(page.getByRole('link', { name: /#8000/ })).toHaveAttribute('href', 'tel:%238000'); });

  await tap('つぎへ');
  await snap({ name: '病院を探す公式のページ', input: 'つぎへ', expected: '「大きな病院」は1行。下に公式のページ3つ（あいち救急医療ガイド・ナビイ・あいち医療通訳システム）', why: '長い文を公式のリンクに置き換えた（A-7）' },
    async () => { await expect(page.getByRole('heading', { name: '病院を探す公式のページ' })).toBeVisible(); });
});
