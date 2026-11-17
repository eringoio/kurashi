/* 財布の紛失（2026-11-08 に公開。元は drafts/data/E-lost-wallet.bundle.json v2）を、7つの場面で検証する（レビューの指摘 5）。
   本番と同じ表示（public：制度のルールは未確認のまま）で、「いまの1つ」を順にたどり、何がどの順に出るかを確かめる。
   - 本人の選択を言い直すルール（kind: selection）は、確認状態にかかわらず答えのとおり（SPEC 10.4 v0.4.8）
   - 前提の関係は、確認前でも並び順にだけ使う（SPEC 10.3 v0.4.8）
   保存と再開は tests/unit/lost-resume.test.ts。 */
import { describe, expect, it } from 'vitest';
import { verifiedNotBulk } from './bulk';
import { checkRefs, loadData } from '../../src/core/data';
import { type EngineInput, run } from '../../src/core/engine';
import type { PlanRecord } from '../../src/core/entry';
import { nowStep } from '../../src/core/now';
import { partViews, phaseViews, tracked } from '../../src/core/overview';
import type { Value } from '../../src/core/schema';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-lost-wallet')!;
const TODAY = '2026-11-04';
const TOMORROW = '2026-11-05';
const ALL = ev.card_ids;

type Mode = 'public' | 'verified';
const out = (answers: Record<string, Value>, plan: Record<string, PlanRecord> = {}, mode: Mode = 'public', over: Partial<EngineInput> = {}) =>
  run(data, { answers, objects: {}, plan, createdOn: TODAY, today: TODAY, mode, event: ev, ...over });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
/** 出る手続き（対象外・範囲外を除く） */
const shown = (o: ReturnType<typeof run>) => o.cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope').map((c) => c.card.id);

/** 「いまの1つ」を順にたどる。質問は script の答えで答え、すぐ行う行動は済んだにし、日を決める画面は明日を選ぶ。
    （今日を選ぶと、「いま」は今日の予定を「日を決める」より先に出すので（K-35）、そこで止まる。日を決める順を見るため明日にする） */
function walk(script: Record<string, Value>, mode: Mode = 'public', start: { answers?: Record<string, Value>; plan?: Record<string, PlanRecord> } = {}) {
  // なくした場所は、書いていなければ「外（道など）」（11/8 kaizen C：場所で警察・施設の案内が変わる）
  script = { 'Q-lost-place': 'outside', ...script };
  const answers: Record<string, Value> = { ...(start.answers ?? {}) };
  const plan: Record<string, PlanRecord> = { ...(start.plan ?? {}) };
  const steps: string[] = [];
  for (let i = 0; i < 30; i++) {
    const o = out(answers, plan, mode);
    const s = nowStep(o, TODAY);
    if (s.kind === 'upfront' || s.kind === 'card_q') {
      if (!(s.q.id in script)) { steps.push(`質問:${s.q.id}（答えなし）`); break; }
      steps.push(`質問:${s.q.id}`);
      answers[s.q.id] = script[s.q.id];
    } else if (s.kind === 'urgent') {
      steps.push(`すぐ:${s.view.card.id}`);
      plan[s.view.card.id] = { card_id: s.view.card.id, status: 'done' };
    } else if (s.kind === 'plan') {
      steps.push(`日:${s.view.card.id}`);
      plan[s.view.card.id] = { ...(plan[s.view.card.id] ?? { card_id: s.view.card.id, status: 'todo' }), planned_on: TOMORROW };
    } else { steps.push(s.kind); break; }
  }
  return { steps, answers, plan, final: out(answers, plan, mode) };
}

describe('財布の紛失 v2：データ', () => {
  it('型と参照の検査を通る。選択を言い直すルールは selection で、出典は本アプリの定義だけ', () => {
    expect(checkRefs(data)).toEqual([]);
    const sel = [...data.rules.values()].filter((r) => r.id.startsWith('R-lost-') && r.kind === 'selection');
    expect(sel.map((r) => r.id).sort()).toEqual(['R-lost-at-home', 'R-lost-cash', 'R-lost-credit', 'R-lost-facility', 'R-lost-hoken', 'R-lost-hoken-employer', 'R-lost-hoken-kokuho', 'R-lost-hoken-not-employer', 'R-lost-hoken-unsure', 'R-lost-license', 'R-lost-mynumber', 'R-lost-no-zairyu', 'R-lost-not-home', 'R-lost-passport-foreign', 'R-lost-passport-jp', 'R-lost-payment', 'R-lost-reported', 'R-lost-reported-online', 'R-lost-reported-unsure', 'R-lost-stolen', 'R-lost-unsure', 'R-lost-wallet', 'R-lost-zairyu']);
  });
  it('在留カードから国籍を推測しない：国籍・在留資格を条件に使うルールが無い', () => {
    for (const r of data.rules.values()) if (r.id.startsWith('R-lost-')) expect(JSON.stringify(r.condition), r.id).not.toMatch(/nationality|residence_basis/);
  });
  it('カードの停止は警察を待たない（前提の関係が無い）。在留カードの再交付は警察の届が前提', () => {
    const pre = data.relations.filter((r) => r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite') as { from: string; to: string }[];
    expect(pre.some((r) => r.to === 'lost-card-stop' || r.to === 'lost-mynumber-stop')).toBe(false);
    expect(pre.some((r) => r.from === 'lost-police-report-zairyu' && r.to === 'lost-zairyu-reissue')).toBe(true);
  });
});

describe('レビューの指摘1の再現：選ばなかった物を出さない（本番と同じ表示）', () => {
  it('キャッシュカードだけ：旅券・在留カードなどは対象外。いまの1つの先頭はカードの停止', () => {
    const o = out({ 'Q-lost-items': ['cash_card'] });
    expect(view(o, 'lost-passport-jp').state).toBe('excluded');
    expect(view(o, 'lost-passport-foreign').state).toBe('excluded');
    expect(view(o, 'lost-zairyu-reissue').state).toBe('excluded');
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'urgent', view: { card: { id: 'lost-card-stop' } } });
  });
});

describe('7つの場面（本番と同じ表示 public）', () => {
  it('A カードだけ：カードを止める → 警察に届けたか → 警察の日 → 終わり', () => {
    const r = walk({ 'Q-lost-items': ['cash_card', 'credit_card'], 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', 'すぐ:lost-card-stop', '質問:Q-lost-place', '質問:Q-police-reported', '日:lost-police-report', '日:bank-card-reissue', 'until']);
    expect(shown(r.final).sort()).toEqual(['bank-card-reissue', 'lost-card-stop', 'lost-credit-reissue', 'lost-found-later', 'lost-no-id-consult', 'lost-police-report']);
  });

  it('B 在留カードだけ：警察の日 → 在留カードの再交付の日（警察の後）。国籍は聞かない', () => {
    const r = walk({ 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-lost-place', '質問:Q-police-reported', '日:lost-police-report-zairyu', '日:lost-zairyu-reissue', 'until']);
    expect(r.steps.some((s) => /country|nationality/.test(s))).toBe(false);
    expect(shown(r.final).sort()).toEqual(['lost-found-later', 'lost-no-id-consult', 'lost-police-report-zairyu', 'lost-zairyu-reissue']);
    // 在留カードの再交付の注記：先に警察に届けて受理番号を確かめる
    const z = view(out(r.answers, {}), 'lost-zairyu-reissue');
    expect(z.notes.map((n) => n.relation.id)).toContain('rel-police-before-zairyu-reissue');
  });

  it('C 外国旅券だけ：発行国を聞く → 警察 → 大使館・領事館。日本の旅券・在留カードは出ない', () => {
    const r = walk({ 'Q-lost-items': ['passport'], 'Q-passport-country': 'other_country', 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-passport-country', '質問:Q-lost-place', '質問:Q-police-reported', '日:lost-police-report', '日:lost-passport-foreign', 'until']);
    expect(view(r.final, 'lost-passport-jp').state).toBe('excluded');
    expect(view(r.final, 'lost-zairyu-reissue').state).toBe('excluded');
  });

  it('D 在留カード＋外国旅券：警察 → 在留カード（14日以内）→ 大使館', () => {
    // 並び順（v0.5.44）：前提を先に（警察）、そのあと期限のある法令の義務（在留カード）。大使館には今のデータで前提が無い。
    // 在留カードの再交付は、旅券を見せられないとき理由書でよい（カードの methods。要確認）
    const r = walk({ 'Q-lost-items': ['zairyu_card', 'passport'], 'Q-passport-country': 'other_country', 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-passport-country', '質問:Q-lost-place', '質問:Q-police-reported', '日:lost-police-report-zairyu', '日:lost-zairyu-reissue', '日:lost-passport-foreign', 'until']);
  });

  it('E 日本旅券：発行国＝日本 → 警察 → 愛知県の旅券窓口。外国旅券は出ない', () => {
    const r = walk({ 'Q-lost-items': ['passport'], 'Q-passport-country': 'japan', 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-passport-country', '質問:Q-lost-place', '質問:Q-police-reported', '日:lost-police-report', '日:lost-passport-jp', 'until']);
    expect(view(r.final, 'lost-passport-foreign').state).toBe('excluded');
  });

  it('F 中身がわからない（「よくわからない」だけ）：確かめ方の案内（すぐ）だけ。身分証の再交付を全部は出さない（11/8 kaizen F）', () => {
    const o = out({ 'Q-lost-items': ['unsure'], 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet' });
    for (const id of ['lost-zairyu-reissue', 'lost-mynumber-reissue', 'lost-license-reissue', 'lost-hoken-reissue', 'lost-passport-jp', 'lost-passport-foreign', 'bank-card-reissue', 'lost-credit-reissue']) expect(view(o, id).state, id).toBe('excluded');
    expect(view(o, 'lost-unsure-check').state).toBe('shown');
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'urgent', view: { card: { id: 'lost-unsure-check' } } });
    expect(view(o, 'lost-unsure-check').dayRule.kind).toBe('no_day');
    // 発行国が「わからない」：日本・外国のどちらの旅券の手続きも「窓口で確認」（パスポートを選んだ人だけ）
    const pc = out({ 'Q-lost-items': ['passport'], 'Q-passport-country': 'unknown', 'Q-police-reported': 'not_yet' });
    expect([view(pc, 'lost-passport-jp').state, view(pc, 'lost-passport-foreign').state]).toEqual(['check_at_office', 'check_at_office']);
  });

  it('F2 一部はわかる＋よくわからない：選んだ物の手続きと確かめ方が両方出る。前の版の答え（unknown）でも落ちない', () => {
    const o = out({ 'Q-lost-items': ['cash_card', 'unsure'], 'Q-lost-place': 'outside' });
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'urgent' });
    expect(view(o, 'lost-card-stop').state).toBe('shown');
    expect(view(o, 'lost-unsure-check').state).toBe('shown');
    expect(view(o, 'lost-zairyu-reissue').state).toBe('excluded');
    expect(view(o, 'lost-card-stop').dayRule.kind).toBe('no_day');
    // 前の版の保存（'unknown'）：今までどおり「窓口で確認」で、落ちない
    const old = out({ 'Q-lost-items': ['unknown'], 'Q-police-reported': 'unknown' });
    expect(view(old, 'lost-zairyu-reissue').state).toBe('check_at_office');
  });

  it('G すでに警察へ届けた：警察の届は「もうできた」。在留カードの再交付がすぐ次', () => {
    const r = walk({ 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'yes' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-lost-place', '質問:Q-police-reported', '日:lost-zairyu-reissue', 'until']);
    const p = view(r.final, 'lost-police-report-zairyu');
    expect([p.section, p.sectionWhy]).toEqual(['done', 'answer']);
  });

  it('どの場面でも、選ばなかった物の手続きは「なくした物」として出ない', () => {
    const cases: [string[], string[]][] = [
      [['cash_card'], ['lost-zairyu-reissue', 'lost-mynumber-stop', 'lost-mynumber-reissue', 'lost-license-reissue', 'lost-hoken-reissue', 'lost-passport-jp', 'lost-passport-foreign']],
      [['zairyu_card'], ['lost-card-stop', 'lost-mynumber-stop', 'lost-passport-jp', 'lost-passport-foreign', 'lost-license-reissue']],
      [['passport'], ['lost-zairyu-reissue', 'lost-card-stop', 'lost-mynumber-reissue']],
    ];
    for (const mode of ['public', 'verified'] as const) {
      for (const [items, notShown] of cases) {
        const o = out({ 'Q-lost-items': items, 'Q-passport-country': 'other_country', 'Q-police-reported': 'not_yet' }, {}, mode);
        for (const id of notShown) expect(view(o, id).state, `${mode} ${items} ${id}`).toBe('excluded');
      }
    }
  });
});

describe('確認済みの見本（verified）：在留カードの再交付は警察の受理を待って止めない（11/8 kaizen D）', () => {
  it('警察にまだ届けていなくても、在留カードの再交付（14日の期限）は「いま」。前に要ること（警察）は示し、並びは警察の後', () => {
    const a = { 'Q-lost-items': ['zairyu_card'], 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet' };
    const o = out(a, {}, 'verified');
    expect(view(o, 'lost-zairyu-reissue').section).toBe('today');
    expect(view(o, 'lost-zairyu-reissue').notes.map((n) => n.relation.id)).toContain('rel-police-before-zairyu-reissue');
    const ids = o.cards.map((c) => c.card.id);
    expect(ids.indexOf('lost-police-report-zairyu')).toBeLessThan(ids.indexOf('lost-zairyu-reissue'));
  });
  it('オンラインで送った（受理待ち）でも、在留カードの再交付は止まらない', () => {
    const o = out({ 'Q-lost-items': ['zairyu_card'], 'Q-lost-place': 'outside', 'Q-police-reported': 'online_waiting' }, {}, 'verified');
    expect(view(o, 'lost-police-report-zairyu').section).toBe('wait');
    expect(view(o, 'lost-zairyu-reissue').section).toBe('today');
  });
});

it('ALL：イベントのカードはすべてデータにある', () => {
  for (const id of ALL) expect(data.cards.some((c) => c.id === id), id).toBe(true);
});

/* ───── 統合の確認で足した条件（11/7 5章：lost-integration.test.ts を1本にまとめた） ───── */
{
/* 財布の紛失：統合の確認（research/integration/claude_priority_review/）で足した条件。
   INT-003（オンラインの受理待ち）・INT-004（選んだ・わからない・未回答）・INT-006（特急の起算点）・INT-007（16歳・写真1歳）、
   なくした場所（自宅・施設・路上・国外・盗難）、見つかったとき（LOSS_008）。合格しても、制度の正しさや作者の承認の代わりにはならない。 */

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-lost-wallet')!;
const mine = () => JSON.stringify({ event: ev, cards: ev.card_ids.map((id) => data.cards.find((c) => c.id === id)), rules: [...data.rules.values()].filter((r) => JSON.stringify(ev).includes(r.id) || ev.card_ids.some((id) => JSON.stringify(data.cards.find((c) => c.id === id)).includes(r.id))), relations: data.relations.filter((r) => ev.card_ids.some((id) => JSON.stringify(r).includes(id))) });
const TODAY = '2026-11-04';
const out = (answers: Record<string, Value>, mode: 'public' | 'verified' = 'public') =>
  run(data, { answers, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode, event: ev });
const view = (o: ReturnType<typeof out>, id: string) => o.cards.find((c) => c.card.id === id)!;
const methodText = (o: ReturnType<typeof out>, id: string) => view(o, id).methods.map((m) => m.method.text.ja.replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1'));
const base = { 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet' };

describe('データ', () => {
  it('型と参照の検査を通る。いつも聞く入口の質問は3つまで（ほかは物を選んだ人だけ）。すべて needs_check', () => {
    expect(checkRefs(data)).toEqual([]);
    const always = ev.questions.map((id) => data.questions.find((q) => q.id === id)!).filter((q) => JSON.stringify(q.ask_when) === '{"all":[]}');
    expect(always.map((q) => q.id)).toEqual(['Q-lost-items', 'Q-lost-place']);
    expect(verifiedNotBulk(mine())).toEqual([]);
  });
});

describe('INT-004 選んだ・よくわからない・未回答を分ける', () => {
  it('カードだけを選んだ：選ばなかった物は対象外（F）', () => {
    const o = out({ ...base, 'Q-lost-items': ['cash_card'] });
    expect(view(o, 'lost-zairyu-reissue').state).toBe('excluded');
  });
  it('中身の質問に未回答：対象外にしない。まず中身を聞く', () => {
    const o = out({});
    expect(view(o, 'lost-zairyu-reissue').state).not.toBe('excluded');
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'upfront', q: { id: 'Q-lost-items' } });
  });
});

describe('なくした場所（11/8 kaizen C。K-15 で外した質問を、案内が変わるので戻した）', () => {
  it('家の中：警察の届は出さない（受理されない）。家の中を探す案内。警察に届けたかは聞かない。再交付の前提（警察）も外す', () => {
    const o = out({ 'Q-lost-items': ['zairyu_card', 'mynumber_card', 'cash_card'], 'Q-lost-place': 'home' });
    expect(view(o, 'lost-police-report-zairyu').state).toBe('excluded');
    expect(view(o, 'lost-police-report').state).toBe('excluded');
    expect(view(o, 'lost-facility-ask').state).toBe('excluded');
    expect(view(o, 'lost-search-home').state).toBe('shown');
    expect(o.upfront.map((q) => q.id)).not.toContain('Q-police-reported');
    expect(view(o, 'lost-zairyu-reissue').notes.filter((n) => n.kind === 'practical_prereq' || n.kind === 'legal_prereq')).toEqual([]);
    expect(view(o, 'lost-card-stop').state).toBe('shown');
    // 在留カードの再交付：遺失届の対象にならないときは、陳述書にそう書く
    expect(methodText(o, 'lost-zairyu-reissue').join()).toContain('遺失届出などの対象にならないときは');
  });
  it('外（道など）：警察の届と落とし物の検索。施設への問い合わせは出さない', () => {
    const o = out({ ...base, 'Q-lost-items': ['cash_card'] });
    expect(view(o, 'lost-police-report').state).toBe('shown');
    expect(view(o, 'lost-police-report').card.links?.[0].url).toContain('ishitsu-todokedekensaku');
    expect(view(o, 'lost-facility-ask').state).toBe('excluded');
  });
  it('駅・店など：施設への問い合わせも出る（警察・停止と並行）', () => {
    const o = out({ 'Q-lost-items': ['cash_card'], 'Q-lost-place': 'facility', 'Q-police-reported': 'not_yet' });
    const f = view(o, 'lost-facility-ask');
    expect(f.state).toBe('shown');
    expect(f.notes.map((n) => n.kind)).toContain('parallel');
    expect(view(o, 'lost-police-report').state).toBe('shown');
    expect(data.relations.some((r) => (r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite') && (r.to === 'lost-facility-ask' || r.from === 'lost-facility-ask'))).toBe(false);
  });
  it('盗まれたかもしれない：警察（被害届・相談）と、クレジットカードの不正利用の確認', () => {
    const o = out({ 'Q-lost-items': ['credit_card'], 'Q-lost-place': 'stolen', 'Q-police-reported': 'not_yet' });
    expect(methodText(o, 'lost-police-report').join()).toContain('被害届');
    expect(methodText(o, 'lost-police-report').join()).toContain('#9110');
    expect(methodText(o, 'lost-credit-reissue').join()).toContain('カード会社と警察の両方');
    // 盗難でないときは、盗難の文を出さない
    expect(methodText(out({ ...base, 'Q-lost-items': ['credit_card'] }), 'lost-police-report').join()).not.toContain('被害届');
  });
  it('わからない：警察と施設の両方を出す（家の中の案内は出さない）', () => {
    const o = out({ 'Q-lost-items': ['cash_card'], 'Q-lost-place': 'unsure', 'Q-police-reported': 'not_yet' });
    expect(['lost-police-report', 'lost-facility-ask'].map((id) => view(o, id).state)).toEqual(['shown', 'shown']);
    expect(view(o, 'lost-search-home').state).toBe('excluded');
  });
  it('場所に答える前：警察・施設・家の中は「要確認」で、場所を聞く', () => {
    const o = out({ 'Q-lost-items': ['cash_card'] });
    expect(view(o, 'lost-police-report').state).toBe('ask');
    expect(o.upfront.map((q) => q.id)).toEqual(['Q-lost-place']);
  });
});

describe('在留カードの遺失届は別のカード（11/8 kaizen D：一律の法令上の義務にしない）', () => {
  it('在留カードをなくした：警察への届（在留カード）が出る。practical。交番でも届けられる。受付番号と受理番号は別。ふつうの遺失届は出ない', () => {
    const o = out({ ...base, 'Q-lost-items': ['zairyu_card'] });
    const z = view(o, 'lost-police-report-zairyu');
    expect(z.state).toBe('shown');
    expect(z.card.obligation).toBe('practical');
    const plain = (x: unknown) => JSON.stringify(x).replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
    const all = plain([z.card.title, z.card.summary, z.card.lead, z.card.notices, z.card.where]);
    expect(all).not.toContain('交番ではなく');
    expect(plain(z.card.summary.ja)).toContain('交番');
    expect(plain(z.card.notices)).toContain('「受付番号」は、警察署の「受理番号」ではありません');
    expect(plain(z.card.summary.ja)).toContain('交番では申請できません');
    expect(z.card.evidence.status).toBe('needs_check');
    expect(view(o, 'lost-police-report').state).toBe('excluded');
    // 再交付：14日の期限を名前に出す。受理番号がまだでも入管に相談
    const r = view(o, 'lost-zairyu-reissue');
    expect(plain(r.card.title.ja)).toContain('14日以内');
    expect(r.card.obligation).toBe('legal');
    expect(methodText(o, 'lost-zairyu-reissue').join()).toContain('14日の期限は変わりません');
  });
  it('在留カードをなくしていない：ふつうの警察の届（practical）が出る。在留カード用は出ない', () => {
    const o = out({ ...base, 'Q-lost-items': ['cash_card'] });
    expect(view(o, 'lost-police-report').state).toBe('shown');
    expect(view(o, 'lost-police-report').card.obligation).toBe('practical');
    expect(view(o, 'lost-police-report-zairyu').state).toBe('excluded');
  });
  it('チェックリスト表示の出来事', () => {
    expect((ev as { checklist?: boolean }).checklist).toBe(true);
  });
});

describe('INT-003 警察：提出・受理確認待ち・受理確認済みを分ける', () => {
  it('オンラインで送った（受理番号はまだ）：済んだにしない。受付番号と受理番号は別、と示す', () => {
    const o = out({ ...base, 'Q-police-reported': 'online_waiting', 'Q-lost-items': ['zairyu_card'] });
    const p = view(o, 'lost-police-report-zairyu');
    expect(p.section).not.toBe('done');
    const t = methodText(o, 'lost-police-report-zairyu').join();
    expect(t).toContain('受付番号は受理番号ではありません');
    // 在留カードをなくしていないときの遺失届には「待つ」の説明がある
    const o2 = out({ ...base, 'Q-police-reported': 'online_waiting', 'Q-lost-items': ['cash_card'] });
    expect(methodText(o2, 'lost-police-report').join()).toContain('受理されていないとは限りません');
  });
  it('本番と同じ表示では「待つ」は効かない（関係が未確認）。作者の確認済み見本では「届くのを待つ」', () => {
    const a = { ...base, 'Q-police-reported': 'online_waiting', 'Q-lost-items': ['zairyu_card'] };
    expect(view(out(a), 'lost-police-report-zairyu').section).not.toBe('wait');
    expect(view(out(a, 'verified'), 'lost-police-report-zairyu').section).toBe('wait');
  });
  it('受理番号がわかる（はい）：もうできた', () => {
    expect(view(out({ ...base, 'Q-police-reported': 'yes', 'Q-lost-items': ['zairyu_card'] }), 'lost-police-report-zairyu').section).toBe('done');
  });
  it('届けたかわからない：確かめ方（最寄りの警察署・メール）を出す。済んだにしない', () => {
    const o = out({ ...base, 'Q-police-reported': 'unsure', 'Q-lost-items': ['cash_card'] });
    expect(view(o, 'lost-police-report').section).not.toBe('done');
    expect(methodText(o, 'lost-police-report').join()).toContain('最寄りの警察署の会計課');
    expect(methodText(out({ ...base, 'Q-lost-items': ['cash_card'] }), 'lost-police-report').join()).not.toContain('会計課');
  });
});

describe('LOSS_008 見つかったとき：発見・停止・廃止・再交付を分ける', () => {
  it('関連する情報に出し、全員の「いま」にしない。選んだ物の案内だけを出す', () => {
    const o = out({ ...base, 'Q-lost-items': ['mynumber_card'] });
    const f = view(o, 'lost-found-later');
    expect(f.section).toBe('info'); // v0.5.30：もしものときの案内は関連する情報;
    const t = methodText(o, 'lost-found-later').join();
    expect(t).toContain('一時停止を解除');
    expect(t).not.toContain('在留カード');
  });
  it('在留カード：再交付のあとで見つけたら14日以内に返納。見つけただけで使えるとしない', () => {
    const o = out({ ...base, 'Q-lost-items': ['zairyu_card'] });
    expect(methodText(o, 'lost-found-later').join()).toContain('14日以内');
    expect(view(o, 'lost-found-later').card.summary.ja.replace(/\{([^|}]+)\|[^}]+\}/g, '$1')).toContain('すぐ使えるとは限りません');
  });
});

describe('INT-006・INT-007', () => {
  it('マイナンバーカード：特急の30日は起算点が2つあると示し、期限の日を作らない', () => {
    const c = data.cards.find((x) => x.id === 'lost-mynumber-reissue')!;
    expect(c.deadline).toBeNull();
    const t = c.methods!.map((m) => m.text.ja).join().replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
    expect(t).toContain('なくした日から／紛失届を出した日から');
  });
  it('在留カード：16歳未満は同居の親族、写真は1歳の基準、特別永住者は区役所', () => {
    const t = data.cards.find((x) => x.id === 'lost-zairyu-reissue')!.alternatives!.map((a) => a.text.ja).join().replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
    expect(t).toContain('16歳未満');
    expect(t).toContain('1歳未満'); // LOSS-007（作者 11/6）：「写真は基本要る。1歳未満のこどもは要らない」の書き方
    expect(t).toContain('特別永住者証明書');
  });
});
}

/* ───── 11/8 kaizen（docs/kaizen/saifu.md 5章）：答えの組み合わせごとに、どの段に何が出るか ───── */
describe('答えの組み合わせ（kaizen 5章の20の場面）', () => {
  const run2 = (answers: Record<string, Value>, plan: Record<string, PlanRecord> = {}) =>
    run(data, { answers, objects: {}, plan, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
  const v2 = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
  const mt = (o: ReturnType<typeof run>, id: string) => v2(o, id).methods.map((m) => m.method.text.ja.replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1')).join();
  /** 段ごとに出るカード（対象外を除く） */
  const map = (o: ReturnType<typeof run>) => Object.fromEntries(phaseViews(ev, o).map((p) => [p.id, p.cards.map((c) => c.card.id)]));
  const P = { 'Q-lost-place': 'outside', 'Q-police-reported': 'not_yet' } as const;
  const FOUND = ['lost-found-later', 'lost-no-id-consult'];
  const cases: [string, Record<string, Value>, Record<string, string[]>][] = [
    ['1 キャッシュカードだけ', { ...P, 'Q-lost-items': ['cash_card'] }, { now: ['lost-card-stop'], search: ['lost-police-report'], reissue: ['bank-card-reissue'], found: FOUND }],
    ['2 クレジットカードだけ', { ...P, 'Q-lost-items': ['credit_card'] }, { now: ['lost-card-stop'], search: ['lost-police-report'], reissue: ['lost-credit-reissue'], found: FOUND }],
    ['3 両方のカード', { ...P, 'Q-lost-items': ['cash_card', 'credit_card'] }, { now: ['lost-card-stop'], search: ['lost-police-report'], reissue: ['bank-card-reissue', 'lost-credit-reissue'], found: FOUND }],
    ['4 在留カードだけ', { ...P, 'Q-lost-items': ['zairyu_card'] }, { search: ['lost-police-report-zairyu'], reissue: ['lost-zairyu-reissue'], found: FOUND }],
    ['5 マイナンバーカードだけ', { ...P, 'Q-lost-items': ['mynumber_card'] }, { now: ['lost-mynumber-stop'], search: ['lost-police-report'], reissue: ['lost-mynumber-reissue'], found: FOUND }],
    ['6 運転免許証だけ', { ...P, 'Q-lost-items': ['license'] }, { search: ['lost-police-report'], reissue: ['lost-license-reissue'], found: FOUND }],
    ['7 国民健康保険の資格確認書', { ...P, 'Q-lost-items': ['health_insurance'], 'Q-lost-hoken-type': 'kokuho' }, { search: ['lost-police-report'], reissue: ['lost-hoken-reissue'], found: FOUND }],
    ['8 勤務先の健康保険', { ...P, 'Q-lost-items': ['health_insurance'], 'Q-lost-hoken-type': 'employer' }, { search: ['lost-police-report'], reissue: ['lost-hoken-reissue'], found: FOUND }],
    ['9 日本のパスポート', { ...P, 'Q-lost-items': ['passport'], 'Q-passport-country': 'japan' }, { search: ['lost-police-report'], reissue: ['lost-passport-jp'], found: FOUND }],
    ['10 外国のパスポート', { ...P, 'Q-lost-items': ['passport'], 'Q-passport-country': 'other_country' }, { search: ['lost-police-report'], reissue: ['lost-passport-foreign'], found: FOUND }],
    ['11 在留カード＋外国のパスポート', { ...P, 'Q-lost-items': ['zairyu_card', 'passport'], 'Q-passport-country': 'other_country' }, { search: ['lost-police-report-zairyu'], reissue: ['lost-zairyu-reissue', 'lost-passport-foreign'], found: FOUND }],
    ['12 複数の身分証', { ...P, 'Q-lost-items': ['zairyu_card', 'mynumber_card', 'license'] }, { now: ['lost-mynumber-stop'], search: ['lost-police-report-zairyu'], reissue: ['lost-zairyu-reissue', 'lost-mynumber-reissue', 'lost-license-reissue'], found: FOUND }],
    ['13 中身が不明', { ...P, 'Q-lost-items': ['unsure'] }, { now: ['lost-unsure-check'], search: ['lost-police-report'], found: FOUND }],
    ['14 一部は判明・一部は不明', { ...P, 'Q-lost-items': ['cash_card', 'unsure'] }, { now: ['lost-card-stop', 'lost-unsure-check'], search: ['lost-police-report'], reissue: ['bank-card-reissue'], found: FOUND }],
    ['15 警察へ届出済み', { 'Q-lost-place': 'outside', 'Q-police-reported': 'yes', 'Q-lost-items': ['zairyu_card'] }, { search: ['lost-police-report-zairyu'], reissue: ['lost-zairyu-reissue'], found: FOUND }],
    ['16 オンライン届出の受理待ち', { 'Q-lost-place': 'outside', 'Q-police-reported': 'online_waiting', 'Q-lost-items': ['zairyu_card'] }, { search: ['lost-police-report-zairyu'], reissue: ['lost-zairyu-reissue'], found: FOUND }],
    ['17 自宅内で紛失', { 'Q-lost-place': 'home', 'Q-lost-items': ['cash_card', 'zairyu_card'] }, { now: ['lost-card-stop'], search: ['lost-search-home'], reissue: ['lost-zairyu-reissue', 'bank-card-reissue'], found: FOUND }],
    ['18 電車や店舗で紛失', { 'Q-lost-place': 'facility', 'Q-police-reported': 'not_yet', 'Q-lost-items': ['cash_card'] }, { now: ['lost-card-stop'], search: ['lost-police-report', 'lost-facility-ask'], reissue: ['bank-card-reissue'], found: FOUND }],
    ['19 盗難の可能性', { 'Q-lost-place': 'stolen', 'Q-police-reported': 'not_yet', 'Q-lost-items': ['credit_card'] }, { now: ['lost-card-stop'], search: ['lost-police-report'], reissue: ['lost-credit-reissue'], found: FOUND }],
  ];
  for (const [name, answers, want] of cases) {
    it(name, () => {
      const o = run2(answers);
      expect(map(o)).toEqual(want);
      // どの手続きも開ける（止めない）：要確認・前に要ることがあっても段に出る。「その他」の段は無い
      expect(phaseViews(ev, o).some((p) => p.id === 'other')).toBe(false);
      // 情報だけの案内は記録しない（チェックボックスを出さない）
      for (const id of FOUND) expect(tracked(v2(o, id)), id).toBe(false);
    });
  }
  it('20 見つかった：選んだ物の案内だけ（マイナンバーの解除・在留カードの返納・カードの再使用・日本の旅券・警察の落とし物）。重ねて上に出さない', () => {
    const o = run2({ ...P, 'Q-lost-items': ['cash_card', 'mynumber_card', 'zairyu_card', 'passport'], 'Q-passport-country': 'japan' });
    const t = mt(o, 'lost-found-later');
    for (const w of ['一時停止を解除', '廃止手続き', '古いカードを入管に返します', 'また使えるか', '穴あけ', '3か月間']) expect(t, w).toContain(w);
    const home = mt(run2({ 'Q-lost-place': 'home', 'Q-lost-items': ['license'] }), 'lost-found-later');
    expect(home).not.toContain('3か月間');
    expect(home).not.toContain('一時停止を解除');
    expect(ev.phases!.some((p) => p.pin)).toBe(false);
    // マイナンバーの一時停止のカードには、見つかったときの解除を重ねて書かない
    expect(mt(o, 'lost-mynumber-stop')).not.toContain('一時停止の解除');
  });
  it('健康保険：種類は保険の書類を選んだ人だけに聞く。種類で方法が変わる。マイナ保険証と区別する', () => {
    expect(run2({ ...P, 'Q-lost-items': ['cash_card'] }).upfront.map((q) => q.id)).not.toContain('Q-lost-hoken-type');
    expect(run2({ ...P, 'Q-lost-items': ['health_insurance'] }).upfront.map((q) => q.id)).toEqual(['Q-lost-hoken-type']);
    const emp = mt(run2({ ...P, 'Q-lost-items': ['health_insurance'], 'Q-lost-hoken-type': 'employer' }), 'lost-hoken-reissue');
    expect(emp).toContain('勤務先か保険者');
    expect(emp).not.toContain('電子申請');
    const kok = mt(run2({ ...P, 'Q-lost-items': ['health_insurance'], 'Q-lost-hoken-type': 'kokuho' }), 'lost-hoken-reissue');
    expect(kok).toContain('電子申請');
    expect(kok).not.toContain('勤務先か保険者');
    expect(kok).toContain('マイナ保険証（マイナンバーカード）');
    expect(mt(run2({ ...P, 'Q-lost-items': ['health_insurance'], 'Q-lost-hoken-type': 'unsure' }), 'lost-hoken-reissue')).toContain('どの保険かわからないときは');
  });
  it('キャッシュカードとクレジットカード：停止は物ごとに記録し、再発行は別の項目で記録する。止めていなくても再発行は「いま」に出る', () => {
    const o = run2({ ...P, 'Q-lost-items': ['cash_card', 'credit_card'] }, { 'lost-card-stop': { card_id: 'lost-card-stop', status: 'preparing', parts: { cash_card: 'done' } } });
    expect(partViews(v2(o, 'lost-card-stop'), o.facts).map((p) => [p.id, p.track])).toEqual([['cash_card', 'done'], ['credit_card', 'todo']]);
    expect(['bank-card-reissue', 'lost-credit-reissue'].map((id) => tracked(v2(o, id)))).toEqual([true, true]);
    expect(['bank-card-reissue', 'lost-credit-reissue'].map((id) => v2(o, id).section)).toEqual(['today', 'today']);
  });
  it('銀行のカードの再発行は、ほかのできごと（銀行）では今までの条件（口座があるか）のまま', () => {
    const bank = data.events.find((e) => e.id === 'E-bank')!;
    const o = run(data, { answers: { 'Q-lost-items': ['cash_card'] }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: bank });
    const c = o.cards.find((x) => x.card.id === 'bank-card-reissue');
    if (c) expect(c.reasonFacts).not.toContain('lost_items');
  });
  it('答えを変えると出る物も変わる：場所を家の中から外に変えると、警察の届と「届けたか」の質問が出る', () => {
    const a = { 'Q-lost-items': ['cash_card'], 'Q-lost-place': 'home' } as Record<string, Value>;
    expect(v2(run2(a), 'lost-police-report').state).toBe('excluded');
    expect(v2(run2({ ...a, 'Q-lost-place': 'outside' }), 'lost-police-report').state).toBe('shown');
    expect(run2({ ...a, 'Q-lost-place': 'outside' }).upfront.map((q) => q.id)).toEqual(['Q-police-reported']);
  });
  it('3つの表示レベルの文がそろっている（新しい質問・カード）', () => {
    for (const id of ['lost-unsure-check', 'lost-search-home', 'lost-credit-reissue']) {
      const c = data.cards.find((x) => x.id === id)!;
      for (const t of [c.title, c.summary, ...(c.methods ?? []).map((m) => m.text)]) expect([t.ja, t.ja_easy, t.en].every((x) => !!x), id).toBe(true);
    }
    for (const id of ['Q-lost-place', 'Q-lost-hoken-type']) {
      const q = data.questions.find((x) => x.id === id)!;
      for (const o of q.options) expect([o.label.ja, o.label.ja_easy, o.label.en].every((x) => !!x), id).toBe(true);
    }
  });
});
