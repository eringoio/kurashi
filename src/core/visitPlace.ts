/* 行く所の表示用の解決。中身は src/core/office.ts の resolveOffice（管轄を先に決め、距離は受けられる窓口の中だけ）。
   区役所は「住んでいる区」が分かるときだけ決める。現在地から最寄りを選ばない（管轄を取り違えない）。 */
import { resolveOffice, type OfficeResolution } from './office';
import type { Place } from './places';

export type { OfficeResolution };

export function visitPlace(x: { place?: string; homeWard?: string | null; places?: Place[] }): OfficeResolution {
  return resolveOffice({ place: x.place, homeWard: x.homeWard, places: x.places });
}
