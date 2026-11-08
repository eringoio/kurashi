/* 進み方の道（SPEC 6A.4 v0.5.31。前の形は輪（WorldMap）。VITE_ROAD=off で輪にもどせる）。
   済んだ → 次はこれ（いまの1つ。キャラクターが立つ）→ そのあと → 確かめる → まだわからない → 待つ → あとで → 案内 の段に分ける。
   段の中の項目は順番を決めない（「どの順でもできます」）。前の手続きが要る項目だけ「◯◯のあと」と書く（dayRule の from）。
   キャラクターは「いまの1つ」（nowStep）の段に立つ。項目を押して開いても、いまの1つが変わらなければ動かない。
   決まらないとき（最初の質問の前など）は、はじめに立って理由の一文を出す。全部済んだら最後に立つ。
   狭い箱は縦（左に道、右に項目）、広い箱（720px〜）は横（上に道、下に項目。多いときは横に動かせる）。色は tokens.css の変数だけ。
   道の下は持ち物（RoadBring）。同じ項目の一覧は出さない（関係なかったものの理由だけ、閉じた一覧で残す）。 */
import { useLayoutEffect, useRef, useState } from 'react';
import { DATA } from '../core/data';
import type { CardView, EngineOutput } from '../core/engine';
import type { bringPlan } from '../core/accompany';
import type { Text } from '../core/schema';
import { nowStep } from '../core/now';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art, artDim } from './art';
import { fill, fmtDay, stateKey, todayWord, type StateKey } from './guide';
import { Link } from './router';
import '../styles/road.css';

/** いまの1つ：項目の id（同じ日の予定などは複数）。null は「決まらない」（最初の質問・待つだけ など） */
export function roadNow(out: EngineOutput, today: string): string[] | null {
  const s = nowStep(out, today);
  if ('view' in s) return [s.view.card.id];
  if ('views' in s) return s.views.map((c) => c.card.id);
  return null;
}

type StageKey = 'done' | 'now' | 'today' | 'check' | 'ask' | 'wait' | 'later' | 'info';
const STAGE_TITLE: Record<StageKey, UiKey> = {
  done: 'sec.done', now: 'road.next', today: 'road.now', check: 'sec.check', ask: 'st.ask', wait: 'sec.wait', later: 'sec.later', info: 'sec.info',
};
const STAGE_MARK: Record<StageKey, string> = { done: '✓', now: '●', today: '○', check: '！', ask: '？', wait: '…', later: '→', info: 'i' };
const CLS: Record<StateKey, string> = { today: 'now', check: 'check', ask: 'ask', wait: 'wait', later: 'later', info: 'info', done: 'done', excluded: 'out', out: 'out' };
/** しないといけないか（todayWord と同じ分け方）の札の形 */
const OB_CLS: Record<CardView['card']['obligation'], string> = { legal: 'must', local_rule: 'must', practical: 'advised', check: 'optional', optional: 'optional', none: 'optional' };
/** 1つの段に出す数。多いときは「ほかに◯件」（押すと、その段を全部出す） */
const MAX = { done: 3, other: 4 };

const stageOf = (c: CardView): StageKey => (c.state === 'ask' ? 'ask' : (c.section ?? 'later') as StageKey);
const ORDER: StageKey[] = ['done', 'now', 'today', 'check', 'ask', 'wait', 'later', 'info'];

/** 前のキャラクターの位置（画面を移っても、いまの1つが変わったときだけ動かすため） */
const lastNow = new Map<string, string>();

export function RoadMap({ cards, now, base = '/c/', listId, track }: { cards: CardView[]; now: string[] | null; base?: string; listId?: string; /** キャラクターの前の位置を覚える名前（既定は base） */ track?: string }) {
  const { level } = usePrefs();
  const box = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Set<StageKey>>(new Set());
  const shown = cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope');
  const hidden = cards.length - shown.length;
  const nowSet = new Set(now ?? []);
  const groups = new Map<StageKey, CardView[]>();
  for (const c of shown) {
    const k: StageKey = nowSet.has(c.card.id) && c.section !== 'done' ? 'now' : stageOf(c);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const stages = ORDER.filter((k) => groups.get(k)?.length);
  const openLeft = shown.some((c) => c.section !== 'done');
  // キャラクターの段：いまの1つ／決まらないとき「はじめ」／全部済んだら「おわり」
  const youAt: 'now' | 'start' | 'end' = groups.has('now') ? 'now' : openLeft ? 'start' : 'end';
  const youKey = youAt === 'now' ? now![0] : youAt;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const you = el.querySelector<HTMLElement>('.road__you');
    const here = el.querySelector<HTMLElement>('[data-road-here]');
    // 横の道：いまの段が見えるように、道の箱だけを動かす（ページは動かさない）
    const sc = el.querySelector<HTMLElement>('.road__stages');
    if (sc && here && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, here.offsetLeft - 24);
    // いまの1つが変わったら、前の段から短く歩く（動きを減らす設定では動かさない）
    const key = track ?? base;
    const prev = lastNow.get(key);
    const from = prev && prev !== youKey ? el.querySelector<HTMLElement>(`[data-road-stop="${CSS.escape(prev)}"]`) : null;
    lastNow.set(key, youKey);
    if (!you || !from || typeof you.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const a = from.getBoundingClientRect(), b = you.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    you.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 480, easing: 'ease-out' });
  }, [youKey]);

  if (!shown.length) return null;
  const toList = () => {
    const el = listId ? document.getElementById(listId) : null;
    el?.scrollIntoView({ block: 'start' });
    el?.focus({ preventScroll: true });
  };
  const titleOf = (id: string) => DATA().cards.find((x) => x.id === id)?.title;
  const you = (
    <span className="road__you-wrap">
      <img className="road__you" src={art('you')} alt="" aria-hidden="true" />
      <span className="sr-only"><One k="road.you" /></span>
    </span>
  );

  // 部品にせず関数で出す（描くたびに作り直さない）
  const stop = (c: CardView, isNow: boolean) => {
    const k = stateKey(c);
    const dim = k === 'check' || k === 'later';
    const from = c.dayRule.kind === 'min' || c.dayRule.kind === 'need_first' ? titleOf(c.dayRule.from) : undefined;
    // 進み方（済み・次はこれ・日付・要確認 など）と、しないといけないか（必要・したほうがよい・案内）は別の札
    const progress: UiKey = isNow ? 'road.next' : k === 'today' ? 'road.todo' : k === 'check' ? 'st.check' : ('st.' + k) as UiKey;
    const showOb = k !== 'done' && k !== 'info' && k !== 'ask';
    return (
      <li key={c.card.id} data-card={c.card.id} className={'road__card road__card--' + CLS[k] + (isNow ? ' road__card--here' : '')}>
        <Link to={base + c.card.id} className="road__link" aria-current={isNow ? 'step' : undefined}>
          <span className="road__pic" aria-hidden="true">
            <img src={k === 'ask' ? art('ask') : artDim(c.card.illustration, dim)} alt="" />
            {k === 'done' && <img className="road__badge" src={art('badge')} alt="" />}
            {k === 'wait' && <img className="road__badge" src={art('clock')} alt="" />}
          </span>
          <span className="road__text">
            <span className="road__name"><One t={c.card.title} /></span>
            <span className="road__tags">
              <span className={'road__tag road__tag--' + (isNow ? 'here' : CLS[k])}><span aria-hidden="true">{isNow ? '●' : STAGE_MARK[stageOf(c)]}</span> <One k={progress} /></span>
              {/* いまの1つでも、要確認・まだわからない・待つ は消さない（一覧の区分けと同じ事実） */}
              {isNow && (k === 'check' || k === 'ask' || k === 'wait') && (
                <span className={'road__tag road__tag--' + CLS[k]}><span aria-hidden="true">{STAGE_MARK[stageOf(c)]}</span> <One k={k === 'check' ? 'st.check' : ('st.' + k) as UiKey} /></span>
              )}
              {c.plan?.planned_on && k !== 'done' && <span className="road__tag road__tag--day">{fmtDay(c.plan.planned_on, level)}</span>}
              {showOb && <span className={'road__tag road__tag--' + OB_CLS[c.card.obligation]}><One k={todayWord(c.card.obligation)} /></span>}
            </span>
            {from && k !== 'done' && <span className="road__after"><One t={fill(ui('road.after'), 'n', (_lv, id) => String((from as Record<string, unknown>)[id] ?? from.ja_easy ?? from.ja))} /></span>}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="road" ref={box}>
      <ol className="road__stages" aria-label={line(ui('road.label'), level)}>
        {youAt === 'start' && (
          <li className="road__stage road__stage--start" data-road-here="" data-road-stop="start">
            <span className="road__marker road__marker--you">{you}</span>
            <div className="road__body">
              <p className="road__stage-name"><One k="road.start" /></p>
              <p className="road__note"><One k="road.noCurrent" /></p>
            </div>
          </li>
        )}
        {stages.map((k) => {
          const list = groups.get(k)!;
          const max = k === 'done' ? MAX.done : MAX.other;
          // 済んだ段は新しいもの（最後のほう）を見せる
          const vis = list.length > max && !opened.has(k) ? (k === 'done' ? list.slice(-max) : list.slice(0, max)) : list;
          const rest = list.length - vis.length;
          const here = k === 'now';
          return (
            <li key={k} className={'road__stage road__stage--' + k} {...(here ? { 'data-road-here': '' } : {})}
              data-road-stop={here ? now![0] : undefined}>
              <span className={'road__marker' + (here ? ' road__marker--you' : '')}>
                {here ? you : <span className="road__dot" aria-hidden="true">{STAGE_MARK[k]}</span>}
              </span>
              <div className="road__body">
                <p className="road__stage-name"><Bi k={STAGE_TITLE[k]} /> <span className="road__count">（{list.length}）</span></p>
                {list.length > 1 && k !== 'done' && <p className="road__note"><One k="road.anyOrder" /></p>}
                <ul className="road__cards" role="list">
                  {vis.map((c) => stop(c, here))}
                </ul>
                {rest > 0 && (
                  <button type="button" className="road__more link" aria-expanded="false" onClick={() => {
                    // 段を全部出し、出てきた最初の項目へ移る（キーボードで続けて進める）
                    const first = k === 'done' ? list[0] : list[max];
                    setOpened(new Set([...opened, k]));
                    setTimeout(() => box.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(first.card.id)}"] a`)?.focus(), 0);
                  }}>
                    <One t={fill(ui('all.more'), 'n', () => String(rest))} />
                  </button>
                )}
              </div>
              {/* 前にいまの1つだった項目の位置（歩く動きの始まり）。済んだ段の項目ごと */}
              {!here && list.map((c) => <span key={c.card.id} className="road__ghost" data-road-stop={c.card.id} aria-hidden="true" />)}
            </li>
          );
        })}
        {youAt === 'end' && (
          <li className="road__stage road__stage--end" data-road-here="" data-road-stop="end">
            <span className="road__marker road__marker--you">{you}</span>
            <div className="road__body"><p className="road__stage-name"><One k="road.allDone" /></p></div>
          </li>
        )}
      </ol>
      {hidden > 0 && listId && (
        <button type="button" className="road__more link" onClick={toList}>
          <One t={fill(ui('road.hidden'), 'n', () => String(hidden))} />
        </button>
      )}
    </div>
  );
}

/** 画面から使う形：いまの1つは nowStep から決める（輪と同じデータ。判定は変えない） */
export function RoadFor({ cards, out, today, base, listId }: { cards: CardView[]; out: EngineOutput; today: string; base?: string; listId?: string }) {
  return <RoadMap cards={cards} now={roadNow(out, today)} base={base} listId={listId} />;
}

/** 道の下の持ち物（SPEC 6A.4 v0.5.31）：行く所ごとに、まだの手続きで使う物。持っているか（入口で答えた物）を札で。
    ほかに要る物は窓口で確認（visit.bring.other）。行く日の「行く前」のチェックは付き添いの画面のまま */
/** known：持っているかを聞いた（引っ越しの入口）。聞いていないできごとでは札を出さない */
export function RoadBring({ plan, known = true }: { plan: ReturnType<typeof bringPlan>; known?: boolean }) {
  if (!plan.length) return null;
  const pick = (t: Text, id: string) => String((t as Record<string, unknown>)[id] ?? t.ja_easy ?? t.ja);
  return (
    <section className="road-bring" aria-labelledby="road-bring">
      <h2 id="road-bring"><Bi phrase k="road.bring.title" /></h2>
      {plan.map((p) => {
        const name = (ui(('placeTitle.' + p.place) as UiKey) ?? ui(('place.' + p.place) as UiKey)) as LocalizedText | undefined;
        return (
          <div key={p.place} className="road-bring__place">
            {name && <h3><Bi phrase t={name} /></h3>}
            <ul role="list" className="road-bring__list">
              {p.bring.map((b) => {
                const used = p.cards.filter((c) => (b.object.bring_for ?? []).includes(c.card.id));
                return (
                  <li key={b.object.id} className={'road-bring__item' + (b.held || !known ? '' : ' road-bring__item--missing')}>
                    <img src={artDim(b.object.illustration, known && !b.held)} alt="" aria-hidden="true" />
                    <span className="road__text">
                      <span className="road__name"><One t={b.object.title} /></span>
                      {known && <span className="road__tags">
                        <span className={'road__tag road__tag--' + (b.held ? 'done' : 'ask')}><span aria-hidden="true">{b.held ? '✓' : '−'}</span> <One k={b.held ? 'road.bring.held' : 'road.bring.missing'} /></span>
                      </span>}
                      {used.length > 0 && <span className="road__after"><One t={fill(ui('road.bring.for'), 'n', (_lv, id) => used.map((c) => pick(c.card.title, id)).join('・'))} /></span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="sub"><Bi k="visit.bring.other" /></p>
    </section>
  );
}
