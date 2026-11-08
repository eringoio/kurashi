/* 「いまの1つ」（SPEC 6A.4）：次に確かめること、または次の一歩を1つ選ぶ。おすすめであり、ほかの項目を開くのを妨げない。 */
import type { CardView, EngineOutput } from './engine';
import type { Question } from './schema';

export type NowStep =
  | { kind: 'urgent'; view: CardView }
  | { kind: 'upfront'; q: Question }
  | { kind: 'card_q'; view: CardView; q: Question }
  | { kind: 'plan'; view: CardView }
  /** 目的の手続き（本人が選んだ。v0.5.30）：日を聞く前に、その手続きの説明（対象・書類・方法）を開く */
  | { kind: 'goal'; view: CardView }
  | { kind: 'wait'; view: CardView }
  | { kind: 'today'; views: CardView[] }
  | { kind: 'until'; views: CardView[] }
  | { kind: 'idle' };

/** urgentFirst：false なら、すぐ行う行動を質問より先に出さない（全体の画面のあるできごと。行動は画面の上に目立たせて出し、ほかを止めない。v0.5.28） */
export function nowStep(o: EngineOutput, today: string, { urgentFirst = true }: { urgentFirst?: boolean } = {}): NowStep {
  const open = o.cards.filter((c) => c.section !== 'done' && c.state !== 'excluded' && c.state !== 'out_of_scope');
  // 0. すぐ行う行動（カードの利用停止など）：当てはまるとわかったら、残りの質問より先に出す（DATA_CONTRACT 3章）
  // 本人が「よくわからない」と答えて当てはまるか決まらないとき（cause: unknown）も、止めるのは害が無いので先に出す
  if (urgentFirst) for (const c of open) if (c.card.urgent && (c.state === 'shown' || (c.state === 'check_at_office' && c.cause === 'unknown')) && c.plan?.status !== 'dismissed') return { kind: 'urgent', view: c };
  if (o.upfront.length) return { kind: 'upfront', q: o.upfront[0] };
  // 確かめの質問は、前提の段で並べ替える前の順（questionRank）で聞く
  const byQ = [...open].sort((a, b) => a.questionRank - b.questionRank);
  // 1. 答えるとわかること（まだわからない）
  for (const c of byQ) if (c.state === 'ask' && c.questions.length) return { kind: 'card_q', view: c, q: c.questions[0] };
  // 2. いま・確かめる項目の中の質問（住み始めたか、など）
  for (const c of byQ) if ((c.section === 'today' || c.section === 'check' || c.section === 'later') && !c.plan?.deferred && c.questions.length) return { kind: 'card_q', view: c, q: c.questions[0] };
  // 3. 今日が行く日（K-35）：今日の予定（/today と同じ項目）。「日を決める」より先に出す（今日の予定を隠さない）
  const due = agendaToday(o, today);
  if (due.length) return { kind: 'today', views: due };
  // 4. 日が決まっていない、いま・確かめる項目。目的の手続き（goal）は、日を聞く前に説明を開く（v0.5.30）。
  //    並びはエンジンの順（法令の義務 → 目的 → ほか）なので、期限のある義務は目的より先に出る
  for (const c of open) {
    if (c.section !== 'today' && c.section !== 'check') continue;
    if (c.goal && c.section === 'today' && !c.plan?.planned_on && (c.plan?.status ?? 'todo') === 'todo') return { kind: 'goal', view: c };
    if (!c.plan?.planned_on && c.dayRule.kind !== 'no_day') return { kind: 'plan', view: c };
  }
  // 5. 届くのを待っている
  for (const c of open) if (c.section === 'wait') return { kind: 'wait', view: c };
  // 6. 約束した日を待つ（今日より後の日だけ。今日の日は 3 で出す）
  const until = open.filter((c) => c.plan?.planned_on && c.plan.planned_on > today);
  if (until.length) return { kind: 'until', views: until };
  return { kind: 'idle' };
}

/** 今日が行く日の項目（済んだ・やめた・対象外を除く）。「いま」の today と、今日の予定（/today）で同じものを使う（K-35） */
export function agendaToday(o: EngineOutput, today: string): CardView[] {
  return o.cards.filter((c) => c.plan?.planned_on === today && c.plan.status !== 'done' && c.plan.status !== 'dismissed'
    && c.section !== null && c.section !== 'done' && c.state !== 'excluded' && c.state !== 'out_of_scope');
}
