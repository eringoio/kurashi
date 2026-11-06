/* 付き添い（6A.6）：行く前 → 窓口で → 終わったら。区役所の3つ（A1：住居地の届出・国保・国民年金）で、4つの終わり方 */
import { describe, expect, it } from 'vitest';
import { afterOutcome, bringByCard, bringList, nextStage, outcomePatch, resultPatch, parseVisitPath, visitPath, visitsToday, VISIT_OUTCOMES } from '../../src/core/accompany';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import type { PlanRecord } from '../../src/core/entry';

const data = loadData();
const TODAY = '2026-11-05';
const A1 = { 'Q-origin': 'abroad', 'Q-role': 'student', 'Q-age-band': '20_59', 'Q-zairyu-back-address': 'no', 'Q-moved-in': 'yes', 'Q-insurance': 'none', 'Q-pension-type': 'none', 'Q-bank-account': false };
const A1_OBJ = { 'zairyu-card': true, passport: true, 'room-key': true, 'student-id': true };
const WARD = ['nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu'];
const planned = (day: string, ids = WARD): Record<string, PlanRecord> => Object.fromEntries(ids.map((id) => [id, { card_id: id, status: 'todo', planned_on: day }]));
const out = (plan: Record<string, PlanRecord>, d = data) => run(d, { answers: A1, objects: A1_OBJ, plan, createdOn: TODAY, today: TODAY });
const visits = (plan: Record<string, PlanRecord>, d = data) => visitsToday(out(plan, d), d.objects, A1_OBJ, 'abroad', TODAY);
/** 終わり方を、まとまりの項目に書いた plan */
const apply = (plan: Record<string, PlanRecord>, ids: string[], patch: Partial<PlanRecord>) => {
  const p = { ...plan };
  for (const id of ids) p[id] = { ...p[id], ...patch } as PlanRecord;
  return p;
};
const ids = (cs: { card: { id: string } }[]) => cs.map((c) => c.card.id);

describe('行く前：今日の行く所ごとのまとまり', () => {
  it('区役所の3つが1つのまとまり。日が今日でない項目・銀行は入らない', () => {
    const p = { ...planned(TODAY), ...planned('2026-11-06', ['bank-account-open']) };
    const v = visits(p);
    expect(v.map((x) => x.place)).toEqual(['ward_office']);
    expect(ids(v[0].cards).sort()).toEqual([...WARD].sort());
  });
  it('行く所が2つなら、まとまりも2つ', () => {
    const v = visits({ ...planned(TODAY), ...planned(TODAY, ['bank-account-open']) });
    expect(v.map((x) => x.place).sort()).toEqual(['bank', 'ward_office']);
  });
  it('same_visit が未確認なら、順を決めない（窓口で確認）', () => {
    expect(visits(planned(TODAY))[0].ordered).toBe(false);
  });
  it('same_visit が確認済みなら、その順に並べる', () => {
    const d = loadData();
    const r = d.relations.find((x) => x.id === 'rel-ward-same-visit')!;
    r.evidence = { ...r.evidence, status: 'verified', source_ids: ['kurashi-spec'] };
    r.keep_needs_check = false;
    const v = visits(planned(TODAY), d)[0];
    expect(v.ordered).toBe(true);
    expect(ids(v.cards)).toEqual(['nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu']);
  });
  it('持ち物：区役所へ持っていく物のうち、持っている物が先。鍵は入らない', () => {
    const b = visits(planned(TODAY))[0].bring;
    expect(b.filter((x) => x.held).map((x) => x.object.id)).toEqual(['zairyu-card', 'passport', 'student-id']);
    expect(b.map((x) => x.object.id)).not.toContain('room-key');
    // 日本の外からの道のりでは、マイナンバーカード・転出証明書は出さない（show_for）
    expect(b.map((x) => x.object.id)).not.toContain('moveout-certificate');
  });
  it('持っていない物は「持っていない」に分ける', () => {
    const b = bringList(data.objects, 'ward_office', { passport: true }, 'abroad');
    expect(b.filter((x) => !x.held).map((x) => x.object.id)).toEqual(['zairyu-card', 'student-id']);
  });
});

describe('段階と URL', () => {
  it('行く前 → 窓口で → 終わったら', () => {
    expect(nextStage('before')).toBe('counter');
    expect(nextStage('counter')).toBe('after');
    expect(nextStage('after')).toBeNull();
  });
  it('URL には行く所の種類と段階だけ（答え・日付を入れない。13.4）', () => {
    for (const s of ['before', 'counter', 'after'] as const) {
      const u = visitPath('ward_office', s);
      expect(u).not.toMatch(/\d|\?/);
      expect(parseVisitPath(u)).toEqual({ place: 'ward_office', stage: s });
    }
    expect(parseVisitPath('/visit/ward_office/x')).toBeNull();
  });
});

describe('終わったら：4つの終わり方', () => {
  const base = planned(TODAY);
  it('全部できた：済み。行く所を残し、今日のまとまりから消える', () => {
    const p = apply(base, WARD, outcomePatch('all_done', 'ward_office', TODAY));
    const o = out(p);
    for (const id of WARD) {
      expect(o.cards.find((c) => c.card.id === id)!.section).toBe('done');
      expect(p[id].visit_result).toEqual({ place: 'ward_office', result: 'done', on: TODAY }); // B-7（11/6）：place_done → visit_result
    }
    expect(visits(p)).toEqual([]);
    expect(afterOutcome('all_done')).toBe('done');
  });
  it('別の書類が要ると言われた：日を消し、理由を残して「確かめる」へ', () => {
    const p = apply(base, ['nagoya-kokuho-kanyu'], outcomePatch('need_document', 'ward_office', TODAY));
    const c = out(p).cards.find((x) => x.card.id === 'nagoya-kokuho-kanyu')!;
    expect(c.section).toBe('check');
    expect(c.sectionWhy).toBe('visit_need_document');
    expect(c.plan?.planned_on).toBeUndefined();
    expect(c.plan?.visit_told_on).toBe(TODAY);
    expect(afterOutcome('need_document')).toBe('check');
  });
  it('ここではないと言われた：「確かめる」へ（理由は wrong_place）', () => {
    const p = apply(base, WARD, outcomePatch('wrong_place', 'ward_office', TODAY));
    for (const id of WARD) {
      const c = out(p).cards.find((x) => x.card.id === id)!;
      expect(c.section).toBe('check');
      expect(c.sectionWhy).toBe('visit_wrong_place');
    }
  });
  it('行けなかった：日を消して、日を決め直す（済みにしない）', () => {
    const p = apply(base, WARD, outcomePatch('not_went', 'ward_office', TODAY));
    const o = out(p);
    for (const id of WARD) {
      const c = o.cards.find((x) => x.card.id === id)!;
      expect(c.plan?.status).toBe('todo');
      expect(c.plan?.planned_on).toBeUndefined();
      expect(c.section).not.toBe('done');
      expect(String(c.sectionWhy)).not.toMatch(/^visit_/);
    }
    expect(afterOutcome('not_went')).toBe('replan');
  });
  it('言われたあと日を決め直すと、「確かめる」の理由は日の後ろに下がる', () => {
    const told = apply(base, WARD, outcomePatch('need_document', 'ward_office', TODAY));
    const again = apply(told, WARD, { planned_on: '2026-11-07' });
    const c = out(again).cards.find((x) => x.card.id === 'nagoya-tennyu-juukyochi')!;
    expect(c.sectionWhy).not.toBe('visit_need_document');
  });
  it('どの終わり方も、ほかの項目の plan を変えない', () => {
    for (const o of VISIT_OUTCOMES) expect(Object.keys(outcomePatch(o, 'ward_office', TODAY))).not.toContain('card_id');
  });
});

// B-7（作者 11/6）：手続きごとに できた／できなかった。選んでいない手続きは未確認（日はそのまま）
describe('終わったら：手続きごとの2択', () => {
  const base = planned(TODAY);
  it('できた・できなかった（理由あり）・できなかった（理由なし）・未確認を分ける', () => {
    let p = apply(base, ['nagoya-tennyu-juukyochi'], resultPatch({ ok: true }, 'ward_office', TODAY));
    p = apply(p, ['nagoya-kokuho-kanyu'], resultPatch({ ok: false, reason: 'need_document' }, 'ward_office', TODAY));
    const o = out(p);
    const sec = (id: string) => o.cards.find((c) => c.card.id === id)!;
    expect(sec('nagoya-tennyu-juukyochi').section).toBe('done');
    expect(sec('nagoya-kokuho-kanyu').section).toBe('check');
    expect(p['nagoya-kokuho-kanyu'].visit_result).toEqual({ place: 'ward_office', result: 'not_done', reason: 'need_document', on: TODAY });
    // 未確認：年金は何も変えない。今日の予定に残る
    expect(p['kokumin-nenkin-kanyu'].planned_on).toBe(TODAY);
    expect(visits(p).flatMap((v) => ids(v.cards))).toEqual(['kokumin-nenkin-kanyu']);
    const q = resultPatch({ ok: false }, 'ward_office', TODAY);
    expect(q.planned_on).toBeUndefined();
    expect(q.visit_result).toEqual({ place: 'ward_office', result: 'not_done', on: TODAY });
  });
});

// B-6（作者 11/6）：持ち物を手続きごとに。同じ物は1回だけ
describe('持ち物を手続きごとに', () => {
  it('在留カードは住所の届けに、保険のカードは国保に。同じ物は最初の手続きだけ', () => {
    const v = visits(planned(TODAY))[0];
    const b = bringByCard(v);
    const of = (id: string) => b.groups.find((g) => g.card.card.id === id)!.items.map((x) => x.object.id);
    expect(of('nagoya-tennyu-juukyochi')).toEqual(expect.arrayContaining(['zairyu-card', 'passport']));
    expect(of('kokumin-nenkin-kanyu')).toContain('student-id');
    const all = b.groups.flatMap((g) => g.items.map((x) => x.object.id)).concat(b.rest.map((x) => x.object.id));
    expect(new Set(all).size).toBe(all.length);
  });
});
