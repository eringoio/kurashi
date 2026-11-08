/* 仕事の35の場面（2026-11-08。docs/deep-research/kurashi_work_research_2026-11-08.md の4章）を表で確かめる。
   on＝出る（対象外ではない）／off＝対象外／ask＝カードの中で聞く／check＝窓口で確認／shown＝出る（答えが足りている）。
   has・lacks：そのカードの要約と出ている方法の文（ふりがなを外したもの）に含む・含まない。番号は調査資料の場面の番号。 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-job')!;
const plain = (s: string) => s.replace(/[{][^|}]*[|][^}]*[}]/g, (m) => m.slice(1, m.indexOf('|')));
const who = (s: string): Record<string, string> => (s === 'japanese' ? { 'Q-nationality': 'japanese' } : { 'Q-nationality': 'foreign', 'Q-zairyu-status': s });
const go = (goal: string, status: string, extra: Record<string, string> = {}) =>
  run(data, { answers: { 'Q-job-goal': goal, ...who(status), ...extra }, objects: {}, plan: {}, createdOn: '2026-11-08', today: '2026-11-08', mode: 'public', event: ev });
type Row = { n: string; goal: string; who: string; a?: Record<string, string>; on?: string[]; off?: string[]; ask?: string[]; check?: string[]; shown?: string[]; up?: string[]; noUp?: string[]; has?: Record<string, string[]>; lacks?: Record<string, string[]>; done?: string[]; notDone?: string[] };

const ROWS: Row[] = [
  { n: '01 日本国籍・アルバイト', goal: 'part_time', who: 'japanese', noUp: ['Q-job-permit', 'Q-work-limit'], off: ['zairyu-shikakugai', 'job-side-work'], shown: ['job-saitei-chingin', 'job-shakai-hoken', 'job-kyujin'] },
  { n: '02 永住者・アルバイト', goal: 'part_time', who: 'permanent', noUp: ['Q-job-permit'], off: ['zairyu-shikakugai'], shown: ['job-kyujin'] },
  { n: '03 留学・許可なし', goal: 'part_time', who: 'student', a: { 'Q-job-permit': 'no' }, shown: ['zairyu-shikakugai', 'job-kyujin'], notDone: ['zairyu-shikakugai'] },
  { n: '04 留学・包括許可・在学中', goal: 'part_time', who: 'student', a: { 'Q-job-permit': 'blanket', 'Q-school-status': 'enrolled' }, done: ['zairyu-shikakugai'], has: { 'zairyu-shikakugai': ['1週に28時間以内'] }, off: ['job-student-after-school'] },
  { n: '05 留学・勤め先が2つ', goal: 'part_time', who: 'student', a: { 'Q-job-permit': 'blanket' }, has: { 'zairyu-shikakugai': ['全部の勤め先の時間を合わせて28時間以内'] } },
  { n: '06 留学・学校の長期休業', goal: 'part_time', who: 'student', a: { 'Q-job-permit': 'blanket' }, has: { 'zairyu-shikakugai': ['長期休業の期間は1日8時間以内'] } },
  { n: '07 家族滞在・休み', goal: 'part_time', who: 'family', a: { 'Q-job-permit': 'blanket' }, has: { 'zairyu-shikakugai': ['留学の人だけの決まり'] }, lacks: { 'zairyu-shikakugai': ['長期休業の期間は1日8時間以内', '在籍している間だけ'] } },
  { n: '08 留学・卒業後・包括許可', goal: 'part_time', who: 'student', a: { 'Q-job-permit': 'blanket', 'Q-school-status': 'graduated' }, shown: ['job-student-after-school'], notDone: ['zairyu-shikakugai'], has: { 'job-student-after-school': ['アルバイトができません', '特定活動'] } },
  { n: '08b 留学・在籍を聞く', goal: 'part_time', who: 'student', a: { 'Q-job-permit': 'blanket' }, ask: ['job-student-after-school'] },
  { n: '09 留学・就職', goal: 'employ', who: 'student', shown: ['job-shushoku'], on: ['job-employ-hoken'] },
  { n: '10 家族滞在・就職', goal: 'employ', who: 'family', shown: ['job-shushoku'] },
  { n: '11 技人国・副業', goal: 'part_time', who: 'work', a: { 'Q-work-status-detail': 'engineer' }, shown: ['job-side-work', 'job-kyujin'], off: ['zairyu-shikakugai', 'job-ssw-intern-note'], has: { 'job-side-work': ['範囲の仕事なら'] } },
  { n: '12 技人国・範囲の外の副業', goal: 'part_time', who: 'work', a: { 'Q-work-status-detail': 'engineer' }, has: { 'job-side-work': ['在留資格に当たらない仕事', '資格外活動許可'] } },
  { n: '13 技人国・退職', goal: 'leave', who: 'work', a: { 'Q-work-status-detail': 'engineer' }, shown: ['job-leave-nyukan', 'job-pt-end-pay'], has: { 'job-leave-nyukan': ['契約機関の届出（'] }, lacks: { 'job-leave-nyukan': ['活動機関の届出（'] } },
  { n: '14 教育・転職', goal: 'employ', who: 'work', a: { 'Q-work-status-detail': 'activity_other' }, shown: ['job-employ-nyukan', 'job-employ-content'], has: { 'job-employ-nyukan': ['活動機関の届出（'] }, lacks: { 'job-employ-nyukan': ['契約機関の届出（'] } },
  { n: '14b 仕事の在留資格・名前がわからない', goal: 'employ', who: 'work', a: { 'Q-work-status-detail': 'unknown' }, check: ['job-employ-nyukan'], has: { 'job-employ-nyukan': ['契約機関の届出（', '活動機関の届出（'] } },
  { n: '14c 仕事の在留資格・まだ答えていない', goal: 'leave', who: 'work', ask: ['job-leave-nyukan'] },
  { n: '15 特定技能・アルバイト', goal: 'part_time', who: 'work', a: { 'Q-work-status-detail': 'ssw' }, shown: ['job-ssw-intern-note'], off: ['job-side-work', 'job-kyujin', 'job-phrases'], has: { 'job-ssw-intern-note': ['別の会社でアルバイトをすることはできません'] } },
  { n: '15b 特定技能・転職', goal: 'employ', who: 'work', a: { 'Q-work-status-detail': 'ssw' }, has: { 'job-employ-content': ['在留資格の変更許可申請'] } },
  { n: '16 技能実習・副業', goal: 'part_time', who: 'work', a: { 'Q-work-status-detail': 'intern' }, shown: ['job-ssw-intern-note'], off: ['job-kyujin', 'job-side-work'], has: { 'job-ssw-intern-note': ['相談'] }, lacks: { 'job-ssw-intern-note': ['できません'] } },
  { n: '17 特定活動・指定書', goal: 'part_time', who: 'designated', a: { 'Q-work-limit': 'designation' }, on: ['job-designation-note'] },
  { n: '18 特定活動・指定書・事業', goal: 'biz_start', who: 'designated', a: { 'Q-work-limit': 'designation' }, shown: ['biz-start-permit'], has: { 'biz-start-permit': ['指定書'] } },
  { n: '19 文化活動・個別許可', goal: 'part_time', who: 'cultural', a: { 'Q-job-permit': 'individual' }, on: ['zairyu-shikakugai'], off: ['job-no-work-note'], has: { 'zairyu-shikakugai': ['許可書に書いてある活動'] } },
  { n: '19b 文化活動・許可を聞く', goal: 'part_time', who: 'cultural', up: ['Q-job-permit'] },
  { n: '19c 文化活動・許可なし', goal: 'part_time', who: 'cultural', a: { 'Q-job-permit': 'no' }, on: ['job-no-work-note'], off: ['job-kyujin'] },
  // v0.5.34：留学・家族滞在には、会社・個人事業の選択肢を出さない。答えてしまったとき（在留資格をあとで答えた）は、在留資格の確かめのカードだけ
  { n: '20 留学・会社', goal: 'company', who: 'student', shown: ['company-status'], off: ['company-setup'], has: { 'company-status': ['別です', '資格外活動許可だけで'] } },
  { n: '21 留学・業務委託', goal: 'biz_start', who: 'student', shown: ['biz-start-permit'], off: ['job-side-work'], has: { 'biz-start-permit': ['個別許可'] } },
  { n: '22 留学・開業届は許可ではない', goal: 'biz_start', who: 'student', off: ['biz-start-kaigyo', 'biz-start-tax', 'biz-start-aoiro', 'biz-start-hoken', 'biz-start-employees'], has: { 'biz-start-permit': ['入管の許可にはなりません'] } },
  { n: '23 永住者・個人事業', goal: 'biz_start', who: 'permanent', a: { 'Q-insurance': 'employer_self', 'Q-biz-side': 'no' }, off: ['biz-start-permit', 'job-side-work', 'company-status'], shown: ['biz-start-kaigyo', 'biz-start-tax', 'biz-start-hoken'] },
  { n: '23b 永住者・会社', goal: 'company', who: 'permanent', shown: ['company-setup'], off: ['company-status'], lacks: { 'company-setup': ['3,000万', '在留資格の申請'] } },
  { n: '24 技人国・個人事業', goal: 'biz_start', who: 'work', a: { 'Q-work-status-detail': 'engineer' }, shown: ['job-side-work'], off: ['biz-start-permit'], has: { 'job-side-work': ['個人事業主', '経営・管理'] } },
  { n: '25 家族滞在・ネットショップ', goal: 'biz_start', who: 'family', shown: ['biz-start-permit'], off: ['biz-start-kaigyo', 'biz-start-tax'] },
  { n: '26 退職・次の日から次の会社の保険', goal: 'leave', who: 'permanent', a: { 'Q-job-next': 'next_day' }, off: ['job-leave-kokuho'] },
  { n: '26b 退職・間が空く', goal: 'leave', who: 'permanent', a: { 'Q-insurance': 'employer_self', 'Q-job-next': 'gap' }, shown: ['job-leave-kokuho'], has: { 'job-leave-kokuho': ['任意継続'] } },
  { n: '26c 退職・次の保険を聞く', goal: 'leave', who: 'japanese', ask: ['job-leave-kokuho'] },
  { n: '27 留学・アルバイトを辞める', goal: 'pt_end', who: 'student', a: { 'Q-insurance': 'kokuho' }, off: ['job-leave-kokuho', 'job-leave-shitsugyo', 'job-leave-nyukan'], on: ['job-pt-leave-note', 'job-pt-end-pay'] },
  { n: '28 アルバイトを辞める・職場の保険あり', goal: 'pt_end', who: 'permanent', a: { 'Q-insurance': 'employer_self', 'Q-job-next': 'gap', 'Q-job-koyo': 'yes' }, shown: ['job-leave-kokuho', 'job-leave-shitsugyo', 'job-pt-end-pay'] },
  { n: '28b アルバイトを辞める・国保のまま', goal: 'pt_end', who: 'permanent', a: { 'Q-insurance': 'kokuho' }, off: ['job-leave-kokuho'] },
  { n: '29 廃業・インボイスあり', goal: 'biz_end', who: 'japanese', a: { 'Q-biz-invoice': 'yes' }, shown: ['biz-end-invoice', 'biz-end-haigyo'], has: { 'biz-end-invoice': ['事業廃止届出書'] } },
  { n: '29b 廃業・インボイスなし', goal: 'biz_end', who: 'japanese', a: { 'Q-biz-invoice': 'no' }, off: ['biz-end-invoice'] },
  { n: '29c 廃業・インボイスを聞く', goal: 'biz_end', who: 'japanese', ask: ['biz-end-invoice', 'biz-end-employees'] },
  { n: '30 廃業・従業員あり', goal: 'biz_end', who: 'japanese', a: { 'Q-biz-employees': 'yes' }, shown: ['biz-end-employees'], has: { 'biz-end-employees': ['1か月以内'] } },
  { n: '31 経営・管理・廃業', goal: 'biz_end', who: 'work', a: { 'Q-work-status-detail': 'business_manager' }, shown: ['biz-end-status'] },
  { n: '31b 経営・管理の経過措置', goal: 'company', who: 'work', shown: ['company-status'], has: { 'company-status': ['2028年10月16日', '新しく申請する人'] } },
  { n: '32 在留資格がわからない', goal: 'part_time', who: 'unknown', check: ['job-kyujin'], off: [] },
  { n: '32b 特定活動・欄がわからない', goal: 'part_time', who: 'designated', a: { 'Q-work-limit': 'unknown' }, check: ['job-kyujin', 'job-saitei-chingin'] },
  { n: '34 社会保険の2026年の改正', goal: 'part_time', who: 'student', has: { 'job-shakai-hoken': ['8.8万円', '2026年10月1日になくなりました', '将来の規則', '例外があります'] } },
  { n: '税 開業届と青色申告の期限', goal: 'biz_start', who: 'japanese', shown: ['biz-start-kaigyo', 'biz-start-aoiro'], ask: ['biz-start-employees'] },
  { n: '基本情報', goal: 'basics', who: 'unknown', shown: ['job-rodo-joken', 'job-saitei-chingin', 'job-shakai-hoken', 'job-trouble'], off: ['job-kyujin', 'zairyu-shikakugai', 'biz-start-kaigyo'] },
];

describe('仕事の35の場面（11/8）', () => {
  it.each(ROWS)('$n', (r) => {
    const o = go(r.goal, r.who, r.a);
    const v = (id: string) => { const c = o.cards.find((x) => x.card.id === id); expect(c, id).toBeTruthy(); return c!; };
    const text = (id: string) => { const c = v(id); return plain([c.card.summary.ja, c.card.deadline?.text.ja ?? '', ...c.methods.map((m) => m.method.text.ja)].join('\n')); };
    for (const id of r.on ?? []) expect(v(id).state, id).not.toBe('excluded');
    for (const id of r.off ?? []) expect(v(id).state, id).toBe('excluded');
    for (const id of r.ask ?? []) expect(v(id).state, id).toBe('ask');
    for (const id of r.check ?? []) expect(v(id).state, id).toBe('check_at_office');
    for (const id of r.shown ?? []) expect(v(id).state, id).toBe('shown');
    for (const id of r.done ?? []) expect(v(id).section, id).toBe('done');
    for (const id of r.notDone ?? []) expect(v(id).section, id).not.toBe('done');
    for (const q of r.up ?? []) expect(o.upfront.map((x) => x.id)).toContain(q);
    for (const q of r.noUp ?? []) expect(o.upfront.map((x) => x.id)).not.toContain(q);
    for (const [id, ws] of Object.entries(r.has ?? {})) for (const w of ws) expect(text(id), id).toContain(w);
    for (const [id, ws] of Object.entries(r.lacks ?? {})) for (const w of ws) expect(text(id), id).not.toContain(w);
  });
  it('留学の人（在留資格を前に答えた）：何をしますか は アルバイト・就職・アルバイトを辞める・基本情報だけ。目的ごとのカード（v0.5.34）', () => {
    const base = { objects: {}, plan: {}, createdOn: '2026-11-08', today: '2026-11-08', mode: 'public' as const, event: ev };
    const offered = (status: Record<string, string>) => run(data, { ...base, answers: status }).upfront.find((q) => q.id === 'Q-job-goal')!.options.map((o) => o.value);
    expect(offered(who('student'))).toEqual(['part_time', 'employ', 'pt_end', 'basics']);
    expect(offered(who('family'))).toEqual(['part_time', 'employ', 'pt_end', 'basics']);
    // 仕事の在留資格・永住者・日本国籍・まだ答えていない人は、8つのまま
    const ALL8 = ['part_time', 'employ', 'pt_end', 'leave', 'biz_start', 'biz_end', 'company', 'basics'];
    for (const s of ['work', 'permanent', 'japanese']) expect(offered(who(s)), s).toEqual(ALL8);
    expect(run(data, { ...base, answers: {} }).upfront.find((q) => q.id === 'Q-job-goal')!.options.map((o) => o.value)).toEqual(ALL8);
    // 出るカード（対象外でないもの）
    const on = (goal: string, extra: Record<string, string> = {}) => go(goal, 'student', extra).cards.filter((c) => c.state !== 'excluded').map((c) => c.card.id).sort();
    expect(on('part_time', { 'Q-job-permit': 'blanket', 'Q-school-status': 'enrolled' })).toEqual(['job-kyujin', 'job-phrases', 'job-rodo-joken', 'job-saitei-chingin', 'job-shakai-hoken', 'job-trouble', 'zairyu-shikakugai']);
    expect(on('employ', { 'Q-school-status': 'enrolled', 'Q-insurance': 'kokuho' })).toEqual(['job-employ-hoken', 'job-employ-juminzei', 'job-employ-kokuho-stop', 'job-shushoku']);
    expect(on('pt_end', { 'Q-insurance': 'kokuho' })).toEqual(['job-pt-end-pay', 'job-pt-leave-note', 'job-trouble']);
    expect(on('basics')).toEqual(['job-rodo-joken', 'job-saitei-chingin', 'job-shakai-hoken', 'job-trouble']);
    // 就職：在留資格の変更が「いま」。会社の保険・住民税・国保をやめる届けは、その「あと」
    const e = go('employ', 'student', { 'Q-school-status': 'enrolled', 'Q-insurance': 'kokuho' });
    const sec = (id: string) => e.cards.find((c) => c.card.id === id)!;
    expect(sec('job-shushoku').section).toBe('today');
    for (const id of ['job-employ-hoken', 'job-employ-juminzei', 'job-employ-kokuho-stop']) {
      expect(sec(id).section, id).toBe('later');
      expect(sec(id).sectionWhy, id).toBe('after_card');
      expect(sec(id).afterFrom, id).toBe('job-shushoku');
    }
    // 在留資格の変更が済んだら、会社の保険などは「いま」の順に戻る
    const after = run(data, { ...base, answers: { 'Q-job-goal': 'employ', ...who('student'), 'Q-school-status': 'enrolled', 'Q-insurance': 'kokuho' }, plan: { 'job-shushoku': { status: 'done' } as never } });
    expect(after.cards.find((c) => c.card.id === 'job-employ-kokuho-stop')!.section).toBe('today');
    // 永住者の就職は、今までどおり（あとにしない）
    expect(go('employ', 'permanent').cards.find((c) => c.card.id === 'job-employ-hoken')!.sectionWhy).not.toBe('after_card');
  });
  it('在留資格がまだわからない人が会社・個人事業を選んだ：国籍・在留資格を先に聞き、カードは「聞く」のまま（v0.5.34）', () => {
    const o = run(data, { answers: { 'Q-job-goal': 'biz_start', 'Q-biz-started': 'planning' }, objects: {}, plan: {}, createdOn: '2026-11-08', today: '2026-11-08', mode: 'public', event: ev });
    expect(o.upfront.map((q) => q.id)).toContain('Q-nationality');
    for (const id of ['biz-start-kaigyo', 'biz-start-tax', 'biz-start-aoiro', 'biz-start-permit']) expect(o.cards.find((c) => c.card.id === id)!.state, id).toBe('ask');
  });
  it('開業届・廃業届の期限は「確定申告の期限まで」。「1か月以内」と書かない。青色申告は別の期限（2か月）', () => {
    for (const id of ['biz-start-kaigyo', 'biz-end-haigyo']) {
      const t = plain(data.cards.find((c) => c.id === id)!.deadline!.text.ja);
      expect(t).toContain('確定申告の期限まで');
      expect(t).not.toContain('1か月');
    }
    expect(plain(data.cards.find((c) => c.id === 'biz-start-aoiro')!.deadline!.text.ja)).toContain('2か月以内');
  });
  it('新しいカードはすべて needs_check で、出典のある根拠を持つ。3,000万円は会社の在留資格と副業のカードだけ', () => {
    const NEW = ['job-student-after-school', 'job-ssw-intern-note', 'job-employ-content', 'job-pt-end-pay', 'biz-start-permit', 'biz-start-kaigyo', 'biz-start-aoiro', 'biz-start-tax', 'biz-start-employees', 'biz-start-hoken', 'biz-end-haigyo', 'biz-end-invoice', 'biz-end-employees', 'biz-end-status', 'company-setup', 'company-status'];
    for (const id of NEW) {
      const c = data.cards.find((x) => x.id === id)!;
      expect(c, id).toBeTruthy();
      expect(JSON.stringify(c), id).not.toMatch(/"status":\s*"(verified|ai_checked)"/);
      expect(ev.card_ids).toContain(id);
    }
    const with3000 = data.cards.filter((c) => ev.card_ids.includes(c.id) && JSON.stringify(c).includes('3,000')).map((c) => c.id).sort();
    expect(with3000).toEqual(['company-status', 'job-side-work']);
  });
  it('何をしますか：8つ。会社と基本情報は下の小さいボタン。前の版の答え（part_time・employ・leave）はそのまま', () => {
    const q = data.questions.find((x) => x.id === 'Q-job-goal')!;
    expect(q.options.map((o) => o.value)).toEqual(['part_time', 'employ', 'pt_end', 'leave', 'biz_start', 'biz_end', 'company', 'basics']);
    expect(q.options.filter((o) => o.small).map((o) => o.value)).toEqual(['company', 'basics']);
  });
});
