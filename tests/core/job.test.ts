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
  it('型と参照の検査を通る。20枚。verified は作者の答え・決定（公式の出典を足した行も含む）だけ。電話番号・クエリ付きの URL を書かない', () => {
    expect(checkRefs(data)).toEqual([]);
    expect(ev.card_ids.length).toBe(20);
    const s = JSON.stringify(json);
    for (const x of collectEvidence(data).filter((y) => mine(y.where) && y.e.status === 'verified')) expect(x.e.source_ids.some((id) => id === 'author-2026-11-07' || id === 'kurashi-spec'), x.where).toBe(true);
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
  it('仕事の在留資格のアルバイト：副業のカード（範囲の中なら許可は要らない）が出て、資格外活動許可のカードは出ない。留学・永住者には出ない（v0.5.26）', () => {
    const st = (o: ReturnType<typeof run>) => view(o, 'job-side-work').state;
    expect(st(go('work'))).toBe('shown');
    expect(view(go('work'), 'zairyu-shikakugai').state).not.toBe('shown');
    expect(st(go('student'))).not.toBe('shown');
    expect(st(go('permanent'))).not.toBe('shown');
    expect(view(go('work', { 'Q-job-goal': 'employ' }), 'job-side-work').state).not.toBe('shown');
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
    // 探す・契約の話・時給の確認の前に許可が要る、とは言わない（#245）。おすすめの順の注記だけ
    expect(view(o, 'job-kyujin').notes.some((n) => n.kind === 'practical_prereq')).toBe(true);
    expect(view(o, 'job-kyujin').notes.some((n) => n.kind === 'legal_prereq')).toBe(false);
    expect(data.relations.filter((r) => r.id.startsWith('rel-job-permit-before')).every((r) => r.type === 'practical_prerequisite')).toBe(true);
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
  it('社会保険：学生は原則として対象外、例外あり（要確認）。将来の規則（2027年10月）といまの規則（51人）を分ける', () => {
    const t = plain(view(go('student'), 'job-shakai-hoken').card.summary.ja);
    expect(t).toContain('学生は原則として対象外です');
    expect(t).toContain('例外があります');
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
  it('入管の届け（就職・退職）：契約機関と活動機関の2つ。一覧・起点の日・方法ごとの書類。オンラインだけ「資料不要」', () => {
    for (const id of ['job-employ-nyukan', 'job-leave-nyukan']) {
      const c = data.cards.find((x) => x.id === id)!;
      const all = JSON.stringify(c);
      const t = plain(JSON.stringify(c.methods!.map((m) => m.text.ja)));
      expect(c.links!.map((l) => l.url)).toEqual(['https://www.moj.go.jp/isa/applications/procedures/nyuukokukanri10_00015.html', 'https://www.moj.go.jp/isa/applications/procedures/nyuukokukanri10_00014.html']);
      for (const w of ['特定技能', '介護', '興行', '研究', '高度専門職1号イ・ロ', '契約機関の届出', '教授', '経営・管理', '企業内転勤', '法律・会計業務', '高度専門職1号ハ', '留学', '活動機関の届出']) expect(t, id + w).toContain(w);
      expect(plain(c.deadline!.text.ja)).toContain('14日以内');
      expect(plain(c.deadline!.text.ja)).toMatch(/契約.*(日|から).*活動機関/s);
      const online = c.methods!.filter((m) => m.type === 'online' && plain(m.text.ja).includes('資料は要りません'));
      expect(online.length).toBe(1);
      expect(plain(c.methods!.find((m) => m.type === 'counter')!.text.ja)).toContain('在留カードを見せて');
      expect(plain(c.methods!.find((m) => m.type === 'mail')!.text.ja)).toContain('写し');
      expect(plain(c.summary.ja)).not.toContain('資料は要りません');
      expect(all).not.toMatch(/"status":s*"verified"/);
    }
    const leave = plain(JSON.stringify(data.cards.find((x) => x.id === 'job-leave-nyukan')!.methods!.map((m) => m.text.ja)));
    expect(leave).toContain('自動');
    expect(leave).toContain('猶予');
  });
  it('資格外活動許可：包括と個別を分ける（28時間は包括だけ）。旅券か在留資格証明書。オンラインは変更・更新・取得と同時だけ', () => {
    const c = data.cards.find((x) => x.id === 'zairyu-shikakugai')!;
    const t = plain(c.methods!.map((m) => m.text.ja).join(" "));
    expect(t).toContain('包括許可');
    expect(t).toContain('個別許可');
    expect(t).toContain('資格外活動許可書');
    expect(t).toContain('在留資格証明書');
    expect(t).toMatch(/同時に出すときだけ/);
    expect(t).not.toContain('書かれます。' + '個別');
    expect(plain(c.methods!.find((m) => /標準処理期間/.test(plain(m.text.ja)))!.text.ja_easy)).toContain('目安');
    expect(c.methods![0].evidence.status).toBe('needs_check'); // 文を変えたので、作者がもう一度確かめるまで verified にしない
    expect(c.methods![0].evidence.source_ids).toContain('B-moj-shikakugai-shinsei');
    const d = plain(data.cards.find((x) => x.id === 'job-designation-note')!.summary.ja);
    expect(d).toContain('資格外活動許可書');
  });
  it('応募の言葉は作者の経験（author_stated）。アルバイトのときだけ', () => {
    expect(st(g('employ', 'student'), 'job-phrases')).toBe('excluded');
  });
});

// SPEC 6A.16（v0.5.16。作者の決定 11/7）：在留資格の区分で出し分ける
describe('在留資格の区分（6A.16）', () => {
  const g = (goal: string, status: string, extra: Record<string, string> = {}) => run(data, { answers: { 'Q-job-goal': goal, ...statusAnswers(status), ...extra }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: ev });
  const st = (o: ReturnType<typeof run>, id: string) => o.cards.find((c) => c.card.id === id)!.state;
  it('文化活動・研修（働けない）：入管で相談の1枚だけ。アルバイト・就職・辞めるのカードは出さない', () => {
    for (const s of ['cultural', 'trainee']) {
      for (const goal of ['part_time', 'employ', 'leave']) {
        const o = g(goal, s);
        expect(st(o, 'job-no-work-note'), s + goal).not.toBe('excluded');
        for (const id of ['job-kyujin', 'job-rodo-joken', 'job-saitei-chingin', 'job-trouble', 'job-shakai-hoken', 'job-phrases', 'job-employ-hoken', 'job-employ-juminzei', 'job-employ-kokuho-stop', 'job-leave-shitsugyo', 'job-leave-kokuho', 'job-leave-juminzei', 'zairyu-shikakugai']) expect(st(o, id), s + goal + id).toBe('excluded');
      }
    }
  });
  it('特定活動・そのほか：在留カードの「就労制限の有無」を聞く。ほかの在留資格では聞かない', () => {
    expect(g('part_time', 'designated').upfront.map((q) => q.id)).toContain('Q-work-limit');
    expect(g('part_time', 'other').upfront.map((q) => q.id)).toContain('Q-work-limit');
    for (const s of ['student', 'work', 'permanent', 'cultural']) expect(g('part_time', s).upfront.map((q) => q.id)).not.toContain('Q-work-limit');
  });
  it('指定書による：指定書を確かめる1枚と、ふつうのカード', () => {
    const o = g('part_time', 'designated', { 'Q-work-limit': 'designation' });
    expect(st(o, 'job-designation-note')).not.toBe('excluded');
    expect(st(o, 'job-saitei-chingin')).not.toBe('excluded');
    expect(st(g('part_time', 'designated', { 'Q-work-limit': 'none' }), 'job-designation-note')).toBe('excluded');
  });
  it('「就労不可」：許可を聞く。許可がある人は許可の案内、許可がない人は入管で相談の1枚だけ。わからない・未回答は決めない', () => {
    for (const s of ['other', 'designated']) {
      const base = { 'Q-work-limit': 'not_allowed' };
      expect(g('part_time', s, base).upfront.map((q) => q.id)).toContain('Q-job-permit');
      const yes = g('part_time', s, { ...base, 'Q-job-permit': 'yes' });
      expect(st(yes, 'zairyu-shikakugai'), s).not.toBe('excluded');
      expect(st(yes, 'job-no-work-note'), s).toBe('excluded');
      expect(st(yes, 'job-kyujin'), s).toBe('shown');
      const no = g('part_time', s, { ...base, 'Q-job-permit': 'no' });
      expect(st(no, 'job-no-work-note'), s).not.toBe('excluded');
      for (const id of ['zairyu-shikakugai', 'job-kyujin', 'job-rodo-joken', 'job-saitei-chingin']) expect(st(no, id), s + id).toBe('excluded');
      for (const a of [{} as Record<string, string>, { 'Q-job-permit': 'unknown' }]) {
        const u = g('part_time', s, { ...base, ...a });
        expect(st(u, 'job-kyujin'), s).not.toBe('shown');
        expect(st(u, 'job-kyujin'), s).not.toBe('excluded');
        expect(st(u, 'job-no-work-note'), s).not.toBe('shown');
      }
    }
    expect(st(g('employ', 'designated', { 'Q-work-limit': 'status_only' }), 'job-employ-nyukan')).not.toBe('excluded');
  });
  it('在留資格がわからない：働ける・働けないを決めない（仕事のカードは窓口で確認）', () => {
    const u = g('part_time', 'unknown');
    expect(st(u, 'job-kyujin')).not.toBe('shown');
    expect(st(u, 'job-no-work-note')).not.toBe('shown');
    expect(st(u, 'job-kyujin')).not.toBe('excluded');
  });
  it('留学・家族滞在は許可がなくても、許可の申請の案内を出す（働けない扱いにしない）', () => {
    for (const s of ['student', 'family']) for (const a of [{} as Record<string, string>, { 'Q-job-permit': 'no' }, { 'Q-job-permit': 'unknown' }]) {
      const o = g('part_time', s, a);
      expect(st(o, 'zairyu-shikakugai'), s).not.toBe('excluded');
      expect(st(o, 'job-no-work-note'), s).toBe('excluded');
    }
  });
  it('R-job-can-work の言い方は「働ける」と言い切らない', () => {
    const r = data.rules.get('R-job-can-work')!;
    expect(plain(r.statement.ja_easy)).not.toBe('働ける人');
    expect(plain(r.statement.ja_easy)).toContain('ではない');
  });
  it('留学・家族滞在の就職：在留資格の変更を先に（保険・住民税より前）', () => {
    for (const s of ['student', 'family']) {
      const o = g('employ', s);
      expect(st(o, 'job-shushoku'), s).not.toBe('excluded');
      const order = o.cards.map((c) => c.card.id);
      for (const id of ['job-employ-hoken', 'job-employ-juminzei', 'job-employ-kokuho-stop']) expect(order.indexOf('job-shushoku'), s + id).toBeLessThan(order.indexOf(id));
    }
    expect(st(g('employ', 'work'), 'job-shushoku')).toBe('excluded');
  });
  it('留学・家族滞在が辞める：失業手当・住民税・国保は出さない。「届けは要りません」の1枚', () => {
    for (const s of ['student', 'family']) {
      const o = g('leave', s);
      for (const id of ['job-leave-shitsugyo', 'job-leave-juminzei', 'job-leave-kokuho', 'job-leave-nyukan']) expect(st(o, id), s + id).toBe('excluded');
      expect(st(o, 'job-pt-leave-note'), s).not.toBe('excluded');
    }
    expect(st(g('leave', 'work'), 'job-pt-leave-note')).toBe('excluded');
    expect(st(g('leave', 'permanent'), 'job-leave-shitsugyo')).not.toBe('excluded');
  });
});
