/* ガイドのデータの型（SPEC 9章）。Zod で読み込むときに確かめる。ここにない項目は、使うときに足す。 */
import { z } from 'zod';

/** ai_checked：公式のページと AI で照合した（作者の確認前。v0.4.9）。どの欄で verified と同じに扱うかは src/core/trust.ts */
export const Status = z.enum(['draft', 'needs_check', 'ai_checked', 'verified', 'outdated']);
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
  /** AI 照合の記録（v0.4.9）：引用を見つけた本文の取得日・ハッシュ、独立の照合の結果と、その記録の場所 */
  ai_check: z.object({
    fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    verdict: z.enum(['agree', 'disagree']),
    ref: z.string(),
  }).optional(),
});
export type Evidence = z.infer<typeof Evidence>;

/** 言語ごとの文。ja は必須。ほかの表示レベルは任意（足りないときは日本語に戻す） */
export const Text = z.object({ ja: z.string() }).catchall(z.string());
export type Text = z.infer<typeof Text>;

/** 1つの値。複数選択の質問の答えは文字列の配列（DATA_CONTRACT 3章） */
export type Scalar = string | boolean;
export type Value = Scalar | string[];
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: string; eq: Scalar }
  | { fact: string; in: Scalar[] }
  | { fact: string; has: string };
const ValueZ = z.union([z.string(), z.boolean()]);
export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(Condition) }).strict(),
    z.object({ any: z.array(Condition) }).strict(),
    z.object({ not: Condition }).strict(),
    z.object({ fact: z.string(), eq: ValueZ }).strict(),
    z.object({ fact: z.string(), in: z.array(ValueZ) }).strict(),
    /** 複数選択の答え（配列）が、その値を含むか */
    z.object({ fact: z.string(), has: z.string() }).strict(),
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
  /** selection：本人の選択（答え）を言い直すだけのルール。制度についての主張ではないので、確認状態にかかわらず答えのとおりに判定する（SPEC 10.4 v0.4.8）。
      出典は本アプリの定義（product）だけ、条件に使えるのは質問の答えとイベントの事実だけ（data.ts の検査） */
  kind: z.enum(['eligibility', 'entry', 'coverage', 'scope', 'timing', 'document', 'relation', 'selection']),
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
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** お知らせ（11/7 B-7c）：制度の変更などを、決めた期間だけ出す（src/core/notice.ts）。DATA_CONTRACT v1.4 */
export const Notice = z.object({ text: Text, show_from: IsoDate.optional(), show_until: IsoDate.optional(), evidence: Evidence.optional() });
export type Notice = z.infer<typeof Notice>;
/** 電話・公式リンク。value は電話番号か https の URL */
const Contact = z.object({ type: z.enum(['phone', 'link']), label: Text, value: z.string(), evidence: Evidence });

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
  /** 短い一文（10d。作者 11/6「文字が多い」）。開いた項目・カードに出す。無ければ summary の最初の一文。summary の全文はシート */
  lead: Text.optional(),
  deadline: Fact.nullable(),
  where: Fact,
  /** 行く所（区役所・銀行・警察など）。同じ所の項目は、行く日を一度に聞く（6A.5）。同じ窓口で済むという意味ではない。
      表示名は strings.json の place.<id>（DATA_CONTRACT 1章） */
  place: z.string().regex(/^[a-z_]+$/).optional(),
  /** procedure：手続き（行く日を聞く）／guide：相談・準備の案内（日を聞かない。DATA_CONTRACT 3章） */
  kind: z.enum(['procedure', 'guide']).default('procedure'),
  /** すぐ行う行動（カードの利用停止など）。質問より先に出す */
  urgent: z.object({ text: Text, contacts: z.array(Contact) }).optional(),
  /** 手続きの方法（窓口・電子申請・郵送・電話）。when が偽の方法は出さない */
  methods: z.array(z.object({ type: z.enum(['counter', 'online', 'mail', 'phone']), text: Text, when: RuleExpr.optional(), evidence: Evidence })).optional(),
  /** 必要な物が無いときの代わり（身分証をなくしたときなど） */
  alternatives: z.array(Fact).optional(),
  /** 探すときの言葉（よみ・ローマ字・英語など）。画面には出さない */
  keywords: z.array(z.string()).default([]),
  /** 何か月後の予定（カレンダーに追加）。from の日（arrival＝日本に住み始めた日）から months か月後（作者 11/6 C。例：銀行の居住者への変更） */
  /** 見て分かる形（作者 11/6 E）：floorplan＝間取り図の例と読み方、costs＝初期費用の図（家賃の何か月分）。カードのページに出す */
  visual: z.enum(['floorplan', 'costs']).optional(),
  reminder: z.object({ months: z.number().int().min(1).max(24), from: z.enum(['arrival']) }).optional(),
  reasons: z.object({ excluded: Text.optional(), check_at_office: Text.optional(), check_at_office_coverage: Text.optional() }),
  /** お知らせ（期間つき。B-7c）。いまの日が期間の外なら出さない */
  notices: z.array(Notice).optional(),
  evidence: Evidence,
});
export type Card = z.infer<typeof Card>;

export const Option = z.object({ value: ValueZ, label: Text, icon: z.string().optional(), small: z.boolean().optional() });
export const Question = z.object({
  id: z.string().regex(/^Q-/),
  fact: z.string(),
  stage: z.enum(['upfront', 'in_card', 'object_check']),
  /** person：人の答え（年齢など。出来事をまたいで使う）／event：出来事ごとの答え（出発地など）。DATA_CONTRACT 4章 */
  scope: z.enum(['person', 'event']).default('event'),
  /** 複数選択（答えは value の配列） */
  multi: z.boolean().optional(),
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
  /** 付き添いの「行く前」で、持ち物のチェックに出す行く所（カードの place。本アプリの定義。6A.6）。ほかに要る物は窓口で確認 */
  bring_to: z.array(z.string().regex(/^[a-z_]+$/)).optional(),
  /** どの手続きで使うか（カードの id。本アプリの定義。作者 11/6 B-6）。「行く前」の持ち物を手続きごとに分けて出す */
  bring_for: z.array(z.string()).optional(),
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
  /** 同時に進めてよい（注記だけ。順番を作らない） */
  z.object({ ...RelBase, type: z.literal('parallel'), card_ids: z.array(z.string()).min(2) }),
  /** 関連する案内（注記だけ。順番を作らない） */
  z.object({ ...RelBase, type: z.literal('related'), from: z.string(), to: z.string() }),
]);
export type Relation = z.infer<typeof Relation>;

export const Flow = z.object({ card_order: z.array(z.string()), built_origins: z.array(z.string()) });

/** 生活イベント（入口。DATA_CONTRACT 2.1）。同じカードを複数のイベントから参照する */
export const EventDef = z.object({
  id: z.string().regex(/^E-[a-z0-9-]+$/),
  group: z.string(),
  title: Text,
  illustration: z.string(),
  status: z.enum(['built', 'coming_soon']),
  /** 入口のメニューの順（無ければメニューに出さない） */
  menu: z.number().optional(),
  /** このイベントを選んだら決まる事実（本人の答えのほうが強い） */
  facts: z.array(z.object({ fact: z.string(), value: ValueZ })).default([]),
  /** 入口で聞く質問（順に） */
  questions: z.array(z.string()).default([]),
  card_ids: z.array(z.string()),
  /** 範囲のルール（無ければ R-scope-nagoya-resident） */
  scope_rule: z.string().optional(),
  /** このイベントで使う道具の画面（例：ごみの品目検索 /gomi）。一覧の上に入口を出す。契約 v1 への追加の案（作者の承認待ち。research/integration/claude_priority_review/implementation.md） */
  tool: z.object({ path: z.string().regex(/^\/[a-z-]+$/), label: Text }).optional(),
  evidence: Evidence,
});
export type EventDef = z.infer<typeof EventDef>;
