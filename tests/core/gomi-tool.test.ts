/* ごみの判定の部品（src/core/gomi.ts）と下書きのデータ（drafts/gomi/）。
   受入テスト（docs/prompts/kurashi_waste_handoff/04 の4章）と統合の指摘 INT-001・INT-008 のうち、データと関数で確かめられるもの。
   合格しても、制度の正しさや作者の承認の代わりにはならない。 */
import { describe, expect, it } from 'vitest';
import { areaStatus, bulkyApplyBy, bulkyBeforeMoveOut, deliveryRegime, judgeItem, nextCollection, nthOfMonth, searchItems, type Schedule } from '../../src/core/gomi';
import { parseGomi } from '../../src/core/gomiData';
import items from '../../drafts/gomi/items.json';
import areas from '../../drafts/gomi/areas.json';
import delivery from '../../drafts/gomi/delivery.json';
import opendata from '../../drafts/gomi/opendata.json';

const d = parseGomi({ items, areas, delivery, opendata });
const curatedOnly = parseGomi({ items, areas, delivery });
const item = (id: string) => d.items.items.find((x) => x.id === id)!;
const cat = (id: string, choice?: string) => { const r = judgeItem(d.items, item(id), choice); return r.kind === 'result' ? r.category.id : r.kind; };

describe('下書きのデータ', () => {
  it('型と参照を通る。すべて needs_check。公開の確定（verified）は無い', () => {
    expect(JSON.stringify([items, areas, delivery])).not.toContain('"verified"');
    expect(d.items.items.every((x) => x.evidence.status === 'needs_check' && !!x.evidence.quote)).toBe(true);
  });
  it('古い30cmの基準を、いまの判定に使わない（2026年10月以降は45L）', () => {
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/30センチメートル角を超える場合/);
    expect(d.items.categories.find((c) => c.id === 'sodai')!.how.ja).toContain('7日前');
  });
  it('収集日の表は取り込んでいない（全市対応と出さない）', () => {
    expect(d.schedules).toEqual([]);
    expect(d.areas.wards).toHaveLength(16);
  });
});

describe('品目の判定（WASTE_001・005・007）', () => {
  it('1 茶わん：材質で変わる。材質を聞く前・わからないは確定しない', () => {
    expect(cat('chawan')).toBe('ask');
    expect(cat('chawan', 'ceramic')).toBe('funen');
    expect(cat('chawan', 'plastic')).toBe('plastic');
    expect(cat('chawan', 'unknown')).toBe('unknown');
  });
  it('2 傘：45Lの袋に入らなくても粗大ごみにしない（例外）', () => {
    expect(cat('kasa')).toBe('funen');
    expect(item('kasa').note!.ja).toContain('例外');
  });
  it('4 まな板：プラスチックは厚さで変わる', () => {
    expect(cat('manaita', 'plastic_thin')).toBe('plastic');
    expect(cat('manaita', 'plastic_thick')).toBe('kanen');
    expect(cat('manaita', 'wood')).toBe('kanen');
  });
  it('5 充電式の掃除機：ふつうの不燃ごみにしない', () => {
    expect(cat('soujiki', 'rechargeable')).toBe('juden');
    expect(cat('soujiki', 'corded_big')).toBe('sodai');
  });
  it('6 モバイルバッテリー：電池類（危険）。プラスチック資源にしない', () => {
    expect(cat('mobile_battery')).toBe('denchi');
    expect(d.items.categories.find((c) => c.id === 'denchi')!.route).toBe('hazard');
  });
  it('7 スプレー缶：電池と混ぜず、穴あけをすすめない', () => {
    expect(cat('spray')).toBe('hakka');
    const how = d.items.categories.find((c) => c.id === 'hakka')!.how.ja;
    expect(how).toContain('穴あけは不要');
  });
  it('8・INT-001 冷蔵庫・テレビ・洗濯機：粗大ごみ・自己搬入に進めない。完了待ちを作らず、専用の経路へ直行', () => {
    for (const id of ['reizouko', 'tv', 'sentakuki', 'aircon']) {
      const r = judgeItem(d.items, item(id));
      expect(r.kind).toBe('result');
      if (r.kind === 'result') { expect(r.category.route).toBe('not_collected'); expect(r.category.links.length).toBeGreaterThan(0); }
    }
  });
  it('9 パソコン：メーカーの回収', () => { expect(cat('pc')).toBe('pc'); });
  it('ふとん：袋に入るときの区分は表に無い → 確定しない', () => {
    expect(cat('futon', 'no')).toBe('sodai');
    expect(cat('futon', 'fits')).toBe('unknown');
  });
  it('探す：ひらがな・カタカナ・英語で見つかる。無い品物は空（公式の検索へ）', () => {
    expect(searchItems(d.items, 'カサ')[0].id).toBe('kasa');
    expect(searchItems(d.items, 'fridge')[0].id).toBe('reizouko');
    expect(searchItems(d.items, 'でんち').map((x) => x.id)).toContain('kandenchi');
    expect(searchItems(d.items, 'ろけっと')).toEqual([]);
    expect(searchItems(d.items, '  ')).toEqual([]);
  });
});

describe('オープンデータ（BODIK、CC BY 4.0）の取り込み', () => {
  const od = d.items.items.filter((x) => x.id.startsWith('od_'));
  it('出典・ライセンス・件数・ハッシュを記録する', () => {
    expect(opendata.source.license).toContain('Creative Commons Attribution');
    expect(opendata.source.rows).toBe(1227);
    expect(opendata.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.items.sources.find((s) => s.source_id === 'bodik-sagyo-01')?.license).toBeTruthy();
  });
  it('粗大ごみ・30cm の記述の行は区分を出さない（2026年10月の改定の前のデータ）', () => {
    const raw = opendata.items as { review?: unknown; category?: string; evidence: { quote: string } }[];
    expect(raw.some((x) => x.category === 'sodai')).toBe(false);
    expect(raw.filter((x) => /30s*(センチ|cm)/.test(x.evidence.quote)).every((x) => x.review)).toBe(true);
    const r = od.find((x) => x.review)!;
    expect(judgeItem(d.items, r).kind).toBe('review');
  });
  it('手で確かめた品目が先。同じ品目のオープンデータの行は使わない', () => {
    expect(searchItems(d.items, 'かさ')[0].id).toBe('kasa');
    expect(searchItems(d.items, 'ちゃわん')[0].id).toBe('chawan');
    expect(od.some((x) => /^茶わん/.test(x.label.ja))).toBe(false);
    expect(d.items.items.length).toBeGreaterThan(curatedOnly.items.items.length + 500);
  });
  it('よみで探せる（漢字の品目をひらがなで）', () => {
    expect(searchItems(d.items, 'かいがら').map((x) => x.label.ja)).toContain('貝殻');
  });
});

describe('地域と収集日（WASTE_002・008）', () => {
  const s: Schedule = {
    area_id: 'naka-sakae-1', category: 'kanen', rule: { kind: 'weekly', weekdays: [1, 4] },
    valid_from: '2026-04-01', valid_to: null, observed_at: '2026-11-04', exceptions: [{ date: '2026-12-31', kind: 'skip' }, { date: '2027-01-04', kind: 'skip' }],
    exceptions_known_until: '2027-03-31', review_status: 'approved',
  };
  const ready = { kind: 'ready' as const, area_id: 'naka-sakae-1' };
  it('17 地域が無い・区だけ：日付を作らない', () => {
    expect(areaStatus(null, { movedOn: [], areasWithData: [] }).kind).toBe('unset');
    const ward = areaStatus({ ward_id: 'naka', area_id: null, set_on: '2026-11-01' }, { movedOn: [], areasWithData: ['naka-sakae-1'] });
    expect(ward.kind).toBe('ward_only');
    expect(nextCollection([s], ward, 'kanen', '2026-11-04').kind).toBe('area');
  });
  it('18 データの無い地域：no_data', () => {
    expect(areaStatus({ ward_id: 'naka', area_id: 'naka-x', set_on: '2026-11-01' }, { movedOn: [], areasWithData: ['naka-sakae-1'] }).kind).toBe('no_data');
  });
  it('引っ越し後は前の地域を使わない（旧地域の無効化）', () => {
    const st = areaStatus({ ward_id: 'naka', area_id: 'naka-sakae-1', set_on: '2026-10-01' }, { movedOn: ['2026-11-02'], areasWithData: ['naka-sakae-1'] });
    expect(st).toEqual({ kind: 'needs_recheck', since: '2026-11-02' });
  });
  it('毎週の曜日：今日を含む次の日', () => {
    expect(nextCollection([s], ready, 'kanen', '2026-11-04')).toEqual({ kind: 'date', date: '2026-11-05' }); // 水 → 木
  });
  it('16 年末年始：曜日が合っても、例外の日は飛ばす', () => {
    expect(nextCollection([s], ready, 'kanen', '2026-12-31')).toEqual({ kind: 'date', date: '2027-01-07' }); // 12/31(木) skip → 1/4(月) skip → 1/7(木)
  });
  it('例外の一覧が無い期間は日付を出さない', () => {
    expect(nextCollection([{ ...s, exceptions_known_until: '2026-12-20' }], ready, 'kanen', '2026-12-25').kind).toBe('exceptions_unknown');
  });
  it('15 第N曜日：月のN回目の曜日（年越し・月末）', () => {
    const nth: Schedule = { ...s, category: 'funen', rule: { kind: 'nth', slots: [{ n: 3, weekday: 3 }] }, exceptions: [] };
    expect(nthOfMonth('2026-11-18')).toBe(3);
    expect(nextCollection([nth], ready, 'funen', '2026-11-04')).toEqual({ kind: 'date', date: '2026-11-18' });
    expect(nextCollection([nth], ready, 'funen', '2026-12-17')).toEqual({ kind: 'date', date: '2027-01-20' });
  });
  it('未承認・適用期間の外・施行日不明・同じ地域の表が2つ：日付を出さない', () => {
    expect(nextCollection([{ ...s, review_status: 'needs_human_review' }], ready, 'kanen', '2026-11-04').kind).toBe('not_approved');
    expect(nextCollection([{ ...s, valid_from: null }], ready, 'kanen', '2026-11-04').kind).toBe('outside_validity');
    expect(nextCollection([{ ...s, valid_to: '2026-10-31' }], ready, 'kanen', '2026-11-04').kind).toBe('outside_validity');
    expect(nextCollection([s, s], ready, 'kanen', '2026-11-04').kind).toBe('no_schedule');
  });
});

describe('粗大ごみ（WASTE_003・006）', () => {
  it('11 締切は収集日から数える（7日前）。退去日から数えない', () => {
    expect(bulkyApplyBy('2026-11-20', 7)).toBe('2026-11-13');
  });
  it('退去5日前で間に合わない：自己搬入・許可業者・相談の代わりの経路', () => {
    const p = bulkyBeforeMoveOut(['2026-11-20', '2026-12-18'], '2026-11-15', '2026-11-20', 7);
    expect(p.kind).toBe('too_late');
    if (p.kind === 'too_late') expect(p.alternatives).toContain('self_delivery');
  });
  it('間に合うとき：収集日と締切。日の候補が無ければ決めない', () => {
    expect(bulkyBeforeMoveOut(['2026-11-20'], '2026-11-04', '2026-11-30', 7)).toEqual({ kind: 'in_time', collection: '2026-11-20', applyBy: '2026-11-13' });
    expect(bulkyBeforeMoveOut([], '2026-11-04', '2026-11-30', 7).kind).toBe('no_dates');
  });
});

describe('自己搬入（WASTE_004・INT-008）：持ち込む予定の日で選ぶ', () => {
  const ids = (day: string) => { const r = deliveryRegime(d.delivery.regimes, day); return r.kind === 'regime' ? r.regimes.map((x) => x.id) : r.kind; };
  it('13 切り替え：12/13 当日受付だけ／12/14・1/8 併用／1/9・1/10 公式に書かれていない／1/11 予約だけ', () => {
    expect(ids('2026-12-13')).toEqual(['walk_in']);
    expect(ids('2026-12-14')).toEqual(['walk_in', 'parallel']);
    expect(ids('2027-01-08')).toEqual(['walk_in', 'parallel']);
    expect(ids('2027-01-09')).toBe('not_stated');
    expect(ids('2027-01-10')).toBe('not_stated');
    expect(ids('2027-01-11')).toEqual(['booking_only']);
  });
  it('確認した日（as_of）と施行日を分ける：施行日の分からない端は null のまま', () => {
    expect(d.delivery.as_of).toBe('2026-11-04');
    expect(d.delivery.regimes.find((r) => r.id === 'walk_in')!.from).toBeNull();
    expect(d.delivery.regimes.every((r) => r.from !== '2026-11-04')).toBe(true);
  });
});
