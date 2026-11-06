import { describe, expect, it } from 'vitest';
import { sharePath } from '../../src/core/scene';

// 共有の URL（作者 11/6 A-5）：いまの場面の入口。答え・日付は入れない
describe('共有のパス', () => {
  const place = (id: string) => (id === 'nagoya-tennyu-juukyochi' ? 'ward_office' : undefined);
  it('できごとの中のページは、できごとの入口', () => {
    expect(sharePath('/e/E-move-within/c/move-within-tennyu')).toBe('/e/E-move-within');
    expect(sharePath('/e/E-move-within')).toBe('/e/E-move-within');
  });
  it('手続きのページは、行く所の場面。場面が無ければ引っ越しの入口', () => {
    expect(sharePath('/c/nagoya-tennyu-juukyochi', place)).toBe('/s/ward-office');
    expect(sharePath('/c/bank-account-open', place)).toBe('/move');
  });
  it('いま・全体・今日は、答えが要るので引っ越しの入口。決まったページはそのまま。ほかは入口', () => {
    expect(sharePath('/now')).toBe('/move');
    expect(sharePath('/clinic')).toBe('/clinic');
    expect(sharePath('/review')).toBe('/');
    expect(sharePath('/s/ward-office')).toBe('/s/ward-office');
  });
});
