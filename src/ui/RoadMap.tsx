/* 進み方の道（SPEC 6A.4 v0.5.31。前の形は輪（WorldMap）。VITE_ROAD=off で輪にもどせる）。
   済んだ → 次はこれ（いまの1つ。キャラクターが立つ）→ そのあと → まだわからない → 待つ → あとで → 案内 の段に分ける。
   v0.5.44：いま・確かめる の手続きは、行く所（カードの place）ごとのまとまりで出す。「次はこれ」は、いまの1つと同じ所の手続き全部。
   まとまりの中は上から順（エンジンの順：緊急 → 前提 → 期限のある義務 → 同じ所）。要確認・義務の強さの札は今までどおり（まとめても変えない）。
   項目ごとに「完了」のチェック（onDone）。一部だけ済んでも、残りはそのまま。前の手続きが要る項目は「◯◯のあと」（dayRule の from）。
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
import { visitGroups } from '../core/visitOrder';
import { CheckBox } from './Checklist';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art, artDim } from './art';
import { fill, fmtDay, stateKey, todayWord, unverifiedOb, type StateKey } from './guide';
import { Link } from './router';
import '../styles/road.css';

/** いまの1つ：項目の id（同じ日の予定などは複数）。null は「決まらない」（最初の質問・待つだけ など） */
export function roadNow(out: EngineOutput, today: string): string[] | null {
  const s = nowStep(out, today);
  // 質問が残っている項目（card_q）は「次はこれ」にしない（v0.5.44・C-4）：答えるまで手続きか決まらない。
  // 期限のある義務より任意の項目が先に「次はこれ」に見えないように。道では「まだわからない」の段に出る
  if (s.kind === 'card_q') return null;
  // 日を決める・決めた日を待つ とき（FE-1）：「次はこれ」は並びの最初の手続き（行く日が決まっていても）。
  // 区役所の日を決めたあと、任意の銀行（日がまだ）が「次はこれ」に上がらないように。日を決める画面（nowStep）は今までどおり
  if (s.kind === 'plan' || s.kind === 'until') {
    const first = out.cards.find((c) => (c.section === 'today' || c.section === 'check') && c.state !== 'ask' && c.state !== 'excluded' && c.state !== 'out_of_scope' && c.plan?.status !== 'done');
    if (first) return [first.card.id];
  }
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

/** 行く所でまとめる項目か（いま・確かめる で、質問が残っていない） */
const visitable = (c: CardView) => (c.section === 'today' || c.section === 'check') && c.state !== 'ask';
const MUST_OB = new Set(['legal', 'local_rule']);

export function RoadMap({ cards, now, base = '/c/', listId, track, onDone }: { cards: CardView[]; now: string[] | null; base?: string; listId?: string; /** キャラクターの前の位置を覚える名前（既定は base） */ track?: string;
  /** 項目ごとに「完了」を記録する（v0.5.44）。無ければチェックを出さない */ onDone?: (id: string, done: boolean) => void }) {
  const { level } = usePrefs();
  const box = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Set<StageKey>>(new Set());
  const shown = cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope');
  const hidden = cards.length - shown.length;
  const nowSet = new Set(now ?? []);
  const groups = new Map<StageKey, CardView[]>();
  // いまの1つと同じ所の手続き（v0.5.44）：まとめて「次はこれ」に
  const nowCard = shown.find((c) => nowSet.has(c.card.id) && c.section !== 'done');
  const nowPlace = nowCard && visitable(nowCard) ? nowCard.visitPlace : null;
  for (const c of shown) {
    const k: StageKey = nowSet.has(c.card.id) && c.section !== 'done' ? 'now'
      : nowPlace && visitable(c) && (c.visitPlace === nowPlace || c.altPlace === nowPlace) ? 'now'
      : visitable(c) ? 'today' : stageOf(c);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const stages = ORDER.filter((k) => groups.get(k)?.length);
  const openLeft = shown.some((c) => c.section !== 'done');
  // 関連する情報だけ（手続きがない。例：仕事の基本情報）：質問に答えると決まる、とは言わない（v0.5.32）
  const onlyInfo = openLeft && shown.every((c) => c.section === 'info' || c.section === 'done');
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
  const stop = (c: CardView, isNow: boolean, inVisit = false, altAt?: LocalizedText) => {
    const k = stateKey(c);
    const dim = k === 'check' || k === 'later';
    const from = c.dayRule.kind === 'min' || c.dayRule.kind === 'need_first' ? titleOf(c.dayRule.from) : undefined;
    // 進み方（済み・次はこれ・日付・要確認 など）と、しないといけないか（必要・したほうがよい・案内）は別の札
    const progress: UiKey = isNow ? 'road.next' : k === 'today' ? 'road.todo' : k === 'check' ? 'st.check' : ('st.' + k) as UiKey;
    // 当てはまるかがまだ分からない（要確認の原因が「わからない」など。FE-6）ときは、必要・期限の札を出さない（10.3 の規則3）
    const unsure = c.state === 'check_at_office' && (c.cause === 'unknown' || c.cause === 'no_question' || c.cause === 'coverage');
    const showOb = k !== 'done' && k !== 'info' && k !== 'ask' && !unsure;
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
              {showOb && <span className={'road__tag road__tag--' + OB_CLS[c.card.obligation]}><One k={todayWord(c.card.obligation, unverifiedOb(c))} /></span>}
              {/* 出す方法（v0.5.45）：選んだ方法、または行かない方法（出典つきの方法だけ。FE-17） */}
              {k !== 'done' && c.way && c.ways.length > 1 && <span className="road__tag road__tag--day"><One k={('way.' + c.way) as UiKey} /></span>}
              {k !== 'done' && c.remote && !c.way && <span className="road__tag road__tag--advised"><One k={(c.remoteWays.includes('online') && c.remoteWays.includes('mail') ? 'road.remote.both' : c.remoteWays.includes('online') ? 'road.remote.online' : 'road.remote.mail') as UiKey} /></span>}
              {showOb && MUST_OB.has(c.card.obligation) && c.card.deadline && (c.deadlineOn
                ? <span className="road__tag road__tag--must"><span aria-hidden="true">⏱</span> <One t={fill(ui('road.deadlineOn'), 'date', (lv) => fmtDay(c.deadlineOn!, lv))} /></span>
                : <span className="road__tag road__tag--must"><span aria-hidden="true">⏱</span> <One k="road.deadline" /></span>)}
              {k !== 'done' && c.lateRisk && <span className="road__tag road__tag--late"><span aria-hidden="true">!</span> <One k="road.late" /></span>}
            </span>
            {/* 窓口（同じ建物でも手続きごとに別。v0.5.44） */}
            {inVisit && k !== 'done' && <span className="road__where"><One t={c.card.where.text} /></span>}
            {/* 行かない方法もある手続き：窓口に行くなら同じ所でできる場合がある（FE-16。同じ窓口・1回で済むとは言わない） */}
            {altAt && k !== 'done' && <span className="road__where"><One t={fill(ui('road.visit.maybe'), 'n', (_lv, id) => String((altAt as Record<string, unknown>)[id] ?? altAt.ja))} /></span>}
            {from && k !== 'done' && <span className="road__after"><One t={fill(ui('road.after'), 'n', (_lv, id) => String((from as Record<string, unknown>)[id] ?? from.ja_easy ?? from.ja))} /></span>}
          </span>
        </Link>
        {/* 自分で完了にした項目は、もうできた の段でも外せる（答えから済んだとわかったものは外せないので出さない） */}
        {onDone && (k === 'done' ? c.plan?.status === 'done' : k !== 'info' && k !== 'ask') && (
          <div className="road__check">
            <CheckBox name={line(ui('ov.track.done'), level) + '：' + line(c.card.title, level)} checked={c.plan?.status === 'done'} onChange={(v) => { onDone(c.card.id, v); keepFocus(c.card.id); }}>
              <One k="ov.track.done" />
            </CheckBox>
          </div>
        )}
      </li>
    );
  };
  /** 完了を押すと項目の段が変わる（もうできた へ・もとへ）。フォーカスを移った先の同じチェックへ（FE-5。BODY に落とさない） */
  const keepFocus = (id: string) => {
    const orig = document.activeElement;
    let n = 0;
    const tick = () => {
      const el = box.current?.querySelector<HTMLInputElement>(`[data-card="${CSS.escape(id)}"] input[type=checkbox]`);
      // 段が変わって、押したチェックが作り直されたら、新しいチェックへ。フォーカスがほかへ移っていたら動かさない
      if (el && el !== orig) {
        const a = document.activeElement;
        if (!a || a === document.body || a === orig) el.focus();
        return;
      }
      if (++n < 60) setTimeout(tick, 50);
    };
    setTimeout(tick, 0);
  };
  /** 行く所ごとのまとまり。場所の無い手続きが続くときは「別の所・方法で（1つずつ）」にまとめて見出しを1つ */
  const visits = (list: CardView[], here: boolean) => {
    // 行かない方法もあり方法がまだの手続き（altPlace）は、同じ所へ行くまとまりがあれば、そのまとまりの後ろに「できる場合がある」として付ける
    const firm = new Set(list.map((c) => c.visitPlace).filter(Boolean));
    const alt = list.filter((c) => !c.visitPlace && c.altPlace && firm.has(c.altPlace));
    const chunks: { place: string | null; cards: CardView[]; alt: CardView[] }[] = [];
    for (const g of visitGroups(list.filter((c) => !alt.includes(c)))) {
      const last = chunks.at(-1);
      if (!g.place && last && !last.place) last.cards.push(...g.cards);
      else chunks.push({ place: g.place, cards: [...g.cards], alt: g.place ? alt.filter((c) => c.altPlace === g.place) : [] });
    }
    return chunks.map((ch, i) => {
      const name = ch.place ? ((ui(('placeTitle.' + ch.place) as UiKey) ?? ui(('place.' + ch.place) as UiKey)) as LocalizedText | undefined) : undefined;
      const title = name ? fill(ui('road.visit.at'), 'n', (_lv, id) => String((name as Record<string, unknown>)[id] ?? name.ja)) : ui('road.visit.other');
      return (
        <div key={(ch.place ?? 'other') + i} className={'road__visit' + (ch.place ? '' : ' road__visit--other')}>
          <p className="road__visit-name"><Bi phrase t={title} /></p>
          {ch.place && ch.cards.length > 1 && <p className="road__note"><One k="road.visit.same" /></p>}
          <ul className="road__cards" role="list">
            {ch.cards.map((c) => stop(c, here && nowSet.has(c.card.id), !!ch.place && ch.cards.length > 1))}
            {name && ch.alt.map((c) => stop(c, here && nowSet.has(c.card.id), false, name))}
          </ul>
        </div>
      );
    });
  };

  // まだ答えていない質問・窓口で確かめる項目を見つけやすく（V-5）
  const nAsk = shown.filter((c) => c.state === 'ask' && c.section !== 'done').length;
  const nCheck = shown.filter((c) => c.state === 'check_at_office' && c.section !== 'done' && c.section !== null && c.section !== 'info').length;
  const goAsk = () => {
    const el = box.current?.querySelector<HTMLElement>('.road__stage--ask a');
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  };
  return (
    <div className="road" ref={box}>
      {(nAsk > 0 || nCheck > 0) && (
        <p className="road__summary">
          <One t={fill(fill(ui('road.summary'), 'q', () => String(nAsk)), 'c', () => String(nCheck))} />
          {nAsk > 0 && groups.has('ask') && <> <button type="button" className="link road__summary-go" onClick={goAsk}><One k="road.summary.go" /></button></>}
        </p>
      )}
      <ol className="road__stages" aria-label={line(ui('road.label'), level)}>
        {youAt === 'start' && (
          <li className="road__stage road__stage--start" data-road-here="" data-road-stop="start">
            <span className="road__marker road__marker--you">{you}</span>
            <div className="road__body">
              <p className="road__stage-name"><One k="road.start" /></p>
              <p className="road__note"><One k={onlyInfo ? 'road.onlyInfo' : 'road.noCurrent'} /></p>
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
                <p className="road__stage-name"><Bi k={k === 'today' && !groups.has('now') ? 'road.todo' : STAGE_TITLE[k]} /> <span className="road__count">（{list.length}）</span></p>
                {list.length > 1 && k !== 'done' && k !== 'now' && k !== 'today' && <p className="road__note"><One k="road.anyOrder" /></p>}
                {k === 'now' || k === 'today' ? visits(vis, here) : (
                  <ul className="road__cards" role="list">
                    {vis.map((c) => stop(c, here))}
                  </ul>
                )}
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
export function RoadFor({ cards, out, today, base, listId, onDone }: { cards: CardView[]; out: EngineOutput; today: string; base?: string; listId?: string; onDone?: (id: string, done: boolean) => void }) {
  return <RoadMap cards={cards} now={roadNow(out, today)} base={base} listId={listId} onDone={onDone} />;
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
