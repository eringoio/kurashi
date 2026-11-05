/* 出来事ごとの進捗（SPEC 9.9 v0.4.7・docs/DATA_CONTRACT.md 4章）。画面に依存しない純粋な関数。
   - 人の答え（質問の scope: person）は profile。出来事の答え（scope: event）と進捗は出来事ごと。
   - 同じイベントをもう一度始めたら新しい出来事にする。前の出来事の「済んだ」は使わない。
   - v0.4.6 までの保存（引っ越しの答えと plan）は、E-move の出来事 occ-legacy として読む（書き換えない）。 */
import type { PlanRecord } from './entry';
import type { Question, Value } from './schema';

export interface Occurrence {
  id: string;
  event_id: string;
  started_on: string;
  closed_on?: string;
  /** 出来事の答え（question_id → 値） */
  answers: Record<string, Value>;
  /** card_id → 進捗 */
  plan: Record<string, PlanRecord>;
}

export const LEGACY_ID = 'occ-legacy';
export const LEGACY_EVENT = 'E-move';

const scopeOf = (questions: Question[], qid: string) => questions.find((q) => q.id === qid)?.scope ?? 'event';

/** v0.4.6 までの保存から、引っ越しの出来事を作る（保存があるときだけ）。保存そのものは変えない */
export function legacyOccurrence(profile: Record<string, Value>, plan: Record<string, PlanRecord>, questions: Question[], createdOn: string | null): Occurrence | null {
  const answers = Object.fromEntries(Object.entries(profile).filter(([qid]) => scopeOf(questions, qid) === 'event'));
  if (!Object.keys(answers).length && !Object.keys(plan).length) return null;
  return { id: LEGACY_ID, event_id: LEGACY_EVENT, started_on: createdOn ?? '1970-01-01', answers, plan };
}

/** 保存されている出来事の一覧（古い保存の引っ越しを含む）。新しい順 */
export function listOccurrences(stored: Occurrence[], legacy: Occurrence | null): Occurrence[] {
  const all = legacy && !stored.some((o) => o.id === LEGACY_ID) ? [...stored, legacy] : stored;
  return [...all].sort((a, b) => b.started_on.localeCompare(a.started_on) || b.id.localeCompare(a.id));
}

/** そのイベントで、いま進めている出来事（閉じていない最新）。無ければ null */
export function currentOf(list: Occurrence[], eventId: string): Occurrence | null {
  return list.find((o) => o.event_id === eventId && !o.closed_on) ?? null;
}

/** 新しい出来事。ID は既存と重ならない連番（答え・日付・個人の情報を ID に入れない。13.4） */
export function newOccurrence(list: Occurrence[], eventId: string, today: string): Occurrence {
  const base = 'occ-' + eventId.replace(/^E-/, '').toLowerCase();
  let n = list.filter((o) => o.id.startsWith(base + '-')).length + 1;
  while (list.some((o) => o.id === `${base}-${n}`)) n++;
  return { id: `${base}-${n}`, event_id: eventId, started_on: today, answers: {}, plan: {} };
}

/** エンジンに渡す答え：人の答え（profile のうち scope: person）＋この出来事の答え（出来事のほうを優先） */
export function answersFor(occ: Occurrence | null, profile: Record<string, Value>, questions: Question[]): Record<string, Value> {
  const person = Object.fromEntries(Object.entries(profile).filter(([qid]) => scopeOf(questions, qid) === 'person'));
  return { ...person, ...(occ?.answers ?? {}) };
}

/** 答えを書く先：person は profile、event は出来事 */
export const answerTarget = (questions: Question[], qid: string): 'profile' | 'occurrence' => (scopeOf(questions, qid) === 'person' ? 'profile' : 'occurrence');

/** 生活イベント（/e/...）で決めた行く日も、入口の出し分け（約束した日。6A.1）に使う。
    閉じていない出来事の plan だけ。occ-legacy は引っ越しの plan そのもの（useGuide が読む）なので入れない */
export function openEventPlans(stored: Occurrence[]): { event_id: string; plan: PlanRecord }[] {
  return stored
    .filter((o) => o.id !== LEGACY_ID && !o.closed_on)
    .flatMap((o) => Object.values(o.plan).map((plan) => ({ event_id: o.event_id, plan })));
}
