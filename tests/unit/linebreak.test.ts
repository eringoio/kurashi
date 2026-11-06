/* 改行（11/7 6章）：数と単位は1つの塊にする（nbParts）。文節は BudouX（Ruby.tsx の phrase） */
import { describe, expect, it } from 'vitest';
import { nbParts } from '../../src/i18n/text';
import { loadDefaultJapaneseParser } from 'budoux';

const nb = (s: string) => nbParts(s).filter((p) => p.nb).map((p) => p.t);
describe('数と単位', () => {
  it('期間・日数・電話番号・# の番号・金額を塊にする', () => {
    expect(nb('合計は家賃の4〜7か月分が目安')).toEqual(['4〜7か月分']);
    expect(nb('14日以内に届けます')).toEqual(['14日以内']);
    expect(nb('つながらないときは 052-951-7119')).toEqual(['052-951-7119']);
    expect(nb('#7119 に電話')).toEqual(['#7119']);
    expect(nb('更新手数料 2,850円')).toEqual(['2,850円']);
    expect(nb('10キログラムまでごとに270円')).toEqual(['10キログラム', '270円']);
  });
  it('1けたの数だけは包まない。元の文は変えない', () => {
    expect(nb('1つ')).toEqual([]);
    const s = '家賃 5万円なら、1か月分＝5万円';
    expect(nbParts(s).map((p) => p.t).join('')).toBe(s);
  });
});
describe('文節（BudouX）', () => {
  it('入口のボタンは文節で切れる', () => {
    const p = loadDefaultJapaneseParser();
    expect(p.parse('届いた書類がわからない')).toEqual(['届いた', '書類が', 'わからない']);
  });
});
