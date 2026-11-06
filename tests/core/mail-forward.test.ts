/* 郵便の転送（作者の決定 2026-11-06 D-5）：ほかの市から・市内の引っ越しで出す。国外からは前の日本の住所が無いので出さない */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';

const data = loadData();
const TODAY = '2026-11-04';
const ev = (id: string) => { const e = data.events.find((x) => x.id === id)!; return id === 'E-move' ? { ...e, questions: [], facts: [] } : e; };
const state = (event: string, answers: Record<string, unknown>) =>
  run(data, { answers: answers as never, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev(event) }).cards.find((c) => c.card.id === 'mail-forward')!.state;

describe('郵便の転送', () => {
  it('ほかの市から：出る。国外から：対象外', () => {
    expect(state('E-move', { 'Q-origin': 'other_city' })).not.toBe('excluded');
    expect(state('E-move', { 'Q-origin': 'abroad' })).toBe('excluded');
  });
  it('市内の引っ越し：出る', () => {
    expect(state('E-move-within', { 'Q-ward-move': 'other_ward' })).not.toBe('excluded');
  });
  it('出典の引用がある（日本郵便。2026-11-06 に取得）', () => {
    const c = data.cards.find((x) => x.id === 'mail-forward')!;
    expect(c.evidence.quote).toContain('1年間、旧住所あての郵便物等を新住所に無料で転送します');
  });
});
