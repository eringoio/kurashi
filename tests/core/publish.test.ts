/* 公開と下書きの分離（SPEC 18.9・DATA_CONTRACT 5章）。data/ は公開用だけ */
import { describe, expect, it } from 'vitest';
import { DATA, DRAFTS_LOADED } from '../../src/core/data';

const DATA_FILES = import.meta.glob('../../data/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const DRAFT_FILES = import.meta.glob('../../drafts/data/*.bundle.json', { eager: true, import: 'default' }) as Record<string, Record<string, { id?: string }[]>>;

describe('公開と下書き', () => {
  it('data/ に status: draft が無い', () => {
    const bad = Object.entries(DATA_FILES).filter(([p, j]) => !p.includes('/data/ui/') && JSON.stringify(j).includes('"status":"draft"')).map(([p]) => p);
    expect(bad).toEqual([]);
  });
  it('テストと本番のふつうの読み込みでは、下書きを読まない', () => {
    expect(DRAFTS_LOADED).toBe(false);
  });
  it('下書きのIDが data/ に無い（承認前に混ざっていない）', () => {
    const live = new Set([...DATA().cards.map((c) => c.id), ...DATA().events.map((e) => e.id), ...DATA().rules.keys()]);
    const draftIds = Object.values(DRAFT_FILES).flatMap((b) => ['cards', 'events', 'rules'].flatMap((k) => (b[k] ?? []).map((x) => x.id)));
    expect(draftIds.filter((id) => id && live.has(id))).toEqual([]);
  });
});
