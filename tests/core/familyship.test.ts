/* ファミリーシップ制度（E-familyship。docs/kaizen/family.md、2026-11-08）。
   入口から「ファミリーシップ制度とは」へ直接。そこで目的（初めて・宣誓のあと・自治体間）を選び、初めての人は方法（申込フォーム・Zoom・対面）を選ぶ。
   結婚（婚姻届）とは別の事実 event = familyship。案内は「関連する情報」で、ToDo にしない。 */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';
import { checkPart, partViews, singleGoal } from '../../src/core/overview';

const data = loadData();
const T = '2026-11-08';
const E = (id: string) => data.events.find((e) => e.id === id)!;
const go = (id: string, answers: Record<string, string> = {}, over: Partial<EngineInput> = {}) =>
  run(data, { answers, objects: {}, plan: {}, createdOn: T, today: T, mode: 'public', event: E(id), ...over });
const card = (id: string) => data.cards.find((c) => c.id === id)!;
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const allText = (id: string) => plain(JSON.stringify(card(id)));
const FAM = E('E-familyship');
const MENU = ['familyship-first', 'familyship-after', 'familyship-renkei'];
const METHODS = ['familyship-online', 'familyship-zoom', 'familyship-taimen'];
const AFTER = ['familyship-saikofu', 'familyship-henko', 'familyship-henkan', 'familyship-shomei', 'familyship-ko-sakujo'];

describe('入口と区分け', () => {
  it('参照の検査を通る。質問はしない。いまの手続きは「ファミリーシップ制度とは」だけで、その画面へ直接行く', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(FAM.questions).toEqual([]);
    const o = go('E-familyship');
    expect(singleGoal(o, nowStep(o, T))?.card.id).toBe('marriage-familyship');
    // 目的ごとの案内は、どれも開ける「関連する情報」（ToDo にしない。日を聞かない）
    for (const id of FAM.card_ids.filter((x) => x !== 'marriage-familyship')) {
      const v = o.cards.find((c) => c.card.id === id)!;
      expect([id, v.state, v.section, v.dayRule.kind]).toEqual([id, 'shown', 'info', 'no_day']);
    }
  });
  it('結婚と混ぜない：事実は event = familyship。婚姻届のカードはこの入口に無く、結婚の入口にファミリーシップのカードは無い', () => {
    expect(FAM.facts).toEqual([{ fact: 'event', value: 'familyship' }]);
    expect(FAM.card_ids.some((id) => id.startsWith('marriage-konin') || id.startsWith('divorce-'))).toBe(false);
    expect(E('E-marriage').card_ids.some((id) => id.includes('familyship'))).toBe(false);
    for (const id of FAM.card_ids) expect(card(id).eligibility).toBe('R-fam-event');
    // 結婚の入口はそのまま：婚姻届が目的
    const m = go('E-marriage', { 'Q-marriage-kind': 'both_japanese', 'Q-marriage-name': 'no' });
    expect(m.cards.find((c) => c.card.id === 'marriage-konin-todoke')!.goal).toBe(true);
  });
  it('範囲の文は、アプリを使えることと、宣誓の条件を分ける', () => {
    const r = data.rules.get(FAM.scope_rule!)!;
    expect(plain(r.statement.ja)).toContain('宣誓できるかどうかは、名古屋市の条件');
  });
});

describe('目的と方法を選ぶ', () => {
  it('「ファミリーシップ制度とは」から3つの目的、「初めて宣誓する」から3つの方法を選べる。選んだ先から、ほかを選び直せる', () => {
    expect(card('marriage-familyship').menu!.card_ids).toEqual(MENU);
    expect(card('familyship-first').menu!.card_ids).toEqual(METHODS);
    expect(card('familyship-after').menu!.card_ids).toEqual(AFTER);
    // 選び直す道（CardPage の MenuSiblings）：どのカードにも、それを menu に持つカードがちょうど1つ
    for (const id of [...MENU, ...METHODS, ...AFTER]) expect(data.cards.filter((c) => c.menu?.card_ids.includes(id)).map((c) => c.id)).toHaveLength(1);
  });
  it('予約：Zoom と対面は事前の予約（3か月前〜1週間前）。申込フォームは予約の案内が無い（要確認）', () => {
    for (const id of ['familyship-zoom', 'familyship-taimen']) expect(allText(id)).toContain('3か月前から1週間前');
    expect(plain(card('familyship-online').lead!.ja)).toContain('予約の案内はありません（要確認）');
    expect(plain(card('familyship-first').menu!.note!.ja)).toContain('Zoomと対面は、先に予約が要ります');
  });
});

describe('書類・費用・効果', () => {
  const first = allText('familyship-first');
  it('必要な書類：全員の書類（住民票・独身・本人確認、3か月以内）と、当てはまる人だけの書類', () => {
    for (const w of ['住民票の写し', '独身であることを証明する書類', '本人確認書類', '発行から3か月以内']) expect(first).toContain(w);
    for (const w of ['日本語訳', '転入予定の住所がわかる書類', '15歳以上の子', '通称名']) expect(first).toContain(w);
    const titles = card('familyship-first').sections!.map((s) => plain(s.title.ja));
    expect(titles).toContain('2. 必要な書類（全員）');
    expect(titles).toContain('2. 必要な書類（当てはまる人だけ）');
  });
  it('費用：宣誓は無料。書類の手数料・返信用封筒・切手（180円）は自分で払う', () => {
    const fee = plain(card('marriage-familyship').fee!.text.ja);
    for (const w of ['無料', '発行手数料', '返信用封筒', '180円']) expect(fee).toContain(w);
  });
  it('効果：法律上の効果は無い。戸籍・在留資格は変わらない（「関係しない」と言い過ぎない）。市営住宅には証明書を出して申し込める', () => {
    const t = allText('marriage-familyship');
    for (const w of ['法律上の効果', '戸籍や在留資格・在留期間は変わりません', '市営住宅', '宣誓書記載内容等証明書']) expect(t).toContain(w);
    expect(t).not.toContain('関係しません');
  });
});

describe('宣誓のあと・自治体間', () => {
  it('5つの手続きに、それぞれ公式の申込フォームへのリンクがある', () => {
    const forms: Record<string, string> = { 'familyship-saikofu': 'doZ92', 'familyship-henko': 'dEhXQ', 'familyship-henkan': 'MJAV4', 'familyship-shomei': 'uYdLG', 'familyship-ko-sakujo': 'WEC9i' };
    for (const [id, f] of Object.entries(forms)) expect(card(id).links![0].url).toBe('https://logoform.jp/f/' + f);
  });
  it('返還：連携自治体へ引っ越すときは返還届が要らないと書く（無条件に返還へ案内しない）', () => {
    expect(allText('familyship-henkan')).toContain('返還届は要りません');
    const r = allText('familyship-renkei');
    for (const w of ['転入後3か月以内に継続申告', '返還の手続きは要りません', '続けられない', 'あらためて']) expect(r).toContain(w);
  });
  it('「済んだ」と記録した前の保存があっても、目的ごとの案内は開ける（宣誓した人が再交付などへ進める）', () => {
    const o = go('E-familyship', {}, { plan: { 'marriage-familyship': { card_id: 'marriage-familyship', status: 'done' } } });
    expect(singleGoal(o, nowStep(o, T))).toBeNull();
    for (const id of ['familyship-after', ...AFTER, 'familyship-renkei']) expect(o.cards.find((c) => c.card.id === id)!.section).toBe('info');
  });
});

describe('任意のチェックリスト（初めて宣誓する）', () => {
  it('6つの印。付けなくても全部読める。全部付けると、その案内だけが済んだになる', () => {
    let o = go('E-familyship');
    const v = o.cards.find((c) => c.card.id === 'familyship-first')!;
    const parts = partViews(v, o.facts);
    expect(parts.map((p) => p.id)).toEqual(['conditions', 'docs_checked', 'docs_ready', 'method', 'pledged', 'received']);
    // 1つ付けると「進めている」。案内を開いたまま、ほかの印もあとで付けられる
    const one = checkPart(v, parts, 'conditions', true);
    expect(one.status).toBe('preparing');
    // 前に押した印（pending）を残して、全部付ける（画面の Checklist と同じ）
    const all = checkPart(v, parts, 'received', true, Object.fromEntries(parts.slice(0, -1).map((p) => [p.id, 'done'])));
    expect(all.status).toBe('done');
    o = go('E-familyship', {}, { plan: { 'familyship-first': { card_id: 'familyship-first', ...all } } });
    expect(o.cards.find((c) => c.card.id === 'familyship-first')!.section).toBe('done');
    expect(o.cards.find((c) => c.card.id === 'familyship-after')!.section).toBe('info');
  });
});

describe('確認状態', () => {
  it('公式の情報は needs_check のまま（作者の確認前）。引用と確かめた日がある', () => {
    for (const id of FAM.card_ids) {
      const c = card(id);
      const evs = [c.evidence, c.where.evidence, c.fee?.evidence, c.deadline?.evidence, ...(c.sections ?? []).flatMap((s) => s.items.map((x) => x.evidence))].filter((e) => !!e);
      for (const e of evs) {
        expect(e!.status).toBe('needs_check');
        expect(e!.checked_at).toBe('2026-11-08');
        if (!e!.source_ids.includes('kurashi-spec')) expect((e!.quote ?? '').length).toBeGreaterThan(5);
      }
    }
  });
});
