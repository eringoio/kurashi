/* 結婚・離婚（2026-11-08 に公開。元は drafts/data/E-marriage.bundle.json・E-divorce.bundle.json）。調査 research/procedures/P-marriage-*.json から。
   婚姻届に期限は無い／離婚の入管への届出（14日以内）は在留資格が「家族滞在」「日本人の配偶者等」「永住者の配偶者等」の人だけ。 */
import { describe, expect, it } from 'vitest';
import type { Card, Relation, Rule } from '../../src/core/schema';
import { checkRefs, loadData } from '../../src/core/data';
import flow from '../../data/flow.json';
import { run, type EngineInput } from '../../src/core/engine';

// 2026-11-08 に公開のデータへ移した（scripts/bundle-to-data.mjs）
const data = loadData();
type B = { cards: Card[]; rules: Rule[]; relations: Relation[] };
const TODAY = '2026-11-05';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const evMar = data.events.find((e) => e.id === 'E-marriage')!;
const evDiv = data.events.find((e) => e.id === 'E-divorce')!;
/** 作者 11/7 K-16：ファミリーシップ制度は別の入口（E-familyship）。結婚したい（E-marriage）は婚姻だけ */
const evFam = data.events.find((e) => e.id === 'E-familyship')!;
// D-3：結婚の分岐。E-marriage で Q-marriage-type を答えていないときは「結婚（konin）」として試す（分岐の確認は専用のテストで）
const go = (event: typeof evMar, answers: Record<string, string>, over: Partial<EngineInput> = {}) =>
  run(data, { answers: event.id === 'E-marriage' && !('Q-marriage-type' in answers) ? { 'Q-marriage-type': 'konin', ...answers } : answers, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event, ...over });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const ids = (o: ReturnType<typeof run>, state: string) => o.cards.filter((c) => c.state === state).map((c) => c.card.id).sort();
const card = (id: string) => data.cards.find((c) => c.id === id)!;

const FAMILYSHIP = 'marriage-familyship';
const MAR_ALL = ['marriage-hoken-nenkin', 'marriage-konin-gaikokuseki', 'marriage-konin-todoke', 'marriage-mynumber-card', 'marriage-seitai-henko', 'marriage-ujino-henkou', 'marriage-zairyu-shimei'];
const DIV_ALL = ['divorce-jusho-hoken-nenkin', 'divorce-kyogi', 'divorce-nyukan-todoke', 'divorce-saiban', 'divorce-shimei'];
/** 結婚（ファミリーシップを含む）と離婚のカード・ルール・関係（公開のデータから） */
const ALL_IDS = [...MAR_ALL, FAMILYSHIP, ...DIV_ALL];
const bundles: B[] = [MAR_ALL.concat(FAMILYSHIP), DIV_ALL].map((cs) => ({ cards: cs.map(card), rules: [...data.rules.values()].filter((r) => (cs === DIV_ALL ? /^R-div-/ : /^R-mar-/).test(r.id)), relations: data.relations.filter((r) => JSON.stringify(r).includes(cs === DIV_ALL ? 'divorce-' : 'marriage-')) }));
const lastIn = (ids: string[]) => [...ids].sort((a, b) => flow.card_order.indexOf(a) - flow.card_order.indexOf(b)).at(-1);

describe('結婚・離婚の下書き：型・参照・確認状態', () => {
  it('型と参照の検査を通る。verified は無い', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(JSON.stringify(bundles)).not.toContain('"verified"');
    expect(ALL_IDS.every((id) => data.cards.some((c) => c.id === id))).toBe(true);
  });
  it('カードは13枚（結婚7・ファミリーシップ1・離婚5）。イベントは E-marriage（メニュー10）と E-divorce（メニュー11。A-10）', () => {
    expect([...evMar.card_ids, ...evFam.card_ids].sort()).toEqual([...MAR_ALL, FAMILYSHIP].sort());
    expect([...evDiv.card_ids].sort()).toEqual(DIV_ALL);
    expect([evMar.menu, evDiv.menu, evMar.group, evDiv.group, evMar.status, evDiv.status]).toEqual([10, 11, 'family', 'family', 'built', 'built']);
    expect([evFam.menu, evFam.group, evFam.card_ids]).toEqual([12, 'familyship', [FAMILYSHIP]]);
    expect(evMar.card_ids).not.toContain(FAMILYSHIP);
  });
  it('日本国籍の人の戸籍だけのカードは、card_order の最後', () => {
    expect(lastIn(evMar.card_ids)).toBe('marriage-ujino-henkou');
    expect(lastIn(evDiv.card_ids)).toBe('divorce-shimei');
  });
  it('ai_checked は行く所と方法だけ。期限・ルール・関係・カード全体は needs_check', () => {
    for (const b of bundles) {
      for (const c of b.cards) {
        expect(c.evidence.status).toBe('needs_check');
        if (c.deadline) expect(c.deadline.evidence.status).toBe('needs_check');
        for (const m of c.methods ?? []) if (m.evidence.status === 'ai_checked') expect(m.evidence.ai_check?.ref).toMatch(/^research\/audits\/marriage\.json#P-marriage-/);
      }
      for (const r of b.rules) expect(r.evidence.status).toBe('needs_check');
      for (const r of b.relations) expect(r.evidence.status).toBe('needs_check');
    }
  });
  it('電話番号とクエリ付きの URL を書いていない', () => {
    // 出典の記録（sources）の url は、名古屋市の FAQ が ?id= を使うので除く。カードの中のリンクには付けない
    const s = JSON.stringify(bundles);
    expect(s).not.toMatch(/\d{2,4}-\d{2,4}-\d{3,4}/);
    expect(s).not.toMatch(/https?:\/\/[^"\s]*\?/);
  });
  it('表示のレベル3つの文が全部ある（ja・ja_easy・en）', () => {
    for (const c of data.cards.filter((x) => MAR_ALL.includes(x.id) || DIV_ALL.includes(x.id))) {
      for (const t of [c.title, c.summary, c.where.text, ...(c.methods ?? []).map((m) => m.text)]) expect([t.ja, t.ja_easy, t.en].every((x) => !!x)).toBe(true);
    }
  });
});

describe('結婚した（E-marriage）', () => {
  it('結婚した留学生（相手も外国籍・氏名が変わる）：日本人の氏のカード以外は出る', () => {
    const o = go(evMar, { 'Q-marriage-kind': 'foreign_foreign', 'Q-marriage-name': 'yes' });
    expect(ids(o, 'shown')).toEqual(MAR_ALL.filter((x) => x !== 'marriage-ujino-henkou'));
    expect(ids(o, 'excluded')).toEqual(['marriage-ujino-henkou']);
  });
  it('日本国籍の人と結婚：日本人の氏のカードも出る', () => {
    const o = go(evMar, { 'Q-marriage-kind': 'japanese_foreign', 'Q-marriage-name': 'yes' });
    expect(ids(o, 'shown')).toEqual(MAR_ALL);
  });
  it('関係のない人（どちらも日本国籍・氏名は変わらない）：外国籍の書類・在留カード・マイナンバーカード・氏のカードは出さない', () => {
    const o = go(evMar, { 'Q-marriage-kind': 'both_japanese', 'Q-marriage-name': 'no' });
    expect(ids(o, 'shown')).toEqual(['marriage-hoken-nenkin', 'marriage-konin-todoke', 'marriage-seitai-henko']);
    expect(ids(o, 'excluded')).toEqual(['marriage-konin-gaikokuseki', 'marriage-mynumber-card', 'marriage-ujino-henkou', 'marriage-zairyu-shimei']);
  });
  it('氏名が変わらない外国籍の人：在留カード・マイナンバーカードの氏名変更は出さない', () => {
    const o = go(evMar, { 'Q-marriage-kind': 'foreign_foreign', 'Q-marriage-name': 'no' });
    expect(ids(o, 'excluded')).toEqual(['marriage-mynumber-card', 'marriage-ujino-henkou', 'marriage-zairyu-shimei']);
  });
  it('答えがわからないとき：除外せず、窓口で確認にする', () => {
    const o = go(evMar, { 'Q-marriage-kind': 'unknown', 'Q-marriage-name': 'unknown' });
    expect(ids(o, 'excluded')).toEqual([]);
    expect(view(o, 'marriage-zairyu-shimei').state).toBe('check_at_office');
  });
  it('最初に国籍と氏名の2問を聞く（K-16：結婚かファミリーシップかは聞かない。入口で分けた）', () => {
    expect(run(data, { answers: {}, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: evMar }).upfront.map((q) => q.id)).toEqual(['Q-marriage-kind', 'Q-marriage-name']);
  });
  it('婚姻届に期限は無い。「14日以内」と誤解させない（期限の欄は「期限なし」）', () => {
    const c = card('marriage-konin-todoke');
    expect(plain(c.deadline!.text.ja)).toContain('期限なし');
    expect(plain(c.deadline!.text.ja)).not.toMatch(/14日/);
    expect(plain(c.deadline!.text.ja_easy)).not.toMatch(/14日/);
    expect(c.deadline!.evidence.status).toBe('needs_check');
  });
  it('14日の届出は3つ：在留カード・マイナンバーカード・世帯。順番は決めず、並行の注記だけ（在留カード→マイナンバーの前提の関係は無い）', () => {
    for (const id of ['marriage-zairyu-shimei', 'marriage-mynumber-card', 'marriage-seitai-henko']) expect(plain(card(id).deadline!.text.ja)).toMatch(/14日/);
    const rels = data.relations.filter((r) => 'card_ids' in r && r.type === 'parallel' && r.card_ids.includes('marriage-zairyu-shimei'));
    expect(rels).toHaveLength(1);
    const prereq = data.relations.filter((r) => (r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite') && [r.from, r.to].includes('marriage-mynumber-card'));
    expect(prereq).toEqual([]);
  });
  it('外国籍の人が含まれる婚姻は、婚姻要件具備証明書を要確認として出す。先に区役所に相談', () => {
    const c = card('marriage-konin-gaikokuseki');
    expect(plain(c.summary.ja)).toContain('婚姻要件具備証明書');
    expect(plain(c.summary.ja)).toContain('要確認');
    const need = (c.methods ?? []).find((m) => plain(m.text.ja).includes('一般的に') && m.evidence.status === 'needs_check');
    expect(need).toBeTruthy();
  });
});

describe('ファミリーシップ制度（別の入口。K-16）', () => {
  it('入口 E-familyship は、ファミリーシップのカードだけを出す。質問はしない', () => {
    const o = go(evFam, {});
    expect(o.cards.filter((c) => c.state === 'shown').map((c) => c.card.id)).toEqual([FAMILYSHIP]);
    expect(o.upfront).toEqual([]);
  });
  it('ファミリーシップのカード：市営住宅に申し込めること、費用がかからないこと、法律上の効果が無いことを、公式ページの引用つき（needs_check）で書く', () => {
    const c = card(FAMILYSHIP);
    const t = plain(c.summary.ja);
    for (const w of ['市営住宅', '費用はかかりません', '法律上の効果', '予約']) expect(t).toContain(w);
    const housing = (c.methods ?? []).find((m) => m.evidence.quote?.includes('ファミリーシップ制度の宣誓をされた方も申し込むことができます'));
    expect(housing?.evidence.status).toBe('needs_check');
    for (const m of c.methods ?? []) expect([m.evidence.status, (m.evidence.quote ?? '').length > 0, (m.evidence.quote ?? '').length <= 120]).toEqual(['needs_check', true, true]);
    expect(c.evidence.status).toBe('needs_check');
  });
});

describe('離婚した（E-divorce）', () => {
  /** 前の Q-spouse-status の値 → 共通の Q-nationality・Q-zairyu-status（家族滞在＝family、日本人／永住者の配偶者等＝spouse） */
  const STATUS: Record<string, Record<string, string>> = { family_stay: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'family' }, japanese_spouse: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'spouse' }, permanent_spouse: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'spouse' }, other: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student' }, japanese: { 'Q-nationality': 'japanese' }, unknown: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'unknown' } };
  const div = (status: string, route = 'agreement', jp = 'no') => go(evDiv, { 'Q-divorce-route': route, ...STATUS[status], 'Q-divorce-japanese': jp });
  it('家族滞在の人が離婚：入管への配偶者に関する届出（14日以内）が出る', () => {
    const o = div('family_stay');
    expect(view(o, 'divorce-nyukan-todoke').state).toBe('shown');
    expect(plain(card('divorce-nyukan-todoke').deadline!.text.ja)).toContain('14日以内');
    expect(card('divorce-nyukan-todoke').deadline!.evidence.status).toBe('needs_check');
  });
  it('日本人の配偶者等・永住者の配偶者等の人にも出る', () => {
    expect(view(div('japanese_spouse'), 'divorce-nyukan-todoke').state).toBe('shown');
    expect(view(div('permanent_spouse'), 'divorce-nyukan-todoke').state).toBe('shown');
  });
  it('留学の人が離婚：入管への届出は出さない（対象外の案内文つき）。日本国籍の人にも出さない', () => {
    const o = div('other');
    expect(view(o, 'divorce-nyukan-todoke').state).toBe('excluded');
    expect(plain(card('divorce-nyukan-todoke').reasons.excluded!.ja)).toContain('留学');
    expect(view(div('japanese'), 'divorce-nyukan-todoke').state).toBe('excluded');
  });
  it('在留資格がわからない人：除外せず、窓口で確認にする', () => {
    expect(view(div('unknown'), 'divorce-nyukan-todoke').state).toBe('check_at_office');
  });
  it('在留資格の質問は、人の答え（scope: person）', () => {
    expect(data.questions.find((q) => q.id === 'Q-zairyu-status')!.scope).toBe('person');
    expect(data.questions.some((q) => q.id === 'Q-spouse-status')).toBe(false);
    // 国籍がわからない人も、除外しない
    expect(view(go(evDiv, { 'Q-divorce-route': 'agreement', 'Q-nationality': 'unknown', 'Q-divorce-japanese': 'no' }), 'divorce-nyukan-todoke').state).toBe('check_at_office');
  });
  it('協議離婚と調停・裁判は、選んだ方だけ出る。期限は別々（協議は期間なし・裁判は10日・氏の届は3か月）', () => {
    const a = div('other', 'agreement');
    expect(ids(a, 'shown')).toContain('divorce-kyogi');
    expect(view(a, 'divorce-saiban').state).toBe('excluded');
    const c = div('other', 'court');
    expect(ids(c, 'shown')).toContain('divorce-saiban');
    expect(view(c, 'divorce-kyogi').state).toBe('excluded');
    expect(plain(card('divorce-kyogi').deadline!.text.ja)).toContain('定めなし');
    expect(plain(card('divorce-saiban').deadline!.text.ja)).toContain('10日以内');
    expect(plain(card('divorce-shimei').deadline!.text.ja)).toContain('3か月以内');
  });
  it('離婚後の氏の届は、日本国籍の人がいるときだけ出る', () => {
    expect(view(div('other', 'agreement', 'yes'), 'divorce-shimei').state).toBe('shown');
    expect(view(div('other', 'agreement', 'no'), 'divorce-shimei').state).toBe('excluded');
  });
  it('年金分割は離婚の翌日から5年以内（2026年4月1日より前の離婚は2年）。要確認', () => {
    const c = card('divorce-jusho-hoken-nenkin');
    expect(plain(c.deadline!.text.ja)).toMatch(/5年以内/);
    expect(plain(c.deadline!.text.ja)).toMatch(/2年以内/);
    expect(plain(c.deadline!.text.ja)).toContain('要確認');
  });
  it('最初に、離婚の方法・在留資格・日本国籍の3問を聞く', () => {
    expect(go(evDiv, {}).upfront.map((q) => q.id)).toEqual(['Q-divorce-route', 'Q-nationality', 'Q-divorce-japanese']);
    expect(go(evDiv, { 'Q-nationality': 'foreign' }).upfront.map((q) => q.id)).toEqual(['Q-divorce-route', 'Q-zairyu-status', 'Q-divorce-japanese']);
  });
});
