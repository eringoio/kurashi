/* これからのこと（SPEC 6A.4）：「いま」（いまの1つ）と「全体」。どの項目もいつでも開ける。 */
import { nowStep } from '../core/now';
import type { CardView, Section } from '../core/engine';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { useState } from 'react';
import { Answers, CardRow, DayChoice, dayTitle, fillDate, FocusCard, fmtDay, ResultView, SECTION_ORDER, SectionWhy, StateLabel, stateKey, WhyAsked, whyText, WorldMap } from '../ui/guide';
import { visitGroup } from '../core/visit';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { AddToCalendar } from '../ui/AddToCalendar';

export function Tabs({ current }: { current: 'now' | 'all' }) {
  const { level } = usePrefs();
  return (
    <nav className="k-views k-views--two" aria-label={line(ui('tab.nav'), level)}>
      <Link to="/now" aria-current={current === 'now' ? 'page' : undefined}><Bi k="tab.now" /></Link>
      <Link to="/all" aria-current={current === 'all' ? 'page' : undefined}><Bi k="tab.all" /></Link>
    </nav>
  );
}

/** 操作のあとに出す結果（試作 D：「この答えで変わったこと」「〇〇に決めました」→ つぎへ） */
type NowResult = { kind: 'answered'; cardId: string } | { kind: 'planned'; cardId: string; day: string; ids: string[] } | { kind: 'done'; cardId: string };

export function Now() {
  const g = useGuide();
  const { level } = usePrefs();
  const [result, setResult] = useState<NowResult | null>(null);
  const step = nowStep(g.out, g.today);
  useFocusTitle('now:' + (result ? result.kind + result.cardId : step.kind + ('view' in step ? step.view.card.id : '') + ('q' in step ? step.q.id : '')));
  const Title = ({ children }: { children: React.ReactNode }) => <h1 id="screen-title" tabIndex={-1}>{children}</h1>;
  const next = () => setResult(null);
  let body: React.ReactNode;

  if (result) {
    const c = g.out.cards.find((x) => x.card.id === result.cardId)!;
    body = result.kind === 'planned' ? (
      <ResultView eyebrow="res.planned.eyebrow" title={<Bi t={fillDate(ui('res.planned.title'), result.day)} />} sub={<><PlannedList ids={result.ids} cards={g.out.cards} /><Bi k="res.planned.sub" /></>} onNext={next}>
        <AddToCalendar day={result.day} place={g.out.cards.find((x) => x.card.id === result.ids[0])?.card.place} cardIds={result.ids} />
      </ResultView>
    ) : (
      <ResultView eyebrow={result.kind === 'done' ? 'res.done.eyebrow' : 'res.answer.eyebrow'} title={<><Bi phrase t={c.card.title} /> <StateLabel k={stateKey(c)} ob={c.card.obligation} /></>} sub={<><Bi phrase t={whyText(c)} /><SectionWhy c={c} /></>} onNext={next}>
        <Link to={'/c/' + c.card.id} className="link"><Bi k="card.more" /></Link>
      </ResultView>
    );
  } else if (step.kind === 'upfront') {
    body = (
      <>
        <div className="head"><p className="eyebrow"><One k="now.eyebrow.q" /></p><Title><Bi t={step.q.text} /></Title></div>
        <Answers q={step.q} onPick={(v) => void g.answer(step.q.id, v)} />
        <WhyAsked t={step.q.why_asked} />
      </>
    );
  } else if (step.kind === 'card_q') {
    const c = step.view;
    body = (
      <>
        <p className="eyebrow"><One k="now.eyebrow.q" /></p>
        <FocusCard c={c} />
        <div className="head">
          <Title><Bi t={step.q.text} /></Title>
        </div>
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
        {group.length === 1 && <p className="sub"><Bi phrase t={c.card.title} /> <StateLabel k={stateKey(c)} ob={c.card.obligation} /></p>}
        <DayChoice group={group} today={g.today}
          onPick={async (d, ids) => { await g.setPlans(ids, { planned_on: d }); setResult({ kind: 'planned', cardId: c.card.id, day: d, ids }); }}
          onLater={() => navigate('/all')} />
        <Link to={'/c/' + c.card.id} className="link"><Bi k="card.more" /></Link>
      </>
    );
  } else if (step.kind === 'wait') {
    const c = step.view;
    body = (
      <>
        <p className="eyebrow"><One k="now.eyebrow.wait" /></p>
        <FocusCard c={c} />
        <div className="head">
          <Title><Bi k="now.wait.title" /></Title>
        </div>
        <div className="pair">
          <button type="button" className="k-answer k-answer--primary" onClick={async () => { await g.setPlan(c.card.id, { status: 'done' }); setResult({ kind: 'done', cardId: c.card.id }); }}><Bi phrase k="now.wait.yes" /></button>
          <Link to={'/c/' + c.card.id} className="k-answer"><Bi phrase k="now.wait.no" /></Link>
        </div>
      </>
    );
  } else if (step.kind === 'until') {
    body = (
      <>
        <div className="head"><p className="eyebrow"><One k="now.eyebrow.until" /></p><Title><Bi k="now.until.title" /></Title></div>
        <ul className="list" role="list">
          {step.views.map((c) => <CardRow key={c.card.id} c={c} extra={fmtDay(c.plan!.planned_on!, level)} />)}
        </ul>
      </>
    );
  } else {
    body = (
      <>
        <div className="art" aria-hidden="true"><img src={art('homecheck')} alt="" className="art--big" /></div>
        <div className="head"><Title><Bi k="now.idle.title" /></Title></div>
        <p className="sub"><Bi k="now.idle.sub" /></p>
      </>
    );
  }
  return (
    <>
      <Tabs current="now" />
      {body}
      <div className="links"><Link to="/all" className="link"><Bi k="now.seeAll" /></Link><Link to="/calendar" className="link"><Bi k="cal.open" /></Link></div>
    </>
  );
}

const SEC_KEY: Record<Section, UiKey> = { today: 'sec.today', check: 'sec.check', wait: 'sec.wait', later: 'sec.later', done: 'sec.done' };

export function All() {
  const g = useGuide();
  const { level } = usePrefs();
  useFocusTitle('all');
  const cards = g.out.cards;
  const by = (f: (c: CardView) => boolean) => cards.filter(f);
  const group = (key: UiKey, list: CardView[], open = true) =>
    list.length === 0 ? null : (
      <section className="group" key={key}>
        {open ? (
          <>
            <h2><Bi phrase k={key} />（{list.length}）</h2>
            <ul className="list" role="list">{list.map((c) => <CardRow key={c.card.id} c={c} extra={c.plan?.planned_on ? fmtDay(c.plan.planned_on, level) : undefined} />)}</ul>
          </>
        ) : (
          // 「あとで」「関係なし」「まだ案内していない」は閉じて件数を示す（15.2）
          <details>
            <summary><Bi k={key} />（{list.length}）</summary>
            <ul className="list" role="list">{list.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
          </details>
        )}
      </section>
    );
  return (
    <>
      <Tabs current="all" />
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="all.title" /></h1></div>
      <WorldMap cards={cards} />
      <p className="sub"><Bi k="all.sub" /></p>
      {SECTION_ORDER.flatMap((s) => [
        group(SEC_KEY[s], by((c) => c.section === s && c.state !== 'ask'), s !== 'later'),
        s === 'check' ? group('sec.ask', by((c) => c.state === 'ask')) : null,
      ])}
      {group('sec.excluded', by((c) => c.state === 'excluded'), false)}
      {group('sec.out', by((c) => c.state === 'out_of_scope'), false)}
      <Link to="/now" className="k-answer k-answer--primary"><Bi phrase k="all.go" /></Link>
    </>
  );
}

/** 日を決めた項目の名前（まとめて決めたときは全部） */
function PlannedList({ ids, cards }: { ids: string[]; cards: CardView[] }) {
  return (
    <ul className="plain" role="list">
      {ids.map((id) => <li key={id}><Bi t={cards.find((x) => x.card.id === id)!.card.title} /></li>)}
    </ul>
  );
}
export { PlannedList };
