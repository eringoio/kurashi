/* 開いた項目（SPEC 6A.4・7章 S5。試作 D の「全体から開いた手続き」の形）。
   画面には、状態・理由の一文・その項目でできること（確かめの1問に答える／日を決める／済んだと記録する）だけを出す。
   正式名・期限・窓口・出典は「くわしく」のシート（5.3：触れば必ず見られる）。
   操作した結果は、この項目の中で見せ、「つぎへ」でいまの1つへ進む（6A.1「本人が開いた項目を尊重する」）。 */
import { useState } from 'react';
import type { Value } from '../core/schema';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { DayChoice, dayTitle, fillDate, FocusCard, fmtDay, Notes, QuestionBlock, ResultView, SectionWhy, SourcesSheet, StateLabel, stateKey, whyText } from '../ui/guide';
import { visitGroup } from '../core/visit';
import { PlannedList } from './Plan';
import { Link, navigate, useFocusTitle } from '../ui/router';

type Mode = { kind: 'main' } | { kind: 'pick' } | { kind: 'answered' } | { kind: 'planned'; day: string; ids: string[] } | { kind: 'done' };

export function CardPage({ id, onLive }: { id: string; onLive: (s: string) => void }) {
  const g = useGuide();
  const { level } = usePrefs();
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'main' });
  useFocusTitle('card:' + id + ':' + mode.kind);
  const c = g.out.cards.find((x) => x.card.id === id);
  if (!c) {
    return (
      <>
        <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="card.notFound" /></h1></div>
        <Link to="/" className="link"><Bi k="nav.home" /></Link>
      </>
    );
  }
  const L = (k: UiKey) => line(ui(k), level);
  const k = stateKey(c);
  const canPlan = (c.state === 'shown' || c.state === 'check_at_office') && c.section !== 'done' && c.section !== 'wait';
  const next = () => navigate('/now');
  const more = <button type="button" className="link" onClick={() => setSheet(true)}><Bi k="card.more" /></button>;
  const sheetEl = sheet && <SourcesSheet c={c} objects={g.objects} facts={g.out.facts} onClose={() => setSheet(false)} />;
  const titleWithState = <><Bi t={c.card.title} /> <StateLabel k={k} /></>;

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
      <ResultView eyebrow="res.planned.eyebrow" title={<Bi t={fillDate(ui('res.planned.title'), mode.day)} />} sub={<><PlannedList ids={mode.ids} /><Bi k="res.planned.sub" /></>} onNext={next}>
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
          onPick={async (d, ids) => { for (const id of ids) await g.setPlan(id, { planned_on: d }); onLive(L('day.set') + fmtDay(d, level)); setMode({ kind: 'planned', day: d, ids }); }}
          onLater={() => setMode({ kind: 'main' })} />
      </>
    );
  }

  const answer = async (qid: string, v: Value) => { await g.answer(qid, v); setMode({ kind: 'answered' }); };
  return (
    <>
      <FocusCard c={c} title />
      <p className="sub"><Bi t={whyText(c)} /></p>
      <SectionWhy c={c} />
      <Notes c={c} where="page" />

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
          {(c.state === 'shown' || c.state === 'check_at_office') && c.plan?.status !== 'done' && c.sectionWhy !== 'answer' && (
            <button type="button" className="k-answer" onClick={() => { void g.setPlan(c.card.id, { status: 'done' }); onLive(L('card.recordedDone')); setMode({ kind: 'done' }); }}>
              <img src={art('badge')} alt="" /><Bi k="card.done" />
            </button>
          )}
          {c.plan?.status === 'done' && (
            <button type="button" className="k-answer" onClick={() => { void g.setPlan(c.card.id, { status: 'todo' }); onLive(L('card.recordedUndone')); }}><Bi k="card.undone" /></button>
          )}
        </div>
      )}

      {more}
      <div className="links">
        <Link to="/now" className="link"><Bi k="now.back" /></Link>
        <Link to="/all" className="link"><Bi k="nav.backAll" /></Link>
      </div>
      {sheetEl}
    </>
  );
}
