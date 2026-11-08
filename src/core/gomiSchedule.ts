/* 収集日の表。名古屋市の表（市のページ 1037098 の町名表）を data/gomi/schedule.json に写したもの（市の掲載の許可：2026-11-08）。
   既定で出す。VITE_GOMI_SCHEDULE=off のときだけ出さない。大きいので /gomi を開いたときに別に読む（loadSchedule）。
   住所は区＋町名（丁目まで）を残す。番地で曜日が分かれる町だけ、そのときに番地を聞く。
   番地の文字は残さない。残すのは表の行の id（area_id）だけで、同意のあと、この端末の中だけ（K-21）。 */
import type { Schedule, ScheduleRule } from './gomi';

export interface PrivateArea { id: string; ward: string; town: string; banchi: string | null; romaji?: string; days: Record<string, ScheduleRule> }
export interface PrivateSchedule { source: { url: string; title: string; fetched_at: string; valid_from: string | null }; areas: PrivateArea[]; /** 番地の英訳（data/gomi/banchi-names.json。Claude が訳した） */ banchi_en?: Record<string, string> }

/** 年末年始（12/29〜1/3）の収集の例外は、写しの表に無い。この日までだけ日付を出す */
export const EXCEPTIONS_UNTIL = '2026-12-28';

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
export function toSchedules(p: PrivateSchedule): Schedule[] {
  return p.areas.flatMap((a) => Object.entries(a.days).map(([category, rule]) => ({
    area_id: a.id, category, rule, valid_from: p.source.valid_from ?? p.source.fetched_at, valid_to: null, observed_at: p.source.fetched_at, exceptions: [],
    // 年末年始の例外は表に無い。12/28 までだけ日付を出す（それより後は出さない）
    exceptions_known_until: EXCEPTIONS_UNTIL, review_status: 'needs_human_review',
  }) as unknown as Schedule));
}
