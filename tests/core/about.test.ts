/* あなたについて（2026-11-07）：国籍 → 在留資格（日本以外のとき）→ 立場 → 年齢。一度答えると、ほかの入口では聞かない */
import { describe, expect, it } from 'vitest';
import { aboutNext, wantsAbout } from '../../src/core/about';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';

const data = loadData();
const TODAY = '2026-11-07';
const ev = (id: string) => data.events.find((e) => e.id === id)!;
const go = (id: string, answers: Record<string, unknown>) => run(data, { answers: answers as never, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev(id) });
const next = (a: Record<string, unknown>) => aboutNext(data.questions, a as never)?.id;

describe('あなたについて', () => {
  it('国籍 → 在留資格（日本以外だけ）→ 立場 → 年齢の順', () => {
    expect(next({})).toBe('Q-nationality');
    expect(next({ 'Q-nationality': 'foreign' })).toBe('Q-zairyu-status');
    expect(next({ 'Q-nationality': 'japanese' })).toBe('Q-role');
    expect(next({ 'Q-nationality': 'japanese', 'Q-role': 'student' })).toBe('Q-age-band');
    expect(next({ 'Q-nationality': 'japanese', 'Q-role': 'student', 'Q-age-band': '20_59' })).toBeUndefined();
  });
  it('国籍を聞く入口でだけ、まとめて聞く。答えずに進んだら聞かない', () => {
    expect(wantsAbout(go('E-job', {}).upfront, false)).toBe(true);
    expect(wantsAbout(go('E-job', {}).upfront, true)).toBe(false);
    expect(wantsAbout(go('E-gomi', {}).upfront, false)).toBe(false);
  });
  it('一度答えると、仕事・在留更新では国籍と在留資格を聞かない', () => {
    const a = { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student', 'Q-role': 'student', 'Q-age-band': '20_59' };
    for (const id of ['E-job', 'E-stay-renew']) {
      const up = go(id, a).upfront.map((q) => q.id);
      expect(up).not.toContain('Q-nationality');
      expect(up).not.toContain('Q-zairyu-status');
    }
  });
  it('日本国籍なら、住民登録の形を聞かない（同じ事実。implied）', () => {
    const move = { ...ev('E-move'), questions: [], facts: [] };
    const o = run(data, { answers: { 'Q-origin': 'abroad', 'Q-nationality': 'japanese' }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: move });
    expect(o.facts.get('residence_basis')).toBe('japanese');
    expect(o.upfront.map((q) => q.id)).not.toContain('Q-residence-basis');
    expect(o.scope).not.toBe('F');
  });
});

describe('あなたについて（始めたら最後まで）', () => {
  it('国籍と在留資格だけ要る入口でも、答え始めたら立場と年齢まで聞く', () => {
    const a = { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student' };
    expect(wantsAbout(go('E-job', a).upfront, false, data.questions, a as never)).toBe(true);
    expect(next(a)).toBe('Q-role');
  });
});
