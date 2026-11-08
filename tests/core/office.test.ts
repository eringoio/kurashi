import { describe, expect, it } from 'vitest';
import { homeWardFrom, resolveOffice } from '../../src/core/office';
import { PLACES } from '../../src/core/places';

const chikusa = PLACES().find((p) => p.ward === 'chikusa')!;
const pos = { lat: chikusa.lat, lng: chikusa.lng, accuracy: 20 };

describe('resolveOffice', () => {
  it('新居が naka なら、GPS が千種区役所のそばでも naka', () => {
    const r = resolveOffice({ place: 'ward_office', homeWard: 'naka', pos });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.place.ward).toBe('naka');
  });
  it('区が分からなければ、位置があっても決めない', () => {
    expect(resolveOffice({ place: 'ward_office', pos }).status).toBe('need_residential_ward');
    expect(resolveOffice({ place: 'ward_office', homeWard: null, pos }).status).toBe('need_residential_ward');
  });
  it('名古屋市にない区は要確認', () => {
    expect(resolveOffice({ place: 'ward_office', homeWard: 'nowhere' }).status).toBe('needs_check');
  });
  it('警察・免許・入管などは断定しない', () => {
    for (const p of ['police', 'license_center', 'immigration']) expect(resolveOffice({ place: p, homeWard: 'naka' }).status).toBe('needs_check');
  });
  it('知らない種類・place なしは no_known_place', () => {
    expect(resolveOffice({ place: 'xyz' }).status).toBe('no_known_place');
    expect(resolveOffice({}).status).toBe('no_known_place');
  });
  it('地図のリンクに位置は入らない。窓口の住所だけ', () => {
    const r = resolveOffice({ place: 'ward_office', homeWard: 'naka', pos });
    if (r.status !== 'resolved') throw new Error();
    for (const u of [r.maps.apple, r.maps.google]) {
      expect(u).toContain(encodeURIComponent(r.place.address));
      expect(u).not.toContain(String(pos.lat).slice(0, 7));
    }
  });
  it('支所は同じ区のものだけが候補で、位置があれば近い順（誤差が大きければ並べ替えない）', () => {
    const base = PLACES().find((p) => p.ward === 'naka')!;
    const mk = (id: string, lat: number): typeof base => ({ ...base, id, kind: 'branch', lat });
    const far = mk('naka-far', base.lat + 0.05), near = mk('naka-near', base.lat + 0.001);
    const other = { ...mk('x', base.lat), ward: 'higashi' };
    const places = [base, far, near, other];
    const here = { lat: base.lat, lng: base.lng, accuracy: 30 };
    const r = resolveOffice({ place: 'ward_office', homeWard: 'naka', pos: here, places });
    if (r.status !== 'resolved') throw new Error();
    expect(r.alternatives.map((p) => p.id)).toEqual(['naka-near', 'naka-far']);
    const r2 = resolveOffice({ place: 'ward_office', homeWard: 'naka', pos: { ...here, accuracy: 5000 }, places });
    if (r2.status !== 'resolved') throw new Error();
    expect(r2.alternatives.map((p) => p.id)).toEqual(['naka-far', 'naka-near']);
  });
});

describe('homeWardFrom', () => {
  const v = (m: Record<string, unknown>) => ({ get: <T,>(_s: 'settings', k: string) => m[k] as T | undefined });
  it('home_address の区を返す。無ければ null', () => {
    expect(homeWardFrom(v({ home_address: { ward_id: 'naka' } }))).toBe('naka');
    expect(homeWardFrom(v({ gomi_area: { ward_id: 'naka' } }))).toBe('naka');
    expect(homeWardFrom(v({}))).toBeNull();
    expect(homeWardFrom(v({ home_address: { ward_id: 'zzz' } }))).toBeNull();
  });
});
