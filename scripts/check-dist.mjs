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
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(js|html|json|css)$/.test(n) && files.push(p); } };
walk('dist');
const hits = [];
for (const f of files) { const s = readFileSync(f, 'utf8'); for (const id of ids) if (s.includes(`"${id}"`) || s.includes(`'${id}'`)) hits.push(`${f}: ${id}`); }
const devOnly = files.filter((f) => /DevPatterns|dev\/patterns/.test(readFileSync(f, 'utf8')));
if (hits.length || devOnly.length) { console.error('配信物に下書き・検証用・開発用が入っている：\n' + [...hits, ...devOnly].join('\n')); process.exit(1); }
console.log(`check-dist: OK（${files.length} ファイル、下書き・検証用のID ${ids.size} 件を確かめた）`);
