/* 行く所ごとに日を一度に聞く（6A.5）と、手続きを探す */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { visitGroup } from '../../src/core/visit';
import { match, norm } from '../../src/pages/Search';

const data = loadData();
const TODAY = '2026-11-05';
const A1 = { 'Q-origin': 'abroad', 'Q-role': 'student', 'Q-age-band': '20_59', 'Q-zairyu-back-address': 'no', 'Q-moved-in': 'yes', 'Q-insurance': 'none', 'Q-pension-type': 'none', 'Q-bank-account': false };
const A1_OBJ = { 'zairyu-card': true, passport: true, 'room-key': true, 'student-id': true };
const out = (plan = {}) => run(data, { answers: A1, objects: A1_OBJ, plan, createdOn: TODAY, today: TODAY });
const ids = (cs: { card: { id: string } }[]) => cs.map((c) => c.card.id);

describe('同じ所の項目は、行く日を一度に聞く', () => {
  it('区役所の3つが1つのまとまりになる。銀行は入らない', () => {
    const o = out();
    const c = o.cards.find((x) => x.card.id === 'nagoya-tennyu-juukyochi')!;
    expect(ids(visitGroup(o.cards, c))).toEqual(['nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu']);
    const bank = o.cards.find((x) => x.card.id === 'bank-account-open')!;
    expect(ids(visitGroup(o.cards, bank))).toEqual(['bank-account-open']);
  });
  it('もう日を決めた項目と、済んだ項目は入らない', () => {
    const o = out({ 'nagoya-kokuho-kanyu': { card_id: 'nagoya-kokuho-kanyu', status: 'todo', planned_on: '2026-11-07' }, 'kokumin-nenkin-kanyu': { card_id: 'kokumin-nenkin-kanyu', status: 'done' } });
    const c = o.cards.find((x) => x.card.id === 'nagoya-tennyu-juukyochi')!;
    expect(ids(visitGroup(o.cards, c))).toEqual(['nagoya-tennyu-juukyochi']);
  });
});

describe('手続きを探す', () => {
  const o = out();
  const find = (q: string) => ids(o.cards.filter((c) => match(c, q)));
  it('カタカナ・全角・大文字をそろえる', () => {
    expect(norm('ホケン')).toBe('ほけん');
    expect(norm('ＮＥＮＫＩＮ')).toBe('nenkin');
  });
  it('よみ・ローマ字・英語で見つかる', () => {
    expect(find('ほけん')).toContain('nagoya-kokuho-kanyu');
    expect(find('nenkin')).toEqual(expect.arrayContaining(['kokumin-nenkin-kanyu', 'nenkin-at-20']));
    expect(find('Bank')).toEqual(['bank-account-open']);
  });
  it('空の言葉では何も出さない', () => {
    expect(find('  ')).toEqual([]);
  });
});

describe('銀行の日は、住所の届けの日より前にできない（day_order。v0.4.5）', () => {
  const bank = (plan = {}) => out(plan).cards.find((x) => x.card.id === 'bank-account-open')!.dayRule;
  it('住所の届けの日がまだなら、先に決める', () => {
    expect(bank()).toEqual({ kind: 'need_first', from: 'nagoya-tennyu-juukyochi' });
  });
  it('住所の届けの日を決めたら、その日から後', () => {
    expect(bank({ 'nagoya-tennyu-juukyochi': { card_id: 'nagoya-tennyu-juukyochi', status: 'todo', planned_on: '2026-11-07' } })).toEqual({ kind: 'min', day: '2026-11-07', from: 'nagoya-tennyu-juukyochi' });
  });
  it('住所の届けが済んだら、いつでもよい', () => {
    expect(bank({ 'nagoya-tennyu-juukyochi': { card_id: 'nagoya-tennyu-juukyochi', status: 'done' } })).toEqual({ kind: 'free' });
  });
});

describe('20歳になると届く年金のお知らせ（R-under-20 は確認済み。作者 11/5）', () => {
  it('20歳以上の人には出さない', () => {
    expect(out().cards.find((x) => x.card.id === 'nenkin-at-20')!.state).toBe('excluded');
  });
});
