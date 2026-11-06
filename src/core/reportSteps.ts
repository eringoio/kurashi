/* 報告に付ける「どの手続きを、どの段階まで」（11/7 B-5。作者：報告で送るとき、どの手続きでどの段階まで進んだかも送る）。
   入れるのは card_id・status・stage だけ。答え（facts）・日付・場所の名前は入れない（SPEC 13.3・9.9）。 */
import type { PlanRecord } from './entry';

export type StepStatus = 'todo' | 'done' | 'not_done';
/** now：まだ行く日がない／visit：行く日を決めた／after：付き添いの「終わったら」の結果がある／card：いま開いている手続き */
export type StepStage = 'now' | 'visit' | 'after' | 'card';
export interface ReportStep { card_id: string; status: StepStatus; stage: StepStage }
export const MAX_STEPS = 50;
export const STEP_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function reportSteps(plan: Record<string, PlanRecord>, openCard: string | null): ReportStep[] {
  return Object.values(plan)
    .filter((p) => p && STEP_ID.test(p.card_id) && p.status !== 'dismissed')
    .map((p): ReportStep => ({
      card_id: p.card_id,
      status: p.status === 'done' ? 'done' : p.visit_result?.result === 'not_done' ? 'not_done' : 'todo',
      stage: p.card_id === openCard ? 'card' : p.visit_result ? 'after' : p.planned_on ? 'visit' : 'now',
    }))
    .slice(0, MAX_STEPS);
}

/** 報告の path から、開いている手続きの id（/c/{id}・/e/{event}/c/{id}） */
export const openCardOf = (path: string): string | null => /\/c\/([A-Za-z0-9_-]{1,64})$/.exec(path)?.[1] ?? null;
