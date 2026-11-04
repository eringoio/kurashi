/* 開き直したときの画面：途中からの続き（6A.1 の出し分けの4）と、約束した日（5・6） */
import type { Resume as ResumeT } from '../core/entry';
import { useGuide } from '../guide/useGuide';
import { Bi } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CardRow } from '../ui/guide';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { visitPath, visitsToday } from '../core/accompany';
import { DATA } from '../core/data';
import { ui } from '../i18n/text';
import { withPlace } from './Visit';

export function ResumePage() {
  const { vault } = usePrefs();
  const g = useGuide();
  useFocusTitle('resume');
  const r = vault.get<ResumeT>('resume', 'value');
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('box')} alt="" className="art--big" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="resume.title" /></h1></div>
      <p className="sub"><Bi k="resume.sub" /></p>
      <div className="list">
        <button type="button" className="k-answer k-answer--primary" onClick={() => navigate(r?.step ?? '/move')}><Bi k="resume.continue" /></button>
        <button type="button" className="k-answer" onClick={() => { void g.setResume(null); navigate('/'); }}><Bi k="resume.menu" /></button>
      </div>
    </>
  );
}

/** 約束した日が今日、または過ぎた（済んだと記録していない） */
export function PromisePage({ past, cardIds }: { past: boolean; cardIds: string[] }) {
  const g = useGuide();
  useFocusTitle('promise');
  const views = g.out.cards.filter((c) => cardIds.includes(c.card.id));
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('calendar')} alt="" className="art--big" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k={past ? 'promise.past' : 'promise.today'} /></h1></div>
      {past ? <ul className="list" role="list">{views.map((c) => <CardRow key={c.card.id} c={c} />)}</ul> : <TodayVisits views={views} />}
      {past && (
        <div className="list">
          <button type="button" className="k-answer k-answer--primary" onClick={async () => { for (const id of cardIds) await g.setPlan(id, { status: 'done' }); navigate('/now'); }}><Bi k="promise.went" /></button>
          <Link to={'/c/' + cardIds[0]} className="k-answer"><Bi k="promise.notYet" /></Link>
        </div>
      )}
      <div className="links"><Link to="/now" className="link"><Bi k="now.back" /></Link></div>
    </>
  );
}


/** 今日の行く所ごとに、付き添いを始める（6A.6）。行く所の無い項目は、そのまま並べる */
function TodayVisits({ views }: { views: ReturnType<typeof useGuide>['out']['cards'] }) {
  const g = useGuide();
  const origin = typeof g.answers['Q-origin'] === 'string' ? (g.answers['Q-origin'] as string) : undefined;
  const visits = visitsToday(g.out, DATA().objects, g.objects, origin, g.today);
  const inVisit = new Set(visits.flatMap((v) => v.cards.map((c) => c.card.id)));
  const rest = views.filter((c) => !inVisit.has(c.card.id));
  return (
    <>
      {visits.map((v) => (
        <section key={v.place} className="visitgroup" aria-labelledby={'today-' + v.place}>
          <h2 id={'today-' + v.place} className="label"><Bi t={ui(('place.' + v.place) as Parameters<typeof ui>[0]) ?? { ja: v.place }} /></h2>
          <ul className="list" role="list">{v.cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
          <Link to={visitPath(v.place, 'before')} className="k-answer k-answer--primary"><Bi t={withPlace(ui('visit.start'), v.place)} /></Link>
        </section>
      ))}
      {rest.length > 0 && <ul className="list" role="list">{rest.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>}
    </>
  );
}
