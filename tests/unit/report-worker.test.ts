/* 報告ボタンの Worker（作者の指示 2026-11-06 A-9） */
import { beforeEach, describe, expect, it } from 'vitest';
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
