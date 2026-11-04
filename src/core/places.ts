/* 場所（SPEC 9.11）と、いまいる場所から（6A.11）。位置は端末の中だけで比べる（送らない・保存しない。13章）。
   300m 以内で、位置の誤差も 300m 以下のときだけ「〇〇の近くにいますか？」と聞く。断定しない。 */
import { z } from 'zod';
import { Evidence, Text } from './schema';
import placesJson from '../../data/places.json';

export const NEAR_M = 300;

export const Place = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['ward_office', 'branch']),
  ward: z.string().regex(/^[a-z]+$/),
  name: Text,
  address: z.string(),
  lat: z.number().min(34.9).max(35.4),
  lng: z.number().min(136.7).max(137.2),
  evidence: Evidence,
});
export type Place = z.infer<typeof Place>;

export function loadPlaces(raw: unknown = placesJson): Place[] {
  const list = z.object({ places: z.array(Place) }).parse(raw).places;
  const ids = new Set<string>();
  for (const p of list) {
    if (ids.has(p.id)) throw new Error('場所 ' + p.id + ' が2つある');
    ids.add(p.id);
    for (const l of ['ja', 'ja_easy', 'en']) if (!p.name[l]) throw new Error(p.id + '：' + l + ' の名前がない');
  }
  return list;
}
let cached: Place[] | null = null;
export const PLACES = (): Place[] => (cached ??= loadPlaces());

/** 2点の距離（m。球面の近似） */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Nearby =
  | { kind: 'near'; place: Place }
  /** 誤差が 300m より大きい：聞かずに、区の一覧から選ぶ */
  | { kind: 'inaccurate' }
  /** 300m 以内に場所が無い */
  | { kind: 'far' };

/** 位置（端末の中だけ）から、近くの場所を1つ。距離は返さない（画面に出さない・残さない） */
export function nearby(places: Place[], pos: { lat: number; lng: number; accuracy: number }): Nearby {
  if (!(pos.accuracy <= NEAR_M)) return { kind: 'inaccurate' };
  let best: Place | null = null, bestD = Infinity;
  for (const p of places) { const d = distanceM(pos, p); if (d < bestD) { bestD = d; best = p; } }
  return best && bestD <= NEAR_M ? { kind: 'near', place: best } : { kind: 'far' };
}

/** 地図のアプリで開くリンク（区役所の住所だけを入れる。本人の位置は入れない。6A.11） */
export function mapLinks(p: Pick<Place, 'address' | 'name'>): { apple: string; google: string } {
  const q = encodeURIComponent(p.address);
  return { apple: 'https://maps.apple.com/?q=' + q, google: 'https://www.google.com/maps/search/?api=1&query=' + q };
}
