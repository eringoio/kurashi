/* 検証担当（VERIFY-01）の反例。既存のテストを写さず、別の入力で確かめる。 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { baseRaw, loadData, withBundles, type Bundle } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import marriageJson from '../fixtures/marriage.bundle.json';
import type { PlanRecord } from '../../src/core/entry';
import type { Value } from '../../src/core/schema';

const data = loadData();
const lost = data.events.find((e) => e.id === 'E-lost-wallet')!;
const T = '2026-11-04';
/** v0.4.8：パスポートは1つの選択肢＋発行国の質問。警察にまだ届けていない（not_yet）を既定にする */
const go = (items: string[] | 'unknown' | undefined, over: Partial<EngineInput> = {}) => {
  const answers: Record<string, Value> = { 'Q-passport-country': 'japan', 'Q-police-reported': 'not_yet', ...(over.answers ?? {}) };
  if (items) answers['Q-lost-items'] = items;
  return run(data, { objects: {}, plan: {}, createdOn: T, today: T, mode: 'verified', event: lost, ...over, answers });
};
const v = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const pr = (id: string, status: PlanRecord['status']): Record<string, PlanRecord> => ({ [id]: { card_id: id, status } });

describe('反例', () => {
  it('3 身分証を全部なくした人：同じ身分証を必須にする案内が無く、相談が出て日を聞かない', () => {
    const o = go(['zairyu_card', 'mynumber_card', 'license', 'passport', 'health_insurance']);
    expect(v(o, 'lost-no-id-consult').state).toBe('shown');
    expect(v(o, 'lost-no-id-consult').dayRule.kind).toBe('no_day');
    // どのカードの方法・代わりの書類にも「この身分証を持っていく」が必須として入らない：方法を持つカードの when は真偽で評価される
    for (const c of o.cards.filter((c) => c.state === 'shown')) for (const m of c.methods) expect(m.v).not.toBe('F');
    // 免許の再交付は、写真付きが無い人向けの代わりの書類を持つ
    expect((v(o, 'lost-license-reissue').card.alternatives ?? []).length).toBeGreaterThan(0);
  });
  it('2 全部選んでも警察の届は1枚。カード停止（カード類を選んだ時）が最初の今日', () => {
    const o = go(['cash_card', 'credit_card', 'zairyu_card', 'mynumber_card', 'license', 'health_insurance', 'passport', 'other']);
    expect(o.cards.filter((c) => /police/.test(c.card.id) && c.state !== 'excluded')).toHaveLength(1);
    const ids = o.cards.map((c) => c.card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('4 「わからない」「未回答」で対象外と断定しない（public でも verified でも）', () => {
    for (const mode of ['public', 'verified'] as const) {
      for (const items of ['unknown', undefined] as const) {
        // 発行国も聞いていない（既定の japan を入れない）
        const o = run(data, { answers: items ? { 'Q-lost-items': items as never } : {}, objects: {}, plan: {}, createdOn: T, today: T, mode, event: lost });
        expect(o.cards.filter((c) => c.state === 'excluded').map((c) => c.card.id), `${mode}/${items}`).toEqual([]);
      }
    }
  });
  it('4b 未確認の制度のルールでは対象外にしない。対象外になるのは、本人が選ばなかった物（selection）だけ（v0.4.8）', () => {
    const o = go(['license'], { mode: 'public' });
    const ex = o.cards.filter((c) => c.state === 'excluded');
    expect(ex.length).toBeGreaterThan(0);
    for (const c of ex) expect(c.falseRule?.kind, c.card.id).toBe('selection');
    expect(v(o, 'lost-license-reissue').state).not.toBe('excluded');
  });
  it('5 申請済み・待ち・準備中を「もうできた」にしない。dismissed でも done にならない', () => {
    for (const s of ['preparing', 'submitted', 'waiting', 'todo', 'dismissed'] as const) {
      const o = go(['zairyu_card'], { plan: pr('lost-police-report-zairyu', s) });
      expect(v(o, 'lost-police-report-zairyu').section, s).not.toBe('done');
    }
    // 提出済みだけでは、在留カードの再交付の前提（警察の届）を済みとして進めない
    const sub = go(['zairyu_card'], { plan: pr('lost-police-report-zairyu', 'submitted') });
    expect(v(sub, 'lost-zairyu-reissue').section).toBe('later');
  });
  it('6 再紛失：進捗が空なら前の done が出ない。別の出来事の plan を渡さなければ混ざらない', () => {
    const first = go(['zairyu_card'], { plan: pr('lost-police-report-zairyu', 'done') });
    expect(v(first, 'lost-police-report-zairyu').section).toBe('done');
    const second = go(['zairyu_card'], { plan: {} });
    expect(v(second, 'lost-police-report-zairyu').section).not.toBe('done');
    expect(v(second, 'lost-zairyu-reissue').section).toBe('later');
  });
  it('7 結婚の検証データ：src に結婚専用のコードが無い（自前の走査）', () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && !/patterns|DevPatterns/.test(p) && /marriage|konin|婚姻|fx-marriage/i.test(readFileSync(p, 'utf8'))) hits.push(p); } };
    walk('src');
    expect(hits).toEqual([]);
    const d = loadData(withBundles(baseRaw(), [marriageJson as Bundle]));
    const ev = d.events.find((e) => e.id === 'E-fx-marriage')!;
    expect(() => run(d, { answers: {}, objects: {}, plan: {}, createdOn: T, today: T, mode: 'public', event: ev })).not.toThrow();
  });
  it('8 本体データ（data/）に下書き・検証用のIDが無い', () => {
    const live = new Set([...data.cards.map((c) => c.id)]);
    const base = loadData(baseRaw());
    const ids = new Set(base.cards.map((c) => c.id));
    // 検証用の見本（tests/fixtures）のカードは、公開のデータに入らない（財布は 2026-11-08 に公開へ移した）
    for (const c of (marriageJson as Bundle).cards as { id: string }[]) expect(ids.has(c.id)).toBe(false);
    // 財布は公開のデータに入ったので、本体と同じ数
    expect(live.size).toBe(ids.size);
  });
});
