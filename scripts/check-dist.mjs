// 配信物（dist/）に、下書き（drafts/data）と検証用データ（tests/fixtures）のIDが入っていないかを確かめる（SPEC 18.9）。
// npm run build のあとに動く。見つかったら止める。
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ids = new Set();
const collect = (dir) => {
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir)) {
    if (!n.endsWith('.bundle.json')) continue;
    const b = JSON.parse(readFileSync(join(dir, n), 'utf8'));
    for (const k of ['cards', 'rules', 'questions', 'objects', 'relations', 'events']) for (const x of b[k] ?? []) if (x.id) ids.add(x.id);
  }
};
collect('drafts/data');
collect('tests/fixtures');
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(js|mjs|html|json|css|map|txt|svg|webmanifest)$/.test(n) && files.push(p); } };
walk('dist');
// 要確認の書類（data/documents-review.json。SPEC 6A.9a）：書類そのもの（id:"…"）が入っていない。
// 公開の書類の related_docs に id の文字だけ入るのはよい（読み込みで外れる）ので、"id" の欄の形で探す
const reviewDocs = existsSync('data/documents-review.json') ? JSON.parse(readFileSync('data/documents-review.json', 'utf8')).documents.map((d) => d.id) : [];
// 調査資料の候補（data/document-candidates.json）：候補だけが持つ欄の名前で探す（id は公開の書類の catalogue_ids にも入る）
const candidateMarks = ['fields_summary_en', 'action_note_en', 'evidence_label'];
const hits = [];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const id of ids) if (s.includes(`"${id}"`) || s.includes(`'${id}'`)) hits.push(`${f}: ${id}`);
  for (const id of reviewDocs) if (new RegExp(`[{,]\s*"?id"?\s*:\s*"${id}"`).test(s)) hits.push(`${f}: 要確認の書類 ${id}`);
  for (const m of candidateMarks) if (s.includes(m)) hits.push(`${f}: 調査資料の候補（${m}）`);
}
const devOnly = files.filter((f) => /DevPatterns|dev\/patterns/.test(readFileSync(f, 'utf8')));
if (hits.length || devOnly.length) { console.error('配信物に下書き・検証用・開発用が入っている：\n' + [...hits, ...devOnly].join('\n')); process.exit(1); }
console.log(`check-dist: OK（${files.length} ファイル、下書き・検証用のID ${ids.size} 件・要確認の書類 ${reviewDocs.length} 件・調査資料の候補を確かめた）`);
