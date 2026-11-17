/* 報告ボタン（作者の指示 2026-11-06 A-9。2026-11-14 に守りと受信箱を直した）。「案内とちがうところを知らせる」。
   POST /api/report：本文は { path, scene, text, level, at, steps?, kind?, card?, build? } だけ。名前・連絡先・答えは受け取らない。1件 2,000字・16KB まで。1 IP 1分に3件まで（IP は数えるだけで残さない）。
     守り：Content-Type は application/json だけ（ほかのサイトのフォームからは送れない）。Origin があれば同じ出所だけ。Sec-Fetch-Site が cross-site なら断る。
   GET /api/reports：作者だけ（Authorization: Bearer <REPORTS_TOKEN>。トークンは Worker のシークレット）。新しい順に1ページ（既定 50件）。続きはヘッダー x-reports-cursor（URL にクエリ文字列を使わない）。
   PATCH /api/reports：作者だけ。{ id, status } で状態を変える（new → reviewing → fixed／cannot_reproduce／no_change）。
   保存は KV の REPORTS（1年で消える）。キーは「r2:」＋逆向きの時刻（一覧が新しい順になる）。11/14 より前の報告は「report:」＋時刻（古い順。新しいものの後ろに続けて出す）。
   本番の入口（worker/index.ts）は KV が無ければ 503。メモリは手元の開発サーバーとテストだけ。ログに中身を書かない。 */
import { adminProblem, type AdminEnv } from './admin';
import { MAX_STEPS, STEP_ID, type ReportStep } from '../src/core/reportSteps';
import { REPORT_KINDS, REPORT_STATUSES, type ReportKind, type ReportStatus } from '../src/core/reportKinds';

export interface KvLike {
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete?: boolean; cursor?: string }>;
}
export interface RateLimiter { limit(opts: { key: string }): Promise<{ success: boolean }> }
export interface Env extends AdminEnv { REPORTS?: KvLike; REPORT_LIMIT?: RateLimiter }

export interface Report {
  id: string; path: string; scene: string | null; text: string; level: string; at: string; received_at: string; steps?: ReportStep[];
  /** 2026-11-14：種類・手続きの id・版の印・作者が付ける状態 */
  kind?: ReportKind; card?: string; build?: string; status?: ReportStatus; status_at?: string;
}

export const MAX_TEXT = 2000;
export const MAX_BODY = 16_384;
export const PER_MINUTE = 3;
export const PAGE = 50;
export const MAX_PAGE = 100;
/** 報告を残す期間（1年。作者の決定 2026-11-08。KV の expirationTtl で自動で消える） */
export const REPORT_TTL = 31_536_000;
const NEW = 'r2:';
const OLD = 'report:';
const TOP = 9_999_999_999_999;

/** KV が無いときのメモリ（手元の npm run dev・テスト・KV の作成前）。本物と同じに、キーの順で返し、続きの印を返す */
const mem = new Map<string, string>();
export const memoryKv: KvLike = {
  async put(k, v) { mem.set(k, v); },
  async get(k) { return mem.get(k) ?? null; },
  async list(o) {
    const all = [...mem.keys()].filter((k) => !o?.prefix || k.startsWith(o.prefix)).sort();
    const from = o?.cursor ? Number(o.cursor) : 0;
    const limit = o?.limit ?? 1000;
    const keys = all.slice(from, from + limit).map((name) => ({ name }));
    const done = from + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : String(from + limit) };
  },
};
export const clearMemory = () => { mem.clear(); hits.clear(); };

/* 1 IP 1分に3件（数えるだけ。IP は保存しない） */
const hits = new Map<string, number[]>();
export function allow(ip: string, now: number): boolean {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= PER_MINUTE) { hits.set(ip, list); return false; }
  hits.set(ip, [...list, now]);
  return true;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** ほかのサイトからの送信を断る。理由を返す（通すときは null）。
    Content-Type が application/json でない送信（フォーム・text/plain）は、ブラウザが確認なしで送れるので受け取らない */
export function crossSiteProblem(req: Request): string | null {
  if (!/^application\/json\s*(;|$)/i.test(req.headers.get('content-type') ?? '')) return 'content_type';
  if ((req.headers.get('sec-fetch-site') ?? '').toLowerCase() === 'cross-site') return 'origin';
  const origin = req.headers.get('origin');
  if (origin !== null) {
    let same = false;
    try { same = new URL(origin).origin === new URL(req.url).origin; } catch { same = false; }
    if (!same) return 'origin';
  }
  return null;
}

/** 本文を確かめる。ほかの項目は捨てる（名前・連絡先などを送られても残さない） */
export function parseReport(x: unknown): Omit<Report, 'id' | 'received_at' | 'status' | 'status_at'> | string {
  if (!x || typeof x !== 'object') return 'body';
  const o = x as Record<string, unknown>;
  const path = typeof o.path === 'string' ? o.path : '';
  if (!/^\/[a-z0-9/_-]{0,200}$/i.test(path) || path.includes('//')) return 'path';
  const scene = o.scene === undefined || o.scene === null || o.scene === '' ? null : String(o.scene);
  if (scene !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(scene)) return 'scene';
  // 種類（無くてよい。前の形の報告は種類なし）
  let kind: ReportKind | undefined;
  if (o.kind !== undefined && o.kind !== null) {
    if (typeof o.kind !== 'string' || !(REPORT_KINDS as readonly string[]).includes(o.kind)) return 'kind';
    kind = o.kind as ReportKind;
  }
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  // 文は、種類を選んだとき（「そのほか」以外）は無くてよい
  if (text.length > MAX_TEXT || (!text && (!kind || kind === 'other'))) return 'text';
  const level = typeof o.level === 'string' ? o.level : '';
  if (!/^[a-z_-]{1,16}$/i.test(level)) return 'level';
  const at = typeof o.at === 'string' ? o.at : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(at)) return 'at';
  let card: string | undefined;
  if (o.card !== undefined && o.card !== null && o.card !== '') {
    if (typeof o.card !== 'string' || !STEP_ID.test(o.card)) return 'card';
    card = o.card;
  }
  let build: string | undefined;
  if (o.build !== undefined && o.build !== null && o.build !== '') {
    if (typeof o.build !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(o.build)) return 'build';
    build = o.build;
  }
  // 手続きと段階（B-5）：無くてよい。あれば最大50件、id の形・状態・段階だけを残す（ほかの項目は捨てる）
  let steps: ReportStep[] | undefined;
  if (o.steps !== undefined && o.steps !== null) {
    if (!Array.isArray(o.steps) || o.steps.length > MAX_STEPS) return 'steps';
    steps = [];
    for (const s of o.steps as unknown[]) {
      if (!s || typeof s !== 'object') return 'steps';
      const { card_id, status, stage } = s as Record<string, unknown>;
      if (typeof card_id !== 'string' || !STEP_ID.test(card_id)) return 'steps';
      if (status !== 'todo' && status !== 'done' && status !== 'not_done') return 'steps';
      if (stage !== 'now' && stage !== 'visit' && stage !== 'after' && stage !== 'card') return 'steps';
      steps.push({ card_id, status, stage });
    }
  }
  return { path, scene, text, level, at, ...(steps ? { steps } : {}), ...(kind ? { kind } : {}), ...(card ? { card } : {}), ...(build ? { build } : {}) };
}

/** 新しい報告のキー：逆向きの時刻（KV の一覧はキーの順なので、新しいものが先に出る） */
export const keyOf = (now: number, rand: string) => NEW + String(TOP - now).padStart(13, '0') + '-' + rand;

export async function handleReport(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const kv = env.REPORTS ?? memoryKv;
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const cross = crossSiteProblem(req);
  if (cross) return json(cross === 'content_type' ? 415 : 403, { error: cross });
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  // 回数の制限：本番は Cloudflare の Rate Limiting（REPORT_LIMIT。Worker どうしで共有。IP は数えるだけで残さない）。無いとき（手元・テスト）はこの Worker のメモリ
  const ok = env.REPORT_LIMIT ? (await env.REPORT_LIMIT.limit({ key: 'report:' + ip })).success : allow(ip, now);
  if (!ok) return json(429, { error: 'too_many' });
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
    body = JSON.parse(raw);
  } catch { return json(400, { error: 'body' }); }
  const r = parseReport(body);
  if (typeof r === 'string') return json(400, { error: r });
  const received_at = new Date(now).toISOString();
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  const key = keyOf(now, rand);
  const id = key.slice(NEW.length);
  // 書き込めたときだけ 201。失敗したら成功と言わない（本文はログに書かない）
  try {
    await kv.put(key, JSON.stringify({ id, ...r, received_at, status: 'new' } satisfies Report), { expirationTtl: REPORT_TTL });
  } catch {
    console.warn('report: storage_failed');
    return json(503, { error: 'storage_failed' });
  }
  // ref：送った人が控えられる短い印（本文とは結び付けられない長さではないが、中身は入っていない）
  return json(201, { ok: true, ref: rand });
}

const keyFromId = (id: string) => (/^\d{13}-[a-z0-9]{6}$/.test(id) ? NEW + id : /^\d{17}-[a-z0-9]{1,6}$/.test(id) ? OLD + id : null);

export async function handleReports(req: Request, env: Env, now = Date.now()): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'PATCH') return json(405, { error: 'method' });
  const no = await adminProblem(req, env, now);
  if (no) return no;
  const kv = env.REPORTS ?? memoryKv;
  if (req.method === 'PATCH') {
    if (crossSiteProblem(req)) return json(403, { error: 'origin' });
    let b: { id?: unknown; status?: unknown };
    try { b = (await req.json()) as typeof b; } catch { return json(400, { error: 'body' }); }
    const key = typeof b.id === 'string' ? keyFromId(b.id) : null;
    if (!key) return json(400, { error: 'id' });
    if (typeof b.status !== 'string' || !(REPORT_STATUSES as readonly string[]).includes(b.status)) return json(400, { error: 'status' });
    try {
      const v = await kv.get(key);
      if (!v) return json(404, { error: 'not_found' });
      const r = JSON.parse(v) as Report;
      // 残りの期間を延ばさない：受け取った日から1年
      const left = Math.max(60, Math.floor((Date.parse(r.received_at) + REPORT_TTL * 1000 - now) / 1000));
      const next: Report = { ...r, status: b.status as ReportStatus, status_at: new Date(now).toISOString() };
      await kv.put(key, JSON.stringify(next), { expirationTtl: left });
      return json(200, { ok: true, report: next });
    } catch {
      console.warn('reports: storage_failed');
      return json(503, { error: 'storage_failed' });
    }
  }
  // 一覧：新しい形（新しい順）を1ページ。終わったら前の形（11/14 より前。件数が少ないので、まとめて新しい順に並べる）を続ける
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.headers.get('x-reports-limit')) || PAGE));
  const cur = req.headers.get('x-reports-cursor') ?? '';
  if (cur && !/^(n|o):[A-Za-z0-9_=+/-]{0,1024}$/.test(cur)) return json(400, { error: 'cursor' });
  const list: Report[] = [];
  let next: string | null = null;
  try {
    const read = async (names: string[]) => { for (const n of names) { const v = await kv.get(n); if (v) list.push(JSON.parse(v) as Report); } };
    if (!cur.startsWith('o:')) {
      const page = await kv.list({ prefix: NEW, limit, cursor: cur ? cur.slice(2) : undefined });
      await read(page.keys.map((k) => k.name));
      next = page.list_complete === false && page.cursor ? 'n:' + page.cursor : 'o:';
    }
    if (cur.startsWith('o:') || (next === 'o:' && list.length < limit)) {
      const c = cur.startsWith('o:') ? cur.slice(2) : '';
      const page = await kv.list({ prefix: OLD, limit: limit - list.length || limit, cursor: c || undefined });
      const before = list.length;
      await read(page.keys.map((k) => k.name));
      const old = list.splice(before).sort((a, b) => b.received_at.localeCompare(a.received_at));
      list.push(...old);
      next = page.list_complete === false && page.cursor ? 'o:' + page.cursor : null;
    }
  } catch {
    console.warn('reports: storage_failed');
    return json(503, { error: 'storage_failed' });
  }
  return json(200, { reports: list.map((r) => ({ ...r, status: r.status ?? 'new' })), next });
}
