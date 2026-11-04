/* ガイドのデータの型（SPEC 9章）。Zod で読み込むときに確かめる。ここにない項目は、使うときに足す。 */
import { z } from 'zod';

export const Status = z.enum(['draft', 'needs_check', 'verified', 'outdated']);
export type Status = z.infer<typeof Status>;

export const Evidence = z.object({
  source_ids: z.array(z.string()),
  checked_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: Status,
  note: z.string().optional(),
  review_after_days: z.number().nullable().optional(),
  /** 確かめた人（author など）と、原文の短い引用（docs/DATA_UPDATE.md） */
  verified_by: z.string().optional(),
  quote: z.string().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

/** 言語ごとの文。ja は必須。ほかの表示レベルは任意（足りないときは日本語に戻す） */
export const Text = z.object({ ja: z.string() }).catchall(z.string());
export type Text = z.infer<typeof Text>;

export type Value = string | boolean;
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: string; eq: Value }
  | { fact: string; in: Value[] };
const ValueZ = z.union([z.string(), z.boolean()]);
export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(Condition) }).strict(),
    z.object({ any: z.array(Condition) }).strict(),
    z.object({ not: Condition }).strict(),
    z.object({ fact: z.string(), eq: ValueZ }).strict(),
    z.object({ fact: z.string(), in: z.array(ValueZ) }).strict(),
  ]),
);

export const Source = z.object({
  source_id: z.string(),
  url: z.string().url().nullable(),
  owner: z.string(),
  owner_type: z.enum(['government', 'public_corp', 'school', 'private', 'product']),
  title: z.string(),
  language: z.string(),
});
export type Source = z.infer<typeof Source>;

export const Rule = z.object({
  id: z.string().regex(/^R-/),
  kind: z.enum(['eligibility', 'entry', 'coverage', 'scope', 'timing', 'document', 'relation']),
  condition: Condition,
  statement: Text,
  reason_when_false: Text.optional(),
  keep_needs_check: z.boolean().optional(),
  evidence: Evidence,
});
export type Rule = z.infer<typeof Rule>;

/** カードの eligibility：ルールの ID を all／any で組む。入れ子は1段まで（SPEC 9.4） */
export type RuleExpr = string | { all: RuleExpr[] } | { any: RuleExpr[] };
export const RuleExpr: z.ZodType<RuleExpr> = z.lazy(() =>
  z.union([z.string().regex(/^R-/), z.object({ all: z.array(RuleExpr) }).strict(), z.object({ any: z.array(RuleExpr) }).strict()]),
);

const Fact = z.object({ text: Text, evidence: Evidence });

export const Card = z.object({
  id: z.string(),
  data_version: z.number(),
  illustration: z.string(),
  awareness_type: z.enum(['must', 'applies', 'life_essential', 'option', 'upcoming', 'school']),
  obligation: z.enum(['legal', 'local_rule', 'practical', 'check', 'optional', 'none']),
  domain: z.enum(['government', 'life', 'school']),
  depth: z.enum(['L1', 'L2', 'L3']),
  first_week: z.boolean(),
  scope: z.enum(['nagoya_resident', 'any']),
  per_move: z.boolean(),
  requires_moved_in: z.boolean(),
  eligibility: RuleExpr,
  coverage_rule_ids: z.array(z.string()),
  title: Text,
  official_name: z.object({ ja: z.string(), reading: z.string() }),
  summary: Text,
  deadline: Fact.nullable(),
  where: Fact,
  /** 行く所（区役所・銀行など）。同じ所の項目は、行く日を一度に聞く（6A.5）。同じ窓口で済むという意味ではない */
  place: z.enum(['ward_office', 'bank', 'prev_city']).optional(),
  /** 探すときの言葉（よみ・ローマ字・英語など）。画面には出さない */
  keywords: z.array(z.string()).default([]),
  reasons: z.object({ excluded: Text.optional(), check_at_office: Text.optional(), check_at_office_coverage: Text.optional() }),
  evidence: Evidence,
});
export type Card = z.infer<typeof Card>;

export const Option = z.object({ value: ValueZ, label: Text, icon: z.string().optional(), small: z.boolean().optional() });
export const Question = z.object({
  id: z.string().regex(/^Q-/),
  fact: z.string(),
  stage: z.enum(['upfront', 'in_card', 'object_check']),
  ask_when: Condition,
  text: Text,
  why_asked: Text,
  options: z.array(Option).min(2),
});
export type Question = z.infer<typeof Question>;

export const ObjectDef = z.object({
  id: z.string(),
  illustration: z.string(),
  show_for: z.array(z.string()),
  title: Text,
  purpose: Text,
  yields_when_held: z.array(z.object({ fact: z.string(), value: ValueZ })),
  check_question: z.string().optional(),
  evidence: Evidence,
});
export type ObjectDef = z.infer<typeof ObjectDef>;

const RelBase = { id: z.string(), explain: Text, evidence: Evidence, keep_needs_check: z.boolean().optional() };
export const Relation = z.discriminatedUnion('type', [
  z.object({ ...RelBase, type: z.literal('legal_prerequisite'), from: z.string(), to: z.string(), satisfied_when_rule_ids: z.array(z.string()).optional() }),
  /** day_order：行く日の順を守らせる根拠。関係そのものが未確認でも、これが確認済みなら「前の項目の日より前」を選べなくする（v0.4.5） */
  z.object({ ...RelBase, type: z.literal('practical_prerequisite'), from: z.string(), to: z.string(), satisfied_when_rule_ids: z.array(z.string()).optional(), day_order: Evidence.optional() }),
  z.object({ ...RelBase, type: z.literal('waits_for'), card_id: z.string(), item_id: z.string(), when_rule_ids: z.array(z.string()).optional() }),
  z.object({ ...RelBase, type: z.literal('same_visit'), card_ids: z.array(z.string()), order: z.array(z.string()), office_scope: z.enum(['same_counter', 'same_building']) }),
]);
export type Relation = z.infer<typeof Relation>;

export const Flow = z.object({ card_order: z.array(z.string()), built_origins: z.array(z.string()) });
