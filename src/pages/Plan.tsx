/* これからのこと（SPEC 6A.4）：「いま」（いまの1つ）と「全体」。どの項目もいつでも開ける。
   答えた・日を決めたあとは結果の画面を出さず、次の1つの上に変わったことを1行で出す（6A.5 v0.5.14）。
   結果の画面と「つぎへ」は「済んだ」を記録したときだけ。 */
import { nowStep, questionsLeft, type NowStep } from '../core/now';
import type { CardView, Section } from '../core/engine';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { useEffect, useState, type ReactNode } from 'react';
import { Answers, CardRow, DayChoice, dayTitle, FocusCard, fmtDay, RedoStep, ResultView, SECTION_ORDER, SectionWhy, StateLabel, stateKey, useChange, WhyAsked, whyText, QLeft } from '../ui/guide';
import { ProgressMap } from '../ui/ProgressMap';
import { RoadBring } from '../ui/RoadMap';
import { bringPlan } from '../core/accompany';
import { DATA } from '../core/data';
import { visitGroup } from '../core/visit';
import { Link, navigate, useFocusTitle, usePath } from '../ui/router';
import { useSide } from '../ui/SidePanel';
import '../styles/world.css';
import '../styles/card.css';

export function Tabs({ current, wideHide }: { current: 'now' | 'all'; wideHide?: boolean }) {
  const { level } = usePrefs();
  // 広い画面でタブを隠すのは、右の列が出ているときだけ（右の列が「全体」の代わり。K-36）
  const side = useSide(usePath());
  return (
    <nav className={'k-views k-views--two' + (wideHide && side ? ' k-views--wide-hide' : '')} aria-label={line(ui('tab.nav'), level)}>
      <Link to="/now" aria-current={current === 'now' ? 'page' : undefined}><Bi k="tab.now" /></Link>
      <Link to="/all" aria-current={current === 'all' ? 'page' : undefined}><Bi k="tab.all" /></Link>
    </nav>
  );
}

/** 今日が行く日（nowStep の today。WP-A が足す）：「今日は行く日です」と項目、今日の予定へ */
export function TodayStep({ views, base, go }: { views: CardView[]; base?: string; go: string }) {
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('calendar')} alt="" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="now.today.title" /></h1></div>
      <ul className="list" role="list">{views.map((c) => <CardRow key={c.card.id} c={c} base={base} />)}</ul>
      <Link to={go} className="k-answer k-answer--primary"><img src={art('hall')} alt="" /><Bi phrase k="now.today.go" /></Link>
    </>
  );
}
/** nowStep の today の項目（today でなければ null） */
export const todayViews = (step: NowStep): CardView[] | null => (step.kind === 'today' ? step.views : null);

export function Now() {
  const g = useGuide();
  const { level, vault } = usePrefs();
  const ch = useChange(g);
  const [done, setDone] = useState<string | null>(null);
  const step = nowStep(g.out, g.today);
  // 最初の質問のあと（v0.5.31）：手続きの質問をまとめて先に聞き、終わったら1回だけ全体（道と持ち物）を開く
  const asking = step.kind === 'card_q' || step.kind === 'upfront';
  useEffect(() => {
    if (asking || done || ch.redo || vault.get('dates', 'seen_all_on')) return;
    void g.markSeenAll().then((first) => { if (first) navigate('/all'); });
  }, [asking]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusTitle('now:' + (done ? 'done' + done : ch.redo ? 'redo' + ch.redo.kind + ch.redo.cardId : step.kind + ('view' in step ? step.view.card.id : '') + ('q' in step ? step.q.id : '')));
  const Title = ({ children }: { children: ReactNode }) => <h1 id="screen-title" tabIndex={-1}>{children}</h1>;
  const today = todayViews(step);
  let body: ReactNode;

  if (done) {
    // 済んだと記録したときだけ、結果の画面と「つぎへ」（6A.5 v0.5.14）
    const c = g.out.cards.find((x) => x.card.id === done)!;
    body = (
      <ResultView eyebrow="res.done.eyebrow" title={<><Bi phrase t={c.card.title} /> <StateLabel k={stateKey(c)} ob={c.card.obligation} /></>} sub={<><Bi phrase t={whyText(c)} /><SectionWhy c={c} /></>} onNext={() => setDone(null)} rate={c.card.id}>
        <Link to={'/c/' + c.card.id} className="link"><Bi k="card.more" /></Link>
      </ResultView>
    );
  } else if (ch.redo) {
    body = <RedoStep redo={ch.redo} cards={g.out.cards} today={g.today} onAnswer={(id, q, v) => void ch.answer(id, q, v)} onPlan={(id, d, ids) => void ch.plan(id, d, ids)} onCancel={() => ch.setRedo(null)} />;
  } else if (step.kind === 'upfront') {
    body = (
      <>
        <div className="head"><p className="eyebrow"><One k="now.eyebrow.q" /></p><QLeft n={questionsLeft(g.out)} /><Title><Bi t={step.q.text} /></Title></div>
        <Answers q={step.q} onPick={(v) => { ch.setLast(null); void g.answer(step.q.id, v); }} />
        <WhyAsked t={step.q.why_asked} />
      </>
    );
  } else if (step.kind === 'card_q') {
    const c = step.view;
    body = (
      <>
        <p className="eyebrow"><One k="now.eyebrow.q" /></p>
        <QLeft n={questionsLeft(g.out)} />
        <FocusCard c={c} />
        <div className="head">
          <Title><Bi t={step.q.text} /></Title>
        </div>
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
          onLater={() => navigate('/all')} />
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
          <button type="button" className="k-answer k-answer--primary" onClick={async () => { await g.setPlan(c.card.id, { status: 'done' }); ch.setLast(null); setDone(c.card.id); }}><Bi phrase k="now.wait.yes" /></button>
          <Link to={'/c/' + c.card.id} className="k-answer"><Bi phrase k="now.wait.no" /></Link>
        </div>
      </>
    );
  } else if (today) {
    body = <TodayStep views={today} go="/today" />;
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
      <Tabs current="now" wideHide />
      {!done && ch.line}
      {body}
      <div className="links"><Link to="/calendar" className="link"><Bi k="cal.open" /></Link></div>
    </>
  );
}

const SEC_KEY: Record<Section, UiKey> = { today: 'sec.today', check: 'sec.check', wait: 'sec.wait', later: 'sec.later', info: 'sec.info', done: 'sec.done' };

/** 一覧の中身（引っ越しとイベントで同じ）：見出しが状態を示すので、行は短く（K-43） */
/** closedOnly：道（v0.5.31）の下。道に出ていない「関係なかったもの」「まだ案内していないこと」だけ（理由つき） */
export function AllGroups({ cards, base, extraRow, closedOnly }: { cards: CardView[]; base?: string; extraRow?: (c: CardView) => Partial<Parameters<typeof CardRow>[0]>; closedOnly?: boolean }) {
  const { level } = usePrefs();
  const by = (f: (c: CardView) => boolean) => cards.filter(f);
  const group = (key: UiKey, list: CardView[], open = true) =>
    list.length === 0 ? null : (
      <section className="group" key={key}>
        {open ? (
          <>
            <h2><Bi phrase k={key} />（{list.length}）</h2>
            <ul className="list" role="list">{list.map((c) => <CardRow key={c.card.id} c={c} base={base} compact extra={c.plan?.planned_on ? fmtDay(c.plan.planned_on, level) : undefined} {...extraRow?.(c)} />)}</ul>
          </>
        ) : (
          // 「あとで」「関係なし」「範囲外」は閉じて件数を示す。押すと開く（15.2・K-28）。関係なかったものは理由を添える
          <details className="group__more">
            <summary><Bi k={key} />（{list.length}）</summary>
            <ul className="list" role="list">{list.map((c) => <CardRow key={c.card.id} c={c} base={base} compact
              note={c.state === 'excluded' || c.state === 'out_of_scope' ? <One t={whyText(c)} /> : undefined} />)}</ul>
          </details>
        )}
      </section>
    );
  return (
    <div id="all-list" tabIndex={-1} className="all-list">
      {!closedOnly && SECTION_ORDER.flatMap((s) => [
        group(SEC_KEY[s], by((c) => c.section === s && c.state !== 'ask'), s !== 'later'),
        s === 'check' ? group('sec.ask', by((c) => c.state === 'ask')) : null,
      ])}
      {group('sec.excluded', by((c) => c.state === 'excluded'), false)}
      {group('sec.out', by((c) => c.state === 'out_of_scope'), false)}
    </div>
  );
}

/** いま開いている項目（済んだ・関係なし・範囲外でない）があるか */
export const hasOpen = (cards: CardView[]) => cards.some((c) => c.section !== 'done' && c.state !== 'excluded' && c.state !== 'out_of_scope');

/** 開いている項目が無いとき（K-43）：その旨と、入口へ */
export function AllEmpty() {
  return (
    <>
      <p className="sub k-empty"><Bi k="all.empty" /></p>
    </>
  );
}

export function All({ onlyGuides }: { onlyGuides?: boolean } = {}) {
  const g = useGuide();
  useFocusTitle('all');
  const cards = g.out.cards;
  const idle = nowStep(g.out, g.today).kind === 'idle';
  const origin = typeof g.answers['Q-origin'] === 'string' ? (g.answers['Q-origin'] as string) : undefined;
  // 「1つずつ進める」は、いまの1つがあるときだけ。2つ目のボタン（K-43）
  const go = !idle && !onlyGuides && <Link to="/now" className="k-answer"><Bi phrase k="all.go" /></Link>;
  return (
    <>
      {!onlyGuides && <Tabs current="all" />}
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="all.title" /></h1></div>
      <ProgressMap cards={cards} out={g.out} today={g.today} listId="all-list"
        after={(road) => road ? (
          // 道（v0.5.31）：道 → 次へ進むボタン → 持ち物 → 関係なかったもの（閉じた一覧）。同じ項目の一覧は出さない
          <>
            {!hasOpen(cards) && <AllEmpty />}
            {go}
            <RoadBring plan={bringPlan(g.out, DATA().objects, g.objects, origin)} />
            <AllGroups cards={cards} closedOnly />
          </>
        ) : (
          <>
            {!hasOpen(cards) && <AllEmpty />}
            <AllGroups cards={cards} />
            {go}
          </>
        )} />
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
