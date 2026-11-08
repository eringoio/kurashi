/* 銀行の口座（作者の決定 2026-11-06。docs/TODO_2026-11-06.md 5章 C）。公開のデータ。
   口座が無い → 口座を作る。ある → 変える・やめる・カードを止める・新しいカード・（来日6か月の前後だけ）居住者への変更、一番下に別の口座を作る */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { addMonths } from '../../src/core/date';
import { run } from '../../src/core/engine';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-bank')!;
const TODAY = '2026-11-04';
const go = (answers: Record<string, unknown>) => run(data, { answers: answers as never, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
const st = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!.state;
const HAS = ['bank-info-change', 'bank-account-close', 'bank-card-stop', 'bank-card-reissue', 'bank-account-open-another'];

describe('銀行の口座（公開）', () => {
  it('参照の検査を通る。入口のメニュー 7。最初に口座があるかを聞く', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.menu).toBe(7);
    expect(go({}).upfront.map((q) => q.id)).toEqual(['Q-bank-has', 'Q-nationality']);
  });
  it('ない：口座を作るだけ。あるときの手続きは対象外', () => {
    const o = go({ 'Q-bank-has': false });
    expect(st(o, 'bank-account-open')).not.toBe('excluded');
    for (const id of HAS) expect(st(o, id), id).toBe('excluded');
    expect(o.upfront).toEqual([]); // 来日の時期は、口座がある人だけに聞く
  });
  it('ある：変える・やめる・止める・新しいカード・別の口座。口座を作るは対象外。来日の時期を聞く', () => {
    const o = go({ 'Q-bank-has': true });
    expect(st(o, 'bank-account-open')).toBe('excluded');
    for (const id of HAS) expect(st(o, id), id).not.toBe('excluded');
    // B-4：口座がある → 国籍 → （日本以外なら）来日の時期
    expect(o.upfront.map((q) => q.id)).toEqual(['Q-nationality']);
    expect(go({ 'Q-bank-has': true, 'Q-nationality': 'foreign' }).upfront.map((q) => q.id)).toEqual(['Q-arrival']);
    expect(go({ 'Q-bank-has': true, 'Q-nationality': 'japanese' }).upfront).toEqual([]);
    expect(st(go({ 'Q-bank-has': true, 'Q-nationality': 'japanese' }), 'bank-resident-change')).toBe('excluded');
    expect(data.flow.card_order.indexOf('bank-account-open-another')).toBeGreaterThan(data.flow.card_order.indexOf('bank-card-reissue'));
  });
  it('居住者の登録を確かめる：来日の時期で外さない（kaizen/ginkou 3）。日本国籍には出さない', () => {
    expect(st(go({ 'Q-bank-has': true, 'Q-nationality': 'foreign', 'Q-arrival': 'about6' }), 'bank-resident-change')).not.toBe('excluded');
    expect(st(go({ 'Q-bank-has': true, 'Q-nationality': 'foreign', 'Q-arrival': 'lt6' }), 'bank-resident-change')).not.toBe('excluded');
    expect(st(go({ 'Q-bank-has': true, 'Q-nationality': 'foreign', 'Q-arrival': 'long' }), 'bank-resident-change')).not.toBe('excluded');
  });
  it('6か月後の日（月末はその月の最後の日）', () => {
    expect(addMonths('2026-05-10', 6)).toBe('2026-11-10');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(data.cards.find((c) => c.id === 'bank-resident-change')!.reminder).toEqual({ months: 6, from: 'arrival' });
  });
});
