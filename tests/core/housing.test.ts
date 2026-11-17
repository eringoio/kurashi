/* 住まい探し（11/7 C-7 で公開のデータへ移した）。民間の契約。日を聞かない案内（kind: guide）7枚。
   制度の正しさや作者の承認の代わりにはならない。 */
import { describe, expect, it } from 'vitest';
import { isBulk, verifiedNotBulk } from './bulk';
import { baseRaw, checkRefs, loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';
import { handoffPlan } from '../../src/core/handoff';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-house-search')!;
/** このできごとの分（元のまとまりと同じ範囲。11/7 C-7） */
const json = { events: [ev], cards: data.cards.filter((c) => ev.card_ids.includes(c.id)), rules: [...data.rules.values()].filter((r) => r.id.startsWith('R-house')), relations: data.relations.filter((r) => r.id.startsWith('rel-house')) };
const TODAY = '2026-11-05';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const out = (event = ev) => run(data, { answers: {}, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event });
const card = (id: string) => data.cards.find((c) => c.id === id)!;
const IDS = ['housing-search', 'housing-contract-check', 'housing-initial-costs', 'housing-guarantor', 'housing-move-in', 'housing-move-out', 'housing-public'];
/** 電気・ガス・水道・インターネット（v0.5.30。引っ越しのできごとからも使う） */
const LIFE = ['life-electricity', 'life-gas', 'life-water', 'life-internet'];

describe('住まい探し（下書き）', () => {
  it('型と参照の検査を通る。確認済み（verified）は作者の答え（2026-11-07）だけ', () => {
    expect(checkRefs(data)).toEqual([]);
    const all = JSON.stringify(json);
    expect(verifiedNotBulk(all).length).toBe((all.match(/"verified_by":"author 2026-11-07/g) ?? []).length);
    expect(json.cards.every((c) => c.evidence.status === 'needs_check' || isBulk(c.evidence))).toBe(true);
  });
  it('入口のメニュー（menu 8・group housing・built）と7枚', () => {
    expect(ev).toMatchObject({ menu: 8, group: 'housing', status: 'built' });
    expect(ev.card_ids).toEqual([...IDS, ...LIFE]);
    expect(ev.questions).toEqual([]);
  });
  it('3表示レベルの文がそろい、電話番号を書いていない', () => {
    expect(JSON.stringify(json)).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
    for (const c of data.cards.filter((x) => IDS.includes(x.id))) {
      for (const l of ['ja', 'ja_easy', 'en'] as const) expect(c.title[l] && c.summary[l] && c.where.text[l], c.id + l).toBeTruthy();
      expect(c.kind).toBe('guide');
    }
  });
  it('当てはまる：質問せず、7枚ともそのまま出る。日は聞かない', () => {
    const o = out();
    expect(o.scope).toBe('T');
    expect(o.upfront).toEqual([]);
    expect(o.cards.map((c) => c.card.id).sort()).toEqual([...IDS, ...LIFE].sort());
    expect(o.cards.every((c) => c.state === 'shown')).toBe(true);
    expect(o.cards.every((c) => c.dayRule.kind === 'no_day')).toBe(true);
    // v0.5.30：部屋の探し方は目的の手続き（いま）。公的住宅・費用・保証・契約・ライフラインは関連する情報（あとでにしない）
    const st = nowStep(o, TODAY);
    expect(st.kind === 'goal' && st.view.card.id).toBe('housing-search');
    expect(o.cards.filter((c) => c.section === 'later')).toEqual([]);
    expect(o.cards.find((c) => c.card.id === 'housing-public')!.section).toBe('info');
  });
  it('当てはまらない：ほかのイベントの経路には、住まいのカードが出ない', () => {
    const move = data.events.find((e) => e.id === 'E-move')!;
    const o = out(move);
    expect(o.cards.map((c) => c.card.id).filter((id) => IDS.includes(id))).toEqual([]);
  });
  it('当てはまらない：住まいのイベントの事実でなければ、7枚は「対象外」', () => {
    const other = { ...ev, facts: [{ fact: 'event', value: 'bank' }] };
    const o = out(other);
    expect(o.cards.filter((c) => IDS.includes(c.card.id)).every((c) => c.state === 'excluded')).toBe(true);
    expect(o.cards.filter((c) => c.state === 'shown')).toEqual([]);
  });
  it('境目：保証料は「会社によって違う」で、重なる2つの例を書く（固定の額にしない）', () => {
    const t = plain(card('housing-guarantor').summary.ja);
    expect(t).toContain('会社によって違います。国土交通省の冊子の例は');
    expect(t).toContain('35〜50%');
    expect(t).toContain('半月分');
    expect(card('housing-guarantor').methods!.some((m) => m.evidence.status === 'needs_check' && plain(m.text.ja).includes('保証料'))).toBe(true);
  });
  it('境目：初期費用は目安（4〜7か月分）で、費用の根拠は needs_check', () => {
    const c = card('housing-initial-costs');
    expect(plain(c.summary.ja)).toContain('4〜7か月分が目安');
    expect(c.evidence.status).toBe('needs_check');
    expect(c.where.evidence.status).toBe('needs_check');
  });
  it('境目：国の登録保証会社の一覧を案内し、その欄だけ ai_checked（引用と照合の記録つき）', () => {
    const c = card('housing-guarantor');
    expect(plain(c.where.text.ja)).toContain('登録家賃債務保証業者一覧');
    expect(c.where.evidence).toMatchObject({ status: 'ai_checked', ai_check: { verdict: 'agree' } });
    expect(c.where.evidence.quote).toBeTruthy();
    expect(c.evidence.source_ids).toContain('B-mlit-hosho-ichiran');
  });
  it('入居は、公開カード nagoya-tennyu-todoke へつなぐ（関係だけ。data/ は変えない）', () => {
    const r = data.relations.find((x) => x.id === 'rel-house-movein-tennyu')!;
    expect(r).toMatchObject({ type: 'related', from: 'housing-move-in', to: 'nagoya-tennyu-todoke' });
    expect(r.evidence.status).toBe('needs_check');
    expect(JSON.stringify(baseRaw().relations)).toContain('rel-house-'); // 11/7 C-7：公開へ移した
    const note = out().cards.find((c) => c.card.id === 'housing-move-in')!.notes.map((n) => n.kind);
    expect(note).toContain('related');
  });
  it('市営住宅等：留学生かどうかは条件ではない（単身の留学生を一律に除外しない）', () => {
    const t = plain(card('housing-public').summary.ja);
    expect(t).toContain('留学生かどうかは、条件ではありません');
    expect(t).not.toContain('単身の留学生は、ふつう申し込めません');
    expect(card('housing-public').evidence.status).toBe('needs_check');
  });
  it('各カードに、確認先（要確認）を付ける', () => {
    for (const id of IDS.filter((x) => x !== 'housing-public')) expect(plain(card(id).summary.ja), id).toContain('契約書を見て、不動産会社に確認します（要確認）');
    expect(plain(card('housing-public').summary.ja)).toContain('窓口で確認してください（要確認）');
  });
  it('期限・費用・カード全体の根拠は needs_check のまま', () => {
    for (const c of data.cards.filter((x) => IDS.includes(x.id))) {
      expect(c.evidence.status).toBe('needs_check');
      expect(c.deadline ? c.deadline.evidence.status : 'needs_check').toBe('needs_check');
    }
  });
});

/* docs/kaizen/sumai.md（2026-11-08）：入居・退去は任意のチェックリスト、引っ越しの種類の引き継ぎ、文の直し */
describe('住まい：kaizen sumai', () => {
  const v = (o: ReturnType<typeof out>, id: string) => o.cards.find((c) => c.card.id === id)!;
  const withPlan = (plan: Parameters<typeof run>[1]['plan']) => run(data, { answers: {}, objects: {}, plan, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
  it('1：入居・退去は「いま」でも「あとで」でもなく、段の中の任意のチェックリスト。途中までチェックしても「いま」にしない', () => {
    for (const id of ['housing-move-in', 'housing-move-out']) expect(v(out(), id).section, id).toBe('info');
    const o = withPlan({ 'housing-move-in': { card_id: 'housing-move-in', status: 'preparing', parts: { water: 'done' } } });
    expect(v(o, 'housing-move-in').section).toBe('info');
    const st = nowStep(o, TODAY);
    expect(st.kind === 'goal' && st.view.card.id).toBe('housing-search');
    // 全部チェックしたら済んだ（記録は消さない）
    const all = Object.fromEntries(card('housing-move-out').parts!.map((p) => [p.id, 'done' as const]));
    expect(v(withPlan({ 'housing-move-out': { card_id: 'housing-move-out', status: 'done', parts: all } }), 'housing-move-out').section).toBe('done');
    // 段には残る（いつでも開ける）
    expect(ev.phases!.find((p) => p.id === 'move_in')!.card_ids).toContain('housing-move-in');
    expect(ev.phases!.find((p) => p.id === 'move_out')!.card_ids).toContain('housing-move-out');
  });
  it('5：住所の届出の6つのリンクは、行き先の入口の質問の答えを持つ（既存の質問・選択肢）', () => {
    const links = ['housing-move-in', 'housing-move-out'].flatMap((id) => card(id).event_links!).filter((l) => l.answers);
    expect(new Set(links.map((l) => l.event + ':' + JSON.stringify(l.answers)))).toEqual(new Set([
      'E-move:{"Q-origin":"abroad"}', 'E-move:{"Q-origin":"other_city"}',
      'E-move-within:{"Q-ward-move":"same_ward"}', 'E-move-within:{"Q-ward-move":"other_ward"}',
      'E-move-out:{"Q-move-dest":"other_city"}', 'E-move-out:{"Q-move-dest":"abroad"}',
    ]));
  });
  it('5：引き継ぐ答えは、まだ答えていない質問だけに入れる。前の答えは書き換えない。入口に無い質問・無い選択肢は使わない', () => {
    const within = data.events.find((e) => e.id === 'E-move-within')!;
    const qs = data.questions;
    expect(handoffPlan(within.questions, qs, {}, { 'Q-ward-move': 'same_ward' }).map((x) => [x.q.id, x.value, x.kind])).toEqual([['Q-ward-move', 'same_ward', 'apply']]);
    expect(handoffPlan(within.questions, qs, { 'Q-ward-move': 'other_ward' }, { 'Q-ward-move': 'same_ward' }).map((x) => [x.value, x.kind])).toEqual([['other_ward', 'kept']]);
    expect(handoffPlan(within.questions, qs, { 'Q-ward-move': 'same_ward' }, { 'Q-ward-move': 'same_ward' }).map((x) => x.kind)).toEqual(['same']);
    expect(handoffPlan(within.questions, qs, {}, { 'Q-ward-move': 'moon', 'Q-move-dest': 'abroad' })).toEqual([]);
    // 引き継いだ答えで、質問が残らず、その届け出が出る（同じ区：転居届）
    const o = run(data, { answers: { 'Q-ward-move': 'same_ward' }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: within });
    expect(o.upfront).toEqual([]);
    expect(o.cards.find((c) => c.card.id === 'move-within-tenkyo')!.state).toBe('shown');
  });
  it('3・7：部屋探しで、全員に在留カード・パスポートを求めない。入居までの日数を言い切らない', () => {
    for (const l of ['ja', 'ja_easy', 'en'] as const) {
      expect(plain(card('housing-search').summary[l]), l).not.toMatch(/在留カードかパスポート|residence card or passport|1〜2週間|1 to 2 weeks/);
    }
    expect(plain(card('housing-search').summary.ja)).toContain('物件や審査の状況によって違います');
  });
  it('4：電気は契約する会社の案内に従う。はがきは一つの例（入居の案内と同じ説明）', () => {
    for (const id of ['life-electricity', 'housing-move-in']) {
      const t = plain(JSON.stringify(card(id)));
      expect(t, id).toContain('一つの例');
      expect(t, id).not.toContain('ブレーカーについているはがきに');
    }
    expect(card('life-electricity').evidence.status).toBe('needs_check');
  });
  it('6：県営住宅と UR 賃貸住宅は、市営住宅と別の項目で、それぞれの公式の案内へ', () => {
    const c = card('housing-public');
    expect(plain(c.summary.ja)).toContain('それぞれ別の制度');
    const m = c.methods!.map((x) => plain(x.text.ja));
    expect(m.some((t) => t.startsWith('愛知県営住宅（愛知県の制度）'))).toBe(true);
    expect(m.some((t) => t.startsWith('UR賃貸住宅（UR都市機構）') && t.includes('以上'))).toBe(true);
    expect(c.links!.map((l) => l.source_id)).toEqual(expect.arrayContaining(['aichi-kousha-about', 'ur-requirements']));
  });
});
