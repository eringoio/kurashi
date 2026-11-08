/* 「あとで」の監査（SPEC v0.5.30・docs/LATER_AUDIT.md）。
   目的の手続き（goal）・関連する情報（info）・段の after・本人の「あとでする」（deferred）と、
   全13のできごとで「あとで」だけの行き止まりがないこと。 */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { nowStep } from '../../src/core/now';
import { checkPart, overviewReady, partViews, singleGoal } from '../../src/core/overview';
import type { Value } from '../../src/core/schema';

const data = loadData();
const T = '2026-11-08';
const E = (id: string) => data.events.find((e) => e.id === id)!;
const go = (id: string, answers: Record<string, Value> = {}, over: Partial<EngineInput> = {}) =>
  run(data, { answers, objects: {}, plan: {}, createdOn: T, today: T, mode: 'public', event: E(id), ...over });
const v = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
/** 入口の質問に、最初の（わからない以外の）答えで答えていく */
function answerAll(id: string, first: Record<string, Value>) {
  const a: Record<string, Value> = { ...first };
  let o = go(id, a);
  for (let i = 0; i < 10 && o.upfront.length; i++) {
    const q = o.upfront[0];
    const op = q.options.find((x) => x.value !== 'unknown')!;
    a[q.id] = q.multi ? [String(op.value)] : op.value;
    o = go(id, a);
  }
  return { a, o };
}

describe('運転免許：選んだ目的の手続きへ進む', () => {
  const GOALS: Record<string, string> = { new: 'license-shinki', switch: 'license-gaimen-kirikae', renew: 'license-koshin', change: 'license-kisai-henko', lost: 'license-saikofu' };
  for (const [goal, card] of Object.entries(GOALS)) {
    it(`${goal} → ${card}（目的。あとでにしない。中間の一覧を挟まない）`, () => {
      const o = go('E-license', { 'Q-license-goal': goal });
      const c = v(o, card);
      expect(c.section).toBe('today');
      expect(c.goal).toBe(true);
      const st = nowStep(o, T);
      expect(st.kind).toBe('goal');
      expect(singleGoal(o, st)?.card.id).toBe(card);
      expect(o.cards.filter((x) => x.section === 'later')).toEqual([]);
    });
  }
  it('国際運転免許証は関連する情報。外免切替の前提にしない', () => {
    const o = go('E-license', { 'Q-license-goal': 'switch' });
    expect(v(o, 'license-kokusai').section).toBe('info');
    expect(v(o, 'license-gaimen-kirikae').notes.some((n) => n.kind === 'legal_prereq' || n.kind === 'practical_prereq')).toBe(false);
  });
  it('更新・記載事項変更は法令の義務のまま（obligation を変えない）', () => {
    expect(data.cards.find((c) => c.id === 'license-koshin')!.obligation).toBe('legal');
    expect(data.cards.find((c) => c.id === 'license-kisai-henko')!.obligation).toBe('legal');
  });
});

describe('ファミリーシップ：手続きの画面へ直接', () => {
  it('入口で目的の手続きが1つだけ → その手続き', () => {
    const o = go('E-familyship');
    const st = nowStep(o, T);
    expect(singleGoal(o, st)?.card.id).toBe('marriage-familyship');
    expect(v(o, 'marriage-familyship').section).toBe('today');
  });
  it('済んだと記録したら、目的の画面へ送らない（もどる・再読み込みで同じところへ戻らない）', () => {
    const o = go('E-familyship', {}, { plan: { 'marriage-familyship': { card_id: 'marriage-familyship', status: 'done' } } });
    expect(singleGoal(o, nowStep(o, T))).toBeNull();
  });
});

describe('結婚：婚姻届を先に。結婚したあとの手続きは婚姻届のあと', () => {
  const KINDS = ['japanese_foreign', 'foreign_foreign', 'both_japanese', 'unknown'];
  for (const k of KINDS) {
    it(`${k}：婚姻届が目的（いま）。結婚したあとは「あとで（婚姻届のあと）」`, () => {
      const { o } = answerAll('E-marriage', { 'Q-marriage-kind': k });
      const todoke = v(o, 'marriage-konin-todoke');
      expect(todoke.section).toBe('today');
      expect(todoke.goal).toBe(true);
      const st = nowStep(o, T);
      expect(st.kind === 'goal' && st.view.card.id).toBe('marriage-konin-todoke');
      for (const id of E('E-marriage').phases!.find((p) => p.id === 'after')!.card_ids) {
        const c = v(o, id);
        if (c.state === 'excluded') continue;
        expect([c.section, c.sectionWhy, c.afterFrom], id).toEqual(['later', 'after_card', 'marriage-konin-todoke']);
      }
    });
  }
  it('婚姻届を済んだにしたら、当てはまる人だけ次の手続きが出る。選べる手続き（氏の変更）は必須にしない', () => {
    const { a } = answerAll('E-marriage', { 'Q-marriage-kind': 'japanese_foreign' });
    const o = go('E-marriage', a, { plan: { 'marriage-konin-todoke': { card_id: 'marriage-konin-todoke', status: 'done', planned_on: '2026-11-10' } } });
    expect(v(o, 'marriage-zairyu-shimei').section).toBe('today');
    expect(v(o, 'marriage-ujino-henkou').section).toBe('info');
    const f = go('E-marriage', { ...a, 'Q-marriage-kind': 'both_japanese' }, { plan: { 'marriage-konin-todoke': { card_id: 'marriage-konin-todoke', status: 'done' } } });
    expect(v(f, 'marriage-zairyu-shimei').state).toBe('excluded');
  });
  it('婚姻届の日を決めたら、結婚したあとの手続きはその日より前を選べない（日を混同しない）', () => {
    const { a } = answerAll('E-marriage', { 'Q-marriage-kind': 'japanese_foreign' });
    const o = go('E-marriage', a, { plan: { 'marriage-konin-todoke': { card_id: 'marriage-konin-todoke', status: 'todo', planned_on: '2026-11-20' } } });
    expect(v(o, 'marriage-zairyu-shimei').dayRule).toEqual({ kind: 'min', day: '2026-11-20', from: 'marriage-konin-todoke' });
  });
});

describe('住まい：総合の案内（全体の画面）', () => {
  it('入口の質問が無くても全体の画面。部屋の探し方が目的、公的住宅は選択肢（すぐ開ける）', () => {
    const o = go('E-house-search');
    expect(overviewReady(E('E-house-search'), {})).toBe(true);
    expect(v(o, 'housing-search').section).toBe('today');
    expect(v(o, 'housing-public').section).toBe('info');
    expect(v(o, 'housing-public').state).toBe('shown');
    expect(o.cards.filter((c) => c.section === 'later')).toEqual([]);
  });
  it('入居・退去は物ごとに記録できる（電気・ガス・水道・ネット・郵便・住所）', () => {
    for (const id of ['housing-move-in', 'housing-move-out']) {
      const parts = data.cards.find((c) => c.id === id)!.parts!.map((p) => p.id);
      for (const p of ['electricity', 'gas', 'water', 'internet', 'mail', 'address']) expect(parts, id).toContain(p);
    }
  });
  it('チェックリスト（v0.5.35・v0.5.36）：前に記録した done はチェック済み、対応中は消さない', () => {
    const plan = { 'housing-move-in': { card_id: 'housing-move-in', status: 'preparing' as const, parts: { water: 'done' as const, gas: 'preparing' as const } } };
    const c = v(go('E-house-search', {}, { plan }), 'housing-move-in');
    const parts = partViews(c, new Map());
    expect(parts.find((p) => p.id === 'water')!.track).toBe('done');
    // 電気をチェック：ほかの物の記録（ガスの preparing）はそのまま
    const next = checkPart(c, parts, 'electricity', true);
    expect(next.parts).toMatchObject({ water: 'done', gas: 'preparing', electricity: 'done' });
    expect(next.status).toBe('preparing');
    expect(checkPart(c, parts, 'water', false).parts!.water).toBe('todo');
  });
  it('入居・退去から、引っ越しの届け出のできごとへ（6つの場合。転出・転入・転居を分ける）', () => {
    const links = [...data.cards.find((c) => c.id === 'housing-move-in')!.event_links!, ...data.cards.find((c) => c.id === 'housing-move-out')!.event_links!];
    const pairs = new Set(links.map((l) => l.event + ':' + l.card_ids.join(',')));
    expect(pairs).toEqual(new Set([
      'E-move:nagoya-tennyu-juukyochi', 'E-move:move-out-notice,nagoya-tennyu-todoke',
      'E-move-within:move-within-tenkyo', 'E-move-within:move-within-tennyu',
      'E-move-out:move-out-city-tenshutsu', 'E-move-out:move-out-abroad-tenshutsu',
    ]));
    // 行き先のできごとに、その届け出がある
    for (const l of links) for (const c of l.card_ids) expect(E(l.event).card_ids, l.event).toContain(c);
  });
  it('水道は名古屋市上下水道局の公式の出典。ガス・電気・ネットは特定の会社を全員の契約先にしない', () => {
    const water = data.cards.find((c) => c.id === 'life-water')!;
    expect(water.links!.every((l) => l.url.startsWith('https://www.water.city.nagoya.jp/'))).toBe(true);
    for (const id of ['life-gas', 'life-electricity', 'life-internet']) {
      const t = JSON.stringify(data.cards.find((c) => c.id === id)!.summary.ja);
      expect(t).toContain('要');
      expect(t).not.toMatch(/中部電力|東邦ガスと契約/);
    }
    // needs_check を verified にしない
    for (const id of ['life-water', 'life-gas', 'life-electricity', 'life-internet']) expect(data.cards.find((c) => c.id === id)!.evidence.status).toBe('needs_check');
  });
});

describe('引っ越し・そのほか', () => {
  it('緊急の対応の順は変えない（財布：カードの停止が最初）', () => {
    const o = go('E-lost-wallet', { 'Q-lost-items': ['cash_card'], 'Q-police-reported': 'yes' });
    const st = nowStep(o, T);
    expect(st.kind === 'urgent' && st.view.card.id).toBe('lost-card-stop');
    // 見つかったときの案内は関連する情報（全員の「いま」にしない）
    expect(v(o, 'lost-found-later').section).toBe('info');
  });
  it('本当に後のこと・待つことは「あとで」「待つ」のまま', () => {
    const { o } = answerAll('E-move', { 'Q-origin': 'abroad' });
    expect(v(o, 'nenkin-at-20').section).toBe('later');
    const s = go('E-stay-renew', { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student', 'Q-mynumber-card': true });
    expect([v(s, 'zairyu-mynumber-extend').section, v(s, 'zairyu-mynumber-extend').sectionWhy]).toEqual(['later', 'after_prereq']);
    const w = go('E-stay-renew', { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student', 'Q-mynumber-card': true }, { plan: { 'zairyu-koshin': { card_id: 'zairyu-koshin', status: 'submitted' } } });
    expect(v(w, 'zairyu-koshin').section).toBe('wait');
  });
  it('本人の「あとでする」：自動の「あとで」と分け、次の一歩から外す。日を決めれば戻る', () => {
    const plan = { 'move-within-tenkyo': { card_id: 'move-within-tenkyo', status: 'todo' as const, deferred: true } };
    const o = go('E-move-within', { 'Q-ward-move': 'same_ward' }, { plan });
    expect([v(o, 'move-within-tenkyo').section, v(o, 'move-within-tenkyo').sectionWhy]).toEqual(['later', 'deferred']);
    const st = nowStep(o, T);
    expect('view' in st && st.view.card.id).not.toBe('move-within-tenkyo');
    const back = go('E-move-within', { 'Q-ward-move': 'same_ward' }, { plan: { 'move-within-tenkyo': { ...plan['move-within-tenkyo'], deferred: false } } });
    expect(v(back, 'move-within-tenkyo').section).toBe('today');
  });
  it('法令の期限・対象者の判定は変えない（同じ区：転居届／別の区：転入届）', () => {
    expect(v(go('E-move-within', { 'Q-ward-move': 'same_ward' }), 'move-within-tennyu').state).toBe('excluded');
    expect(v(go('E-move-within', { 'Q-ward-move': 'other_ward' }), 'move-within-tennyu').section).toBe('today');
    expect(v(go('E-move-within', { 'Q-ward-move': 'other_ward' }), 'move-within-tenkyo').state).toBe('excluded');
  });
  it('型と参照の検査を通る', () => {
    expect(checkRefs(data)).toEqual([]);
  });
});

describe('全13のできごと：「あとで」だけの行き止まりがない', () => {
  expect(data.events.length).toBe(13);
  for (const ev of data.events) {
    const q0 = ev.questions[0] ? data.questions.find((q) => q.id === ev.questions[0])! : null;
    for (const opt of q0 ? q0.options.map((x) => x.value) : [null]) {
      it(`${ev.id} ${q0?.id ?? ''}=${String(opt)}`, () => {
        const { o } = answerAll(ev.id, q0 && opt !== null ? { [q0.id]: q0.multi ? [String(opt)] : opt } : {});
        if (o.scope === 'F') return;
        const visible = o.cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope');
        // 「あとで」には、いつも理由（〇〇のあと・前にすること・住み始めてから・将来・本人が選んだ）がある
        for (const c of visible.filter((x) => x.section === 'later')) {
          expect(c.sectionWhy !== null || c.card.awareness_type === 'upcoming', c.card.id).toBe(true);
        }
        // 日を決める・答える・待つ手続きがあるのに idle にならない。日を聞かない案内だけのときは、入口が一覧（いま の案内が上）を出す（EventEntry の onlyGuides）
        const tasks = visible.filter((c) => ((c.section === 'today' || c.section === 'check') && (c.dayRule.kind !== 'no_day' || c.goal)) || c.section === 'wait' || c.state === 'ask');
        if (!tasks.length) expect(visible.filter((c) => c.section === 'later' && c.sectionWhy !== 'deferred').length, 'あとで だけの一覧').toBeLessThan(Math.max(1, visible.length));
        if (tasks.length) expect(nowStep(o, T).kind, JSON.stringify(tasks.map((c) => c.card.id))).not.toBe('idle');
      });
    }
  }
});
