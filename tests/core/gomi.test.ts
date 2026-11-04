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
  it('入口のメニューに出る（menu 3）', () => {
    expect(ev.menu).toBe(3);
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
    expect(plain(c.summary.ja)).toContain('10キログラムまでごとに270円');
  });
  it('収集日は、区・町名で公式の案内へ。多言語のアプリは8言語', () => {
    expect(plain(card('gomi-shushubi').summary.ja)).toContain('地域');
    expect(data.sources.find((s) => card('gomi-shushubi').evidence.source_ids.includes(s.source_id))!.url).toContain('https://www.city.nagoya.jp/');
    expect(plain(card('gomi-app').summary.ja)).toContain('8言語');
  });
  it('電話番号を書かない', () => {
    expect(JSON.stringify(json)).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
  });
});
