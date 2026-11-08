/* 行く所の表示用アダプタ：区が分からない区役所は決めない・最寄りを選ばない */
import { describe, expect, it } from 'vitest';
import { PLACES } from '../../src/core/places';
import { visitPlace } from '../../src/core/visitPlace';

describe('visitPlace', () => {
  it('区役所で住んでいる区が分からない → 区を選ばせる（決めつけない）', () => {
    expect(visitPlace({ place: 'ward_office' }).status).toBe('need_residential_ward');
  });
  it('区が分かれば、その区の区役所の名前・住所・地図（住所だけのリンク）', () => {
    const w = PLACES().find((p) => p.kind === 'ward_office')!;
    const r = visitPlace({ place: 'ward_office', homeWard: w.ward });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.place.id).toBe(w.id);
      expect(r.maps.google).toContain(encodeURIComponent(w.address));
      expect(r.maps.apple).toContain(encodeURIComponent(w.address));
    }
  });
  it('知らない区は要確認。区役所以外は住所なし（名前だけ）', () => {
    expect(visitPlace({ place: 'ward_office', homeWard: 'zzz' }).status).toBe('needs_check');
    expect(visitPlace({ place: 'bank' }).status).toBe('needs_check');
    expect(visitPlace({}).status).toBe('no_known_place');
  });
});
