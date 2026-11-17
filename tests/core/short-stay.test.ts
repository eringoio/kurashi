/* 短期滞在の人（R-10 / O-4）：住む人の手続きから外す・同じことを2回聞かない・古い保存が読める */
import { describe, expect, it } from 'vitest';
import { aboutNext } from '../../src/core/about';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { isShortStay } from '../../src/core/shortStay';
import { eventOutOfScope } from '../../src/guide/catalogue';
import { LEVELS } from '../../src/i18n/text';

const data = loadData();
const TODAY = '2026-11-15';
const ev = (id: string) => data.events.find((e) => e.id === id)!;
const go = (id: string | null, answers: Record<string, string>) =>
  run(data, { answers, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', ...(id ? { event: ev(id) } : {}) });
const SHORT = { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'short_stay' };

describe('短期滞在：住む人の手続きから外す', () => {
  it('引っ越し・市内の引っ越し・市外へ出る：在留資格が短期滞在なら範囲外。未回答・ほかの資格は今までどおり', () => {
    expect(go(null, { ...SHORT, 'Q-origin': 'abroad' }).scope).toBe('F');
    expect(go('E-move-within', SHORT).scope).toBe('F');
    expect(go('E-move-out', SHORT).scope).toBe('F');
    expect(go(null, { 'Q-origin': 'abroad' }).scope).not.toBe('F');
    expect(go(null, { 'Q-origin': 'abroad', 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student' }).scope).not.toBe('F');
    expect(go('E-move-within', {}).scope).toBe('T');
    expect(go('E-move-out', { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'work' }).scope).toBe('T');
  });
  it('範囲外の人には、国民健康保険・国民年金・転入届のカードは出ない（範囲外）', () => {
    const o = go('E-move', { ...SHORT, 'Q-origin': 'abroad' });
    expect(o.cards.length).toBeGreaterThan(0);
    const st = (id: string) => o.cards.find((c) => c.card.id === id)!.state;
    for (const id of ['nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu']) expect(st(id), id).toBe('out_of_scope');
  });
  it('ごみ・防災・財布をなくした・在留期間の更新は範囲内（入口に残る）', () => {
    const profile = { ...SHORT };
    for (const id of ['E-gomi', 'E-bousai', 'E-lost-wallet', 'E-stay-renew']) expect(eventOutOfScope(ev(id), profile), id).toBe(false);
    expect(eventOutOfScope(ev('E-move-out'), profile)).toBe(true);
  });
  it('住民登録の形の答えでも同じ：Q-residence-basis=short_stay で引っ越しは範囲外（古い保存）', () => {
    expect(go(null, { 'Q-origin': 'abroad', 'Q-residence-basis': 'short_stay' }).scope).toBe('F');
    expect(isShortStay({ 'Q-residence-basis': 'short_stay' })).toBe(true);
    expect(isShortStay({ 'Q-zairyu-status': 'short_stay' })).toBe(true);
    expect(isShortStay({ 'Q-zairyu-status': 'student', 'Q-residence-basis': 'card_later' })).toBe(false);
    expect(isShortStay({})).toBe(false);
  });
  it('範囲外の理由は全部の表示レベルである', () => {
    for (const id of ['R-scope-not-short-stay', 'R-scope-move-resident']) for (const l of LEVELS) expect(data.rules.get(id)!.reason_when_false?.[l.id], id + l.id).toBeTruthy();
  });
});

describe('短期滞在：同じことを2回聞かない', () => {
  it('在留資格が短期滞在なら、住民登録の形（Q-residence-basis）を聞かず、事実は short_stay', () => {
    const o = go(null, { ...SHORT, 'Q-origin': 'abroad' });
    expect(o.facts.get('residence_basis')).toBe('short_stay');
    expect(o.upfront.map((q) => q.id)).not.toContain('Q-residence-basis');
  });
  it('住民登録の形で短期滞在と答えてあれば、あなたについてで在留資格を聞かない（逆向き）', () => {
    const o = go(null, { 'Q-origin': 'abroad', 'Q-nationality': 'foreign', 'Q-residence-basis': 'short_stay' });
    expect(o.facts.get('zairyu_status')).toBe('short_stay');
    expect(aboutNext(data.questions, { 'Q-nationality': 'foreign', 'Q-residence-basis': 'short_stay' } as never)?.id).not.toBe('Q-zairyu-status');
  });
  it('短期滞在の人に、立場と年齢を聞かない。ほかの在留資格・未回答には今までどおり聞く', () => {
    expect(aboutNext(data.questions, SHORT as never)).toBeUndefined();
    expect(aboutNext(data.questions, { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'other' } as never)?.id).toBe('Q-role');
    expect(aboutNext(data.questions, { 'Q-nationality': 'japanese' } as never)?.id).toBe('Q-role');
  });
  it('本人が別の形で答えていれば、その答えを優先（古い保存：短期滞在 × 在留カードがあとで届く）', () => {
    const o = go(null, { 'Q-origin': 'abroad', 'Q-nationality': 'foreign', 'Q-zairyu-status': 'short_stay', 'Q-residence-basis': 'card_later' });
    expect(o.facts.get('residence_basis')).toBe('card_later');
    expect(o.scope).toBe('F'); // 在留資格が短期滞在なら住む人の手続きは出さない
  });
});

describe('古い保存が読める', () => {
  it('Q-residence-basis の古い答え（card_later・japanese・other_resident・unknown）は今までどおり範囲内', () => {
    for (const b of ['card_later', 'japanese', 'other_resident', 'unknown'])
      expect(go(null, { 'Q-origin': 'abroad', 'Q-residence-basis': b }).scope, b).not.toBe('F');
  });
});
