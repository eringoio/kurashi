/* データの更新の結果をデータに入れる。npm run data:apply（npm run data:agent のあと）
   いちばん新しい sources/report/<日付>.json を読み、変わった・判断できない根拠のうち verified・ai_checked のものを needs_check にする。
   値は変えない（提案は PR の本文）。1回目（baseline）と見本の実行では何もしない。結果は報告の .md の終わりに足す。
   --root <sources のフォルダ>・--data <data のフォルダ> で変えられる（テスト用）。 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Verdict } from '../src/core/update';
import { applyVerdicts } from './lib/apply-update';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const root = arg('--root') ?? 'sources';
const dataDir = arg('--data') ?? 'data';
const dir = join(root, 'report');
const last = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop() : undefined;
if (!last) { console.log('報告が無い。先に npm run data:agent'); process.exit(0); }
const report = JSON.parse(readFileSync(join(dir, last), 'utf8'));
if (report.baseline) { console.log('1回目（記録だけ）。データは変えない。'); process.exit(0); }

const verdicts = Verdict.array().parse(report.verdicts);
const read = (f: string) => (existsSync(join(dataDir, f)) ? readFileSync(join(dataDir, f), 'utf8') : null);
const write = (f: string, s: string) => writeFileSync(join(dataDir, f), s);
const cardIds = readdirSync(join(dataDir, 'cards')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const { applied, not_found } = applyVerdicts(verdicts, read, write, cardIds);

const md = join(dir, last.replace(/\.json$/, '.md'));
const lines = ['', `## データに入れたこと`, '', applied.length ? `次の ${applied.length} 件を needs_check にした（値は変えていない）。` : 'データは変えていない。'];
for (const a of applied) lines.push(`- ${a.where}（${a.file}。前は ${a.from}）`);
if (not_found.length) lines.push('', '場所が見つからなかった項目（作者が見る）：' + not_found.join('、'));
if (existsSync(md)) appendFileSync(md, lines.join('\n') + '\n');
console.log(`needs_check にした ${applied.length} 件。場所が見つからない ${not_found.length} 件。`);
