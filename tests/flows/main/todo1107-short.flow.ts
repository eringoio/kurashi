/* 11/7 B-7a：文字を減らす。対象の画面を幅 390 で撮る（直す前と後を screenshots/candidate/todo1107-short/ で比べる） */
import { expect, flow } from '../lib';

const PAGES: [string, string][] = [
  ['入口', '/'], ['引っ越しの最初', '/move'], ['どこから', '/move/from'], ['持ち物', '/move/objects'], ['立場', '/move/basis'],
  ['銀行の最初の質問', '/e/E-bank'], ['病院 1', '/clinic'], ['住まい 探し方', '/c/housing-search'], ['住まい 費用', '/c/housing-initial-costs'],
  ['ごみ', '/gomi'], ['ことば', '/words'], ['仕事の最初', '/e/E-job'],
];
flow({
  id: 'todo1107-short',
  title: '11/7 B-7a：文字を減らす（直す前と後）',
  touches: ['src/pages/Home.tsx', 'src/pages/Move.tsx', 'src/pages/EventEntry.tsx', 'src/pages/Clinic.tsx', 'src/pages/Gomi.tsx', 'src/ui/Words.tsx', 'src/ui/HouseVisual.tsx', 'data/ui/strings.json'],
  evidence: ['docs/TODO_2026-11-07.md'],
}, async (page, snap) => {
  for (const [name, to] of PAGES) {
    await page.goto(to);
    await snap({ name, input: to, expected: '本文は5行以内が目安。説明の段落は「くわしく」のシートへ', why: 'B-7a（作者 11/6 夜：まだ文字が多い）' },
      async () => { await expect(page.locator('h1').first()).toBeVisible(); });
  }
});
