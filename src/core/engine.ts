/* ルールエンジン（SPEC 第10章）。答え・持ち物・わたしの手続き・今日から、カードの表示状態・区分け・理由・質問を決める。
   同じ入力からは必ず同じ結果になる。答えが変わったら、毎回すべてを計算し直す（前回の結果を使わない）。 */
import type { GuideData } from './data';
import { combineAll, combineAny, evalCond, factsIn, type Eval, type Facts, type TV } from './logic';
import type { Card, EventDef, Evidence, Question, Relation, Rule, RuleExpr, Status, Value } from './schema';
import { effectiveStatus, type FieldKind } from './trust';
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
  /** 生活イベント（DATA_CONTRACT 2.1）。あれば、そのイベントのカードだけを判定し、イベントの事実と範囲のルールを使う。
      無ければ今までどおり全カード・R-scope-nagoya-resident（A1・B1 の /move） */
  event?: EventDef;
}

type Prereq = Extract<Relation, { type: 'legal_prerequisite' | 'practical_prerequisite' }>;
const isPrereq = (r: Relation): r is Prereq => r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite';

export interface Note { kind: 'legal_prereq' | 'practical_prereq' | 'same_visit' | 'waits_for' | 'prereq_unknown' | 'satisfied_by_answer' | 'maybe_done' | 'parallel' | 'related'; relation: Relation; verified: boolean }
/** no_day：日を聞かない案内（kind: guide。DATA_CONTRACT 3章） */
export type DayRule = { kind: 'free' } | { kind: 'min'; day: string; from: string } | { kind: 'need_first'; from: string } | { kind: 'no_day' };

export interface CardView {
  card: Card;
  state: DisplayState;
  section: Section | null;
  /** 区分けの理由（あとで・待つの文の種類） */
  sectionWhy: 'moved_in_not_yet' | 'moved_in_unknown' | 'moved_in_unanswered' | 'after_prereq' | 'waits' | 'answer' | 'visit_need_document' | 'visit_wrong_place' | null;
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
  /** 確かめの質問の順（obligation → flow.json）。前提の段は入れない（v0.4.8：前提はすることの順だけを変え、質問の順は変えない） */
  questionRank: number;
  /** 確認の期限を過ぎた根拠がある（12.3 の outdated。本アプリの定義は対象外）。「情報が古い可能性があります」を出す */
  outdated: boolean;
  /** 手続きの方法（card.methods）を、使える条件（when）で評価したもの。F の方法は入れない。U は「窓口で確認」 */
  methods: { method: NonNullable<Card['methods']>[number]; v: TV }[];
}

export interface EngineOutput {
  facts: Facts;
  scope: TV;
  upfront: Question[];
  cards: CardView[];
  /** 確認済みの same_visit（付き添いの順に使う。6A.6） */
  sameVisit: Extract<Relation, { type: 'same_visit' }>[];
}

const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

export function run(data: GuideData, x: EngineInput): EngineOutput {
  const mode = x.mode ?? 'public';
  const productOnly = (e: Evidence) => e.source_ids.length > 0 && e.source_ids.every((s) => data.sources.find((d) => d.source_id === s)?.owner_type === 'product');
  /** 実際に使う確認状態（outdated は今日で判定。9.2） */
  const statusOf = (e: Evidence, keep?: boolean, kind: FieldKind = 'rule') => {
    // ai_checked は、表（trust.ts）で許した欄だけ verified と同じ。判定に使う欄（ルール・関係）は U のまま
    let s: Status = effectiveStatus(e, kind);
    if (mode === 'verified' && s === 'needs_check' && !keep) s = 'verified';
    if (s === 'verified' && !productOnly(e)) {
      const days = e.review_after_days === undefined ? 90 : e.review_after_days;
      if (days !== null && addDays(e.checked_at, days) < x.today) s = 'outdated';
    }
    return s;
  };

  // 1. 事実をそろえる。イベントの事実 → 持ち物から決まる事実 → 本人の答え（本人の答えを優先）。ask_when が F の答えは未回答として扱う
  const facts: Facts = new Map();
  x.event?.facts.forEach((f) => facts.set(f.fact, f.value));
  const origin = x.answers['Q-origin'] ?? facts.get('origin');
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
    // selection（本人の選択を言い直すだけ）は答えのとおり。制度のルールは、未確認なら U（10.4）
    conf.set(r.id, r.kind === 'selection' || statusOf(r.evidence, r.keep_needs_check) === 'verified' ? e : { ...e, v: 'U', unverified: true });
  }
  const evalExpr = (e: RuleExpr): Eval => (typeof e === 'string' ? conf.get(e)! : 'all' in e ? combineAll(e.all.map(evalExpr)) : combineAny(e.any.map(evalExpr)));
  const exprIds = (e: RuleExpr, out: string[] = []): string[] => { if (typeof e === 'string') out.push(e); else ('all' in e ? e.all : e.any).forEach((y) => exprIds(y, out)); return out; };

  const askable = (fact: string, stages: Question['stage'][]) =>
    data.questions.find((q) => q.fact === fact && stages.includes(q.stage) && !facts.has(fact) && evalCond(q.ask_when, facts).v === 'T');

  // 3. 範囲（イベントの範囲のルール。無ければ名古屋市に住む人）
  const scopeEval = conf.get(x.event?.scope_rule ?? 'R-scope-nagoya-resident')!;
  const scope = scopeEval.v;

  // 関係の確認状態
  const relVerified = (r: Relation) => statusOf(r.evidence, r.keep_needs_check, r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite' ? 'prerequisite' : 'relation') === 'verified';
  const ruleT = (id: string) => conf.get(id)!.v;

  // 4. 表示状態
  const inEvent = x.event ? new Set(x.event.card_ids) : null;
  const pre = data.cards.filter((c) => !inEvent || inEvent.has(c.id)).map((card) => {
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
  const satisfied = (r: Prereq): 'yes' | 'no' | 'unknown' => {
    const fromPlan = x.plan[r.from];
    const sat = r.satisfied_when_rule_ids ?? [];
    if (fromPlan?.status === 'done' || sat.some((id) => ruleT(id) === 'T')) return 'yes';
    if (stateOf.get(r.from) === 'shown' && fromPlan?.status !== 'dismissed' && sat.every((id) => ruleT(id) === 'F')) return 'no';
    return 'unknown';
  };
  // 答えから「もう済んでいる」とわかったカード（確認済みの satisfied_when が T。6A.3）
  const doneByAnswer = new Set<string>();
  for (const r of data.relations) {
    if (isPrereq(r) && (r.satisfied_when_rule_ids ?? []).some((id) => ruleT(id) === 'T')) doneByAnswer.add(r.from);
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
      if (isPrereq(r) && r.to === card.id) {
        const s = satisfied(r);
        if (s === 'yes') continue;
        // 日の順だけを守らせる（v0.4.5）：前の項目がまだ済んでいなくて、この人に関係するとき。区分け・並び順は変えない
        if (r.type === 'practical_prerequisite' && r.day_order && statusOf(r.day_order, false, 'prerequisite') === 'verified') {
          const fromState = stateOf.get(r.from);
          if (fromState === 'shown' || fromState === 'check_at_office' || fromState === 'ask') {
            const fromDay = x.plan[r.from]?.planned_on;
            dayRule = fromDay ? { kind: 'min', day: fromDay, from: r.from } : { kind: 'need_first', from: r.from };
          }
        }
        if (r.type === 'legal_prerequisite' && v) {
          if (s === 'unknown') notes.push({ kind: 'prereq_unknown', relation: r, verified: v });
          else {
            const fromDay = x.plan[r.from]?.planned_on;
            dayRule = fromDay ? { kind: 'min', day: fromDay, from: r.from } : { kind: 'need_first', from: r.from };
          }
        } else notes.push({ kind: r.type === 'legal_prerequisite' ? 'legal_prereq' : 'practical_prereq', relation: r, verified: v });
      }
      if (r.type === 'same_visit' && r.card_ids.includes(card.id) && !v) notes.push({ kind: 'same_visit', relation: r, verified: v });
      // 同時に進めてよい・関連する案内：注記だけ。順番・区分けは変えない
      if (r.type === 'parallel' && r.card_ids.includes(card.id) && stateOf.has(card.id)) notes.push({ kind: 'parallel', relation: r, verified: v });
      if (r.type === 'related' && r.from === card.id) notes.push({ kind: 'related', relation: r, verified: v });
    }
    // 答えからは済んでいそうだが、その対応がまだ確認されていない（9.10：済んだことにせず、確かめることにする）
    const maybe = data.relations.filter(isPrereq).find((y) => y.from === card.id && (y.satisfied_when_rule_ids ?? []).some((id) => raw.get(id)!.v === 'T' && conf.get(id)!.v === 'U'));
    if (maybe && !doneByAnswer.has(card.id)) notes.push({ kind: 'maybe_done', relation: maybe, verified: false });
    if (doneByAnswer.has(card.id)) {
      const r = data.relations.filter(isPrereq).find((y) => y.from === card.id)!;
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
      // 付き添いで「別の書類が要る」「ここではない」と言われた：日を決め直す前に確かめる（6A.6）
      else if (plan?.visit_told && !plan.planned_on) { section = 'check'; sectionWhy = plan.visit_told === 'need_document' ? 'visit_need_document' : 'visit_wrong_place'; }
      else if (state === 'check_at_office' || changed) { section = 'check'; if (changed) c = 'answer_changed'; }
      else if (card.awareness_type === 'upcoming') section = 'later';
      else if (status === 'submitted' || status === 'waiting') section = 'wait';
      else if (waits) { section = 'wait'; sectionWhy = 'waits'; notes.push({ kind: 'waits_for', relation: waits, verified: true }); }
      else if (legalNotMet) { section = 'later'; sectionWhy = 'after_prereq'; }
      else if (card.requires_moved_in && moved !== 'yes') { section = 'later'; sectionWhy = moved === 'not_yet' ? 'moved_in_not_yet' : moved === 'unknown' ? 'moved_in_unknown' : 'moved_in_unanswered'; }
      else if (status === 'preparing') section = 'today';
      // 相談・準備の案内（guide）：必要な案内はいつも「いま」。もしものときの案内（option）だけ「あとで」（v0.4.8）
      else if (card.kind === 'guide') section = card.awareness_type === 'option' ? 'later' : 'today';
      // 規則10（確認済みの期限が7日以内）：MVP のデータには確認済みの期限がまだない
      else if (card.obligation === 'legal' || (card.first_week && x.today <= addDays(created, 14))) section = 'today';
      else section = 'later';
    }

    // 案内（guide）と、すぐ行う行動（電話・アプリで止めるなど。行く所が無い）は、行く日を聞かない
    if (card.kind === 'guide' || (card.urgent && !card.place)) dayRule = { kind: 'no_day' };

    // 質問の選択（10.2 の手順10）：①判定の未定の原因の未回答 ②住み始めたか
    const want = new Set<string>();
    if (state === 'ask' || state === 'shown' || state === 'check_at_office') {
      elig.unanswered.forEach((f) => want.add(f));
      if (card.requires_moved_in) want.add('moved_in');
    }
    // 同じ事実を聞く質問は、質問バンクの最初の1つだけ（11/6：Q-bank-account と Q-bank-has）
    const questions = data.questions.filter((q, i, all) => q.stage === 'in_card' && want.has(q.fact) && !facts.has(q.fact) && evalCond(q.ask_when, facts).v === 'T' && all.findIndex((y) => y.stage === 'in_card' && y.fact === q.fact) === i);

    // 理由（10.5）：判定に使った答えの事実と、適用条件のルール
    const ids = exprIds(card.eligibility).concat(card.coverage_rule_ids);
    const used = new Set<string>();
    ids.forEach((id) => factsIn(data.rules.get(id)!.condition).forEach((f) => { if (facts.has(f)) used.add(f); }));
    const reasonRules = ids.map((id) => data.rules.get(id)!).filter((r) => r.kind === 'eligibility' && (state !== 'shown' || raw.get(r.id)!.v === 'T'));

    const falseRule = state === 'excluded' ? ids.map((id) => data.rules.get(id)!).find((r) => conf.get(r.id)!.v === 'F') ?? null : null;
    const methods = (card.methods ?? []).map((m) => ({ method: m, v: m.when ? evalExpr(m.when).v : ('T' as TV) })).filter((m) => m.v !== 'F');
    const outdated = [card.evidence, card.where.evidence, card.deadline?.evidence, ...reasonRules.map((r) => r.evidence)].some((e) => e && statusOf(e, false, 'card_text') === 'outdated');
    return { card, state, section, sectionWhy, cause: c, reasonFacts: [...used], reasonRules, falseRule, questions, notes, dayRule, plan, methods, questionRank: 0, outdated };
  });

  // 並び順（10.3 v0.4.8）：前提の段（先にすることが残っている数）→ obligation → flow.json の順。
  // 前提の関係は確認状態にかかわらず「おすすめの順」にだけ使う（区分け・日の制限は今までどおり確認済みのときだけ）。
  // 例：在留カードの再交付（法令上の義務）でも、警察への届がまだなら、その後に並べる。
  const open = (id: string) => { const v = cards.find((c) => c.card.id === id); return !!v && v.section !== null && v.section !== 'done' && v.state !== 'excluded' && v.state !== 'out_of_scope'; };
  const depthMemo = new Map<string, number>();
  const depth = (id: string, seen: Set<string> = new Set()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (seen.has(id)) return 0; // 循環は読み込みの検査で止めている。ここでは念のため打ち切る
    seen.add(id);
    let d = 0;
    for (const r of data.relations) if (isPrereq(r) && r.to === id && open(r.from) && satisfied(r) !== 'yes') d = Math.max(d, depth(r.from, seen) + 1);
    depthMemo.set(id, d);
    return d;
  };
  const ob = ['legal', 'local_rule', 'practical', 'check', 'optional', 'none'];
  [...cards].sort((a, b) => ob.indexOf(a.card.obligation) - ob.indexOf(b.card.obligation) || data.flow.card_order.indexOf(a.card.id) - data.flow.card_order.indexOf(b.card.id)).forEach((c, i) => { c.questionRank = i; });
  cards.sort((a, b) => depth(a.card.id) - depth(b.card.id) || ob.indexOf(a.card.obligation) - ob.indexOf(b.card.obligation) || data.flow.card_order.indexOf(a.card.id) - data.flow.card_order.indexOf(b.card.id));

  // 最初の質問：upfront で、未回答で、未定のルールの原因になっているもの（質問バンクの順）。範囲が F なら聞かない
  const pending = new Set<string>();
  if (scope !== 'F') {
    for (const p of pre) p.elig.unanswered.forEach((f) => pending.add(f));
    scopeEval.unanswered.forEach((f) => pending.add(f));
  }
  const askNow = (q: Question) => q.stage === 'upfront' && !facts.has(q.fact) && evalCond(q.ask_when, facts).v === 'T';
  const fromBank = data.questions.filter((q) => askNow(q) && pending.has(q.fact));
  // イベントが入口で聞くと決めた質問（events.json の questions）は、その順に先に聞く（判定の原因でなくても。例：もう警察に届けたか）。
  // カードの中の質問（in_card）でも、イベントが入口で聞くと決めたなら聞く（11/6：銀行の Q-bank-has。引っ越しの最初の質問には出さないため）
  const fromEvent = scope === 'F' || !x.event ? [] : x.event.questions.map((id) => data.questions.find((q) => q.id === id)!).filter((q) => q && q.stage !== 'object_check' && !facts.has(q.fact) && evalCond(q.ask_when, facts).v === 'T');
  // 同じ fact を聞く質問は1つだけ（B-4：共通の Q-nationality と、できごとの国籍の質問が並ばないように。先に出た方を残す）
  const upfront = [...fromEvent, ...fromBank.filter((q) => !fromEvent.includes(q))].filter((q, i, all) => all.findIndex((y) => y.fact === q.fact) === i);

  const sameVisit = data.relations.filter((r): r is Extract<Relation, { type: 'same_visit' }> => r.type === 'same_visit' && relVerified(r));
  return { facts, scope, upfront, cards, sameVisit };
}

function sameVisitVerified(data: GuideData, a: string, b: string, ok: (r: Relation) => boolean) {
  return data.relations.some((r) => r.type === 'same_visit' && r.card_ids.includes(a) && r.card_ids.includes(b) && ok(r));
}
