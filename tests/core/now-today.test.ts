/* 今日を行く日に決めたとき（K-35・K-41）：「いま」は今日の予定を出し、/today と同じ項目を出す */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { agendaToday, nowStep } from '../../src/core/now';
import { visitsToday } from '../../src/core/accompany';
import { visitGroup } from '../../src/core/visit';
import type { PlanRecord } from '../../src/core/entry';

const data = loadData();
const TODAY = '2026-11-05';
const A1 = { 'Q-origin': 'abroad', 'Q-role': 'student', 'Q-age-band': '20_59', 'Q-zairyu-back-address': 'no', 'Q-moved-in': 'yes', 'Q-insurance': 'none', 'Q-pension-type': 'none', 'Q-bank-account': false };
const A1_OBJ = { 'zairyu-card': true, passport: true, 'room-key': true, 'student-id': true };
// 画面（useGuide）と同じく、引っ越しのイベントのカードだけを判定する
const move = data.events.find((e) => e.id === 'E-move')!;
const out = (plan: Record<string, PlanRecord> = {}) => run(data, { answers: A1, objects: A1_OBJ, plan, createdOn: TODAY, today: TODAY, event: { ...move, questions: [], facts: [] } });
const ids = (cs: { card: { id: string } }[]) => cs.map((c) => c.card.id).sort();

describe('区役所も銀行も今日に決めたら、いまは「今日は行く日です」', () => {
  // 画面と同じ順：区役所のまとまりの日を決め、次に銀行の日を決める
  const o0 = out();
  const ward = ids(visitGroup(o0.cards, o0.cards.find((x) => x.card.id === 'nagoya-tennyu-juukyochi')!));
  const plan: Record<string, PlanRecord> = Object.fromEntries(ward.map((id) => [id, { card_id: id, status: 'todo', planned_on: TODAY }]));
  const o1 = out(plan);
  const bankGroup = ids(visitGroup(o1.cards, o1.cards.find((x) => x.card.id === 'bank-account-open')!));
  for (const id of bankGroup) plan[id] = { card_id: id, status: 'todo', planned_on: TODAY };
  const o = out(plan);
  const all4 = [...ward, ...bankGroup].sort();

  it('区役所の3つと銀行の1つ', () => {
    expect(all4).toEqual(['bank-account-open', 'kokumin-nenkin-kanyu', 'nagoya-kokuho-kanyu', 'nagoya-tennyu-juukyochi']);
  });
  it('nowStep は today で、4つをふくむ', () => {
    const s = nowStep(o, TODAY);
    expect(s.kind).toBe('today');
    expect(s.kind === 'today' && ids(s.views)).toEqual(all4);
  });
  it('今日の予定（agendaToday）に銀行も入る', () => {
    expect(ids(agendaToday(o, TODAY))).toEqual(all4);
  });
  it('付き添いは区役所と銀行の2つ', () => {
    expect(visitsToday(o, data.objects, A1_OBJ, 'abroad', TODAY).map((v) => v.place).sort()).toEqual(['bank', 'ward_office']);
  });
  it('区役所だけ今日に決めて、銀行の日が未定でも、いまは today（「日を決める」の後ろに隠さない）', () => {
    const s = nowStep(o1, TODAY);
    expect(s.kind).toBe('today');
    expect(s.kind === 'today' && ids(s.views)).toEqual(ward);
  });
  it('明日に決めたときは、今日の予定ではなく until', () => {
    const later = Object.fromEntries(all4.map((id) => [id, { card_id: id, status: 'todo' as const, planned_on: '2026-11-06' }]));
    const s = nowStep(out(later), TODAY);
    expect(s.kind).not.toBe('today');
    expect(agendaToday(out(later), TODAY)).toEqual([]);
  });
});
