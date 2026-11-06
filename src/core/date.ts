/* 日付は日本時間（Asia/Tokyo）の YYYY-MM-DD で扱う（SPEC 10.2 の today の基準） */
export type Ymd = string;

export function todayJst(now: Date = new Date()): Ymd {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const sameDay = (a: Ymd, b: Ymd) => a === b;
export const before = (a: Ymd, b: Ymd) => a < b;

const DAY = 86_400_000;
export const addDays = (ymd: Ymd, n: number): Ymd => new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
/** 0＝日曜 … 6＝土曜 */
export const weekday = (ymd: Ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();

/** 約束の日の候補（SPEC 6A.5：今日／今週のうちに／次の休みの日）。同じ日は1つにまとめる */
export function daySuggestions(today: Ymd): { key: 'today' | 'week' | 'off'; day: Ymd }[] {
  const out: { key: 'today' | 'week' | 'off'; day: Ymd }[] = [{ key: 'today', day: today }];
  const w = weekday(today);
  // 今週のうち：今日より後の平日（金曜まで）。今日が金・土・日なら出さない
  if (w >= 1 && w <= 3) out.push({ key: 'week', day: addDays(today, 2) });
  else if (w === 4) out.push({ key: 'week', day: addDays(today, 1) });
  // 次の休みの日：今日より後の、いちばん近い土曜（今日が土曜なら日曜）
  const off = w === 6 ? addDays(today, 1) : addDays(today, (6 - w + 7) % 7 || 7);
  if (!out.some((x) => x.day === off)) out.push({ key: 'off', day: off });
  return out;
}

/** n か月後（月末は、その月の最後の日にそろえる。例：1/31 の1か月後は 2/28） */
export function addMonths(ymd: Ymd, n: number): Ymd {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
