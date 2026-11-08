/* 財布の紛失の全体の画面（SPEC 6A.17 v0.5.28）：段・止めない・物ごとの停止・要確認。画面は tests/e2e/drafts/lost-wallet.spec.ts */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import type { PlanRecord } from '../../src/core/entry';
import { nowStep } from '../../src/core/now';
import { overviewReady, partViews, phaseViews, prereqFrom, rollup, STATUS_OF, trackOf, urgentOpen } from '../../src/core/overview';
import type { Value } from '../../src/core/schema';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-lost-wallet')!;
const TODAY = '2026-11-08';
const out = (answers: Record<string, Value>, plan: Record<string, PlanRecord> = {}) =>
  run(data, { answers, objects: {}, plan, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;

describe('段', () => {
  it('イベントのカードはすべて、ちょうど1つの段に入る。見つかったときの段はいつも出す（pin）', () => {
    const ids = ev.phases!.flatMap((p) => p.card_ids);
    expect([...ids].sort()).toEqual([...ev.card_ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ev.phases!.find((p) => p.pin)!.card_ids).toEqual(['lost-found-later']);
  });
  it('中身に答えたら全体の画面。答える前は質問', () => {
    expect(overviewReady(ev, {})).toBe(false);
    expect(overviewReady(ev, { 'Q-lost-items': ['cash_card'] })).toBe(true);
  });
  it('在留カード＋キャッシュカード：4つの段。再交付は前提（警察）がまだでも段に出て、前に要ることを示す', () => {
    const o = out({ 'Q-lost-items': ['zairyu_card', 'cash_card'] });
    expect(phaseViews(ev, o).map((p) => p.id)).toEqual(['now', 'search', 'reissue', 'found']);
    const z = view(o, 'lost-zairyu-reissue');
    expect(phaseViews(ev, o).find((p) => p.id === 'reissue')!.cards).toContain(z);
    expect(prereqFrom(z)).toContain('lost-police-report-zairyu');
  });
});

describe('止めない', () => {
  it('1つずつの画面でも、カードの停止は残りの質問より先にしない（urgentFirst: false）。既定は今までどおり', () => {
    const o = out({ 'Q-lost-items': ['cash_card'] });
    expect(nowStep(o, TODAY).kind).toBe('urgent');
    expect(nowStep(o, TODAY, { urgentFirst: false })).toMatchObject({ kind: 'upfront' });
    expect(urgentOpen(o).map((c) => c.card.id)).toEqual(['lost-card-stop']);
  });
  it('該当しない・完了にした行動は目立たせない', () => {
    const o = out({ 'Q-lost-items': ['cash_card'] }, { 'lost-card-stop': { card_id: 'lost-card-stop', status: 'dismissed' } });
    expect(urgentOpen(o)).toEqual([]);
    expect(trackOf(view(o, 'lost-card-stop'))).toBe('na');
  });
});

describe('カードの停止：物ごとに記録する', () => {
  it('選んだ物だけ。わからないは要確認（U）で、対象・対象外にしない', () => {
    const one = out({ 'Q-lost-items': ['credit_card'] });
    expect(partViews(view(one, 'lost-card-stop'), one.facts).map((p) => [p.id, p.applies])).toEqual([['credit_card', 'T']]);
    const unk = out({ 'Q-lost-items': ['unknown'] });
    expect(partViews(view(unk, 'lost-card-stop'), unk.facts).map((p) => p.applies)).toEqual(['U', 'U']);
  });
  it('1枚止めただけでは完了にしない。全部が完了か該当しないで完了', () => {
    expect(rollup([{ track: 'done' }, { track: 'todo' }])).toBe('doing');
    expect(rollup([{ track: 'done' }, { track: 'na' }])).toBe('done');
    expect(rollup([{ track: 'na' }, { track: 'na' }])).toBe('na');
    expect(rollup([{ track: 'todo' }, { track: 'todo' }])).toBe('todo');
  });
  it('保存した物の状態を読む。手続きの状態は保存の status のまま（対応中＝preparing）', () => {
    const plan = { 'lost-card-stop': { card_id: 'lost-card-stop', status: STATUS_OF.doing, parts: { cash_card: 'done' as const } } };
    const o = out({ 'Q-lost-items': ['cash_card', 'credit_card'] }, plan);
    const c = view(o, 'lost-card-stop');
    expect(partViews(c, o.facts).map((p) => p.track)).toEqual(['done', 'todo']);
    expect(trackOf(c)).toBe('doing');
    expect(c.section).not.toBe('done');
  });
});
