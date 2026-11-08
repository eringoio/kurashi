/* 開いたときの入口の出し分け（SPEC 6A.1「開いたときの入口の出し分け」）。
   上から順に判定し、最初に当てはまったものを返す。画面の名前には依存しない。 */
import { before, sameDay, type Ymd } from './date';
import { LEGACY_EVENT, LEGACY_ID, type Occurrence } from './occurrence';

/** 途中の手順（9.9 の resume） */
export interface Resume { step: string; card_id?: string; started_on: Ymd }
/** plan の1件（9.9） */
export interface PlanRecord {
  card_id: string; status: 'todo' | 'preparing' | 'submitted' | 'waiting' | 'done' | 'dismissed'; planned_on?: Ymd;
  /** 付き添いの「終わったら」の結果（作者 11/6 B-7。9.9）。できた／できなかった（理由は任意）。選んでいない手続きは持たない（未確認） */
  visit_result?: { place: string; result: 'done' | 'not_done'; reason?: 'need_document' | 'wrong_place'; on: Ymd };
  /** 付き添いの「終わったら」で、窓口で言われたこと（別の書類が要る／ここではない）。「確かめる」に移す（6A.6） */
  visit_told?: 'need_document' | 'wrong_place';
  visit_told_on?: Ymd;
  /** 手続きの中の物ごとの状態（カードの parts。財布の紛失：キャッシュカード・クレジットカードの停止。v0.5.28） */
  parts?: Record<string, PlanRecord['status']>;
}

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

/** 続きの行き先（K-39）：閉じていない出来事のうち、いちばん新しく始めたもの。
    引っ越し（E-move・古い保存の occ-legacy）は「いま」（/now）、ほかは /e/{id}。無ければ /now。
    同じ日に始めたものは、古い保存（occ-legacy）より生活イベントの出来事を先にする（古い保存の日は最初に保存した日のため） */
export function latestOpenEvent(occurrences: Occurrence[], legacy: Occurrence | null): Occurrence | null {
  const all = [...occurrences.filter((o) => o.id !== LEGACY_ID), ...(legacy ? [legacy] : [])].filter((o) => !o.closed_on);
  const rank = (o: Occurrence) => (o.id === LEGACY_ID ? 0 : 1);
  return all.sort((a, b) => b.started_on.localeCompare(a.started_on) || rank(b) - rank(a) || b.id.localeCompare(a.id))[0] ?? null;
}
export function continuePath(occurrences: Occurrence[], legacy: Occurrence | null): string {
  const o = latestOpenEvent(occurrences, legacy);
  return !o || o.event_id === LEGACY_EVENT ? '/now' : '/e/' + o.event_id;
}
