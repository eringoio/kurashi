import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { evalCond, type Facts } from '../../src/core/logic';
import type { Condition } from '../../src/core/schema';

const data = loadData();
const TODAY = '2026-11-05';
const A1 = { 'Q-origin': 'abroad', 'Q-role': 'student', 'Q-age-band': '20_59', 'Q-zairyu-back-address': 'yes', 'Q-moved-in': 'yes', 'Q-insurance': 'none', 'Q-pension-type': 'none', 'Q-bank-account': false };
const A1_OBJ = { 'zairyu-card': true, passport: true, 'room-key': true, 'student-id': true };
// アプリと同じく、引っ越し（E-move）のカードだけで判定する（11/6：市内の引っ越しの2枚を公開にしたため）
const MOVE = (() => { const e = data.events.find((x) => x.id === 'E-move')!; return { ...e, questions: [], facts: [] }; })();
const input = (over: Partial<EngineInput> = {}): EngineInput => ({ answers: A1, objects: A1_OBJ, plan: {}, createdOn: TODAY, today: TODAY, event: MOVE, ...over });
const byId = (o: ReturnType<typeof run>) => Object.fromEntries(o.cards.map((c) => [c.card.id, { state: c.state, section: c.section }]));

describe('データ', () => {
  it('型と参照に誤りがない', () => {
    expect(checkRefs(data)).toEqual([]);
  });
});

describe('三値の評価（SPEC 9.2 の真理値表）', () => {
  const f: Facts = new Map<string, string | boolean>([['a', 'x'], ['u', 'unknown']]);
  const T: Condition = { fact: 'a', eq: 'x' };
  const F: Condition = { fact: 'a', eq: 'y' };
  const U: Condition = { fact: 'none', eq: 'x' };
  const v = (c: Condition) => evalCond(c, f).v;
  it('葉', () => {
    expect([v(T), v(F), v(U), v({ fact: 'u', eq: 'x' })]).toEqual(['T', 'F', 'U', 'U']);
    expect(evalCond({ fact: 'u', eq: 'x' }, f).unknown.has('u')).toBe(true);
    expect(evalCond(U, f).unanswered.has('none')).toBe(true);
  });
  it('not', () => {
    expect([v({ not: T }), v({ not: F }), v({ not: U })]).toEqual(['F', 'T', 'U']);
  });
  it('all', () => {
    const cases: [Condition[], string][] = [[[T, T], 'T'], [[T, F], 'F'], [[T, U], 'U'], [[F, U], 'F'], [[U, U], 'U'], [[], 'T']];
    for (const [xs, want] of cases) expect(v({ all: xs })).toBe(want);
  });
  it('any', () => {
    const cases: [Condition[], string][] = [[[F, F], 'F'], [[T, F], 'T'], [[F, U], 'U'], [[T, U], 'T'], [[U, U], 'U'], [[], 'F']];
    for (const [xs, want] of cases) expect(v({ any: xs })).toBe(want);
  });
});

describe('A1（公開時点のデータ：公式のルールは needs_check）', () => {
  const o = run(data, input());
  it('公式のルールが未確認なので、区役所の3つは「窓口で確認」。断定しない', () => {
    expect(byId(o)).toMatchObject({
      'nagoya-tennyu-juukyochi': { state: 'check_at_office', section: 'check' },
      'nagoya-kokuho-kanyu': { state: 'check_at_office', section: 'check' },
      'kokumin-nenkin-kanyu': { state: 'check_at_office', section: 'check' },
      'bank-account-open': { state: 'shown', section: 'today' },
    });
    expect(o.cards.find((c) => c.card.id === 'nagoya-kokuho-kanyu')!.cause).toBe('unverified');
  });
  it('最初の質問は残っていない（在留カードは持ち物から）', () => {
    expect(o.upfront).toEqual([]);
  });
  it('未確認の制度上の前提は、日を選ぶのを止めない（注記だけ）', () => {
    const k = o.cards.find((c) => c.card.id === 'nagoya-kokuho-kanyu')!;
    expect(k.dayRule).toEqual({ kind: 'free' });
    expect(k.notes.map((n) => n.kind)).toContain('practical_prereq');
  });
});

describe('A1（確認済みデータの fixture）', () => {
  const o = run(data, input({ mode: 'verified' }));
  it('住所の届けは在留カードの裏の答えから済み。国保・年金は「いま」', () => {
    expect(byId(o)).toMatchObject({
      'nagoya-tennyu-juukyochi': { state: 'shown', section: 'done' },
      'nagoya-kokuho-kanyu': { state: 'shown', section: 'today' },
      'kokumin-nenkin-kanyu': { state: 'shown', section: 'today' },
      'bank-account-open': { state: 'shown', section: 'today' },
    });
  });
  it('裏に住所がないときは、国保は「住所の届けのあとが多い」という注記だけ。日は止めない（条件付きの実務上の前提）', () => {
    const o2 = run(data, input({ mode: 'verified', answers: { ...A1, 'Q-zairyu-back-address': 'no' } }));
    const k = o2.cards.find((c) => c.card.id === 'nagoya-kokuho-kanyu')!;
    expect(k.section).toBe('today');
    expect(k.dayRule).toEqual({ kind: 'free' });
    expect(k.notes.map((n) => n.kind)).toContain('practical_prereq');
  });
  it('「わからない」は check_at_office（断定しない）', () => {
    const o2 = run(data, input({ mode: 'verified', answers: { ...A1, 'Q-insurance': 'unknown' } }));
    const k = o2.cards.find((c) => c.card.id === 'nagoya-kokuho-kanyu')!;
    expect([k.state, k.cause]).toEqual(['check_at_office', 'unknown']);
  });
});

describe('銀行の口座（v0.4.2：キャッシュカードがないことから断定しない）', () => {
  const ans = { ...A1 } as Record<string, string | boolean>;
  delete ans['Q-bank-account'];
  it('カードを選ばず、まだ答えていない → ask。カードの中で Q-bank-account を聞く', () => {
    const b = run(data, input({ answers: ans })).cards.find((c) => c.card.id === 'bank-account-open')!;
    expect(b.state).toBe('ask');
    expect(b.questions.map((q) => q.id)).toEqual(['Q-bank-account']);
  });
  it('カードを持っている → excluded', () => {
    const b = run(data, input({ answers: ans, objects: { ...A1_OBJ, 'bank-cash-card': true } })).cards.find((c) => c.card.id === 'bank-account-open')!;
    expect(b.state).toBe('excluded');
  });
  it('申し込んで待っている → 届くのを待つ', () => {
    const b = run(data, input({ answers: { ...ans, 'Q-bank-account': 'pending' } })).cards.find((c) => c.card.id === 'bank-account-open')!;
    expect([b.state, b.section]).toEqual(['shown', 'wait']);
  });
  it('わからない → check_at_office（銀行のアプリや通帳で確かめる）', () => {
    const b = run(data, input({ answers: { ...ans, 'Q-bank-account': 'unknown' } })).cards.find((c) => c.card.id === 'bank-account-open')!;
    expect([b.state, b.cause]).toEqual(['check_at_office', 'unknown']);
  });
});

describe('最初の質問と範囲', () => {
  it('持ち物の前：在留カードがなければ住民登録の根拠を聞き、立場・年齢も聞く（4問以内）', () => {
    const o = run(data, input({ answers: { 'Q-origin': 'abroad' }, objects: {} }));
    expect(o.upfront.map((q) => q.id)).toEqual(['Q-residence-basis', 'Q-role', 'Q-age-band']);
  });
  it('短い滞在（N3）は範囲外。残りの最初の質問は聞かない', () => {
    const o = run(data, input({ answers: { 'Q-origin': 'abroad', 'Q-residence-basis': 'short_stay' }, objects: {} }));
    expect(o.scope).toBe('F');
    expect(o.upfront).toEqual([]);
    expect(new Set(o.cards.map((c) => c.state))).toEqual(new Set(['out_of_scope']));
  });
  it('住み始めていない人の住所の届けは「あとで」（fixture）', () => {
    const o = run(data, input({ mode: 'verified', answers: { ...A1, 'Q-moved-in': 'not_yet', 'Q-zairyu-back-address': 'no' } }));
    const c = o.cards.find((x) => x.card.id === 'nagoya-tennyu-juukyochi')!;
    expect([c.section, c.sectionWhy]).toEqual(['later', 'moved_in_not_yet']);
  });
  it('確認日から90日を過ぎた確認済みの情報は古い扱い（outdated → 断定しない）', () => {
    const o = run(data, input({ mode: 'verified', today: '2027-03-01', createdOn: '2027-03-01' }));
    expect(o.cards.find((c) => c.card.id === 'nagoya-kokuho-kanyu')!.state).toBe('check_at_office');
    // 本アプリの定義だけのルール（銀行）は古くならない
    expect(o.cards.find((c) => c.card.id === 'bank-account-open')!.state).toBe('shown');
  });
});
