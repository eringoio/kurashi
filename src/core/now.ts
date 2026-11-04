/* 「いまの1つ」（SPEC 6A.4）：次に確かめること、または次の一歩を1つ選ぶ。おすすめであり、ほかの項目を開くのを妨げない。 */
import type { CardView, EngineOutput } from './engine';
import type { Question } from './schema';

export type NowStep =
  | { kind: 'urgent'; view: CardView }
  | { kind: 'upfront'; q: Question }
  | { kind: 'card_q'; view: CardView; q: Question }
  | { kind: 'plan'; view: CardView }
  | { kind: 'wait'; view: CardView }
  | { kind: 'until'; views: CardView[] }
  | { kind: 'idle' };

export function nowStep(o: EngineOutput, today: string): NowStep {
  const open = o.cards.filter((c) => c.section !== 'done' && c.state !== 'excluded' && c.state !== 'out_of_scope');
  // 0. すぐ行う行動（カードの利用停止など）：当てはまるとわかったら、残りの質問より先に出す（DATA_CONTRACT 3章）
  for (const c of open) if (c.card.urgent && c.state === 'shown' && c.plan?.status !== 'dismissed') return { kind: 'urgent', view: c };
  if (o.upfront.length) return { kind: 'upfront', q: o.upfront[0] };
  // 1. 答えるとわかること（まだわからない）
  for (const c of open) if (c.state === 'ask' && c.questions.length) return { kind: 'card_q', view: c, q: c.questions[0] };
  // 2. いま・確かめる項目の中の質問（住み始めたか、など）
  for (const c of open) if ((c.section === 'today' || c.section === 'check' || c.section === 'later') && c.questions.length) return { kind: 'card_q', view: c, q: c.questions[0] };
  // 3. 日が決まっていない、いま・確かめる項目
  for (const c of open) if ((c.section === 'today' || c.section === 'check') && !c.plan?.planned_on && c.dayRule.kind !== 'no_day') return { kind: 'plan', view: c };
  // 4. 届くのを待っている
  for (const c of open) if (c.section === 'wait') return { kind: 'wait', view: c };
  // 5. 約束した日を待つ
  const until = open.filter((c) => c.plan?.planned_on && c.plan.planned_on >= today);
  if (until.length) return { kind: 'until', views: until };
  return { kind: 'idle' };
}
