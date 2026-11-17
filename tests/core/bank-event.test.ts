/* 銀行の口座（作者の決定 2026-11-06。docs/kaizen/ginkou.md 2026-11-08 で見直し）。公開のデータ。
   口座が無い → 口座を作る。申し込んで待っている → 待つ（もう一度申し込ませない）。ある → 手続きは全部「関連する情報」（ToDo にしない）。
   わからない → 「確かめる」は口座を作るの1枚だけ。居住者・非居住者の登録は、国籍・来日の時期で外さない */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { addMonths } from '../../src/core/date';
import { run } from '../../src/core/engine';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-bank')!;
const TODAY = '2026-11-04';
const go = (answers: Record<string, unknown>, plan: Record<string, unknown> = {}) => run(data, { answers: answers as never, objects: {}, plan: plan as never, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const st = (o: ReturnType<typeof run>, id: string) => view(o, id).state;
const sec = (o: ReturnType<typeof run>, id: string) => view(o, id).section;
const HAS = ['bank-info-change', 'bank-account-close', 'bank-card-stop', 'bank-card-reissue', 'bank-resident-change', 'bank-account-open-another'];
/** ToDo の区分け（いま・確かめる・待つ・あとで） */
const TODO = ['today', 'check', 'wait', 'later'];
const methodText = (o: ReturnType<typeof run>, id: string) => view(o, id).methods.map((m) => m.method.text.ja).join('\n');

describe('銀行の口座（公開）', () => {
  it('参照の検査を通る。入口のメニュー 7。最初に口座があるかだけを聞く（国籍・来日の時期・あなたについては聞かない）', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.menu).toBe(7);
    expect(ev.about_step).toBe(false);
    expect(go({}).upfront.map((q) => q.id)).toEqual(['Q-bank-has']);
    const q = data.questions.find((x) => x.id === 'Q-bank-has')!;
    expect(q.options.map((x) => x.value)).toEqual([true, 'pending', false, 'unknown']);
  });
  it('ない：口座を作るが「いま」。あるときの手続きは対象外。義務にしない', () => {
    const o = go({ 'Q-bank-has': false });
    expect(sec(o, 'bank-account-open')).toBe('today');
    expect(view(o, 'bank-account-open').card.obligation).not.toBe('legal');
    for (const id of HAS) expect(st(o, id), id).toBe('excluded');
    expect(o.upfront).toEqual([]);
    expect(methodText(o, 'bank-account-open')).toContain('{流|なが}れ');
    expect(methodText(o, 'bank-account-open')).not.toContain('{申|もう}し{込|こ}んだ{人|ひと}');
  });
  it('申込済み・カード待ち：待つ。もう一度申し込ませず、銀行に状況を確かめる', () => {
    for (const a of [{ 'Q-bank-has': 'pending' }, { 'Q-bank-account': 'pending' }]) {
      const o = go(a);
      expect(sec(o, 'bank-account-open')).toBe('wait');
      for (const id of HAS) expect(st(o, id), id).toBe('excluded');
      const t = methodText(o, 'bank-account-open');
      expect(t).toContain('{申|もう}し{込|こ}んだ{人|ひと}');
      expect(t).not.toContain('{流|なが}れ'); // 口座を作る方法は出さない
    }
  });
  it('口座あり（日本国籍・外国籍・国籍未回答）：手続きは全部「関連する情報」。ToDo を作らない', () => {
    for (const a of [{ 'Q-bank-has': true }, { 'Q-bank-has': true, 'Q-nationality': 'japanese' }, { 'Q-bank-has': true, 'Q-nationality': 'foreign' }]) {
      const o = go(a);
      expect(st(o, 'bank-account-open')).toBe('excluded');
      for (const id of HAS) { expect(st(o, id), id).toBe('shown'); expect(sec(o, id), id).toBe('info'); }
      expect(o.cards.filter((c) => c.section && TODO.includes(c.section))).toEqual([]);
      expect(o.upfront).toEqual([]);
    }
  });
  it('居住者・非居住者：外国籍は来日の時期で外さない（6か月未満・前後・以上・不明）。日本国籍にも出す（海外居住・帰国）', () => {
    for (const arr of ['lt6', 'about6', 'long', 'unknown', undefined]) {
      const a: Record<string, unknown> = { 'Q-bank-has': true, 'Q-nationality': 'foreign' };
      if (arr) a['Q-arrival'] = arr; // 前に答えた来日の時期が残っていても落ちない
      expect(sec(go(a), 'bank-resident-change'), String(arr)).toBe('info');
    }
    const jp = go({ 'Q-bank-has': true, 'Q-nationality': 'japanese' });
    expect(sec(jp, 'bank-resident-change')).toBe('info');
    expect(methodText(jp, 'bank-resident-change')).toContain('2{年|ねん}{以上|いじょう}');
    expect(methodText(jp, 'bank-resident-change')).not.toContain('6か{月|げつ}は{入国|にゅうこく}した{日|ひ}から');
    const fo = methodText(go({ 'Q-bank-has': true, 'Q-nationality': 'foreign' }), 'bank-resident-change');
    expect(fo).toContain('6か{月|げつ}は{入国|にゅうこく}した{日|ひ}から');
    expect(fo).toContain('アルバイト');
    const card = data.cards.find((c) => c.id === 'bank-resident-change')!;
    expect(card.deadline).toBeNull();
    expect(card.obligation).not.toBe('legal');
  });
  it('口座の有無が不明：「確かめる」は口座を作るの1枚だけ。ほかは関連する情報', () => {
    const o = go({ 'Q-bank-has': 'unknown' });
    expect(o.cards.filter((c) => c.section === 'check').map((c) => c.card.id)).toEqual(['bank-account-open']);
    for (const id of HAS) expect(sec(o, id), id).toBe('info');
    expect(o.upfront).toEqual([]);
  });
  it('カードの紛失：止めるは口座がある人にいつも開ける（関連する情報の最初）。再発行へつなぐ。前にすることは無い', () => {
    const o = go({ 'Q-bank-has': true });
    expect(o.cards.filter((c) => c.section === 'info')[0].card.id).toBe('bank-card-stop');
    expect(data.relations.some((r) => r.type === 'related' && r.from === 'bank-card-stop' && r.to === 'bank-card-reissue')).toBe(true);
    expect(data.relations.some((r) => 'to' in r && r.to === 'bank-card-stop' && r.type !== 'related')).toBe(false);
    expect(view(o, 'bank-card-stop').dayRule.kind).not.toBe('need_first');
  });
  it('保存済みの記録：本人が始めた手続き（準備中）は「いま」。済んだは済んだ', () => {
    const o = go({ 'Q-bank-has': true }, { 'bank-account-close': { status: 'preparing' }, 'bank-info-change': { status: 'done' } });
    expect(sec(o, 'bank-account-close')).toBe('today');
    expect(sec(o, 'bank-info-change')).toBe('done');
    expect(sec(o, 'bank-account-open-another')).toBe('info');
  });
  it('6か月後の日（月末はその月の最後の日）。リマインダーは入国の日から（任意）', () => {
    expect(addMonths('2026-05-10', 6)).toBe('2026-11-10');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(data.cards.find((c) => c.id === 'bank-resident-change')!.reminder).toEqual({ months: 6, from: 'arrival' });
  });
});
