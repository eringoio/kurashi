/* 11/14 の監査で見つけた判定の直し（docs/release/journeys/ の A-1・B-3）と、照合の食い違い4件の文 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DATA } from '../../src/core/data';
import { run } from '../../src/core/engine';

const TODAY = '2026-11-14';
const data = DATA();
const event = (id: string) => data.events.find((e) => e.id === id)!;
const go = (eventId: string, answers: Record<string, string | boolean | string[]>) =>
  run(data, { answers, objects: {}, plan: {}, createdOn: TODAY, today: TODAY, mode: 'public', event: event(eventId) });
const st = (o: ReturnType<typeof go>, id: string) => o.cards.find((c) => c.card.id === id)?.state;
const card = (id: string) => JSON.parse(readFileSync('data/cards/' + id + '.json', 'utf8'));

describe('A-1：ほかの市から来た人の国民年金', () => {
  const base = { 'Q-origin': 'other_city', 'Q-nationality': 'japanese', 'Q-age-band': '20_59' };
  it('年金の種類がまだなら、質問を聞く（「窓口で確かめる」にしない）', () => {
    const o = go('E-move', base);
    const c = o.cards.find((x) => x.card.id === 'kokumin-nenkin-kanyu')!;
    expect(c.state).toBe('ask');
    expect(c.questions.map((q) => q.id)).toContain('Q-pension-type');
  });
  it('厚生年金と答えたら外れる。入っていないと答えたら、引っ越す前から入っているかを聞く（v0.5.44）。まだなら窓口で確かめる（制度のルールが要確認のあいだ）', () => {
    expect(st(go('E-move', { ...base, 'Q-pension-type': 'kosei' }), 'kokumin-nenkin-kanyu')).toBe('excluded');
    const none = go('E-move', { ...base, 'Q-pension-type': 'none' }).cards.find((x) => x.card.id === 'kokumin-nenkin-kanyu')!;
    expect([none.state, none.questions.map((q) => q.id)]).toEqual(['ask', ['Q-nenkin-enrolled']]);
    expect(st(go('E-move', { ...base, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'no' }), 'kokumin-nenkin-kanyu')).toBe('check_at_office');
    expect(st(go('E-move', { ...base, 'Q-pension-type': 'none', 'Q-nenkin-enrolled': 'yes' }), 'kokumin-nenkin-kanyu')).toBe('excluded');
  });
  it('外国から来た人は今までどおり（外れない）', () => {
    expect(st(go('E-move', { ...base, 'Q-origin': 'abroad', 'Q-pension-type': 'none' }), 'kokumin-nenkin-kanyu')).not.toBe('excluded');
  });
});

describe('B-3：働けない区分・特定技能と技能実習に、開業・会社設立の手続きを出さない', () => {
  const BIZ = ['biz-start-kaigyo', 'biz-start-tax', 'biz-start-aoiro'];
  const biz = (status: string, more: Record<string, string> = {}) => go('E-job', { 'Q-job-goal': 'biz_start', 'Q-nationality': 'foreign', 'Q-zairyu-status': status, ...more });
  it('研修：開業届・帳簿・青色申告は外れ、在留資格の確かめは残る', () => {
    const o = biz('trainee');
    for (const id of BIZ) expect(st(o, id), id).toBe('excluded');
    expect(st(o, 'biz-start-permit')).not.toBe('excluded');
  });
  it('特定技能・技能実習：開業届は外れる', () => {
    const o = biz('designated');
    for (const id of BIZ) expect(st(o, id), id).toBe('excluded');
    expect(st(o, 'biz-start-permit')).not.toBe('excluded');
  });
  it('文化活動で許可なし・そのほかで就労不可かつ許可なし：外れる', () => {
    for (const id of BIZ) expect(st(biz('cultural', { 'Q-job-permit': 'no' }), id), id).toBe('excluded');
    for (const id of BIZ) expect(st(biz('other', { 'Q-work-limit': 'not_allowed', 'Q-job-permit': 'no' }), id), id).toBe('excluded');
  });
  it('研修・会社：会社をつくる流れは外れる', () => {
    expect(st(go('E-job', { 'Q-job-goal': 'company', 'Q-nationality': 'foreign', 'Q-zairyu-status': 'trainee' }), 'company-setup')).toBe('excluded');
  });
  it('日本国籍・永住者・仕事の在留資格は今までどおり（外れない）', () => {
    expect(st(go('E-job', { 'Q-job-goal': 'biz_start', 'Q-nationality': 'japanese' }), 'biz-start-tax')).not.toBe('excluded');
    expect(st(biz('permanent'), 'biz-start-tax')).not.toBe('excluded');
    expect(st(biz('work'), 'biz-start-tax')).not.toBe('excluded');
  });
});

describe('B-4：短期滞在（観光など）を選べる', () => {
  const short = { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'short_stay' };
  const shown = (o: ReturnType<typeof go>) => o.cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope').map((c) => c.card.id);
  it('在留資格の答えに短期滞在がある', () => {
    expect(data.questions.find((q) => q.id === 'Q-zairyu-status')!.options.map((o) => o.value)).toContain('short_stay');
  });
  it('仕事：在留カードの欄（Q-work-limit）を聞かず、「働く前に入管で相談」だけ', () => {
    for (const goal of ['part_time', 'employ']) {
      const o = go('E-job', { ...short, 'Q-job-goal': goal });
      expect(o.upfront.map((q) => q.id), goal).not.toContain('Q-work-limit');
      expect(shown(o), goal).toEqual(['job-no-work-note']);
    }
  });
  it('個人事業・会社：開業届・会社設立は出ない', () => {
    const o = go('E-job', { ...short, 'Q-job-goal': 'biz_start' });
    for (const id of ['biz-start-kaigyo', 'biz-start-tax', 'biz-start-aoiro', 'biz-start-employees', 'biz-start-hoken']) expect(st(o, id), id).toBe('excluded');
    expect(st(go('E-job', { ...short, 'Q-job-goal': 'company' }), 'company-setup')).toBe('excluded');
  });
  it('在留期間の更新：行き止まりにせず、手続きの画面（短期滞在の案内）を開ける', () => {
    expect(st(go('E-stay-renew', short), 'zairyu-koshin')).toBe('shown');
    expect(event('E-stay-renew').goal_card_ids).toEqual(['zairyu-koshin']);
  });
  it('「そのほか」の人は今までどおり、在留カードの欄を聞く', () => {
    expect(go('E-job', { 'Q-nationality': 'foreign', 'Q-zairyu-status': 'other', 'Q-job-goal': 'part_time' }).upfront.map((q) => q.id)).toContain('Q-work-limit');
  });
});

describe('照合の食い違い4件の文（確認状態は上げない）', () => {
  it('個人事業の許可：働く時間を確かめられるときは包括許可だけ、を書く', () => {
    const c = card('biz-start-permit');
    expect(c.summary.ja).toContain('{包括|ほうかつ}{許可|きょか}だけで{働|はたら}けます');
    expect(c.summary.en).toContain('comprehensive permission alone is enough');
    expect(c.evidence.status).toBe('needs_check');
  });
  it('在留期間の更新：「3か月前から」に6か月以上の条件', () => {
    const c = card('zairyu-koshin');
    for (const lv of ['ja', 'ja_easy']) expect(c.summary[lv]).toMatch(/6か\{月\|げつ\}\{以上\|いじょう\}/);
    expect(c.summary.en).toContain('6 months or longer');
  });
  it('転入届：支所は区民生活課', () => {
    expect(card('nagoya-tennyu-todoke').summary.ja).toContain('{区民|くみん}{生活|せいかつ}{課|か}');
  });
  it('免許の再交付：23の警察署は名古屋市の外（県外ではない）', () => {
    const c = card('license-saikofu');
    expect(c.summary.ja).not.toContain('{県|けん}{外|がい}');
    expect(c.summary.ja).toContain('{名古屋|なごや}{市|し}の{外|そと}の23');
    expect(c.evidence.status).toBe('needs_check');
  });
});
