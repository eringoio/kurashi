/* いまいる場所から（6A.11）：300m 以内・誤差 300m 以下のときだけ「近くにいますか？」。区役所16か所に出典 */
import { describe, expect, it } from 'vitest';
import { distanceM, loadPlaces, nearby, PLACES, NEAR_M } from '../../src/core/places';
import { loadData } from '../../src/core/data';

const list = PLACES();
const naka = list.find((p) => p.ward === 'naka')!;
/** 北へ d メートル動かした点 */
const north = (p: { lat: number; lng: number }, d: number) => ({ lat: p.lat + d / 111_320, lng: p.lng });

describe('区役所のデータ', () => {
  it('16区の区役所。区は重ならない', () => {
    expect(list.filter((p) => p.kind === 'ward_office')).toHaveLength(16);
    expect(new Set(list.map((p) => p.ward)).size).toBe(16);
  });
  it('どれにも出典があり、確認待ち（needs_check）', () => {
    const src = new Set(loadData().sources.map((s) => s.source_id));
    for (const p of list) {
      expect(p.evidence.source_ids.length, p.id).toBeGreaterThan(0);
      for (const s of p.evidence.source_ids) expect(src.has(s), p.id + ' ' + s).toBe(true);
      expect(p.evidence.status).toBe('needs_check');
    }
  });
  it('区役所どうしは 300m より離れている（近くの判定が2つにならない）', () => {
    for (const a of list) for (const b of list) if (a !== b) expect(distanceM(a, b), a.id + b.id).toBeGreaterThan(2 * NEAR_M);
  });
  it('名前が欠けた場所は読み込めない', () => {
    expect(() => loadPlaces({ places: [{ ...naka, name: { ja: '中区役所' } }] })).toThrow();
  });
});

describe('近くの判定（端末の中だけ）', () => {
  it('距離の計算：北へ 250m', () => {
    expect(Math.round(distanceM(naka, north(naka, 250)))).toBeGreaterThan(245);
    expect(Math.round(distanceM(naka, north(naka, 250)))).toBeLessThan(255);
  });
  it('許す・300m 以内・誤差が小さい：近くにいるか聞く', () => {
    expect(nearby(list, { ...north(naka, 200), accuracy: 30 })).toEqual({ kind: 'near', place: naka });
  });
  it('誤差が 300m より大きい：聞かずに一覧', () => {
    expect(nearby(list, { ...north(naka, 50), accuracy: 500 })).toEqual({ kind: 'inaccurate' });
  });
  it('遠い：一覧', () => {
    expect(nearby(list, { ...north(naka, 900), accuracy: 20 }).kind).toMatch(/far|near/);
    expect(nearby(list, { lat: 35.6812, lng: 139.7671, accuracy: 20 })).toEqual({ kind: 'far' });
  });
  it('距離は結果に入れない（画面に出さない・残さない）', () => {
    expect(Object.keys(nearby(list, { ...north(naka, 100), accuracy: 10 }))).toEqual(['kind', 'place']);
  });
});
