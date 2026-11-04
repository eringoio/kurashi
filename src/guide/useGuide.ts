/* 答え・持ち物・わたしの手続きを保存（vault）から読み、ルールエンジンにかける。変えるたびに保存し、計算し直す（SPEC 10.1）。 */
import { useMemo } from 'react';
import { DATA } from '../core/data';
import { todayJst } from '../core/date';
import { run, type EngineOutput } from '../core/engine';
import type { PlanRecord, Resume } from '../core/entry';
import type { Value } from '../core/schema';
import { usePrefs } from '../storage/prefs';

export interface Guide {
  today: string;
  answers: Record<string, Value>;
  objects: Record<string, boolean>;
  objectsDone: boolean;
  plan: Record<string, PlanRecord>;
  out: EngineOutput;
  mode: 'public' | 'verified';
  answer(qid: string, v: Value): Promise<void>;
  setObjects(held: Record<string, boolean>): Promise<void>;
  setPlan(cardId: string, patch: Partial<PlanRecord>): Promise<void>;
  setResume(step: string | null): Promise<void>;
  markSeenAll(): Promise<boolean>;
}

export function useGuide(): Guide {
  const { vault: v } = usePrefs();
  const rev = v.rev;
  return useMemo(() => {
    const today = todayJst();
    const answers = Object.fromEntries(v.entries('profile')) as Record<string, Value>;
    const objects = Object.fromEntries(v.entries('objects').map(([k, o]) => [k, (o as { held: boolean }).held]));
    const plan = Object.fromEntries(v.entries('plan')) as Record<string, PlanRecord>;
    const mode = v.get<string>('settings', 'review_mode') === 'verified' ? 'verified' : 'public';
    const createdOn = v.get<string>('dates', 'created_on') ?? null;
    const out = run(DATA(), { answers, objects, plan, createdOn, today, mode });
    const touch = async () => { if (!v.get('dates', 'created_on')) await v.put('dates', 'created_on', today); };
    return {
      today, answers, objects, plan, out, mode,
      objectsDone: !!v.get('dates', 'objects_done_on'),
      async answer(qid, value) { await touch(); await v.put('profile', qid, value); },
      async setObjects(held) {
        await touch();
        for (const o of DATA().objects) if (o.id in held) await v.put('objects', o.id, { held: held[o.id], checked_on: today });
        await v.put('dates', 'objects_done_on', today);
      },
      async setPlan(cardId, patch) {
        const cur = plan[cardId] ?? { card_id: cardId, status: 'todo' as const };
        await v.put('plan', cardId, { ...cur, ...patch, status_changed_on: today, data_version: DATA().cards.find((c) => c.id === cardId)?.data_version });
      },
      async setResume(step) {
        if (step) { if (v.get<Resume>('resume', 'value')?.step !== step) await v.put('resume', 'value', { step, started_on: today } satisfies Resume); }
        else if (v.get('resume', 'value')) await v.del('resume', 'value');
      },
      /** 全体を自動で開くのは、最初の確かめのあとの1回だけ（6A.4）。初めてなら true */
      async markSeenAll() {
        if (v.get('dates', 'seen_all_on')) return false;
        await v.put('dates', 'seen_all_on', today);
        return true;
      },
    } satisfies Guide;
    // rev：保存が変わったら計算し直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, rev]);
}
