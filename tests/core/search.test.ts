/* 入口の検索（src/core/search.ts）：言葉1つでも、文でも探せる */
import { describe, expect, it } from 'vitest';
import { DATA } from '../../src/core/data';
import { rank } from '../../src/core/search';

const cards = DATA().cards.map((card) => ({ card }));
const top = (q: string, n = 3) => rank(cards, q).slice(0, n).map((x) => x.item.card.id);

describe('入口の検索', () => {
  it('英語の文から', () => {
    expect(top('I want to open a bank account')[0]).toBe('bank-account-open');
    expect(top('I moved to Nagoya and need to change my address', 5)).toEqual(expect.arrayContaining(['move-within-tenkyo', 'nagoya-tennyu-todoke']));
    expect(top('health insurance and pension', 6)).toContain('nagoya-kokuho-kanyu');
  });
  it('日本語の文から', () => {
    expect(top('粗大ごみを出したい')[0]).toBe('gomi-sodai');
    expect(top('引っ越したので住所を変えたい', 4)).toContain('move-within-tenkyo');
    expect(top('ビザを更新したい')[0]).toBe('zairyu-koshin');
  });
  it('打っている途中の言葉でも', () => {
    // 公開のカードが増えたので、見つかるかだけを確かめる（画面では入口の順に並び、引っ越しのカードが先）
    expect(top('insur', 50)).toContain('nagoya-kokuho-kanyu');
    expect(top('ほけ', 50)).toContain('nagoya-kokuho-kanyu');
  });
  it('合う言葉が無ければ空', () => {
    expect(rank(cards, 'zzzz')).toEqual([]);
    expect(rank(cards, '   ')).toEqual([]);
  });
});
