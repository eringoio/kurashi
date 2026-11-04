/* 開き直したときの画面：途中からの続き（6A.1 の出し分けの4）と、約束した日（5・6） */
import type { Resume as ResumeT } from '../core/entry';
import { useGuide } from '../guide/useGuide';
import { Bi } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CardRow } from '../ui/guide';
import { Link, navigate, useFocusTitle } from '../ui/router';

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
      <ul className="list" role="list">{views.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
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

