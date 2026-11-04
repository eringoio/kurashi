/* 生活イベントの共通の画面（/e/{event_id}・/e/{event_id}/all）。イベントの名前で分岐するコードは書かない。
   入口の質問（multi なら複数選択）→ いまの1つ（nowStep）→ 一覧。開いた項目は EventCardPage（CardPage.tsx）。
   「すぐ行う行動」は、ほかの質問より先に出る（nowStep の urgent）。 */
import { useState, type ReactNode } from 'react';
import type { CardView, Section } from '../core/engine';
import { nowStep } from '../core/now';
import type { Question } from '../core/schema';
import { visitGroup } from '../core/visit';
import { useEvent, type EventGuide } from '../guide/useEvent';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Answers, CardRow, DayChoice, dayTitle, fillDate, FocusCard, fmtDay, ResultView, SECTION_ORDER, SectionWhy, StateLabel, stateKey, WhyAsked, whyText } from '../ui/guide';
import { MultiPick, UrgentAction } from '../ui/patterns';
import { toPickOptions, toUrgent } from '../ui/patterns/map';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { PlannedList } from './Plan';

type Result = { kind: 'answered'; cardId: string } | { kind: 'planned'; cardId: string; day: string; ids: string[] } | { kind: 'done'; cardId: string };

function EvTabs({ base, current }: { base: string; current: 'now' | 'all' }) {
  const { level } = usePrefs();
  return (
    <nav className="k-views k-views--two" aria-label={line(ui('tab.nav'), level)}>
      <Link to={base} aria-current={current === 'now' ? 'page' : undefined}><Bi k="tab.now" /></Link>
      <Link to={base + '/all'} aria-current={current === 'all' ? 'page' : undefined}><Bi k="tab.all" /></Link>
    </nav>
  );
}

/** 前の出来事があるときだけ：同じ出来事をもう一度、新しく始める（前の「済んだ」を使わない） */
function StartNew({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const has = !!g.occ && (Object.keys(g.occ.answers).length > 0 || Object.keys(g.occ.plan).length > 0);
  if (!has) return null;
  return (
    <div className="links">
      <button type="button" className="link" onClick={async () => { await g.startNew(); onLive(line(ui('ev.startedNew'), level)); navigate('/e/' + g.event.id); }}><Bi k="ev.startNew" /></button>
    </div>
  );
}

/** 複数選択の質問（答えは値の配列）。1つ以上選んで「つぎへ」 */
function MultiQuestion({ q, onAnswer }: { q: Question; onAnswer: (v: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <>
      <MultiPick legend={ui('ev.pick.legend')} options={toPickOptions(q)} selected={sel} onChange={setSel} />
      <button type="button" className="k-answer k-answer--primary" disabled={sel.length === 0} onClick={() => onAnswer(sel)}><Bi k="nav.next" /></button>
      <WhyAsked t={q.why_asked} />
    </>
  );
}

export function EventPage({ eventId, view, onLive }: { eventId: string; view: 'now' | 'all'; onLive: (s: string) => void }) {
  const g = useEvent(eventId);
  if (!g) return <Missing />;
  return view === 'all' ? <EventAll g={g} onLive={onLive} /> : <EventNow g={g} onLive={onLive} />;
}

function Missing() {
  useFocusTitle('ev-missing');
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="ev.notFound" /></h1></div>
      <Link to="/" className="link"><Bi k="nav.home" /></Link>
    </>
  );
}

function EventNow({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const base = '/e/' + g.event.id;
  const cp = base + '/c/';
  const [result, setResult] = useState<Result | null>(null);
  const step = nowStep(g.out, g.today);
  useFocusTitle('ev:' + g.occ?.id + ':' + (result ? result.kind + result.cardId : step.kind + ('view' in step ? step.view.card.id : '') + ('q' in step ? step.q.id : '')));
  const Title = ({ children }: { children: ReactNode }) => <h1 id="screen-title" tabIndex={-1}>{children}</h1>;
  const eyebrow = <p className="eyebrow"><One t={g.event.title} /></p>;
  const next = () => setResult(null);
  let body: ReactNode;

  if (result) {
    const c = g.out.cards.find((x) => x.card.id === result.cardId)!;
    body = result.kind === 'planned' ? (
      <ResultView eyebrow="res.planned.eyebrow" title={<Bi t={fillDate(ui('res.planned.title'), result.day)} />} sub={<><PlannedList ids={result.ids} cards={g.out.cards} /><Bi k="res.planned.sub" /></>} onNext={next} />
    ) : (
      <ResultView eyebrow={result.kind === 'done' ? 'res.done.eyebrow' : 'res.answer.eyebrow'} title={<><Bi t={c.card.title} /> <StateLabel k={stateKey(c)} /></>} sub={<><Bi t={whyText(c)} /><SectionWhy c={c} /></>} onNext={next}>
        <Link to={cp + c.card.id} className="link"><Bi k="card.more" /></Link>
      </ResultView>
    );
  } else if (step.kind === 'urgent') {
    const c = step.view;
    const a = toUrgent(c.card, () => { void g.setPlan(c.card.id, { status: 'done' }); onLive(line(ui('card.recordedDone'), level)); })!;
    body = (
      <>
        <div className="head"><Title><Bi t={g.event.title} /></Title></div>
        <UrgentAction key={c.card.id} a={a} />
        <Link to={cp + c.card.id} className="link"><Bi k="card.more" /></Link>
      </>
    );
  } else if (step.kind === 'upfront') {
    body = (
      <>
        {eyebrow}
        <div className="head"><Title><Bi t={step.q.text} /></Title></div>
        {step.q.multi
          ? <MultiQuestion key={step.q.id} q={step.q} onAnswer={(v) => void g.answer(step.q.id, v)} />
          : <><Answers q={step.q} onPick={(v) => void g.answer(step.q.id, v)} /><WhyAsked t={step.q.why_asked} /></>}
      </>
    );
  } else if (step.kind === 'card_q') {
    const c = step.view;
    body = (
      <>
        <p className="eyebrow"><One k="now.eyebrow.q" /></p>
        <FocusCard c={c} />
        <div className="head"><Title><Bi t={step.q.text} /></Title></div>
        <Answers q={step.q} onPick={async (v) => { await g.answer(step.q.id, v); setResult({ kind: 'answered', cardId: c.card.id }); }} />
        <WhyAsked t={step.q.why_asked} />
      </>
    );
  } else if (step.kind === 'plan') {
    const c = step.view;
    const group = visitGroup(g.out.cards, c);
    body = (
      <>
        <div className="art" aria-hidden="true">{group.slice(0, 3).map((x) => <img key={x.card.id} src={art(x.card.illustration)} alt="" />)}<img src={art('calendar')} alt="" /></div>
        <div className="head">
          <p className="eyebrow"><One k="now.eyebrow.plan" /></p>
          <Title><Bi t={dayTitle(c)} /></Title>
        </div>
        {group.length === 1 && <p className="sub"><Bi t={c.card.title} /> <StateLabel k={stateKey(c)} /></p>}
        <DayChoice group={group} today={g.today}
          onPick={async (d, ids) => { await g.setPlans(ids, { planned_on: d }); setResult({ kind: 'planned', cardId: c.card.id, day: d, ids }); }}
          onLater={() => navigate(base + '/all')} />
        <Link to={cp + c.card.id} className="link"><Bi k="card.more" /></Link>
      </>
    );
  } else if (step.kind === 'wait') {
    const c = step.view;
    body = (
      <>
        <p className="eyebrow"><One k="now.eyebrow.wait" /></p>
        <FocusCard c={c} />
        <div className="head"><Title><Bi k="now.wait.title" /></Title></div>
        <div className="pair">
          <button type="button" className="k-answer k-answer--primary" onClick={async () => { await g.setPlan(c.card.id, { status: 'done' }); setResult({ kind: 'done', cardId: c.card.id }); }}><Bi k="now.wait.yes" /></button>
          <Link to={cp + c.card.id} className="k-answer"><Bi k="now.wait.no" /></Link>
        </div>
      </>
    );
  } else if (step.kind === 'until') {
    body = (
      <>
        <div className="head"><p className="eyebrow"><One k="now.eyebrow.until" /></p><Title><Bi k="now.until.title" /></Title></div>
        <ul className="list" role="list">
          {step.views.map((c) => <CardRow key={c.card.id} c={c} base={cp} extra={fmtDay(c.plan!.planned_on!, level)} />)}
        </ul>
      </>
    );
  } else {
    body = (
      <>
        {eyebrow}
        <div className="art" aria-hidden="true"><img src={art('homecheck')} alt="" className="art--big" /></div>
        <div className="head"><Title><Bi k="now.idle.title" /></Title></div>
        <p className="sub"><Bi k="now.idle.sub" /></p>
      </>
    );
  }
  return (
    <>
      <EvTabs base={base} current="now" />
      {body}
      <div className="links"><Link to={base + '/all'} className="link"><Bi k="now.seeAll" /></Link></div>
      <StartNew g={g} onLive={onLive} />
    </>
  );
}

const SEC_KEY: Record<Section, UiKey> = { today: 'sec.today', check: 'sec.check', wait: 'sec.wait', later: 'sec.later', done: 'sec.done' };

function EventAll({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const base = '/e/' + g.event.id;
  useFocusTitle('ev-all:' + g.event.id);
  const by = (f: (c: CardView) => boolean) => g.out.cards.filter(f);
  const group = (key: UiKey, list: CardView[], open = true) =>
    list.length === 0 ? null : (
      <section className="group" key={key}>
        {open ? (
          <>
            <h2><Bi k={key} />（{list.length}）</h2>
            <ul className="list" role="list">{list.map((c) => <CardRow key={c.card.id} c={c} base={base + '/c/'} extra={c.plan?.planned_on ? fmtDay(c.plan.planned_on, level) : undefined} />)}</ul>
          </>
        ) : (
          <details>
            <summary><Bi k={key} />（{list.length}）</summary>
            <ul className="list" role="list">{list.map((c) => <CardRow key={c.card.id} c={c} base={base + '/c/'} />)}</ul>
          </details>
        )}
      </section>
    );
  return (
    <>
      <EvTabs base={base} current="all" />
      <div className="head"><p className="eyebrow"><One t={g.event.title} /></p><h1 id="screen-title" tabIndex={-1}><Bi k="all.title" /></h1></div>
      <p className="sub"><Bi k="all.sub" /></p>
      {SECTION_ORDER.flatMap((s) => [
        group(SEC_KEY[s], by((c) => c.section === s && c.state !== 'ask'), s !== 'later'),
        s === 'check' ? group('sec.ask', by((c) => c.state === 'ask')) : null,
      ])}
      {group('sec.excluded', by((c) => c.state === 'excluded'), false)}
      {group('sec.out', by((c) => c.state === 'out_of_scope'), false)}
      <Link to={base} className="k-answer k-answer--primary"><Bi k="all.go" /></Link>
      <StartNew g={g} onLive={onLive} />
    </>
  );
}
