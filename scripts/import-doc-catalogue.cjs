#!/usr/bin/env node
/* 書類の調査資料（docs/deep-research/kurashi_master_document_catalogue_merged_*.md の 4章）を、
   候補の一覧 data/document-candidates.json にする。候補は調査の記録で、画面には出さない（確認状態は research）。
   アプリの書類（data/documents.json）との対応は、書類の側の catalogue_ids に持つ（ここには書かない。二重に持たない）。
   使い方：node scripts/import-doc-catalogue.cjs [資料の .md] */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'docs', 'deep-research');
const src = process.argv[2] ?? (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^kurashi_master_document_catalogue_merged_.*\.md$/.test(f)).sort().map((f) => path.join(dir, f)).pop() : undefined);
if (!src || !fs.existsSync(src)) { console.error('調査資料が見つかりません'); process.exit(1); }
const md = fs.readFileSync(src, 'utf8');
const asOf = (md.match(/Research cut-off:\*\*\s*(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? null;

/** 資料 5章の P0 の分野（分類ごとの目安。1件ずつの優先度ではない） */
const P0 = new Set(['WARD_RESIDENCE', 'WARD_SUPPORT', 'NHI_MAIL', 'PENSION_MAIL', 'IMMIGRATION', 'MYNUMBER_MAIL', 'CITY_TAX', 'NATIONAL_TAX', 'DRIVER_MAIL', 'POLICE', 'ELECTRICITY', 'GAS', 'WATER', 'SCAM']);

/** 資料の「見本・根拠」の札 → 種類（3章）。合わないものは other */
function evidenceKind(label) {
  if (/詐欺|本会話/.test(label)) return 'research_lead';
  if (/調査待ち|未確認/.test(label)) return 'unverified';
  if (/他県|他社|他市|他の/.test(label)) return 'other_region_sample';
  if (/旧版|旧レイアウト|historical/i.test(label)) return 'historical_sample';
  if (/記載例|記入例/.test(label)) return 'filled_example';
  if (/見本|実物|実際の/.test(label)) return 'actual_sample';
  if (/空欄様式|様式/.test(label)) return 'blank_form';
  if (/二次情報/.test(label)) return 'secondary';
  if (/案内|公式|PDF|資料|ページ|窓口/.test(label)) return 'official_guide';
  return 'other';
}
function direction(s) {
  if (/詐欺|注意/.test(s)) return 'warning';
  if (/提出/.test(s) && /受領/.test(s)) return 'both';
  if (/提出/.test(s)) return 'submit';
  if (/受領/.test(s)) return 'receive';
  return 'other';
}

const out = [];
let category = null;
for (const line of md.split(/\r?\n/)) {
  const h = line.match(/^### ([A-Z_]+) — (.+?)(?:\s+\*\*\[.*\]\*\*)?$/);
  if (h) { category = { code: h[1], label: h[2].trim() }; continue; }
  const m = line.match(/^\| `([A-Z_]+-\d{3})` \*\*(.+?)\*\*( \*\*\[追加\]\*\*)? \| (.*?) \| (.*?) \| (.*?) \| (.*) \|$/);
  if (!m) continue;
  const [, id, title, added, dir_, fields, action, ev] = m;
  const link = ev.match(/^(.*?)\s*·\s*\[([^\]]*)\]\(([^)]*)\)\s*(.*)$/);
  const label = (link ? link[1] : ev.split('·')[0]).trim();
  out.push({
    id,
    title_ja: title.trim(),
    added_in_merge: !!added,
    category: id.replace(/-\d+$/, ''),
    category_label: category?.code === id.replace(/-\d+$/, '') ? category.label : null,
    direction: direction(dir_),
    direction_raw: dir_.trim(),
    fields_summary_en: fields.trim(),
    action_note_en: action.trim(),
    evidence_label: label,
    evidence_kind: evidenceKind(label),
    url: link && /^https?:\/\//.test(link[3]) ? link[3] : null,
    link_text: link ? link[2] : null,
    priority_hint: P0.has(id.replace(/-\d+$/, '')) ? 'P0_topic' : 'P1_or_later',
    status: 'research',
  });
}
if (new Set(out.map((x) => x.id)).size !== out.length) { console.error('id が重なっている'); process.exit(1); }
const file = path.join(root, 'data', 'document-candidates.json');
fs.writeFileSync(file, JSON.stringify({
  $comment: '書類の候補（調査資料の 4章から node scripts/import-doc-catalogue.cjs で作る。手で直さない）。すべて research（未確認・画面に出さない）。資料の札は根拠の種類で、見本が実際にあるという意味ではない。アプリの書類との対応は data/documents.json の catalogue_ids。',
  source: path.basename(src),
  as_of: asOf,
  count: out.length,
  candidates: out,
}, null, 1) + '\n');
console.log(`${out.length} 件 → ${path.relative(root, file)}`);
const by = (k) => Object.entries(out.reduce((a, x) => ((a[x[k]] = (a[x[k]] ?? 0) + 1), a), {})).map(([a, b]) => `${a} ${b}`).join(' / ');
console.log('direction:', by('direction'));
console.log('evidence:', by('evidence_kind'));
