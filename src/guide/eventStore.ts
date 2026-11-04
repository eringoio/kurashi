/* 生活イベントの出来事の保存（SPEC 9.9 v0.4.7）。React に依存しない。
   書くたびに、保存されている最新の出来事を読み直してから書く（画面を描いた時点の古い値に足して上書きしない）。
   連続で呼ばれても、前の保存を消さない。出来事が無いときに続けて呼ばれても、出来事は1つだけ作る。 */
import type { PlanRecord } from '../core/entry';
import { answerTarget, currentOf, legacyOccurrence, listOccurrences, newOccurrence, LEGACY_ID, type Occurrence } from '../core/occurrence';
import type { Card, Question, Value } from '../core/schema';
import type { Vault } from '../storage/vault';

type Store = Pick<Vault, 'entries' | 'get' | 'put'>;

/** 作成中の出来事（同じ保存・同じイベントで、二重に作らないため） */
const creating = new WeakMap<object, Map<string, Promise<Occurrence>>>();

export interface EventStoreDeps { questions: Question[]; cards: Pick<Card, 'id' | 'data_version'>[]; today: () => string }

export function eventStore(v: Store, eventId: string, d: EventStoreDeps) {
  /** いまの保存から、この人の出来事の一覧（古い保存の引っ越しを含む）を作る */
  const list = (): Occurrence[] => {
    const profile = Object.fromEntries(v.entries('profile')) as Record<string, Value>;
    const legacy = legacyOccurrence(profile, Object.fromEntries(v.entries('plan')) as Record<string, PlanRecord>, d.questions, v.get<string>('dates', 'created_on') ?? null);
    return listOccurrences(v.entries('occurrences').map(([, o]) => o as Occurrence), legacy);
  };
  /** いま進めている出来事（毎回、最新を読む） */
  const current = () => currentOf(list(), eventId);
  const save = (o: Occurrence) => v.put('occurrences', o.id, o);

  async function startNew(): Promise<Occurrence> {
    const prev = current();
    if (prev && prev.id !== LEGACY_ID) await save({ ...prev, closed_on: d.today() });
    const o = newOccurrence(list(), eventId, d.today());
    await save(o);
    return o;
  }
  /** 出来事が無ければ1つだけ作る。作っている途中に呼ばれたら、同じものを待つ */
  async function ensure(): Promise<Occurrence> {
    const now = current();
    if (now) return now;
    let m = creating.get(v);
    if (!m) creating.set(v, (m = new Map()));
    let p = m.get(eventId);
    if (!p) {
      p = startNew().finally(() => m!.delete(eventId));
      m.set(eventId, p);
    }
    await p;
    return current()!;
  }
  /** 最新の出来事を読み、変えて、書く。読みから書きまでの間に await を入れない（ほかの書き込みと混ざらないため） */
  async function update(f: (o: Occurrence) => Occurrence) {
    await ensure();
    await save(f(current()!));
  }
  const record = (o: Occurrence, cardId: string, patch: Partial<PlanRecord>): PlanRecord => {
    const cur = o.plan[cardId] ?? { card_id: cardId, status: 'todo' as const };
    return { ...cur, ...patch, status_changed_on: d.today(), data_version: d.cards.find((c) => c.id === cardId)?.data_version } as PlanRecord;
  };

  return {
    current,
    list,
    startNew,
    async answer(qid: string, value: Value) {
      if (answerTarget(d.questions, qid) === 'profile') { await v.put('profile', qid, value); return; }
      await update((o) => ({ ...o, answers: { ...o.answers, [qid]: value } }));
    },
    setPlan(cardId: string, patch: Partial<PlanRecord>) {
      return update((o) => ({ ...o, plan: { ...o.plan, [cardId]: record(o, cardId, patch) } }));
    },
    /** 複数の手続きに同じ変更を一度に書く（同じ所の日をまとめて決める。6A.5） */
    setPlans(cardIds: string[], patch: Partial<PlanRecord>) {
      return update((o) => ({ ...o, plan: { ...o.plan, ...Object.fromEntries(cardIds.map((id) => [id, record(o, id, patch)])) } }));
    },
  };
}
