import { describe, expect, it } from 'vitest';
import type { EvidenceAt } from '../../src/core/quotes';
import { acceptAi, compareIndex, judgeByQuotes, prBody, type IndexEntry, type SourceIndex, type Verdict } from '../../src/core/update';

const ent = (id: string, sha: string | null, result = 'ok'): IndexEntry => ({ source_id: id, url: `https://example.test/${id}`, fetched_at: '2026-11-01', result, sha256: sha, http_status: result === 'ok' ? 200 : 403 });
const ev = (where: string, source_ids: string[], quote?: string): EvidenceAt => ({
  where, kind: 'card_text',
  e: { source_ids, checked_at: '2026-11-01', status: 'needs_check', quote } as EvidenceAt['e'],
});

describe('compareIndex', () => {
  it('changed / unchanged / failed / added', () => {
    const prev: SourceIndex = { a: ent('a', 'h1'), b: ent('b', 'h2'), c: ent('c', 'h3') };
    const next: SourceIndex = { a: ent('a', 'h1'), b: ent('b', 'h9'), c: ent('c', null, 'http_403'), d: ent('d', 'h4') };
    expect(compareIndex(prev, next)).toEqual({ changed: ['b'], unchanged: ['a'], failed: ['c'], added: ['d'] });
  });
});

describe('judgeByQuotes', () => {
  const urlOf = (id: string) => `https://example.test/${id}`;
  const bodies: Record<string, string | null> = { s1: '保険年金課 （2階）で 受け付けます', s2: null };
  const body = (id: string) => bodies[id] ?? null;

  it('quote found -> unchanged (whitespace-insensitive)', () => {
    const [v] = judgeByQuotes([ev('x', ['s1'], '保険年金課（2階）')], ['s1'], body, urlOf);
    expect(v).toMatchObject({ verdict: 'unchanged', why: 'quote_found', source_id: 's1', url: urlOf('s1') });
  });
  it('quote missing -> unclear/quote_missing', () => {
    const [v] = judgeByQuotes([ev('x', ['s1'], '区民課')], ['s1'], body, urlOf);
    expect(v).toMatchObject({ verdict: 'unclear', why: 'quote_missing' });
  });
  it('no quote -> unclear/no_quote', () => {
    const [v] = judgeByQuotes([ev('x', ['s1'])], ['s1'], body, urlOf);
    expect(v).toMatchObject({ verdict: 'unclear', why: 'no_quote' });
  });
  it('body null -> unclear/fetch_failed', () => {
    const [v] = judgeByQuotes([ev('x', ['s2'], 'q')], ['s2'], body, urlOf);
    expect(v).toMatchObject({ verdict: 'unclear', why: 'fetch_failed' });
  });
  it('only listed source ids', () => {
    const out = judgeByQuotes([ev('x', ['s1', 's3'], '2階')], ['s1'], body, urlOf);
    expect(out.map((v) => v.source_id)).toEqual(['s1']);
  });
  it('never sets verified', () => {
    const out = judgeByQuotes([ev('x', ['s1'], '2階'), ev('y', ['s1'], 'zz')], ['s1'], body, urlOf);
    for (const v of out) expect(JSON.stringify(v)).not.toContain('verified');
  });
});

describe('acceptAi', () => {
  const base: Verdict = { where: 'x', source_id: 's1', verdict: 'unclear', why: 'quote_missing', old_quote: '1階', url: null };
  const body = '保険年金課（2階）で受け付けます';
  it('changed with new_quote not in body -> unclear', () => {
    const v = acceptAi(base, { verdict: 'changed', new_quote: '3階', proposal: 'p' }, body);
    expect(v).toMatchObject({ verdict: 'unclear', why: 'ai' });
    expect(v.new_quote).toBeUndefined();
  });
  it('changed with quote in body -> changed + proposal', () => {
    const v = acceptAi(base, { verdict: 'changed', new_quote: '保険年金課（2階）', proposal: '2階に直す' }, body);
    expect(v).toMatchObject({ verdict: 'changed', why: 'ai', new_quote: '保険年金課（2階）', proposal: '2階に直す' });
  });
  it('changed without new_quote -> unclear', () => {
    expect(acceptAi(base, { verdict: 'changed' }, body).verdict).toBe('unclear');
  });
  it('malformed -> input returned unchanged', () => {
    expect(acceptAi(base, { verdict: 'verified' }, body)).toBe(base);
    expect(acceptAi(base, 'nonsense', body)).toBe(base);
  });
  it('unchanged while old quote missing -> unclear', () => {
    expect(acceptAi(base, { verdict: 'unchanged' }, body)).toMatchObject({ verdict: 'unclear', why: 'ai' });
  });
  it('unchanged with old quote present -> unchanged', () => {
    expect(acceptAi({ ...base, old_quote: '2階' }, { verdict: 'unchanged' }, body).verdict).toBe('unchanged');
  });
});

describe('prBody', () => {
  const cmp = { changed: ['s1'], unchanged: ['s2'], failed: ['s3'], added: [] };
  const vs: Verdict[] = [
    { where: 'rowChanged', source_id: 's1', verdict: 'changed', why: 'ai', url: 'https://example.test/s1' },
    { where: 'rowSame', source_id: 's2', verdict: 'unchanged', why: 'quote_found', url: null },
    { where: 'rowUnclear', source_id: 's3', verdict: 'unclear', why: 'fetch_failed', url: null },
  ];
  it('lists only non-unchanged rows and the sample note', () => {
    const md = prBody('2026-11-01', cmp, vs, true);
    expect(md).toContain('rowChanged');
    expect(md).toContain('rowUnclear');
    expect(md).not.toContain('rowSame');
    expect(md).toContain('見本の実行');
    expect(md).toContain('作者が見る項目：2 件');
    expect(md).toContain('s3');
  });
  it('non-sample has no sample note and no verified status cell', () => {
    const md = prBody('2026-11-01', cmp, vs, false);
    expect(md).not.toContain('見本の実行');
    expect(md).not.toMatch(/\|\s*verified\s*\|/);
  });
});
