/* カレンダー：開いている日・祝日・期限を過ぎた日・.ics */
import { describe, expect, it } from 'vitest';
import { buildIcs, dayInfo, monthGrid, openState, type Hours } from '../../src/core/calendar';

const WARD: Hours = { weekdays: [1, 2, 3, 4, 5], open: '08:45', close: '17:15', closed: ['holidays', '12-29..01-03'] };
const HOL = { '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日' };

describe('開いている日', () => {
  it('平日は開いている。土日・祝日は休み', () => {
    expect(openState(WARD, '2026-11-05', HOL)).toBe('open'); // 木
    expect(openState(WARD, '2026-11-07', HOL)).toBe('closed'); // 土
    expect(openState(WARD, '2026-11-03', HOL)).toBe('closed'); // 祝日（火）
  });
  it('年末年始（年をまたぐ範囲）は休み', () => {
    expect(openState(WARD, '2026-12-28', HOL)).toBe('open');
    expect(openState(WARD, '2026-12-29', HOL)).toBe('closed');
    expect(openState(WARD, '2027-01-01', HOL)).toBe('closed');
    expect(openState(WARD, '2027-01-04', HOL)).toBe('open');
  });
  it('開いている時間のデータが無い所（銀行など）は unknown', () => {
    expect(openState(undefined, '2026-11-05', HOL)).toBe('unknown');
  });
});

describe('日ごとの状態', () => {
  const base = { today: '2026-11-05', hours: WARD, holidays: HOL };
  it('休みの日・前の手続きより前の日は選べない。今日の印', () => {
    expect(dayInfo({ ...base, day: '2026-11-05' })).toMatchObject({ selectable: true, tags: ['today'] });
    expect(dayInfo({ ...base, day: '2026-11-07' }).selectable).toBe(false);
    expect(dayInfo({ ...base, day: '2026-11-06', min: '2026-11-09' })).toMatchObject({ selectable: false, tags: ['blocked'] });
  });
  it('期限を過ぎた日は、過ぎたと示しつつ選べる', () => {
    expect(dayInfo({ ...base, day: '2026-11-10', deadline: '2026-11-09' })).toMatchObject({ selectable: true, tags: ['past_deadline'] });
  });
  it('祝日の名前', () => {
    expect(dayInfo({ ...base, day: '2026-11-23' })).toMatchObject({ selectable: false, holiday: '勤労感謝の日' });
  });
  it('開いている時間が分からない所は選べるが、印を付ける', () => {
    expect(dayInfo({ ...base, hours: undefined, day: '2026-11-07' })).toMatchObject({ selectable: true, tags: ['unknown_hours'] });
  });
});

describe('カレンダーの形', () => {
  it('日曜始まり。今日より前は空', () => {
    const g = monthGrid('2026-11-05', 2);
    expect(g[0]).toEqual([null, null, null, null, '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(g[1][0]).toBe('2026-11-08');
  });
});

describe('.ics', () => {
  const ics = buildIcs([{ uid: '2026-11-06-ward_office@kurashi', day: '2026-11-06', summary: '区役所へ：住所の届出、国民健康保険', location: '名古屋市中区栄四丁目1-8', description: '持ち物：在留カード\nほかの持ち物は窓口で確認（要確認）' }], '20261105T000000Z');
  it('終日の予定（DTEND は次の日）。改行は CRLF', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261106');
    expect(ics).toContain('DTEND;VALUE=DATE:20261107');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('カンマ・改行を逃がす', () => {
    expect(ics.replace(/\r\n /g, '')).toContain('SUMMARY:区役所へ：住所の届出\\、国民健康保険'.replace('\\、', '、'));
    expect(ics.replace(/\r\n /g, '')).toContain('持ち物：在留カード\\nほかの持ち物');
  });
  it('長い行は 75 オクテットで折り返す', () => {
    const enc = new TextEncoder();
    for (const l of ics.split('\r\n')) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
  });
});
