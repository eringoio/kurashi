/* 三値の評価（SPEC 9.2 の真理値表）。結果と一緒に、未定の原因（未回答の事実・「わからない」の事実）を返す。 */
import type { Condition, Value } from './schema';

export type TV = 'T' | 'F' | 'U';
/** 事実：値がない＝未回答、'unknown'＝本人の「わからない」 */
export type Facts = Map<string, Value>;

export interface Eval {
  v: TV;
  unanswered: Set<string>;
  unknown: Set<string>;
  /** 未確認のルールが原因に含まれる */
  unverified: boolean;
}

const mk = (v: TV, unanswered = new Set<string>(), unknown = new Set<string>(), unverified = false): Eval => ({ v, unanswered, unknown, unverified });

/** 未定の子の原因をまとめる（結果が U のときだけ意味がある） */
function merge(v: TV, parts: Eval[]): Eval {
  if (v !== 'U') return mk(v);
  const out = mk('U');
  for (const p of parts) {
    if (p.v !== 'U') continue;
    p.unanswered.forEach((f) => out.unanswered.add(f));
    p.unknown.forEach((f) => out.unknown.add(f));
    out.unverified ||= p.unverified;
  }
  return out;
}

export function combineAll(parts: Eval[]): Eval {
  const v: TV = parts.some((p) => p.v === 'F') ? 'F' : parts.some((p) => p.v === 'U') ? 'U' : 'T';
  return merge(v, parts);
}
export function combineAny(parts: Eval[]): Eval {
  const v: TV = parts.some((p) => p.v === 'T') ? 'T' : parts.some((p) => p.v === 'U') ? 'U' : 'F';
  return merge(v, parts);
}

export function evalCond(c: Condition, facts: Facts): Eval {
  if ('all' in c) return combineAll(c.all.map((x) => evalCond(x, facts)));
  if ('any' in c) return combineAny(c.any.map((x) => evalCond(x, facts)));
  if ('not' in c) {
    const e = evalCond(c.not, facts);
    return { ...e, v: e.v === 'T' ? 'F' : e.v === 'F' ? 'T' : 'U' };
  }
  const val = facts.get(c.fact);
  if (val === undefined) return mk('U', new Set([c.fact]));
  if (val === 'unknown') return mk('U', new Set(), new Set([c.fact]));
  const hit = 'has' in c ? Array.isArray(val) && val.includes(c.has) : Array.isArray(val) ? false : 'eq' in c ? val === c.eq : c.in.includes(val);
  return mk(hit ? 'T' : 'F');
}

/** 条件式が使う事実の名前 */
export function factsIn(c: Condition, out = new Set<string>()): Set<string> {
  if ('all' in c) c.all.forEach((x) => factsIn(x, out));
  else if ('any' in c) c.any.forEach((x) => factsIn(x, out));
  else if ('not' in c) factsIn(c.not, out);
  else out.add(c.fact);
  return out;
}
