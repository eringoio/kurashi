/* 付き添い（SPEC 6A.6）：約束の日に、行く所ごとに「行く前 → 窓口で → 終わったら」と進む。
   画面に依存しない判定だけをここに置く（どの段階か・何を出すか・終わり方で保存をどう変えるか）。
   同じ窓口で済むとは言わない（same_visit が確認済みのときだけ、その順に並べる。10.4）。 */
import type { CardView, EngineOutput } from './engine';
import type { PlanRecord } from './entry';
import type { Card, ObjectDef, Relation } from './schema';

export type VisitStage = 'before' | 'counter' | 'after';
export const VISIT_STAGES: VisitStage[] = ['before', 'counter', 'after'];
/** 終わったら：全部できた／別の書類が要ると言われた／ここではないと言われた／行けなかった */
export type VisitOutcome = 'all_done' | 'need_document' | 'wrong_place' | 'not_went';
export const VISIT_OUTCOMES: VisitOutcome[] = ['all_done', 'need_document', 'wrong_place', 'not_went'];
/** 窓口で言われたこと（plan に残す理由。「確かめる」に移す） */
export type VisitTold = Extract<VisitOutcome, 'need_document' | 'wrong_place'>;

type SameVisit = Extract<Relation, { type: 'same_visit' }>;

export interface BringItem {
  object: ObjectDef;
  /** 持っていると答えた物（チェックできる）。false なら「持っていない」 */
  held: boolean;
}

export interface Visit {
  /** 行く所（カードの place）。所が無い項目は付き添いにしない */
  place: string;
  /** その日にまとめた項目（確認済みの same_visit があればその順。なければ一覧の順） */
  cards: CardView[];
  /** 確認済みの same_visit の順か（false なら「順は窓口で確認」） */
  ordered: boolean;
  /** 持ち物（その所へ持っていく物。持っている物を先に） */
  bring: BringItem[];
  /** 持っていない物の代わり（カードの alternatives）。カードごと */
  alternatives: { card: Card; items: NonNullable<Card['alternatives']> }[];
}

/** 日が今日で、まだ済んでいない項目か */
const dueToday = (c: CardView, today: string) =>
  !!c.card.place && c.plan?.planned_on === today && c.plan.status !== 'done' && c.plan.status !== 'dismissed' && c.section !== null && c.section !== 'done';

/** 確認済みの same_visit が、この日の項目を全部ふくむなら、その order で並べる */
function orderBy(cards: CardView[], rels: SameVisit[]): { cards: CardView[]; ordered: boolean } {
  if (cards.length < 2) return { cards, ordered: false };
  const ids = cards.map((c) => c.card.id);
  const r = rels.find((x) => ids.every((id) => x.card_ids.includes(id)));
  if (!r) return { cards, ordered: false };
  const rank = (id: string) => { const i = r.order.indexOf(id); return i < 0 ? r.order.length : i; };
  return { cards: [...cards].sort((a, b) => rank(a.card.id) - rank(b.card.id)), ordered: true };
}

/** その所へ持っていく物（objects の bring_to）。その道のりで見せる物だけ。持っている物を先に */
export function bringList(objects: ObjectDef[], place: string, held: Record<string, boolean>, origin: string | undefined, nationality?: unknown): BringItem[] {
  const nat = typeof nationality === 'string' ? nationality : undefined;
  const list = objects
    .filter((o) => (o.bring_to ?? []).includes(place) && (!origin || o.show_for.includes(origin)) && !(nat && o.not_for_nationality?.includes(nat)))
    // 答えが無い物は、assume_held_unless_nationality があれば「持っている」（その国籍の人を除く。国籍が未回答なら持っているとみなす）
    .map((o) => ({ object: o, held: o.id in held ? !!held[o.id] : !!o.assume_held_unless_nationality && !(nat && o.assume_held_unless_nationality.includes(nat)) }));
  return [...list.filter((b) => b.held), ...list.filter((b) => !b.held)];
}

/** 今日の行く所ごとのまとまり。並びは一覧（out.cards）の順で、所の初めて出た順 */
export function visitsToday(out: EngineOutput, objects: ObjectDef[], held: Record<string, boolean>, origin: string | undefined, today: string): Visit[] {
  const by = new Map<string, CardView[]>();
  for (const c of out.cards) {
    if (!dueToday(c, today)) continue;
    const p = c.card.place!;
    by.set(p, [...(by.get(p) ?? []), c]);
  }
  return [...by.entries()].map(([place, cs]) => {
    const o = orderBy(cs, out.sameVisit);
    return {
      place,
      cards: o.cards,
      ordered: o.ordered,
      bring: bringList(objects, place, held, origin, out.facts.get('nationality')),
      alternatives: o.cards.filter((c) => (c.card.alternatives ?? []).length > 0).map((c) => ({ card: c.card, items: c.card.alternatives! })),
    };
  });
}

/** 段階の次（行く前 →「着いた」→ 窓口で →「終わった」→ 終わったら）。終わったらの次は無い */
export function nextStage(s: VisitStage): VisitStage | null {
  const i = VISIT_STAGES.indexOf(s);
  return i >= 0 && i < VISIT_STAGES.length - 1 ? VISIT_STAGES[i + 1] : null;
}

/** 終わり方ごとの plan の変更（項目ごとに同じ）。
    全部できた：done／別の書類・ここではない：日を消し、理由を残して「確かめる」へ／行けなかった：日を消す（日を決め直す。6A.5） */
export function outcomePatch(o: VisitOutcome, place: string, today: string): Partial<PlanRecord> {
  switch (o) {
    case 'all_done': return { status: 'done', visit_told: undefined, visit_told_on: undefined, visit_result: { place, result: 'done', on: today } };
    case 'need_document':
    case 'wrong_place': return { status: 'todo', planned_on: undefined, visit_told: o, visit_told_on: today, visit_result: { place, result: 'not_done', reason: o, on: today } };
    case 'not_went': return { status: 'todo', planned_on: undefined };
  }
}

/** 手続きごとの「終わったら」（作者 11/6 B-7）。ok＝できた、not_done（理由は任意）。選んでいない手続きは入れない（未確認：日はそのまま、次に開くと「今日の予定」に残る）。
    できなかった・理由なし：日を消す（日を決め直す）。理由あり：確かめることへ（visit_told） */
export type CardResult = { ok: true } | { ok: false; reason?: VisitTold };
export function resultPatch(r: CardResult, place: string, today: string): Partial<PlanRecord> {
  if (r.ok) return outcomePatch('all_done', place, today);
  if (r.reason) return outcomePatch(r.reason, place, today);
  return { status: 'todo', planned_on: undefined, visit_told: undefined, visit_told_on: undefined, visit_result: { place, result: 'not_done', on: today } };
}

/** 持ち物を手続きごとに（作者 11/6 B-6）。同じ物は、その日の最初の手続きにだけ出す。どの手続きにも結びつかない物は rest */
export function bringByCard(v: Pick<Visit, 'cards' | 'bring'>): { groups: { card: CardView; items: BringItem[] }[]; rest: BringItem[] } {
  const used = new Set<string>();
  const groups = v.cards.map((c) => {
    const items = v.bring.filter((b) => !used.has(b.object.id) && (b.object.bring_for ?? []).includes(c.card.id));
    items.forEach((b) => used.add(b.object.id));
    return { card: c, items };
  });
  return { groups, rest: v.bring.filter((b) => !used.has(b.object.id)) };
}

/** 終わり方のあとに出すもの：結果（done）／確かめるの一覧（check）／日を決め直す（replan） */
export function afterOutcome(o: VisitOutcome): 'done' | 'check' | 'replan' {
  return o === 'all_done' ? 'done' : o === 'not_went' ? 'replan' : 'check';
}

/** 付き添いの途中の手順（resume の step）。URL には行く所の種類と段階だけを入れる（答え・日付・位置を入れない。13.4） */
export const visitPath = (place: string, stage: VisitStage) => '/visit/' + place + (stage === 'before' ? '' : '/' + stage);
export function parseVisitPath(path: string): { place: string; stage: VisitStage } | null {
  const m = /^\/visit\/([a-z_]+)(?:\/(counter|after))?$/.exec(path);
  return m ? { place: m[1], stage: (m[2] as VisitStage | undefined) ?? 'before' } : null;
}

/** 全体の画面の持ち物（SPEC 6A.4 v0.5.31）：まだの項目（済み・やめた・関係なし・範囲外・まだわからない を除く）の行く所ごと。
    その所の項目で使う物だけ（bring_for が無い物は、所だけで決める）。持ち物の無い所は出さない */
export function bringPlan(out: EngineOutput, objects: ObjectDef[], held: Record<string, boolean>, origin: string | undefined): { place: string; cards: CardView[]; bring: BringItem[] }[] {
  const by = new Map<string, CardView[]>();
  for (const c of out.cards) {
    const p = c.card.place;
    if (!p || c.section === null || c.section === 'done' || (c.state !== 'shown' && c.state !== 'check_at_office')) continue;
    if (c.plan?.status === 'done' || c.plan?.status === 'dismissed') continue;
    by.set(p, [...(by.get(p) ?? []), c]);
  }
  return [...by.entries()].map(([place, cs]) => {
    const ids = new Set(cs.map((c) => c.card.id));
    const bring = bringList(objects, place, held, origin, out.facts.get('nationality')).filter((b) => !b.object.bring_for || b.object.bring_for.some((id) => ids.has(id)));
    return { place, cards: cs, bring };
  }).filter((x) => x.bring.length > 0);
}
