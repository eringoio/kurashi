/* ごみの判定（WASTE_001・002・003・004・005・007 の共通の部品）。画面に依存しない純粋な関数。
   品目の判定・次の収集日・粗大ごみの申込みの締切・自己搬入の受付方法を、データと日付から決める。
   データがそろっていないときは、日付や区分を作らず「確かめる先」を返す（research/integration/claude_priority_review/）。 */
import { z } from 'zod';
import { Evidence, Text } from './schema';

/* ───── データの型（drafts/gomi/*.json。公開前はすべて needs_check） ───── */

/** 出し方の経路。危険物・専用の回収・事業ごみは、袋の大きさより先に決める（INT-001・03 の4章） */
export const Route = z.enum(['regular', 'bulky', 'hazard', 'special', 'business', 'not_collected', 'unknown']);
export type Route = z.infer<typeof Route>;

const Link = z.object({ label: Text, url: z.string().url(), evidence: Evidence });

export const GomiCategory = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  route: Route,
  label: Text,
  how: Text,
  links: z.array(Link).default([]),
  evidence: Evidence,
});
export type GomiCategory = z.infer<typeof GomiCategory>;

/** 品目の答え。category：区分が1つに決まる／ask：結果を変える条件を1つ聞く（材質・大きさなど）／unknown：データに無い */
/** category が無い選択肢（「わからない」など）は、区分を決めない */
const Choice = z.object({ value: z.string(), label: Text, category: z.string().optional() });
export const GomiItem = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: Text,
  /** 探す言葉（ひらがな・カタカナ・英語など）。画面には出さない */
  aliases: z.array(z.string()).default([]),
  category: z.string().optional(),
  ask: z.object({ text: Text, choices: z.array(Choice).min(2) }).optional(),
  note: Text.optional(),
  /** 区分を出さず、確かめてもらう（古いデータ・基準の変更など）。理由を出す */
  review: z.object({ reason: Text }).optional(),
  evidence: Evidence,
});
export type GomiItem = z.infer<typeof GomiItem>;

export const GomiItems = z.object({
  as_of: z.string(),
  sources: z.array(z.object({ source_id: z.string(), url: z.string().url(), title: z.string(), page_updated_at: z.string().nullable(), license: z.string().optional() })),
  categories: z.array(GomiCategory),
  items: z.array(GomiItem),
});
export type GomiItems = z.infer<typeof GomiItems>;

/* ───── 品目の判定 ───── */

export type ItemResult =
  | { kind: 'result'; item: GomiItem; category: GomiCategory; choice?: string }
  | { kind: 'ask'; item: GomiItem }
  | { kind: 'review'; item: GomiItem }
  | { kind: 'unknown'; item: GomiItem | null };

/** 区分の順：危険・専用・事業が先（袋の大きさで粗大ごみにしない） */
const ROUTE_ORDER: Route[] = ['hazard', 'special', 'business', 'not_collected', 'bulky', 'regular', 'unknown'];

export function judgeItem(data: GomiItems, item: GomiItem | null, choice?: string): ItemResult {
  if (!item) return { kind: 'unknown', item: null };
  if (item.review) return { kind: 'review', item };
  const cat = (id: string | undefined) => data.categories.find((c) => c.id === id);
  if (item.category) {
    const c = cat(item.category);
    return c ? { kind: 'result', item, category: c } : { kind: 'unknown', item };
  }
  if (item.ask) {
    if (choice === undefined) return { kind: 'ask', item };
    const ch = item.ask.choices.find((x) => x.value === choice);
    // 「わからない」など区分に対応しない答えは、区分を決めない
    const c = cat(ch?.category);
    return ch && c ? { kind: 'result', item, category: c, choice } : { kind: 'unknown', item };
  }
  return { kind: 'unknown', item };
}

/** 比べる形：全角・半角をそろえ、小文字にし、カタカナをひらがなにする。空白は外す（Search.tsx と同じ） */
export const normWord = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/\s+/g, '');
const plainRuby = (s: string) => s.replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
const readingRuby = (s: string) => s.replace(/\{[^|{}]+\|([^{}]+)\}/g, '$1');

/** 品目を探す。前方一致を先に、次に部分一致。危険物・専用の回収の品目は同じ順位なら先に出す */
export function searchItems(data: GomiItems, q: string): GomiItem[] {
  const n = normWord(q);
  if (!n) return [];
  const score = (it: GomiItem) => {
    const ws = [...Object.values(it.label).flatMap((t) => [plainRuby(t), readingRuby(t)]), ...it.aliases].map(normWord);
    if (ws.some((w) => w === n)) return 0;
    if (ws.some((w) => w.startsWith(n))) return 1;
    if (ws.some((w) => w.includes(n))) return 2;
    return -1;
  };
  // 確かめた品目（review でない）を先に。同じ順位なら危険物・専用の回収を先に
  const routeOf = (it: GomiItem) => (it.review ? 'unknown' : data.categories.find((c) => c.id === it.category)?.route ?? 'unknown');
  return data.items
    .map((it) => ({ it, s: score(it) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || ROUTE_ORDER.indexOf(routeOf(a.it)) - ROUTE_ORDER.indexOf(routeOf(b.it)))
    .map((x) => x.it);
}

/* ───── 地域と収集日（WASTE_002） ───── */

/** 収集の決まり。weekly：毎週の曜日／nth：月の第N曜日（カレンダーの段ではなく、その月のN回目の曜日） */
export type ScheduleRule = { kind: 'weekly'; weekdays: number[] } | { kind: 'nth'; slots: { n: number; weekday: number }[] };
export interface Schedule {
  area_id: string;
  category: string;
  rule: ScheduleRule;
  /** 適用の期間（施行日）。null は「確認できていない」。確認日（observed_at）とは別（INT-008） */
  valid_from: string | null;
  valid_to: string | null;
  observed_at: string;
  /** 年末年始などの例外。skip：その日は収集しない／extra：その日も収集する */
  exceptions: { date: string; kind: 'skip' | 'extra' }[];
  /** 例外の一覧がそろっている期間（年末年始の日程が出る前は、その期間の日付を出さない） */
  exceptions_known_until: string | null;
  review_status: 'needs_human_review' | 'approved';
}

export interface AreaChoice {
  ward_id: string;
  /** 町・丁目・番地まで選んだときの地域ID（収集日の表の地域）。区だけなら null */
  area_id: string | null;
  set_on: string;
}

export type AreaStatus =
  | { kind: 'unset' }
  | { kind: 'needs_recheck'; since: string }
  | { kind: 'ward_only' }
  | { kind: 'no_data' }
  | { kind: 'ready'; area_id: string };

/** 地域の状態。引っ越し（出来事）を選んだ日が、地域を選んだ日より後なら、前の地域は使わない */
export function areaStatus(choice: AreaChoice | null, opts: { movedOn: string[]; areasWithData: string[] }): AreaStatus {
  if (!choice) return { kind: 'unset' };
  const after = opts.movedOn.filter((d) => d > choice.set_on).sort();
  if (after.length) return { kind: 'needs_recheck', since: after[after.length - 1] };
  if (!choice.area_id) return { kind: 'ward_only' };
  if (!opts.areasWithData.includes(choice.area_id)) return { kind: 'no_data' };
  return { kind: 'ready', area_id: choice.area_id };
}

const DAY = 86_400_000;
export const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const weekday = (ymd: string) => new Date(ymd + 'T00:00:00Z').getUTCDay();
/** その月の何回目の曜日か（1〜5） */
export const nthOfMonth = (ymd: string) => Math.floor((Number(ymd.slice(8, 10)) - 1) / 7) + 1;

function ruleHits(rule: ScheduleRule, ymd: string) {
  const w = weekday(ymd);
  if (rule.kind === 'weekly') return rule.weekdays.includes(w);
  return rule.slots.some((s) => s.weekday === w && s.n === nthOfMonth(ymd));
}

export type NextDay =
  | { kind: 'date'; date: string }
  | { kind: 'area'; status: AreaStatus }
  | { kind: 'no_schedule' }
  | { kind: 'not_approved' }
  | { kind: 'outside_validity' }
  | { kind: 'exceptions_unknown'; from: string };

/** 次の収集日（今日を含む）。適用の期間・例外の一覧がそろう範囲だけで探す。足りなければ日付を出さない */
export function nextCollection(schedules: Schedule[], status: AreaStatus, category: string, today: string, opts: { allowUnapproved?: boolean; horizonDays?: number } = {}): NextDay {
  if (status.kind !== 'ready') return { kind: 'area', status };
  const list = schedules.filter((s) => s.area_id === status.area_id && s.category === category);
  if (list.length === 0) return { kind: 'no_schedule' };
  if (list.length > 1) return { kind: 'no_schedule' }; // 同じ地域・区分の表が2つあるのは矛盾。日付を出さない
  const s = list[0];
  if (s.review_status !== 'approved' && !opts.allowUnapproved) return { kind: 'not_approved' };
  if (!s.valid_from || s.valid_from > today || (s.valid_to && s.valid_to < today)) return { kind: 'outside_validity' };
  const horizon = opts.horizonDays ?? 62;
  for (let i = 0; i <= horizon; i++) {
    const d = addDays(today, i);
    if (s.valid_to && d > s.valid_to) return { kind: 'outside_validity' };
    if (!s.exceptions_known_until || d > s.exceptions_known_until) return { kind: 'exceptions_unknown', from: d };
    const ex = s.exceptions.find((e) => e.date === d);
    if (ex?.kind === 'skip') continue;
    if (ex?.kind === 'extra' || ruleHits(s.rule, d)) return { kind: 'date', date: d };
  }
  return { kind: 'no_schedule' };
}

/* ───── 粗大ごみ（WASTE_003）と、間に合わないとき（WASTE_006） ───── */

/** 申込みの締切は「収集日」から数える（退去日から数えない）。daysBefore は公式の案内の日数（データに持つ） */
export const bulkyApplyBy = (collectionDate: string, daysBefore: number) => addDays(collectionDate, -daysBefore);

export type BulkyPlan =
  | { kind: 'in_time'; collection: string; applyBy: string }
  | { kind: 'too_late'; alternatives: ('self_delivery' | 'licensed_hauler' | 'ask_office')[] }
  | { kind: 'no_dates' };

/** 退去の日までに粗大ごみの収集に間に合うか。収集日の候補（その地域の、確認済みの日）が無ければ決めない */
export function bulkyBeforeMoveOut(candidates: string[], today: string, moveOut: string, daysBefore: number | null): BulkyPlan {
  if (!candidates.length || daysBefore === null) return { kind: 'no_dates' };
  const ok = candidates.filter((d) => d <= moveOut && bulkyApplyBy(d, daysBefore) >= today).sort();
  if (ok.length) return { kind: 'in_time', collection: ok[0], applyBy: bulkyApplyBy(ok[0], daysBefore) };
  return { kind: 'too_late', alternatives: ['self_delivery', 'licensed_hauler', 'ask_office'] };
}

/* ───── 自己搬入の受付方法（WASTE_004。INT-008） ───── */

export interface DeliveryRegime {
  id: string;
  /** 適用の期間（両端を含む）。公式に書かれた日だけ。書かれていない端は null（推測で埋めない） */
  from: string | null;
  to: string | null;
  label: Text;
  evidence: Evidence;
}

export type RegimeAnswer = { kind: 'regime'; regimes: DeliveryRegime[] } | { kind: 'not_stated' };

/** 利用予定日で受付方法を選ぶ（確認した日・今日では選ばない）。どの期間にも入らない日は「公式に書かれていない」 */
export function deliveryRegime(regimes: DeliveryRegime[], useDate: string): RegimeAnswer {
  const hit = regimes.filter((r) => r.from !== null || r.to !== null).filter((r) => (r.from === null || r.from <= useDate) && (r.to === null || useDate <= r.to));
  return hit.length ? { kind: 'regime', regimes: hit } : { kind: 'not_stated' };
}
