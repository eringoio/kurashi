/* 引用の確かめ（SPEC v0.4.9・docs/DATA_UPDATE.md 6章）。CI と手元で使う：npm run check:quotes
   ai_checked の根拠は、(a) 引用が取得した本文（sources/snapshots/<source_id>/<日付>.txt）にそのままある
   (b) 独立の照合が同じ結論（ai_check.verdict = agree）、の両方が要る。満たさなければ止める（終了コード 1）。 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadData } from '../src/core/data';
import { authorQueue, checkQuotes, collectEvidence } from '../src/core/quotes';

const ROOT = join(process.cwd(), 'sources', 'snapshots');
const read = (src: string, day: string) => { const f = join(ROOT, src, day + '.txt'); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const items = collectEvidence(loadData());
const err = checkQuotes(items, read, sha);
const q = authorQueue(items);
console.log(`根拠 ${items.length} 件。ai_checked ${items.filter((x) => x.e.status === 'ai_checked').length} 件（U のまま ${q.stays_u.length}・食い違い ${q.disagree.length}）`);
if (err.length) { console.error(err.join('\n')); process.exit(1); }
console.log('check-quotes: OK');
