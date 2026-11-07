/* 運転免許（2026-11-08 に公開。元は drafts/data/E-license.bundle.json）。最初に「どれにあてはまるか」を聞き、答えのカードだけを出す（D-2・11/6）。
   すべて needs_check。受付曜日の食い違いなど、研究で食い違った点は断定せず「要確認」にする。 */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { collectEvidence } from '../../src/core/quotes';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-license')!;
const mine = () => JSON.stringify({ event: ev, cards: ev.card_ids.map((id) => data.cards.find((c) => c.id === id)), rules: [...data.rules.values()].filter((r) => JSON.stringify(ev).includes(r.id) || ev.card_ids.some((id) => JSON.stringify(data.cards.find((c) => c.id === id)).includes(r.id))), relations: data.relations.filter((r) => ev.card_ids.some((id) => JSON.stringify(r).includes(id))) });
const TODAY = '2026-11-06';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const go = (goal?: string, over: Partial<EngineInput> = {}) =>
  run(data, { answers: goal ? { 'Q-license-goal': goal } : {}, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev, ...over });
const ids = (o: ReturnType<typeof run>, state: string) => o.cards.filter((c) => c.state === state && ev.card_ids.includes(c.card.id)).map((c) => c.card.id).sort();
// 2026-11-08：警察署でのマイナ免許証のカード（license-mynumber-ittai。C-2 で県警のページの記載が食い違う）は、作者が確かめるまで公開から外した
const ALL = ['license-gaimen-kirikae', 'license-kisai-henko', 'license-koshin', 'license-kokusai', 'license-saikofu', 'license-shinki'].sort();
const SHOWN: Record<string, string[]> = {
  new: ['license-shinki'],
  switch: ['license-gaimen-kirikae', 'license-kokusai'],
  renew: ['license-koshin'],
  change: ['license-kisai-henko'],
  lost: ['license-saikofu'],
};

describe('運転免許', () => {
  it('型と参照の検査を通る。6枚。入口の13番目。verified は無い。ai_checked は受付曜日だけ（C-2）。電話番号・クエリ付きの URL を書かない', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.card_ids.slice().sort()).toEqual(ALL);
    expect(ev.status).toBe('built');
    expect(ev.group).toBe('license');
    expect(ev.menu).toBe(13);
    const s = mine();
    expect(s).not.toContain('"verified"');
    expect((s.match(/"ai_checked"/g) ?? []).length).toBe(1);
    expect(s).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
    expect(s).not.toMatch(/https?:\/\/[^"]*\?/);
  });
  it('事実の文には、出典つきの根拠がある（引用あり・needs_check）', () => {
    const items = collectEvidence(data).filter((x) => x.where.startsWith('license-') || x.where.startsWith('R-license') || x.where.startsWith('rel-license') || x.where === 'E-license');
    expect(items.length).toBeGreaterThan(40);
    for (const x of items) expect(x.e.status, x.where).toBe(x.where === 'license-kisai-henko.methods[0]' ? 'ai_checked' : 'needs_check');
    for (const c of ev.card_ids) {
      const card = data.cards.find((y) => y.id === c)!;
      for (const m of card.methods ?? []) expect(m.evidence.quote, `${c} の方法に引用がない`).toBeTruthy();
      expect(card.where.evidence.quote).toBeTruthy();
      expect(card.evidence.quote).toBeTruthy();
    }
  });
  it('最初に、どれにあてはまるかを聞く', () => {
    expect(go().upfront.map((q) => q.id)).toEqual(['Q-license-goal']);
    for (const g of Object.keys(SHOWN)) expect(go(g).upfront).toEqual([]);
  });
  for (const g of Object.keys(SHOWN)) {
    it(`${g}：該当のカードだけ出し、ほかは対象外`, () => {
      const o = go(g);
      expect(ids(o, 'shown')).toEqual(SHOWN[g].slice().sort());
      expect(ids(o, 'excluded')).toEqual(ALL.filter((c) => !SHOWN[g].includes(c)));
    });
  }
  it('答える前は、カードを出さない（対象外にしない）', () => {
    expect(ids(go(), 'shown')).toEqual([]);
  });
  it('対象外の理由が3表示レベルにある', () => {
    for (const id of ALL) for (const k of ['ja', 'ja_easy', 'en'] as const) expect(data.cards.find((c) => c.id === id)!.reasons.excluded![k].length).toBeGreaterThan(5);
  });
  it('C-2（11/7）：受付曜日は食い違いではなく言い切る。警察署のマイナ免許証は注記（優良だけ）で書き要確認。外免切替の手数料・記載事項変更の日数は「要確認」', () => {
    const c = (id: string) => data.cards.find((y) => y.id === id)!;
    const kisai = c('license-kisai-henko');
    expect(plain(kisai.methods![0].text.ja)).toContain('日曜〜木曜');
    expect(plain(kisai.methods![0].text.ja)).toContain('金曜は受付しません');
    expect(plain(kisai.deadline!.text.ja)).toContain('日数の決まりは本文にありません');
    // 警察署のマイナ免許証のカードは公開していない（C-2）
    expect(data.cards.some((y) => y.id === 'license-mynumber-ittai')).toBe(false);
    const fee = c('license-gaimen-kirikae').methods!.find((m) => /手数料/.test(plain(m.text.ja)))!;
    expect(plain(fee.text.ja)).toContain('要確認');
    expect(plain(fee.text.ja)).not.toMatch(/\d,?\d{3}円/);
    // 期限・費用は needs_check のまま
    for (const id of ALL) {
      const card = c(id);
      if (card.deadline) expect(card.deadline.evidence.status).toBe('needs_check');
      expect(plain(card.summary.ja)).toContain('要確認');
    }
  });
  it('更新：期限は誕生日の前後。手数料は needs_check', () => {
    const koshin = data.cards.find((y) => y.id === 'license-koshin')!;
    expect(plain(koshin.deadline!.text.ja)).toContain('誕生日の1か月前');
    const fee = koshin.methods!.find((m) => /2,850円/.test(plain(m.text.ja)))!;
    expect(fee.evidence.status).toBe('needs_check');
  });
});
