/* 運転免許（2026-11-08 に公開。元は drafts/data/E-license.bundle.json）。最初に「どれにあてはまるか」を聞き、答えのカードだけを出す（D-2・11/6）。
   すべて needs_check。受付曜日の食い違いなど、研究で食い違った点は断定せず「要確認」にする。 */
import { describe, expect, it } from 'vitest';
import { isBulk, verifiedNotBulk } from './bulk';
import { checkRefs, loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { collectEvidence } from '../../src/core/quotes';
import type { Value } from '../../src/core/schema';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-license')!;
const mine = () => JSON.stringify({ event: ev, cards: ev.card_ids.map((id) => data.cards.find((c) => c.id === id)), rules: [...data.rules.values()].filter((r) => JSON.stringify(ev).includes(r.id) || ev.card_ids.some((id) => JSON.stringify(data.cards.find((c) => c.id === id)).includes(r.id))), relations: data.relations.filter((r) => ev.card_ids.some((id) => JSON.stringify(r).includes(id))) });
const TODAY = '2026-11-06';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const go = (goal?: string, over: Partial<EngineInput> = {}) =>
  run(data, { answers: goal ? { 'Q-license-goal': goal } : {}, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev, ...over });
const ids = (o: ReturnType<typeof run>, state: string) => o.cards.filter((c) => c.state === state && ev.card_ids.includes(c.card.id)).map((c) => c.card.id).sort();
// 2026-11-08：警察署でのマイナ免許証のカード（license-mynumber-ittai。C-2 で県警のページの記載が食い違う）は、作者が確かめるまで公開から外した
const ALL = ['license-gaimen-kirikae', 'license-kisai-henko', 'license-kokugai-shutoku', 'license-koshin', 'license-kokusai', 'license-saikofu', 'license-shikko', 'license-shinki'].sort();
const SHOWN: Record<string, string[]> = {
  new: ['license-shinki'],
  switch: ['license-gaimen-kirikae', 'license-kokusai'],
  renew: ['license-koshin'],
  expired: ['license-shikko'],
  change: ['license-kisai-henko'],
  lost: ['license-saikofu'],
  abroad: ['license-kokugai-shutoku'],
};
/** 目的のあとに聞く質問（目的ごとに0〜2問。kaizen unten 11/8） */
const NEXT: Record<string, string[]> = { new: ['Q-license-route'], switch: [], renew: ['Q-license-valid'], expired: ['Q-license-lapse'], change: ['Q-license-change', 'Q-license-form'], lost: ['Q-license-lost'], abroad: [] };
/** 目的と、そのあとの質問の答え */
const ans = (goal: string, more: Record<string, Value> = {}) => ({ answers: { 'Q-license-goal': goal, ...(goal === 'renew' ? { 'Q-license-valid': 'valid' } : {}), ...more } });

describe('運転免許', () => {
  it('型と参照の検査を通る。8枚。入口の13番目。verified は無い。ai_checked は受付曜日だけ（C-2）。電話番号・クエリ付きの URL を書かない', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.card_ids.slice().sort()).toEqual(ALL);
    expect(ev.status).toBe('built');
    expect(ev.group).toBe('license');
    expect(ev.menu).toBe(13);
    const s = mine();
    expect(verifiedNotBulk(s)).toEqual([]);
    expect((s.match(/"ai_checked"/g) ?? []).length).toBe(1);
    expect(s).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
    expect(s).not.toMatch(/https?:\/\/[^"]*\?/);
  });
  it('事実の文には、出典つきの根拠がある（引用あり・needs_check）', () => {
    const items = collectEvidence(data).filter((x) => x.where.startsWith('license-') || x.where.startsWith('R-license') || x.where.startsWith('rel-license') || x.where === 'E-license');
    expect(items.length).toBeGreaterThan(40);
    for (const x of items) if (!isBulk(x.e)) expect(x.e.status, x.where).toBe(x.where === 'license-kisai-henko.methods[0]' ? 'ai_checked' : 'needs_check');
    for (const c of ev.card_ids) {
      const card = data.cards.find((y) => y.id === c)!;
      for (const m of card.methods ?? []) expect(m.evidence.quote, `${c} の方法に引用がない`).toBeTruthy();
      expect(card.where.evidence.quote).toBeTruthy();
      expect(card.evidence.quote).toBeTruthy();
    }
  });
  it('最初に、どれにあてはまるかを聞く', () => {
    expect(go().upfront.map((q) => q.id)).toEqual(['Q-license-goal']);
    for (const g of Object.keys(SHOWN)) expect(go(g).upfront.map((q) => q.id), g).toEqual(NEXT[g]);
  });
  for (const g of Object.keys(SHOWN)) {
    it(`${g}：該当のカードだけ出し、ほかは対象外`, () => {
      const o = go(g, ans(g));
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

describe('運転免許の改善（kaizen unten 11/8）', () => {
  const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
  const texts = (o: ReturnType<typeof run>, id: string) => view(o, id).methods.map((m) => plain(m.method.text.ja));
  it('期限切れ：更新を選んでも期限が過ぎていれば、通常の更新に誘導しない。期限切れの手続きが目的', () => {
    for (const a of [ans('expired'), ans('renew', { 'Q-license-valid': 'expired' })]) {
      const o = go(undefined, a);
      expect(view(o, 'license-koshin').state).toBe('excluded');
      expect([view(o, 'license-shikko').state, view(o, 'license-shikko').section, view(o, 'license-shikko').goal]).toEqual(['shown', 'today', true]);
      expect(o.upfront.map((q) => q.id)).toEqual(['Q-license-lapse']);
    }
    // 最初に、運転してはいけないことを出す
    expect(plain(data.cards.find((c) => c.id === 'license-shikko')!.lead!.ja)).toMatch(/^有効期限が過ぎた免許で運転してはいけません/);
  });
  it('期限切れ：経過の長さで出す案内が変わる。わからないときは全部を出す（断定しない）', () => {
    const six = texts(go(undefined, ans('expired', { 'Q-license-lapse': 'within_6m' })), 'license-shikko');
    expect(six.some((t) => t.startsWith('6か月以内'))).toBe(true);
    expect(six.some((t) => t.startsWith('1年を超えた'))).toBe(false);
    expect(six.some((t) => t.includes('やむを得ない'))).toBe(false);
    const over = texts(go(undefined, ans('expired', { 'Q-license-lapse': 'over_1y' })), 'license-shikko');
    expect(over.some((t) => t.startsWith('1年を超えた'))).toBe(true);
    expect(over.some((t) => t.includes('やむを得ない'))).toBe(true);
    const unk = texts(go(undefined, ans('expired', { 'Q-license-lapse': 'unknown' })), 'license-shikko');
    expect(unk.length).toBe(data.cards.find((c) => c.id === 'license-shikko')!.methods!.length);
  });
  it('更新で期限が過ぎたかわからない：どちらも言い切らず「確かめる」に出す', () => {
    const o = go(undefined, ans('renew', { 'Q-license-valid': 'unknown' }));
    expect(view(o, 'license-koshin').state).toBe('check_at_office');
    expect(view(o, 'license-shikko').state).toBe('check_at_office');
  });
  it('再交付：名古屋市内の警察署を出さない。23の警察署は公式の一覧のとおり。名古屋市では試験場', () => {
    const c = data.cards.find((y) => y.id === 'license-saikofu')!;
    const where = plain(c.where.text.ja);
    expect((where.match(/警察署/g) ?? []).length).toBe(23 + 2); // 23署＋「次の23の警察署」＋「名古屋市内の警察署はありません」
    const listed = where.split('：')[1].split('。')[0].split('、');
    expect(listed.length).toBe(23);
    const NAGOYA = ['千種', '東', '北', '西', '中村', '中', '昭和', '瑞穂', '熱田', '中川', '港', '南', '守山', '緑', '名東', '天白'].map((w) => w + '警察署');
    for (const s of listed) expect(NAGOYA, s).not.toContain(s);
    expect(plain(c.summary.ja)).toContain('名古屋市内の警察署（西・港を含む）では受け付けていません');
    // 運転するときは免許証を持つ決まり（最初の一文）
    expect(plain(c.lead!.ja)).toContain('免許証を持っている決まり');
    // 財布の紛失（遺失届・カードの停止）へのつなぎ
    expect(c.event_links!.map((l) => l.event)).toEqual(['E-lost-wallet']);
  });
  it('再交付：場所ごとに受付日と受け取りが違う。マイナ免許証の案内は、なくした人だけ', () => {
    const card = texts(go(undefined, ans('lost', { 'Q-license-lost': 'card' })), 'license-saikofu');
    expect(card.some((t) => t.startsWith('運転免許試験場：月曜〜木曜') && t.includes('その日に受け取れます'))).toBe(true);
    expect(card.some((t) => t.includes('日曜日') && t.includes('予約制'))).toBe(true);
    expect(card.some((t) => t.startsWith('23の警察署') && t.includes('後日'))).toBe(true);
    expect(card.some((t) => t.startsWith('マイナ免許証（マイナンバーカード）をなくした'))).toBe(false);
    const myna = texts(go(undefined, ans('lost', { 'Q-license-lost': 'myna' })), 'license-saikofu');
    expect(myna.some((t) => t.startsWith('マイナ免許証（マイナンバーカード）をなくした'))).toBe(true);
  });
  it('更新：講習の区分で、行ける場所が変わる（違反・初回は警察署に誘導しない）', () => {
    const v = texts(go(undefined, ans('renew', { 'Q-license-course': 'violation' })), 'license-koshin');
    expect(v.some((t) => t.startsWith('違反運転者・初回更新者'))).toBe(true);
    expect(v.some((t) => t.startsWith('優良運転者'))).toBe(false);
    const g = texts(go(undefined, ans('renew', { 'Q-license-course': 'good' })), 'license-koshin');
    expect(g.some((t) => t.startsWith('優良運転者') && t.includes('西・港警察署（分庁舎）'))).toBe(true);
    expect(g.some((t) => t.startsWith('違反運転者'))).toBe(false);
  });
  it('住所・名前の変更：変わったことと免許証の形で、持ち物が変わる', () => {
    const a = texts(go(undefined, ans('change', { 'Q-license-change': ['address'], 'Q-license-form': 'card' })), 'license-kisai-henko');
    expect(a.some((t) => t.startsWith('住所だけ変えるとき'))).toBe(true);
    expect(a.some((t) => t.startsWith('名前が変わったとき'))).toBe(false);
    expect(a.some((t) => t.startsWith('マイナ免許証の人'))).toBe(false);
    const n = texts(go(undefined, ans('change', { 'Q-license-change': ['name'], 'Q-license-form': 'myna' })), 'license-kisai-henko');
    expect(n.some((t) => t.startsWith('名前が変わったとき'))).toBe(true);
    expect(n.some((t) => t.startsWith('住所だけ変えるとき'))).toBe(false);
    expect(n.some((t) => t.startsWith('マイナ免許証の人'))).toBe(true);
  });
  it('国外運転免許証は外免切替・国際免許の案内と別。外免切替では国際運転免許証が使えないと書く', () => {
    const o = go(undefined, ans('abroad'));
    expect(view(o, 'license-kokusai').state).toBe('excluded');
    expect(view(o, 'license-gaimen-kirikae').state).toBe('excluded');
    expect(plain(data.cards.find((c) => c.id === 'license-gaimen-kirikae')!.methods!.map((m) => m.text.ja).join(''))).toContain('国際運転免許証は不可');
  });
});
