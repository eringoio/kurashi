/* 引用の確かめ（SPEC v0.4.9・docs/DATA_UPDATE.md 6章）。CI と手元で使う：npm run check:quotes
   ai_checked の根拠は、(a) 引用が取得した本文（sources/snapshots/<source_id>/<日付>.txt）にそのままある
   (b) 独立の照合が同じ結論（ai_check.verdict = agree）、の両方が要る。満たさなければ止める（終了コード 1）。 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseRaw, loadData, withBundles, type Bundle } from '../src/core/data';
import { authorQueue, checkQuotes, collectEvidence } from '../src/core/quotes';

const ROOT = join(process.cwd(), 'sources', 'snapshots');
const read = (src: string, day: string) => { const f = join(ROOT, src, day + '.txt'); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// 公開のデータと、下書き（drafts/data/*.bundle.json）の両方を確かめる
const bundles = (existsSync('drafts/data') ? readdirSync('drafts/data') : []).filter((f) => f.endsWith('.bundle.json')).map((f) => JSON.parse(readFileSync(join('drafts/data', f), 'utf8')) as Bundle);
const items = collectEvidence(loadData(withBundles(baseRaw(), bundles)));
const err = checkQuotes(items, read, sha);
const q = authorQueue(items);
console.log(`根拠 ${items.length} 件。ai_checked ${items.filter((x) => x.e.status === 'ai_checked').length} 件（U のまま ${q.stays_u.length}・食い違い ${q.disagree.length}）`);
// --allow-missing-bodies（CI）：本文は Git に入れないので、本文が無いことだけは注意にする。引用の誤り・ハッシュの違いは止める
const lenient = process.argv.includes('--allow-missing-bodies');
const missing = err.filter((e) => e.includes('取得した本文がない'));
const fatal = lenient ? err.filter((e) => !missing.includes(e)) : err;
if (lenient && missing.length) console.warn('注意（本文が手元に無いので照合していない）：\n' + missing.join('\n'));
if (fatal.length) { console.error(fatal.join('\n')); process.exit(1); }
console.log('check-quotes: OK');
