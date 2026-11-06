/* 在留期間を更新する（下書き drafts/data/E-stay-renew.bundle.json）。在留期間が決まっている人に、更新と、マイナンバーカードの有効期限を延ばす案内を出す。
// B-13（11/6）：在留資格は共通の質問 Q-zairyu-status。旧 Q-sr-status の limited→student（期間が決まっている在留資格）、special_permanent→japanese の代わりに確かめる
   マイナンバーカードのカードは作者の知見（2026-11-05。公式の本文で確認待ち）なので、needs_check。 */
import { describe, expect, it } from 'vitest';
import { baseRaw, checkRefs, loadData, withBundles, type Bundle } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { collectEvidence } from '../../src/core/quotes';
import { AI_CHECK_COUNTS } from '../../src/core/trust';
import json from '../../drafts/data/E-stay-renew.bundle.json';

const data = loadData(withBundles(baseRaw(), [json as Bundle]));
const ev = data.events.find((e) => e.id === 'E-stay-renew')!;
const TODAY = '2026-11-05';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const go = (status: string | undefined, card?: string, over: Partial<EngineInput> = {}) =>
  run(data, { answers: { ...(status ? { 'Q-zairyu-status': status } : {}), ...(card ? { 'Q-sr-mynumber': card } : {}) }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev, ...over });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const ids = (o: ReturnType<typeof run>, state: string) => o.cards.filter((c) => c.state === state).map((c) => c.card.id).sort();
const BOTH = ['zairyu-koshin', 'zairyu-mynumber-extend'];
const mine = (where: string) => where.startsWith('zairyu-') || where.startsWith('R-sr') || where.startsWith('rel-sr') || where === 'E-stay-renew';

describe('在留期間を更新する（下書き）', () => {
  it('型と参照の検査を通る。2枚。verified は無い。電話番号・クエリ付きの URL を書かない', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.card_ids).toEqual(BOTH);
    const s = JSON.stringify(json);
    expect(s).not.toContain('"verified"');
    expect(s).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
    expect(s).not.toMatch(/https?:\/\/[^"]*\?/);
  });
  it('ai_checked は方法だけ。期限・費用・ルール・関係・カード全体は needs_check', () => {
    const items = collectEvidence(data).filter((x) => mine(x.where));
    for (const x of items.filter((y) => y.e.status === 'ai_checked')) expect(AI_CHECK_COUNTS[x.kind]).toBe(true);
    for (const x of items.filter((y) => ['deadline', 'fee', 'rule', 'relation', 'prerequisite', 'card_text'].includes(y.kind))) expect(x.e.status).not.toBe('ai_checked');
  });
  it('最初に、在留期間が決まっているかを聞く。決まっていれば、マイナンバーカードの有無を聞く', () => {
    expect(go(undefined).upfront.map((q) => q.id)).toEqual(['Q-zairyu-status']);
    expect(go('student').upfront.map((q) => q.id)).toEqual(['Q-sr-mynumber']);
    expect(go('permanent').upfront).toEqual([]);
  });
  it('在留期間が決まっていて、カードがある：更新と、カードの期限の延長を出す', () => {
    const o = go('student', 'yes');
    expect(ids(o, 'shown')).toEqual(BOTH);
    expect(ids(o, 'excluded')).toEqual([]);
  });
  it('在留期間が決まっていて、カードがない（境界）：更新だけ。カードの案内は対象外', () => {
    const o = go('student', 'no');
    expect(ids(o, 'shown')).toEqual(['zairyu-koshin']);
    expect(ids(o, 'excluded')).toEqual(['zairyu-mynumber-extend']);
  });
  it('定住者・家族滞在・仕事・配偶者等も在留期間が決まっている：更新を出す（B-13）', () => {
    for (const s of ['long_term', 'family', 'work', 'spouse']) expect(ids(go(s, 'yes'), 'shown')).toEqual(BOTH);
  });
  it('永住者・特別永住者・日本国籍：どちらも対象外。理由は要確認', () => {
    for (const s of ['permanent', 'japanese']) {
      const o = go(s);
      expect(ids(o, 'excluded')).toEqual(BOTH);
      expect(plain(view(o, 'zairyu-koshin').card.reasons.excluded!.ja)).toContain('要確認');
    }
  });
  it('わからない：対象外にせず、窓口で確認にする', () => {
    const o = go('unknown');
    expect(ids(o, 'excluded')).toEqual([]);
    expect([view(o, 'zairyu-koshin').state, view(o, 'zairyu-koshin').cause]).toEqual(['check_at_office', 'unknown']);
    const c = go('student', 'unknown');
    expect(view(c, 'zairyu-koshin').state).toBe('shown');
    expect(view(c, 'zairyu-mynumber-extend').state).toBe('check_at_office');
  });
  it('更新の期限：満了日まで。6か月以上なら3か月前から（needs_check）。標準処理期間と手数料も needs_check', () => {
    const c = view(go('student', 'yes'), 'zairyu-koshin').card;
    const d = plain(c.deadline!.text.ja);
    expect(d).toContain('3か月前から');
    expect(d).toContain('要確認');
    expect(c.deadline!.evidence.status).toBe('needs_check');
    expect(plain(c.summary.ja)).toContain('2週間から1か月');
    const fee = c.methods!.find((m) => /手数料/.test(plain(m.text.ja)))!;
    expect(fee.evidence.status).toBe('needs_check');
    expect(plain(fee.text.ja)).toContain('2026年9月30日');
  });
  it('マイナンバーカードの期限を延ばす：作者の知見。needs_check。窓口で確認（要確認）', () => {
    const c = view(go('student', 'yes'), 'zairyu-mynumber-extend').card;
    expect(plain(c.summary.ja)).toContain('自動では変わりません');
    expect(plain(c.summary.ja)).toContain('要確認');
    for (const e of [c.evidence, c.deadline!.evidence, c.where.evidence, c.methods![0].evidence]) {
      expect(e.status).toBe('needs_check');
      expect(e.source_ids).toEqual(['author-2026-11-05']);
    }
    expect(c.evidence.note).toContain('作者の知見（2026-11-05）。公式の本文で確認待ち');
  });
  it('順番：先に在留期間の更新。カードの延長はその後（関係は注記だけ）', () => {
    const o = go('student', 'yes');
    const order = o.cards.map((c) => c.card.id);
    expect(order.indexOf('zairyu-koshin')).toBeLessThan(order.indexOf('zairyu-mynumber-extend'));
    expect(view(o, 'zairyu-mynumber-extend').notes.some((n) => n.kind === 'practical_prereq')).toBe(true);
  });
});
