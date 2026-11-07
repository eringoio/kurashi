/* 開いた項目（SPEC 6A.4・7章 S5。試作 D の「全体から開いた手続き」の形）。
   画面の順：名前と状態 → 理由の一文 → お知らせ・すぐ行う行動・案内 → できること（公式ページ・電話・日を決める・済んだ）
   → 手続きの方法（押さない一覧）→ 出典の1行 → くわしく（シート）。
   答えた・日を決めたあとは、この項目の上に変わったことを1行で出す（6A.5 v0.5.14）。結果の画面と「つぎへ」は「済んだ」のときだけ。 */
import { useState } from 'react';
import type { EngineOutput } from '../core/engine';
import type { PlanRecord } from '../core/entry';
import type { Question, Value } from '../core/schema';
import { useEvent } from '../guide/useEvent';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { ChangeLine, DayChoice, dayTitle, FocusCard, fmtDay, Notes, officialLink, QuestionBlock, ResultView, SectionWhy, SourceLine, SourcesSheet, StateLabel, stateKey, whyText, type Last } from '../ui/guide';
import { visitGroup } from '../core/visit';
import { Reminder } from '../ui/Reminder';
import { CostChart, FloorPlan } from '../ui/HouseVisual';
import { DATA } from '../core/data';
import type { CardView } from '../core/engine';
import { LifeGuide, MethodList, UrgentAction } from '../ui/patterns';
import { toAlternatives, toGuide, toMethods, toUrgent } from '../ui/patterns/map';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { PageNav } from '../ui/PageNav';
import { useSeen } from '../ui/Words';
import '../styles/card.css';

type Mode = { kind: 'main' } | { kind: 'pick' } | { kind: 'redo'; q: Question } | { kind: 'done' };

/** 開いた項目が使う、保存と判定（引っ越しの useGuide も、イベントの useEvent も、この形に合う） */
export interface CardGuide {
  today: string;
  out: EngineOutput;
  mode: 'public' | 'verified';
  objects: Record<string, boolean>;
  answer(qid: string, v: Value): Promise<void>;
  setPlan(cardId: string, patch: Partial<PlanRecord>): Promise<void>;
  setPlans(cardIds: string[], patch: Partial<PlanRecord>): Promise<void>;
}
/** 道の組み立て：引っ越し（/c/・/now・/all）とイベント（/e/{id}/c/・/e/{id}・/e/{id}/all） */
export interface CardPaths { card: string; now: string; all: string }
const MOVE_PATHS: CardPaths = { card: '/c/', now: '/now', all: '/all' };

export function CardPage({ id, onLive }: { id: string; onLive: (s: string) => void }) {
  return <CardPageView id={id} onLive={onLive} g={useGuide()} paths={MOVE_PATHS} />;
}
/** イベントの項目（/e/{event_id}/c/{card_id}）。保存先は出来事ごとの進捗 */
export function EventCardPage({ eventId, id, onLive }: { eventId: string; id: string; onLive: (s: string) => void }) {
  const ev = useEvent(eventId);
  if (!ev) return <NotFound />;
  const base = '/e/' + eventId;
  return <CardPageView id={id} onLive={onLive} g={{ ...ev, objects: {} }} paths={{ card: base + '/c/', now: base, all: base + '/all' }} />;
}
function NotFound() {
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="card.notFound" /></h1></div>
      <Link to="/" className="link"><Bi k="nav.home" /></Link>
    </>
  );
}

/** tel: の番号。数字と + と # だけ残す（# は %23 に） */
const tel = (n: string) => n.replace(/[^0-9+#]/g, '').replace(/#/g, '%23');
const ExtMark = () => <><span aria-hidden="true" className="clinic__extmark">↗</span><span className="sr-only"><One k="clinic.newTab" /></span></>;

function CardPageView({ id, onLive, g, paths }: { id: string; onLive: (s: string) => void; g: CardGuide; paths: CardPaths }) {
  const { level } = usePrefs();
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'main' });
  const [last, setLast] = useState<Last | null>(null);
  useFocusTitle('card:' + id + ':' + mode.kind);
  const c = g.out.cards.find((x) => x.card.id === id);
  // 手続きの正式名を「ことば」に残す（words.ts の card:{id}）
  useSeen(c ? ['card:' + id] : []);
  if (!c) return <NotFound />;
  const L = (k: UiKey) => line(ui(k), level);
  const k = stateKey(c);
  const canPlan = c.dayRule.kind !== 'no_day' && (c.state === 'shown' || c.state === 'check_at_office') && c.section !== 'done' && c.section !== 'wait';
  const isGuide = c.card.kind === 'guide';
  const recordDone = () => { void g.setPlan(c.card.id, { status: 'done' }); onLive(L('card.recordedDone')); setLast(null); setMode({ kind: 'done' }); };
  const urgent = toUrgent(c.card, recordDone);
  const urgentShown = !!urgent && c.plan?.status !== 'done' && c.questions.length === 0;
  const methods = toMethods(c, g.mode);
  const alts = toAlternatives(c.card, g.mode);
  const official = officialLink(c);
  const phones = urgentShown ? [] : (c.card.urgent?.contacts ?? []).filter((x) => x.type === 'phone');
  const sheetEl = sheet && <SourcesSheet c={c} objects={g.objects} facts={g.out.facts} onClose={() => setSheet(false)} shown={{ where: isGuide }} />;
  const nav = <PageNav now={paths.now} all={paths.all} report={paths.card + id} />;

  if (mode.kind === 'done') {
    // 済んだと記録したときだけ、結果の画面と「つぎへ」（6A.5 v0.5.14）
    return (
      <>
        <ResultView eyebrow="res.done.eyebrow" title={<><Bi phrase t={c.card.title} /> <StateLabel k={k} ob={c.card.obligation} /></>} sub={<><Bi phrase t={whyText(c)} /><SectionWhy c={c} /></>} onNext={() => navigate(paths.now)} rate={c.card.id}>
          <div className="links">
            <button type="button" className="link" onClick={() => setMode({ kind: 'main' })}><Bi k="card.backItem" /></button>
            <button type="button" className="link" onClick={() => setSheet(true)}><Bi k="card.more" /></button>
          </div>
        </ResultView>
        {sheetEl}
      </>
    );
  }
  if (mode.kind === 'pick') {
    return (
      <>
        <div className="head">
          <p className="eyebrow"><One t={c.card.title} /></p>
          <h1 id="screen-title" tabIndex={-1}><Bi phrase t={dayTitle(c)} /></h1>
        </div>
        {/* 日を変えるときは、この項目だけ。初めて決めるときは、同じ所の項目も一緒に聞く */}
        <DayChoice group={c.plan?.planned_on ? [c] : visitGroup(g.out.cards, c)} today={g.today}
          onPick={async (d, ids) => { await g.setPlans(ids, { planned_on: d }); onLive(L('day.set') + fmtDay(d, level)); setLast({ kind: 'planned', cardId: c.card.id, day: d, ids }); setMode({ kind: 'main' }); }}
          onLater={() => setMode({ kind: 'main' })} />
      </>
    );
  }
  const answer = async (q: Question, v: Value) => { await g.answer(q.id, v); setLast({ kind: 'answered', cardId: c.card.id, q }); setMode({ kind: 'main' }); };
  if (mode.kind === 'redo') {
    // 答えを変える：その質問をもう一度聞く
    return (
      <>
        <FocusCard c={c} title />
        <QuestionBlock key={'redo-' + mode.q.id} q={mode.q} onPick={(v) => void answer(mode.q, v)} />
        <button type="button" className="link" onClick={() => setMode({ kind: 'main' })}><Bi k="nav.backPrev" /></button>
      </>
    );
  }

  const officialBtn = official && (
    <a className="k-answer k-official" href={official.url} target="_blank" rel="noopener noreferrer">
      <span className="pt-grow"><Bi phrase k="card.officialOpen" />{official.label ? <span className="pt-hint"><One t={official.label} /></span> : official.owner && <span className="pt-hint" lang="ja">{official.owner}</span>}</span>
      <ExtMark />
    </a>
  );
  return (
    <>
      <ChangeLine last={last} cards={g.out.cards} onUndo={(q) => setMode({ kind: 'redo', q })} />
      <FocusCard c={c} title />
      {/* 理由の一文。「次の答えによって…」は、すぐ下に質問があるので出さない（K-44） */}
      {!isGuide && c.state !== 'ask' && <p className="sub"><Bi phrase t={whyText(c)} /></p>}
      <SectionWhy c={c} />
      {c.outdated && <Outdated c={c} />}
      {/* お知らせ（期間の中だけ。B-7c） */}
      {c.notices.map((n, i) => <p key={i} className="k-notice" role="note"><Bi t={n.text} /></p>)}
      {urgentShown && <UrgentAction a={urgent!} />}
      {isGuide && <LifeGuide g={toGuide(c.card, g.mode)} />}
      {c.card.visual === 'floorplan' && <FloorPlan />}
      {c.card.visual === 'costs' && <CostChart />}
      {c.card.reminder && c.state !== 'excluded' && c.questions.length === 0 && <Reminder card={c.card} />}
      <Notes c={c} where="page" />

      {c.questions.length > 0 ? (
        // 1画面に1つの判断（15.2）：確かめの質問があるときは、それだけを出す
        <>
          <QuestionBlock key={c.questions[0].id} q={c.questions[0]} onPick={(v) => void answer(c.questions[0], v)} />
          {officialBtn}
        </>
      ) : (
        <div className="list k-actions">
          {officialBtn}
          {phones.map((p) => (
            <a key={p.value} className="k-answer" href={'tel:' + tel(p.value)}>
              <span className="pt-grow"><Bi phrase k="card.call" /><span className="pt-hint"><One t={p.label} />　<span lang="en">{p.value}</span></span></span>
            </a>
          ))}
          {canPlan && !c.plan?.planned_on && (
            <button type="button" className="k-answer k-answer--primary" onClick={() => setMode({ kind: 'pick' })}><img src={art('calendar')} alt="" /><Bi phrase k="day.choose" /></button>
          )}
          {canPlan && c.plan?.planned_on && (
            <>
              <p className="planned"><One k="card.planned" />：<strong>{fmtDay(c.plan.planned_on, level)}</strong></p>
              <button type="button" className="k-answer" onClick={() => setMode({ kind: 'pick' })}><Bi phrase k="day.change" /></button>
            </>
          )}
          {!isGuide && !urgent && (c.state === 'shown' || c.state === 'check_at_office') && c.plan?.status !== 'done' && c.sectionWhy !== 'answer' && (
            <button type="button" className="k-answer" onClick={recordDone}>
              <img src={art('badge')} alt="" /><Bi k="card.done" />
            </button>
          )}
          {!isGuide && c.plan?.status === 'done' && (
            <button type="button" className="k-answer" onClick={() => { void g.setPlan(c.card.id, { status: 'todo' }); onLive(L('card.recordedUndone')); }}><Bi phrase k="card.undone" /></button>
          )}
        </div>
      )}
      {/* ほかの公式ページ（K-12・K-13）。最初の1つは上のボタン */}
      {c.card.links && c.card.links.length > 1 && (
        <ul className="clinic__links" role="list">
          {c.card.links.slice(1).map((l) => (
            <li key={l.url}><a className="link clinic__ext" href={l.url} target="_blank" rel="noopener noreferrer"><Bi phrase t={l.label} /><ExtMark /></a></li>
          ))}
        </ul>
      )}
      {methods.length > 0 && c.questions.length === 0 && <MethodList methods={methods} />}
      {alts.length > 0 && (
        <div className="k-notice" role="note">
          <p className="label"><One k="ev.alt" />{alts.some((a) => a.unverified) && <> <span className="pt-tag"><One k="pat.confirm" /></span></>}</p>
          {alts.map((a, i) => <p key={i}><Bi t={a.text} /></p>)}
        </div>
      )}
      <SourceLine c={c} />
      <button type="button" className="link" onClick={() => setSheet(true)}><Bi k="card.more" /></button>
      {nav}
      {sheetEl}
    </>
  );
}

/** 確認の期限を過ぎた（12.3 の A2）：色＋縦の線＋文字の注記と、公式のページへのリンク */
function Outdated({ c }: { c: CardView }) {
  const src = c.card.evidence.source_ids.map((id) => DATA().sources.find((s) => s.source_id === id)).find((s) => s?.url);
  return (
    <div className="k-notice k-notice--warn" role="note">
      <Bi k="card.outdated" />
      {src?.url && <a className="link" href={src.url} target="_blank" rel="noopener noreferrer"><Bi k="card.outdatedLink" /><ExtMark /></a>}
    </div>
  );
}
