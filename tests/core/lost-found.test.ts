/* 財布の紛失：「見つかった」を答えにする（G-11・O-3）。答えは Q-lost-found。手続きの記録（plan）は変えない・完了にしない。 */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import type { PlanRecord } from '../../src/core/entry';
import { foundAfter, foundEased, foundItems, trackOf } from '../../src/core/overview';
import type { Value } from '../../src/core/schema';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-lost-wallet')!;
const TODAY = '2026-11-15';
const LOST: Record<string, Value> = { 'Q-lost-items': ['cash_card', 'credit_card', 'zairyu_card', 'mynumber_card', 'passport', 'license', 'health_insurance'], 'Q-lost-place': 'outside', 'Q-passport-country': 'japan' };
const out = (answers: Record<string, Value>, plan: Record<string, PlanRecord> = {}) =>
  run(data, { answers, objects: {}, plan, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });

describe('見つかった（財布の紛失）', () => {
  it('参照の検査を通る。見つかったあとの文は全部 要確認（verified にしない）で、公式の引用か「取得できなかった」の注記がある', () => {
    expect(checkRefs(data)).toEqual([]);
    const all = [...ev.found!.items.flatMap((i) => i.after), ...ev.found!.common];
    expect(all.length).toBeGreaterThan(8);
    for (const a of all) {
      expect(a.evidence.status).toBe('needs_check');
      expect(a.evidence.checked_at).toBe('2026-11-15');
      // 根拠の note は公開用の書き出しで消える（scripts/release/sanitize.mjs）。画面は statusKey で「要確認」を出す。note があるとき（開発用の木）だけ中身を見る
      if (a.evidence.note !== undefined) expect(Boolean(a.evidence.quote) || /取得できなかった|取得できていない|確認できなかった|未確認/.test(a.evidence.note), JSON.stringify(a.text).slice(0, 60)).toBe(true);
    }
  });

  it('古い保存（見つかった物の答えが無い）はそのまま読める：見つかった物なし・要らない手続きなし', () => {
    expect(foundItems(ev, LOST)).toEqual([]);
    expect(foundEased(ev, LOST).size).toBe(0);
    expect(foundAfter(ev, LOST, out(LOST).facts, () => undefined)).toEqual([]);
    // 答えが無くても全体の判定は変わらない（見つかった物の質問は聞かない）
    expect(out(LOST).upfront.map((q) => q.id)).not.toContain('Q-lost-found');
  });

  it('物ごとに：見つかった物の再発行だけ「要らないかもしれない」。ほかの物は変わらない', () => {
    const a = { ...LOST, 'Q-lost-found': ['zairyu_card'] };
    expect(foundItems(ev, a)).toEqual(['zairyu_card']);
    expect([...foundEased(ev, a)]).toEqual(['lost-zairyu-reissue']);
    const b = { ...LOST, 'Q-lost-found': ['passport', 'cash_card'] };
    expect([...foundEased(ev, b)].sort()).toEqual(['bank-card-reissue', 'lost-passport-foreign', 'lost-passport-jp']);
  });

  it('なくした物から外した物は数えない（選び直したあとの古い答え）', () => {
    const a = { ...LOST, 'Q-lost-items': ['cash_card'], 'Q-lost-found': ['zairyu_card', 'cash_card'] };
    expect(foundItems(ev, a)).toEqual(['cash_card']);
  });

  it('見つかったと答えても、記録（完了・対応中・該当しない）は変わらない。完了にもならない', () => {
    const plan: Record<string, PlanRecord> = { 'lost-zairyu-reissue': { status: 'preparing' } as PlanRecord, 'lost-card-stop': { status: 'done' } as PlanRecord };
    const before = out(LOST, plan);
    const after = out({ ...LOST, 'Q-lost-found': ['zairyu_card', 'cash_card'] }, plan);
    for (const id of ['lost-zairyu-reissue', 'lost-card-stop', 'bank-card-reissue', 'lost-passport-jp']) {
      const x = before.cards.find((c) => c.card.id === id)!;
      const y = after.cards.find((c) => c.card.id === id)!;
      expect(trackOf(y)).toBe(trackOf(x));
      expect(y.state).toBe(x.state);
    }
    expect(trackOf(after.cards.find((c) => c.card.id === 'lost-zairyu-reissue')!)).toBe('doing');
  });

  it('パスポートの文は国で出し分ける（日本の旅券／外国の旅券）。外国の旅券の文は引用なしで 要確認', () => {
    const jp = foundAfter(ev, { ...LOST, 'Q-lost-found': ['passport'] }, out(LOST).facts, (id) => data.rules.get(id)?.condition);
    expect(jp).toHaveLength(1);
    expect(jp[0].list).toHaveLength(1);
    expect(jp[0].list[0].evidence.quote).toContain('使用することができません');
    const fo = { ...LOST, 'Q-passport-country': 'other_country', 'Q-lost-found': ['passport'] };
    const f = foundAfter(ev, fo, out(fo).facts, (id) => data.rules.get(id)?.condition);
    expect(f[0].list).toHaveLength(1);
    expect(f[0].list[0].evidence.quote).toBeUndefined();
  });

  it('在留カードは入管の返納（14日）の引用、マイナンバーカードは一時停止の解除の引用', () => {
    const z = ev.found!.items.find((i) => i.value === 'zairyu_card')!.after[0].evidence;
    expect(z.quote).toContain('発見の日から１４日以内に古い在留カードを返納');
    const m = ev.found!.items.find((i) => i.value === 'mynumber_card')!.after[0].evidence;
    expect(m.quote).toContain('一時停止の解除');
  });
});
