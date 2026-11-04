/* ガイドのデータを読み、型と参照（存在しない ID・出典のない根拠）を確かめる（SPEC 10.6）。
   壊れたデータは、画面に出す前にここで止める。 */
import { z } from 'zod';
import { Card, Flow, ObjectDef, Question, Relation, Rule, Source, type Condition, type RuleExpr } from './schema';
import sourcesJson from '../../data/sources.json';
import rulesJson from '../../data/rules.json';
import questionsJson from '../../data/questions.json';
import objectsJson from '../../data/objects.json';
import relationsJson from '../../data/relations.json';
import flowJson from '../../data/flow.json';

const cardFiles = import.meta.glob('../../data/cards/*.json', { eager: true, import: 'default' });

export interface GuideData {
  sources: Source[];
  rules: Map<string, Rule>;
  questions: Question[];
  objects: ObjectDef[];
  relations: Relation[];
  cards: Card[];
  flow: z.infer<typeof Flow>;
}

export function loadData(raw = { sources: sourcesJson, rules: rulesJson, questions: questionsJson, objects: objectsJson, relations: relationsJson, flow: flowJson, cards: Object.values(cardFiles) }): GuideData {
  const sources = z.array(Source).parse(raw.sources.sources);
  const rules = z.array(Rule).parse(raw.rules.rules);
  const questions = z.array(Question).parse(raw.questions.questions);
  const objects = z.array(ObjectDef).parse(raw.objects.objects);
  const relations = z.array(Relation).parse(raw.relations.relations);
  const cards = z.array(Card).parse(raw.cards);
  const flow = Flow.parse(raw.flow);
  const data: GuideData = { sources, rules: new Map(rules.map((r) => [r.id, r])), questions, objects, relations, cards, flow };
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

/** 参照の検査。CI でも同じものを回す（tests/core/data.test.ts） */
export function checkRefs(d: GuideData): string[] {
  const err: string[] = [];
  const src = new Set(d.sources.map((s) => s.source_id));
  const cards = new Set(d.cards.map((c) => c.id));
  const qFacts = new Set(d.questions.map((q) => q.fact));
  const objFacts = new Set(d.objects.flatMap((o) => o.yields_when_held.map((y) => y.fact)));
  const ev = (where: string, e: { source_ids: string[]; status: string }) => {
    if (e.status !== 'draft' && e.source_ids.length === 0) err.push(`${where}：出典がない`);
    e.source_ids.forEach((s) => { if (!src.has(s)) err.push(`${where}：出典 ${s} がない`); });
  };
  for (const r of d.rules.values()) {
    ev(r.id, r.evidence);
    for (const f of factsOf(r.condition, new Set())) {
      if (!qFacts.has(f) && !objFacts.has(f)) err.push(`${r.id}：事実 ${f} を聞く質問・持ち物がない`);
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
  }
  for (const r of d.relations) {
    ev(r.id, r.evidence);
    const ref = r.type === 'same_visit' ? r.card_ids : r.type === 'waits_for' ? [r.card_id] : [r.from, r.to];
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

let cached: GuideData | null = null;
export const DATA = (): GuideData => (cached ??= loadData());
