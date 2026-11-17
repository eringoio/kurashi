/* 更新情報（data/updates.json）と、確認の中身の言い方（2026-11-14） */
import { describe, it, expect } from 'vitest';
import { UPDATES, parseUpdates, visibleUpdates } from '../../src/core/updates';
import { provenance, statusKey } from '../../src/core/trust';
import { DATA } from '../../src/core/data';
import strings from '../../data/ui/strings.json';

describe('更新情報', () => {
  it('データが型を通り、id が重ならず、リンク先がある', () => {
    const all = UPDATES();
    expect(new Set(all.map((u) => u.id)).size).toBe(all.length);
    const d = DATA();
    for (const u of all) {
      if (u.card_id) expect(d.cards.some((c) => c.id === u.card_id), u.id).toBe(true);
      if (u.event_id) expect(d.events.some((e) => e.id === u.event_id), u.id).toBe(true);
      for (const lv of ['ja', 'ja_easy', 'en']) expect(u.title[lv], u.id + ' ' + lv).toBeTruthy();
    }
  });
  it('本番は承認したものだけ。新しい順', () => {
    const all = parseUpdates({ updates: [
      { id: 'a', date: '2026-11-10', type: 'added', status: 'approved', title: { ja: 'a' } },
      { id: 'b', date: '2026-11-12', type: 'corrected', status: 'pending', title: { ja: 'b' } },
      { id: 'c', date: '2026-11-11', type: 'updated', status: 'approved', title: { ja: 'c' } },
    ] });
    expect(visibleUpdates(all, false).map((u) => u.id)).toEqual(['c', 'a']);
    expect(visibleUpdates(all, true).map((u) => u.id)).toEqual(['b', 'c', 'a']);
    expect(() => parseUpdates({ updates: [{ id: 'x', date: '2026-11-10', type: 'fixed', status: 'approved', title: { ja: 'x' } }] })).toThrow();
  });
});

describe('確認の中身の言い方', () => {
  const e = (status: string, verified_by?: string, source_ids: string[] = ['s']) => ({ status, verified_by, source_ids }) as Parameters<typeof provenance>[0];
  it('まとめて照合したもの・経験にもとづくものを分ける（開発用の文でも、公開用の短い形でも）', () => {
    expect(statusKey(e('verified', 'author 2026-11-08（作者の一括承認の指示。確認は機械の照合で、人は1件ずつ見ていない）'))).toBe('src.prov.bulk');
    expect(statusKey(e('verified', 'author 2026-11-08 (bulk)'))).toBe('src.prov.bulk');
    expect(statusKey(e('verified', 'author 2026-11-07（author-2026-11-07。作者の経験で確認）'))).toBe('src.prov.experience');
    expect(statusKey(e('verified', 'author 2026-11-07 (experience)'))).toBe('src.prov.experience');
    expect(statusKey(e('verified', 'author', ['author-2026-11-07']))).toBe('src.prov.experience');
    expect(statusKey(e('verified', 'author 2026-11-07'))).toBe('src.status.verified');
    expect(statusKey(e('needs_check', '一括承認'))).toBe('src.status.needs_check');
    expect(statusKey(e('ai_checked'))).toBe('src.status.ai_checked');
  });
  it('画面の文は「作者が確かめた」と言わない。AI の照合は保証でないと書く', () => {
    const s = strings as unknown as Record<string, Record<string, string>>;
    for (const k of ['src.status.verified', 'src.prov.bulk', 'trust.human']) for (const lv of ['ja', 'ja_easy', 'en']) expect(s[k][lv], k).not.toMatch(/作者|author/i);
    expect(s['src.status.ai_checked'].en).toMatch(/not a guarantee/);
    expect(s['src.status.ai_checked'].ja).toContain('保証');
  });
});
