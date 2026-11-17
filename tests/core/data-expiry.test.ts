/* 日付で古くなるデータ（REL-8・G-10）。本当の日付での検査は scripts/check-fresh.mjs（npm run check と npm run deploy で止める）。
   この単体テストは決まった日付で検査の動きを確かめる（npm test が日付だけで落ちないように）。 */
import { describe, expect, it } from 'vitest';
import { freshDates, staleAt, WINDOW_DAYS } from '../../scripts/check-fresh.mjs';

describe('日付で古くなるデータの検査', () => {
  it('調べる日付：ごみの例外・祝日表・自己搬入（切り替わるだけの日は除く）', () => {
    const labels = freshDates().map((d) => d.label);
    expect(labels.some((l) => l.includes('year-end.json'))).toBe(true);
    expect(labels.some((l) => l.includes('holidays.json'))).toBe(true);
    // 2027-01-08（大江・猪子石の終わり）は、次の受付の方法がデータにあるので知らせない（FD-3）
    expect(freshDates().some((d) => d.iso === '2027-01-08')).toBe(false);
  });
  it('データを写した日（2026-11-15）には止めない', () => {
    expect(staleAt('2026-11-15')).toEqual([]);
  });
  it('known_until の30日前から止める（境目）', () => {
    const ye = freshDates().find((d) => d.label.includes('year-end.json'))!;
    const day = (n: number) => new Date(Date.parse(ye.iso + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
    expect(staleAt(day(WINDOW_DAYS + 1)).some((d) => d.label === ye.label)).toBe(false);
    expect(staleAt(day(WINDOW_DAYS)).some((d) => d.label === ye.label)).toBe(true);
  });
  it('止めるときは、することの文を返す（日付だけ延ばさない）', () => {
    const bad = staleAt('2099-01-01');
    expect(bad.length).toBeGreaterThan(0);
    for (const d of bad) expect(d.todo).toMatch(/写し直|作り直|確かめ/);
  });
});
