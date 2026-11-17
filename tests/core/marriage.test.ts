/* 結婚・離婚（2026-11-08 に公開。元は drafts/data/E-marriage.bundle.json・E-divorce.bundle.json）。調査 research/procedures/P-marriage-*.json から。
   kaizen 2026-11-08（docs/kaizen/kekkon.md）：段階・ふたりの国籍・名前が変わる人・住所と世帯で分ける。離婚は段階・子ども・配偶者としての在留で分ける。
   婚姻届に期限は無い／離婚の入管への届出（14日以内）は「家族滞在」「日本人の配偶者等」「永住者の配偶者等」を配偶者として持つ人だけ。 */
import { describe, expect, it } from 'vitest';
import { isBulk, verifiedNotBulk } from './bulk';
import type { Card, Relation, Rule, Value } from '../../src/core/schema';
import { checkRefs, loadData } from '../../src/core/data';
import flow from '../../data/flow.json';
import { run, type EngineInput } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';

// 2026-11-08 に公開のデータへ移した（scripts/bundle-to-data.mjs）
const data = loadData();
type B = { cards: Card[]; rules: Rule[]; relations: Relation[] };
const TODAY = '2026-11-05';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const evMar = data.events.find((e) => e.id === 'E-marriage')!;
const evDiv = data.events.find((e) => e.id === 'E-divorce')!;
/** 作者 11/7 K-16：ファミリーシップ制度は別の入口（E-familyship）。結婚したい（E-marriage）は婚姻だけ */
const evFam = data.events.find((e) => e.id === 'E-familyship')!;
const go = (event: typeof evMar, answers: Record<string, Value>, over: Partial<EngineInput> = {}) =>
  run(data, { answers, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event, ...over });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const card = (id: string) => data.cards.find((c) => c.id === id)!;

const FAMILYSHIP = 'marriage-familyship';
const MAR_ALL = ['marriage-hikkoshi', 'marriage-hoken-nenkin', 'marriage-kaigai-todoke', 'marriage-konin-gaikokuseki', 'marriage-konin-todoke', 'marriage-mynumber-card', 'marriage-seitai-henko', 'marriage-ujino-henkou', 'marriage-zairyu-shikaku', 'marriage-zairyu-shimei'];
const DIV_ALL = ['divorce-jusho-hoken-nenkin', 'divorce-kaigai', 'divorce-kodomo', 'divorce-kyogi', 'divorce-nyukan-todoke', 'divorce-saiban', 'divorce-shimei', 'divorce-zairyu-shikaku'];
/** 結婚（ファミリーシップを含む）と離婚のカード・ルール・関係（公開のデータから） */
const ALL_IDS = [...MAR_ALL, FAMILYSHIP, ...DIV_ALL];
const bundles: B[] = [MAR_ALL.concat(FAMILYSHIP), DIV_ALL].map((cs) => ({ cards: cs.map(card), rules: [...data.rules.values()].filter((r) => (cs === DIV_ALL ? /^R-div-/ : /^R-mar-/).test(r.id)), relations: data.relations.filter((r) => JSON.stringify(r).includes(cs === DIV_ALL ? 'divorce-' : 'marriage-')) }));
const lastIn = (ids: string[]) => [...ids].sort((a, b) => flow.card_order.indexOf(a) - flow.card_order.indexOf(b)).at(-1);

describe('結婚・離婚の下書き：型・参照・確認状態', () => {
  it('型と参照の検査を通る。verified は無い', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(verifiedNotBulk(bundles)).toEqual([]);
    expect(ALL_IDS.every((id) => data.cards.some((c) => c.id === id))).toBe(true);
  });
  it('カードは19枚（結婚10・ファミリーシップ1・離婚8）。イベントは E-marriage（メニュー10）と E-divorce（メニュー11。A-10）', () => {
    // ファミリーシップの目的のカードは1枚。目的ごとの案内のカードは tests/core/familyship.test.ts（2026-11-08）
    expect([...evMar.card_ids, ...evFam.goal_card_ids!].sort()).toEqual([...MAR_ALL, FAMILYSHIP].sort());
    expect([...evDiv.card_ids].sort()).toEqual(DIV_ALL);
    expect([evMar.menu, evDiv.menu, evMar.group, evDiv.group, evMar.status, evDiv.status]).toEqual([10, 11, 'family', 'family', 'built', 'built']);
    expect([evFam.menu, evFam.group, evFam.goal_card_ids]).toEqual([12, 'familyship', [FAMILYSHIP]]);
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
        for (const m of c.methods ?? []) if (m.evidence.status === 'ai_checked') expect(m.evidence.ai_check?.ref).toMatch(/^(research\/audits\/marriage\.json#P-marriage-|internal-audit-record$)/); // 公開用の書き出しでは、記録の場所を決まった文字にする
      }
      for (const r of b.rules) if (!isBulk(r.evidence)) expect(r.evidence.status).toBe('needs_check');
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

describe('結婚したい（E-marriage）', () => {
  /** 段階・ふたりの国籍・名前が変わる人・住所と世帯（最初の4問） */
  const mar = (stage: string, nat: string, who: string, home: string, extra: Record<string, Value> = {}, over: Partial<EngineInput> = {}) =>
    go(evMar, { 'Q-marriage-stage': stage, 'Q-marriage-nat': nat, 'Q-marriage-name-who': who, 'Q-marriage-home': home, ...extra }, over);
  const shown = (o: ReturnType<typeof run>) => o.cards.filter((c) => c.state === 'shown' || c.state === 'check_at_office' || c.state === 'ask').map((c) => c.card.id).sort();

  it('最初に聞くのは4問まで（段階・国籍・名前が変わる人・住所と世帯）。細かいことはカードの中で聞く', () => {
    expect(go(evMar, {}).upfront.map((q) => q.id)).toEqual(['Q-marriage-stage', 'Q-marriage-nat', 'Q-marriage-name-who', 'Q-marriage-home']);
    for (const id of ['Q-marriage-zairyu-card', 'Q-marriage-mynumber']) expect(data.questions.find((q) => q.id === id)!.stage).toBe('in_card');
  });
  it('日本人同士・これから・名前が変わらない・住所も世帯も同じ：婚姻届だけ（ほかは参考の保険・年金）', () => {
    const o = mar('before', 'both_japanese', 'none', 'none');
    expect(shown(o)).toEqual(['marriage-hoken-nenkin', 'marriage-konin-todoke']);
    expect(view(o, 'marriage-konin-todoke').section).toBe('today');
    expect(view(o, 'marriage-hoken-nenkin').section).toBe('info');
    expect(view(o, 'marriage-seitai-henko').state).toBe('excluded');
  });
  it('日本人同士：婚姻届で夫婦の氏を選ぶ案内が出る。日本人の氏の変更（外国籍の配偶者の氏）は出さない', () => {
    const o = mar('before', 'both_japanese', 'self', 'none', { 'Q-marriage-mynumber': true });
    expect(view(o, 'marriage-konin-todoke').methods.some((m) => plain(m.method.text.ja).includes('夫か妻のどちらかの氏'))).toBe(true);
    expect(view(o, 'marriage-ujino-henkou').state).toBe('excluded');
    expect(view(o, 'marriage-zairyu-shimei').state).toBe('excluded');
    expect(view(o, 'marriage-mynumber-card').state).toBe('shown');
  });
  it('日本人本人＋外国籍の相手：外国籍の書類が先。あなたの名前だけ変える（希望）→ 日本人の氏の変更（選べる）。相手の在留カードは出さない', () => {
    const o = mar('before', 'jp_foreign', 'self', 'none');
    expect(view(o, 'marriage-konin-gaikokuseki').state).toBe('shown');
    expect(view(o, 'marriage-ujino-henkou').state).toBe('shown');
    expect(view(o, 'marriage-zairyu-shimei').state).toBe('excluded');
    expect(view(o, 'marriage-zairyu-shikaku').section).toBe('info');
  });
  it('日本人本人＋外国籍の相手で、相手だけ名前が変わる：在留カードもマイナンバーカードも「あなたの義務」にしない', () => {
    const o = mar('submitted', 'jp_foreign', 'partner', 'none');
    for (const id of ['marriage-zairyu-shimei', 'marriage-mynumber-card', 'marriage-ujino-henkou']) expect(view(o, id).state, id).toBe('excluded');
    expect(plain(card('marriage-zairyu-shimei').reasons.excluded!.ja)).toContain('相手本人の手続き');
  });
  it('外国籍本人＋日本人の相手で、本人の名前が変わる：在留カードを持つか聞いてから、在留カードの届出を出す', () => {
    const a = mar('submitted', 'foreign_jp', 'self', 'none');
    expect(view(a, 'marriage-zairyu-shimei').state).toBe('ask');
    expect(view(a, 'marriage-zairyu-shimei').questions.map((q) => q.id)).toEqual(['Q-marriage-zairyu-card']);
    const b = mar('submitted', 'foreign_jp', 'self', 'none', { 'Q-marriage-zairyu-card': 'yes', 'Q-marriage-mynumber': true });
    expect(view(b, 'marriage-zairyu-shimei').state).toBe('shown');
    expect(view(b, 'marriage-zairyu-shimei').section).toBe('today');
    expect(view(b, 'marriage-mynumber-card').section).toBe('today');
  });
  it('在留カードを持たない外国籍の人（特別永住者証明書・持っていない）には、在留カードの届出を出さない', () => {
    for (const v of ['tokubetsu', 'no']) expect(view(mar('submitted', 'both_foreign', 'self', 'none', { 'Q-marriage-zairyu-card': v }), 'marriage-zairyu-shimei').state).toBe('excluded');
  });
  it('外国籍同士で両方の名前が変わる：在留カード・マイナンバーカードはあなたの分。日本人の氏・海外の届は出さない', () => {
    const o = mar('before', 'both_foreign', 'both', 'none', { 'Q-marriage-zairyu-card': 'yes', 'Q-marriage-mynumber': true });
    expect(view(o, 'marriage-zairyu-shimei').state).toBe('shown');
    expect(view(o, 'marriage-mynumber-card').state).toBe('shown');
    expect(view(o, 'marriage-ujino-henkou').state).toBe('excluded');
    expect(view(o, 'marriage-kaigai-todoke').state).toBe('excluded');
  });
  it('マイナンバーカードを持っていない人には、カードの変更を出さない', () => {
    expect(view(mar('submitted', 'both_japanese', 'self', 'none', { 'Q-marriage-mynumber': false }), 'marriage-mynumber-card').state).toBe('excluded');
  });
  it('名前が変わらない：在留カード・マイナンバーカードの変更は出さない', () => {
    const o = mar('submitted', 'foreign_jp', 'none', 'none');
    for (const id of ['marriage-zairyu-shimei', 'marriage-mynumber-card']) expect(view(o, id).state, id).toBe('excluded');
  });
  it('婚姻届をもう出した：婚姻届は「もうできた」（もう一度出させない）。名前が変わる人の手続きは「いま」', () => {
    const o = mar('submitted', 'foreign_jp', 'self', 'none', { 'Q-marriage-zairyu-card': 'yes' });
    expect(view(o, 'marriage-konin-todoke').section).toBe('done');
    expect(view(o, 'marriage-konin-gaikokuseki').state).toBe('excluded');
    expect(view(o, 'marriage-zairyu-shimei').section).toBe('today');
  });
  it('海外で婚姻が成立（日本国籍の人がいる）：婚姻届は出さず、3か月以内の報告の届出が目的', () => {
    const o = mar('abroad', 'jp_foreign', 'none', 'none');
    expect(view(o, 'marriage-konin-todoke').state).toBe('excluded');
    expect(view(o, 'marriage-konin-gaikokuseki').state).toBe('excluded');
    const k = view(o, 'marriage-kaigai-todoke');
    expect([k.state, k.section, k.goal]).toEqual(['shown', 'today', true]);
    expect(plain(card('marriage-kaigai-todoke').deadline!.text.ja)).toContain('3か月以内');
    const st = nowStep(o, TODAY);
    expect(st.kind === 'goal' && st.view.card.id).toBe('marriage-kaigai-todoke');
  });
  it('海外で婚姻が成立（ふたりとも外国籍）：日本の戸籍の届出は出さない。名前が変わる人の手続きは「いま」', () => {
    const o = mar('abroad', 'both_foreign', 'self', 'none', { 'Q-marriage-zairyu-card': 'yes' });
    expect(view(o, 'marriage-kaigai-todoke').state).toBe('excluded');
    expect(view(o, 'marriage-konin-todoke').state).toBe('excluded');
    expect(view(o, 'marriage-zairyu-shimei').section).toBe('today');
  });
  it('結婚しただけでは世帯の届を出さない。世帯だけ変わる → 世帯の届。引っ越す → 引っ越しの案内へつなぐ（世帯の届は重ねない）', () => {
    expect(view(mar('before', 'both_japanese', 'none', 'none'), 'marriage-seitai-henko').state).toBe('excluded');
    const h = mar('before', 'both_japanese', 'none', 'household');
    expect(view(h, 'marriage-seitai-henko').state).toBe('shown');
    expect(view(h, 'marriage-hikkoshi').state).toBe('excluded');
    const m = mar('before', 'both_japanese', 'none', 'move');
    expect(view(m, 'marriage-hikkoshi').state).toBe('shown');
    expect(view(m, 'marriage-seitai-henko').state).toBe('excluded');
    expect(card('marriage-hikkoshi').event_links!.map((l) => l.event)).toEqual(expect.arrayContaining(['E-move', 'E-move-within', 'E-move-out']));
  });
  it('保険・年金と在留資格は参考（関連する情報）。義務のタスクにしない。在留資格が自動的に変わるとは書かない', () => {
    const o = mar('submitted', 'foreign_jp', 'self', 'none', { 'Q-marriage-zairyu-card': 'yes' });
    for (const id of ['marriage-hoken-nenkin', 'marriage-zairyu-shikaku']) expect(view(o, id).section, id).toBe('info');
    expect(plain(card('marriage-zairyu-shikaku').summary.ja)).toContain('自動的には変わりません');
    expect(plain(card('marriage-hoken-nenkin').summary.ja)).toContain('だれにでも保険・年金の手続きが要るわけではありません');
  });
  it('わからない答え：除外せず、要確認（質問か窓口で確認）', () => {
    const o = mar('before', 'unknown', 'unknown', 'unknown');
    for (const id of ['marriage-zairyu-shimei', 'marriage-mynumber-card', 'marriage-seitai-henko', 'marriage-konin-gaikokuseki']) expect(['check_at_office', 'ask'], id).toContain(view(o, id).state);
    expect(view(o, 'marriage-konin-todoke').section).toBe('today');
  });
  it('婚姻届に期限は無い。「14日以内」と誤解させない（期限の欄は「期限なし」）', () => {
    const c = card('marriage-konin-todoke');
    expect(plain(c.deadline!.text.ja)).toContain('期限なし');
    expect(plain(c.deadline!.text.ja)).not.toMatch(/14日/);
    expect(plain(c.deadline!.text.ja_easy)).not.toMatch(/14日/);
    expect(c.deadline!.evidence.status).toBe('needs_check');
  });
  it('名前が変わったあとの手続きに、決まった順番を書かない（在留カード→マイナンバー→免許→銀行の固定順を消した）', () => {
    for (const id of ['marriage-zairyu-shimei', 'marriage-mynumber-card', 'marriage-seitai-henko']) expect(plain(card(id).deadline!.text.ja)).toMatch(/14日/);
    expect(plain(card('marriage-zairyu-shimei').summary.ja)).not.toContain('の順に');
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
  it('前の答え（古い質問 Q-marriage-kind・Q-marriage-name）が残っていても落ちない（使わない）', () => {
    const o = go(evMar, { 'Q-marriage-kind': 'japanese_foreign', 'Q-marriage-name': 'yes' });
    expect(o.upfront[0].id).toBe('Q-marriage-stage');
  });
  it('保存した進み具合はそのまま：婚姻届を済んだにしたら、名前が変わる人の手続きが「いま」になる', () => {
    const a = { 'Q-marriage-zairyu-card': 'yes' } as Record<string, Value>;
    const before = mar('before', 'foreign_jp', 'self', 'none', a);
    expect([view(before, 'marriage-zairyu-shimei').section, view(before, 'marriage-zairyu-shimei').sectionWhy]).toEqual(['later', 'after_card']);
    const after = mar('before', 'foreign_jp', 'self', 'none', a, { plan: { 'marriage-konin-todoke': { card_id: 'marriage-konin-todoke', status: 'done' } } });
    expect(view(after, 'marriage-zairyu-shimei').section).toBe('today');
  });
});

describe('ファミリーシップ制度（別の入口。K-16）', () => {
  it('入口 E-familyship は質問をしない。いまの手続きは「ファミリーシップ制度とは」だけ（ほかは関連する情報。くわしくは familyship.test.ts）', () => {
    const o = go(evFam, {});
    expect(o.cards.filter((c) => c.section === 'today').map((c) => c.card.id)).toEqual([FAMILYSHIP]);
    expect(o.upfront).toEqual([]);
  });
});

describe('離婚したい（E-divorce）', () => {
  /** 在留資格の答え（共通の Q-nationality・Q-zairyu-status。家族滞在＝family、日本人／永住者の配偶者等＝spouse） */
  const WHO: Record<string, Record<string, Value>> = {
    family_spouse: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'family', 'Q-status-as-spouse': 'yes' },
    family_child: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'family', 'Q-status-as-spouse': 'child' },
    jp_spouse: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'spouse', 'Q-status-as-spouse': 'yes' },
    student: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student' },
    japanese: { 'Q-nationality': 'japanese' },
    unknown: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'unknown' },
  };
  const div = (who: string, stage = 'agreement_done', kids = 'no', extra: Record<string, Value> = {}, over: Partial<EngineInput> = {}) =>
    go(evDiv, { 'Q-divorce-stage': stage, 'Q-divorce-children': kids, ...WHO[who], ...extra }, over);

  it('最初に聞くのは、段階・国籍・在留資格・子ども（4問まで）', () => {
    expect(go(evDiv, {}).upfront.map((q) => q.id)).toEqual(['Q-divorce-stage', 'Q-nationality', 'Q-divorce-children']);
    expect(go(evDiv, { 'Q-nationality': 'foreign' }).upfront.map((q) => q.id)).toEqual(['Q-divorce-stage', 'Q-zairyu-status', 'Q-divorce-children']);
  });
  it('家族滞在を配偶者として持つ人：入管への配偶者に関する届出（14日以内）が出る', () => {
    const o = div('family_spouse');
    expect(view(o, 'divorce-nyukan-todoke').state).toBe('shown');
    expect(view(o, 'divorce-nyukan-todoke').section).toBe('today');
    expect(plain(card('divorce-nyukan-todoke').deadline!.text.ja)).toContain('14日以内');
    expect(card('divorce-nyukan-todoke').deadline!.evidence.status).toBe('needs_check');
  });
  it('家族滞在を子どもとして持つ人：入管への届出は出さない', () => {
    expect(view(div('family_child'), 'divorce-nyukan-todoke').state).toBe('excluded');
  });
  it('配偶者としてかどうかを答えていない：カードの中で聞く', () => {
    const o = go(evDiv, { 'Q-divorce-stage': 'agreement_done', 'Q-divorce-children': 'no', 'Q-nationality': 'foreign', 'Q-zairyu-status': 'spouse' });
    expect(view(o, 'divorce-nyukan-todoke').state).toBe('ask');
    expect(view(o, 'divorce-nyukan-todoke').questions.map((q) => q.id)).toEqual(['Q-status-as-spouse']);
  });
  it('日本人の配偶者等を配偶者として持つ人にも出る。在留資格への影響は、届出とは別の参考として出す（滞在できる期間は書かない）', () => {
    const o = div('jp_spouse');
    expect(view(o, 'divorce-nyukan-todoke').state).toBe('shown');
    expect(view(o, 'divorce-zairyu-shikaku').section).toBe('info');
    const t = plain(card('divorce-zairyu-shikaku').summary.ja);
    expect(t).toContain('別のこと');
    expect(t).not.toMatch(/6か月/);
  });
  it('留学の人・日本国籍の人：入管への届出は出さない（対象外の案内文つき）', () => {
    expect(view(div('student'), 'divorce-nyukan-todoke').state).toBe('excluded');
    expect(plain(card('divorce-nyukan-todoke').reasons.excluded!.ja)).toContain('留学');
    expect(view(div('japanese'), 'divorce-nyukan-todoke').state).toBe('excluded');
  });
  it('在留資格・国籍がわからない人：除外せず、要確認', () => {
    expect(view(div('unknown'), 'divorce-nyukan-todoke').state).toBe('check_at_office');
    expect(view(go(evDiv, { 'Q-divorce-stage': 'agreement_done', 'Q-nationality': 'unknown', 'Q-divorce-children': 'no' }), 'divorce-nyukan-todoke').state).toBe('check_at_office');
  });
  it('在留資格の質問は、人の答え（scope: person）', () => {
    expect(data.questions.find((q) => q.id === 'Q-zairyu-status')!.scope).toBe('person');
    expect(data.questions.some((q) => q.id === 'Q-spouse-status')).toBe(false);
  });
  it('これから協議離婚：離婚届が目的（いま）。入管の届出は離婚届のあと', () => {
    const o = div('family_spouse', 'agreement_plan');
    const k = view(o, 'divorce-kyogi');
    expect([k.state, k.section, k.goal]).toEqual(['shown', 'today', true]);
    expect([view(o, 'divorce-nyukan-todoke').section, view(o, 'divorce-nyukan-todoke').afterFrom]).toEqual(['later', 'divorce-kyogi']);
  });
  it('協議離婚が成立した（離婚届を出した）：離婚届は「もうできた」（もう一度出させない）。入管の届出は「いま」', () => {
    const o = div('family_spouse', 'agreement_done');
    expect(view(o, 'divorce-kyogi').section).toBe('done');
    expect(view(o, 'divorce-nyukan-todoke').section).toBe('today');
  });
  it('調停・裁判で進めている：裁判の届が目的。入管の届出は、成立して届を出したあと', () => {
    const o = div('family_spouse', 'court_ongoing');
    expect(view(o, 'divorce-kyogi').state).toBe('excluded');
    expect(view(o, 'divorce-saiban').section).toBe('today');
    expect(view(o, 'divorce-nyukan-todoke').afterFrom).toBe('divorce-saiban');
  });
  it('調停・裁判で成立した：10日以内の届（いま）と、入管の届出（いま）。あとでだけにしない', () => {
    const o = div('family_spouse', 'court_done');
    expect(view(o, 'divorce-saiban').section).toBe('today');
    expect(view(o, 'divorce-nyukan-todoke').section).toBe('today');
    expect(plain(card('divorce-saiban').deadline!.text.ja)).toContain('10日以内');
    expect(plain(card('divorce-kyogi').deadline!.text.ja)).toContain('定めなし');
  });
  it('海外で離婚が成立：海外の離婚の届の案内（期限は言い切らず要確認）。協議・裁判の届は出さない', () => {
    const o = div('japanese', 'abroad');
    expect(view(o, 'divorce-kaigai').section).toBe('today');
    expect(plain(card('divorce-kaigai').summary.ja)).toContain('要確認');
    for (const id of ['divorce-kyogi', 'divorce-saiban']) expect(view(o, id).state).toBe('excluded');
  });
  it('未成年の子どもがいる：親権（単独・共同）・養育費・親子交流の案内が出る。いない人には出さない', () => {
    const o = div('japanese', 'agreement_plan', 'yes');
    expect(view(o, 'divorce-kodomo').section).toBe('today');
    const t = plain(card('divorce-kodomo').summary.ja);
    for (const w of ['共同親権', '養育費', '親子交流', '2026年4月1日']) expect(t).toContain(w);
    expect(view(div('japanese', 'agreement_plan', 'no'), 'divorce-kodomo').state).toBe('excluded');
    expect(view(div('japanese', 'agreement_plan', 'unknown'), 'divorce-kodomo').state).toBe('check_at_office');
  });
  it('離婚後の氏の届：日本国籍で、結婚で氏を変え、婚姻中の氏を使いたい人だけ', () => {
    const base = { 'Q-divorce-surname': 'yes', 'Q-divorce-keep-name': 'yes' };
    expect(view(div('japanese', 'agreement_done', 'no', base), 'divorce-shimei').state).toBe('shown');
    expect(view(div('japanese', 'agreement_done', 'no', { ...base, 'Q-divorce-keep-name': 'no' }), 'divorce-shimei').state).toBe('excluded');
    expect(view(div('japanese', 'agreement_done', 'no', { 'Q-divorce-surname': 'no' }), 'divorce-shimei').state).toBe('excluded');
    expect(view(div('student', 'agreement_done', 'no'), 'divorce-shimei').state).toBe('excluded');
    const ask = div('japanese', 'agreement_done', 'no');
    expect(view(ask, 'divorce-shimei').questions.map((q) => q.id)).toEqual(['Q-divorce-surname']);
    expect(plain(card('divorce-shimei').deadline!.text.ja)).toContain('3か月以内');
  });
  it('住所・世帯・保険・年金は関連する情報（全員の義務にしない）。年金分割は5年（2026年4月1日より前は2年）と例外を要確認で', () => {
    const o = div('student', 'agreement_done');
    expect(view(o, 'divorce-jusho-hoken-nenkin').section).toBe('info');
    const c = card('divorce-jusho-hoken-nenkin');
    expect(c.kind).toBe('guide');
    expect(plain(c.deadline!.text.ja)).toMatch(/5年以内/);
    expect(plain(c.deadline!.text.ja)).toMatch(/2年以内/);
    expect(plain(c.deadline!.text.ja)).toContain('要確認');
    expect((c.methods ?? []).some((m) => plain(m.text.ja).includes('6か月'))).toBe(true);
  });
  it('どの答えでも「あとで」だけの画面にならない', () => {
    for (const stage of ['agreement_plan', 'agreement_done', 'court_ongoing', 'court_done', 'abroad', 'unknown']) {
      for (const who of Object.keys(WHO)) {
        const o = div(who, stage, 'no');
        const open = o.cards.filter((c) => c.section && c.section !== 'info' && c.section !== 'done');
        if (open.length) expect(open.some((c) => c.section !== 'later'), `${stage}/${who}`).toBe(true);
      }
    }
  });
  it('前の答え（古い質問 Q-divorce-route・Q-divorce-japanese）が残っていても落ちない', () => {
    expect(go(evDiv, { 'Q-divorce-route': 'agreement', 'Q-divorce-japanese': 'yes' }).upfront[0].id).toBe('Q-divorce-stage');
  });
});
