/* 報告ボタンの Worker（作者の指示 2026-11-06 A-9） */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemory, handleReport, handleReports, MAX_TEXT, parseReport } from '../../worker/report';

const ok = { path: '/c/nagoya-tennyu-juukyochi', scene: 'ward-office', text: '持ち物がちがいました', level: 'ja', at: '2026-11-06T10:00:00+09:00' };
const post = (body: unknown, ip = '1.2.3.4') => new Request('http://x/api/report', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
const get = (token?: string) => new Request('http://x/api/reports', { headers: token ? { authorization: 'Bearer ' + token } : {} });
const ENV = { REPORTS_TOKEN: 't0ken' };

beforeEach(() => clearMemory());

describe('報告（POST /api/report）', () => {
  it('5つの項目だけを受け取り、ほかの項目（名前など）は捨てる', async () => {
    expect(parseReport({ ...ok, name: '山田', email: 'a@b' })).toEqual({ ...ok });
    expect((await handleReport(post({ ...ok, name: '山田' }), ENV)).status).toBe(201);
    const list = (await (await handleReports(get('t0ken'), ENV)).json()).reports;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list[0])).not.toContain('山田');
    expect(JSON.stringify(list[0])).not.toContain('1.2.3.4');
  });
  it('文は1〜2,000字。パスにクエリ文字列は入れられない', () => {
    expect(parseReport({ ...ok, text: '' })).toBe('text');
    expect(parseReport({ ...ok, text: 'あ'.repeat(MAX_TEXT + 1) })).toBe('text');
    expect(parseReport({ ...ok, path: '/c/x?a=1' })).toBe('path');
  });
  it('1 IP 1分に3件まで', async () => {
    const t = Date.parse('2026-11-06T01:00:00Z');
    for (let i = 0; i < 3; i++) expect((await handleReport(post(ok, '9.9.9.9'), ENV, t + i)).status).toBe(201);
    expect((await handleReport(post(ok, '9.9.9.9'), ENV, t + 10)).status).toBe(429);
    expect((await handleReport(post(ok, '8.8.8.8'), ENV, t + 10)).status).toBe(201);
    expect((await handleReport(post(ok, '9.9.9.9'), ENV, t + 61_000)).status).toBe(201);
  });
});

describe('一覧（GET /api/reports）', () => {
  it('トークンが違えば 401、設定が無ければ 503', async () => {
    expect((await handleReports(get('nope'), ENV)).status).toBe(401);
    expect((await handleReports(get(), ENV)).status).toBe(401);
    expect((await handleReports(get('x'), {})).status).toBe(503);
  });
});

describe('報告の手続きと段階（11/7 B-5）', () => {
  it('steps は id・状態・段階だけを残す。形が違えば 400 の理由 steps。最大50件', async () => {
    const steps = [{ card_id: 'nagoya-tennyu-todoke', status: 'done', stage: 'after', planned_on: '2026-11-10', answer: 'x' }, { card_id: 'mail-forward', status: 'todo', stage: 'card' }];
    expect(parseReport({ ...ok, steps })).toEqual({ ...ok, steps: [{ card_id: 'nagoya-tennyu-todoke', status: 'done', stage: 'after' }, { card_id: 'mail-forward', status: 'todo', stage: 'card' }] });
    expect(parseReport({ ...ok, steps: [{ card_id: 'a b', status: 'todo', stage: 'now' }] })).toBe('steps');
    expect(parseReport({ ...ok, steps: [{ card_id: 'a', status: 'maybe', stage: 'now' }] })).toBe('steps');
    expect(parseReport({ ...ok, steps: Array.from({ length: 51 }, () => ({ card_id: 'a', status: 'todo', stage: 'now' })) })).toBe('steps');
    expect(parseReport({ ...ok, steps: 'x' })).toBe('steps');
    expect(parseReport(ok)).toEqual(ok);
  });
  it('reportSteps：plan から作る。日付・場所・答えは入れない', async () => {
    const { reportSteps, openCardOf } = await import('../../src/core/reportSteps');
    const plan = {
      a: { card_id: 'a', status: 'done' as const },
      b: { card_id: 'b', status: 'todo' as const, planned_on: '2026-11-10' },
      c: { card_id: 'c', status: 'todo' as const, visit_result: { place: 'ward_office', result: 'not_done' as const, on: '2026-11-07' } },
      d: { card_id: 'd', status: 'dismissed' as const },
      e: { card_id: 'e', status: 'todo' as const },
    };
    const s = reportSteps(plan, openCardOf('/e/E-move/c/e'));
    expect(s).toEqual([
      { card_id: 'a', status: 'done', stage: 'now' },
      { card_id: 'b', status: 'todo', stage: 'visit' },
      { card_id: 'c', status: 'not_done', stage: 'after' },
      { card_id: 'e', status: 'todo', stage: 'card' },
    ]);
    expect(JSON.stringify(s)).not.toMatch(/2026|ward_office/);
  });
});

/* 本番の保存（2026-11-08）：KV が必須、書けたときだけ 201、1年で消える、回数の制限は Cloudflare の Rate Limiting。架空の報告だけ */
describe('報告の保存（本番）', () => {
  const kv = () => {
    const m = new Map<string, { v: string; ttl?: number }>();
    return { m, put: async (k: string, v: string, o?: { expirationTtl?: number }) => { m.set(k, { v, ttl: o?.expirationTtl }); }, get: async (k: string) => m.get(k)?.v ?? null, list: async (o?: { prefix?: string }) => ({ keys: [...m.keys()].filter((k) => !o?.prefix || k.startsWith(o.prefix)).map((name) => ({ name })) }) };
  };
  it('KV に1年（31,536,000秒）で消える形で書き、書けたら 201。一覧で読める', async () => {
    const REPORTS = kv();
    expect((await handleReport(post(ok), { ...ENV, REPORTS })).status).toBe(201);
    expect([...REPORTS.m.values()][0].ttl).toBe(31_536_000);
    const list = (await (await handleReports(get('t0ken'), { ...ENV, REPORTS })).json()).reports;
    expect(list.map((r: { text: string }) => r.text)).toEqual([ok.text]);
  });
  it('KV に書けなければ 503（成功と言わない）。本文をログに出さない', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a) => { logs.push(a.join(' ')); });
    const REPORTS = { ...kv(), put: async () => { throw new Error('kv down'); } };
    const r = await handleReport(post(ok), { ...ENV, REPORTS });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'storage_failed' });
    expect(logs.join('\n')).not.toContain(ok.text);
    spy.mockRestore();
  });
  it('KV が読めなければ一覧も 503', async () => {
    const REPORTS = { ...kv(), list: async () => { throw new Error('kv down'); } };
    expect((await handleReports(get('t0ken'), { ...ENV, REPORTS })).status).toBe(503);
  });
  it('回数の制限は REPORT_LIMIT（Cloudflare）があればそれを使う。IP は鍵に使うだけで保存しない', async () => {
    const REPORTS = kv();
    const limit = vi.fn(async () => ({ success: false }));
    const r = await handleReport(post(ok, '9.9.9.9'), { ...ENV, REPORTS, REPORT_LIMIT: { limit } });
    expect(r.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: 'report:9.9.9.9' });
    expect(REPORTS.m.size).toBe(0);
  });
  it('本番の入口（worker/index.ts）：KV が無ければ /api/report も /api/reports も 503（メモリに置かない）', async () => {
    const worker = (await import('../../worker/index')).default;
    const env = { ASSETS: { fetch: async () => new Response('asset') }, REPORTS_TOKEN: 't0ken' } as never;
    const a = await worker.fetch(post(ok), env);
    expect(a.status).toBe(503);
    expect(await a.json()).toEqual({ error: 'storage_unavailable' });
    expect((await worker.fetch(get('t0ken'), env)).status).toBe(503);
  });
});
