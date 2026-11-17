/* 収集日の表。名古屋市の表（市のページ 1037098 の町名表）を data/gomi/schedule.json に写したもの（値は変えない。市の著作権・再利用の規定に従って使う。市の回答は作者の非公開の記録にある）。
   既定で出す。VITE_GOMI_SCHEDULE=off のときだけ出さない。大きいので /gomi を開いたときに別に読む（loadSchedule）。
   住所は区＋町名（丁目まで）を残す。番地で曜日が分かれる町だけ、そのときに番地を聞く。
   番地の文字は残さない。残すのは表の行の id（area_id）だけで、同意のあと、この端末の中だけ（K-21）。 */
import { addDays, nthOfMonth, type Schedule, type ScheduleRule } from './gomi';
import yearEndJson from '../../data/gomi/year-end.json';

export interface PrivateArea { id: string; ward: string; town: string; banchi: string | null; romaji?: string; days: Record<string, ScheduleRule> }
export interface PrivateSchedule { source: { url: string; title: string; fetched_at: string; valid_from: string | null }; areas: PrivateArea[]; /** 番地の英訳（data/gomi/banchi-names.json。Claude が訳した） */ banchi_en?: Record<string, string> }

/* 年末年始の収集日（data/gomi/year-end.json。市の「年末年始の資源・ごみ収集日のお知らせ」の表をそのまま写したもの）。
   表の行（曜日・第何曜日）に当てはまる地域だけ、表の日にする。当てはまらない地域・区分は、その期間の日付を出さない（推測しない）。
   次の年末年始の表は、市が出すまで作らない（known_until より後は日付を出さない）。 */
type WeeklyRow = { weekdays: number[]; last: string; first: string };
type NthRow = { n: number; weekday: number; dates: string[] };
export interface YearEnd {
  id: string;
  sources: { source_id: string; url: string; title: string; page_updated_at: string; fetched_at: string }[];
  model_page: { url: string; title: string };
  period: { from: string; to: string; special_from: string };
  known_until: string;
  weekly: { categories: string[]; rows: WeeklyRow[] }[];
  nth: { categories: string[]; rows: NthRow[] }[];
  overrides: { source_id: string; area_ids: string[]; categories: string[]; rows: WeeklyRow[] }[];
}
export const YEAR_END = yearEndJson as unknown as YearEnd;

/** 例外の一覧がそろっている最後の日。これより後は日付を出さない（市の表を人が見直して延ばす。tests/core/data-expiry.test.ts） */
export const EXCEPTIONS_UNTIL = YEAR_END.known_until;

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
const weekdayOf = (ymd: string) => new Date(ymd + 'T00:00:00Z').getUTCDay();
const hits = (rule: ScheduleRule, d: string) => rule.kind === 'weekly' ? rule.weekdays.includes(weekdayOf(d)) : rule.slots.some((s) => s.weekday === weekdayOf(d) && s.n === nthOfMonth(d));
function* daysIn(from: string, to: string) { for (let d = from; d <= to; d = addDays(d, 1)) yield d; }

/** 年末年始の例外。表に当てはまらなければ null（その期間は日付を出さない） */
export function yearEndExceptions(y: YearEnd, areaId: string, category: string, rule: ScheduleRule): Schedule['exceptions'] | null {
  const weekly = y.overrides.find((o) => o.area_ids.includes(areaId) && o.categories.includes(category)) ?? y.weekly.find((g) => g.categories.includes(category));
  if (weekly) {
    // 毎週の区分（第何曜日の空きびん・空き缶も、曜日の行で決まる）。最後の日と最初の日の間の、その曜日は集めない
    const days = rule.kind === 'weekly' ? rule.weekdays : [...new Set(rule.slots.map((s) => s.weekday))];
    const row = weekly.rows.find((r) => sameSet(r.weekdays, days));
    if (!row) return null;
    const out: Schedule['exceptions'] = [];
    for (const d of daysIn(addDays(row.last, 1), addDays(row.first, -1))) if (hits(rule, d)) out.push({ date: d, kind: 'skip' });
    return out;
  }
  const nth = y.nth.find((g) => g.categories.includes(category));
  if (!nth || rule.kind !== 'nth') return null;
  // 不燃・粗大ごみ：期間の中は、表の日だけ（金曜日の地域の1月は1週ずれる）
  const dates = new Set<string>();
  for (const s of rule.slots) {
    const row = nth.rows.find((r) => r.n === s.n && r.weekday === s.weekday);
    if (!row) return null;
    row.dates.forEach((d) => dates.add(d));
  }
  const out: Schedule['exceptions'] = [];
  for (const d of daysIn(y.period.from, y.period.to)) {
    if (dates.has(d) && !hits(rule, d)) out.push({ date: d, kind: 'extra' });
    if (!dates.has(d) && hits(rule, d)) out.push({ date: d, kind: 'skip' });
  }
  return out;
}

/** 年末年始の日付が表から決まらない地域のための、日付を出さない期間（ふつうの決まりから外れうる最初の日 special_from から、期間の終わりまで） */
const unknownRange = (y: YearEnd) => [{ from: y.period.special_from, to: y.period.to }];

export const SCHEDULE_ON = import.meta.env.VITE_GOMI_SCHEDULE !== 'off';

const FILE = '../../data/gomi/schedule.json';
const loaders: Record<string, () => Promise<unknown>> = SCHEDULE_ON ? import.meta.glob(['../../data/gomi/schedule.json', '../../data/gomi/banchi-names.json'], { import: 'default' }) : {};

/** 表の形を確かめる。形が違えば null */
export function privateSchedule(raw: unknown): PrivateSchedule | null {
  if (raw === undefined) return null;
  const p = raw as PrivateSchedule;
  return p && Array.isArray(p.areas) ? p : null;
}

let loaded: PrivateSchedule | null | undefined;
let pending: Promise<PrivateSchedule | null> | null = null;
/** 読み終わっていれば表（無ければ null）。まだなら undefined */
export const scheduleNow = () => loaded;
/** 表を1回だけ読む（別のファイル） */
export function loadSchedule(): Promise<PrivateSchedule | null> {
  if (loaded !== undefined) return Promise.resolve(loaded);
  const get = loaders[FILE];
  if (!get) { loaded = null; return Promise.resolve(null); }
  const names = loaders['../../data/gomi/banchi-names.json'];
  pending ??= Promise.all([get(), names ? names().catch(() => null) : null]).then(([raw, n]) => {
    const p = privateSchedule(raw);
    if (p) p.banchi_en = (n as { names?: Record<string, string> } | null)?.names;
    return (loaded = p);
  }, () => (loaded = null));
  return pending;
}

/** 区の町名の一覧（同じ町名の番地の行は1つにまとめる） */
export function townsOf(p: PrivateSchedule, ward: string): string[] {
  return [...new Set(p.areas.filter((a) => a.ward === ward).map((a) => a.town))].sort((a, b) => a.localeCompare(b, 'ja'));
}

/** 町名のローマ字（scripts/gomi/romaji.mjs が写しに足す）。無ければ undefined */
export function romajiOf(p: PrivateSchedule, ward: string, town: string): string | undefined {
  return p.areas.find((a) => a.ward === ward && a.town === town)?.romaji;
}

/** 町名の行。2つ以上なら番地で分かれている（そのときだけ番地を聞く） */
export function rowsOf(p: PrivateSchedule, ward: string, town: string): PrivateArea[] {
  return p.areas.filter((a) => a.ward === ward && a.town === town);
}

/** 町名（と番地）から、表の1行。1行しかなければそれ。番地で分かれていて番地が合わなければ null（K-21：保存する area_id） */
export function areaRow(p: PrivateSchedule | null, ward: string | undefined, town: string | undefined, banchi = ''): PrivateArea | null {
  if (!p || !ward || !town) return null;
  const rows = rowsOf(p, ward, town);
  return rows.length === 1 ? rows[0] : rows.find((r) => r.id === banchi) ?? null;
}

/** 番地の選び方。画面でまだ選んでいなければ（null）、保存した area_id から戻す（K-21：読み込み直しても行を保つ） */
export function banchiOf(picked: string | null, savedAreaId: string | null | undefined): string {
  return picked ?? savedAreaId ?? '';
}

/** 保存する area_id。行が決まって、保存と違うときだけ返す。行がまだ決まらない（画面が戻る前）ときは保存を消さない（undefined = 書かない） */
export function areaIdToSave(savedAreaId: string | null | undefined, rowId: string | null): string | undefined {
  if (rowId === null) return undefined;
  return rowId === (savedAreaId ?? null) ? undefined : rowId;
}

/* 町名の検索（ごみの町名ピッカー）。日本語の町名と、写しに付いたローマ字だけを使う。読みやローマ字を推測で作らない。 */
const KANJI_DIGIT: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiNumber(s: string): string {
  // 一〜九十九（十の位がある形も）。それ以外はそのまま
  const m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return String((m[1] ? KANJI_DIGIT[m[1]] : 1) * 10 + (m[2] ? KANJI_DIGIT[m[2]] : 0));
  return [...s].every((c) => c in KANJI_DIGIT) ? [...s].map((c) => KANJI_DIGIT[c]).join('') : s;
}
/** 比べるための形：全角→半角・小文字・漢数字→算用数字・空白と区切りを消す */
export function townKey(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[〇一二三四五六七八九十]+/g, (m) => kanjiNumber(m))
    .replace(/[\s\-‐‑–—ー・、,.，]+/g, '');
}

/** 検索語に合う町名（townsOf の並びのまま。先頭が合うものを先に）。空の検索語は全件。部分一致だけで、別の町に合わせない */
export function searchTowns(p: PrivateSchedule, ward: string, query: string): string[] {
  const all = townsOf(p, ward);
  const q = townKey(query);
  if (!q) return all;
  const romaji = new Map<string, string>();
  for (const a of p.areas) if (a.ward === ward && a.romaji && !romaji.has(a.town)) romaji.set(a.town, townKey(a.romaji));
  const head: string[] = [];
  const rest: string[] = [];
  for (const t of all) {
    const keys = [townKey(t), romaji.get(t)].filter((k): k is string => !!k);
    if (keys.some((k) => k.startsWith(q))) head.push(t);
    else if (keys.some((k) => k.includes(q))) rest.push(t);
  }
  return [...head, ...rest];
}

/** gomi.ts の Schedule の形にする（作者が表示を on にしたので、未承認でも出す。画面には「要確認」を付ける） */
export function toSchedules(p: PrivateSchedule, y: YearEnd = YEAR_END): Schedule[] {
  return p.areas.flatMap((a) => Object.entries(a.days).map(([category, rule]) => {
    const ex = yearEndExceptions(y, a.id, category, rule);
    return {
      area_id: a.id, category, rule, valid_from: p.source.valid_from ?? p.source.fetched_at, valid_to: null, observed_at: p.source.fetched_at,
      // 年末年始は市の表の日にする。表に当てはまらない地域・区分は、その期間の日付を出さない
      exceptions: ex ?? [], unknown_ranges: ex ? [] : unknownRange(y),
      exceptions_known_until: y.known_until, review_status: 'needs_human_review',
    } satisfies Schedule;
  }));
}

/** 14日の中に年末年始（12/29〜期間の終わり）が入るか。入るときだけ、市の年末年始のページを示す */
export function yearEndInView(today: string, days = 14, y: YearEnd = YEAR_END): boolean {
  const r = unknownRange(y)[0];
  const end = addDays(today, days - 1);
  return today <= r.to && end >= r.from;
}
