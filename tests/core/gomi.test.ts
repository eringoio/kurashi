/* ごみの基本案内（11/7 C-7 で公開のデータへ移した）。日を聞かない案内（kind: guide）だけ。 */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';
import { areaStatus, bulkyApplyBy, bulkyBeforeMoveOut, deliveryRegime, judgeItem, nextCollection, nthOfMonth, searchItems, type Schedule } from '../../src/core/gomi';
import { parseGomi } from '../../src/core/gomiData';
import items from '../../data/gomi/items.json';
import areas from '../../data/gomi/areas.json';
import delivery from '../../data/gomi/delivery.json';
import opendata from '../../data/gomi/opendata.json';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-gomi')!;
/** このできごとの分（元のまとまりと同じ範囲。11/7 C-7） */
const json = { events: [ev], cards: data.cards.filter((c) => ev.card_ids.includes(c.id)), rules: [...data.rules.values()].filter((r) => r.id.startsWith('R-gomi')), relations: data.relations.filter((r) => r.id.startsWith('rel-gomi')) };
const TODAY = '2026-11-04';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf("|")));
const o = run(data, { answers: {}, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
const card = (id: string) => data.cards.find((c) => c.id === id)!;

describe('ごみの基本案内（下書き）', () => {
  it('型と参照の検査を通る。すべて needs_check', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(JSON.stringify(json)).not.toContain('"verified"');
  });
  it('質問せず、すべて日を聞かない案内で、すべて出る', () => {
    expect(o.upfront).toEqual([]);
    expect(o.scope).toBe('T');
    expect(data.cards.filter((c) => ev.card_ids.includes(c.id)).every((c) => c.kind === 'guide')).toBe(true);
    expect(o.cards.map((c) => c.state)).toEqual(o.cards.map(() => 'shown'));
    expect(o.cards.every((c) => c.dayRule.kind === 'no_day')).toBe(true);
    expect(nowStep(o, TODAY).kind).toBe('idle');
  });
  it('入口のメニューに出る（menu 2。A-10）', () => {
    expect(ev.menu).toBe(2);
    expect(ev.group).toBe('gomi');
  });
  it('粗大ごみは、2026年10月の変更を日付つきで書く', () => {
    const s = plain(card('gomi-sodai').summary.ja);
    expect(s).toContain('令和8年（2026年）10月から');
    expect(s).toContain('45リットル');
    expect(s).toContain('要確認');
  });
  it('自己搬入の予約は、日付と「原則」つき。金額は原文どおり', () => {
    const c = card('gomi-mochikomi');
    expect(c.deadline).toBeNull(); // K-23：日を聞かない。時期ごとの方法は summary と delivery に
    expect(plain(c.summary.ja)).toContain('令和9年（2027年）1月11日');
    expect(plain(c.summary.ja)).toContain('原則');
    expect(c.links?.[0]?.url).toContain('https://www.city.nagoya.jp/');
    expect(plain(c.fee!.text.ja)).toContain('10キログラムまでごとに270円'); expect(c.fee!.evidence.status).toBe('ai_checked'); // B-7b：費用の欄へ移した
  });
  it('収集日は、区・町名で公式の案内へ。多言語のアプリの独立カードは無い（/gomi と収集日のカードに統合）', () => {
    expect(plain(card('gomi-shushubi').summary.ja)).toContain('地域');
    expect(data.sources.find((s) => card('gomi-shushubi').evidence.source_ids.includes(s.source_id))!.url).toContain('https://www.city.nagoya.jp/');
    expect(data.cards.find((c) => c.id === 'gomi-app')).toBeUndefined();
    expect(ev.tool?.path).toBe('/gomi');
  });
  it('粗大ごみ・自己搬入は「あとで」（全員の今週の作業にしない）。分け方・収集日は「いま」', () => {
    const sec = (id: string) => o.cards.find((c) => c.card.id === id)!.section;
    expect(sec('gomi-sodai')).toBe('later');
    expect(sec('gomi-mochikomi')).toBe('later');
    expect(sec('gomi-bunbetsu')).toBe('today');
    expect(sec('gomi-shushubi')).toBe('today');
    expect(plain(card('gomi-sodai').title.ja)).toBe('粗大ごみを出す');
  });
  it('電話番号を書かない', () => {
    expect(JSON.stringify(json)).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
  });
});

describe('お知らせの表示の期限（11/7 B-7c）', () => {
  const at = (today: string) => run(data, { answers: {}, objects: {}, plan: {}, createdOn: today, today, mode: 'public', event: ev }).cards.find((c) => c.card.id === 'gomi-sodai')!;
  it('10月の粗大ごみの変更は 2027-03-31 まで出し、2027-04-01 には消える', () => {
    expect(at('2026-11-04').notices.map((n) => plain(n.text.ja))).toEqual(['令和8年（2026年）10月から、粗大ごみの対象が変わりました']);
    expect(at('2027-03-31').notices).toHaveLength(1);
    expect(at('2027-04-01').notices).toEqual([]);
  });
  it('noticeActive：両端を含む。無い側は制限なし', async () => {
    const { noticeActive } = await import('../../src/core/notice');
    expect(noticeActive({ show_from: '2026-12-01', show_until: '2026-12-31' }, '2026-12-01')).toBe(true);
    expect(noticeActive({ show_from: '2026-12-01' }, '2026-11-30')).toBe(false);
    expect(noticeActive({}, '2099-01-01')).toBe(true);
  });
});

/* ───── ごみの判定の部品と道具のデータ（11/7 5章：gomi-tool.test.ts を1本にまとめた） ───── */
{
/* ごみの判定の部品（src/core/gomi.ts）と下書きのデータ（data/gomi/）。
   受入テスト（docs/prompts/kurashi_waste_handoff/04 の4章）と統合の指摘 INT-001・INT-008 のうち、データと関数で確かめられるもの。
   合格しても、制度の正しさや作者の承認の代わりにはならない。 */

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
  it('区分は、いまの市の表（2026年10月）の行から。市の表に無い行だけ区分を出さない', () => {
    const raw = opendata.items as { review?: unknown; category?: string; evidence: { source_ids: string[] } }[];
    expect(raw.filter((x) => !x.review).every((x) => x.evidence.source_ids.includes('gomi-search-1035233'))).toBe(true);
    expect(raw.filter((x) => x.review).every((x) => !x.evidence.source_ids.includes('gomi-search-1035233'))).toBe(true);
    expect(opendata.counts.review).toBe(5);
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

describe('自己搬入・粗大ごみのお知らせ（11/7 B-7c）', () => {
  it('delivery.json のお知らせは 2027-03-31 まで', async () => {
    const { activeNotices } = await import('../../src/core/notice');
    const d = (await import('../../data/gomi/delivery.json')).default as { notices?: { show_until?: string }[] };
    expect(activeNotices(d.notices, '2027-03-31')).toHaveLength(1);
    expect(activeNotices(d.notices, '2027-04-01')).toHaveLength(0);
  });
});
}
