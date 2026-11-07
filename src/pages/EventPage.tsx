/* 生活イベントの共通の画面（/e/{event_id}・/e/{event_id}/all）。イベントの名前で分岐するコードは書かない。
   入口の質問（multi なら複数選択）→ いまの1つ（nowStep）→ 一覧。開いた項目は EventCardPage（CardPage.tsx）。
   「すぐ行う行動」は、ほかの質問より先に出る（nowStep の urgent）。
   答えた・日を決めたあとは、次の1つの上に1行（6A.5 v0.5.14）。結果の画面は「済んだ」のときだけ。 */
import { useState, type ReactNode } from 'react';
import { nowStep } from '../core/now';
import { ABOUT_SKIPPED, aboutNext, wantsAbout } from '../core/about';
import { DATA } from '../core/data';
import { AboutStep } from '../ui/About';
import type { Question } from '../core/schema';
import { visitGroup } from '../core/visit';
import { visitPath } from '../core/accompany';
import { useEvent, type EventGuide } from '../guide/useEvent';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Answers, CardRow, DayChoice, dayTitle, FocusCard, fmtDay, RedoStep, ResultView, SectionWhy, StateLabel, stateKey, useChange, WhyAsked, whyText, WorldMap } from '../ui/guide';
import { MultiPick, UrgentAction } from '../ui/patterns';
import { toPickOptions, toUrgent } from '../ui/patterns/map';
import { Link, navigate, useFocusTitle, usePath } from '../ui/router';
import { useSide } from '../ui/SidePanel';
import { AllEmpty, AllGroups, hasOpen, TodayStep, todayViews } from './Plan';

function EvTabs({ base, current, wideHide }: { base: string; current: 'now' | 'all'; wideHide?: boolean }) {
  const { level } = usePrefs();
  // 広い画面でタブを隠すのは、右の列が出ているときだけ（K-36）
  const side = useSide(usePath());
  return (
    <nav className={'k-views k-views--two' + (wideHide && side ? ' k-views--wide-hide' : '')} aria-label={line(ui('tab.nav'), level)}>
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
      <button type="button" className="k-answer k-answer--small" onClick={async () => { await g.startNew(); onLive(line(ui('ev.startedNew'), level)); navigate('/e/' + g.event.id); }}><Bi k="ev.startNewShort" /></button>
    </div>
  );
}

/** 複数選択の質問（答えは値の配列）。1つ以上選んで「つぎへ」 */
function MultiQuestion({ q, onAnswer }: { q: Question; onAnswer: (v: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <>
      <MultiPick legend={ui('ev.pick.legend')} options={toPickOptions(q)} selected={sel} onChange={setSel} />
      <button type="button" className="k-answer k-answer--primary" disabled={sel.length === 0} onClick={() => onAnswer(sel)}><Bi phrase k="nav.next" /></button>
      <WhyAsked t={q.why_asked} />
    </>
  );
}

/** onlyGuides：日を決める手続きが無く、案内だけの出来事（いま と 全体 が同じになる）。WP-A の EventEntry が渡す。
    渡されないときは、ここで同じ形で決める（いまの1つが無く、関係する項目がある） */
export function EventPage({ eventId, view, onLive, onlyGuides }: { eventId: string; view: 'now' | 'all'; onLive: (s: string) => void; onlyGuides?: boolean }) {
  const g = useEvent(eventId);
  if (!g) return <Missing />;
  const guides = onlyGuides ?? (nowStep(g.out, g.today).kind === 'idle' && g.out.cards.some((c) => c.state === 'shown' || c.state === 'check_at_office'));
  return view === 'all' ? <EventAll g={g} onLive={onLive} onlyGuides={guides} /> : <EventNow g={g} onLive={onLive} />;
}

function Missing() {
  useFocusTitle('ev-missing');
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="ev.notFound" /></h1></div>
      <Link to="/" className="link"><Bi k="nav.home" /></Link>
    </>
  );
}

function EventNow({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const { level, vault } = usePrefs();
  const base = '/e/' + g.event.id;
  const cp = base + '/c/';
  const ch = useChange(g);
  const [done, setDone] = useState<string | null>(null);
  const step = nowStep(g.out, g.today);
  // あなたについて：最初の質問に国籍などがあれば、ほかの質問の前に、まとめて聞く（2026-11-07）
  const about = step.kind === 'upfront' && wantsAbout(g.out.upfront, vault.get('settings', ABOUT_SKIPPED) === true, DATA().questions, g.answers) ? aboutNext(DATA().questions, g.answers) : undefined;
  useFocusTitle((about ? 'about:' + about.id + ':' : '') + 'ev:' + g.occ?.id + ':' + (done ? 'done' + done : ch.redo ? 'redo' + ch.redo.kind + ch.redo.cardId : step.kind + ('view' in step ? step.view.card.id : '') + ('q' in step ? step.q.id : '')));
  const Title = ({ children }: { children: ReactNode }) => <h1 id="screen-title" tabIndex={-1}>{children}</h1>;
  const eyebrow = <p className="eyebrow"><One t={g.event.title} /></p>;
  const today = todayViews(step);
  let body: ReactNode;

  if (done) {
    const c = g.out.cards.find((x) => x.card.id === done)!;
    body = (
      <ResultView eyebrow="res.done.eyebrow" title={<><Bi phrase t={c.card.title} /> <StateLabel k={stateKey(c)} ob={c.card.obligation} /></>} sub={<><Bi phrase t={whyText(c)} /><SectionWhy c={c} /></>} onNext={() => setDone(null)} rate={c.card.id}>
        <Link to={cp + c.card.id} className="link"><Bi k="card.more" /></Link>
      </ResultView>
    );
  } else if (ch.redo) {
    body = <RedoStep redo={ch.redo} cards={g.out.cards} today={g.today} onAnswer={(id, q, v) => void ch.answer(id, q, v)} onPlan={(id, d, ids) => void ch.plan(id, d, ids)} onCancel={() => ch.setRedo(null)} />;
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
  } else if (step.kind === 'upfront' && about) {
    body = <AboutStep key={about.id} q={about} onAnswer={(val) => { ch.setLast(null); return g.answer(about.id, val); }} />;
  } else if (step.kind === 'upfront') {
    const pick = (v: Parameters<typeof g.answer>[1]) => { ch.setLast(null); void g.answer(step.q.id, v); };
    body = (
      <>
        {eyebrow}
        <div className="head"><Title><Bi t={step.q.text} /></Title></div>
        {step.q.multi
          ? <MultiQuestion key={step.q.id} q={step.q} onAnswer={pick} />
          : <><Answers q={step.q} onPick={pick} /><WhyAsked t={step.q.why_asked} /></>}
      </>
    );
  } else if (step.kind === 'card_q') {
    const c = step.view;
    body = (
      <>
        <p className="eyebrow"><One k="now.eyebrow.q" /></p>
        <FocusCard c={c} />
        <div className="head"><Title><Bi t={step.q.text} /></Title></div>
        <Answers q={step.q} onPick={(v) => void ch.answer(c.card.id, step.q, v)} />
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
        {group.length === 1 && <p className="sub"><Bi phrase t={c.card.title} /> <StateLabel k={stateKey(c)} ob={c.card.obligation} /></p>}
        <DayChoice group={group} today={g.today}
          onPick={(d, ids) => void ch.plan(c.card.id, d, ids)}
          onLater={() => navigate(base + '/all')} />
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
          <button type="button" className="k-answer k-answer--primary" onClick={async () => { await g.setPlan(c.card.id, { status: 'done' }); ch.setLast(null); setDone(c.card.id); }}><Bi phrase k="now.wait.yes" /></button>
          <Link to={cp + c.card.id} className="k-answer"><Bi phrase k="now.wait.no" /></Link>
        </div>
      </>
    );
  } else if (today) {
    // 今日が行く日：行く所があれば付き添いの「行く前」、無ければ今日の予定
    const place = today.find((c) => c.card.place)?.card.place;
    body = <TodayStep views={today} base={cp} go={place ? visitPath(place, 'before') : '/today'} />;
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
      <EvTabs base={base} current="now" wideHide />
      {!done && ch.line}
      {body}
      <StartNew g={g} onLive={onLive} />
    </>
  );
}

function EventAll({ g, onLive, onlyGuides }: { g: EventGuide; onLive: (s: string) => void; onlyGuides?: boolean }) {
  const base = '/e/' + g.event.id;
  useFocusTitle('ev-all:' + g.event.id);
  const cards = g.out.cards;
  const idle = nowStep(g.out, g.today).kind === 'idle';
  return (
    <>
      {/* 案内だけの出来事は、いま と 全体 が同じなのでタブを出さない（U04・IA04） */}
      {!onlyGuides && <EvTabs base={base} current="all" />}
      <div className="head"><p className="eyebrow"><One phrase t={g.event.title} /></p><h1 id="screen-title" tabIndex={-1}><Bi phrase k="all.title" /></h1></div>
      {g.event.tool && <Link to={g.event.tool.path} className="k-answer k-answer--primary"><Bi phrase t={g.event.tool.label} /></Link>}
      <WorldMap cards={cards} base={base + '/c/'} listId="all-list" />
      {!hasOpen(cards) && <AllEmpty />}
      <AllGroups cards={cards} base={base + '/c/'}
        extraRow={(c) => (g.event.checklist && c.state !== 'ask' ? { check: { done: c.plan?.status === 'done', onToggle: () => void g.setPlan(c.card.id, { status: c.plan?.status === 'done' ? 'todo' : 'done' }) } } : {})} />
      {!idle && !onlyGuides && <Link to={base} className="k-answer"><Bi phrase k="all.go" /></Link>}
      <StartNew g={g} onLive={onLive} />
    </>
  );
}
