/* 国民年金：第1号・第2号・第3号・わからないの分け方（作者の決定 2026-11-15）。
   国内から引っ越しただけでは加入の届出を必要にしない。国外から来た人は今までどおり。 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import type { Value } from '../../src/core/schema';

const data = loadData();
const T = '2026-11-15';
const go = (answers: Record<string, Value>) =>
  run(data, { answers, objects: { 'zairyu-card': true }, plan: {}, createdOn: T, today: T, mode: 'public', event: data.events.find((e) => e.id === 'E-move')! });
const nenkin = (answers: Record<string, Value>) => go(answers).cards.find((c) => c.card.id === 'kokumin-nenkin-kanyu')!;
const ME = { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student', 'Q-role': 'student', 'Q-age-band': '20_59', 'Q-moved-in': 'yes', 'Q-insurance': 'none', 'Q-moveout': 'paper' };
const dom = { ...ME, 'Q-origin': 'other_city' };

describe('国民年金の加入：国内から引っ越した人', () => {
  it('第1号で、引っ越す前から入っている：加入は除外（住所の変更も手続き不要・要確認）', () => {
    const c = nenkin({ ...dom, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'yes' });
    expect(c.state).toBe('excluded');
    expect(c.falseRule?.id).toBe('R-nenkin-not-enrolled');
  });
  it('第1号で、まだ入っていない：加入の窓口（要確認）', () => {
    expect(nenkin({ ...dom, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'no' }).state).toBe('check_at_office');
  });
  it('第2号（厚生年金）：加入の届出を出さない', () => {
    expect(nenkin({ ...dom, 'Q-pension-type': 'kosei' }).state).toBe('excluded');
  });
  it('第3号（配偶者の扶養）：国内の引っ越しだけでは加入の届出を出さない。理由に勤め先を通すこと', () => {
    const c = nenkin({ ...dom, 'Q-pension-type': 'spouse_dependent' });
    expect(c.state).toBe('excluded');
    expect(c.falseRule?.id).toBe('R-nenkin-not-enrolled');
    expect(c.falseRule?.reason_when_false?.ja).toContain('{第|だい}3{号|ごう}');
  });
  it('年金の種類がわからない：加入が要ると言い切らない。種類を確かめる案内（年金事務所・ねんきんネット・区役所の保険年金課）', () => {
    const c = nenkin({ ...dom, 'Q-pension-type': 'unknown' });
    expect([c.state, c.cause]).toEqual(['check_at_office', 'unknown']);
    const r = c.card.reasons.check_at_office!;
    for (const k of ['ja', 'ja_easy', 'en'] as const) expect(r[k]).toBeTruthy();
    expect(r.ja).toContain('ねんきんネット');
    expect(r.ja).toContain('{保険|ほけん}{年金|ねんきん}{課|か}');
  });
  it('第1号で「引っ越す前から入っているか」がわからない：同じ確かめの案内', () => {
    const c = nenkin({ ...dom, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'unknown' });
    expect([c.state, c.cause]).toEqual(['check_at_office', 'unknown']);
  });
  it('市内から：同じ分け方', () => {
    for (const origin of ['within_nagoya']) {
      expect(nenkin({ ...ME, 'Q-origin': origin, 'Q-pension-type': 'spouse_dependent' }).state, origin).toBe('excluded');
      expect(nenkin({ ...ME, 'Q-origin': origin, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'yes' }).state, origin).toBe('excluded');
    }
  });
});

describe('国民年金の加入：国外から来た人は今までどおり', () => {
  const abroad = { ...ME, 'Q-origin': 'abroad' };
  it('第1号：外れない。もう入っている答えがあっても外れない（日本に来る前は入っていない）', () => {
    expect(nenkin({ ...abroad, 'Q-pension-type': 'none' }).state).toBe('check_at_office');
    expect(nenkin({ ...abroad, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'yes' }).state).toBe('check_at_office');
  });
  it('第3号：外れない（配偶者の勤め先を通す手続き）。第2号は外れる', () => {
    expect(nenkin({ ...abroad, 'Q-pension-type': 'spouse_dependent' }).state).toBe('check_at_office');
    expect(nenkin({ ...abroad, 'Q-pension-type': 'kosei' }).state).toBe('excluded');
  });
  it('わからない：窓口で確かめる', () => {
    expect(nenkin({ ...abroad, 'Q-pension-type': 'unknown' }).state).toBe('check_at_office');
  });
});

describe('古い保存の答え', () => {
  it('旧：第1号＋入っている（引っ越し）は今も除外。種類が無く「入っている」だけでも除外のまま', () => {
    expect(nenkin({ ...dom, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'yes' }).state).toBe('excluded');
    expect(nenkin({ ...dom, 'Q-nenkin-enrolled': 'yes' }).state).toBe('excluded');
  });
  it('旧：第3号の答え（Q-nenkin-enrolled なし）も読める', () => {
    expect(() => nenkin({ ...dom, 'Q-pension-type': 'spouse_dependent', 'Q-nenkin-enrolled': 'no' })).not.toThrow();
    expect(nenkin({ ...dom, 'Q-pension-type': 'spouse_dependent', 'Q-nenkin-enrolled': 'no' }).state).toBe('excluded');
  });
});
