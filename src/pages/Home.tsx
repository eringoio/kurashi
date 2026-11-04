/* 入口（SPEC 6A.1）。開いたときの出し分けは App（src/core/entry.ts）で行う。
   ここに来るのは、初めての人・入口にもどった人・すべて済んだ人。進捗があれば、続きへの入口を上に出す。 */
import { Bi } from '../i18n/Ruby';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';

const MENU = [
  { k: 'home.move', icon: 'box', to: '/move' },
  { k: 'home.gomi', icon: 'bin', to: '/info/coming-soon' },
  { k: 'home.letter', icon: 'letter', to: '/info/coming-soon' },
  { k: 'home.search', icon: 'search', to: '/search' },
] as const;
const LINKS = [
  { k: 'home.locate', to: '/info/coming-soon' },
  { k: 'home.qr', to: '/info/coming-soon' },
  { k: 'home.about', to: '/info/about' },
  { k: 'home.disclaimer', to: '/info/disclaimer' },
] as const;

export function Home({ hasProgress }: { hasProgress: boolean }) {
  useFocusTitle('home');
  return (
    <>
      <div className="art" aria-hidden="true">
        <img src={art('house')} alt="" />
        <img src={art('you')} alt="" />
        <img src={art('bin')} alt="" />
        <img src={art('letter')} alt="" />
      </div>
      <div className="head">
        <h1 id="screen-title" tabIndex={-1}><Bi k="home.title" /></h1>
      </div>
      {hasProgress && <Link to="/now" className="k-answer k-answer--primary"><img src={art('calendar')} alt="" /><Bi k="home.continue" /></Link>}
      <nav aria-labelledby="screen-title">
        <ul className="list" role="list">
          {MENU.map((m) => (
            <li key={m.k}>
              <Link to={m.to} className="k-answer">
                <img src={art(m.icon)} alt="" />
                <Bi k={m.k} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="links">
        {LINKS.map((l) => (
          <Link key={l.k} to={l.to} className="link"><Bi k={l.k} /></Link>
        ))}
        <Link to="/review" className="link"><Bi k="review.link" /></Link>
      </div>
    </>
  );
}
