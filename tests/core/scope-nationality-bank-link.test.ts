/* 日本国籍の人に「在留期間の更新」を出さない（範囲のルール R-sr-scope）と、銀行の口座のページに公式ページのリンクを出さない */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { eventOutOfScope } from '../../src/guide/catalogue';
import { officialLink } from '../../src/ui/guide';
import { LEVELS } from '../../src/i18n/text';

const TODAY = '2026-11-09';
const data = loadData();
const ev = data.events.find((e) => e.id === 'E-stay-renew')!;
const go = (answers: Record<string, string>) => run(data, { answers, objects: {}, plan: {}, createdOn: null, today: TODAY, mode: 'public', event: ev });

describe('在留期間の更新：国籍で出し分け', () => {
  it('日本国籍と答えた人は範囲外、外国籍・未回答は範囲内（未回答は日本人と決めない）', () => {
    expect(go({ 'Q-nationality': 'japanese' }).scope).toBe('F');
    expect(go({ 'Q-nationality': 'foreign' }).scope).toBe('T');
    expect(go({}).scope).toBe('U');
    expect(go({}).upfront.some((q) => q.fact === 'nationality')).toBe(true);
  });
  it('入口・探すから隠すのは、日本国籍と答えたときの E-stay-renew だけ。答えを変えるとすぐ戻る', () => {
    const hidden = (p: Record<string, string>) => data.events.filter((e) => e.status === 'built' && eventOutOfScope(e, p)).map((e) => e.id);
    expect(hidden({ 'Q-nationality': 'japanese' })).toEqual(['E-stay-renew']);
    expect(hidden({ 'Q-nationality': 'foreign' })).toEqual([]);
    expect(hidden({})).toEqual([]);
  });
  it('範囲外の理由は全部の表示レベルである', () => {
    const r = data.rules.get('R-sr-scope')!;
    for (const l of LEVELS) expect(r.reason_when_false?.[l.id], l.id).toBeTruthy();
  });
});

describe('銀行カード：公式ページのリンクを出さない', () => {
  const card = (id: string) => data.cards.find((c) => c.id === id)!;
  const view = (id: string) => ({ card: card(id) }) as unknown as Parameters<typeof officialLink>[0];
  it('口座を開く・開く（もう1つ）・閉じるは、リンクの代わりに「銀行に直接確認」の文があり、出典の記録は残る', () => {
    for (const id of ['bank-account-open', 'bank-account-open-another', 'bank-account-close']) {
      const c = card(id);
      expect(officialLink(view(id)), id).toBeNull();
      for (const l of LEVELS) expect(c.official_link_none?.[l.id], id + l.id).toBeTruthy();
    }
    expect(card('bank-account-open').official_link_none!.en).toContain('check directly with the bank');
    const srcs = card('bank-account-open').methods!.flatMap((m) => m.evidence.source_ids);
    expect(srcs).toContain('isa-juukyochi');
  });
  it('ほかの手続きの公式ページは、今までどおり出る', () => {
    expect(officialLink(view('nagoya-tennyu-juukyochi'))?.url).toMatch(/^https:\/\//);
  });
});
