/* B1・B2（SPEC 18.0：岐阜県から名古屋の大学に進学した18歳。家族の保険）。同じ仕組みで、データだけを足して動くことを確かめる */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';

const data = loadData();
const TODAY = '2026-11-05';
// 18.0 の B1：最初の答え origin=other_city、age_band=under_20、role=student。カードの中：moveout=card、has_mynumber_card=true、insurance=employer_family、housing=rented、moved_in=yes
const B1 = { 'Q-origin': 'other_city', 'Q-role': 'student', 'Q-age-band': 'under_20', 'Q-moveout': 'card', 'Q-insurance': 'employer_family', 'Q-moved-in': 'yes', 'Q-bank-account': false };
const OBJ = { 'mynumber-card': true, 'room-key': true };
// アプリと同じく、引っ越し（E-move）のカードだけで判定する（11/6：市内の引っ越しの2枚を公開にしたため）
const MOVE = (() => { const e = data.events.find((x) => x.id === 'E-move')!; return { ...e, questions: [], facts: [] }; })();
const input = (over: Partial<EngineInput> = {}): EngineInput => ({ answers: B1, objects: OBJ, plan: {}, createdOn: TODAY, today: TODAY, event: MOVE, ...over });
const st = (o: ReturnType<typeof run>) => Object.fromEntries(o.cards.map((c) => [c.card.id, [c.state, c.section]]));

describe('B1（公開時点のデータ）', () => {
  const o = run(data, input());
  it('国外からの経路のカードは入口で excluded（制度の対象ではないとは言わない）。国保・年金は、未確認のルールでは除外しない（10.4）', () => {
    const s = st(o);
    expect(s['nagoya-tennyu-juukyochi'][0]).toBe('excluded');
    expect(o.cards.find((c) => c.card.id === 'nagoya-tennyu-juukyochi')!.falseRule!.kind).toBe('entry');
    expect(s['nagoya-kokuho-kanyu'][0]).toBe('check_at_office');
    expect(s['kokumin-nenkin-kanyu'][0]).toBe('check_at_office');
  });
  it('転入届・転出届は、公式のルールが未確認なので「窓口で確認」。20歳の予告は確認済み（作者 11/5）なので、20歳未満には出る', () => {
    const s = st(o);
    expect(s['nagoya-tennyu-todoke']).toEqual(['check_at_office', 'check']);
    expect(s['move-out-notice'][0]).toBe('check_at_office');
    expect(s['nenkin-at-20']).toEqual(['shown', 'later']);
    expect(s['bank-account-open']).toEqual(['shown', 'today']);
  });
  it('最初の質問は4問以内（origin・role・age_band）', () => {
    const o2 = run(data, input({ answers: { 'Q-origin': 'other_city' }, objects: {} }));
    expect(o2.upfront.map((q) => q.id)).toEqual(['Q-role', 'Q-age-band']);
  });
});

describe('B1・B2（確認済みデータの fixture）', () => {
  it('B1：転出届はカードで済み → excluded。転入届は「いま」。20歳の予告は「あとで」', () => {
    const s = st(run(data, input({ mode: 'verified' })));
    expect(s['move-out-notice'][0]).toBe('excluded');
    expect(s['nagoya-tennyu-todoke']).toEqual(['shown', 'today']);
    expect(s['nenkin-at-20']).toEqual(['shown', 'later']);
    // 家族の保険・20歳未満なので、確認済みなら国保・年金は関係なし
    expect(s['nagoya-kokuho-kanyu'][0]).toBe('excluded');
    expect(s['kokumin-nenkin-kanyu'][0]).toBe('excluded');
  });
  it('B2：転出届がまだ → 転出届が「いま」、転入届は「あとで」（制度上の前提）。転入届の日は、転出届の日を決めてから', () => {
    const o = run(data, input({ mode: 'verified', answers: { ...B1, 'Q-moveout': 'not_yet' } }));
    const s = st(o);
    expect(s['move-out-notice']).toEqual(['shown', 'today']);
    expect(s['nagoya-tennyu-todoke']).toEqual(['shown', 'later']);
    expect(o.cards.find((c) => c.card.id === 'nagoya-tennyu-todoke')!.dayRule).toEqual({ kind: 'need_first', from: 'move-out-notice' });
  });
  it('転出証明書を持っている → moveout=paper で前提は済み', () => {
    const ans: Record<string, string | boolean> = { ...B1 };
    delete ans['Q-moveout'];
    const s = st(run(data, input({ mode: 'verified', answers: ans, objects: { ...OBJ, 'moveout-certificate': true } })));
    expect(s['nagoya-tennyu-todoke']).toEqual(['shown', 'today']);
  });
});
