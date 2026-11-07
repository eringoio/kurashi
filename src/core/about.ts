/* 「あなたについて」（作者の指示 2026-11-07。docs/QUESTIONS.md 1章）：国籍・在留資格（日本以外のとき）・立場・年齢。
   最初にこれを要る入口で、まとめて1回聞く。答えは person（profile）なので、ほかの入口でも使う。答えずに進むこともできる。 */
import { evalCond } from './logic';
import type { Question, Value } from './schema';

/** 答えずに進んだ印（settings のキー） */
export const ABOUT_SKIPPED = 'about.skipped';

export const aboutQuestions = (qs: Question[]) => qs.filter((q) => q.group === 'about');

const factsOf = (qs: Question[], answers: Record<string, Value>) => {
  const f = new Map<string, Value>();
  for (const q of qs) if (answers[q.id] !== undefined) f.set(q.fact, answers[q.id]);
  return f;
};

/** いま聞けるあなたについての質問（ask_when が T のもの。答えたものも含む） */
export function aboutAskable(qs: Question[], answers: Record<string, Value>): Question[] {
  const f = factsOf(qs, answers);
  return aboutQuestions(qs).filter((q) => evalCond(q.ask_when, f).v === 'T');
}

/** 次に聞く1つ（未回答で、いま聞けるもの）。無ければ undefined */
export const aboutNext = (qs: Question[], answers: Record<string, Value>) => aboutAskable(qs, answers).find((q) => answers[q.id] === undefined);

/** この入口でまとめて聞くか（答えずに進んでいないとき）：最初の質問にあなたについての質問が1つでもある、または、もう答え始めている（始めたら最後まで。ほかの入口でまた聞かないように） */
export const wantsAbout = (upfront: Question[], skipped: boolean, qs: Question[] = [], answers: Record<string, Value> = {}) =>
  !skipped && (upfront.some((q) => q.group === 'about') || aboutQuestions(qs).some((q) => answers[q.id] !== undefined));
