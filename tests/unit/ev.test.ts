/* 使われ方の数（13.4）：決まった項目だけ残す・IP を残さない・送らない設定を守る */
import { describe, expect, it, beforeEach } from 'vitest';
import { clearEvMemory, cleanError, handleEv, handleUsage, parseEv } from '../../worker/ev';
import { browserOptOut, initTelemetry, routeOf, setSender, track } from '../../src/ui/telemetry';

const post = (body: unknown, headers: Record<string, string> = {}) => new Request('http://x/api/ev', { method: 'POST', body: JSON.stringify(body), headers });

describe('/api/ev', () => {
  beforeEach(() => clearEvMemory());
  it('ほかの項目は捨て、形の違う値は空にする', () => {
    const e = parseEv({ k: 'view', p: '/c/kokuho', f: '/move', l: 'ja', w: 's', b: '2026-11-07.abc', name: 'Taro', ip: '1.2.3.4', x: 'a b c' });
    expect(e).toEqual({ k: 'view', p: '/c/kokuho', f: '/move', l: 'ja', w: 's', b: '2026-11-07.abc', x: '', y: '' });
    expect(parseEv({ k: 'view', p: '/move?origin=abroad' })).toBe('path');
    expect(parseEv({ k: 'login', p: '/' })).toBe('kind');
  });
  it('エラーの文から数字と引用の中身を消す', () => {
    expect(cleanError('Cannot read "山田" at 2026-11-07 line 42')).toBe('Cannot read "..." at #-#-# line #');
  });
  it('IP を残さず、作者はトークンで集計を読む', async () => {
    const written: unknown[] = [];
    const env = { EV: { writeDataPoint: (p: unknown) => written.push(p) } };
    const r = await handleEv(post({ k: 'view', p: '/gomi' }, { 'cf-connecting-ip': '9.9.9.9' }), env);
    expect(r.status).toBe(204);
    expect(JSON.stringify(written)).not.toContain('9.9.9.9');
    await handleEv(post({ k: 'view', p: '/gomi', f: '/' }), {});
    await handleEv(post({ k: 'helpful', p: '/c/kokuho', x: 'kokuho', y: 'no' }), {});
    expect((await handleUsage(new Request('http://x/api/usage'), { REPORTS_TOKEN: 't' })).status).toBe(401);
    const u = await (await handleUsage(new Request('http://x/api/usage', { headers: { authorization: 'Bearer t' } }), { REPORTS_TOKEN: 't' })).json();
    expect(u.pairs).toEqual([['/ → /gomi', 1]]);
    expect(u.helpful).toEqual([['kokuho', 0, 1]]);
  });
});

describe('telemetry（画面の側）', () => {
  it('道は id だけ。形が違えば送らない形にする', () => {
    expect(routeOf('/e/E-job/c/job-kokuho')).toBe('/e/e-job/c/job-kokuho');
    expect(routeOf('/move?x=1')).toBe('/move');
    expect(routeOf('/住所')).toBe('/?');
  });
  it('「送らない」とブラウザの「追跡しない」を守る', () => {
    const sent: string[] = [];
    setSender((b) => sent.push(b));
    (globalThis as { location?: unknown }).location ??= { pathname: '/' };
    initTelemetry({ allowed: () => false, level: () => 'ja' });
    track('view', { p: '/gomi' }, true);
    expect(sent).toHaveLength(0);
    initTelemetry({ allowed: () => true, level: () => 'ja' });
    track('view', { p: '/gomi' }, true);
    expect(sent).toHaveLength(1);
    expect(browserOptOut({ globalPrivacyControl: true })).toBe(true);
    expect(browserOptOut({ doNotTrack: '1' })).toBe(true);
    expect(browserOptOut({})).toBe(false);
  });
});
