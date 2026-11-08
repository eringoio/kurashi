/* 進み方の道の見本ページ（/dev/road）。開発のときだけ（App.tsx が import.meta.env.DEV のときだけ読み込む）。
   本物のカードのデータに、見本の進み方（済み・いま・あとで など）を付けて、輪と道を並べる。進み方は見本で、判定ではない。 */
import { useState } from 'react';
import { DATA } from '../core/data';
import type { CardView, Section, DisplayState } from '../core/engine';
import { Bi } from '../i18n/Ruby';
import type { LocalizedText } from '../i18n/text';
import { WorldMap } from '../ui/guide';
import { RoadMap } from '../ui/RoadMap';
import { useFocusTitle } from '../ui/router';

const t = (ja: string, en: string, ja_easy: string = ja): LocalizedText => ({ ja, ja_easy, en });

type S = [id: string, section: Section | null, state?: DisplayState, extra?: Partial<CardView>];
function mk([id, section, state = 'shown', extra]: S): CardView {
  const card = DATA().cards.find((c) => c.id === id);
  if (!card) throw new Error('カードがない：' + id);
  return {
    card, state, section, sectionWhy: null, goal: false, afterFrom: null, cause: null, reasonFacts: [], reasonRules: [], falseRule: null,
    questions: [], notes: [], dayRule: { kind: 'free' }, plan: null, questionRank: 0, outdated: false, notices: [], methods: [], ...extra,
  };
}
const done = { plan: { status: 'done' } } as Partial<CardView>;
const after = (from: string) => ({ dayRule: { kind: 'need_first', from } }) as Partial<CardView>;
const day = (d: string) => ({ plan: { planned_on: d, status: 'todo' } }) as Partial<CardView>;

const A1 = ['nagoya-tennyu-todoke', 'nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu', 'bank-account-open', 'mail-forward'];
interface Case { title: LocalizedText; cards: S[]; now: string[] | null }
const CASES: Case[] = [
  { title: t('1. {全部|ぜんぶ}まだ（いまの1つは{最初|さいしょ}）', '1. Nothing done yet'), now: [A1[0]],
    cards: [[A1[0], 'today'], [A1[1], 'today'], [A1[2], 'later', 'shown', after(A1[0])], [A1[3], 'later', 'shown', after(A1[0])], [A1[4], 'later'], [A1[5], 'info']] },
  { title: t('2. 1つ{目|め}が{済|す}み、2つ{目|め}がいま', '2. First done, second is current'), now: [A1[1]],
    cards: [[A1[0], 'done', 'shown', done], [A1[1], 'today'], [A1[2], 'today'], [A1[3], 'later'], [A1[4], 'later'], [A1[5], 'info']] },
  { title: t('3. {途中|とちゅう}（{要確認|ようかくにん}・まだわからない・{待|ま}つ がある）', '3. Midway, with to-check, unknown and waiting'), now: [A1[2]],
    cards: [[A1[0], 'done', 'shown', done], [A1[1], 'done', 'shown', done], [A1[2], 'today'], [A1[3], 'check', 'check_at_office'], ['zairyu-shikakugai', null, 'ask'], ['life-water', 'wait'], [A1[4], 'later'], [A1[5], 'info'], ['bank-card-stop', null, 'excluded']] },
  { title: t('4. {全部|ぜんぶ}{済|す}み', '4. All done'), now: null,
    cards: A1.slice(0, 4).map((id): S => [id, 'done', 'shown', done]) },
  { title: t('5. {同|おな}じ{日|ひ}に2つ（{並|なら}んで{進|すす}む）', '5. Two on the same day (in parallel)'), now: [A1[0], A1[1]],
    cards: [[A1[0], 'today', 'shown', day('2026-11-10')], [A1[1], 'today', 'shown', day('2026-11-10')], [A1[2], 'today'], [A1[4], 'later']] },
  { title: t('6. とても{多|おお}い', '6. Very many steps'), now: ['bank-account-open'],
    cards: [...A1.slice(0, 4).map((id): S => [id, 'done', 'shown', done]), ['bank-account-open', 'today'], ['mail-forward', 'today'], ['housing-move-in', 'today'], ['job-shakai-hoken', 'check', 'check_at_office'], ['job-rodo-joken', 'check', 'check_at_office'],
      ['zairyu-shikakugai', null, 'ask'], ['job-side-work', null, 'ask'], ['life-water', 'wait'], ['bank-info-change', 'later'], ['bank-resident-change', 'later'], ['housing-contract-check', 'later'], ['housing-guarantor', 'later'], ['housing-initial-costs', 'later'], ['job-phrases', 'info'], ['job-trouble', 'info']] },
  { title: t('7. 1つだけ', '7. Only one step'), now: ['zairyu-koshin'], cards: [['zairyu-koshin', 'today']] },
  { title: t('8. いまの1つが{決|き}まらない（{最初|さいしょ}の{質問|しつもん}の{前|まえ}）', '8. No current step yet (before the first question)'), now: null,
    cards: [[A1[0], null, 'ask'], [A1[1], null, 'ask'], [A1[2], 'later']] },
];

const STEPS = ['nagoya-tennyu-todoke', 'nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu', 'bank-account-open'];

/** キャラクターの動き：「1つ済ませる」で、いまの1つが次へ。項目を押して開いても（このページから離れても）、いまの1つは変わらない */
function Walk() {
  const [n, setN] = useState(0);
  const cards = STEPS.map((id, i): CardView => mk([id, i < n ? 'done' : 'today', 'shown', i < n ? done : undefined]));
  return (
    <section className="pt-case">
      <h2><Bi phrase t={t('9. {進|すす}むとキャラクターが{歩|ある}く', '9. The character walks when you progress')} /></h2>
      <div className="links">
        <button type="button" className="seg" onClick={() => setN(Math.min(STEPS.length, n + 1))}><Bi t={t('1つ{済|す}ませる', 'Finish one')} /></button>
        <button type="button" className="seg" onClick={() => setN(Math.max(0, n - 1))}><Bi t={t('1つもどす', 'Undo one')} /></button>
      </div>
      <RoadMap cards={cards} now={n < STEPS.length ? [STEPS[n]] : null} track="dev-walk" />
    </section>
  );
}

export default function DevRoad() {
  useFocusTitle('dev-road');
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase t={t('{進|すす}み{方|かた}の{道|みち}（{見本|みほん}）', 'Progress road (samples)')} /></h1></div>
      <p className="pt-sample"><Bi t={t('{本物|ほんもの}のカードに、{見本|みほん}の{進|すす}み{方|かた}を{付|つ}けています。{判定|はんてい}ではありません。', 'Real cards with sample progress. Not a real assessment.')} /></p>
      <Walk />
      {CASES.map((c, i) => {
        const cards = c.cards.map(mk);
        return (
          <section className="pt-case" key={i}>
            <h2><Bi phrase t={c.title} /></h2>
            <RoadMap cards={cards} now={c.now} track={'dev-' + i} />
            <details className="group__more"><summary><Bi t={t('{輪|わ}（いまの{形|かたち}）で{見|み}る', 'See as the ring (current UI)')} /></summary><WorldMap cards={cards} /></details>
          </section>
        );
      })}
    </>
  );
}
