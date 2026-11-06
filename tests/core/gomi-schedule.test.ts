/* 収集日の写し（作者の決定 2026-11-06 F）。data/private/ は Git に入らないので、見本の小さな表で確かめる */
import { describe, expect, it } from 'vitest';
import { nextCollection } from '../../src/core/gomi';
import { privateSchedule, rowsOf, toSchedules, townsOf, type PrivateSchedule } from '../../src/core/gomiSchedule';

const P: PrivateSchedule = {
  source: { url: 'https://www.city.nagoya.jp/kurashi/gomi/1012183/1037098.html', title: 'ごみ収集日検索', fetched_at: '2026-11-06', valid_from: null },
  areas: [
    { id: 'naka-1', ward: 'naka', town: '栄四丁目', banchi: null, days: { kanen: { kind: 'weekly', weekdays: [1, 4] } } },
    { id: 'naka-2', ward: 'naka', town: '金山五丁目', banchi: '1番〜5番', days: { kanen: { kind: 'weekly', weekdays: [2, 5] } } },
    { id: 'naka-3', ward: 'naka', town: '金山五丁目', banchi: '上記以外', days: { kanen: { kind: 'weekly', weekdays: [1, 4] }, funen: { kind: 'nth', slots: [{ n: 2, weekday: 3 }] } } },
  ],
};

describe('収集日の写し', () => {
  it('町名の一覧と、番地で分かれる町', () => {
    expect(townsOf(P, 'naka')).toEqual(['栄四丁目', '金山五丁目'].sort((a, b) => a.localeCompare(b, 'ja')));
    expect(rowsOf(P, 'naka', '栄四丁目')).toHaveLength(1);
    expect(rowsOf(P, 'naka', '金山五丁目')).toHaveLength(2); // このときだけ番地を聞く
  });
  it('次の収集日（施行日が無ければ取得日から。年末年始より後は出さない）', () => {
    const s = toSchedules(P);
    const ready = { kind: 'ready', area_id: 'naka-1' } as const;
    expect(nextCollection(s, ready, 'kanen', '2026-11-06', { allowUnapproved: true })).toEqual({ kind: 'date', date: '2026-11-09' });
    expect(nextCollection(s, ready, 'kanen', '2026-11-06')).toEqual({ kind: 'not_approved' }); // on でないときは出さない
    expect(nextCollection(s, ready, 'kanen', '2026-12-29', { allowUnapproved: true }).kind).toBe('exceptions_unknown');
  });
  it('写しが無いときは null（ビルドも画面もそのまま）', () => {
    expect(privateSchedule(undefined)).toBeNull();
  });
});
