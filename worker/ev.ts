/* 使われ方の数（SPEC 13.4。作者の指示 2026-11-07）。POST /api/ev：数だけ。ID・クッキー・IP・答えは受け取らない。
   本文は { k, p, f?, l, w, b, ... }。決まった項目だけを残し、ほかは捨てる。
   保存は Workers Analytics Engine（wrangler.toml の EV。約3か月で消える）。EV が無いとき（手元・テスト）は Worker のメモリの中だけ。
   GET /api/usage：作者だけ（Authorization: Bearer <REPORTS_TOKEN>）。手元はメモリの集計。公開は Analytics Engine の SQL API（シークレット CF_ACCOUNT_ID・CF_API_TOKEN がある時だけ）。 */

export interface AeLike { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void }
export interface Env { EV?: AeLike; REPORTS_TOKEN?: string; CF_ACCOUNT_ID?: string; CF_API_TOKEN?: string }

export const KINDS = ['view', 'error', 'outcome', 'helpful'] as const;
export type Kind = (typeof KINDS)[number];

/** 1件。blobs の順は固定（SQL の blob1〜blob8） */
export interface Ev { k: Kind; p: string; f: string; l: string; w: string; b: string; x: string; y: string }

const PATH = /^\/[a-z0-9/_:-]{0,80}$/i;
const SHORT = /^[a-z0-9_.:-]{0,40}$/i;
const WIDTHS = ['s', 'm', 'l', ''];

/** 本文を確かめる。形の違う項目は空にし、ほかの項目は捨てる */
export function parseEv(x: unknown): Ev | string {
  if (!x || typeof x !== 'object') return 'body';
  const o = x as Record<string, unknown>;
  const k = o.k as Kind;
  if (!KINDS.includes(k)) return 'kind';
  const str = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : '');
  const p = str(o.p, PATH);
  if (!p) return 'path';
  const f = str(o.f, PATH);
  const w = typeof o.w === 'string' && WIDTHS.includes(o.w) ? o.w : '';
  // x・y：種類ごとの短い値（エラーの種類・カードの id・はい／いいえ・理由）。エラーの文は数字を消して 120 字まで
  const y = k === 'error' ? cleanError(o.y) : str(o.y, SHORT);
  return { k, p, f, l: str(o.l, SHORT), w, b: str(o.b, SHORT), x: str(o.x, SHORT), y };
}

/** エラーの文：数字・引用の中身を消して短くする（答えや番号が混ざらないように） */
export function cleanError(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/(["'`]).*?\1/g, '$1...$1').replace(/\d+/g, '#').replace(/[^\x20-\x7e]/g, '').slice(0, 120);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** 手元のメモリ（数えるだけ。最大 5,000 件） */
const mem: Ev[] = [];
export const clearEvMemory = () => { mem.length = 0; };

export async function handleEv(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return json(400, { error: 'body' }); }
  const e = parseEv(body);
  if (typeof e === 'string') return json(400, { error: e });
  const blobs = [e.k, e.p, e.f, e.l, e.w, e.b, e.x, e.y];
  if (env.EV) env.EV.writeDataPoint({ indexes: [e.k], blobs, doubles: [1] });
  else { mem.push(e); if (mem.length > 5000) mem.shift(); }
  return new Response(null, { status: 204 });
}

export interface Usage { views: [string, number][]; pairs: [string, number][]; errors: [string, number][]; helpful: [string, number, number][]; outcomes: [string, number][] }

/** 集計（作者の画面用） */
export function summarize(list: Ev[]): Usage {
  const count = (keys: string[]) => { const m = new Map<string, number>(); for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 50); };
  const help = new Map<string, [number, number]>();
  for (const e of list.filter((e) => e.k === 'helpful')) { const h = help.get(e.x) ?? [0, 0]; h[e.y === 'yes' ? 0 : 1]++; help.set(e.x, h); }
  return {
    views: count(list.filter((e) => e.k === 'view').map((e) => e.p)),
    pairs: count(list.filter((e) => e.k === 'view' && e.f).map((e) => e.f + ' → ' + e.p)),
    errors: count(list.filter((e) => e.k === 'error').map((e) => [e.b, e.x, e.y].filter(Boolean).join(' '))),
    helpful: [...help].map(([k, [y, n]]) => [k, y, n] as [string, number, number]).sort((a, b) => b[1] + b[2] - a[1] - a[2]),
    outcomes: count(list.filter((e) => e.k === 'outcome' || (e.k === 'helpful' && e.y !== 'yes')).map((e) => [e.x, e.y].filter(Boolean).join(' '))),
  };
}

/** Analytics Engine の SQL API から、最近 90 日の行を読む（公開だけ） */
async function readAe(env: Env): Promise<Ev[]> {
  const sql = "SELECT blob1 AS k, blob2 AS p, blob3 AS f, blob4 AS l, blob5 AS w, blob6 AS b, blob7 AS x, blob8 AS y FROM kurashi_ev WHERE timestamp > NOW() - INTERVAL '90' DAY LIMIT 10000 FORMAT JSON";
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: 'POST', headers: { authorization: 'Bearer ' + env.CF_API_TOKEN }, body: sql });
  if (!r.ok) throw new Error('ae ' + r.status);
  return ((await r.json()) as { data: Ev[] }).data;
}

export async function handleUsage(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: 'method' });
  if (!env.REPORTS_TOKEN || req.headers.get('authorization') !== 'Bearer ' + env.REPORTS_TOKEN) return json(401, { error: 'token' });
  if (env.EV && !(env.CF_ACCOUNT_ID && env.CF_API_TOKEN)) return json(503, { error: 'no_reader' });
  try {
    return json(200, summarize(env.EV ? await readAe(env) : mem));
  } catch {
    return json(502, { error: 'read' });
  }
}
