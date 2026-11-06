/* ごみの基本案内（下書き drafts/data/E-gomi.bundle.json）。日を聞かない案内（kind: guide）だけ。 */
import { describe, expect, it } from 'vitest';
import { baseRaw, checkRefs, loadData, withBundles, type Bundle } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';
import json from '../../drafts/data/E-gomi.bundle.json';

const data = loadData(withBundles(baseRaw(), [json as Bundle]));
const ev = data.events.find((e) => e.id === 'E-gomi')!;
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
    expect(plain(c.deadline!.text.ja)).toContain('令和9年（2027年）1月11日');
    expect(plain(c.deadline!.text.ja)).toContain('原則');
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
