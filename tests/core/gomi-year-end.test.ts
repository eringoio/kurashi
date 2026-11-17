/* 年末年始の収集日（R-14・S-5）。市の表（2026-11-02 更新）と、アプリが計算した日が同じかを確かめる。
   下の OFFICIAL は、市のページの表を読んで、このテストのために別に写したもの（data/gomi/year-end.json を読まない）。
   - 全体：https://www.city.nagoya.jp/kurashi/gomi/1012183/1054883.html
   - 瑞穂区のモデル地域：https://www.city.nagoya.jp/kurashi/gomi/1012183/1055095/index.html（5つの学区のページ） */
import { describe, expect, it } from 'vitest';
import { addDays, nextCollection, type ScheduleRule } from '../../src/core/gomi';
import { EXCEPTIONS_UNTIL, toSchedules, YEAR_END, yearEndExceptions, yearEndInView, type PrivateArea, type PrivateSchedule } from '../../src/core/gomiSchedule';
import scheduleJson from '../../data/gomi/schedule.json';

const SRC = { url: 'https://www.city.nagoya.jp/kurashi/gomi/1012183/1037098.html', title: 'ごみ収集日検索', fetched_at: '2026-11-06', valid_from: null };
const one = (rule: ScheduleRule, category: string, id = 't-1'): PrivateSchedule => ({ source: SRC, areas: [{ id, ward: 'naka', town: 'x', banchi: null, days: { [category]: rule } }] });
const ready = (id = 't-1') => ({ kind: 'ready', area_id: id }) as const;

/** その区分の収集日の一覧（from〜to）。日付が出ない日があれば 'unknown' を入れる */
function dates(p: PrivateSchedule, category: string, from: string, to: string, id = p.areas[0].id): string[] {
  const s = toSchedules(p);
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const n = nextCollection(s, ready(id), category, d, { allowUnapproved: true, horizonDays: 0 });
    if (n.kind === 'date' && n.date === d) out.push(d);
    if (n.kind === 'exceptions_unknown') out.push('unknown:' + d);
  }
  return out;
}
const lastBefore = (list: string[], d: string) => list.filter((x) => x < d).pop();
const firstFrom = (list: string[], d: string) => list.find((x) => x >= d);

// 市の表：年末最後の収集日・年始最初の収集日（曜日ごと）
const OFFICIAL_WEEKLY: { cats: string[]; rows: [number[], string, string][] }[] = [
  { cats: ['kanen', 'hakka'], rows: [[[1, 4], '2026-12-28', '2027-01-04'], [[2, 5], '2026-12-29', '2027-01-05']] },
  { cats: ['plastic', 'denchi'], rows: [[[1], '2026-12-28', '2027-01-04'], [[2], '2026-12-29', '2027-01-05'], [[3], '2026-12-30', '2027-01-06'], [[4], '2026-12-24', '2027-01-07'], [[5], '2026-12-25', '2027-01-08']] },
  { cats: ['bin', 'kan', 'kami', 'petbottle'], rows: [[[1], '2026-12-28', '2027-01-11'], [[2], '2026-12-29', '2027-01-05'], [[3], '2026-12-30', '2027-01-06'], [[4], '2026-12-24', '2027-01-07'], [[5], '2026-12-25', '2027-01-08']] },
];
// 市の表：不燃ごみ・粗大ごみ（第何曜日 → 12月・1月の収集日）
const W = { 水: 3, 木: 4, 金: 5 } as const;
const OFFICIAL_NTH: [number, keyof typeof W, string, string][] = [
  [1, '水', '2026-12-02', '2027-01-06'], [1, '木', '2026-12-03', '2027-01-07'], [1, '金', '2026-12-04', '2027-01-08'],
  [2, '水', '2026-12-09', '2027-01-13'], [2, '木', '2026-12-10', '2027-01-14'], [2, '金', '2026-12-11', '2027-01-15'],
  [3, '水', '2026-12-16', '2027-01-20'], [3, '木', '2026-12-17', '2027-01-21'], [3, '金', '2026-12-18', '2027-01-22'],
  [4, '水', '2026-12-23', '2027-01-27'], [4, '木', '2026-12-24', '2027-01-28'], [4, '金', '2026-12-25', '2027-01-29'],
];

describe('年末年始：市の全体の表と同じ日になる', () => {
  for (const g of OFFICIAL_WEEKLY) for (const cat of g.cats) for (const [weekdays, last, first] of g.rows) {
    it(`${cat} ${weekdays.join('・')}曜日：最後 ${last}・最初 ${first}`, () => {
      const list = dates(one({ kind: 'weekly', weekdays }, cat), cat, '2026-12-14', '2027-01-20');
      expect(list.some((x) => x.startsWith('unknown'))).toBe(false);
      expect(lastBefore(list, '2026-12-31')).toBe(last);
      expect(firstFrom(list, '2027-01-01')).toBe(first);
      // 間には1日も無い
      expect(list.filter((x) => x > last && x < first)).toEqual([]);
    });
  }
  for (const [n, w, dec, jan] of OFFICIAL_NTH) for (const cat of ['funen', 'sodai']) {
    it(`${cat} 第${n}${w}曜日：12月 ${dec}・1月 ${jan}`, () => {
      const list = dates(one({ kind: 'nth', slots: [{ n, weekday: W[w] }] }, cat), cat, '2026-12-01', '2027-01-31');
      expect(list).toEqual([dec, jan]);
    });
  }
  it('第1金曜日の地域は 1月1日 ではなく 1月8日（市の例）', () => {
    const list = dates(one({ kind: 'nth', slots: [{ n: 1, weekday: 5 }] }, 'funen'), 'funen', '2027-01-01', '2027-01-31');
    expect(list).toEqual(['2027-01-08']);
  });
  it('期間の後は、ふつうの決まりにもどる（2月の第1金曜日は 2月5日）', () => {
    const list = dates(one({ kind: 'nth', slots: [{ n: 1, weekday: 5 }] }, 'funen'), 'funen', '2027-02-01', '2027-02-28');
    expect(list).toEqual(['2027-02-05']);
  });
});

describe('表に当てはまらない地域・区分は、推測した日付を出さない', () => {
  it('表に無い曜日の組（例：月・水の可燃ごみ）は 12/29〜1/31 を出さず、その前後はふつう', () => {
    const list = dates(one({ kind: 'weekly', weekdays: [1, 3] }, 'kanen'), 'kanen', '2026-12-21', '2027-02-03');
    expect(list.filter((x) => !x.startsWith('unknown'))).toEqual(['2026-12-21', '2026-12-23', '2026-12-28', '2027-02-01', '2027-02-03']);
    expect(list).toContain('unknown:2026-12-29');
    expect(list).toContain('unknown:2027-01-31');
  });
  it('表に無い区分は null', () => {
    expect(yearEndExceptions(YEAR_END, 'x', 'unknown-category', { kind: 'weekly', weekdays: [1] })).toBeNull();
    expect(yearEndExceptions(YEAR_END, 'x', 'funen', { kind: 'nth', slots: [{ n: 5, weekday: 3 }] })).toBeNull();
    expect(yearEndExceptions(YEAR_END, 'x', 'funen', { kind: 'weekly', weekdays: [3] })).toBeNull();
  });
  it('次の年末年始（2027-12-29 から）の表は作らない。known_until より後は日付を出さない', () => {
    expect(EXCEPTIONS_UNTIL < '2027-12-29').toBe(true);
    const s = toSchedules(one({ kind: 'weekly', weekdays: [1, 4] }, 'kanen'));
    expect(nextCollection(s, ready(), 'kanen', addDays(EXCEPTIONS_UNTIL, 1), { allowUnapproved: true }).kind).toBe('exceptions_unknown');
  });
  it('14日の中に年末年始が入るときだけ、市の年末年始のページを示す', () => {
    expect(yearEndInView('2026-12-10')).toBe(false);
    expect(yearEndInView('2026-12-16')).toBe(true);
    expect(yearEndInView('2027-01-31')).toBe(true);
    expect(yearEndInView('2027-02-01')).toBe(false);
  });
});

describe('公開した収集日の表（data/gomi/schedule.json）の全部の行', () => {
  const P = scheduleJson as unknown as PrivateSchedule;
  it('どの行・区分も、年末年始の表に当てはまる（日付が出ない行が無い）', () => {
    const miss: string[] = [];
    for (const a of P.areas) for (const [cat, rule] of Object.entries(a.days)) if (!yearEndExceptions(YEAR_END, a.id, cat, rule)) miss.push(`${a.id} ${cat}`);
    expect(miss).toEqual([]);
  });
});

/* 瑞穂区の資源各戸収集モデル地域（市の学区ごとのページ。2026-11-02 更新）。12月の最後と1月の最初（不燃・粗大は12月と1月の日） */
type Model = { page: string; ids: string[]; last: Record<string, string>; first: Record<string, string>; nth?: Record<string, [string, string]> };
const MODEL: Model[] = [
  { page: '1055093 陽明学区（弥富町円山・紅葉園・桜ヶ岡・月見ヶ岡2から58）', ids: ['mizuho-183', 'mizuho-184', 'mizuho-187', 'mizuho-188'],
    last: { kanen: '2026-12-28', plastic: '2026-12-30', kami: '2026-12-28', petbottle: '2026-12-28', bin: '2026-12-21', kan: '2026-12-21' },
    first: { kanen: '2027-01-04', plastic: '2027-01-06', kami: '2027-01-04', petbottle: '2027-01-04', bin: '2027-01-04', kan: '2027-01-04' },
    nth: { funen: ['2026-12-02', '2027-01-06'], sodai: ['2026-12-03', '2027-01-07'] } },
  { page: '1055093 陽明学区（弥富町月見ヶ岡59から71）', ids: ['mizuho-186'],
    last: { kami: '2026-12-28', bin: '2026-12-21' }, first: { kami: '2027-01-04', bin: '2027-01-04' },
    nth: { funen: ['2026-12-09', '2027-01-13'], sodai: ['2026-12-03', '2027-01-07'] } },
  { page: '1055096 豊岡学区', ids: ['mizuho-4', 'mizuho-11', 'mizuho-72', 'mizuho-73', 'mizuho-116', 'mizuho-165', 'mizuho-169'],
    last: { kanen: '2026-12-29', plastic: '2026-12-30', bin: '2026-12-08', kan: '2026-12-29', kami: '2026-12-29' },
    first: { kanen: '2027-01-05', plastic: '2027-01-06', bin: '2027-01-12', kan: '2027-01-05', kami: '2027-01-05' },
    nth: { funen: ['2026-12-09', '2027-01-13'], sodai: ['2026-12-10', '2027-01-14'] } },
  { page: '1055097 穂波学区（河岸1丁目・神穂町・荒崎町）', ids: ['mizuho-1', 'mizuho-28', 'mizuho-32'],
    last: { kanen: '2026-12-29', plastic: '2026-12-28', bin: '2026-12-23', kan: '2026-12-30' },
    first: { kanen: '2027-01-05', plastic: '2027-01-04', bin: '2027-01-13', kan: '2027-01-06' },
    nth: { funen: ['2026-12-16', '2027-01-20'], sodai: ['2026-12-24', '2027-01-28'] } },
  { page: '1055097 穂波学区（苗代町）', ids: ['mizuho-119'],
    last: { plastic: '2026-12-30', bin: '2026-12-23', kan: '2026-12-30' }, first: { plastic: '2027-01-06', bin: '2027-01-13', kan: '2027-01-06' } },
  { page: '1055098 弥富学区', ids: ['mizuho-98', 'mizuho-133', 'mizuho-138', 'mizuho-193', 'mizuho-195'],
    last: { kanen: '2026-12-29', plastic: '2026-12-24', bin: '2026-12-17', kan: '2026-12-24' },
    first: { kanen: '2027-01-05', plastic: '2027-01-07', bin: '2027-01-07', kan: '2027-01-07' },
    nth: { funen: ['2026-12-09', '2027-01-13'], sodai: ['2026-12-04', '2027-01-08'] } },
  { page: '1055100 高田学区', ids: ['mizuho-120', 'mizuho-143', 'mizuho-63'],
    last: { kanen: '2026-12-28', plastic: '2026-12-25', bin: '2026-12-25', kami: '2026-12-25' },
    first: { kanen: '2027-01-04', plastic: '2027-01-08', bin: '2027-01-08', kami: '2027-01-08' },
    nth: { funen: ['2026-12-23', '2027-01-27'], sodai: ['2026-12-16', '2027-01-20'] } },
];

describe('瑞穂区のモデル地域：学区のページの表と同じ日になる', () => {
  const P = scheduleJson as unknown as PrivateSchedule;
  for (const m of MODEL) for (const id of m.ids) {
    it(`${m.page}：${id}`, () => {
      const a = P.areas.find((x) => x.id === id) as PrivateArea;
      expect(a, id).toBeTruthy();
      expect(a.ward).toBe('mizuho');
      const p: PrivateSchedule = { source: SRC, areas: [a] };
      for (const [cat, last] of Object.entries(m.last)) {
        const list = dates(p, cat, '2026-12-01', '2027-01-31', id);
        expect(lastBefore(list, '2026-12-31'), `${cat} の年末`).toBe(last);
        expect(firstFrom(list, '2027-01-01'), `${cat} の年始`).toBe(m.first[cat]);
      }
      for (const [cat, [dec, jan]] of Object.entries(m.nth ?? {})) expect(dates(p, cat, '2026-12-01', '2027-01-31', id), cat).toEqual([dec, jan]);
    });
  }
  it('陽明学区の上書きは、弥富町の陽明学区の行だけ（町名と番地を確かめる）', () => {
    const ov = YEAR_END.overrides[0];
    const rows = ov.area_ids.map((id) => P.areas.find((x) => x.id === id)!);
    expect(rows.map((r) => r.town)).toEqual(['弥富町', '弥富町', '弥富町', '弥富町', '弥富町']);
    expect(rows.map((r) => r.banchi)).toEqual(['紅葉園', '桜ヶ岡', '月見ヶ岡　59〜71', '月見ヶ岡　上記以外', '円山']);
  });
});
