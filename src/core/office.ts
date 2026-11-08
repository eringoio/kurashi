/* 手続きの行き先（管轄の窓口）を決める（純粋な関数。画面に依存しない）。
   順番：1. 手続きの窓口の種類（place）→ 2. 区（自宅・新居。GPS からは決めない）で受けられる窓口に絞る → 3. 絞った中だけ、位置があれば近い順 → 4. 選ぶのは本人。
   nearest() は管轄の判定に使わない。地図のリンクには窓口の公開の住所だけを入れる（本人の位置・住所は入れない）。 */
import { distanceM, mapLinks, PLACES, type Place } from './places';

export type OfficeInput = {
  /** カードの place（'ward_office' など） */
  place?: string;
  /** 本人が答えた自宅・新居の区の id（'naka' など）。GPS からは決めない */
  homeWard?: string | null;
  /** 取得を許可した現在地（端末の中だけ。並べ替えにだけ使う） */
  pos?: { lat: number; lng: number; accuracy: number } | null;
  places?: Place[];
};

export type OfficeResolution =
  | { status: 'resolved'; place: Place; maps: { apple: string; google: string }; alternatives: Place[] }
  | { status: 'need_residential_ward' }
  | { status: 'needs_check'; reason: string }
  | { status: 'no_known_place' };

/** 窓口の場所のデータを持っていない（公式で確かめた住所を登録していない）種類。断定せず「要確認」 */
const UNVERIFIED_KINDS = new Set(['police', 'license_center', 'immigration', 'bank', 'embassy', 'pref_passport', 'prev_city']);

/** 位置の誤差がこの値（m）より大きいときは、近い順にしない */
export const SORT_MAX_ACCURACY_M = 1000;

export function resolveOffice(input: OfficeInput): OfficeResolution {
  const { place, homeWard, pos } = input;
  if (!place) return { status: 'no_known_place' };
  if (place !== 'ward_office') {
    return UNVERIFIED_KINDS.has(place)
      ? { status: 'needs_check', reason: 'unverified_kind:' + place }
      : { status: 'no_known_place' };
  }
  const all = input.places ?? PLACES();
  if (!homeWard) return { status: 'need_residential_ward' };
  const eligible = all.filter((p) => (p.kind === 'ward_office' || p.kind === 'branch') && p.ward === homeWard);
  const main = eligible.find((p) => p.kind === 'ward_office');
  if (!main) return { status: 'needs_check', reason: 'unknown_ward:' + homeWard };
  let alternatives = eligible.filter((p) => p !== main);
  if (pos && pos.accuracy <= SORT_MAX_ACCURACY_M) alternatives = [...alternatives].sort((a, b) => distanceM(pos, a) - distanceM(pos, b));
  return { status: 'resolved', place: main, maps: mapLinks(main), alternatives };
}

/** 保存した回答から自宅の区を読む（settings/home_address.ward_id。ごみの画面で本人が選んだ区）。無い・不明な区なら null */
export function homeWardFrom(
  vault: { get: <T>(store: 'settings', key: string) => T | undefined },
  places: Place[] = PLACES(),
): string | null {
  const s = vault.get<{ ward_id?: string }>('settings', 'home_address') ?? vault.get<{ ward_id?: string }>('settings', 'gomi_area');
  const id = s?.ward_id;
  return id && places.some((p) => p.ward === id) ? id : null;
}
