/* 報告ボタン（作者の指示 2026-11-06 A-9）。「案内とちがうところを知らせる」。
   POST /api/report：本文は { path, scene, text, level, at } だけ。名前・連絡先は受け取らない。1件 2,000字まで。1 IP 1分に3件まで（IP は数えるだけで残さない）。
   GET /api/reports：作者だけ（Authorization: Bearer <REPORTS_TOKEN>。トークンは Worker のシークレット）。
   保存は KV の REPORTS（wrangler.toml の binding。1年で消える）。本番の入口（worker/index.ts）は KV が無ければ 503。メモリは手元の開発サーバーとテストだけ。ログに中身を書かない。
   11/7 B-5：任意の steps（手続きの id・状態・段階だけ。最大50件）も受け取る。 */
import { MAX_STEPS, STEP_ID, type ReportStep } from '../src/core/reportSteps';

export interface KvLike {
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  list(opts?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}
export interface RateLimiter { limit(opts: { key: string }): Promise<{ success: boolean }> }
export interface Env { REPORTS?: KvLike; REPORTS_TOKEN?: string; REPORT_LIMIT?: RateLimiter }

export interface Report { id: string; path: string; scene: string | null; text: string; level: string; at: string; received_at: string; steps?: ReportStep[] }

export const MAX_TEXT = 2000;
export const PER_MINUTE = 3;
/** 報告を残す期間（1年。作者の決定 2026-11-08。KV の expirationTtl で自動で消える） */
export const REPORT_TTL = 31_536_000;

/** KV が無いときのメモリ（手元の npm run dev・テスト・KV の作成前） */
const mem = new Map<string, string>();
export const memoryKv: KvLike = {
  async put(k, v) { mem.set(k, v); },
  async get(k) { return mem.get(k) ?? null; },
  async list(o) { return { keys: [...mem.keys()].filter((k) => !o?.prefix || k.startsWith(o.prefix)).slice(0, o?.limit ?? 1000).map((name) => ({ name })) }; },
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

/** 本文を確かめる。ほかの項目は捨てる（名前・連絡先などを送られても残さない） */
export function parseReport(x: unknown): Omit<Report, 'id' | 'received_at'> | string {
  if (!x || typeof x !== 'object') return 'body';
  const o = x as Record<string, unknown>;
  const path = typeof o.path === 'string' ? o.path : '';
  if (!/^\/[a-z0-9/_-]{0,200}$/i.test(path) || path.includes('//')) return 'path';
  const scene = o.scene === undefined || o.scene === null || o.scene === '' ? null : String(o.scene);
  if (scene !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(scene)) return 'scene';
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (!text || text.length > MAX_TEXT) return 'text';
  const level = typeof o.level === 'string' ? o.level : '';
  if (!/^[a-z_-]{1,16}$/i.test(level)) return 'level';
  const at = typeof o.at === 'string' ? o.at : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(at)) return 'at';
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
  return steps ? { path, scene, text, level, at, steps } : { path, scene, text, level, at };
}

export async function handleReport(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const kv = env.REPORTS ?? memoryKv;
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  // 回数の制限：本番は Cloudflare の Rate Limiting（REPORT_LIMIT。Worker どうしで共有。IP は数えるだけで残さない）。無いとき（手元・テスト）はこの Worker のメモリ
  const ok = env.REPORT_LIMIT ? (await env.REPORT_LIMIT.limit({ key: 'report:' + ip })).success : allow(ip, now);
  if (!ok) return json(429, { error: 'too_many' });
  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: 'body' }); }
  const r = parseReport(body);
  if (typeof r === 'string') return json(400, { error: r });
  const received_at = new Date(now).toISOString();
  const id = received_at.replace(/[-:.TZ]/g, '') + '-' + Math.random().toString(36).slice(2, 8);
  // 書き込めたときだけ 201。失敗したら成功と言わない（本文はログに書かない）
  try {
    await kv.put('report:' + id, JSON.stringify({ id, ...r, received_at } satisfies Report), { expirationTtl: REPORT_TTL });
  } catch {
    console.warn('report: storage_failed');
    return json(503, { error: 'storage_failed' });
  }
  return json(201, { ok: true });
}

export async function handleReports(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: 'method' });
  if (!env.REPORTS_TOKEN) return json(503, { error: 'not_configured' });
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== 'Bearer ' + env.REPORTS_TOKEN) return json(401, { error: 'unauthorized' });
  const kv = env.REPORTS ?? memoryKv;
  const list: Report[] = [];
  try {
    const { keys } = await kv.list({ prefix: 'report:', limit: 1000 });
    for (const k of keys) { const v = await kv.get(k.name); if (v) list.push(JSON.parse(v) as Report); }
  } catch {
    console.warn('reports: storage_failed');
    return json(503, { error: 'storage_failed' });
  }
  list.sort((a, b) => b.received_at.localeCompare(a.received_at));
  return json(200, { reports: list });
}
