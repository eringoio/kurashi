// 市の分別検索の表（1035233）にあって data/gomi/opendata.json に無い品目を、市の表の行そのままで足す（G-16。2026-11-15）。
//   node scripts/gomi/add-missing.mjs --html <保存したページ.html> [--apply]
// - 名前の書き方が変わっただけの6行（SYNONYM）は、アプリの古い名前の品目を市の表の行に直す（品目の id は変えない）。
// - ほかは新しい品目として足す。区分・備考・引用は市の表の行のまま（備考を切らない・直さない）。
// - 確認状態は needs_check。verified にはしない。作者が確かめたとも書かない（機械の比較の記録）。
// - import-opendata.mjs は全部作り直す（手で直した品目を消す）ので使わない。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');

const WEB = 'https://www.city.nagoya.jp/kurashi/gomi/1012183/1035233.html';
const CAT = {
  '可燃ごみ': 'kanen', '不燃ごみ': 'funen', 'プラスチック資源': 'plastic', '空き缶': 'kan', '空きびん': 'bin',
  '電池類': 'denchi', '発火性危険物': 'hakka', '充電式家電': 'juden', '蛍光管・水銀体温計・水銀温度計': 'keikou',
  '小型家電': 'kogata', '紙製容器包装・雑がみ': 'kami', '紙パック': 'kamipack', 'ペットボトル': 'petbottle', '食用油': 'shokuyouyu',
  '粗大ごみ': 'sodai', 'その他': 'sonota',
};
const webCat = (s) => s.replace(/【.*?】/g, '').replace('蛍光管・水銀体温計・水銀温度計・水銀血圧計', '蛍光管・水銀体温計・水銀温度計').trim();
const cell = (x) => x.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, '');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const apply = process.argv.includes('--apply');

// 市の表の名前 → アプリの古い名前（同じ品目の書き方の違い。区切りの「：」→「、」など）
const SYNONYM = {
  'トレー（食品用、紙製）': 'トレー（食品用：紙製）',
  'トレー（食品用、プラスチック製）': 'トレー（食品用：プラスチック製）',
  'ボウル（台所用品、金属製）': 'ボウル（台所用品：金属製）',
  'ボウル（台所用品、プラスチック製）': 'ボウル（台所用品：プラスチック製）',
  'ボウル（台所用品、木製）': 'ボウル（台所用品：木製）',
  'ペン（木製・プラスチック製）': 'ボールペン（木・プラスチック製）',
};
const EN = JSON.parse(readFileSync('scripts/gomi/add-missing-en.json', 'utf8'));

const html = readFileSync(arg('--html'), 'utf8');
const sha256 = createHash('sha256').update(html).digest('hex');
const updated = (html.match(/更新日[\s\S]{0,80}?([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/) ?? []).slice(1).map((x, i) => (i ? x.padStart(2, '0') : x)).join('-') || null;
const city = [];
for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
  const c = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(cell);
  if (c.length >= 2 && c[0] !== 'ごみ・資源の名称') city.push({ name: c[0], catText: c[1], cat: CAT[webCat(c[1])], note: c[2] ?? '' });
}
const FILE = 'data/gomi/opendata.json';
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const hand = JSON.parse(readFileSync('data/gomi/items.json', 'utf8')).items;
const byLabel = new Map(data.items.map((i) => [norm(i.label.ja), i]));
const handLabels = new Set(hand.map((i) => norm(i.label.ja)));
const today = arg('--today') ?? '2026-11-15';
const how = `市の分別検索の表（${WEB}、ページの更新日 ${updated}、取得 ${today}、HTML の sha256 ${sha256.slice(0, 16)}…）の行を scripts/gomi/add-missing.mjs で写した（AI による機械の比較・取り込み。作者は確かめていない）`;
const ev = (row) => ({ source_ids: ['gomi-search-1035233'], checked_at: today, status: 'needs_check', quote: `${row.name} | ${row.catText} | ${row.note}`, note: how });

const tokenizer = await new Promise((ok, ng) => kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((e, t) => (e ? ng(e) : ok(t))));
const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const reading = (s) => kata2hira(tokenizer.tokenize(s.replace(/（.*?）|\(.*?\)/g, '')).map((t) => t.reading ?? t.surface_form).join(''));

const resolution = [];
const newItems = [];
const names = JSON.parse(readFileSync('data/gomi/item-names.json', 'utf8'));
for (const row of city) {
  if (byLabel.has(norm(row.name)) || handLabels.has(norm(row.name))) continue;
  const ref = `1035233 の表 ${city.indexOf(row) + 1} 行目：${row.name} | ${row.catText}`;
  const old = SYNONYM[row.name];
  if (old) {
    const it = byLabel.get(norm(old));
    resolution.push({ city_name: row.name, city_category: row.catText, app_match: `${old}（${it.id}）`, decision: 'synonym', reason: '同じ品目の書き方の違い（区切り記号・「ボールペン」と「ペン」の取り違え）。アプリの古い名前の品目を市の表の行そのままに直した', source_row_ref: ref });
    if (apply) {
      const was = it.label.ja;
      it.label = { ja: row.name }; it.aliases = [reading(row.name)].filter((x) => x && x !== row.name);
      it.category = CAT[webCat(row.catText)];
      if (row.note) it.note = { ja: row.note }; else delete it.note;
      it.evidence = { ...ev(row), note: `${how}。2025年のオープンデータの名前「${was}」から、市の表の名前に直した` };
      if (names.names[was]) { names.names[row.name] = { ...names.names[was], ja: row.name }; if (EN[row.name]) names.names[row.name].en = EN[row.name]; delete names.names[was]; }
    }
    continue;
  }
  resolution.push({ city_name: row.name, city_category: row.catText, app_match: null, decision: 'new', reason: 'アプリに同じ名前の品目が無く、書き方の違いで説明できる品目も無い', source_row_ref: ref });
  if (!row.cat) throw new Error('区分を読めない: ' + row.name);
  const id = 'od_' + createHash('sha1').update(row.name).digest('hex').slice(0, 10);
  newItems.push({ id, label: { ja: row.name }, aliases: [reading(row.name)].filter((x) => x && x !== row.name), category: row.cat, ...(row.note ? { note: { ja: row.note } } : {}), evidence: ev(row) });
  if (!EN[row.name]) throw new Error('英語の名前が無い: ' + row.name);
  names.names[row.name] = { ja: row.name, en: EN[row.name] };
}
// アプリだけの名前
const cityN = new Set(city.map((r) => norm(r.name)));
const gone = new Set(Object.values(SYNONYM).map(norm));
const appOnly = [...data.items.map((i) => ({ ...i, src: 'opendata.json' })), ...hand.map((i) => ({ ...i, src: 'items.json' }))].filter((i) => !cityN.has(norm(i.label.ja)) && !gone.has(norm(i.label.ja)));
console.log(JSON.stringify({ city_rows: city.length, synonym: Object.keys(SYNONYM).length, new: newItems.length, app_only_left: appOnly.map((i) => `${i.src}:${i.label.ja}`) }, null, 1));
writeFileSync(process.env.RESOLUTION_OUT ?? 'resolution.tmp.json', JSON.stringify({ resolution, appOnly: appOnly.map((i) => ({ label: i.label.ja, file: i.src, id: i.id, category: i.category ?? null, status: i.evidence.status })), sha256, updated }, null, 1));
if (apply) {
  data.items.push(...newItems);
  data.counts = { items: data.items.length, shown: data.items.filter((i) => !i.review).length, review: data.items.filter((i) => i.review).length };
  data.import_missing = { script: 'scripts/gomi/add-missing.mjs', url: WEB, page_updated_at: updated, fetched_at: today, sha256, rows: city.length, added: newItems.length, renamed: Object.keys(SYNONYM).length, status: 'needs_check（AI による機械の比較。作者は確かめていない）' };  // 行ごとの記録は開発用リポジトリの非公開の文書（公開用のデータに内部の道を書かない）
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  writeFileSync('data/gomi/item-names.json', JSON.stringify(names, null, 2) + '\n');
}
