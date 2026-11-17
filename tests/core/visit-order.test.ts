/* 行く所でまとめる順（SPEC 10.3 v0.5.44）。作者の依頼 2026-11-15：同じ区役所の手続きを1回の訪問に。
   緊急・期限・前提は追い越さない。不要な人に国民年金の加入を「必要」と出さない。 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run, type CardView } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';
import type { Value } from '../../src/core/schema';
import { clusterByVisit, visitGroups } from '../../src/core/visitOrder';

const data = loadData();
const T = '2026-11-15';
const EV = (id: string) => data.events.find((x) => x.id === id)!;
const go = (ev: string, answers: Record<string, Value>, objects: Record<string, boolean> = { 'zairyu-card': true }) =>
  run(data, { answers, objects, plan: {}, createdOn: T, today: T, mode: 'public', event: EV(ev) });
const v = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const actionable = (o: ReturnType<typeof run>) => o.cards.filter((c) => (c.section === 'today' || c.section === 'check') && c.state !== 'excluded' && c.state !== 'out_of_scope');
const ids = (l: CardView[]) => l.map((c) => c.card.id);
const ME = { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student', 'Q-role': 'student', 'Q-age-band': '20_59', 'Q-moved-in': 'yes', 'Q-insurance': 'none', 'Q-pension-type': 'none', 'Q-bank-account': false } as const;

describe('引っ越し：区役所の手続きを1つの訪問に', () => {
  it('市外から：住所の届出・国保・年金（まだ入っていない人）が続き、銀行はそのあと', () => {
    const o = go('E-move', { ...ME, 'Q-origin': 'other_city', 'Q-moveout': 'paper', 'Q-nenkin-enrolled': 'no' });
    expect(ids(actionable(o))).toEqual(['nagoya-tennyu-todoke', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu', 'bank-account-open']);
    const g = visitGroups(actionable(o));
    expect(g.map((x) => x.place)).toEqual(['ward_office', 'bank']);
  });
  it('海外から：住居地の届出 → 国保 → 年金（same_visit の order と同じ）→ 銀行（住所の届出のあと）', () => {
    const o = go('E-move', { ...ME, 'Q-origin': 'abroad' });
    expect(ids(actionable(o))).toEqual(['nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu', 'bank-account-open']);
    // 海外から来た人には「もう入っているか」を聞かない
    expect(v(o, 'kokumin-nenkin-kanyu').questions.map((q) => q.id)).not.toContain('Q-nenkin-enrolled');
  });
  it('まとめても区分け・表示状態・義務の強さは変わらない（国保・年金は要確認のまま、銀行は したほうがよい）', () => {
    const o = go('E-move', { ...ME, 'Q-origin': 'abroad' });
    expect([v(o, 'nagoya-kokuho-kanyu').state, v(o, 'kokumin-nenkin-kanyu').state]).toEqual(['check_at_office', 'check_at_office']);
    expect([v(o, 'bank-account-open').section, v(o, 'bank-account-open').card.obligation]).toEqual(['today', 'practical']);
  });
  it('いまの1つは区役所。日を決めると、同じ区役所の手続きが一緒（行く日を何回も聞かない）', () => {
    const o = go('E-move', { ...ME, 'Q-origin': 'abroad' });
    const s = nowStep(o, T);
    expect(s.kind === 'plan' && s.view.card.id).toBe('nagoya-tennyu-juukyochi');
  });
});

describe('国民年金：引っ越しだけで加入を必要にしない（名古屋市 1011840）', () => {
  const base = { ...ME, 'Q-origin': 'other_city', 'Q-moveout': 'paper' };
  it('国内から：もう入っているかを聞く', () => {
    expect(v(go('E-move', base), 'kokumin-nenkin-kanyu').questions.map((q) => q.id)).toContain('Q-nenkin-enrolled');
  });
  it('もう入っている：加入は除外。理由は「住所の変更も手続き不要（要確認）」', () => {
    const c = v(go('E-move', { ...base, 'Q-nenkin-enrolled': 'yes' }), 'kokumin-nenkin-kanyu');
    expect(c.state).toBe('excluded');
    expect(c.falseRule?.id).toBe('R-nenkin-not-enrolled');
    expect(c.falseRule?.reason_when_false?.ja).toContain('{手続|てつづ}き{不要|ふよう}');
  });
  it('わからない：除外も断定もしない（要確認）', () => {
    const c = v(go('E-move', { ...base, 'Q-nenkin-enrolled': 'unknown' }), 'kokumin-nenkin-kanyu');
    expect([c.state, c.cause]).toEqual(['check_at_office', 'unknown']);
  });
});

describe('財布：緊急 → 前提 → 期限のある義務 → 同じ所をまとめる', () => {
  const o = go('E-lost-wallet', { 'Q-lost-items': ['cash_card', 'zairyu_card', 'mynumber_card', 'health_insurance', 'license'], 'Q-lost-hoken-type': 'kokuho', 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet', ...{ 'Q-nationality': 'foreign' } });
  const order = ids(actionable(o));
  it('カードを止める（すぐ行う行動）が最初。まとめで後ろにしない', () => {
    expect(order.slice(0, 2)).toEqual(['lost-card-stop', 'lost-mynumber-stop']);
  });
  it('警察の届（在留カードの前提）→ 在留カードの再交付（14日以内）が、任意の銀行より先', () => {
    expect(order.indexOf('lost-police-report-zairyu')).toBeLessThan(order.indexOf('lost-zairyu-reissue'));
    expect(order.indexOf('lost-zairyu-reissue')).toBeLessThan(order.indexOf('bank-card-reissue'));
  });
  it('国保の保険証の再交付は電子申請でもできるので、区役所の訪問にまとめない（「オンライン・郵送でもできる」）', () => {
    expect([v(o, 'lost-hoken-reissue').visitPlace, v(o, 'lost-hoken-reissue').remote]).toEqual([null, true]);
    expect(v(o, 'lost-mynumber-reissue').visitPlace).toBe('ward_office');
  });
  it('勤務先の健康保険なら、保険証の再交付は区役所に入らない（FE-3）', () => {
    const e = go('E-lost-wallet', { 'Q-lost-items': ['health_insurance', 'mynumber_card'], 'Q-lost-hoken-type': 'employer', 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet', 'Q-nationality': 'foreign' });
    expect([v(e, 'lost-hoken-reissue').visitPlace, v(e, 'lost-hoken-reissue').remote]).toEqual([null, false]);
  });
  it('入管の配偶者に関する届出・市外への転出届はオンライン・郵送でもできるので、訪問にまとめない（FE-4・FE-14）', () => {
    const d = go('E-divorce', { 'Q-divorce-stage': 'agreement_done', 'Q-nationality': 'foreign', 'Q-zairyu-status': 'spouse', 'Q-divorce-children': 'no' });
    expect([v(d, 'divorce-nyukan-todoke').visitPlace, v(d, 'divorce-nyukan-todoke').remote]).toEqual([null, true]);
    const m = go('E-move-out', { 'Q-move-dest': 'other_city' });
    expect(v(m, 'move-out-city-tenshutsu').remote).toBe(true);
  });
});

describe('clusterByVisit の守り', () => {
  const mk = (id: string, place: string | undefined, obligation: string, extra: Partial<CardView['card']> = {}): CardView =>
    ({ card: { id, place, obligation, ...extra }, section: 'today', state: 'shown', visitPlace: extra.urgent ? null : place ?? null, remote: false, ways: [], remoteWays: [], way: null, altPlace: null, deadlineOn: null, lateRisk: false } as unknown as CardView);
  it('寄せる先の先頭が義務でないとき、任意の手続きは、別の所の期限のある義務を追い越さない', () => {
    const l = [mk('a', 'bank', 'practical'), mk('b', 'police', 'legal', { deadline: {} as never }), mk('c', 'bank', 'optional')];
    expect(ids(clusterByVisit(l, () => []))).toEqual(['a', 'b', 'c']);
  });
  it('先頭が法令の義務なら、同じ建物の手続きを寄せる（同じ日に済む）', () => {
    const l = [mk('a', 'ward_office', 'legal', { deadline: {} as never }), mk('b', 'police', 'legal', { deadline: {} as never }), mk('c', 'ward_office', 'check')];
    expect(ids(clusterByVisit(l, () => []))).toEqual(['a', 'c', 'b']);
  });
  it('すぐ行う行動は追い越さない', () => {
    const l = [mk('a', 'ward_office', 'legal'), mk('u', undefined, 'practical', { urgent: {} as never }), mk('c', 'ward_office', 'legal')];
    expect(ids(clusterByVisit(l, () => []))).toEqual(['a', 'u', 'c']);
  });
  it('前に要る手続きが寄せる先より後ろなら寄せない', () => {
    const l = [mk('a', 'ward_office', 'legal'), mk('p', 'police', 'practical'), mk('c', 'ward_office', 'legal')];
    expect(ids(clusterByVisit(l, (id) => (id === 'c' ? ['p'] : [])))).toEqual(['a', 'p', 'c']);
  });
  it('場所の無い手続き（オンライン・電話など）はまとめない', () => {
    const l = [mk('a', undefined, 'legal'), mk('b', 'bank', 'legal'), mk('c', undefined, 'legal')];
    expect(visitGroups(clusterByVisit(l, () => [])).map((g) => g.key)).toEqual(['card:a', 'place:bank', 'card:c']);
  });
});
