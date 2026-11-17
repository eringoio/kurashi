// ごみの分別早見表（data/gomi/opendata.json）を、いまの市の分別検索の表（1035233）と機械で突き合わせる（2026-11-08。作者の一括承認の指示）。
// 使い方：node scripts/gomi/verify-opendata.mjs [--html 保存したページ.html] [--apply]
// - 一致：市の表に同じ名前の行があり、区分が同じで、画面の備考が市の表の備考の全文と同じ（空も含む）。
//   --apply のとき verified にし、引用を市の表の行（名前 | 区分 | 備考）に直す。verified_by には「作者の一括承認」と機械の照合であることを書く（人が1件ずつ見たとは書かない）。
// - 備考だけ違う（200字で切った・古い）：--apply のとき備考を市の表の全文に直してから verified（修正して承認）。
// - 名前が無い・区分が違う・「その他」で備考が無い：needs_check のまま。理由を evidence.note に書く。
// - すでに verified の品目（作者の確認）は変えない。
// 市のページの表の行は sources/snapshots/gomi-search-1035233/<日付>.txt に保存する（Git に入れない）。ページの HTML の sha256 を根拠に書く。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const WEB = 'https://www.city.nagoya.jp/kurashi/gomi/1012183/1035233.html';
const FILE = 'data/gomi/opendata.json';
const CAT = {
  '可燃ごみ': 'kanen', '不燃ごみ': 'funen', 'プラスチック資源': 'plastic', '空き缶': 'kan', '空きびん': 'bin',
  '電池類': 'denchi', '発火性危険物': 'hakka', '充電式家電': 'juden', '蛍光管・水銀体温計・水銀温度計': 'keikou',
  '小型家電': 'kogata', '紙製容器包装・雑がみ': 'kami', '紙パック': 'kamipack', 'ペットボトル': 'petbottle', '食用油': 'shokuyouyu',
  '粗大ごみ': 'sodai', 'その他': 'sonota',
};
// import-opendata.mjs と同じ読み方
const webCat = (s) => s.replace(/【.*?】/g, '').replace('蛍光管・水銀体温計・水銀温度計・水銀血圧計', '蛍光管・水銀体温計・水銀温度計').trim();
const cell = (x) => x.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, '');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const apply = process.argv.includes('--apply');
const htmlPath = arg('--html');
const html = htmlPath ? readFileSync(htmlPath, 'utf8')
  : await (await fetch(WEB, { headers: { 'User-Agent': 'kurashi-data-check (research; https://kurashi.eringo.io)' } })).text();
const sha256 = createHash('sha256').update(html).digest('hex');
const updated = (html.match(/更新日[\s\S]{0,80}?([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/) ?? []).slice(1).map((x, i) => (i ? x.padStart(2, '0') : x)).join('-') || null;
const today = new Date().toISOString().slice(0, 10);

const web = new Map();
const lines = [];
for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
  const c = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(cell);
  if (c.length >= 2 && c[0] !== 'ごみ・資源の名称') {
    const row = { name: c[0], catText: c[1], cat: CAT[webCat(c[1])], note: c[2] ?? '' };
    if (!web.has(norm(c[0]))) web.set(norm(c[0]), row);
    lines.push(`${row.name} | ${row.catText} | ${row.note}`);
  }
}
mkdirSync('sources/snapshots/gomi-search-1035233', { recursive: true });
writeFileSync(`sources/snapshots/gomi-search-1035233/${today}.txt`, lines.join('\n') + '\n');

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const out = { kept_author: 0, match: 0, fixed_note: 0, missing: 0, cat_differs: 0, unknown_cat: 0, note_edited: 0, review: 0 };
const left = [];
const how = `市の分別検索の表（${WEB}、ページの更新日 ${updated}、取得 ${today}、HTML の sha256 ${sha256.slice(0, 16)}…）と scripts/gomi/verify-opendata.mjs で機械照合`;
for (const it of data.items) {
  const e = it.evidence;
  if (e.status === 'verified') { out.kept_author++; continue; }
  const why = (k, msg) => { out[k]++; left.push(`${it.label.ja}\t${k}\t${msg}`); if (apply) e.note = `要確認（${today} の機械照合：${msg}）。${e.note ?? ''}`.slice(0, 400); };
  if (it.review) { why('review', '区分を出していない品目'); continue; }
  const row = web.get(norm(it.label.ja));
  if (!row) { why('missing', 'いまの市の表に同じ名前の行がない'); continue; }
  if (!row.cat) { why('unknown_cat', `市の表の区分「${row.catText}」を読めない`); continue; }
  if (row.cat !== it.category) { why('cat_differs', `区分が違う（データ ${it.category}・市の表 ${row.catText}）`); continue; }
  const note = it.note?.ja ?? '';
  const exact = note === row.note;
  // 直してよいのは、画面の備考が市の表の備考の頭と同じとき（200字で切った・末尾のリンクの文字が無い）だけ。
  // 手で書き直した備考（市の表に無い言葉がある）は機械では承認しない
  if (!exact && !row.note.startsWith(note.trim())) { why('note_edited', '画面の備考が市の表の備考と違う（手で書き直した文）'); continue; }
  if (!exact) {
    out.fixed_note++;
    if (apply) { if (row.note) it.note = { ja: row.note }; else delete it.note; }
  } else out.match++;
  if (apply) {
    it.evidence = {
      source_ids: ['gomi-search-1035233', 'bodik-sagyo-01'],
      checked_at: today,
      status: 'verified',
      quote: `${row.name} | ${row.catText} | ${row.note}`,
      note: `いまの市の分別検索の表（${updated} 更新）の行と、名前・区分・備考が一致${exact ? '' : '（備考を市の表の全文に直した）'}。${today} 機械照合・作者の一括承認`,
      verified_by: `author ${today}（作者の一括承認の指示。確認は機械の照合で、人は1件ずつ見ていない）`,
    };
  }
}
if (apply) {
  // 照合の記録（1か所）。品目の根拠の note は画面の「根拠」に出るので短くする
  data.verified_with = { method: how, script: 'scripts/gomi/verify-opendata.mjs', url: WEB, page_updated_at: updated, fetched_at: today, sha256, rows: web.size, approved_by: '作者の一括承認の指示（2026-11-08）。人は1件ずつ見ていない', result: out };
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
}
console.log(JSON.stringify({ page_updated: updated, rows: web.size, sha256, ...out }, null, 1));
writeFileSync(`sources/snapshots/gomi-search-1035233/${today}.left.tsv`, left.join('\n') + '\n');
