/* 公式の出典を取得する（docs/DATA_UPDATE.md 4章）。npm run data:fetch
   - data/official-domains.json のドメインの出典だけ。robots.txt を守り、403・CAPTCHA は回避しない（scripts/produce/lib/fetch.mjs）。
   - 本文の文字だけを sources/snapshots/<source_id>/<日付>.txt に書く（Git に入れない）。ハッシュは sources/index.json（Git に入れる）。
   - 前回の index は sources/index.prev.json に移す。比べた結果は sources/last-run.json。
   見本：--fixtures <フォルダ>（<source_id>.html を読む。無いものは 404）。--date YYYY-MM-DD・--root <フォルダ> でも変えられる。 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error JS のモジュール（型なし）
import { fetchOfficial } from './produce/lib/fetch.mjs';
import { compareIndex, SourceIndex, type IndexEntry } from '../src/core/update';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const fixtures = arg('--fixtures');
const root = arg('--root') ?? 'sources';
const date = arg('--date') ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const sources = (JSON.parse(readFileSync('data/sources.json', 'utf8')).sources as { source_id: string; url: string | null }[]);
const domains = (JSON.parse(readFileSync('data/official-domains.json', 'utf8')).domains as { domain: string }[]).map((d) => d.domain);
const host = (u: string) => { try { return new URL(u).hostname; } catch { return ''; } };
const allowed = (u: string) => domains.some((d) => host(u) === d || host(u).endsWith('.' + d));

/** 見本：URL から source_id のファイルを読む。robots.txt と無いものは 404 */
const byUrl = new Map(sources.filter((s) => s.url).map((s) => [s.url!, s.source_id]));
const fixtureFetch = async (u: string) => {
  const id = byUrl.get(u);
  const f = id && fixtures ? join(fixtures, id + '.html') : '';
  if (!f || !existsSync(f)) return new Response('', { status: 404 });
  return new Response(readFileSync(f), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
};

const cfg = { user_agent: 'kurashi-data-update (+https://kurashi.eringo.io)', allow_domains: domains, min_interval_ms: fixtures ? 0 : 3000, fetch_timeout_ms: 30000 };
const deps = { fetchImpl: fixtures ? fixtureFetch : fetch, now: () => date, hostLast: new Map(), robotsCache: new Map() };

const idxFile = join(root, 'index.json');
const prev = existsSync(idxFile) ? SourceIndex.parse(JSON.parse(readFileSync(idxFile, 'utf8'))) : {};
const next: Record<string, IndexEntry> = {};
for (const s of sources) {
  if (!s.url || !allowed(s.url)) continue;
  const r = await fetchOfficial(s.url, cfg, deps);
  next[s.source_id] = { source_id: s.source_id, url: s.url, fetched_at: date, result: r.result, sha256: r.sha256, http_status: r.http_status };
  if (r.result === 'ok') {
    mkdirSync(join(root, 'snapshots', s.source_id), { recursive: true });
    writeFileSync(join(root, 'snapshots', s.source_id, date + '.txt'), r.text);
  } else if (prev[s.source_id]?.sha256) {
    // 取得できないときは、前の記録を残す（値は変えない）
    next[s.source_id] = { ...prev[s.source_id], result: r.result, http_status: r.http_status };
  }
  console.log(`${s.source_id}: ${r.result}`);
}
mkdirSync(root, { recursive: true });
writeFileSync(join(root, 'index.prev.json'), JSON.stringify(prev, null, 2) + '\n');
writeFileSync(idxFile, JSON.stringify(next, null, 2) + '\n');
const cmp = compareIndex(prev, next);
writeFileSync(join(root, 'last-run.json'), JSON.stringify({ date, ...cmp }, null, 2) + '\n');
console.log(`変わった ${cmp.changed.length}・変わらない ${cmp.unchanged.length}・新しく取得 ${cmp.added.length}・取得できない ${cmp.failed.length}`);
