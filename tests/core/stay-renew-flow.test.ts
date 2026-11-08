/* 在留期間の更新の流れ（SPEC 6A.18 v0.5.29）。満了日 → 在留資格 → 書類 → 方法 → 予定日 → 申請した → 許可。
   完了条件の6つの場面（作者の依頼 11/8）と、データの出典の検査。 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { dayInfo } from '../../src/core/calendar';
import { HOLIDAYS, HOURS } from '../../src/core/calendarData';
import { currentStep, methodOpen, planOutside, planRange, TRACK, urgency, type StayRecord } from '../../src/core/stayRenew';
import { STAY } from '../../src/core/stayRenewData';
import { LEVELS } from '../../src/i18n/text';

const TODAY = '2026-11-09'; // 月曜日
const data = loadData();
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const renew = (over: StayRecord = {}): StayRecord => ({ kind: 'student', docs_seen: true, method: 'counter', ...over });

describe('在留期間の更新の流れ', () => {
  it('データ：出典はすべて sources.json にあり、全部の表示レベルの文がある。要確認のまま（needs_check）。クエリ付きの URL を書かない', () => {
    const d = STAY();
    const src = new Set(data.sources.map((s) => s.source_id));
    const evs = [...d.docs.map((x) => x.evidence), ...Object.values(d.facts).map((f) => f.evidence)];
    for (const e of evs) { expect(e.source_ids.every((s) => src.has(s))).toBe(true); expect(e.status).toBe('needs_check'); }
    for (const s of d.statuses) if (s.docs_source) expect(src.has(s.docs_source)).toBe(true);
    const texts = [...d.statuses.map((s) => s.label), ...d.docs.flatMap((x) => [x.text, ...(x.note ? [x.note] : [])]), ...Object.values(d.facts).map((f) => f.text)];
    for (const t of texts) for (const l of LEVELS) expect(t[l.id], JSON.stringify(t)).toBeTruthy();
    expect(JSON.stringify(d)).not.toMatch(/https?:\/\/[^"]*\?/);
    // 追加の書類は一律に必須にしない：基本の書類は5つ、追加は1行で公式ページへ
    expect(d.docs.map((x) => x.id)).toEqual(['form', 'photo', 'passport', 'card', 'extra']);
    expect(plain(d.docs.find((x) => x.id === 'photo')!.note!.ja)).toContain('1歳');
    expect(data.cards.find((c) => c.id === 'zairyu-koshin')!.flow).toBe('stay_renew');
  });

  it('1. 満了まで90日以上ある留学生：6か月以上なら3か月前から。先に期間を聞き、選べる日は受付の始まる日から', () => {
    const s: StayRecord = { expires_on: '2027-03-31' };
    expect(urgency('2027-03-31', TODAY).kind).toBe('calm');
    expect(currentStep(s, TODAY)).toBe('period');
    expect(currentStep({ ...s, period: 'long' }, TODAY)).toBe('status');
    expect(currentStep({ ...s, period: 'long', kind: 'student' }, TODAY)).toBe('docs');
    expect(planRange({ expires: '2027-03-31', period: 'long', method: 'counter', today: TODAY })).toEqual({ min: '2026-12-31', max: '2027-03-31' });
    // 6か月より短い・わからない：受付の始まる日を決めない（推測しない）
    expect(planRange({ expires: '2027-03-31', period: 'unknown', method: 'counter', today: TODAY })!.min).toBe(TODAY);
    // 留学は在留資格のページ（ページの中の「在留期間更新許可申請」）
    expect(STAY().statuses.find((x) => x.id === 'student')!.docs_source).toBe('isa-status-student');
  });

  it('2. 満了まで5日の就労資格：7日以内の警告。満了日より後と、窓口の休みの日は選べない', () => {
    const exp = '2026-11-14'; // 土曜日
    expect(urgency(exp, TODAY)).toEqual({ kind: 'week', daysLeft: 5 });
    expect(TRACK.engineer).toBe('renew');
    expect(currentStep(renew({ expires_on: exp, kind: 'engineer' }), TODAY)).toBe('day');
    const r = planRange({ expires: exp, method: 'counter', today: TODAY })!;
    expect(r).toEqual({ min: TODAY, max: exp });
    const at = (day: string) => dayInfo({ day, today: TODAY, min: r.min, max: r.max, hours: HOURS().immigration, holidays: HOLIDAYS() }).selectable;
    expect(at('2026-11-13')).toBe(true); // 金曜日
    expect(at('2026-11-14')).toBe(false); // 土曜日（休み）
    expect(at('2026-11-16')).toBe(false); // 満了日より後
    expect(at('2026-11-08')).toBe(false); // 過去
    expect(dayInfo({ day: '2026-12-30', today: TODAY, hours: HOURS().immigration, holidays: HOLIDAYS() }).selectable).toBe(false); // 年末年始
    expect(urgency('2026-12-20', TODAY).kind).toBe('soon'); // 45日以内
  });

  it('3. 満了日の当日：オンラインは選べない。窓口は今日だけ', () => {
    expect(urgency(TODAY, TODAY).kind).toBe('today');
    expect(methodOpen('online', TODAY, TODAY)).toBe(false);
    expect(methodOpen('counter', TODAY, TODAY)).toBe(true);
    expect(planRange({ expires: TODAY, method: 'online', today: TODAY })).toBeNull();
    expect(planRange({ expires: TODAY, method: 'counter', today: TODAY })).toEqual({ min: TODAY, max: TODAY });
    // オンラインは満了日の前の日まで（online-QA Q4-10）
    expect(planRange({ expires: '2026-11-20', method: 'online', today: TODAY })!.max).toBe('2026-11-19');
  });

  it('4. 永住者：在留期間の更新ではなく、在留カードの有効期間の更新。満了日を聞かない', () => {
    expect(TRACK.permanent).toBe('card');
    expect(TRACK.hsp2).toBe('card');
    expect(TRACK.special_permanent).toBe('spc');
    expect(TRACK.short_stay).toBe('short');
    expect(currentStep({}, TODAY, { profileKind: 'permanent' })).toBe('status');
    expect(currentStep({ kind: 'permanent' }, TODAY)).toBe('stop');
    const t = plain(STAY().facts.card.text.ja);
    expect(t).toContain('在留カードの有効期間の更新');
    expect(t).toContain('手数料はかかりません');
    expect(plain(STAY().facts.spc.text.ja)).toContain('区役所');
    // 共通の判定でも、永住者に更新のカードは対象外
    const o = run(data, { answers: { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'permanent' }, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: data.events.find((e) => e.id === 'E-stay-renew')! });
    expect(o.cards.find((c) => c.card.id === 'zairyu-koshin')!.state).toBe('excluded');
  });

  it('5. 満了日を過ぎた：予定日の段に進まない（期限の前に申請したかを1つ聞く）。オンラインもできない', () => {
    const s = renew({ expires_on: '2026-11-01' });
    expect(urgency('2026-11-01', TODAY).kind).toBe('expired');
    expect(currentStep(s, TODAY)).toBe('expired');
    expect(currentStep({ expires_on: '2026-11-01' }, TODAY)).toBe('expired'); // 在留資格を聞く前でも
    // 永住者などはカードの更新へ（満了日とカードの有効期間を混ぜない）
    expect(currentStep({ expires_on: '2026-11-01', kind: 'permanent' }, TODAY)).toBe('stop');
    expect(planRange({ expires: '2026-11-01', method: 'counter', today: TODAY })).toBeNull();
    expect(methodOpen('online', '2026-11-01', TODAY)).toBe(false);
    // 期限の前に申請したと記録していれば、記録の段（特例期間。申請の期限ではない）
    expect(currentStep(s, TODAY, { status: 'submitted' })).toBe('progress');
    expect(plain(STAY().facts.special_period.text.ja)).toContain('申請の期限がのびるわけではありません');
  });

  it('期限切れの答え：未申請・わからないは入管への相談（愛知県の場合の名古屋と、全国の一覧）。申請中は特例期間を言い切らない。許可済みは満了日を入れ直す', () => {
    const d = STAY();
    const src = new Set(data.sources.map((x) => x.source_id));
    expect(['isa-nagoya', 'isa-region-list', 'isa-tokurei'].every((x) => src.has(x))).toBe(true);
    expect(data.sources.find((x) => x.source_id === 'isa-region-list')!.url).toBe('https://www.moj.go.jp/isa/about/region/');
    expect(d.nagoya.phones.map((p) => p.value)).toEqual(['0570-052259', '052-217-8944']);
    // 居住地はわからない：名古屋と言い切らず「愛知県に住んでいる場合」
    expect(plain(d.nagoya.scope.ja)).toContain('愛知県に住んでいる場合');
    const applied = plain(d.facts.expired_applied.text.ja);
    expect(applied).toContain('条件によっては');
    expect(applied).not.toMatch(/2か月/);
    const consult = plain(d.facts.expired_consult.text.ja);
    expect(consult).not.toMatch(/不法滞在|オンライン/);
    expect(plain(d.facts.expired_permitted.text.ja)).toContain('満了日');
    // 許可済み：新しい満了日を入れると、ふつうの流れにもどる
    expect(currentStep(renew({ expires_on: '2027-11-01', after: undefined }), TODAY)).toBe('period');
  });

  it('6. 書類と予定日：予定日を決めても申請済みにしない。申請した＝submitted（待つ）、許可＝done', () => {
    const exp = '2026-12-25';
    const s = renew({ expires_on: exp, docs_seen: false, docs: ['form', 'photo'] });
    expect(currentStep(s, TODAY)).toBe('docs');
    expect(currentStep({ ...s, docs_seen: true }, TODAY)).toBe('day');
    expect(currentStep({ ...s, docs_seen: true }, TODAY, { planned: '2026-11-20', status: 'todo' })).toBe('progress');
    expect(planOutside('2026-11-20', planRange({ expires: exp, method: 'counter', today: TODAY }))).toBe(false);
    expect(planOutside('2026-12-28', planRange({ expires: exp, method: 'counter', today: TODAY }))).toBe(true);
    const ev = data.events.find((e) => e.id === 'E-stay-renew')!;
    const answers = { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'student', 'Q-mynumber-card': false };
    const sec = (status: 'todo' | 'submitted' | 'done') =>
      run(data, { answers, objects: {}, plan: { 'zairyu-koshin': { card_id: 'zairyu-koshin', status, planned_on: '2026-11-20', stay: { ...s, docs_seen: true } } }, createdOn: TODAY, today: TODAY, mode: 'public', event: ev })
        .cards.find((c) => c.card.id === 'zairyu-koshin')!.section;
    expect(sec('todo')).not.toBe('done');
    expect(sec('todo')).not.toBe('wait');
    expect(sec('submitted')).toBe('wait');
    expect(sec('done')).toBe('done');
  });
});
