import { describe, expect, it } from 'vitest';
import { chooseEntry, type EntryInput } from '../../src/core/entry';
import { todayJst } from '../../src/core/date';

const base: EntryInput = { today: '2026-11-05', url: null, resume: null, hasProgress: true, plan: [], waiting: false, allDone: false };

describe('入口の出し分け（SPEC 6A.1）', () => {
  it('1 URL のカードがいちばん先', () => {
    expect(chooseEntry({ ...base, url: { kind: 'card', card_id: 'nagoya-garbage' }, resume: { step: 'objects', started_on: '2026-11-05' } })).toEqual({ kind: 'card', card_id: 'nagoya-garbage' });
  });
  it('2 QR の場面', () => {
    expect(chooseEntry({ ...base, url: { kind: 'scene', scene_id: 'sample-school' } }).kind).toBe('scene');
  });
  it('3 同じ日の途中の手順は続きへ', () => {
    expect(chooseEntry({ ...base, resume: { step: 'objects', started_on: '2026-11-05' } }).kind).toBe('resume');
  });
  it('4 次の日より後の途中の手順は「済みましたか？」', () => {
    expect(chooseEntry({ ...base, resume: { step: 'objects', started_on: '2026-11-04' } }).kind).toBe('resume_confirm');
  });
  it('5 約束した日が今日', () => {
    const e = chooseEntry({ ...base, plan: [{ card_id: 'a', status: 'todo', planned_on: '2026-11-05' }, { card_id: 'b', status: 'todo', planned_on: '2026-11-03' }] });
    expect(e).toEqual({ kind: 'promise_today', card_ids: ['a'] });
  });
  it('6 約束した日が過ぎて、済んでいない', () => {
    expect(chooseEntry({ ...base, plan: [{ card_id: 'b', status: 'todo', planned_on: '2026-11-03' }] })).toEqual({ kind: 'promise_past', card_ids: ['b'] });
  });
  it('6 済んだ約束は数えない', () => {
    expect(chooseEntry({ ...base, plan: [{ card_id: 'b', status: 'done', planned_on: '2026-11-03' }] }).kind).toBe('now');
  });
  it('7 待っている物', () => {
    expect(chooseEntry({ ...base, waiting: true }).kind).toBe('waiting');
  });
  it('8 いまの1つ', () => {
    expect(chooseEntry(base).kind).toBe('now');
  });
  it('9 すべて済んだ', () => {
    expect(chooseEntry({ ...base, allDone: true }).kind).toBe('all_done');
  });
  it('10 初めて', () => {
    expect(chooseEntry({ ...base, hasProgress: false }).kind).toBe('menu');
  });
});

describe('日本時間の今日', () => {
  it('UTC の 15:00 は、日本では次の日', () => {
    expect(todayJst(new Date('2026-11-04T15:00:00Z'))).toBe('2026-11-05');
    expect(todayJst(new Date('2026-11-04T14:59:00Z'))).toBe('2026-11-04');
  });
});

describe('約束の日の候補（6A.5）', () => {
  it('水曜：今日・金曜・土曜', async () => {
    const { daySuggestions } = await import('../../src/core/date');
    expect(daySuggestions('2026-11-04')).toEqual([{ key: 'today', day: '2026-11-04' }, { key: 'week', day: '2026-11-06' }, { key: 'off', day: '2026-11-07' }]);
  });
  it('土曜：今日・日曜', async () => {
    const { daySuggestions } = await import('../../src/core/date');
    expect(daySuggestions('2026-11-07')).toEqual([{ key: 'today', day: '2026-11-07' }, { key: 'off', day: '2026-11-08' }]);
  });
});

describe('続きの行き先（K-39）', async () => {
  const { continuePath } = await import('../../src/core/entry');
  const occ = (id: string, event_id: string, started_on: string, closed_on?: string) => ({ id, event_id, started_on, closed_on, answers: {}, plan: {} });
  const legacy = occ('occ-legacy', 'E-move', '2026-11-03');
  it('引っ越しだけなら /now', () => {
    expect(continuePath([], legacy)).toBe('/now');
    expect(continuePath([], null)).toBe('/now');
  });
  it('銀行のできごとがいちばん新しいなら /e/E-bank', () => {
    expect(continuePath([occ('occ-bank-1', 'E-bank', '2026-11-05')], legacy)).toBe('/e/E-bank');
    expect(continuePath([occ('occ-bank-1', 'E-bank', '2026-11-03')], legacy)).toBe('/e/E-bank');
  });
  it('引っ越しのほうが新しい、または銀行が閉じていれば /now', () => {
    expect(continuePath([occ('occ-bank-1', 'E-bank', '2026-11-01')], legacy)).toBe('/now');
    expect(continuePath([occ('occ-bank-1', 'E-bank', '2026-11-05', '2026-11-06')], legacy)).toBe('/now');
  });
});
