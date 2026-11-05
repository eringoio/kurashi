/* カレンダー（作者の指示 2026-11-05。SPEC 6A.5・6.6）。画面に依存しない。
   - 行く所の開いている日（data/hours.json）と祝日（data/holidays.json。内閣府）から、日ごとの状態を決める
   - 期限を過ぎた日は「過ぎた」と示しつつ選べる（万一のため）。休みの日・前の手続きより前の日は選べない
   - 端末のカレンダーに足す .ics を作る（端末の中で作る。送らない） */
import type { Ymd } from './date';

export interface Hours {
  /** 開いている曜日（0=日 … 6=土） */
  weekdays: number[];
  open?: string;
  close?: string;
  /** "holidays"（祝日）、"MM-DD..MM-DD"（年をまたいでよい。年末年始など） */
  closed: string[];
}

export type OpenState = 'open' | 'closed' | 'unknown';
const weekday = (d: Ymd) => new Date(d + 'T00:00:00Z').getUTCDay();
const md = (d: Ymd) => d.slice(5);

/** 行く所がその日に開いているか。開いている時間のデータが無い所は unknown（窓口で確認） */
export function openState(h: Hours | undefined, day: Ymd, holidays: Record<string, string>): OpenState {
  if (!h) return 'unknown';
  if (!h.weekdays.includes(weekday(day))) return 'closed';
  for (const c of h.closed) {
    if (c === 'holidays') { if (holidays[day]) return 'closed'; continue; }
    const m = /^(\d\d-\d\d)\.\.(\d\d-\d\d)$/.exec(c);
    if (!m) continue;
    const [a, b] = [m[1], m[2]];
    const x = md(day);
    if (a <= b ? x >= a && x <= b : x >= a || x <= b) return 'closed';
  }
  return 'open';
}

export type DayTag = 'today' | 'holiday' | 'closed' | 'blocked' | 'past_deadline' | 'unknown_hours';
export interface DayInfo { day: Ymd; selectable: boolean; tags: DayTag[]; holiday?: string }

/** 日ごとの状態。min：前の手続きの日（これより前は選べない）。deadline：確認済みの期限の日（過ぎても選べる） */
export function dayInfo(x: { day: Ymd; today: Ymd; min?: Ymd | null; deadline?: Ymd | null; hours?: Hours; holidays: Record<string, string> }): DayInfo {
  const tags: DayTag[] = [];
  if (x.day === x.today) tags.push('today');
  const hol = x.holidays[x.day];
  if (hol) tags.push('holiday');
  const o = openState(x.hours, x.day, x.holidays);
  if (o === 'closed') tags.push('closed');
  if (o === 'unknown') tags.push('unknown_hours');
  const blocked = !!x.min && x.day < x.min;
  if (blocked) tags.push('blocked');
  if (x.deadline && x.day > x.deadline) tags.push('past_deadline');
  return { day: x.day, selectable: x.day >= x.today && !blocked && o !== 'closed', tags, holiday: hol };
}

const addDays = (d: Ymd, n: number): Ymd => new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

/** 今日から weeks 週分のカレンダー（日曜始まり）。今日より前の日は null（空のます） */
export function monthGrid(today: Ymd, weeks = 5): (Ymd | null)[][] {
  const start = addDays(today, -weekday(today));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, w * 7 + i);
    return d < today ? null : d;
  }));
}

/* ───── .ics（RFC 5545） ───── */
export interface IcsEvent { uid: string; day: Ymd; summary: string; location?: string; description?: string }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
/** 1行 75 オクテットで折り返す（UTF-8 の文字の途中で切らない） */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const ymd = (d: Ymd) => d.replace(/-/g, '');

/** 終日の予定の .ics。stamp は作った日時（UTC、YYYYMMDDTHHMMSSZ） */
export function buildIcs(events: IcsEvent[], stamp: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//kurashi//JP', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.day)}`, `DTEND;VALUE=DATE:${ymd(addDays(e.day, 1))}`, `SUMMARY:${esc(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
