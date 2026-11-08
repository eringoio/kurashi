/* 財布の紛失（2026-11-08 に公開。元は drafts/data/E-lost-wallet.bundle.json v2）を、7つの場面で検証する（レビューの指摘 5）。
   本番と同じ表示（public：制度のルールは未確認のまま）で、「いまの1つ」を順にたどり、何がどの順に出るかを確かめる。
   - 本人の選択を言い直すルール（kind: selection）は、確認状態にかかわらず答えのとおり（SPEC 10.4 v0.4.8）
   - 前提の関係は、確認前でも並び順にだけ使う（SPEC 10.3 v0.4.8）
   保存と再開は tests/unit/lost-resume.test.ts。 */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { type EngineInput, run } from '../../src/core/engine';
import type { PlanRecord } from '../../src/core/entry';
import { nowStep } from '../../src/core/now';
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
    expect(sel.map((r) => r.id).sort()).toEqual(['R-lost-hoken', 'R-lost-license', 'R-lost-mynumber', 'R-lost-no-zairyu', 'R-lost-passport-foreign', 'R-lost-passport-jp', 'R-lost-payment', 'R-lost-reported', 'R-lost-reported-online', 'R-lost-wallet', 'R-lost-zairyu']);
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
    const r = walk({ 'Q-lost-items': ['cash_card', 'credit_card'], 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', 'すぐ:lost-card-stop', '質問:Q-police-reported', '日:lost-police-report', 'until']);
    expect(shown(r.final).sort()).toEqual(['lost-card-stop', 'lost-facility-ask', 'lost-found-later', 'lost-no-id-consult', 'lost-police-report']);
  });

  it('B 在留カードだけ：警察の日 → 在留カードの再交付の日（警察の後）。国籍は聞かない', () => {
    const r = walk({ 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-police-reported', '日:lost-police-report-zairyu', '日:lost-zairyu-reissue', 'until']);
    expect(r.steps.some((s) => /country|nationality/.test(s))).toBe(false);
    expect(shown(r.final).sort()).toEqual(['lost-facility-ask', 'lost-found-later', 'lost-no-id-consult', 'lost-police-report-zairyu', 'lost-zairyu-reissue']);
    // 在留カードの再交付の注記：先に警察に届けて受理番号を確かめる
    const z = view(out(r.answers, {}), 'lost-zairyu-reissue');
    expect(z.notes.map((n) => n.relation.id)).toContain('rel-police-before-zairyu-reissue');
  });

  it('C 外国旅券だけ：発行国を聞く → 警察 → 大使館・領事館。日本の旅券・在留カードは出ない', () => {
    const r = walk({ 'Q-lost-items': ['passport'], 'Q-passport-country': 'other_country', 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-passport-country', '質問:Q-police-reported', '日:lost-police-report', '日:lost-passport-foreign', 'until']);
    expect(view(r.final, 'lost-passport-jp').state).toBe('excluded');
    expect(view(r.final, 'lost-zairyu-reissue').state).toBe('excluded');
  });

  it('D 在留カード＋外国旅券：警察 → 大使館 → 在留カード（警察の届がまだ済んでいないので、前提のある在留カードは後）', () => {
    // 並び順：前提の段（在留カードは「先に警察」が残る）→ obligation。大使館には今のデータで前提が無い（調査C で見直す）
    const r = walk({ 'Q-lost-items': ['zairyu_card', 'passport'], 'Q-passport-country': 'other_country', 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-passport-country', '質問:Q-police-reported', '日:lost-police-report-zairyu', '日:lost-passport-foreign', '日:lost-zairyu-reissue', 'until']);
  });

  it('E 日本旅券：発行国＝日本 → 警察 → 愛知県の旅券窓口。外国旅券は出ない', () => {
    const r = walk({ 'Q-lost-items': ['passport'], 'Q-passport-country': 'japan', 'Q-police-reported': 'not_yet' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-passport-country', '質問:Q-police-reported', '日:lost-police-report', '日:lost-passport-jp', 'until']);
    expect(view(r.final, 'lost-passport-foreign').state).toBe('excluded');
  });

  it('F 不明：「よくわからない」だけ → 各手続きは対象外にせず「窓口で確認」。選ばなかった物と区別する', () => {
    const o = out({ 'Q-lost-items': ['unknown'], 'Q-police-reported': 'not_yet' });
    const unsure = ['lost-card-stop', 'lost-mynumber-stop', 'lost-zairyu-reissue', 'lost-mynumber-reissue', 'lost-license-reissue', 'lost-hoken-reissue'];
    for (const id of unsure) expect(view(o, id).state, id).toBe('check_at_office');
    // 発行国を聞いていないパスポートも、対象外にしない
    expect(view(o, 'lost-passport-jp').state).not.toBe('excluded');
    // 対照：キャッシュカードだけを選んだ（ほかは選ばなかった）なら対象外
    const picked = out({ 'Q-lost-items': ['cash_card'], 'Q-police-reported': 'not_yet' });
    expect(view(picked, 'lost-zairyu-reissue').state).toBe('excluded');
    // 発行国が「わからない」：日本・外国のどちらの旅券の手続きも「窓口で確認」
    const pc = out({ 'Q-lost-items': ['passport'], 'Q-passport-country': 'unknown', 'Q-police-reported': 'not_yet' });
    expect([view(pc, 'lost-passport-jp').state, view(pc, 'lost-passport-foreign').state]).toEqual(['check_at_office', 'check_at_office']);
  });

  it('F2 不明のときも、カードの停止は「いますぐ」で先に出し、日を聞かない（電話・アプリで止める）', () => {
    const o = out({ 'Q-lost-items': ['unknown'] });
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'urgent', view: { card: { id: 'lost-card-stop' } } });
    expect(view(o, 'lost-card-stop').dayRule.kind).toBe('no_day');
    expect(view(o, 'lost-mynumber-stop').dayRule.kind).toBe('no_day');
  });

  it('G すでに警察へ届けた：警察の届は「もうできた」。在留カードの再交付がすぐ次', () => {
    const r = walk({ 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'yes' });
    expect(r.steps).toEqual(['質問:Q-lost-items', '質問:Q-police-reported', '日:lost-zairyu-reissue', 'until']);
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

describe('確認済みの見本（verified）：前提の関係が区分けも変える', () => {
  it('警察にまだ届けていないとき、在留カードの再交付は「あとで（前提待ち）」。届けたら「いま」', () => {
    const a = { 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'not_yet' };
    expect(view(out(a, {}, 'verified'), 'lost-zairyu-reissue').sectionWhy).toBe('after_prereq');
    const done = out(a, { 'lost-police-report-zairyu': { card_id: 'lost-police-report-zairyu', status: 'done' } }, 'verified');
    expect(view(done, 'lost-zairyu-reissue').section).toBe('today');
  });
  it('申請しただけ（submitted）では、警察の届を済んだにしない', () => {
    const o = out({ 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'not_yet' }, { 'lost-police-report-zairyu': { card_id: 'lost-police-report-zairyu', status: 'submitted' } }, 'verified');
    expect(view(o, 'lost-zairyu-reissue').section).toBe('later');
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
const base = { 'Q-police-reported': 'not_yet' };

describe('データ', () => {
  it('型と参照の検査を通る。入口の質問は4つまで。すべて needs_check', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.questions.length).toBeLessThanOrEqual(4);
    expect(mine()).not.toContain('"verified"');
  });
});

describe('INT-004 選んだ・わからない・未回答を分ける（いまの三値の規則のまま）', () => {
  it('カードだけを選んだ：選ばなかった物は対象外（F）', () => {
    const o = out({ ...base, 'Q-lost-items': ['cash_card'] });
    expect(view(o, 'lost-zairyu-reissue').state).toBe('excluded');
  });
  it('カード＋「わからない」：選ばなかった物は対象外にせず「窓口で確認」（U）', () => {
    const o = out({ ...base, 'Q-lost-items': ['cash_card', 'unknown'] });
    expect(view(o, 'lost-card-stop').state).toBe('shown');
    expect(view(o, 'lost-zairyu-reissue').state).toBe('check_at_office');
    expect(view(o, 'lost-zairyu-reissue').cause).toBe('unknown');
  });
  it('中身の質問に未回答：対象外にしない。まず中身を聞く', () => {
    const o = out({});
    expect(view(o, 'lost-zairyu-reissue').state).not.toBe('excluded');
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'upfront', q: { id: 'Q-lost-items' } });
  });
  it('財布をなくしたが中身はわからない（「わからない」だけ）：選択完了にしない', () => {
    const o = out({ ...base, 'Q-lost-items': ['unknown'] });
    for (const id of ['lost-card-stop', 'lost-zairyu-reissue', 'lost-mynumber-reissue']) expect(view(o, id).state, id).toBe('check_at_office');
  });
});

describe('なくした場所の質問は無くなった（K-15）／在留カードの遺失届は別のカード', () => {
  it('質問・場所のルールが無い。施設への問い合わせは、いつでも出る（警察・停止と並行。順番を作らない）', () => {
    expect(data.questions.some((q) => q.id === 'Q-lost-where' || q.fact === 'lost_where')).toBe(false);
    expect([...data.rules.keys()].filter((id) => id.startsWith('R-lost-where'))).toEqual([]);
    expect(ev.questions).not.toContain('Q-lost-where');
    const o = out({ ...base, 'Q-lost-items': ['cash_card'] });
    const f = view(o, 'lost-facility-ask');
    expect(f.state).toBe('shown');
    expect(f.notes.map((n) => n.kind)).toContain('parallel');
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'urgent', view: { card: { id: 'lost-card-stop' } } });
    expect(data.relations.some((r) => (r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite') && (r.to === 'lost-facility-ask' || r.from === 'lost-facility-ask'))).toBe(false);
  });
  it('在留カードをなくした：遺失届（在留カード）が出る。必要（legal）。交番でも届けられる（v0.5.28：公式に合わせた）。受付番号と受理番号は別。ふつうの遺失届は出ない', () => {
    const o = out({ ...base, 'Q-lost-items': ['zairyu_card'] });
    const z = view(o, 'lost-police-report-zairyu');
    expect(z.state).toBe('shown');
    expect(z.card.obligation).toBe('legal');
    const plain = (x: unknown) => JSON.stringify(x).replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
    const all = plain([z.card.title, z.card.summary, z.card.lead, z.card.notices, z.card.where]);
    expect(all).not.toContain('交番ではなく');
    expect(plain(z.card.summary.ja)).toContain('交番');
    expect(plain(z.card.notices)).toContain('「受付番号」は、警察署の「受理番号」ではありません');
    // 証明書だけは警察署（交番では申請できない）
    expect(plain(z.card.summary.ja)).toContain('交番では申請できません');
    expect(z.card.evidence.status).toBe('needs_check');
    expect(view(o, 'lost-police-report').state).toBe('excluded');
    expect(shown(o)).not.toContain('lost-police-report');
  });
  it('在留カードをなくしていない：ふつうの遺失届（practical）が出る。在留カード用は出ない', () => {
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
});

describe('LOSS_008 見つかったとき：発見・停止・廃止・再交付を分ける', () => {
  it('「あとで」に出し、全員の「いま」にしない。選んだ物の案内だけを出す', () => {
    const o = out({ ...base, 'Q-lost-items': ['mynumber_card'] });
    const f = view(o, 'lost-found-later');
    expect(f.section).toBe('later');
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
