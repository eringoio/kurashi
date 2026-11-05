/* ガイドのデータを読み、型と参照（存在しない ID・出典のない根拠）を確かめる（SPEC 10.6）。
   壊れたデータは、画面に出す前にここで止める。 */
import { z } from 'zod';
import { Card, EventDef, Flow, ObjectDef, Question, Relation, Rule, Source, type Condition, type RuleExpr } from './schema';
import sourcesJson from '../../data/sources.json';
import rulesJson from '../../data/rules.json';
import questionsJson from '../../data/questions.json';
import objectsJson from '../../data/objects.json';
import relationsJson from '../../data/relations.json';
import flowJson from '../../data/flow.json';
import eventsJson from '../../data/events.json';

const cardFiles = import.meta.glob('../../data/cards/*.json', { eager: true, import: 'default' });
/** 下書き（drafts/data/*.bundle.json）は、開発で `vite --mode drafts`（npm run dev:drafts）のときだけ読む。
    本番ビルドでは MODE が production なので読まない（SPEC 18.9。tests/core/publish.test.ts とビルドの検査で確かめる） */
const draftFiles: Record<string, unknown> = import.meta.env.MODE === 'drafts'
  ? import.meta.glob('../../drafts/data/*.bundle.json', { eager: true, import: 'default' })
  : {};

export interface GuideData {
  sources: Source[];
  rules: Map<string, Rule>;
  questions: Question[];
  objects: ObjectDef[];
  relations: Relation[];
  cards: Card[];
  flow: z.infer<typeof Flow>;
  events: EventDef[];
}

export interface RawData {
  sources: { sources: unknown[] }; rules: { rules: unknown[] }; questions: { questions: unknown[] };
  objects: { objects: unknown[] }; relations: { relations: unknown[] }; flow: unknown; cards: unknown[];
  events?: { events: unknown[] };
}

const DEFAULT_RAW: RawData = { sources: sourcesJson, rules: rulesJson, questions: questionsJson, objects: objectsJson, relations: relationsJson, flow: flowJson, cards: Object.values(cardFiles), events: eventsJson };

/** data/ を読む。tests/fixtures の検証用データは、同じ形で raw に渡す（専用のコードを足さない） */
export function loadData(raw: RawData = DEFAULT_RAW): GuideData {
  const sources = z.array(Source).parse(raw.sources.sources);
  const rules = z.array(Rule).parse(raw.rules.rules);
  const questions = z.array(Question).parse(raw.questions.questions);
  const objects = z.array(ObjectDef).parse(raw.objects.objects);
  const relations = z.array(Relation).parse(raw.relations.relations);
  const cards = z.array(Card).parse(raw.cards);
  const flow = Flow.parse(raw.flow);
  const events = z.array(EventDef).parse(raw.events?.events ?? []);
  const data: GuideData = { sources, rules: new Map(rules.map((r) => [r.id, r])), questions, objects, relations, cards, flow, events };
  const dup = dupIds({ rule: rules.map((r) => r.id), card: cards.map((c) => c.id), question: questions.map((q) => q.id), object: objects.map((o) => o.id), relation: relations.map((r) => r.id), event: events.map((e) => e.id), source: sources.map((x) => x.source_id) });
  if (dup.length) throw new Error('データの重複ID：\n' + dup.join('\n'));
  const errors = checkRefs(data);
  if (errors.length) throw new Error('データの参照の誤り：\n' + errors.join('\n'));
  return data;
}

function factsOf(c: Condition, out: Set<string>) {
  if ('all' in c) c.all.forEach((x) => factsOf(x, out));
  else if ('any' in c) c.any.forEach((x) => factsOf(x, out));
  else if ('not' in c) factsOf(c.not, out);
  else out.add(c.fact);
  return out;
}
function ruleIds(e: RuleExpr, out: string[] = [], depth = 0): string[] {
  if (typeof e === 'string') out.push(e);
  else {
    if (depth > 1) out.push('!nest');
    ('all' in e ? e.all : e.any).forEach((x) => ruleIds(x, out, depth + 1));
  }
  return out;
}

function dupIds(groups: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [k, ids] of Object.entries(groups)) {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) out.push(`${k} ${id} が2つある`); seen.add(id); }
  }
  return out;
}

const LEVELS = ['ja', 'ja_easy', 'en'] as const;

/** 前提の関係（legal・practical）の循環を探す */
function cycles(d: GuideData): string[] {
  const next = new Map<string, string[]>();
  for (const r of d.relations) if (r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite') next.set(r.from, [...(next.get(r.from) ?? []), r.to]);
  const out: string[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (n: string, path: string[]) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) { out.push('前提の関係が循環：' + [...path.slice(path.indexOf(n)), n].join(' → ')); return; }
    state.set(n, 1);
    (next.get(n) ?? []).forEach((m) => visit(m, [...path, n]));
    state.set(n, 2);
  };
  [...next.keys()].forEach((n) => visit(n, []));
  return out;
}

/** 参照の検査。CI でも同じものを回す（tests/core/data.test.ts） */
export function checkRefs(d: GuideData): string[] {
  const err: string[] = [];
  const src = new Set(d.sources.map((s) => s.source_id));
  const cards = new Set(d.cards.map((c) => c.id));
  const qFacts = new Set(d.questions.map((q) => q.fact));
  const objFacts = new Set(d.objects.flatMap((o) => o.yields_when_held.map((y) => y.fact)));
  // イベントを選ぶと決まる事実も、聞かなくてよい事実として数える
  d.events.forEach((e) => e.facts.forEach((f) => objFacts.add(f.fact)));
  const productIds = new Set(d.sources.filter((s) => s.owner_type === 'product').map((s) => s.source_id));
  const ev = (where: string, e: { source_ids: string[]; status: string; checked_at?: string; verified_by?: string; quote?: string; ai_check?: unknown }) => {
    if (e.status !== 'draft' && e.source_ids.length === 0) err.push(`${where}：出典がない`);
    e.source_ids.forEach((s) => { if (!src.has(s)) err.push(`${where}：出典 ${s} がない`); });
    // 確認済みの根拠：本アプリの定義（product の出典だけ）以外は、確かめた人と原文の引用が要る（DATA_CONTRACT 5章）
    // 引用が無いものは warnings() で出す（作者の指示で確認済みにし、引用はあとで付けるもの：R-under-20）
    if (e.status === 'verified' && !e.source_ids.every((s) => productIds.has(s)) && !e.verified_by) err.push(`${where}：verified なのに verified_by がない`);
    // AI 照合済み（v0.4.9）：引用と照合の記録が要る。本文との突き合わせは scripts/check-quotes.ts
    if (e.status === 'ai_checked' && (!e.quote || !e.ai_check)) err.push(`${where}：ai_checked なのに quote か ai_check がない`);
  };
  const text3 = (where: string, t: Record<string, string>) => LEVELS.forEach((l) => { if (!t[l]) err.push(`${where}：${l} の文がない`); });
  for (const r of d.rules.values()) {
    ev(r.id, r.evidence);
    for (const f of factsOf(r.condition, new Set())) {
      if (!qFacts.has(f) && !objFacts.has(f)) err.push(`${r.id}：事実 ${f} を聞く質問・持ち物がない`);
    }
    if (r.kind === 'selection') {
      // 本人の選択だけを言い直すルール：出典は本アプリの定義だけ。持ち物から決まる事実は使わない（推測を混ぜない）
      if (!r.evidence.source_ids.every((x) => productIds.has(x))) err.push(`${r.id}：selection の出典は本アプリの定義だけ`);
      const eventFacts = new Set(d.events.flatMap((e) => e.facts.map((f) => f.fact)));
      for (const f of factsOf(r.condition, new Set())) if (!qFacts.has(f) && !eventFacts.has(f)) err.push(`${r.id}：selection が質問の答えでない事実 ${f} を使っている`);
    }
    const s = JSON.stringify(r.condition);
    if (s.includes('"unknown"')) err.push(`${r.id}：条件に "unknown" を書いている`);
  }
  for (const c of d.cards) {
    ev(c.id, c.evidence);
    if (c.deadline) ev(c.id + '.deadline', c.deadline.evidence);
    ev(c.id + '.where', c.where.evidence);
    const ids = ruleIds(c.eligibility).concat(c.coverage_rule_ids);
    ids.forEach((id) => { if (id === '!nest') err.push(`${c.id}：入れ子が2段以上`); else if (!d.rules.has(id)) err.push(`${c.id}：ルール ${id} がない`); });
    if (c.awareness_type === 'must' && !['legal', 'local_rule'].includes(c.obligation)) err.push(`${c.id}：must は legal・local_rule だけ`);
    if (!d.flow.card_order.includes(c.id)) err.push(`${c.id}：flow.json の card_order にない`);
    text3(c.id + '.title', c.title);
    text3(c.id + '.summary', c.summary);
    if (c.urgent) c.urgent.contacts.forEach((k, i) => { ev(`${c.id}.urgent[${i}]`, k.evidence); if (k.type === 'link' && !k.value.startsWith('https://')) err.push(`${c.id}.urgent[${i}]：https でないリンク`); });
    (c.methods ?? []).forEach((m, i) => { ev(`${c.id}.methods[${i}]`, m.evidence); if (m.when) ruleIds(m.when).forEach((id) => { if (!d.rules.has(id)) err.push(`${c.id}.methods[${i}]：ルール ${id} がない`); }); });
    (c.alternatives ?? []).forEach((a, i) => ev(`${c.id}.alternatives[${i}]`, a.evidence));
  }
  for (const id of d.flow.card_order) if (!cards.has(id)) err.push(`flow.json：カード ${id} がない`);
  for (const e of d.events) {
    ev(e.id, e.evidence);
    text3(e.id + '.title', e.title);
    e.card_ids.forEach((id) => { if (!cards.has(id)) err.push(`${e.id}：カード ${id} がない`); });
    e.questions.forEach((id) => { if (!d.questions.some((q) => q.id === id)) err.push(`${e.id}：質問 ${id} がない`); });
    if (e.scope_rule && !d.rules.has(e.scope_rule)) err.push(`${e.id}：範囲のルール ${e.scope_rule} がない`);
  }
  err.push(...cycles(d));
  for (const r of d.relations) {
    ev(r.id, r.evidence);
    const ref = r.type === 'same_visit' || r.type === 'parallel' ? r.card_ids : r.type === 'waits_for' ? [r.card_id] : [r.from, r.to];
    ref.forEach((id) => { if (!cards.has(id)) err.push(`${r.id}：カード ${id} がない`); });
    const rs = 'satisfied_when_rule_ids' in r ? r.satisfied_when_rule_ids ?? [] : 'when_rule_ids' in r ? r.when_rule_ids ?? [] : [];
    rs.forEach((id) => { if (!d.rules.has(id)) err.push(`${r.id}：ルール ${id} がない`); });
  }
  for (const o of d.objects) {
    ev(o.id, o.evidence);
    if (o.check_question && !d.questions.some((q) => q.id === o.check_question)) err.push(`${o.id}：質問 ${o.check_question} がない`);
  }
  return err;
}

/** 止めはしないが、作者に見せる注意（確認済みなのに原文の引用が無い、など） */
export function warnings(d: GuideData): string[] {
  const out: string[] = [];
  const product = new Set(d.sources.filter((s) => s.owner_type === 'product').map((s) => s.source_id));
  const chk = (where: string, e: { source_ids: string[]; status: string; quote?: string }) => {
    if (e.status === 'verified' && !e.source_ids.every((s) => product.has(s)) && !e.quote) out.push(`${where}：確認済みだが原文の引用（quote）がない`);
  };
  for (const r of d.rules.values()) chk(r.id, r.evidence);
  for (const c of d.cards) { chk(c.id, c.evidence); if (c.deadline) chk(c.id + '.deadline', c.deadline.evidence); chk(c.id + '.where', c.where.evidence); }
  for (const r of d.relations) chk(r.id, r.evidence);
  return out;
}

/** 追加のまとまり（下書き drafts/data/<名前>/、検証用 tests/fixtures/<名前>/）。data/ と同じ形の一部だけを持つ */
export interface Bundle {
  cards?: unknown[];
  rules?: unknown[]; questions?: unknown[]; objects?: unknown[]; relations?: unknown[]; sources?: unknown[]; events?: unknown[];
  card_order?: string[];
}
/** 本体のデータに、まとまりを足す（上書きはしない。同じIDは loadData の重複検査で止まる）。イベントごとのコードは要らない */
export function withBundles(base: RawData, bundles: Bundle[]): RawData {
  const out: RawData = {
    ...base,
    sources: { sources: [...base.sources.sources] }, rules: { rules: [...base.rules.rules] }, questions: { questions: [...base.questions.questions] },
    objects: { objects: [...base.objects.objects] }, relations: { relations: [...base.relations.relations] },
    events: { events: [...(base.events?.events ?? [])] }, cards: [...base.cards],
    flow: { ...(base.flow as object), card_order: [...(base.flow as { card_order: string[] }).card_order] },
  };
  for (const b of bundles) {
    out.sources.sources.push(...(b.sources ?? [])); out.rules.rules.push(...(b.rules ?? [])); out.questions.questions.push(...(b.questions ?? []));
    out.objects.objects.push(...(b.objects ?? [])); out.relations.relations.push(...(b.relations ?? [])); out.events!.events.push(...(b.events ?? []));
    out.cards.push(...(b.cards ?? []));
    (out.flow as { card_order: string[] }).card_order.push(...(b.card_order ?? []));
  }
  return out;
}
export const baseRaw = (): RawData => DEFAULT_RAW;

let cached: GuideData | null = null;
export const DATA = (): GuideData => (cached ??= loadData(Object.keys(draftFiles).length ? withBundles(DEFAULT_RAW, Object.values(draftFiles) as Bundle[]) : DEFAULT_RAW));
/** 下書きを読み込んでいるか（画面に「下書き」の帯を出すため） */
export const DRAFTS_LOADED = Object.keys(draftFiles).length > 0;
