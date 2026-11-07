/* /api/read-document（6A.9・13.3）：同意が無ければ送らない、キーが無ければ見本、キーをログに出さない、一覧の外の候補を捨てる */
import { describe, expect, it, vi } from 'vitest';
import { cleanCandidates, DOCUMENTS, loadDocuments, SAMPLE_RESULT } from '../../src/core/documents';
import { loadData } from '../../src/core/data';
import { handleReadDocument, instruction, MAX_BASE64, type Reader } from '../../worker/readDocument';

const KEY = 'test-dummy-key-not-real';
const req = (body: unknown, init: RequestInit = {}) => new Request('http://x/api/read-document', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init,
});
const ok = { consent: true, media_type: 'image/jpeg', data: 'AAAA' };

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
    const r = await handleReadDocument(req(ok), { ANTHROPIC_API_KEY: KEY }, read);
    expect(await r.json()).toEqual({ sample: false, candidates: [{ id: 'nenkin-oshirase', confidence: 0.8 }] });
    expect(read.mock.calls[0][1]).toBe('claude-haiku-5-5');
    await handleReadDocument(req(ok), { ANTHROPIC_API_KEY: KEY, READ_MODEL: 'claude-opus-5-5' }, read);
    expect(read.mock.calls[1][1]).toBe('claude-opus-5-5');
  });
  it('失敗しても、キー・画像・結果をログに出さない', async () => {
    const logs: string[] = [];
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a.join(' ')); }));
    const read: Reader = async () => { throw new Error('boom ' + KEY); };
    const r = await handleReadDocument(req({ ...ok, data: 'SECRETIMAGEDATA' }), { ANTHROPIC_API_KEY: KEY }, read);
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
