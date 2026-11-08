/* 収集日の写し（作者の決定 2026-11-06 F）。data/private/ は Git に入らないので、見本の小さな表で確かめる */
import { describe, expect, it } from 'vitest';
import { nextCollection } from '../../src/core/gomi';
import { areaIdToSave, areaRow, banchiOf, privateSchedule, rowsOf, searchTowns, toSchedules, townsOf, type PrivateSchedule } from '../../src/core/gomiSchedule';

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
  it('K-21：町名（と番地）で1行に決まるとき、その area_id を保存できる', () => {
    expect(areaRow(P, 'naka', '栄四丁目')?.id).toBe('naka-1');
    expect(areaRow(P, 'naka', '金山五丁目')).toBeNull();
    expect(areaRow(P, 'naka', '金山五丁目', 'naka-2')?.id).toBe('naka-2');
    expect(areaRow(null, 'naka', '栄四丁目')).toBeNull();
  });
  it('K-21：保存 → 読み込み直し → 行が残る（画面が戻る前に null で上書きしない）', () => {
    // 保存：番地で分かれる町で番地を選ぶ → その行の id を保存する
    const picked = areaRow(P, 'naka', '金山五丁目', banchiOf('naka-3', null))!.id;
    expect(areaIdToSave(null, picked)).toBe('naka-3');
    const saved = { ward_id: 'naka', town: '金山五丁目', area_id: 'naka-3' };
    // 読み込み直し：画面の番地はまだ選んでいない（null）。保存した area_id から同じ行に戻る
    const row = areaRow(P, saved.ward_id, saved.town, banchiOf(null, saved.area_id));
    expect(row?.id).toBe('naka-3');
    expect(areaIdToSave(saved.area_id, row?.id ?? null)).toBeUndefined(); // 書き直さない
    // 行がまだ決まらないときも、保存を消さない
    expect(areaIdToSave(saved.area_id, null)).toBeUndefined();
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

describe('町名の検索', () => {
  const Q: PrivateSchedule = { ...P, areas: [
    ...P.areas.map((a) => ({ ...a, romaji: a.town === '栄四丁目' ? 'Sakae 4-chome' : 'Kanayama 5-chome' })),
    { id: 'naka-4', ward: 'naka', town: '大須一丁目', banchi: null, days: {} },
    { id: 'minami-1', ward: 'minami', town: '栄生町', banchi: null, romaji: 'Sakaecho', days: {} },
  ] };
  it('日本語・全角・算用数字・ローマ字で同じ町に届く', () => {
    expect(searchTowns(Q, 'naka', '栄四')).toEqual(['栄四丁目']);
    expect(searchTowns(Q, 'naka', '栄4')).toEqual(['栄四丁目']);
    expect(searchTowns(Q, 'naka', '栄４丁目')).toEqual(['栄四丁目']);
    expect(searchTowns(Q, 'naka', 'SAKAE 4')).toEqual(['栄四丁目']);
    expect(searchTowns(Q, 'naka', 'sakae4-chome')).toEqual(['栄四丁目']);
  });
  it('別の区や別の町には合わせない・空なら全件・合わなければ0件', () => {
    expect(searchTowns(Q, 'naka', '栄生')).toEqual([]);
    expect(searchTowns(Q, 'naka', '')).toEqual(townsOf(Q, 'naka'));
    expect(searchTowns(Q, 'naka', 'zzz')).toEqual([]);
    expect(searchTowns(Q, 'naka', 'osu')).toEqual([]); // ローマ字が無い町は日本語でだけ探す。推測しない
    expect(searchTowns(Q, 'naka', '大須1')).toEqual(['大須一丁目']);
  });
});

describe('公開した収集日の表（data/gomi/schedule.json）', () => {
  it('文字化け（? など）が無く、番地はすべて英訳がある', async () => {
    const { default: s } = await import('../../data/gomi/schedule.json');
    const { default: n } = await import('../../data/gomi/banchi-names.json');
    const names = (n as { names: Record<string, string> }).names;
    for (const a of (s as PrivateSchedule).areas) {
      expect(a.town + (a.banchi ?? '')).not.toMatch(/[?？�]/);
      if (a.banchi) expect(names[a.banchi], a.banchi).toBeTruthy();
    }
  });
});
