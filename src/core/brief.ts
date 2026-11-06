/* 短い一文（作者の指摘 11/6「文字が多い」。STATUS 10d）。開いた項目・カードには短い一文だけを出し、全文はシート（くわしく）に置く。
   カードに lead があればそれ。無ければ summary の最初の一文（各言語）。（要確認）が後ろの文にあれば、一文の終わりに付ける（言い切らない。v0.5.2） */
import type { Text } from './schema';

const HEDGE: Record<string, string> = { ja: '（{要|よう}{確認|かくにん}）', ja_easy: '（{要|よう}{確認|かくにん}）', en: ' (to be checked)' };

/** 最初の一文。日本語は「。」、英語は「. 」で切る。かっこの中の「。」では切らない */
export function firstSentence(s: string, lang: string): string {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '（' || ch === '(' || ch === '「') depth++;
    else if (ch === '）' || ch === ')' || ch === '」') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (lang.startsWith('ja') && ch === '。') return s.slice(0, i + 1);
      if (!lang.startsWith('ja') && ch === '.' && s[i + 1] === ' ' && /[a-z0-9)]/i.test(s[i - 1] ?? '') && !/\b(e\.g|i\.e|etc|approx|No)$/i.test(s.slice(0, i))) return s.slice(0, i + 1);
    }
  }
  return s;
}

const plain = (s: string) => s.replace(/\{([^|}]+)\|[^}]+\}/g, '$1');
const hedged = (s: string) => /要確認|to be checked/i.test(plain(s));

/** 一文にする。後ろの文に要確認があれば、一文にも付ける */
export function briefText(t: Text): Text {
  const out: Text = { ja: '' };
  for (const [k, v] of Object.entries(t)) {
    if (typeof v !== 'string') continue;
    const one = firstSentence(v, k);
    out[k] = one !== v && hedged(v) && !hedged(one) && HEDGE[k] ? one.replace(/([。.])$/, HEDGE[k] + '$1') : one;
  }
  return out;
}

/** カードの短い一文 */
export function cardLead(card: { lead?: Text; summary: Text }): Text {
  if (!card.lead) return briefText(card.summary);
  // 本文が要確認なら、一文にも付ける（言い切らない）
  const out: Text = { ja: '' };
  for (const [k, v] of Object.entries(card.lead)) {
    if (typeof v !== 'string') continue;
    const s = card.summary[k];
    out[k] = typeof s === 'string' && hedged(s) && !hedged(v) && HEDGE[k] ? v.replace(/([。.])$/, HEDGE[k] + '$1') : v;
  }
  return out;
}
