/* 仕事・アルバイト（公開のデータ。11/7 C-1 で drafts/data/E-job.bundle.json から data/ へ移した）。留学・家族滞在は、働く前に資格外活動許可。永住者・定住者などは対象外。
// B-13（11/6）：在留資格は共通の質問 Q-zairyu-status。旧 Q-job-status の free→permanent、other→work
   最低賃金は日付つきの事実（2026年10月1日から愛知県 1,195円）。すべて needs_check（行く所・方法の一部だけ ai_checked）。 */
import { describe, expect, it } from 'vitest';
import { checkRefs, loadData } from '../../src/core/data';
import { run, type EngineInput } from '../../src/core/engine';
import { collectEvidence } from '../../src/core/quotes';
import { AI_CHECK_COUNTS } from '../../src/core/trust';

/** B-4：国籍 → 在留資格の2段。'japanese' は国籍だけ答える */
const statusAnswers = (s?: string): Record<string, string> => (!s ? {} : s === 'japanese' ? { 'Q-nationality': 'japanese' } : { 'Q-nationality': 'foreign', 'Q-zairyu-status': s });
const data = loadData();
const ev = data.events.find((e) => e.id === 'E-job')!;
/** このできごとの分（元のまとまりと同じ範囲） */
const json = { events: [ev], cards: data.cards.filter((c) => ev.card_ids.includes(c.id)), rules: [...data.rules.values()].filter((r) => r.id.startsWith('R-job')), relations: data.relations.filter((r) => r.id.startsWith('rel-job')) };
const TODAY = '2026-11-05';
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
// D-1（11/6）：最初に「何をしますか」（アルバイト・就職・退職）。今までの期待は「アルバイト」の答えで確かめる
const go = (status: string | undefined, extra: Record<string, string> = {}, over: Partial<EngineInput> = {}) =>
  run(data, { answers: { 'Q-job-goal': 'part_time', ...statusAnswers(status), ...extra }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev, ...over });
const view = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!;
const PT = new Set(['job-kyujin', 'job-rodo-joken', 'job-saitei-chingin', 'job-shakai-hoken', 'job-trouble', 'zairyu-shikakugai', 'job-phrases']);
const ids = (o: ReturnType<typeof run>, state: string) => o.cards.filter((c) => c.state === state && PT.has(c.card.id)).map((c) => c.card.id).sort();
const ALL = ['job-kyujin', 'job-phrases', 'job-rodo-joken', 'job-saitei-chingin', 'job-shakai-hoken', 'job-trouble', 'zairyu-shikakugai'];
const COMMON = ['job-kyujin', 'job-phrases', 'job-rodo-joken', 'job-saitei-chingin', 'job-shakai-hoken', 'job-trouble'];
const mine = (where: string) => json.cards.some((c) => where.startsWith(c.id)) || where.startsWith('R-job') || where.startsWith('rel-job') || where === 'E-job';

describe('仕事・アルバイト（公開）', () => {
  it('型と参照の検査を通る。16枚。verified は無い。電話番号・クエリ付きの URL を書かない', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.card_ids.length).toBe(16);
    const s = JSON.stringify(json);
    expect(s).not.toContain('"verified"');
    expect(s).not.toMatch(/0\d{1,3}-\d{2,4}-\d{3,4}/);
    expect(s).not.toMatch(/https?:\/\/[^"]*\?/);
  });
  it('ai_checked は、行く所・方法だけ。期限・費用・ルール・関係・カード全体は needs_check', () => {
    const items = collectEvidence(data).filter((x) => mine(x.where));
    const ai = items.filter((x) => x.e.status === 'ai_checked');
    expect(ai.length).toBeGreaterThan(0);
    for (const x of ai) expect(AI_CHECK_COUNTS[x.kind]).toBe(true);
    for (const x of items.filter((y) => ['deadline', 'fee', 'rule', 'relation', 'prerequisite', 'card_text'].includes(y.kind))) expect(x.e.status).not.toBe('ai_checked');
  });
  it('最初に、在留資格を聞く', () => {
    expect(go(undefined).upfront.map((q) => q.id)).toEqual(['Q-nationality']);
    expect(run(data, { answers: {}, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev }).upfront.map((q) => q.id)).toEqual(['Q-nationality', 'Q-job-goal']);
  });
  it('留学：資格外活動許可は shown。ほかのカードも出る。許可をもう受けたかを聞く', () => {
    const o = go('student');
    expect(ids(o, 'shown')).toEqual(ALL);
    expect(ids(o, 'excluded')).toEqual([]);
    expect(o.upfront.map((q) => q.id)).toEqual(['Q-job-permit']);
  });
  it('家族滞在：資格外活動許可は出る。卒業後の在留資格の変更（留学の人向け）は出ない', () => {
    const o = go('family');
    expect(ids(o, 'shown')).toEqual(['zairyu-shikakugai', ...COMMON].sort());
    expect(ids(o, 'excluded')).toEqual([]);
  });
  it('永住者・定住者など（働くことに制限がない）：資格外活動許可は対象外。最低賃金などは出る。許可は聞かない', () => {
    const o = go('permanent');
    expect(ids(o, 'excluded')).toEqual(['zairyu-shikakugai']);
    expect(ids(o, 'shown')).toEqual(COMMON);
    expect(o.upfront).toEqual([]);
  });
  it('ほかの在留資格：許可のカードは対象外（理由に「要確認」）。わからない：窓口で確認にする', () => {
    expect(ids(go('work'), 'excluded')).toContain('zairyu-shikakugai');
    const c = view(go('work'), 'zairyu-shikakugai').card;
    expect(plain(c.reasons.excluded!.ja)).toContain('要確認');
    const u = go('unknown');
    expect([view(u, 'zairyu-shikakugai').state, view(u, 'zairyu-shikakugai').cause]).toEqual(['check_at_office', 'unknown']);
    expect(ids(u, 'excluded')).toEqual([]);
  });
  it('許可をもう受けている：資格外活動許可は「済み」に動く。まだ・わからない：動かない', () => {
    expect(view(go('student', { 'Q-job-permit': 'yes' }), 'zairyu-shikakugai').section).toBe('done');
    expect(view(go('student', { 'Q-job-permit': 'no' }), 'zairyu-shikakugai').section).not.toBe('done');
    expect(view(go('student', { 'Q-job-permit': 'unknown' }), 'zairyu-shikakugai').section).not.toBe('done');
  });
  it('許可は、仕事を探す・条件・時給より前に並ぶ。関係は注記だけ（needs_check）', () => {
    const o = go('student');
    const order = o.cards.map((c) => c.card.id);
    for (const id of ['job-kyujin', 'job-rodo-joken', 'job-saitei-chingin']) expect(order.indexOf('zairyu-shikakugai')).toBeLessThan(order.indexOf(id));
    expect(view(o, 'job-kyujin').notes.some((n) => n.kind === 'legal_prereq')).toBe(true);
  });
  it('最低賃金：日付つき（2026年10月1日から 愛知県 1,195円。作者 11/7 K-13：前の額は書かず最小限、くわしくは労働局のリンク）。needs_check', () => {
    const c = view(go('student'), 'job-saitei-chingin').card;
    const t = plain(c.summary.ja);
    expect(t).toContain('2026年10月1日から');
    expect(t).toContain('愛知県');
    expect(t).toContain('1,195円');
    expect(data.cards.find((c) => c.id === 'job-saitei-chingin')!.links![0].url).toContain('aichi-roudoukyoku');
    expect(t).toContain('要確認');
    expect(c.evidence.status).toBe('needs_check');
    expect(c.evidence.quote).toContain('令和8年10月1日');
  });
  it('資格外活動許可：1週28時間以内（要確認）。手数料・期限は needs_check', () => {
    const c = view(go('student'), 'zairyu-shikakugai').card;
    expect(plain(c.summary.ja)).toMatch(/28時間/);
    expect(plain(c.summary.ja)).toContain('要確認');
    expect(c.deadline!.evidence.status).toBe('needs_check');
    expect(c.evidence.status).toBe('needs_check');
    const fee = c.methods!.find((m) => /手数料/.test(plain(m.text.ja)))!;
    expect(fee.evidence.status).toBe('needs_check');
  });
  it('外国語の相談窓口：曜日と時間は「行く前に確認」。ai_checked は行く所・方法だけ', () => {
    const c = view(go('student'), 'job-rodo-joken').card;
    const m = c.methods!.map((x) => plain(x.text.ja)).join('\n');
    expect(m).toContain('行く前に曜日と時間を確認');
    expect(m).toMatch(/英語.*火曜日.*木曜日/s);
    expect(m).toMatch(/ベトナム語.*木曜日/s);
    expect(c.where.evidence.status).toBe('ai_checked');
    expect(plain(c.where.text.ja)).toContain('愛知労働局');
  });
  it('社会保険：学生は対象ではない（要確認）。将来の規則（2027年10月）といまの規則（51人）を分ける', () => {
    const t = plain(view(go('student'), 'job-shakai-hoken').card.summary.ja);
    expect(t).toContain('学生は対象ではありません（要確認）');
    expect(t).toContain('51人');
    expect(t).toContain('2027年10月から');
    expect(t).toContain('将来の規則');
  });
  it('相談・案内のカードは、日を聞かない。資格外活動許可は聞く', () => {
    const o = go('student');
    for (const id of ['job-saitei-chingin', 'job-rodo-joken', 'job-kyujin', 'job-trouble', 'job-shakai-hoken']) expect(view(o, id).dayRule.kind).toBe('no_day');
    expect(view(o, 'zairyu-shikakugai').dayRule.kind).not.toBe('no_day');
  });
});

// D-1（作者 11/6。docs/JOB_PLAN.md）：就職・退職。入管の届けは仕事の在留資格の人だけ
describe('就職・退職（下書き）', () => {
  const g = (goal: string, status: string) => run(data, { answers: { 'Q-job-goal': goal, ...statusAnswers(status) }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
  const st = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!.state;
  it('就職：保険・国保をやめる・住民税。入管の届けは仕事の在留資格だけ。アルバイトのカードは対象外', () => {
    const w = g('employ', 'work');
    for (const id of ['job-employ-hoken', 'job-employ-kokuho-stop', 'job-employ-juminzei', 'job-employ-nyukan']) expect(st(w, id), id).not.toBe('excluded');
    expect(st(w, 'job-kyujin')).toBe('excluded');
    expect(st(g('employ', 'permanent'), 'job-employ-nyukan')).toBe('excluded');
    expect(st(g('employ', 'student'), 'job-shushoku')).not.toBe('excluded');
  });
  it('退職：国保と年金・失業給付・住民税。入管の届け（3か月の注意）は仕事の在留資格だけ', () => {
    const w = g('leave', 'work');
    for (const id of ['job-leave-kokuho', 'job-leave-shitsugyo', 'job-leave-juminzei', 'job-leave-nyukan']) expect(st(w, id), id).not.toBe('excluded');
    expect(st(g('leave', 'japanese'), 'job-leave-nyukan')).toBe('excluded');
    expect(plain(data.cards.find((c) => c.id === 'job-leave-nyukan')!.summary.ja)).toContain('3か月');
  });
  it('応募の言葉は作者の経験（author_stated）。アルバイトのときだけ', () => {
    const c = data.cards.find((x) => x.id === 'job-phrases')!;
    expect(c.evidence.note).toContain('author_stated');
    expect(st(g('employ', 'student'), 'job-phrases')).toBe('excluded');
  });
});
