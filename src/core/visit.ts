/* 行く所ごとのまとまり（6A.5）：同じ所（区役所など）でする項目は、行く日を一度に聞く。
   日を一緒にするだけで、同じ窓口で済むとは言わない（same_visit が確認済みでないとき。10.4）。 */
import type { CardView } from './engine';

/** 日を決められる項目か（いま・確かめる、日がまだ、質問が残っていない） */
const open = (c: CardView) =>
  (c.section === 'today' || c.section === 'check') &&
  (c.state === 'shown' || c.state === 'check_at_office') &&
  !c.plan?.planned_on && c.plan?.status !== 'done' &&
  c.questions.length === 0 &&
  c.dayRule.kind !== 'no_day';

/** c と同じ所で、日がまだの項目（c を先頭に、一覧の順）。
    先に日を決める項目（need_first）は、その項目が同じまとまりにあるときだけ入れる（同じ日に、前の項目から順にする） */
export function visitGroup(cards: CardView[], c: CardView): CardView[] {
  const place = c.card.place;
  if (!place) return [c];
  const cand = [c, ...cards.filter((x) => x !== c && x.card.place === place && open(x))];
  const ids = new Set(cand.map((x) => x.card.id));
  return cand.filter((x) => x === c || x.dayRule.kind !== 'need_first' || ids.has(x.dayRule.from));
}

/** まとまりの中で、いちばん早く選べる日（確認済みの前提の日より前は選べない）。なければ null */
export function earliestDay(group: CardView[]): string | null {
  const days = group.map((c) => (c.dayRule.kind === 'min' ? c.dayRule.day : null)).filter((d): d is string => !!d);
  return days.length ? days.sort().at(-1)! : null;
}
