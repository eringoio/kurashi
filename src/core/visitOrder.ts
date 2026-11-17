/* 行く所でまとめる順（SPEC 10.3 v0.5.44・6A.4）。画面に依存しない。
   エンジンの並び（前提の段 → 義務の強さ → flow.json）のあとで、同じ所（カードの place）へ行く手続きを、
   その所の最初の手続きのすぐ後ろに寄せる。区分け・表示状態・義務の強さは変えない（並びだけ）。

   寄せないとき（ほかの手続きを遅らせないため）：
   - すぐ行う行動（urgent）は動かさず、その前に何も入れない（A. 緊急性）
   - 寄せると、法令の義務で期限のある、別の所の手続きを追い越すとき。寄せる手続き自身も法令の義務なら追い越してよい（B. 期限）
   - 前に要る手続き（前提の関係）が、寄せる先より後ろにあるとき（C. 依存関係）
   - いま・確かめる の区分けでない（あとで・待つ・関連する情報・済んだ）、場所の無い（オンライン・電話など）手続き（E. 方法）
   同じ所は「同じ建物へ行く」の意味だけで、同じ窓口で済むとは言わない（窓口は手続きごとに where に書く）。 */
import type { CardView } from './engine';

const MUST = new Set(['legal', 'local_rule']);
/** まとめる対象：いま・確かめる で、表示する手続き。行く所の無いもの（visitPlace が null：すぐ行う行動・行かずに済むもの・place_when が T でないもの）は除く */
export const groupable = (c: CardView): boolean =>
  (c.section === 'today' || c.section === 'check') && (c.state === 'shown' || c.state === 'check_at_office') && !!c.visitPlace;
/** 追い越してはいけない手続き（寄せる手続きが法令の義務でないとき）：法令の義務で期限がある */
const guarded = (c: CardView) => MUST.has(c.card.obligation) && !!c.card.deadline && c.section !== 'done' && c.section !== 'info';

/** prereqs(id)：その手続きの前に要る手続き（まだ済んでいない）の id */
export function clusterByVisit(cards: CardView[], prereqs: (id: string) => string[]): CardView[] {
  const out: CardView[] = [];
  for (const c of cards) {
    if (!groupable(c)) { out.push(c); continue; }
    // 同じ所の、最後の手続きの位置
    let tail = -1;
    for (let i = out.length - 1; i >= 0; i--) if (groupable(out[i]) && out[i].visitPlace === c.visitPlace) { tail = i; break; }
    if (tail < 0 || tail === out.length - 1) { out.push(c); continue; }
    const jumped = out.slice(tail + 1);
    const pos = new Map(out.map((x, i) => [x.card.id, i]));
    // その所へは、先頭の手続きのために行く。先頭が法令の義務なら、同じ建物で足す手続きは別の所の期限を遅らせない（同じ日に済む）
    const head = out.find((x) => groupable(x) && x.visitPlace === c.visitPlace)!;
    const blocked =
      jumped.some((x) => x.card.urgent) ||
      (!MUST.has(c.card.obligation) && !MUST.has(head.card.obligation) && jumped.some(guarded)) ||
      prereqs(c.card.id).some((id) => (pos.get(id) ?? -1) > tail);
    if (blocked) out.push(c);
    else out.splice(tail + 1, 0, c);
  }
  return out;
}

export interface VisitGroup {
  /** 'place:<place>'・'card:<id>'（場所の無い手続きは1つずつ） */
  key: string;
  place: string | null;
  cards: CardView[];
}

/** 一覧の順のまま、同じ所の手続きを1つのまとまりにする（まとまりの順は最初の手続きの順）。
    場所の無い手続き・すぐ行う行動は1つずつ */
export function visitGroups(cards: CardView[]): VisitGroup[] {
  const list: VisitGroup[] = [];
  const byPlace = new Map<string, VisitGroup>();
  for (const c of cards) {
    const place = c.visitPlace;
    if (!place) { list.push({ key: 'card:' + c.card.id, place: null, cards: [c] }); continue; }
    let g = byPlace.get(place);
    if (!g) { g = { key: 'place:' + place, place, cards: [] }; byPlace.set(place, g); list.push(g); }
    g.cards.push(c);
  }
  return list;
}
