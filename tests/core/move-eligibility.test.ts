/* 引っ越し（E-move）の対象者の絞り込み（kaizen hikkoshi 2026-11-08）。本人の答えで明らかに対象外のものは除外し、
   制度の条件（未確認）は「確かめる」のまま。住み始める前の届けは「あとで」。 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import type { Value } from '../../src/core/schema';

const data = loadData();
const T = '2026-11-08';
const MOVE = (() => { const e = data.events.find((x) => x.id === 'E-move')!; return { ...e, questions: [], facts: [] }; })();
const go = (answers: Record<string, Value>, objects: Record<string, boolean> = {}) => run(data, { answers, objects, plan: {}, createdOn: T, today: T, mode: 'public', event: MOVE });
const v = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const ABROAD = { 'Q-origin': 'abroad', 'Q-age-band': '20_59', 'Q-moved-in': 'yes' };

describe('引っ越し：対象者の絞り込み', () => {
  it('日本国籍の帰国：外国人の住居地の届出は除外し、帰国の転入届を出す', () => {
    const o = go({ ...ABROAD, 'Q-nationality': 'japanese' });
    expect(v(o, 'nagoya-tennyu-juukyochi').state).toBe('excluded');
    expect([v(o, 'nagoya-tennyu-kikoku').state, v(o, 'nagoya-tennyu-kikoku').section]).toEqual(['shown', 'today']);
  });
  it('外国籍（在留カードあり）：住居地の届出を出し、帰国の転入届は除外', () => {
    const o = go({ ...ABROAD, 'Q-nationality': 'foreign' }, { 'zairyu-card': true });
    expect(v(o, 'nagoya-tennyu-juukyochi').state).not.toBe('excluded');
    expect(v(o, 'nagoya-tennyu-kikoku').state).toBe('excluded');
  });
  it('住民登録のしかたが「わからない」：どちらも除外せず、確かめる', () => {
    const o = go({ ...ABROAD, 'Q-residence-basis': 'unknown' });
    for (const id of ['nagoya-tennyu-juukyochi', 'nagoya-tennyu-kikoku']) expect([v(o, id).state, v(o, id).cause]).toEqual(['check_at_office', 'unknown']);
  });
  it('職場の健康保険・厚生年金の人：国保・国民年金の加入は除外。75歳以上も国保から除外', () => {
    const o = go({ ...ABROAD, 'Q-nationality': 'foreign', 'Q-insurance': 'employer_self', 'Q-pension-type': 'kosei' }, { 'zairyu-card': true });
    expect(v(o, 'nagoya-kokuho-kanyu').state).toBe('excluded');
    expect(v(o, 'kokumin-nenkin-kanyu').state).toBe('excluded');
    const old = go({ ...ABROAD, 'Q-age-band': '60_plus', 'Q-age-75': true, 'Q-insurance': 'none' }, { 'zairyu-card': true });
    expect(v(old, 'nagoya-kokuho-kanyu').state).toBe('excluded');
    expect(v(old, 'kokumin-nenkin-kanyu').state).toBe('excluded');
  });
  it('保険がない人・わからない人：国保は除外しない（未確認の制度の条件は確かめる）', () => {
    expect(v(go({ ...ABROAD, 'Q-insurance': 'none' }, { 'zairyu-card': true }), 'nagoya-kokuho-kanyu').state).not.toBe('excluded');
    expect(v(go({ ...ABROAD, 'Q-insurance': 'unknown' }, { 'zairyu-card': true }), 'nagoya-kokuho-kanyu').state).not.toBe('excluded');
  });
  it('まだ住み始めていない：転入届は「いま」にせず「あとで（住み始めたら）」', () => {
    const o = go({ 'Q-origin': 'other_city', 'Q-moveout': 'not_yet', 'Q-moved-in': 'not_yet' });
    expect([v(o, 'nagoya-tennyu-todoke').section, v(o, 'nagoya-tennyu-todoke').sectionWhy]).toEqual(['later', 'moved_in_not_yet']);
  });
  it('転出届を出した（転出証明書・マイナンバーカード）：前の市の転出届は「もうできた」', () => {
    for (const m of ['paper', 'card']) expect(v(go({ 'Q-origin': 'other_city', 'Q-moveout': m }), 'move-out-notice').section).toBe('done');
  });
  it('電気・ガス・水道・ネットと郵便の転送は、関連する情報（タスクにしない）', () => {
    const o = go({ 'Q-origin': 'other_city', 'Q-moved-in': 'yes' });
    for (const id of ['mail-forward', 'life-electricity', 'life-gas', 'life-water', 'life-internet']) expect(v(o, id).section).toBe('info');
    const a = go({ ...ABROAD, 'Q-nationality': 'foreign' }, { 'zairyu-card': true });
    for (const id of ['life-electricity', 'life-water']) expect(v(a, id).section).toBe('info');
    expect(v(a, 'mail-forward').state).toBe('excluded');
  });
});
