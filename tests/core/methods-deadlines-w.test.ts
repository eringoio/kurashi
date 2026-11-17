/* W-1〜W-6・V-2・V-3・V-4（2026-11-15 作者の決定）。公式の文に無い数え方・「過ぎても出せる」を言わない */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import type { PlanRecord } from '../../src/core/entry';
import { run } from '../../src/core/engine';
import type { Value } from '../../src/core/schema';
import strings from '../../data/ui/strings.json';

const data = loadData();
const T = '2026-11-15';
const EV = (id: string) => data.events.find((x) => x.id === id)!;
const plan = (p: Record<string, Partial<PlanRecord>>) => Object.fromEntries(Object.entries(p).map(([id, x]) => [id, { card_id: id, status: 'todo', ...x } as PlanRecord]));
const go = (d: typeof data, ev: string, answers: Record<string, Value>, p: Record<string, Partial<PlanRecord>> = {}, today = T) =>
  run(d, { answers, objects: { 'zairyu-card': true }, plan: plan(p), createdOn: T, today, mode: 'public', event: EV(ev) });
const v = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const stripF = (s: string) => s.replace(/\{([^|}]*)\|[^}]*\}/g, '$1');
const allText = (o: unknown): string[] => (typeof o === 'string' ? [stripF(o)] : o && typeof o === 'object' ? Object.values(o).flatMap(allText) : []);
const card = (id: string) => data.cards.find((c) => c.id === id)!;
const shown = (id: string) => allText({ s: card(id).summary, d: card(id).deadline?.text, w: card(id).where.text, m: card(id).methods?.map((m) => m.text) }).join(' ');

describe('W-1 住居地の届出：14日だけ。数え方・閉庁日の規則を言わない', () => {
  const c = card('nagoya-tennyu-juukyochi');
  it('期限の確認状態は needs_check。calc は付けない。翌日・閉庁日の文が無い', () => {
    expect(c.deadline!.evidence.status).toBe('needs_check');
    expect(c.deadline!.calc).toBeUndefined();
    const t = allText(c.deadline!.text).join('');
    expect(t).toContain('14');
    expect(t).not.toMatch(/翌日|次の日|閉庁|開庁|next open|day 1/);
  });
});

describe('W-2 退職の国保：市の言い方（事実が発生した日から14日以内）', () => {
  it('辞めた日の次の日、の計算を言わない。出典は市のページ', () => {
    const c = card('job-leave-kokuho');
    const t = allText(c.deadline!.text).join('');
    expect(t).toMatch(/14/);
    expect(t).not.toMatch(/次の日|翌日|day after/);
    expect(c.deadline!.evidence.source_ids).not.toContain('kurashi-spec');
    expect(c.deadline!.evidence.status).toBe('needs_check');
    expect(c.deadline!.evidence.quote).toContain('事実');
  });
});

describe('W-3 転入届：過ぎても出せる、と言わない。過料は出典つき・要確認', () => {
  for (const id of ['nagoya-tennyu-todoke', 'move-within-tenkyo', 'move-within-tennyu']) {
    it(id, () => {
      const t = shown(id);
      expect(t).not.toMatch(/過ぎても(届出|届け)(は|も)?(出せ|でき)|still file after|file after the deadline/);
      const m = card(id).methods!.find((x) => x.evidence.source_ids.includes('egov-juki-ho'))!;
      expect(m).toBeTruthy();
      expect(allText(m.text.ja).join('')).toMatch(/過料.*要確認/);
      expect(m.evidence.status).toBe('needs_check');
      expect(m.evidence.quote).toContain('五万円以下の過料');
    });
  }
});

describe('W-4 市内の転居届・転入届：14日・翌日を1日目の境目（確認済みになったときの計算）', () => {
  // 今は needs_check なので日付は出ない。確認済みに差し替えた写しで、計算の境目だけ試す
  const verified = structuredClone(data);
  for (const id of ['move-within-tenkyo', 'move-within-tennyu']) {
    const c = verified.cards.find((k) => k.id === id)!;
    c.deadline!.calc!.evidence = { ...c.deadline!.calc!.evidence, status: 'verified', verified_by: 'test', checked_at: '2028-03-01' };
  }
  const answers = (id: string): Record<string, Value> => ({ 'Q-ward-move': id === 'move-within-tenkyo' ? 'same_ward' : 'other_ward', 'Q-moved-in': 'yes' });
  // 数え始める日は今日より後にできない（HB-6）ので、境目の試しは今日を後ろにずらして行う
  const LATER = '2028-03-01';
  const on = (d: typeof data, id: string, from_on: string) => v(go(d, 'E-move-within', answers(id), { [id]: { from_on } }, LATER), id).deadlineOn;
  for (const id of ['move-within-tenkyo', 'move-within-tennyu']) {
    it(`${id}：今は needs_check で日付を出さない。14日・next_day`, () => {
      const calc = card(id).deadline!.calc!;
      expect([calc.days, calc.count, calc.evidence.status, card(id).deadline!.evidence.status]).toEqual([14, 'next_day', 'needs_check', 'needs_check']);
      expect(on(data, id, '2026-11-10')).toBeNull();
    });
    it(`${id}：確認済みなら 11/11 が1日目、14日目は 11/24。月・年・うるう年の境目`, () => {
      expect(on(verified, id, '2026-11-10')).toBe('2026-11-24');
      expect(on(verified, id, '2026-11-20')).toBe('2026-12-04');
      expect(on(verified, id, '2026-12-25')).toBe('2027-01-08');
      expect(on(verified, id, '2028-02-20')).toBe('2028-03-05');
    });
    it(`${id}：14日目は間に合う、15日目は後`, () => {
      const late = (d: string) => v(go(verified, 'E-move-within', answers(id), { [id]: { from_on: '2026-11-10', planned_on: d } }, LATER), id).lateRisk;
      expect([late('2026-11-24'), late('2026-11-25')]).toEqual([false, true]);
    });
  }
});

describe('W-5 国外転出届の郵送：3つの市のページが食い違うので、全員が郵送できるとは言わない', () => {
  it('郵送の文：要確認・食い違い。needs_check。行かない方法としては出さない', () => {
    const m = card('move-out-abroad-tenshutsu').methods!.find((x) => x.type === 'mail')!;
    const t = allText(m.text).join('');
    expect(t).toMatch(/要確認/);
    expect(t).toMatch(/市外への転出届/);
    expect(m.evidence.status).toBe('needs_check');
    expect(m.evidence.source_ids).toEqual(expect.arrayContaining(['B-nagoya-faq-37', 'nagoya-juumin-todoke']));
    const c = v(go(data, 'E-move-out', { 'Q-move-dest': 'abroad' }), 'move-out-abroad-tenshutsu');
    expect([c.remote, c.ways]).toEqual([false, []]);
  });
});

describe('W-6 在留資格変更のオンライン：条件を言い切らない', () => {
  it('needs_check。条件があることを書き、「オンライン申請もできます」と言い切らない', () => {
    const c = card('job-shushoku');
    const m = c.methods!.find((x) => x.type === 'online')!;
    expect(m.evidence.status).toBe('needs_check');
    expect(allText(m.text).join('')).toMatch(/条件/);
    expect(allText(c.where.text).join('')).not.toMatch(/オンライン申請もできます/);
  });
});

describe('V-2 在留カードと外国の旅券：並行。大使館への連絡は在留カードを待たない', () => {
  it('関係は parallel だけ。前提・待つ関係が無い', () => {
    const rels = data.relations.filter((r) => JSON.stringify(r).includes('lost-passport-foreign'));
    expect(rels.map((r) => r.type)).toEqual(['parallel']);
  });
  it('在留カードの札に14日と、旅券が無いときの理由書・身分を証する文書の文がある', () => {
    const t = allText(card('lost-zairyu-reissue')).join('\n');
    expect(t).toMatch(/14日以内/);
    expect(t).toMatch(/理由書/);
    expect(t).toMatch(/身分を証する文書/);
    expect(allText(card('lost-passport-foreign').summary).join('')).toMatch(/待たなく/);
  });
});

describe('V-3 提出先：納税地・事務所の所在地など、基準を言葉で書く。ハローワークは住所を管轄＋公式の一覧', () => {
  it('税務署の札に「住所の地域の税務署」と書かない', () => {
    for (const id of ['biz-start-kaigyo', 'biz-start-aoiro', 'biz-start-employees', 'biz-start-tax', 'biz-end-haigyo', 'biz-end-aoiro', 'biz-end-employees', 'biz-end-invoice']) {
      const t = allText(card(id).where.text.ja).join('');
      expect(t, id).not.toContain('住所の地域の税務署');
      expect(t, id).toMatch(/所轄/);
    }
    expect(allText(card('biz-end-employees').where.text.ja).join('')).toContain('事務所');
  });
  it('ハローワーク（失業給付）：住所を管轄。一覧へのリンク。区の表は出さない', () => {
    const c = card('job-leave-shitsugyo');
    expect(allText(c.where.text.ja).join('')).toContain('住所を管轄するハローワーク');
    expect(c.links![0].url).toBe('https://jsite.mhlw.go.jp/aichi-hellowork/list.html');
    expect(allText(c).join('\n')).not.toMatch(/名古屋(中|東|南)/);
  });
});

describe('V-4 区役所の行く日：1回で済むとは言わない', () => {
  it('文言', () => {
    const s = (strings as unknown as Record<string, { ja: string }>)['road.visit.same'];
    expect(stripF(s.ja)).toMatch(/1回で済むかは要確認/);
    expect(stripF(s.ja)).toMatch(/窓口は手続きごとに別/);
  });
});
