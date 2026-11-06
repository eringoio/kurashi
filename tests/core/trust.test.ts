/* AI照合済み（SPEC v0.4.9）：方法・行く所などは確認済みと同じ。義務・期限・対象者・前提の関係は U のまま */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { baseRaw, loadData, type RawData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { authorQueue, checkQuotes, collectEvidence } from '../../src/core/quotes';
import { AI_CHECK_COUNTS, canBeAiChecked, effectiveStatus } from '../../src/core/trust';
import { unverified } from '../../src/ui/patterns/map';
import type { Evidence } from '../../src/core/schema';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const BODY = '転入届は、住み始めてから14日以内に出してください。窓口は区役所の市民課です。';
const ai = (quote: string, verdict: 'agree' | 'disagree' = 'agree'): Evidence => ({
  source_ids: ['nagoya-juumin-todoke'], checked_at: '2026-11-05', status: 'ai_checked', quote,
  ai_check: { fetched_at: '2026-11-05', sha256: sha(BODY), verdict, ref: 'research/logs/x.md' },
});
const TODAY = '2026-11-05';
const A1 = { 'Q-origin': 'abroad', 'Q-role': 'student', 'Q-age-band': '20_59', 'Q-zairyu-back-address': 'no', 'Q-moved-in': 'yes', 'Q-insurance': 'none', 'Q-pension-type': 'none', 'Q-bank-account': false };
const OBJ = { 'zairyu-card': true, passport: true };
// アプリと同じく、引っ越し（E-move）のカードだけで判定する（11/6）
const moveOf = (d: ReturnType<typeof loadData>) => { const e = d.events.find((x) => x.id === 'E-move')!; return { ...e, questions: [], facts: [] }; };
const runWith = (raw: RawData) => { const d = loadData(raw); return run(d, { answers: A1, objects: OBJ, plan: {}, createdOn: TODAY, today: TODAY, event: moveOf(d) }); };

/** data の全ルールの根拠を ai_checked にした写し */
function allRulesAi(): RawData {
  const raw = structuredClone(baseRaw());
  for (const r of raw.rules.rules as { evidence: Evidence; kind?: string }[]) if (r.evidence.status === 'needs_check' && r.kind !== 'selection') r.evidence = ai('窓口は区役所の市民課です。');
  for (const r of raw.relations.relations as { evidence: Evidence }[]) if (r.evidence.status === 'needs_check') r.evidence = ai('窓口は区役所の市民課です。');
  return raw;
}

describe('欄ごとの扱い（1か所の表）', () => {
  // 期限・費用は AI チェックで値を出す（作者の決定 2026-11-06 A-8）
  it('方法・行く所・連絡先・リンク・持ち物の名前・説明・期限・費用は verified と同じ', () => {
    for (const k of ['place', 'method', 'contact', 'link', 'object_name', 'card_text', 'deadline', 'fee'] as const) expect(effectiveStatus({ status: 'ai_checked' }, k)).toBe('verified');
  });
  it('義務・対象者・前提の関係は U のまま', () => {
    for (const k of ['obligation', 'rule', 'prerequisite', 'relation'] as const) {
      expect(AI_CHECK_COUNTS[k]).toBe(false);
      expect(effectiveStatus({ status: 'ai_checked' }, k)).toBe('needs_check');
    }
  });
  it('ai_checked 以外は変えない', () => {
    for (const s of ['draft', 'needs_check', 'verified', 'outdated'] as const) expect(effectiveStatus({ status: s }, 'rule')).toBe(s);
  });
});

describe('ルールエンジン', () => {
  it('ルール・関係を ai_checked にしても、判定は変わらない（窓口で確認のまま）', () => {
    const before = run(loadData(), { answers: A1, objects: OBJ, plan: {}, createdOn: TODAY, today: TODAY, event: moveOf(loadData()) });
    const after = runWith(allRulesAi());
    expect(after.cards.map((c) => [c.card.id, c.state, c.section])).toEqual(before.cards.map((c) => [c.card.id, c.state, c.section]));
    expect(after.cards.filter((c) => c.state === 'check_at_office').length).toBeGreaterThan(0);
  });
  it('方法の根拠が ai_checked なら「要確認」の印は出ない。needs_check なら出る', () => {
    expect(unverified(ai('x'), 'public', 'method')).toBe(false);
    expect(unverified({ ...ai('x'), status: 'needs_check' }, 'public', 'method')).toBe(true);
    expect(unverified(ai('x'), 'public', 'deadline')).toBe(false);
    expect(unverified(ai('x'), 'public', 'obligation')).toBe(true);
  });
});

describe('AI照合済みにできる条件', () => {
  it('引用が本文にそのままあり、独立の照合が同じ結論なら OK', () => {
    expect(canBeAiChecked(ai('窓口は区役所の市民課です。'), BODY).ok).toBe(true);
  });
  it('引用が本文に無いときは ai_checked にできない', () => {
    const r = canBeAiChecked(ai('窓口は区役所の保険年金課です。'), BODY);
    expect(r.ok).toBe(false);
    expect(r.why.join()).toMatch(/本文にない/);
  });
  it('照合が食い違ったら ai_checked にできない。作者の一覧に出る', () => {
    expect(canBeAiChecked(ai('窓口は区役所の市民課です。', 'disagree'), BODY).ok).toBe(false);
    const q = authorQueue([{ where: 'x', kind: 'method', e: ai('a', 'disagree') }]);
    expect(q.disagree).toHaveLength(1);
  });
  it('check-quotes：本文が無い・ハッシュが違う・引用が無いときは誤り', () => {
    const items = [{ where: 'c.where', kind: 'place' as const, e: ai('窓口は区役所の市民課です。') }];
    expect(checkQuotes(items, () => BODY, sha)).toEqual([]);
    expect(checkQuotes(items, () => null, sha).join()).toMatch(/本文がない/);
    expect(checkQuotes(items, () => BODY + '変更', sha).join()).toMatch(/ハッシュ/);
    expect(checkQuotes([{ ...items[0], e: ai('ない文') }], () => BODY, sha).join()).toMatch(/本文にない/);
  });
  it('作者の一覧：ai_checked でも U のままの欄（ルール）だけが出る。期限は出ない（A-8）', () => {
    const q = authorQueue([{ where: 'a', kind: 'deadline', e: ai('x') }, { where: 'b', kind: 'method', e: ai('x') }, { where: 'c', kind: 'rule', e: ai('x') }]);
    expect(q.stays_u.map((x) => x.where)).toEqual(['c']);
  });
  it('読み込みの検査：ai_checked に引用か照合の記録が無ければ止める', () => {
    const raw = structuredClone(baseRaw());
    (raw.rules.rules[0] as { evidence: Evidence }).evidence = { source_ids: ['nagoya-juumin-todoke'], checked_at: '2026-11-05', status: 'ai_checked' };
    expect(() => loadData(raw)).toThrow(/ai_checked/);
  });
  // 11/6：市内の引っ越しの2枚を公開にしたので、data にも ai_checked がある。どれも引用と照合の記録を持つ（本文との一致は npm run check:quotes）
  it('data の根拠を全部集められる。ai_checked には引用と「同じ結論」の照合がある', () => {
    const items = collectEvidence(loadData());
    expect(items.length).toBeGreaterThan(40);
    for (const x of items.filter((y) => y.e.status === 'ai_checked')) {
      expect(x.e.quote, x.where).toBeTruthy();
      expect(x.e.ai_check?.verdict, x.where).toBe('agree');
    }
  });
});

describe('確認の期限を過ぎた根拠（12.3 の A2）', () => {
  it('確認済みでも 90 日を過ぎれば outdated の印。本アプリの定義は対象外', () => {
    const raw = structuredClone(baseRaw());
    const card = (raw.cards as { id: string; evidence: Evidence }[]).find((c) => c.id === 'nagoya-kokuho-kanyu')!;
    card.evidence = { ...card.evidence, status: 'verified', checked_at: '2026-01-01', verified_by: 'author', quote: 'x' };
    const out = runWith(raw);
    expect(out.cards.find((c) => c.card.id === 'nagoya-kokuho-kanyu')!.outdated).toBe(true);
    expect(out.cards.filter((c) => c.outdated).map((c) => c.card.id)).toEqual(['nagoya-kokuho-kanyu']);
  });
});
