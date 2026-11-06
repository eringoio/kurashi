/* 報告ボタン（作者の指示 2026-11-06 A-9）。「案内とちがうところを知らせる」。
   POST /api/report：本文は { path, scene, text, level, at } だけ。名前・連絡先は受け取らない。1件 2,000字まで。1 IP 1分に3件まで（IP は数えるだけで残さない）。
   GET /api/reports：作者だけ（Authorization: Bearer <REPORTS_TOKEN>。トークンは Worker のシークレット）。
   保存は KV の REPORTS（wrangler.toml の binding）。KV が無いとき（手元・作成前）は、この Worker のメモリの中だけ（消える）。ログに中身を書かない。 */

export interface KvLike {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  list(opts?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}
export interface Env { REPORTS?: KvLike; REPORTS_TOKEN?: string }

export interface Report { id: string; path: string; scene: string | null; text: string; level: string; at: string; received_at: string }

export const MAX_TEXT = 2000;
export const PER_MINUTE = 3;

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
  return { path, scene, text, level, at };
}

export async function handleReport(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const kv = env.REPORTS ?? memoryKv;
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  if (!allow(ip, now)) return json(429, { error: 'too_many' });
  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: 'body' }); }
  const r = parseReport(body);
  if (typeof r === 'string') return json(400, { error: r });
  const received_at = new Date(now).toISOString();
  const id = received_at.replace(/[-:.TZ]/g, '') + '-' + Math.random().toString(36).slice(2, 8);
  await kv.put('report:' + id, JSON.stringify({ id, ...r, received_at } satisfies Report));
  return json(201, { ok: true });
}

export async function handleReports(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: 'method' });
  if (!env.REPORTS_TOKEN) return json(503, { error: 'not_configured' });
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== 'Bearer ' + env.REPORTS_TOKEN) return json(401, { error: 'unauthorized' });
  const kv = env.REPORTS ?? memoryKv;
  const { keys } = await kv.list({ prefix: 'report:', limit: 1000 });
  const list: Report[] = [];
  for (const k of keys) { const v = await kv.get(k.name); if (v) list.push(JSON.parse(v) as Report); }
  list.sort((a, b) => b.received_at.localeCompare(a.received_at));
  return json(200, { reports: list });
}
