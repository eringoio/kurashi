/* 名古屋市から出ていく（2026-11-08 に公開。元は drafts/data/E-move-out.bundle.json）。市外＝転出届、国外＝国外転出届。ほかの市町村の中だけは範囲外。 */
import { describe, expect, it } from 'vitest';
import { verifiedNotBulk } from './bulk';
import { checkRefs, loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-move-out')!;
// 郵便の転送は、ほかの入口と共有のカード（確認済みの関係がある）なので、この入口のカードとしては見ない
const own = ev.card_ids.filter((id) => id !== 'mail-forward');
const mine = () => JSON.stringify({ event: { ...ev, card_ids: own, info_card_ids: [] }, cards: own.map((id) => data.cards.find((c) => c.id === id)), rules: [...data.rules.values()].filter((r) => JSON.stringify(ev).includes(r.id) || own.some((id) => JSON.stringify(data.cards.find((c) => c.id === id)).includes(r.id))), relations: data.relations.filter((r) => own.some((id) => JSON.stringify(r).includes(id))) });
const TODAY = '2026-11-04';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf("|")));
const go = (dest: string | undefined, over: Partial<EngineInput> = {}) =>
  run(data, { answers: dest ? { 'Q-move-dest': dest } : {}, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev, ...over });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const ids = (o: ReturnType<typeof run>, state: string) => o.cards.filter((c) => c.state === state && !c.card.id.startsWith('life-') && c.card.id !== 'mail-forward').map((c) => c.card.id).sort();
const CITY = ['move-out-city-kokuho', 'move-out-city-tenshutsu'];
const ABROAD = ['move-out-abroad-hoken-nenkin', 'move-out-abroad-mynumber', 'move-out-abroad-tenshutsu', 'move-out-abroad-zairyu'];
/** 名古屋市に関係しない引っ越し（作者 11/7 K-9）：名古屋へ来るときと同じ流れの一般の案内 */
const OTHER = ['move-other-after', 'move-other-tennyu', 'move-other-tenshutsu'];

describe('名古屋市から出ていく', () => {
  it('型と参照の検査を通る。すべて needs_check', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(verifiedNotBulk(mine())).toEqual([]);
  });
  it('最初に、行き先を聞く', () => {
    const o = go(undefined);
    expect(o.upfront[0].id).toBe('Q-move-dest');
    expect(nowStep(o, TODAY).kind).toBe('upfront');
    // ほかの市町村へなら、国籍・年齢は聞かない
    expect(go('other_city').upfront).toEqual([]);
  });
  it('ほかの市町村へ：転出届。国保は入っているかを聞く。国外の手続きは出さない', () => {
    const o = go('other_city');
    expect(ids(o, 'shown')).toEqual(['move-out-city-tenshutsu']);
    expect([view(o, 'move-out-city-kokuho').state, view(o, 'move-out-city-kokuho').questions.map((q) => q.id)]).toEqual(['ask', ['Q-insurance']]);
    expect(ids(o, 'excluded')).toEqual([...ABROAD, ...OTHER].sort());
    expect(view(o, 'mail-forward').section).toBe('info');
  });
  it('国保の人だけ国保の手続き。職場の保険・扶養・入っていない人には出さない。わからないは確かめる', () => {
    const ins = (v: string) => view(go(undefined, { answers: { 'Q-move-dest': 'other_city', 'Q-insurance': v } }), 'move-out-city-kokuho');
    expect(ins('kokuho').state).toBe('shown');
    for (const v of ['employer_self', 'employer_family', 'none']) expect(ins(v).state).toBe('excluded');
    expect([ins('unknown').state, ins('unknown').cause]).toEqual(['check_at_office', 'unknown']);
  });
  it('国外へ：国外転出届と関連。市外の転出届は出さない。国籍・年齢をたずねる', () => {
    const o = go('abroad');
    expect(ids(o, 'shown')).toEqual(['move-out-abroad-tenshutsu']);
    expect(o.upfront.map((q) => q.id)).toEqual(['Q-nationality', 'Q-age-band']);
    expect(ids(o, 'excluded')).toEqual([...CITY, ...OTHER].sort());
  });
  const abroad = (a: Record<string, string | boolean>) => go(undefined, { answers: { 'Q-move-dest': 'abroad', ...a } });
  it('日本国籍・マイナンバーカードあり：継続利用の案内。在留カードの返納は出さない', () => {
    const o = abroad({ 'Q-nationality': 'japanese', 'Q-mo-mynumber': true });
    expect(view(o, 'move-out-abroad-mynumber').state).toBe('shown');
    expect(view(o, 'move-out-abroad-zairyu').state).toBe('excluded');
    expect(view(abroad({ 'Q-nationality': 'japanese', 'Q-mo-mynumber': false }), 'move-out-abroad-mynumber').state).toBe('excluded');
    expect(view(abroad({ 'Q-nationality': 'japanese' }), 'move-out-abroad-mynumber').questions.map((q) => q.id)).toEqual(['Q-mo-mynumber']);
    expect(view(abroad({ 'Q-nationality': 'foreign' }), 'move-out-abroad-mynumber').state).toBe('excluded');
  });
  it('外国籍：再入国許可で出国するなら返納を出さない。戻らないなら返納。わからない・国籍を答えないは確かめる', () => {
    expect(view(abroad({ 'Q-nationality': 'foreign', 'Q-mo-reentry': 'reentry' }), 'move-out-abroad-zairyu').state).toBe('excluded');
    expect(view(abroad({ 'Q-nationality': 'foreign', 'Q-mo-reentry': 'no_card' }), 'move-out-abroad-zairyu').state).toBe('excluded');
    expect(view(abroad({ 'Q-nationality': 'foreign', 'Q-mo-reentry': 'no_return' }), 'move-out-abroad-zairyu').state).toBe('shown');
    expect(view(abroad({ 'Q-nationality': 'foreign' }), 'move-out-abroad-zairyu').questions.map((q) => q.id)).toEqual(['Q-mo-reentry']);
    for (const a of [{ 'Q-nationality': 'foreign', 'Q-mo-reentry': 'unknown' }, { 'Q-nationality': 'unknown' }] as Record<string, string>[]) {
      const z = view(abroad(a), 'move-out-abroad-zairyu');
      expect([z.state, z.cause]).toEqual(['check_at_office', 'unknown']);
    }
  });
  it('国外へ：保険・年金の案内は、職場の保険と厚生年金の日本国籍の人には出さない', () => {
    expect(view(abroad({ 'Q-nationality': 'japanese', 'Q-age-band': '20_59', 'Q-insurance': 'employer_self', 'Q-pension-type': 'kosei' }), 'move-out-abroad-hoken-nenkin').state).toBe('excluded');
    expect(view(abroad({ 'Q-nationality': 'japanese', 'Q-insurance': 'kokuho' }), 'move-out-abroad-hoken-nenkin').state).toBe('shown');
    // 外国籍の人は厚生年金でも脱退一時金が関係する
    expect(view(abroad({ 'Q-nationality': 'foreign', 'Q-age-band': '20_59', 'Q-insurance': 'employer_self', 'Q-pension-type': 'kosei' }), 'move-out-abroad-hoken-nenkin').state).toBe('shown');
  });
  it('国外転出届の期限は、2つの出典の食い違いを言い切らず、窓口で確認（要確認）にする', () => {
    const c = view(go('abroad'), 'move-out-abroad-tenshutsu').card;
    expect(plain(c.deadline!.text.ja)).toMatch(/30日前/);
    expect(plain(c.deadline!.text.ja)).toMatch(/2週間前/);
    expect(plain(c.deadline!.text.ja)).toContain('要確認');
    expect(c.deadline!.evidence.source_ids).toHaveLength(2);
  });
  it('わからない：対象外にせず、窓口で確認にする。範囲外にもしない', () => {
    const o = go('unknown');
    expect(o.scope).not.toBe('F');
    expect(ids(o, 'excluded')).toEqual([]);
    expect(ids(o, 'out_of_scope')).toEqual([]);
    for (const id of ['move-out-city-tenshutsu', 'move-out-abroad-tenshutsu']) expect([view(o, id).state, view(o, id).cause]).toEqual(['check_at_office', 'unknown']);
  });
  it('他の市町村の中だけの移動（K-9）：範囲外にせず、転出届 → 転入届 → そのあとの一般の案内と、「名古屋市を主に案内」のお知らせ', () => {
    const o = go('not_nagoya');
    expect(o.scope).not.toBe('F');
    expect(ids(o, 'shown')).toEqual(OTHER);
    for (const id of OTHER) expect(view(o, id).notices[0].text.ja).toContain('{主|おも}に{案内|あんない}');
    expect(ids(o, 'excluded')).toEqual([...CITY, ...ABROAD].sort());
  });
  it('国保・年金の案内は、日を聞かない', () => {
    expect(view(go('abroad'), 'move-out-abroad-hoken-nenkin').dayRule.kind).toBe('no_day');
  });
  it('転出届は、転出する日までと書き、電話番号を書かない', () => {
    expect(plain(view(go('other_city'), 'move-out-city-tenshutsu').card.deadline!.text.ja)).toContain('転出する日まで');
    expect(mine()).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
  });
});
