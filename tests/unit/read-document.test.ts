/* /api/read-document（6A.9・13.3）：同意が無ければ送らない、キーが無ければ見本、キーをログに出さない、一覧の外の候補を捨てる */
import { describe, expect, it, vi } from 'vitest';
import { cleanCandidates, DOCUMENTS, loadDocuments, SAMPLE_RESULT } from '../../src/core/documents';
import { loadData } from '../../src/core/data';
import { handleReadDocument, instruction, MAX_BASE64, type Reader } from '../../worker/readDocument';

const KEY = 'test-dummy-key-not-real';
const req = (body: unknown, init: RequestInit = {}) => new Request('http://x/api/read-document', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init,
});
// 先頭のバイトが JPEG の、小さな base64（中身は画像でなくてよい。読み取りは見本に差し替える）
const JPEG = '/9j/4AAQSkZJRgAB';
const ok = { consent: true, media_type: 'image/jpeg', data: JPEG };
const TOKEN = 'test-read-token-not-real';
/** test モードで、正しいトークンを持つ作者 */
const AUTH = { ANTHROPIC_API_KEY: KEY, READ_MODE: 'test', READ_TEST_TOKEN: TOKEN };
const withToken = (body: unknown, token = TOKEN) => req(body, { headers: { 'content-type': 'application/json', 'x-kurashi-read-token': token } });

describe('知っている書類のデータ', () => {
  it('3種類。関係するカードがある。確認待ちか、作者が本文を確かめたもの（verified_by 付き）', () => {
    const cards = new Set(loadData().cards.map((c) => c.id));
    expect(DOCUMENTS().length).toBeGreaterThanOrEqual(3);
    for (const d of DOCUMENTS()) {
      for (const id of d.card_ids) expect(cards.has(id), d.id + ' ' + id).toBe(true);
      if (d.evidence.status === 'verified') expect(d.evidence.verified_by, d.id).toBeTruthy();
      else expect(d.evidence.status).toBe('needs_check');
    }
  });
  it('同じ id は読み込めない', () => {
    const d = DOCUMENTS()[0];
    expect(() => loadDocuments({ documents: [d, d] })).toThrow();
  });
});

describe('候補の検査', () => {
  const ids = DOCUMENTS().map((d) => d.id);
  it('一覧の外・確からしさが低い・型に合わないものは捨て、高い順に最大3つ', () => {
    const r = cleanCandidates({ candidates: [
      { id: 'kokuho-nofu', confidence: 0.6 }, { id: 'evil', confidence: 0.99 }, { id: 'kokuho-shikaku', confidence: 0.95 }, { id: 'nenkin-oshirase', confidence: 0.2 },
    ] }, ids);
    expect(r.map((c) => c.id)).toEqual(['kokuho-shikaku', 'kokuho-nofu']);
    expect(cleanCandidates({ candidates: 'x' }, ids)).toEqual([]);
    expect(cleanCandidates({ name: '山田', candidates: [{ id: 'kokuho-shikaku', confidence: 2 }] }, ids)).toEqual([]);
  });
  it('指示に、本人の情報を書かせない文があり、一覧の id だけを並べる', () => {
    const t = instruction();
    expect(t).toMatch(/名前・住所・番号・日付・金額は、答えに書かないで/);
    for (const d of DOCUMENTS()) expect(t).toContain(d.id);
  });
});

describe('断られたときの読み直し', () => {
  it('Haiku には付けない（Haiku 5.5 には無い）。ほかのモデルには付ける', async () => {
    const { fallbackParams } = await import('../../worker/readDocument');
    expect(fallbackParams('claude-haiku-5-5')).toEqual({});
    expect(fallbackParams('claude-sonnet-5-5')).toEqual({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  });
});

describe('Worker', () => {
  it('同意の印が無ければ送らない（読み取りを呼ばない）', async () => {
    const read = vi.fn<Reader>();
    const r = await handleReadDocument(req({ ...ok, consent: false }), { ANTHROPIC_API_KEY: KEY }, read);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'no_consent' });
    expect(read).not.toHaveBeenCalled();
  });
  it('形式・大きさ・本文の誤りは送らない', async () => {
    const read = vi.fn<Reader>();
    expect((await handleReadDocument(req({ ...ok, media_type: 'application/pdf' }), { ANTHROPIC_API_KEY: KEY }, read)).status).toBe(415);
    expect((await handleReadDocument(req({ ...ok, data: 'A'.repeat(MAX_BASE64 + 4) }), { ANTHROPIC_API_KEY: KEY }, read)).status).toBe(413);
    expect((await handleReadDocument(req({ ...ok, data: '<script>' }), { ANTHROPIC_API_KEY: KEY }, read)).status).toBe(400);
    expect((await handleReadDocument(new Request('http://x', { method: 'GET' }), { ANTHROPIC_API_KEY: KEY }, read)).status).toBe(405);
    expect(read).not.toHaveBeenCalled();
  });
  it('キーが無いときは見本の結果（sample: true）', async () => {
    const read = vi.fn<Reader>();
    const r = await handleReadDocument(req(ok), {}, read);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ sample: true, candidates: SAMPLE_RESULT.candidates });
    expect(read).not.toHaveBeenCalled();
  });
  it('キーがあれば読み、モデルは設定で変えられる（既定 claude-haiku-5-5）。一覧の外は捨てる', async () => {
    const read = vi.fn<Reader>(async () => ({ candidates: [{ id: 'nenkin-oshirase', confidence: 0.8 }, { id: 'x', confidence: 0.9 }] }));
    const r = await handleReadDocument(withToken(ok), AUTH, read);
    expect(await r.json()).toEqual({ sample: false, candidates: [{ id: 'nenkin-oshirase', confidence: 0.8 }] });
    expect(read.mock.calls[0][1]).toBe('claude-haiku-5-5');
    await handleReadDocument(withToken(ok), { ...AUTH, READ_MODEL: 'claude-opus-5-5' }, read);
    expect(read.mock.calls[1][1]).toBe('claude-opus-5-5');
  });
  it('失敗しても、キー・画像・結果をログに出さない', async () => {
    const logs: string[] = [];
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a.join(' ')); }));
    const read: Reader = async () => { throw new Error('boom ' + KEY); };
    const r = await handleReadDocument(withToken({ ...ok, data: JPEG + 'SECRETIMAGEDATA' }), AUTH, read);
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'read_failed' });
    expect(logs.join('\n')).not.toContain(KEY);
    expect(logs.join('\n')).not.toContain('SECRETIMAGEDATA');
    expect(logs.join('\n')).not.toContain('boom');
    spies.forEach((s) => s.mockRestore());
  });
  it('応答に保存を止める印（no-store）', async () => {
    const r = await handleReadDocument(req(ok), {});
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});

/* 有料の呼び出しの守り（Claude Security F1。SPEC v0.5.23）。どれも見本の Reader で、本物の API は呼ばない */
describe('有料の呼び出しの守り', () => {
  const kv = (start = 0) => { const m = new Map<string, string>(); return { m, get: async (k: string) => m.get(k) ?? (start ? String(start) : null), put: async (k: string, v: string) => { m.set(k, v); } }; };
  const limiter = (success: boolean) => ({ limit: vi.fn(async () => ({ success })) });
  const reader = () => vi.fn<Reader>(async () => ({ candidates: [{ id: 'nenkin-oshirase', confidence: 0.8 }] }));

  it('READ_MODE が無い・知らない値・off なら、キーがあっても読まない（見本）', async () => {
    for (const mode of [undefined, 'off', 'TEST', 'yes']) {
      const read = reader();
      const r = await handleReadDocument(withToken(ok), { ...AUTH, READ_MODE: mode }, read);
      expect(r.status, String(mode)).toBe(200);
      expect((await r.json()).sample).toBe(true);
      expect(read).not.toHaveBeenCalled();
    }
  });
  it('test：トークンが無い・違う・シークレットが無いと 401。キーが無くても 401。読まない', async () => {
    const read = reader();
    expect((await handleReadDocument(req(ok), AUTH, read)).status).toBe(401);
    expect((await handleReadDocument(withToken(ok, 'wrong'), AUTH, read)).status).toBe(401);
    expect((await handleReadDocument(withToken(ok, TOKEN.slice(0, -1)), AUTH, read)).status).toBe(401);
    expect((await handleReadDocument(withToken(ok), { ...AUTH, READ_TEST_TOKEN: undefined }, read)).status).toBe(401);
    expect((await handleReadDocument(req(ok), { READ_MODE: 'test', READ_TEST_TOKEN: TOKEN }, read)).status).toBe(401);
    const r = await handleReadDocument(withToken(ok, 'wrong'), AUTH, read);
    expect(await r.json()).toEqual({ error: 'unauthorized' });
    expect(read).not.toHaveBeenCalled();
  });
  it('test：正しいトークンでもキーが無ければ見本（有料の呼び出しなし）', async () => {
    const read = reader();
    const r = await handleReadDocument(withToken(ok), { READ_MODE: 'test', READ_TEST_TOKEN: TOKEN }, read);
    expect((await r.json()).sample).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });
  it('回数の制限に当たると 429（IP ごと。キーにモードと IP）', async () => {
    const read = reader();
    const lim = limiter(false);
    const r = await handleReadDocument(withToken(ok), { ...AUTH, READ_LIMIT: lim }, read);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'too_many' });
    expect(lim.limit).toHaveBeenCalledWith({ key: 'test:local' });
    expect(read).not.toHaveBeenCalled();
  });
  it('1日の上限に届くと 429。届く前は数えてから読む', async () => {
    const full = kv(100);
    const read = reader();
    const r = await handleReadDocument(withToken(ok), { ...AUTH, USAGE: full }, read);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'daily_limit' });
    expect(read).not.toHaveBeenCalled();
    const fresh = kv();
    const now = Date.UTC(2026, 10, 7, 20, 0); // 日本時間 11/8 5:00
    expect((await handleReadDocument(withToken(ok), { ...AUTH, USAGE: fresh, READ_DAILY_LIMIT: '2' }, read, now)).status).toBe(200);
    expect(fresh.m.get('usage:read:2026-11-08')).toBe('1');
    expect((await handleReadDocument(withToken(ok), { ...AUTH, USAGE: fresh, READ_DAILY_LIMIT: '2' }, read, now)).status).toBe(200);
    expect((await handleReadDocument(withToken(ok), { ...AUTH, USAGE: fresh, READ_DAILY_LIMIT: '2' }, read, now)).status).toBe(429);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('public：回数の制限か KV が無ければ 503（読まない）。両方あれば、トークンなしで読む', async () => {
    const read = reader();
    const env = { ANTHROPIC_API_KEY: KEY, READ_MODE: 'public' };
    expect((await handleReadDocument(req(ok), env, read)).status).toBe(503);
    expect((await handleReadDocument(req(ok), { ...env, READ_LIMIT: limiter(true) }, read)).status).toBe(503);
    expect((await handleReadDocument(req(ok), { ...env, USAGE: kv() }, read)).status).toBe(503);
    expect(read).not.toHaveBeenCalled();
    const r = await handleReadDocument(req(ok), { ...env, READ_LIMIT: limiter(true), USAGE: kv() }, read);
    expect(r.status).toBe(200);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('画像の先頭のバイトが形式と合わなければ 415（読まない）', async () => {
    const read = reader();
    const png = 'iVBORw0KGgoAAAAN', webp = 'UklGRhAAAABXRUJQ';
    expect((await handleReadDocument(withToken({ ...ok, data: png }), AUTH, read)).status).toBe(415);
    expect((await handleReadDocument(withToken({ ...ok, data: 'AAAAAAAAAAAA' }), AUTH, read)).status).toBe(415);
    expect((await handleReadDocument(withToken({ ...ok, media_type: 'image/png', data: png }), AUTH, read)).status).toBe(200);
    expect((await handleReadDocument(withToken({ ...ok, media_type: 'image/webp', data: webp }), AUTH, read)).status).toBe(200);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('AI が一覧の外の id・ルールや答えの名前を返しても、候補には入らない（判定を変えない）', async () => {
    const read = vi.fn<Reader>(async () => ({ candidates: [{ id: 'R-under-20', confidence: 0.99 }, { id: 'Q-work-limit', confidence: 0.99 }], verdict: 'shown', facts: { age: 30 } }));
    const r = await handleReadDocument(withToken(ok), AUTH, read);
    expect(await r.json()).toEqual({ sample: false, candidates: [] });
  });
  it('1回の操作で呼び出しは1回（やり直さない）。20秒で切る', async () => {
    const src = (await import('node:fs')).readFileSync('worker/readDocument.ts', 'utf8');
    expect(src).toMatch(/maxRetries: 0, timeout: 20_000/);
  });
});
