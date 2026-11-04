/* データ契約 v1（docs/DATA_CONTRACT.md）の合格条件：
   結婚の検証用データを、専用の React 画面・判定関数なしで足せる。同じ部品（エンジン・いまの1つ・日のまとまり）で動く。 */
import { describe, expect, it } from 'vitest';
import { baseRaw, checkRefs, loadData, withBundles, type Bundle } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';
import { visitGroup } from '../../src/core/visit';
import marriageJson from '../fixtures/marriage.bundle.json';

const marriage = marriageJson as Bundle;
/** src/ の全コード。開発専用の見本（DevPatterns・ui/patterns）は除く：見本の文に結婚が出てくるため */
const SRC = import.meta.glob('../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const data = loadData(withBundles(baseRaw(), [marriage]));
const ev = data.events.find((e) => e.id === 'E-fx-marriage')!;
const TODAY = '2026-11-04';
const go = (answers: EngineInput['answers'], over: Partial<EngineInput> = {}) =>
  run(data, { answers, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'verified', event: ev, ...over });
const st = (o: ReturnType<typeof run>) => Object.fromEntries(o.cards.map((c) => [c.card.id, c.state]));

describe('結婚の検証用データ（専用コードなし）', () => {
  it('本体＋結婚のデータが型と参照の検査を通る', () => {
    expect(checkRefs(data)).toEqual([]);
  });
  it('イベントのカードだけを判定する（引っ越しのカードは出ない）', () => {
    const o = go({});
    expect(o.cards.map((c) => c.card.id).sort()).toEqual(ev.card_ids.slice().sort());
  });
  it('最初は入口の質問を聞く', () => {
    const o = go({});
    expect(o.upfront.map((q) => q.id)).toEqual(['Q-fx-nationality', 'Q-fx-name-change']);
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'upfront', q: { id: 'Q-fx-nationality' } });
  });
  it('外国籍・名字が変わる：全部出る。名字が変わらない：名前の変更は対象外', () => {
    expect(st(go({ 'Q-fx-nationality': 'foreign', 'Q-fx-name-change': 'yes' }))).toMatchObject({ 'fx-konin-todoke': 'shown', 'fx-zairyu-change': 'shown', 'fx-mynumber-name': 'shown', 'fx-bank-name': 'shown' });
    expect(st(go({ 'Q-fx-nationality': 'japanese', 'Q-fx-name-change': 'no' }))).toMatchObject({ 'fx-zairyu-change': 'excluded', 'fx-mynumber-name': 'excluded' });
  });
  it('「わからない」を対象外にしない（窓口で確認）', () => {
    const o = st(go({ 'Q-fx-nationality': 'unknown', 'Q-fx-name-change': 'unknown' }));
    expect(o['fx-zairyu-change']).toBe('check_at_office');
    expect(o['fx-mynumber-name']).toBe('check_at_office');
  });
  it('未確認のデータ（public）では、条件が真でも断定しない', () => {
    const o = st(go({ 'Q-fx-nationality': 'japanese', 'Q-fx-name-change': 'no' }, { mode: 'public' }));
    expect(o['fx-mynumber-name']).not.toBe('excluded');
  });
  it('確認済みの法令上の前提：婚姻届の前は、名前の変更は「あとで」', () => {
    const o = go({ 'Q-fx-nationality': 'foreign', 'Q-fx-name-change': 'yes' });
    const my = o.cards.find((c) => c.card.id === 'fx-mynumber-name')!;
    expect([my.section, my.sectionWhy]).toEqual(['later', 'after_prereq']);
    const done = go({ 'Q-fx-nationality': 'foreign', 'Q-fx-name-change': 'yes' }, { plan: { 'fx-konin-todoke': { card_id: 'fx-konin-todoke', status: 'done' } } });
    expect(done.cards.find((c) => c.card.id === 'fx-mynumber-name')!.sectionWhy).not.toBe('after_prereq');
  });
  it('関連（related）と同時に進める（parallel）は注記だけ', () => {
    const o = go({ 'Q-fx-nationality': 'foreign', 'Q-fx-name-change': 'yes' });
    const k = o.cards.find((c) => c.card.id === 'fx-konin-todoke')!;
    expect(k.notes.map((n) => n.kind)).toContain('related');
    expect(o.cards.find((c) => c.card.id === 'fx-bank-name')!.notes.map((n) => n.kind)).toContain('parallel');
    // related は順番を作らない（前提待ちの「あとで」にしない）
    expect(o.cards.find((c) => c.card.id === 'fx-zairyu-change')!.sectionWhy).not.toBe('after_prereq');
  });
  it('相談の案内（guide）は日を聞かない', () => {
    const o = go({ 'Q-fx-nationality': 'japanese', 'Q-fx-name-change': 'no' });
    const g = o.cards.find((c) => c.card.id === 'fx-consult')!;
    expect(g.dayRule.kind).toBe('no_day');
    expect(visitGroup(o.cards, g)).toEqual([g]);
    const step = nowStep(o, TODAY);
    expect(step.kind === 'plan' && step.view.card.id === 'fx-consult').toBe(false);
  });
  it('src/ に結婚のための専用コードがない', () => {
    expect(Object.keys(SRC).length).toBeGreaterThan(10);
    const hits = Object.entries(SRC).filter(([p, code]) => !/DevPatterns|\/ui\/patterns\//.test(p) && /marriage|konin|婚姻|E-fx-/.test(code)).map(([p]) => p);
    expect(hits).toEqual([]);
  });
});

describe('データの検査（契約 v1）', () => {
  it('重複IDを止める', () => {
    expect(() => loadData(withBundles(baseRaw(), [{ cards: [baseRaw().cards[0]] }]))).toThrow(/重複ID/);
  });
  it('前提の関係の循環を見つける', () => {
    const rel = (id: string, from: string, to: string) => ({ id, type: 'practical_prerequisite', from, to, explain: { ja: 'x' }, evidence: { source_ids: ['fx-nagoya-konin'], checked_at: '2026-11-04', status: 'needs_check' } });
    const d = loadData(withBundles(baseRaw(), [marriage]));
    d.relations.push(...[rel('c1', 'fx-bank-name', 'fx-consult'), rel('c2', 'fx-consult', 'fx-bank-name')].map((r) => r as never));
    expect(checkRefs(d).some((e) => e.includes('循環'))).toBe(true);
  });
  it('イベントが存在しないカードを指すと止める', () => {
    const bad = { ...marriage, events: [{ ...(marriage.events![0] as object), id: 'E-fx-bad', card_ids: ['no-such-card'] }] };
    expect(() => loadData(withBundles(baseRaw(), [bad]))).toThrow(/no-such-card/);
  });
});

describe('手続きの方法（methods）の評価', () => {
  it('使える条件が偽の方法は出さない。わからないときは要確認（U）', () => {
    const bank = (nat: string) => go({ 'Q-fx-nationality': nat, 'Q-fx-name-change': 'yes' }).cards.find((c) => c.card.id === 'fx-bank-name')!.methods.map((m) => [m.method.type, m.v]);
    expect(bank('foreign')).toEqual([['counter', 'T'], ['online', 'T']]);
    expect(bank('japanese')).toEqual([['counter', 'T']]);
    expect(bank('unknown')).toEqual([['counter', 'T'], ['online', 'U']]);
  });
});
