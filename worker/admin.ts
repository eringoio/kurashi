/* 作者だけの入口の守り（Fable 監査 FB-2。2026-11-15）。GET・PATCH /api/reports と GET /api/usage が使う。
   1. ホスト：ADMIN_HOSTS（カンマ区切り）があるとき、その名前以外から来たら 404（workers.dev では開かない）。
   2. ADMIN_AUTH="access"（本番。未設定・不明な値もこれ）：Cloudflare Access の JWT（ヘッダー Cf-Access-Jwt-Assertion）を RS256 で確かめる。
      鍵は ${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs。aud・iss・exp・nbf も見る。そのうえで Bearer REPORTS_TOKEN も要る（2つ）。
      ACCESS_TEAM_DOMAIN か ACCESS_AUD が無ければ 503（閉じたまま）。
   3. ADMIN_AUTH="token"：Bearer REPORTS_TOKEN だけ（手元の開発だけ。はっきり書いたときだけ）。
   クッキー CF_Authorization・Cf-Access-Authenticated-User-Email だけでは通さない。トークンも JWT もログに書かない。 */

export interface AdminEnv { ADMIN_AUTH?: string; ADMIN_HOSTS?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; REPORTS_TOKEN?: string }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** 長さと中身を、同じ時間で比べる */
export function sameToken(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

interface Jwk { kid?: string; kty?: string; alg?: string; n?: string; e?: string }
const KEY_TTL = 10 * 60_000;
const REFETCH_MIN = 30_000;
const SKEW = 60;
const cache = new Map<string, { at: number; keys: Jwk[] }>();
export const clearAdminCache = () => cache.clear();

const b64 = (s: string): Uint8Array<ArrayBuffer> => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
};
const parsePart = (s: string): Record<string, unknown> | null => {
  try { const v = JSON.parse(new TextDecoder().decode(b64(s))); return v && typeof v === 'object' ? v : null; } catch { return null; }
};

async function loadKeys(team: string, now: number): Promise<Jwk[]> {
  const r = await fetch(team + '/cdn-cgi/access/certs');
  if (!r.ok) throw new Error('jwks');
  const keys = ((await r.json()) as { keys?: Jwk[] }).keys ?? [];
  cache.set(team, { at: now, keys });
  return keys;
}

/** JWT を確かめる。通れば null、だめなら理由 */
async function verifyAccessJwt(jwt: string, team: string, aud: string, now: number): Promise<'bad' | 'jwks' | null> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return 'bad';
  const head = parsePart(parts[0]);
  const claims = parsePart(parts[1]);
  if (!head || !claims || head.alg !== 'RS256' || typeof head.kid !== 'string') return 'bad';
  let keys: Jwk[];
  try {
    const c = cache.get(team);
    keys = c && now - c.at < KEY_TTL ? c.keys : await loadKeys(team, now);
    // 知らない kid：鍵が替わったかもしれないので、一度だけ取り直す（取り直しは30秒に1回まで）
    if (!keys.some((k) => k.kid === head.kid)) {
      const at = cache.get(team)?.at ?? 0;
      if (now - at >= REFETCH_MIN) keys = await loadKeys(team, now);
    }
  } catch { return 'jwks'; }
  const jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk || jwk.kty !== 'RSA') return 'bad';
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { return 'bad'; }
  if (!ok) return 'bad';
  const sec = Math.floor(now / 1000);
  const norm = (s: string) => s.replace(/\/+$/, '');
  if (typeof claims.iss !== 'string' || norm(claims.iss) !== norm(team)) return 'bad';
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return 'bad';
  if (typeof claims.exp !== 'number' || claims.exp + SKEW < sec) return 'bad';
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf - SKEW > sec)) return 'bad';
  return null;
}

/** 通すときは null。だめなときは返す Response */
export async function adminProblem(req: Request, env: AdminEnv, now = Date.now()): Promise<Response | null> {
  const hosts = (env.ADMIN_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hosts.length && !hosts.includes(new URL(req.url).hostname.toLowerCase())) return json(404, { error: 'not_found' });
  const mode = env.ADMIN_AUTH === 'token' ? 'token' : 'access';
  if (mode === 'access') {
    const team = (env.ACCESS_TEAM_DOMAIN ?? '').trim();
    const aud = (env.ACCESS_AUD ?? '').trim();
    if (!team || !aud) return json(503, { error: 'not_configured' });
    const jwt = req.headers.get('cf-access-jwt-assertion');
    if (!jwt) return json(401, { error: 'unauthorized' });
    const v = await verifyAccessJwt(jwt, team.replace(/\/+$/, ''), aud, now);
    if (v === 'jwks') return json(503, { error: 'access_unavailable' });
    if (v) return json(401, { error: 'unauthorized' });
  }
  if (!env.REPORTS_TOKEN) return json(503, { error: 'not_configured' });
  if (!sameToken(req.headers.get('authorization') ?? '', 'Bearer ' + env.REPORTS_TOKEN)) return json(401, { error: 'unauthorized' });
  return null;
}
