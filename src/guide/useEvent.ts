/* 生活イベントの共通の経路（/e/{event_id}）のための保存と判定。イベントごとの画面・判定の関数は作らない（SPEC 9.5 v0.4.7）。
   引っ越し（/move）は今までどおり useGuide を使う。古い保存は occ-legacy として一覧に出す（書き換えない）。 */
import { useMemo } from 'react';
import { DATA } from '../core/data';
import { todayJst } from '../core/date';
import { run, type EngineOutput } from '../core/engine';
import type { PlanRecord } from '../core/entry';
import { answerTarget, answersFor, currentOf, legacyOccurrence, listOccurrences, newOccurrence, type Occurrence } from '../core/occurrence';
import type { EventDef, Value } from '../core/schema';
import { usePrefs } from '../storage/prefs';

export interface EventGuide {
  today: string;
  event: EventDef;
  /** いま進めている出来事（まだ始めていなければ null。同意の前は保存に書かず、メモリの中だけ） */
  occ: Occurrence | null;
  /** この人の出来事すべて（新しい順） */
  all: Occurrence[];
  answers: Record<string, Value>;
  out: EngineOutput;
  mode: 'public' | 'verified';
  /** 新しい出来事を始める（前の「済んだ」を使わない）。前の出来事は閉じる */
  startNew(): Promise<Occurrence>;
  answer(qid: string, v: Value): Promise<void>;
  setPlan(cardId: string, patch: Partial<PlanRecord>): Promise<void>;
}

export function useEvent(eventId: string): EventGuide | null {
  const { vault: v } = usePrefs();
  const rev = v.rev;
  return useMemo(() => {
    const data = DATA();
    const event = data.events.find((e) => e.id === eventId);
    if (!event) return null;
    const today = todayJst();
    const profile = Object.fromEntries(v.entries('profile')) as Record<string, Value>;
    const legacy = legacyOccurrence(profile, Object.fromEntries(v.entries('plan')) as Record<string, PlanRecord>, data.questions, v.get<string>('dates', 'created_on') ?? null);
    const all = listOccurrences(v.entries('occurrences').map(([, o]) => o as Occurrence), legacy);
    const occ = currentOf(all, eventId);
    const answers = answersFor(occ, profile, data.questions);
    const mode = !import.meta.env.PROD && v.get<string>('settings', 'review_mode') === 'verified' ? 'verified' : 'public';
    const out = run(data, { answers, objects: {}, plan: occ?.plan ?? {}, createdOn: occ?.started_on ?? null, today, mode, event });

    const save = (o: Occurrence) => v.put('occurrences', o.id, o);
    const ensure = async () => occ ?? (await startNew());
    async function startNew() {
      if (occ && occ.id !== 'occ-legacy') await save({ ...occ, closed_on: today });
      const o = newOccurrence(all, eventId, today);
      await save(o);
      return o;
    }
    return {
      today, event, occ, all, answers, out, mode, startNew,
      async answer(qid, value) {
        if (answerTarget(data.questions, qid) === 'profile') { await v.put('profile', qid, value); return; }
        const o = await ensure();
        await save({ ...o, answers: { ...o.answers, [qid]: value } });
      },
      async setPlan(cardId, patch) {
        const o = await ensure();
        const cur = o.plan[cardId] ?? { card_id: cardId, status: 'todo' as const };
        await save({ ...o, plan: { ...o.plan, [cardId]: { ...cur, ...patch, status_changed_on: today, data_version: data.cards.find((c) => c.id === cardId)?.data_version } as PlanRecord } });
      },
    } satisfies EventGuide;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, rev, eventId]);
}
