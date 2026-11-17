/* 報告の守りと受信箱（2026-11-14）：ほかのサイトからの送信を断る・種類・新しい順の1ページずつ・状態 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearMemory, handleReport, handleReports, memoryKv, parseReport } from '../../worker/report';

const ok = { path: '/c/nagoya-tennyu-juukyochi', scene: 'ward-office', text: '持ち物がちがいました', level: 'ja', at: '2026-11-06T10:00:00+09:00' };
const post = (body: unknown, ip = '1.2.3.4') => new Request('http://x/api/report', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
const get = (token?: string) => new Request('http://x/api/reports', { headers: token ? { authorization: 'Bearer ' + token } : {} });
const ENV = { REPORTS_TOKEN: 't0ken', ADMIN_AUTH: 'token' };

beforeEach(() => clearMemory());

describe('報告の守り', () => {
  const raw = (headers: Record<string, string>, body = JSON.stringify(ok)) => new Request('https://kurashi.eringo.io/api/report', { method: 'POST', headers: { 'cf-connecting-ip': '5.5.5.5', ...headers }, body });
  it('ほかのサイトからの送信を断る：Content-Type が JSON でない（415）・Origin が違う（403）・cross-site（403）', async () => {
    expect((await handleReport(raw({ 'content-type': 'text/plain' }), ENV)).status).toBe(415);
    expect((await handleReport(raw({ 'content-type': 'application/x-www-form-urlencoded' }), ENV)).status).toBe(415);
    expect((await handleReport(raw({ 'content-type': 'application/json', origin: 'https://evil.example' }), ENV)).status).toBe(403);
    expect((await handleReport(raw({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }), ENV)).status).toBe(403);
    expect((await (await handleReports(get('t0ken'), ENV)).json()).reports).toHaveLength(0);
    expect((await handleReport(raw({ 'content-type': 'application/json; charset=utf-8', origin: 'https://kurashi.eringo.io', 'sec-fetch-site': 'same-origin' }), ENV)).status).toBe(201);
    expect((await (await handleReports(get('t0ken'), ENV)).json()).reports).toHaveLength(1);
  });
  it('大きすぎる本文は 413', async () => {
    expect((await handleReport(raw({ 'content-type': 'application/json' }, JSON.stringify({ ...ok, pad: 'x'.repeat(20_000) })), ENV)).status).toBe(413);
  });
  it('種類・手続きの id・版の印を受け取る。種類を選べば文は無くてよい（「そのほか」は要る）。答えなどは捨てる', () => {
    expect(parseReport({ ...ok, kind: 'outdated', card: 'zairyu-koshin', build: '2026-11-14.a5df3d3', nationality: 'x', answers: { a: 1 } })).toEqual({ ...ok, kind: 'outdated', card: 'zairyu-koshin', build: '2026-11-14.a5df3d3' });
    expect(parseReport({ ...ok, text: '', kind: 'link' })).toMatchObject({ kind: 'link', text: '' });
    expect(parseReport({ ...ok, text: '', kind: 'other' })).toBe('text');
    expect(parseReport({ ...ok, kind: 'spam' })).toBe('kind');
    expect(parseReport({ ...ok, card: 'a b' })).toBe('card');
    expect(parseReport({ ...ok, build: 'x'.repeat(41) })).toBe('build');
  });
});

describe('受信箱', () => {
  it('新しい順で、1ページずつ。1,000件を超えても新しいものが先に出る。前の形の報告は後ろに続く', async () => {
    await memoryKv.put('report:20261101000000000-aaaaaa', JSON.stringify({ id: '20261101000000000-aaaaaa', ...ok, received_at: '2026-11-01T00:00:00.000Z' }));
    await memoryKv.put('report:20261102000000000-bbbbbb', JSON.stringify({ id: '20261102000000000-bbbbbb', ...ok, received_at: '2026-11-02T00:00:00.000Z' }));
    const t = Date.parse('2026-11-14T00:00:00Z');
    for (let i = 0; i < 1005; i++) expect((await handleReport(post({ ...ok, text: 'n' + i }, 'ip' + i), ENV, t + i * 1000)).status).toBe(201);
    type Page = { reports: { text: string; received_at: string; status: string }[]; next: string | null };
    const page = async (cursor?: string, limit = '50'): Promise<Page> => (await handleReports(new Request('http://x/api/reports', { headers: { authorization: 'Bearer t0ken', 'x-reports-limit': limit, ...(cursor ? { 'x-reports-cursor': cursor } : {}) } }), ENV)).json();
    const p1 = await page();
    expect(p1.reports).toHaveLength(50);
    expect(p1.reports[0].text).toBe('n1004');
    expect(p1.reports[49].text).toBe('n955');
    expect(p1.reports[0].status).toBe('new');
    const seen = p1.reports.map((r) => r.text);
    let next = p1.next;
    let last = p1;
    while (next) { last = await page(next, '100'); seen.push(...last.reports.map((r) => r.text)); next = last.next; }
    expect(seen).toHaveLength(1007);
    expect(new Set(seen.slice(0, 1005)).size).toBe(1005);
    expect(last.reports.slice(-2).map((r) => r.received_at)).toEqual(['2026-11-02T00:00:00.000Z', '2026-11-01T00:00:00.000Z']);
    expect((await handleReports(new Request('http://x/api/reports', { headers: { authorization: 'Bearer t0ken', 'x-reports-cursor': 'bad cursor' } }), ENV)).status).toBe(400);
  });
  it('状態を変えられるのは作者だけ。決まった状態だけ', async () => {
    await handleReport(post(ok), ENV);
    const id = (await (await handleReports(get('t0ken'), ENV)).json()).reports[0].id as string;
    const patch = (body: unknown, token = 't0ken') => new Request('http://x/api/reports', { method: 'PATCH', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await handleReports(patch({ id, status: 'fixed' }, 'nope'), ENV)).status).toBe(401);
    expect((await handleReports(patch({ id, status: 'deleted' }), ENV)).status).toBe(400);
    expect((await handleReports(patch({ id: '../x', status: 'fixed' }), ENV)).status).toBe(400);
    expect((await handleReports(patch({ id: '0000000000000-zzzzzz', status: 'fixed' }), ENV)).status).toBe(404);
    expect((await handleReports(patch({ id, status: 'reviewing' }), ENV)).status).toBe(200);
    expect((await (await handleReports(get('t0ken'), ENV)).json()).reports[0]).toMatchObject({ id, status: 'reviewing', text: ok.text });
    expect((await handleReports(new Request('http://x/api/reports', { method: 'DELETE', headers: { authorization: 'Bearer t0ken' } }), ENV)).status).toBe(405);
  });
});
