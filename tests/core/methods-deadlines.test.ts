/* 出す方法・同じ所でできる場合・期限の日（SPEC v0.5.45。FE-14・FE-16・FE-17・C-3・V-3）。
   方法と期限の計算は、出典のある方法・確認済みの計算規則だけ。前の保存（method・from_on が無い）はそのまま読める */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import type { PlanRecord } from '../../src/core/entry';
import { run } from '../../src/core/engine';
import { phaseVisits, phaseViews } from '../../src/core/overview';
import type { Value } from '../../src/core/schema';
import { visitGroup } from '../../src/core/visit';

const data = loadData();
const T = '2026-11-15';
const EV = (id: string) => data.events.find((x) => x.id === id)!;
const plan = (p: Record<string, Partial<PlanRecord>>) => Object.fromEntries(Object.entries(p).map(([id, x]) => [id, { card_id: id, status: 'todo', ...x } as PlanRecord]));
const go = (ev: string, answers: Record<string, Value>, p: Record<string, Partial<PlanRecord>> = {}, today = T) =>
  run(data, { answers, objects: { 'zairyu-card': true }, plan: plan(p), createdOn: T, today, mode: 'public', event: EV(ev) });
const v = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;

describe('出す方法（FE-14・FE-17）', () => {
  const city = { 'Q-move-dest': 'other_city' } as const;
  it('市外への転出届：窓口・郵送。オンラインはマイナンバーカードがあるときだけ（答えがまだなら条件つきで選べる。FF-1。札は郵送だけで言う）', () => {
    const un = v(go('E-move-out', city), 'move-out-city-tenshutsu');
    expect([un.ways, un.remote]).toEqual([['counter', 'mail', 'online'], true]);
    expect(v(go('E-move-out', { ...city, 'Q-mynumber-card': false }), 'move-out-city-tenshutsu').ways).toEqual(['counter', 'mail']);
    expect([...v(go('E-move-out', { ...city, 'Q-mynumber-card': true }), 'move-out-city-tenshutsu').ways].sort()).toEqual(['counter', 'mail', 'online']);
  });
  it('方法がまだなら行く所のまとめに入れない。郵送を選ぶと行く日のまとまりにも入れない。窓口を選ぶと区役所', () => {
    expect(v(go('E-move-out', city), 'move-out-city-tenshutsu').visitPlace).toBeNull();
    const mail = v(go('E-move-out', city, { 'move-out-city-tenshutsu': { method: 'mail' } }), 'move-out-city-tenshutsu');
    expect([mail.way, mail.visitPlace, mail.altPlace]).toEqual(['mail', null, null]);
    const o = go('E-move-out', city, { 'move-out-city-tenshutsu': { method: 'counter' } });
    expect([v(o, 'move-out-city-tenshutsu').way, v(o, 'move-out-city-tenshutsu').visitPlace]).toEqual(['counter', 'ward_office']);
    expect(visitGroup(o.cards, v(o, 'move-out-city-tenshutsu'))[0].card.id).toBe('move-out-city-tenshutsu');
  });
  it('国外転出届：市のページどうしで郵送が食い違うので、行かない方法を言わない', () => {
    const c = v(go('E-move-out', { 'Q-move-dest': 'abroad' }), 'move-out-abroad-tenshutsu');
    expect([c.remote, c.ways, c.visitPlace]).toEqual([false, [], 'ward_office']);
  });
  it('入管の配偶者に関する届出：窓口（入管）・オンライン・郵送', () => {
    const c = v(go('E-divorce', { 'Q-divorce-stage': 'agreement_done', 'Q-nationality': 'foreign', 'Q-zairyu-status': 'spouse', 'Q-divorce-children': 'no' }), 'divorce-nyukan-todoke');
    expect([...c.ways].sort()).toEqual(['counter', 'mail', 'online']);
  });
  it('前の保存の方法が、今は選べない方法なら使わない（way は null）', () => {
    const c = v(go('E-move-out', { 'Q-move-dest': 'abroad' }, { 'move-out-abroad-tenshutsu': { method: 'mail' } }), 'move-out-abroad-tenshutsu');
    expect(c.way).toBeNull();
  });
  it('税務署（V-3）：開業届は 税務署・e-Tax。ハローワークの失業給付は行く所', () => {
    const o = go('E-job', { 'Q-job-goal': 'biz_start', 'Q-nationality': 'foreign', 'Q-zairyu-status': 'permanent' });
    const k = v(o, 'biz-start-kaigyo');
    expect([k.card.place, k.ways]).toEqual(['tax_office', ['counter', 'online']]);
    expect(data.cards.find((c) => c.id === 'job-leave-shitsugyo')!.place).toBe('hello_work');
  });
});

describe('同じ所でできる場合（FE-16）', () => {
  const lost = (hoken: string) => go('E-lost-wallet', { 'Q-lost-items': ['mynumber_card', 'health_insurance'], 'Q-lost-hoken-type': hoken, 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet', 'Q-nationality': 'foreign' });
  it('国保：保険証の再交付は電子申請もできる。行く所のまとめには入れず、窓口なら区役所（altPlace）', () => {
    const c = v(lost('kokuho'), 'lost-hoken-reissue');
    expect([c.visitPlace, c.altPlace, c.ways]).toEqual([null, 'ward_office', ['counter', 'online']]);
  });
  it('全体の画面：区役所のマイナンバーカードのまとまりの後ろに付く。勤務先の保険なら付かない', () => {
    const o = lost('kokuho');
    const re = phaseViews(EV('E-lost-wallet'), o).find((p) => p.id === 'reissue')!;
    const g = phaseVisits(re.cards).find((x) => x.place === 'ward_office')!;
    expect([g.cards.map((c) => c.card.id), g.alt.map((c) => c.card.id)]).toEqual([['lost-mynumber-reissue'], ['lost-hoken-reissue']]);
    const e = lost('employer');
    expect(v(e, 'lost-hoken-reissue').altPlace).toBeNull();
  });
  it('区役所の日を決めるとき、保険証の再交付も同じ日にできるものとして入る（外せる。FE-16）', () => {
    const o = lost('kokuho');
    expect(visitGroup(o.cards, v(o, 'lost-mynumber-reissue')).map((c) => c.card.id)).toEqual(['lost-mynumber-reissue', 'lost-hoken-reissue']);
  });
  it('窓口を選ぶと、区役所の行く所のまとめに入る', () => {
    const o = go('E-lost-wallet', { 'Q-lost-items': ['mynumber_card', 'health_insurance'], 'Q-lost-hoken-type': 'kokuho', 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet' }, { 'lost-hoken-reissue': { method: 'counter' } });
    expect(v(o, 'lost-hoken-reissue').visitPlace).toBe('ward_office');
  });
});

describe('期限の日（C-3）', () => {
  const move = { 'Q-origin': 'other_city', 'Q-moveout': 'paper', 'Q-nationality': 'foreign', 'Q-age-band': '20_59', 'Q-moved-in': 'yes' } as const;
  it('転入届：住み始めた日の翌日を1日目として14日目（11/10 → 11/24）。境目：11/24 は間に合う、11/25 は後', () => {
    const on = (d?: string) => v(go('E-move', move, { 'nagoya-tennyu-todoke': { from_on: '2026-11-10', planned_on: d } }), 'nagoya-tennyu-todoke');
    expect(on().deadlineOn).toBe('2026-11-24');
    expect(on('2026-11-24').lateRisk).toBe(false);
    expect(on('2026-11-25').lateRisk).toBe(true);
  });
  it('月をまたぐ（11/20 → 12/4）', () => {
    expect(v(go('E-move', move, { 'nagoya-tennyu-todoke': { from_on: '2026-11-20' } }, '2026-11-25'), 'nagoya-tennyu-todoke').deadlineOn).toBe('2026-12-04');
  });
  it('数え始める日が無ければ計算しない（前の保存）', () => {
    expect(v(go('E-move', move, { 'nagoya-tennyu-todoke': { planned_on: '2026-12-31' } }), 'nagoya-tennyu-todoke')).toMatchObject({ deadlineOn: null, lateRisk: false });
  });
  it('計算の規則が未確認の手続き（市内の転入届）は、日を入れても日付を出さない（9章）', () => {
    const c = v(go('E-move-within', { 'Q-ward-move': 'other_ward', 'Q-moved-in': 'yes' }, { 'move-within-tennyu': { from_on: '2026-11-10' } }), 'move-within-tennyu');
    expect(c.card.deadline?.calc?.days).toBe(14);
    expect(c.deadlineOn).toBeNull();
  });
  it('済んだ手続きは、期限より後の予定と言わない', () => {
    expect(v(go('E-move', move, { 'nagoya-tennyu-todoke': { from_on: '2026-11-10', planned_on: '2026-11-30', status: 'done' } }), 'nagoya-tennyu-todoke').lateRisk).toBe(false);
  });
});
