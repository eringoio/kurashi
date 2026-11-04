/* ルールエンジン（SPEC 第10章）。答え・持ち物・わたしの手続き・今日から、カードの表示状態・区分け・理由・質問を決める。
   同じ入力からは必ず同じ結果になる。答えが変わったら、毎回すべてを計算し直す（前回の結果を使わない）。 */
import type { GuideData } from './data';
import { combineAll, combineAny, evalCond, factsIn, type Eval, type Facts, type TV } from './logic';
import type { Card, Evidence, Question, Relation, Rule, RuleExpr, Value } from './schema';
import type { PlanRecord } from './entry';

export type DisplayState = 'shown' | 'check_at_office' | 'ask' | 'excluded' | 'out_of_scope';
/** 区分け（10.3。v0.4 の表示名：いま・確かめる・届くのを待つ・あとで・もうできた） */
export type Section = 'today' | 'check' | 'wait' | 'later' | 'done';
/** check_at_office・ask の原因（10.5） */
export type Cause = 'unknown' | 'unverified' | 'no_question' | 'coverage' | 'answer_changed';

export interface EngineInput {
  /** 質問の答え（question_id → 値。'unknown' は「わからない」。未回答はキーを持たない） */
  answers: Record<string, Value>;
  /** 持ち物の答え（object_id → 持っている） */
  objects: Record<string, boolean>;
  plan: Record<string, PlanRecord>;
  /** わたしの手続きを作った日（first_week の計算。9.9 の dates） */
  createdOn: string | null;
  today: string;
  /** 'public'：データのとおり／'verified'：確認済みデータの fixture（作者の確認用・テスト用。SPEC 18） */
  mode?: 'public' | 'verified';
}

export interface Note { kind: 'legal_prereq' | 'practical_prereq' | 'same_visit' | 'waits_for' | 'prereq_unknown' | 'satisfied_by_answer' | 'maybe_done'; relation: Relation; verified: boolean }
export type DayRule = { kind: 'free' } | { kind: 'min'; day: string; from: string } | { kind: 'need_first'; from: string };

export interface CardView {
  card: Card;
  state: DisplayState;
  section: Section | null;
  /** 区分けの理由（あとで・待つの文の種類） */
  sectionWhy: 'moved_in_not_yet' | 'moved_in_unknown' | 'moved_in_unanswered' | 'after_prereq' | 'waits' | 'answer' | null;
  cause: Cause | null;
  /** 理由に出す答えの事実（判定に使ったものだけ）と、ルール */
  reasonFacts: string[];
  reasonRules: Rule[];
  /** excluded のとき、偽になった最初のルール（理由の文に使う） */
  falseRule: Rule | null;
  /** このカードで聞く質問（10.2 の手順10） */
  questions: Question[];
  notes: Note[];
  dayRule: DayRule;
  plan: PlanRecord | null;
}

export interface EngineOutput {
  facts: Facts;
  scope: TV;
  upfront: Question[];
  cards: CardView[];
}

const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

export function run(data: GuideData, x: EngineInput): EngineOutput {
  const mode = x.mode ?? 'public';
  const productOnly = (e: Evidence) => e.source_ids.length > 0 && e.source_ids.every((s) => data.sources.find((d) => d.source_id === s)?.owner_type === 'product');
  /** 実際に使う確認状態（outdated は今日で判定。9.2） */
  const statusOf = (e: Evidence, keep?: boolean) => {
    let s = e.status;
    if (mode === 'verified' && s === 'needs_check' && !keep) s = 'verified';
    if (s === 'verified' && !productOnly(e)) {
      const days = e.review_after_days === undefined ? 90 : e.review_after_days;
      if (days !== null && addDays(e.checked_at, days) < x.today) s = 'outdated';
    }
    return s;
  };

  // 1. 事実をそろえる。持ち物から決まる事実 → 本人の答え（本人の答えを優先）。ask_when が F の答えは未回答として扱う
  const facts: Facts = new Map();
  const origin = x.answers['Q-origin'];
  for (const o of data.objects) {
    if (x.objects[o.id] && (typeof origin !== 'string' || o.show_for.includes(origin))) o.yields_when_held.forEach((y) => facts.set(y.fact, y.value));
  }
  for (const q of data.questions) if (x.answers[q.id] !== undefined) facts.set(q.fact, x.answers[q.id]);
  for (const q of data.questions) {
    if (x.answers[q.id] !== undefined && evalCond(q.ask_when, facts).v === 'F') facts.delete(q.fact);
  }

  // 2. ルールを評価。未確認のルールは、値にかかわらず U（原因は残す。10.4）
  const raw = new Map<string, Eval>();
  const conf = new Map<string, Eval>();
  for (const r of data.rules.values()) {
    const e = evalCond(r.condition, facts);
    raw.set(r.id, e);
    conf.set(r.id, statusOf(r.evidence, r.keep_needs_check) === 'verified' ? e : { ...e, v: 'U', unverified: true });
  }
  const evalExpr = (e: RuleExpr): Eval => (typeof e === 'string' ? conf.get(e)! : 'all' in e ? combineAll(e.all.map(evalExpr)) : combineAny(e.any.map(evalExpr)));
  const exprIds = (e: RuleExpr, out: string[] = []): string[] => { if (typeof e === 'string') out.push(e); else ('all' in e ? e.all : e.any).forEach((y) => exprIds(y, out)); return out; };

  const askable = (fact: string, stages: Question['stage'][]) =>
    data.questions.find((q) => q.fact === fact && stages.includes(q.stage) && !facts.has(fact) && evalCond(q.ask_when, facts).v === 'T');

  // 3. 範囲
  const scopeEval = conf.get('R-scope-nagoya-resident')!;
  const scope = scopeEval.v;

  // 関係の確認状態
  const relVerified = (r: Relation) => statusOf(r.evidence, r.keep_needs_check) === 'verified';
  const ruleT = (id: string) => conf.get(id)!.v;

  // 4. 表示状態
  const pre = data.cards.map((card) => {
    const elig = evalExpr(card.eligibility);
    const cov = card.coverage_rule_ids.length ? combineAll(card.coverage_rule_ids.map((id) => conf.get(id)!)) : null;
    let state: DisplayState;
    let cause: Cause | null = null;
    if (scope === 'F' && card.scope === 'nagoya_resident') state = 'out_of_scope';
    else if (elig.v === 'F') state = 'excluded';
    else if (elig.v === 'T' && (!cov || cov.v === 'T')) state = 'shown';
    else if (elig.v === 'T' && cov?.v === 'F') { state = 'check_at_office'; cause = 'coverage'; }
    else {
      const both = combineAll(cov ? [elig, cov] : [elig]);
      const canAsk = [...both.unanswered].some((f) => askable(f, ['upfront', 'in_card']));
      if (canAsk) state = 'ask';
      else {
        state = 'check_at_office';
        cause = both.unknown.size ? 'unknown' : both.unverified ? 'unverified' : 'no_question';
      }
      return { card, state, cause, elig: both };
    }
    return { card, state, cause, elig };
  });
  const stateOf = new Map(pre.map((p) => [p.card.id, p.state]));

  // 前提が満たされたか（9.6 の関係の規則2）：yes／no／unknown
  const satisfied = (r: Extract<Relation, { from: string }>): 'yes' | 'no' | 'unknown' => {
    const fromPlan = x.plan[r.from];
    const sat = r.satisfied_when_rule_ids ?? [];
    if (fromPlan?.status === 'done' || sat.some((id) => ruleT(id) === 'T')) return 'yes';
    if (stateOf.get(r.from) === 'shown' && fromPlan?.status !== 'dismissed' && sat.every((id) => ruleT(id) === 'F')) return 'no';
    return 'unknown';
  };
  // 答えから「もう済んでいる」とわかったカード（確認済みの satisfied_when が T。6A.3）
  const doneByAnswer = new Set<string>();
  for (const r of data.relations) {
    if ((r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite') && (r.satisfied_when_rule_ids ?? []).some((id) => ruleT(id) === 'T')) doneByAnswer.add(r.from);
  }

  const created = x.createdOn ?? x.today;
  const cards: CardView[] = pre.map(({ card, state, cause, elig }) => {
    const plan = x.plan[card.id] ?? null;
    const status = plan?.status ?? 'todo';
    const notes: Note[] = [];
    let section: Section | null = null;
    let sectionWhy: CardView['sectionWhy'] = null;
    let c: Cause | null = cause;
    let dayRule: DayRule = { kind: 'free' };

    // 関係の注記（needs_check の関係は注記だけ。9.6 の規則1）
    for (const r of data.relations) {
      const v = relVerified(r);
      if ((r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite') && r.to === card.id) {
        const s = satisfied(r);
        if (s === 'yes') continue;
        if (r.type === 'legal_prerequisite' && v) {
          if (s === 'unknown') notes.push({ kind: 'prereq_unknown', relation: r, verified: v });
          else {
            const fromDay = x.plan[r.from]?.planned_on;
            dayRule = fromDay ? { kind: 'min', day: fromDay, from: r.from } : { kind: 'need_first', from: r.from };
          }
        } else notes.push({ kind: r.type === 'legal_prerequisite' ? 'legal_prereq' : 'practical_prereq', relation: r, verified: v });
      }
      if (r.type === 'same_visit' && r.card_ids.includes(card.id) && !v) notes.push({ kind: 'same_visit', relation: r, verified: v });
    }
    // 答えからは済んでいそうだが、その対応がまだ確認されていない（9.10：済んだことにせず、確かめることにする）
    const maybe = data.relations.find((y) => 'from' in y && y.from === card.id && (y.satisfied_when_rule_ids ?? []).some((id) => raw.get(id)!.v === 'T' && conf.get(id)!.v === 'U'));
    if (maybe && !doneByAnswer.has(card.id)) notes.push({ kind: 'maybe_done', relation: maybe, verified: false });
    if (doneByAnswer.has(card.id)) {
      const r = data.relations.find((y) => 'from' in y && y.from === card.id)!;
      notes.push({ kind: 'satisfied_by_answer', relation: r, verified: true });
    }

    // 区分け（10.3）。やること画面に入るのは shown と check_at_office だけ
    const inPlan = state === 'shown' || state === 'check_at_office';
    const changed = !inPlan && ['preparing', 'submitted', 'waiting'].includes(status);
    if (inPlan || changed) {
      const waits = data.relations.find((r) => r.type === 'waits_for' && r.card_id === card.id && relVerified(r) && (r.when_rule_ids ?? []).every((id) => ruleT(id) === 'T'));
      const legalNotMet = data.relations.find((r) => r.type === 'legal_prerequisite' && r.to === card.id && relVerified(r) && satisfied(r) === 'no' && !sameVisitVerified(data, r.from, r.to, relVerified));
      const moved = facts.get('moved_in');
      if (status === 'done' || doneByAnswer.has(card.id)) { section = 'done'; sectionWhy = doneByAnswer.has(card.id) && status !== 'done' ? 'answer' : null; }
      else if (status === 'dismissed') section = null;
      else if (state === 'check_at_office' || changed) { section = 'check'; if (changed) c = 'answer_changed'; }
      else if (card.awareness_type === 'upcoming') section = 'later';
      else if (status === 'submitted' || status === 'waiting') section = 'wait';
      else if (waits) { section = 'wait'; sectionWhy = 'waits'; notes.push({ kind: 'waits_for', relation: waits, verified: true }); }
      else if (legalNotMet) { section = 'later'; sectionWhy = 'after_prereq'; }
      else if (card.requires_moved_in && moved !== 'yes') { section = 'later'; sectionWhy = moved === 'not_yet' ? 'moved_in_not_yet' : moved === 'unknown' ? 'moved_in_unknown' : 'moved_in_unanswered'; }
      else if (status === 'preparing') section = 'today';
      // 規則10（確認済みの期限が7日以内）：MVP のデータには確認済みの期限がまだない
      else if (card.obligation === 'legal' || (card.first_week && x.today <= addDays(created, 14))) section = 'today';
      else section = 'later';
    }

    // 質問の選択（10.2 の手順10）：①判定の未定の原因の未回答 ②住み始めたか
    const want = new Set<string>();
    if (state === 'ask' || state === 'shown' || state === 'check_at_office') {
      elig.unanswered.forEach((f) => want.add(f));
      if (card.requires_moved_in) want.add('moved_in');
    }
    const questions = data.questions.filter((q) => q.stage === 'in_card' && want.has(q.fact) && !facts.has(q.fact) && evalCond(q.ask_when, facts).v === 'T');

    // 理由（10.5）：判定に使った答えの事実と、適用条件のルール
    const ids = exprIds(card.eligibility).concat(card.coverage_rule_ids);
    const used = new Set<string>();
    ids.forEach((id) => factsIn(data.rules.get(id)!.condition).forEach((f) => { if (facts.has(f)) used.add(f); }));
    const reasonRules = ids.map((id) => data.rules.get(id)!).filter((r) => r.kind === 'eligibility' && (state !== 'shown' || raw.get(r.id)!.v === 'T'));

    const falseRule = state === 'excluded' ? ids.map((id) => data.rules.get(id)!).find((r) => conf.get(r.id)!.v === 'F') ?? null : null;
    return { card, state, section, sectionWhy, cause: c, reasonFacts: [...used], reasonRules, falseRule, questions, notes, dayRule, plan };
  });

  // 並び順（10.3）：obligation → flow.json の順
  const ob = ['legal', 'local_rule', 'practical', 'check', 'optional', 'none'];
  cards.sort((a, b) => ob.indexOf(a.card.obligation) - ob.indexOf(b.card.obligation) || data.flow.card_order.indexOf(a.card.id) - data.flow.card_order.indexOf(b.card.id));

  // 最初の質問：upfront で、未回答で、未定のルールの原因になっているもの（質問バンクの順）。範囲が F なら聞かない
  const pending = new Set<string>();
  if (scope !== 'F') {
    for (const p of pre) p.elig.unanswered.forEach((f) => pending.add(f));
    scopeEval.unanswered.forEach((f) => pending.add(f));
  }
  const upfront = data.questions.filter((q) => q.stage === 'upfront' && pending.has(q.fact) && !facts.has(q.fact) && evalCond(q.ask_when, facts).v === 'T');

  return { facts, scope, upfront, cards };
}

function sameVisitVerified(data: GuideData, a: string, b: string, ok: (r: Relation) => boolean) {
  return data.relations.some((r) => r.type === 'same_visit' && r.card_ids.includes(a) && r.card_ids.includes(b) && ok(r));
}
