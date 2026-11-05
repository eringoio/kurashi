/* 開いた項目（SPEC 6A.4・7章 S5。試作 D の「全体から開いた手続き」の形）。
   画面には、状態・理由の一文・その項目でできること（確かめの1問に答える／日を決める／済んだと記録する）だけを出す。
   正式名・期限・窓口・出典は「くわしく」のシート（5.3：触れば必ず見られる）。
   操作した結果は、この項目の中で見せ、「つぎへ」でいまの1つへ進む（6A.1「本人が開いた項目を尊重する」）。 */
import { useState } from 'react';
import type { EngineOutput } from '../core/engine';
import type { PlanRecord } from '../core/entry';
import type { Value } from '../core/schema';
import { useEvent } from '../guide/useEvent';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { DayChoice, dayTitle, fillDate, FocusCard, fmtDay, Notes, QuestionBlock, ResultView, SectionWhy, SourcesSheet, StateLabel, stateKey, whyText } from '../ui/guide';
import { visitGroup } from '../core/visit';
import { DATA } from '../core/data';
import type { CardView } from '../core/engine';
import { LifeGuide, MethodChooser, UrgentAction } from '../ui/patterns';
import { toAlternatives, toGuide, toMethods, toUrgent } from '../ui/patterns/map';
import { PlannedList } from './Plan';
import { Link, navigate, useFocusTitle } from '../ui/router';

type Mode = { kind: 'main' } | { kind: 'pick' } | { kind: 'answered' } | { kind: 'planned'; day: string; ids: string[] } | { kind: 'done' };

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
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="card.notFound" /></h1></div>
      <Link to="/" className="link"><Bi k="nav.home" /></Link>
    </>
  );
}

function CardPageView({ id, onLive, g, paths }: { id: string; onLive: (s: string) => void; g: CardGuide; paths: CardPaths }) {
  const { level } = usePrefs();
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'main' });
  useFocusTitle('card:' + id + ':' + mode.kind);
  const c = g.out.cards.find((x) => x.card.id === id);
  if (!c) return <NotFound />;
  const L = (k: UiKey) => line(ui(k), level);
  const k = stateKey(c);
  const canPlan = c.dayRule.kind !== 'no_day' && (c.state === 'shown' || c.state === 'check_at_office') && c.section !== 'done' && c.section !== 'wait';
  const next = () => navigate(paths.now);
  const [method, setMethod] = useState<string | null>(null);
  const isGuide = c.card.kind === 'guide';
  const urgent = toUrgent(c.card, () => { void g.setPlan(c.card.id, { status: 'done' }); onLive(L('card.recordedDone')); setMode({ kind: 'done' }); });
  const methods = toMethods(c, g.mode);
  const alts = toAlternatives(c.card, g.mode);
  const more = <button type="button" className="link" onClick={() => setSheet(true)}><Bi k="card.more" /></button>;
  const sheetEl = sheet && <SourcesSheet c={c} objects={g.objects} facts={g.out.facts} onClose={() => setSheet(false)} />;
  const titleWithState = <><Bi t={c.card.title} /> <StateLabel k={k} ob={c.card.obligation} /></>;

  if (mode.kind === 'answered' || mode.kind === 'done') {
    return (
      <>
        <ResultView eyebrow={mode.kind === 'done' ? 'res.done.eyebrow' : 'res.answer.eyebrow'} title={titleWithState} sub={<><Bi t={whyText(c)} /><SectionWhy c={c} /></>} onNext={next}>
          <div className="links">
            <button type="button" className="link" onClick={() => setMode({ kind: 'main' })}><Bi k="card.backItem" /></button>
            {more}
          </div>
        </ResultView>
        {sheetEl}
      </>
    );
  }
  if (mode.kind === 'planned') {
    return (
      <ResultView eyebrow="res.planned.eyebrow" title={<Bi t={fillDate(ui('res.planned.title'), mode.day)} />} sub={<><PlannedList ids={mode.ids} cards={g.out.cards} /><Bi k="res.planned.sub" /></>} onNext={next}>
        <button type="button" className="link" onClick={() => setMode({ kind: 'pick' })}><Bi k="day.change" /></button>
      </ResultView>
    );
  }
  if (mode.kind === 'pick') {
    return (
      <>
        <div className="head">
          <p className="eyebrow"><One t={c.card.title} /></p>
          <h1 id="screen-title" tabIndex={-1}><Bi t={dayTitle(c)} /></h1>
        </div>
        {/* 日を変えるときは、この項目だけ。初めて決めるときは、同じ所の項目も一緒に聞く */}
        <DayChoice group={c.plan?.planned_on ? [c] : visitGroup(g.out.cards, c)} today={g.today}
          onPick={async (d, ids) => { await g.setPlans(ids, { planned_on: d }); onLive(L('day.set') + fmtDay(d, level)); setMode({ kind: 'planned', day: d, ids }); }}
          onLater={() => setMode({ kind: 'main' })} />
      </>
    );
  }

  const answer = async (qid: string, v: Value) => { await g.answer(qid, v); setMode({ kind: 'answered' }); };
  return (
    <>
      <FocusCard c={c} title />
      {!isGuide && <p className="sub"><Bi t={whyText(c)} /></p>}
      <SectionWhy c={c} />
      {c.outdated && <Outdated c={c} />}
      {urgent && c.plan?.status !== 'done' && c.questions.length === 0 && <UrgentAction a={urgent} />}
      {isGuide && <LifeGuide g={toGuide(c.card, g.mode)} />}
      <Notes c={c} where="page" />
      {alts.length > 0 && (
        <div className="k-notice" role="note">
          <p className="label"><One k="ev.alt" /></p>
          {alts.map((a, i) => <p key={i}><Bi t={a.text} />{a.unverified && <> <One k="pat.confirm" /></>}{a.aiChecked && <> <span className="pt-tag pt-tag--ai"><One k="pat.aiChecked" /></span></>}</p>)}
        </div>
      )}
      {methods.length > 0 && c.questions.length === 0 && <MethodChooser methods={methods} value={method} onChange={setMethod} />}

      {c.questions.length > 0 ? (
        // 1画面に1つの判断（15.2）：確かめの質問があるときは、それだけを出す
        <QuestionBlock key={c.questions[0].id} q={c.questions[0]} onPick={(v) => void answer(c.questions[0].id, v)} />
      ) : (
        <div className="list">
          {canPlan && !c.plan?.planned_on && (
            <button type="button" className="k-answer k-answer--primary" onClick={() => setMode({ kind: 'pick' })}><img src={art('calendar')} alt="" /><Bi k="day.choose" /></button>
          )}
          {canPlan && c.plan?.planned_on && (
            <>
              <p className="planned"><One k="card.planned" />：<strong>{fmtDay(c.plan.planned_on, level)}</strong></p>
              <button type="button" className="k-answer" onClick={() => setMode({ kind: 'pick' })}><Bi k="day.change" /></button>
            </>
          )}
          {!isGuide && !urgent && (c.state === 'shown' || c.state === 'check_at_office') && c.plan?.status !== 'done' && c.sectionWhy !== 'answer' && (
            <button type="button" className="k-answer" onClick={() => { void g.setPlan(c.card.id, { status: 'done' }); onLive(L('card.recordedDone')); setMode({ kind: 'done' }); }}>
              <img src={art('badge')} alt="" /><Bi k="card.done" />
            </button>
          )}
          {!isGuide && c.plan?.status === 'done' && (
            <button type="button" className="k-answer" onClick={() => { void g.setPlan(c.card.id, { status: 'todo' }); onLive(L('card.recordedUndone')); }}><Bi k="card.undone" /></button>
          )}
        </div>
      )}

      {more}
      <div className="links">
        <Link to={paths.now} className="link"><Bi k="now.back" /></Link>
        <Link to={paths.all} className="link"><Bi k="nav.backAll" /></Link>
      </div>
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
      {src?.url && <a className="link" href={src.url} target="_blank" rel="noopener noreferrer"><Bi k="card.outdatedLink" /></a>}
    </div>
  );
}
