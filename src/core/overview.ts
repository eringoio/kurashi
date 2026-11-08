/* 全体の画面（SPEC 6A.17 v0.5.28：財布の紛失）。画面に依存しない。
   - 手続きを段（phases）ごとに全部見せる。すぐ行う行動は目立たせるが、ほかの手続きを止めない
   - 状態は4つ：未対応・対応中・完了・該当しない（保存は PlanRecord の status をそのまま使う）
   - 1つの手続きの中で別々に記録する物（parts：キャッシュカードとクレジットカード）は、物ごとに状態を持ち、手続きの状態はまとめて決める
   - 当てはまるかわからない（U）ものは「要確認」。対象・対象外を勝手に決めない */
import type { CardView, EngineOutput } from './engine';
import type { PlanRecord } from './entry';
import { evalCond, type TV } from './logic';
import type { EventDef, Value } from './schema';

export type Track = 'todo' | 'doing' | 'done' | 'na';
export const TRACKS: Track[] = ['todo', 'doing', 'done', 'na'];
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
    const v = evalCond(p.when, facts).v;
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

/** 全体の画面を出すか：段のあるできごとで、最初の質問（中身）に答えたあと */
export const overviewReady = (ev: EventDef, answers: Record<string, Value>): boolean =>
  !!ev.phases?.length && ev.questions.length > 0 && answers[ev.questions[0]] !== undefined;

/** 前に要ること（前提の関係で、まだ済んでいない）。カードを開いて準備するのは止めない */
export const prereqFrom = (c: CardView): string[] =>
  [...new Set(c.notes.filter((n) => n.kind === 'legal_prereq' || n.kind === 'practical_prereq' || n.kind === 'prereq_unknown').map((n) => (n.relation as { from: string }).from))];
