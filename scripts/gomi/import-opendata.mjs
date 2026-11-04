// 名古屋市のオープンデータ「家庭ごみ・資源の５０音順分別早見表」（BODIK、CC BY 4.0）から、ごみの品目の下書きを作る。
//   node scripts/gomi/import-opendata.mjs
// - CSV は 2025-06-05 の版で、2026年10月の粗大ごみの基準（45L）より前。そのまま確定の答えにしない。
// - 市の分別検索のページ（1035233。CC の表示が無い）とは、同じ名前の行の「区分が同じか」だけを比べる。ページの文は保存しない。
// - 区分が違う・名前が無い・30cm の記述・粗大ごみの行は review（要確認）にして、区分を出さない。
// - よみは kuromoji で付ける（探すため。画面には出さない）。
// 出力：drafts/gomi/opendata.json（下書き。npm run dev:drafts のときだけ読む）
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');

const PKG = 'https://data.bodik.jp/api/3/action/package_show?id=231002_1109010000_sagyo_01';
const WEB = 'https://www.city.nagoya.jp/kurashi/gomi/1012183/1035233.html';
const UA = { headers: { 'User-Agent': 'kurashi-data-import (research; https://kurashi.eringo.io)' } };

const CAT = {
  '可燃ごみ': 'kanen', '不燃ごみ': 'funen', 'プラスチック資源': 'plastic', '空き缶': 'kan', '空きびん': 'bin',
  '電池類': 'denchi', '発火性危険物': 'hakka', '充電式家電': 'juden', '蛍光管・水銀体温計・水銀温度計': 'keikou',
  '小型家電': 'kogata', '紙製容器包装・雑がみ': 'kami', '紙パック': 'kamipack', 'ペットボトル': 'petbottle', '食用油': 'shokuyouyu',
  '粗大ごみ': 'sodai', 'その他': 'sonota',
};
const webCat = (s) => s.replace(/【.*?】/g, '').replace('蛍光管・水銀体温計・水銀温度計・水銀血圧計', '蛍光管・水銀体温計・水銀温度計').trim();

function parseCsv(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const cell = (x) => x.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, '');

const pkg = (await (await fetch(PKG, UA)).json()).result;
const res = pkg.resources.find((r) => /csv/i.test(r.format));
const buf = Buffer.from(await (await fetch(res.url, UA)).arrayBuffer());
const sha256 = createHash('sha256').update(buf).digest('hex');
const rows = parseCsv(new TextDecoder('shift_jis').decode(buf)).filter((r) => r[0] && r[1] && r[0] !== '具体例' && r[0] !== '50音順');

const html = await (await fetch(WEB, UA)).text();
const web = new Map();
for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
  const c = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(cell);
  if (c.length >= 2 && c[0] !== 'ごみ・資源の名称') web.set(norm(c[0]), { cat: webCat(c[1]), note: c[2] ?? '' });
}
const webUpdated = (html.match(/更新日\s*([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/) ?? []).slice(1).map((x, i) => (i ? x.padStart(2, '0') : x)).join('-') || null;

const tokenizer = await new Promise((ok, ng) => kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((e, t) => (e ? ng(e) : ok(t))));
const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const reading = (s) => kata2hira(tokenizer.tokenize(s.replace(/（.*?）|\(.*?\)/g, '')).map((t) => t.reading ?? t.surface_form).join(''));

const T = (ja, ja_easy, en) => ({ ja, ja_easy, en });
const REASON = {
  sodai: T('2026年10月から粗大ごみの基準が「45リットルの指定袋に入らないもの」に変わりました。このデータは変更の前（2025年6月）なので、区分を確かめてください。', '2026{年|ねん}10{月|がつ}に{大|おお}きなごみの{決|き}まりが{変|か}わりました。{市|し}のページで{確|たし}かめてください。', 'The bulky-waste rule changed in October 2026. This data is from before the change (June 2025). Please check.'),
  size30: T('この品目の説明に、2026年9月までの「30センチメートル」の基準があります。いまの基準で確かめてください。', '{古|ふる}い{決|き}まり（30センチ）が{書|か}いてあります。{市|し}のページで{確|たし}かめてください。', 'This entry mentions the old 30 cm rule (until September 2026). Please check the current rule.'),
  differs: T('2025年6月のデータと、いまの市の分別検索の表で、区分が違います。市の表で確かめてください。', '{古|ふる}いデータと、いまの{市|し}のページで、{分|わ}け{方|かた}が{違|ちが}います。', 'The category in the June 2025 data differs from the current city table. Please check the city table.'),
  sonota: T('この品目は区分が「その他」で、出し方は品目ごとに違います。いまの市の分別検索の表の備考で確かめてください。', '{出|だ}し{方|かた}は{品物|しなもの}ごとに{違|ちが}います。{市|し}のページで{確|たし}かめてください。', 'This item is "other": how to dispose of it depends on the item. Check the notes in the current city table.'),
  missing: T('この品目は、いまの市の分別検索の表に見つかりませんでした。市の表で確かめてください。', 'いまの{市|し}のページに、この{品物|しなもの}がありません。', 'This item was not found in the current city table. Please check.'),
};
const quote = (r) => `${r[0]} | ${r[1]} | ${r[2]}`.slice(0, 300);
const seen = new Map();
const items = [];
for (const r of rows) {
  const [name, cat, note] = r;
  const id0 = 'od_' + createHash('sha1').update(name).digest('hex').slice(0, 10);
  if (seen.has(id0)) continue;
  seen.set(id0, true);
  const w = web.get(norm(name));
  const category = CAT[cat];
  let review = null;
  if (!category) review = 'differs';
  else if (category === 'sodai') review = 'sodai';
  else if (/30\s*(センチ|cm|ｃｍ)/.test(note)) review = 'size30';
  else if (!w) review = 'missing';
  else if (CAT[w.cat] !== category) review = 'differs';
  const sameNote = w && norm(w.note) === norm(note);
  if (!review && category === 'sonota' && !sameNote) review = 'sonota';
  items.push({
    id: id0, label: { ja: name }, aliases: [reading(name)].filter((x) => x && x !== name),
    ...(review ? { review: { reason: REASON[review] } } : { category }),
    ...(!review && note && sameNote ? { note: { ja: note } } : {}),
    ...(!review && note && !sameNote ? { note: T('備考は、いまの市の分別検索の表で確かめてください（このデータの備考は2025年6月のもの）。', 'くわしくは{市|し}のページで{確|たし}かめてください。', 'Check the notes in the current city table (these notes are from June 2025).') } : {}),
    evidence: { source_ids: ['bodik-sagyo-01'], checked_at: new Date().toISOString().slice(0, 10), status: 'needs_check', quote: quote(r), note: review ? `要確認（${review}）` : `いまの市の表（1035233、更新日 ${webUpdated}）と区分が同じ（Claude の比較）` },
  });
}
const out = {
  $comment: '下書き。名古屋市のオープンデータ（CC BY 4.0）を加工して作成（scripts/gomi/import-opendata.mjs）。2026年10月の改定より前のデータなので、粗大ごみ・30cm の記述・いまの市の表と違う行は区分を出さない。手で確かめた品目（items.json）が優先。',
  as_of: new Date().toISOString().slice(0, 10),
  source: { source_id: 'bodik-sagyo-01', title: pkg.title, url: 'https://data.bodik.jp/dataset/231002_1109010000_sagyo_01', resource_url: res.url, license: pkg.license_title, last_modified: res.last_modified, sha256, encoding: 'Shift_JIS', columns: ['具体例', '分別区分', '備考'], rows: rows.length, attribution: '名古屋市「家庭ごみ・資源の５０音順分別早見表」（CC BY 4.0）を加工して作成' },
  compared_with: { url: WEB, page_updated_at: webUpdated, rows: web.size, note: '区分が同じかだけを比べた。ページの文は保存していない' },
  counts: { items: items.length, shown: items.filter((i) => !i.review).length, review: items.filter((i) => i.review).length },
  items,
};
writeFileSync('drafts/gomi/opendata.json', JSON.stringify(out, null, 2) + '\n');
console.log(out.source.rows, 'rows →', out.counts, 'web rows', web.size, 'web updated', webUpdated);
