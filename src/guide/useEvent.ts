/* 生活イベントの共通の経路（/e/{event_id}）のための保存と判定。イベントごとの画面・判定の関数は作らない（SPEC 9.5 v0.4.7）。
   引っ越し（/move）は今までどおり useGuide を使う。古い保存は occ-legacy として一覧に出す（書き換えない）。
   書き込みは eventStore が、毎回最新の保存を読んでから行う（連続で呼んでも前の保存を消さない）。 */
import { useMemo } from 'react';
import { DATA } from '../core/data';
import { todayJst } from '../core/date';
import { run, type EngineOutput } from '../core/engine';
import type { PlanRecord } from '../core/entry';
import { answersFor, type Occurrence } from '../core/occurrence';
import type { EventDef, Value } from '../core/schema';
import { usePrefs } from '../storage/prefs';
import { eventStore } from './eventStore';

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
  /** 複数の手続きに同じ変更を一度に書く（同じ所の日をまとめて決める） */
  setPlans(cardIds: string[], patch: Partial<PlanRecord>): Promise<void>;
}

export function useEvent(eventId: string): EventGuide | null {
  const { vault: v } = usePrefs();
  const rev = v.rev;
  return useMemo(() => {
    const data = DATA();
    const event = data.events.find((e) => e.id === eventId);
    if (!event) return null;
    const today = todayJst();
    const store = eventStore(v, eventId, { questions: data.questions, cards: data.cards, today: todayJst });
    const all = store.list();
    const occ = store.current();
    const profile = Object.fromEntries(v.entries('profile')) as Record<string, Value>;
    const answers = answersFor(occ, profile, data.questions);
    const mode = !import.meta.env.PROD && v.get<string>('settings', 'review_mode') === 'verified' ? 'verified' : 'public';
    const out = run(data, { answers, objects: {}, plan: occ?.plan ?? {}, createdOn: occ?.started_on ?? null, today, mode, event });
    return {
      today, event, occ, all, answers, out, mode,
      startNew: store.startNew, answer: store.answer, setPlan: store.setPlan, setPlans: store.setPlans,
    } satisfies EventGuide;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, rev, eventId]);
}
