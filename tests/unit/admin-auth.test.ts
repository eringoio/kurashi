/* 作者だけの入口の守り（Fable 監査 FB-2）：Cloudflare Access の JWT・ホスト・トークン */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { clearAdminCache } from '../../worker/admin';
import { clearMemory, handleReports } from '../../worker/report';
import { clearEvMemory, handleUsage } from '../../worker/ev';
import workerIndex from '../../worker/index';

const TEAM = 'https://team.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const HOST = 'kurashi.eringo.io';
const ENV = { ADMIN_AUTH: 'access', ADMIN_HOSTS: HOST, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, REPORTS_TOKEN: 't0ken' };
const NOW = Date.UTC(2026, 10, 15, 3, 0, 0);
const SEC = Math.floor(NOW / 1000);

const b64u = (b: ArrayBuffer | Uint8Array | string) => {
  const u = typeof b === 'string' ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ''; for (const c of u) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
let pair: CryptoKeyPair, other: CryptoKeyPair, jwks: { keys: unknown[] };
let fetchMock: ReturnType<typeof vi.fn>;

async function sign(key: CryptoKey, claims: Record<string, unknown>, kid = 'k1') {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(sig);
}
const good = { iss: TEAM, aud: [AUD], exp: SEC + 3600, nbf: SEC - 10, email: 'a@example.com' };
const jwt = (over: Record<string, unknown> = {}, key = pair.privateKey, kid = 'k1') => sign(key, { ...good, ...over }, kid);
const req = (path: string, o: { jwt?: string; token?: string | null; host?: string; method?: string; body?: unknown } = {}) => {
  const h: Record<string, string> = {};
  if (o.jwt) h['cf-access-jwt-assertion'] = o.jwt;
  if (o.token !== null) h.authorization = 'Bearer ' + (o.token ?? 't0ken');
  if (o.body) h['content-type'] = 'application/json';
  return new Request('https://' + (o.host ?? HOST) + path, { method: o.method ?? 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
};

beforeAll(async () => {
  pair = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  other = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  jwks = { keys: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: pub.n, e: pub.e }] };
});
beforeEach(() => {
  clearAdminCache(); clearMemory(); clearEvMemory();
  fetchMock = vi.fn(async (u: string) => (String(u) === TEAM + '/cdn-cgi/access/certs' ? new Response(JSON.stringify(jwks)) : new Response('no', { status: 404 })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const reports = (r: Request, env: object = ENV) => handleReports(r, env, NOW);
const usage = (r: Request, env: object = ENV) => handleUsage(r, env, NOW);

describe('Access の JWT＋トークン（ADMIN_AUTH=access）', () => {
  it('正しい JWT とトークンなら、reports も usage も 200', async () => {
    expect((await reports(req('/api/reports', { jwt: await jwt() }))).status).toBe(200);
    const u = await usage(req('/api/usage', { jwt: await jwt() }));
    expect(u.status).toBe(200);
    expect(u.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledWith(TEAM + '/cdn-cgi/access/certs');
  });
  it('aud が配列でなく文字列でも通る', async () => {
    expect((await reports(req('/api/reports', { jwt: await jwt({ aud: AUD }) }))).status).toBe(200);
  });
  it('JWT が無い・メールのヘッダーやクッキーだけでは通らない', async () => {
    expect((await reports(req('/api/reports'))).status).toBe(401);
    const r = new Request('https://' + HOST + '/api/reports', { headers: { authorization: 'Bearer t0ken', cookie: 'CF_Authorization=x', 'cf-access-authenticated-user-email': 'a@example.com' } });
    expect((await reports(r)).status).toBe(401);
    expect((await usage(req('/api/usage'))).status).toBe(401);
  });
  it('aud・iss が違う、期限切れ、まだ有効でないと 401', async () => {
    for (const over of [{ aud: ['other'] }, { iss: 'https://evil.cloudflareaccess.com' }, { exp: SEC - 600 }, { nbf: SEC + 600 }, { exp: undefined }]) {
      expect((await reports(req('/api/reports', { jwt: await jwt(over) }))).status).toBe(401);
    }
  });
  it('署名が違う・書き換えた・知らない kid は 401', async () => {
    expect((await reports(req('/api/reports', { jwt: await jwt({}, other.privateKey) }))).status).toBe(401);
    const [h, , s] = (await jwt()).split('.');
    expect((await reports(req('/api/reports', { jwt: h + '.' + b64u(JSON.stringify({ ...good, email: 'x' })) + '.' + s }))).status).toBe(401);
    expect((await reports(req('/api/reports', { jwt: await jwt({}, pair.privateKey, 'zzz') }))).status).toBe(401);
    expect((await reports(req('/api/reports', { jwt: 'abc' }))).status).toBe(401);
  });
  it('alg が none の JWT は通さない', async () => {
    const t = b64u(JSON.stringify({ alg: 'none', kid: 'k1' })) + '.' + b64u(JSON.stringify(good)) + '.';
    expect((await reports(req('/api/reports', { jwt: t }))).status).toBe(401);
  });
  it('鍵が替わったら、知らない kid のとき取り直す', async () => {
    await reports(req('/api/reports', { jwt: await jwt() }));
    const pub2 = (await crypto.subtle.exportKey('jwk', other.publicKey)) as JsonWebKey;
    jwks = { keys: [...jwks.keys, { kty: 'RSA', kid: 'k2', alg: 'RS256', n: pub2.n, e: pub2.e }] };
    const t = await jwt({}, other.privateKey, 'k2');
    expect((await handleReports(req('/api/reports', { jwt: t }), ENV, NOW + 120_000)).status).toBe(200);
  });
  it('JWT が正しくても、トークンが無い・違うと 401', async () => {
    expect((await reports(req('/api/reports', { jwt: await jwt(), token: null }))).status).toBe(401);
    expect((await reports(req('/api/reports', { jwt: await jwt(), token: 'nope' }))).status).toBe(401);
    expect((await usage(req('/api/usage', { jwt: await jwt(), token: null }))).status).toBe(401);
  });
  it('PATCH も同じ守り', async () => {
    const body = { id: '0000000000000-abcdef', status: 'fixed' };
    expect((await reports(req('/api/reports', { method: 'PATCH', body }))).status).toBe(401);
    expect((await reports(req('/api/reports', { method: 'PATCH', body, jwt: await jwt() }))).status).toBe(404);
  });
  it('鍵の取得に失敗したら 503（閉じたまま）', async () => {
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }));
    expect((await reports(req('/api/reports', { jwt: await jwt() }))).status).toBe(503);
  });
});

describe('ホストと設定', () => {
  it('ADMIN_HOSTS にないホスト（workers.dev）は、JWT もトークンも正しくても 404', async () => {
    const j = await jwt();
    expect((await reports(req('/api/reports', { jwt: j, host: 'kurashi.eringo-io.workers.dev' }))).status).toBe(404);
    expect((await usage(req('/api/usage', { jwt: j, host: 'kurashi.eringo-io.workers.dev' }))).status).toBe(404);
    expect((await reports(req('/api/reports', { jwt: j, host: 'KURASHI.ERINGO.IO' }))).status).toBe(200);
  });
  it('ACCESS_TEAM_DOMAIN か ACCESS_AUD が無ければ 503', async () => {
    const j = await jwt();
    expect((await reports(req('/api/reports', { jwt: j }), { ...ENV, ACCESS_AUD: undefined })).status).toBe(503);
    expect((await usage(req('/api/usage', { jwt: j }), { ...ENV, ACCESS_TEAM_DOMAIN: '' })).status).toBe(503);
    expect(await (await reports(req('/api/reports', { jwt: j }), { ...ENV, ACCESS_AUD: undefined })).json()).toEqual({ error: 'not_configured' });
  });
  it('ADMIN_AUTH が無い・不明な値は access と同じ（閉じる）', async () => {
    const { ADMIN_AUTH: _a, ...none } = ENV;
    expect((await reports(req('/api/reports'), none)).status).toBe(401);
    expect((await reports(req('/api/reports'), { REPORTS_TOKEN: 't0ken' })).status).toBe(503);
    expect((await reports(req('/api/reports'), { ...ENV, ADMIN_AUTH: 'off' })).status).toBe(401);
    expect((await reports(req('/api/reports'), { ...ENV, ADMIN_AUTH: 'TOKEN' })).status).toBe(401);
  });
  it('ADMIN_AUTH=token（手元）はトークンだけで通り、トークンの設定が無ければ 503', async () => {
    const dev = { ADMIN_AUTH: 'token', REPORTS_TOKEN: 't0ken' };
    expect((await reports(req('/api/reports', { host: 'localhost:5173' }), dev)).status).toBe(200);
    expect((await reports(req('/api/reports', { token: 'x' }), dev)).status).toBe(401);
    expect((await reports(req('/api/reports'), { ADMIN_AUTH: 'token' })).status).toBe(503);
  });
});

describe('公開の入口は開いたまま（worker/index.ts）', () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') }, ...ENV } as never;
  it('POST /api/ev は JWT なしで 204', async () => {
    const r = new Request('https://kurashi.eringo-io.workers.dev/api/ev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: 'view', p: '/move' }) });
    expect((await workerIndex.fetch(r, env)).status).toBe(204);
  });
  it('POST /api/report は JWT なしで受け取る', async () => {
    const mem = new Map<string, string>();
    const kv = { put: async (k: string, v: string) => { mem.set(k, v); }, get: async (k: string) => mem.get(k) ?? null, list: async () => ({ keys: [] }) };
    const r = new Request('https://kurashi.eringo-io.workers.dev/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '/move', text: 'x', level: 'ja', at: '2026-11-15T10:00:00+09:00' }) });
    expect((await workerIndex.fetch(r, { ...(env as object), REPORTS: kv } as never)).status).toBe(201);
    expect(mem.size).toBe(1);
  });
  it('GET /api/usage を workers.dev で呼ぶと 404（index 経由）', async () => {
    const r = new Request('https://kurashi.eringo-io.workers.dev/api/usage', { headers: { authorization: 'Bearer t0ken' } });
    expect((await workerIndex.fetch(r, env)).status).toBe(404);
  });
});
