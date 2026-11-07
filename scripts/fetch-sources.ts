/* 公式の出典を取得する（docs/DATA_UPDATE.md 4章）。npm run data:fetch
   - data/official-domains.json のドメインの出典だけ。robots.txt を守り、403・CAPTCHA は回避しない（scripts/produce/lib/fetch.mjs）。
   - 本文の文字だけを sources/snapshots/<source_id>/<日付>.txt に書く（Git に入れない）。ハッシュは sources/index.json（Git に入れる）。
   - 前回の index は sources/index.prev.json に移す。比べた結果は sources/last-run.json。
   見本：--fixtures <フォルダ>（<source_id>.html を読む。無いものは 404）。--date YYYY-MM-DD・--root <フォルダ> でも変えられる。 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error JS のモジュール（型なし）
import { fetchOfficial } from './produce/lib/fetch.mjs';
import { compareIndex, SourceIndex, stableText, type IndexEntry } from '../src/core/update';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

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
const KEEP = 4; // 出典ごとに残す本文の数（前の週との差分に使う。Actions のキャッシュが大きくならないように）
// 根拠の ai_check が指す本文（check:quotes が読む）は消さない
const pinned = new Set<string>();
const walk = (o: unknown): void => {
  if (Array.isArray(o)) { o.forEach(walk); return; }
  if (!o || typeof o !== 'object') return;
  const r = o as { source_ids?: string[]; ai_check?: { fetched_at?: string } };
  if (r.source_ids && r.ai_check?.fetched_at) for (const s of r.source_ids) pinned.add(`${s}/${r.ai_check.fetched_at}.txt`);
  Object.values(o).forEach(walk);
};
for (const dir of ['data', 'data/cards', 'drafts/data']) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) { try { walk(JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch { /* 読めないファイルは飛ばす */ } }
}
const prune = (id: string) => {
  const dir = join(root, 'snapshots', id);
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) if (!pinned.has(`${id}/${f}`)) rmSync(join(dir, f));
};
for (const s of sources) {
  if (!s.url || !allowed(s.url)) continue;
  const p = prev[s.source_id];
  // 前の本文が手元にあるときだけ 304 を頼む（無いと差分も引用の照合もできない）
  const prevBody = p?.sha256 && existsSync(join(root, 'snapshots', s.source_id, p.fetched_at + '.txt'));
  const r = await fetchOfficial(s.url, { ...cfg, conditional: prevBody ? { etag: p.etag, last_modified: p.last_modified } : undefined }, deps);
  if (r.result === 'not_modified' && p) {
    // 変わっていない：前の記録のまま（本文のファイルも前の日のまま）
    next[s.source_id] = { ...p, result: 'ok', http_status: 304 };
    console.log(`${s.source_id}: not_modified`);
    continue;
  }
  next[s.source_id] = { source_id: s.source_id, url: s.url, fetched_at: date, result: r.result, sha256: r.sha256, http_status: r.http_status,
    stable_sha256: r.result === 'ok' ? sha256(stableText(r.text)) : null, etag: r.etag ?? null, last_modified: r.last_modified ?? null };
  if (r.result === 'ok') {
    mkdirSync(join(root, 'snapshots', s.source_id), { recursive: true });
    writeFileSync(join(root, 'snapshots', s.source_id, date + '.txt'), r.text);
    prune(s.source_id);
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
