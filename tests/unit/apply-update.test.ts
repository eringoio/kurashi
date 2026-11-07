import { describe, expect, it } from 'vitest';
import { applyVerdicts, locate, markInText, parsePositions } from '../../scripts/lib/apply-update';
import type { Verdict } from '../../src/core/update';

const v = (where: string, verdict: Verdict['verdict'] = 'changed', why: Verdict['why'] = 'ai'): Verdict => ({ where, source_id: 's', verdict, why, url: null });

describe('apply-update', () => {
  it('parsePositions finds nested values', () => {
    const src = '{ "a": [ { "b": "x\\"y" }, 2 ], "c": true }';
    const n = parsePositions(src);
    const b = n.keys!.get('a')!.items![0].keys!.get('b')!;
    expect(src.slice(b.start, b.end)).toBe('"x\\"y"');
    expect(b.value).toBe('x"y');
  });

  it('markInText changes only the status value and keeps the layout', () => {
    const src = '{\n  "id": "c1",\n  "evidence": { "source_ids": ["s"], "checked_at": "2026-11-01", "status": "verified" },\n  "fee": {\n    "evidence": {"source_ids":["s"],"checked_at":"2026-11-01","status":"ai_checked"}\n  }\n}\n';
    const r = markInText(src, ['fee', 'evidence'], v('c1.fee'))!;
    expect(r.from).toBe('ai_checked');
    expect(r.text).toBe(src.replace('"status":"ai_checked"', '"status":"needs_check"'));
    expect(markInText(src, ['evidence'], v('c1', 'unchanged', 'quote_found'))).toBeNull();
  });

  it('locate maps where to file and path', () => {
    const files = { cards: new Set(['c1']), lists: { rules: new Map([['r.one', 0]]), relations: new Map([['rel1', 3]]) } };
    expect(locate('c1', files)).toEqual({ file: 'cards/c1.json', path: ['evidence'] });
    expect(locate('c1.methods[2]', files)).toEqual({ file: 'cards/c1.json', path: ['methods', 2, 'evidence'] });
    expect(locate('c1.urgent[0]', files)).toEqual({ file: 'cards/c1.json', path: ['urgent', 'contacts', 0, 'evidence'] });
    expect(locate('r.one', files)).toEqual({ file: 'rules.json', path: ['rules', 0, 'evidence'] });
    expect(locate('rel1.day_order', files)).toEqual({ file: 'relations.json', path: ['relations', 3, 'day_order'] });
    expect(locate('nope', files)).toBeNull();
  });

  it('applyVerdicts writes each touched file once and never sets verified', () => {
    const fs: Record<string, string> = {
      'cards/c1.json': '{"id":"c1","evidence":{"source_ids":["s"],"checked_at":"2026-11-01","status":"verified"}}',
      'rules.json': '{"rules":[{"id":"r1","evidence":{"source_ids":["s"],"checked_at":"2026-11-01","status":"draft"}}]}',
    };
    const writes: string[] = [];
    const { applied, not_found } = applyVerdicts(
      [v('c1'), v('c1', 'unclear', 'quote_missing'), v('r1'), v('gone'), v('c1', 'unclear', 'fetch_failed')],
      (f) => fs[f] ?? null, (f, s) => { writes.push(f); fs[f] = s; }, ['c1']);
    expect(applied).toEqual([{ where: 'c1', file: 'cards/c1.json', from: 'verified' }]);
    expect(not_found).toEqual(['gone']);
    expect(writes).toEqual(['cards/c1.json']);
    expect(JSON.parse(fs['cards/c1.json']).evidence.status).toBe('needs_check');
    expect(JSON.parse(fs['rules.json']).rules[0].evidence.status).toBe('draft');
  });
});

describe('apply-update on the real data', () => {
  it('every evidence location resolves to a status in its file', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { loadData } = await import('../../src/core/data');
    const { collectEvidence } = await import('../../src/core/quotes');
    const dir = join(__dirname, '../../data');
    const read = (f: string) => readFileSync(join(dir, f), 'utf8');
    const lists: Record<string, Map<string, number>> = {};
    for (const l of ['rules', 'relations', 'objects', 'events']) lists[l] = new Map((JSON.parse(read(`${l}.json`))[l] as { id: string }[]).map((x, i) => [x.id, i]));
    const files = { cards: new Set(readdirSync(join(dir, 'cards')).map((f) => f.replace(/\.json$/, ''))), lists };
    const missing = collectEvidence(loadData()).filter(({ where, e }) => {
      const loc = locate(where, files);
      if (!loc) return true;
      const r = markInText(read(loc.file), loc.path, { where, source_id: 's', verdict: 'changed', why: 'ai', url: null });
      return e.status === 'verified' || e.status === 'ai_checked' ? r === null : false;
    }).map((x) => x.where);
    expect(missing).toEqual([]);
  });
});
