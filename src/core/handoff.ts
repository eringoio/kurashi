/* 前の画面で選んだ答えを、できごとの入口の質問へ引き継ぐ（kaizen sumai 5：住まいの入居・退去 → 引っ越しの届け出）。画面に依存しない。
   - 入口の質問で、選択肢にある値だけを使う（データの event_links.answers。読み込みの検査でも確かめる）
   - まだ答えていない質問だけに入れる。答えてあれば、その答えのまま（保存済みの答えを書き換えない） */
import type { Question, Value } from './schema';

export interface HandoffItem {
  q: Question;
  /** 画面に出す答え（apply・same は引き継いだ値、kept は前の答え） */
  value: Value;
  /** apply：入れる／same：前から同じ答え／kept：前の答えが違うので、そのまま */
  kind: 'apply' | 'same' | 'kept';
}

export function handoffPlan(qids: string[], questions: Question[], answers: Record<string, Value | undefined>, given: Record<string, Value>): HandoffItem[] {
  return Object.entries(given).flatMap(([qid, v]): HandoffItem[] => {
    const q = questions.find((x) => x.id === qid);
    if (!q || !qids.includes(qid) || !q.options.some((o) => o.value === v)) return [];
    const cur = answers[qid];
    if (cur === undefined) return [{ q, value: v, kind: 'apply' }];
    return [{ q, value: cur, kind: cur === v ? 'same' : 'kept' }];
  });
}
