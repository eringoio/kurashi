/* 監査 1116：HB-6（保存された from_on が不正でも投げない）と HB-4（国外から来た第3号の理由は範囲の外） */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import type { PlanRecord } from '../../src/core/entry';
import { run, validFromOn } from '../../src/core/engine';
import type { Value } from '../../src/core/schema';

const data = loadData();
const T = '2026-11-15';
const EV = (id: string) => data.events.find((x) => x.id === id)!;
const go = (ev: string, answers: Record<string, Value>, plan: Record<string, unknown> = {}) =>
  run(data, { answers, objects: { 'zairyu-card': true }, plan: plan as Record<string, PlanRecord>, createdOn: T, today: T, mode: 'public', event: EV(ev) });
const v = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;

describe('HB-6 数え始める日（from_on）', () => {
  const move = { 'Q-origin': 'other_city', 'Q-moveout': 'paper', 'Q-nationality': 'foreign', 'Q-age-band': '20_59', 'Q-moved-in': 'yes' } as const;
  const on = (from_on: unknown, planned_on?: string) =>
    v(go('E-move', move, { 'nagoya-tennyu-todoke': { card_id: 'nagoya-tennyu-todoke', status: 'todo', from_on, planned_on } }), 'nagoya-tennyu-todoke');
  it.each(['2026-13-45', 'abc', 20261110, '20260-01-01', '2026-02-30', '2026-11-16', '2099-01-01', null, ''])('不正・未来の値 %j は投げず、期限の日を出さない', (bad) => {
    const c = on(bad);
    expect(c.deadlineOn).toBeNull();
    expect(c.lateRisk).toBe(false);
  });
  it('正しい過去の日は今までどおり（翌日が1日目。14日目は間に合う、15日目は後）', () => {
    expect(on('2026-11-10').deadlineOn).toBe('2026-11-24');
    expect(on('2026-11-10', '2026-11-24').lateRisk).toBe(false);
    expect(on('2026-11-10', '2026-11-25').lateRisk).toBe(true);
    expect(on(T).deadlineOn).toBe('2026-11-29');
  });
  it('validFromOn：今日は使える、明日は使えない', () => {
    expect(validFromOn(T, T)).toBe(true);
    expect(validFromOn('2026-11-16', T)).toBe(false);
    expect(validFromOn(undefined, T)).toBe(false);
  });
});

describe('HB-4 国外から来た第3号', () => {
  const base = { 'Q-origin': 'abroad', 'Q-age-band': '20_59', 'Q-pension-type': 'spouse_dependent', 'Q-insurance': 'employer_family' } as const;
  it('国民年金は check_at_office、理由は範囲の外（coverage）。必要・期限ありの札は出さない対象', () => {
    const c = v(go('E-move', base), 'kokumin-nenkin-kanyu');
    expect([c.state, c.cause]).toEqual(['check_at_office', 'coverage']);
    // RoadMap の unsure：check_at_office かつ cause が unknown／no_question／coverage のとき 必要・期限あり を出さない
    expect(['unknown', 'no_question', 'coverage']).toContain(c.cause);
  });
  it('第1号（none）は今までどおり unverified、わからないは unknown、国内の第3号は excluded', () => {
    expect(v(go('E-move', { ...base, 'Q-pension-type': 'none' }), 'kokumin-nenkin-kanyu').cause).toBe('unverified');
    expect(v(go('E-move', { ...base, 'Q-pension-type': 'unknown' }), 'kokumin-nenkin-kanyu').cause).toBe('unknown');
    expect(v(go('E-move', { ...base, 'Q-origin': 'other_city' }), 'kokumin-nenkin-kanyu').state).toBe('excluded');
  });
});
