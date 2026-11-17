/* 全体の画面（SPEC 6A.17 v0.5.28：財布の紛失）。画面に依存しない。
   - 手続きを段（phases）ごとに全部見せる。すぐ行う行動は目立たせるが、ほかの手続きを止めない
   - 画面の記録はチェックボックス（済んだ・まだ。v0.5.36）。保存は PlanRecord の status のまま。前に記録した 対応中・該当しない は読める（Track）
   - 1つの手続きの中で別々に記録する物（parts：キャッシュカードとクレジットカード）は、物ごとに状態を持ち、手続きの状態はまとめて決める
   - 当てはまるかわからない（U）ものは「要確認」。対象・対象外を勝手に決めない */
import type { CardView, EngineOutput } from './engine';
import type { PlanRecord } from './entry';
import { evalCond, type TV } from './logic';
import type { EventDef, Value } from './schema';

export type Track = 'todo' | 'doing' | 'done' | 'na';
type Status = PlanRecord['status'];

/** 保存の状態 → 4つの状態。提出した・待っている も「対応中」 */
export const trackOfStatus = (s: Status | undefined): Track =>
  s === 'done' ? 'done' : s === 'dismissed' ? 'na' : s === 'preparing' || s === 'submitted' || s === 'waiting' ? 'doing' : 'todo';

/** 4つの状態 → 保存の状態。対応中は preparing（いまの「準備中」と同じ） */
export const STATUS_OF: Record<Track, Status> = { todo: 'todo', doing: 'preparing', done: 'done', na: 'dismissed' };

/** 手続きの状態。答えから済んでいるとわかったもの（section done）は完了 */
export const trackOf = (c: CardView): Track => (c.section === 'done' ? 'done' : trackOfStatus(c.plan?.status));

/** 当てはまるか決まっていない（質問に答えると決まる・窓口で確かめる）。画面では「要確認」 */
export const needsCheck = (c: CardView): boolean => c.state === 'ask' || c.state === 'check_at_office';

export interface PartView { id: string; label: EventPart['label']; applies: TV; track: Track }
type EventPart = NonNullable<CardView['card']['parts']>[number];

/** 手続きの中の物。当てはまらない（F）物は出さない。U は要確認 */
export function partViews(c: CardView, facts: Map<string, Value>): PartView[] {
  return (c.card.parts ?? []).flatMap((p) => {
    const v = p.when ? evalCond(p.when, facts).v : 'T';
    return v === 'F' ? [] : [{ id: p.id, label: p.label, applies: v, track: trackOfStatus(c.plan?.parts?.[p.id]) }];
  });
}

/** 物の状態から手続きの状態を決める。
    全部が完了か該当しない（1つ以上が完了）→ 完了／全部が該当しない → 該当しない／どれかが対応中・完了 → 対応中／ほか → 未対応。
    1つ止めただけで、全部を止めたことにしない */
export function rollup(parts: Pick<PartView, 'track'>[]): Track {
  if (!parts.length) return 'todo';
  const t = parts.map((p) => p.track);
  if (t.every((x) => x === 'na')) return 'na';
  if (t.every((x) => x === 'done' || x === 'na')) return 'done';
  if (t.some((x) => x === 'doing' || x === 'done')) return 'doing';
  return 'todo';
}

/** チェックボックスの物を1つ変えたときの記録。チェック = done、外す = todo。手続きの状態は今までと同じ rollup で決める。
    pending：まだ画面に戻ってきていない、前に押した物（続けて押しても前の記録を消さない） */
export function checkPart(c: CardView, parts: PartView[], id: string, done: boolean, pending: Record<string, Track> = {}): Pick<PlanRecord, 'parts' | 'status'> {
  const over: Record<string, Track> = { ...pending, [id]: done ? 'done' : 'todo' };
  return {
    parts: { ...(c.plan?.parts ?? {}), ...Object.fromEntries(Object.entries(over).map(([k, t]) => [k, STATUS_OF[t]])) },
    status: STATUS_OF[rollup(parts.map((p) => ({ track: over[p.id] ?? p.track })))],
  };
}

export interface PhaseView { id: string; title?: NonNullable<EventDef['phases']>[number]['title']; note?: NonNullable<EventDef['phases']>[number]['note']; cards: CardView[] }

/** 段ごとの手続き。対象外・範囲外は出さない。どの段にも入らないカードは最後の「そのほか」（id: other、見出しは画面の文） */
export function phaseViews(ev: EventDef, out: EngineOutput): PhaseView[] {
  const visible = out.cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope');
  const byId = new Map(visible.map((c) => [c.card.id, c]));
  const used = new Set<string>();
  const list: PhaseView[] = (ev.phases ?? []).map((ph) => {
    const cards = ph.card_ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    cards.forEach((c) => used.add(c.card.id));
    return { id: ph.id, title: ph.title, note: ph.note, cards };
  }).filter((p) => p.cards.length > 0);
  const rest = visible.filter((c) => !used.has(c.card.id));
  if (rest.length) list.push({ id: 'other', cards: rest });
  return list;
}

/** すぐ行う行動で、まだ済んでいない・該当しないにしていないもの（画面の上に目立たせる。止めない） */
export const urgentOpen = (out: EngineOutput): CardView[] =>
  out.cards.filter((c) => c.card.urgent && (c.state === 'shown' || c.state === 'check_at_office') && trackOf(c) !== 'done' && trackOf(c) !== 'na');

/** 全体の画面を出すか：段のあるできごとで、最初の質問（中身）に答えたあと。入口の質問が無いできごと（住まい）は、はじめから（v0.5.30） */
export const overviewReady = (ev: EventDef, answers: Record<string, Value>): boolean =>
  !!ev.phases?.length && (ev.questions.length === 0 || answers[ev.questions[0]] !== undefined);

/** 状態を記録する手続きか。関連する情報（info）の案内は記録しない（読む物。v0.5.30）。物ごとに記録する物（parts）があれば記録する */
export const tracked = (c: CardView): boolean => !(c.section === 'info' && c.card.kind === 'guide' && !c.card.parts?.length);

/** 目的の手続きが1つだけで、ほかに進める手続きが無い（関連する情報だけ）：その手続きの画面へ直接進む（中間の一覧を挟まない。v0.5.30） */
export function singleGoal(out: EngineOutput, step: { kind: string; view?: CardView }): CardView | null {
  if (step.kind !== 'goal' || !step.view) return null;
  const open = out.cards.filter((c) => c.section !== null && c.section !== 'done' && c.section !== 'info' && c.state !== 'excluded' && c.state !== 'out_of_scope');
  return open.length === 1 && open[0] === step.view ? step.view : null;
}

/** 前に要ること（前提の関係で、まだ済んでいない）。カードを開いて準備するのは止めない */
export const prereqFrom = (c: CardView): string[] =>
  [...new Set(c.notes.filter((n) => n.kind === 'legal_prereq' || n.kind === 'practical_prereq' || n.kind === 'prereq_unknown').map((n) => (n.relation as { from: string }).from))];

/** 段の中で、同じ所（カードの place）へ行く手続きを1つのまとまりに（v0.5.44）。並びは段の順のまま、
    同じ所の2つ目からは、最初のものの所へ寄せる。すぐ行う行動と場所の無いものは1つずつ。
    見出しを出すのは同じ所が2つ以上のときだけ（place）。1つだけのときは place: null */
export function phaseVisits(cards: CardView[]): { place: string | null; cards: CardView[]; alt: CardView[] }[] {
  // 行かない方法もあり方法がまだの手続き（altPlace）は、同じ所へ行く手続きが段にあれば、そのまとまりの後ろに付ける（FE-16）
  const firm = new Set(cards.map((c) => c.visitPlace).filter(Boolean));
  const alt = cards.filter((c) => !c.visitPlace && c.altPlace && firm.has(c.altPlace));
  const out: { place: string | null; cards: CardView[]; alt: CardView[] }[] = [];
  const at = new Map<string, { place: string | null; cards: CardView[]; alt: CardView[] }>();
  for (const c of cards) {
    if (alt.includes(c)) continue;
    const p = c.visitPlace;
    const g = p ? at.get(p) : undefined;
    if (g) { g.cards.push(c); continue; }
    const n = { place: p, cards: [c], alt: p ? alt.filter((x) => x.altPlace === p) : [] };
    if (p) at.set(p, n);
    out.push(n);
  }
  // 見出しは、同じ所が2つ以上（できる場合があるものを含む）のときだけ
  return out.map((g) => (g.cards.length + g.alt.length > 1 ? g : { place: null, cards: [...g.cards, ...g.alt], alt: [] }));
}

/* 「見つかった」を答えにする（財布の紛失。G-11・O-3）。答えは Q-lost-found（複数選択）。記録（plan）は変えない・完了にしない。
   昔の保存には答えが無い：[] として読む。いまの「なくした物」から外した物は数えない */

/** 見つかったと答えた物（いま「なくした」の中にある物だけ。順は event.found.items） */
export function foundItems(ev: EventDef, answers: Record<string, Value>): string[] {
  const f = ev.found;
  if (!f) return [];
  const lost = answers[f.from];
  const got = answers[f.q];
  const set = new Set(Array.isArray(got) ? got.map(String) : []);
  const lostSet = new Set(Array.isArray(lost) ? lost.map(String) : []);
  return f.items.map((i) => i.value).filter((v) => set.has(v) && lostSet.has(v));
}

/** 「再発行は要らないかもしれない」と添える手続き。表示だけ。状態・チェックは変えない */
export function foundEased(ev: EventDef, answers: Record<string, Value>): Set<string> {
  const got = new Set(foundItems(ev, answers));
  return new Set((ev.found?.items ?? []).filter((i) => got.has(i.value)).flatMap((i) => i.eased));
}

type After = NonNullable<EventDef['found']>['common'][number];
/** 見つかったあとのこと（物ごと）。when のルールが F の文は出さない（U は出す） */
export function foundAfter(ev: EventDef, answers: Record<string, Value>, facts: Map<string, Value>, rule: (id: string) => Parameters<typeof evalCond>[0] | undefined): { value: string; list: After[] }[] {
  const ok = (a: After) => !a.when || (rule(a.when) ? evalCond(rule(a.when)!, facts).v !== 'F' : true);
  return foundItems(ev, answers).map((v) => ({ value: v, list: (ev.found!.items.find((i) => i.value === v)?.after ?? []).filter(ok) })).filter((x) => x.list.length > 0);
}
