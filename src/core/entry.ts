/* 開いたときの入口の出し分け（SPEC 6A.1「開いたときの入口の出し分け」）。
   上から順に判定し、最初に当てはまったものを返す。画面の名前には依存しない。 */
import { before, sameDay, type Ymd } from './date';

/** 途中の手順（9.9 の resume） */
export interface Resume { step: string; card_id?: string; started_on: Ymd }
/** plan の1件（9.9） */
export interface PlanRecord { card_id: string; status: 'todo' | 'preparing' | 'submitted' | 'waiting' | 'done' | 'dismissed'; planned_on?: Ymd }

export interface EntryInput {
  today: Ymd;
  /** URL で開いた先（/c/{card_id} や /s/{scene_id}）。なければ null */
  url: { kind: 'card'; card_id: string } | { kind: 'scene'; scene_id: string } | null;
  resume: Resume | null;
  hasProgress: boolean;
  plan: PlanRecord[];
  /** 届くのを待っている物があるか（items と waits_for から決まる） */
  waiting: boolean;
  /** 実施すべき項目がすべて済んだか（ルールエンジンの結果から） */
  allDone: boolean;
}

export type Entry =
  | { kind: 'card'; card_id: string }
  | { kind: 'scene'; scene_id: string }
  | { kind: 'resume'; resume: Resume }
  | { kind: 'resume_confirm'; resume: Resume }
  | { kind: 'promise_today'; card_ids: string[] }
  | { kind: 'promise_past'; card_ids: string[] }
  | { kind: 'waiting' }
  | { kind: 'now' }
  | { kind: 'all_done' }
  | { kind: 'menu' };

const open = (p: PlanRecord) => p.status !== 'done' && p.status !== 'dismissed';

export function chooseEntry(x: EntryInput): Entry {
  if (x.url?.kind === 'card') return { kind: 'card', card_id: x.url.card_id };
  if (x.url?.kind === 'scene') return { kind: 'scene', scene_id: x.url.scene_id };
  if (x.resume) return sameDay(x.resume.started_on, x.today) ? { kind: 'resume', resume: x.resume } : { kind: 'resume_confirm', resume: x.resume };
  if (!x.hasProgress) return { kind: 'menu' };
  const planned = x.plan.filter((p) => open(p) && p.planned_on);
  const today = planned.filter((p) => sameDay(p.planned_on!, x.today)).map((p) => p.card_id);
  if (today.length) return { kind: 'promise_today', card_ids: today };
  const past = planned.filter((p) => before(p.planned_on!, x.today)).map((p) => p.card_id);
  if (past.length) return { kind: 'promise_past', card_ids: past };
  if (x.waiting) return { kind: 'waiting' };
  if (x.allDone) return { kind: 'all_done' };
  return { kind: 'now' };
}
