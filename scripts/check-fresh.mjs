// 日付で古くなるデータの検査（REL-8・G-10）。公開の前（npm run deploy）と npm run check で、本当の日付（日本の日付）で回す。
// 期限の 30 日前から止める。止まったら、メッセージの手順でデータを写し直す（日付だけ延ばさない。市・内閣府の公式の表を写す）。
// 単体テスト（tests/core/data-expiry.test.ts）は、この関数を決まった日付で呼ぶ（npm test が日付で落ちないように）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WINDOW_DAYS = 30;
const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const daysBetween = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
/** 日本の今日（UTC だと朝9時まで前の日になる。FD-10） */
export const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 調べる日付の一覧（ラベル・日付・することの文） */
export function freshDates(data = { yearEnd: json('data/gomi/year-end.json'), holidays: json('data/holidays.json'), delivery: json('data/gomi/delivery.json') }) {
  const out = [];
  out.push({ label: 'data/gomi/year-end.json の known_until（ごみの収集日の例外）', iso: data.yearEnd.known_until,
    todo: '名古屋市の「ごみ収集日検索」（1037098）と年末年始のお知らせを人が見て、data/gomi/schedule.json・data/gomi/year-end.json を写し直し、known_until を延ばす（日付だけ延ばさない）。市がまだ表を出していない期間は延ばさない（画面は日付を出さず市の検索へ案内する）。' });
  const last = Object.keys(data.holidays.holidays).sort().pop();
  out.push({ label: 'data/holidays.json の最後の祝日', iso: last, todo: '`npm run holidays` で内閣府の祝日表から作り直す。' });
  const dates = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if ((k === 'to' || k === 'show_until') && typeof x === 'string') dates.add(x);
      else walk(x);
    }
  };
  walk(data.delivery);
  // 次の受付の方法がもうデータにある期間の終わりは、切り替わるだけなので知らせない（FD-3）
  const froms = data.delivery.regimes.map((r) => r.from).filter(Boolean);
  for (const r of data.delivery.regimes) if (r.to && froms.some((f) => f > r.to)) dates.delete(r.to);
  for (const iso of [...dates].sort()) out.push({ label: 'data/gomi/delivery.json の日付（自己搬入）', iso,
    todo: '市の「自己搬入」のページ（B-nagoya-gomi-jikoban）で切り替えの日を確かめ、受付の方法の文と日付を更新する。' });
  return out;
}

/** today から見て、残りが WINDOW_DAYS 以下のもの */
export function staleAt(today, list = freshDates()) {
  return list.map((d) => ({ ...d, left: daysBetween(today, d.iso) })).filter((d) => d.left <= WINDOW_DAYS);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--today');
  const today = i > 0 ? process.argv[i + 1] : jstToday();
  const bad = staleAt(today);
  if (bad.length) {
    for (const d of bad) console.error(`古くなるデータ：${d.label}（${d.iso}）まで残り ${d.left} 日。${d.todo}`);
    console.error(`check-fresh：止める（${today} から ${WINDOW_DAYS} 日以内）。公開の前にデータを写し直す。`);
    process.exit(1);
  }
  console.log(`check-fresh: OK（${today}。いちばん近いのは ${freshDates().map((d) => d.iso).sort()[0]}）`);
}
