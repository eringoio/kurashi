/* 入口（SPEC 6A.1）。開いたときの出し分けは App（src/core/entry.ts）で行う。
   ここに来るのは、初めての人・入口にもどった人・すべて済んだ人。進捗があれば、続きへの入口を上に出す。 */
import type { ReactNode } from 'react';
import { DATA } from '../core/data';
import { Bi } from '../i18n/Ruby';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';

type Item = { key: string; title: ReactNode; icon: string; to: string };
/** 固定の項目（ごみ・書類・探す）。引っ越しなどの生活イベントは data/events.json の menu 順から作る */
const FIXED: Record<string, Item> = {
  gomi: { key: 'gomi', title: <Bi k="home.gomi" />, icon: 'bin', to: '/gomi' },
  letter: { key: 'letter', title: <Bi k="home.letter" />, icon: 'letter', to: '/letter' },
  clinic: { key: 'clinic', title: <Bi k="clinic.home" />, icon: 'clinic', to: '/clinic' },
  search: { key: 'search', title: <Bi k="home.search" />, icon: 'search', to: '/search' },
};
/** 引っ越し（E-move）は今までどおり /move。ほかの built のイベントは共通の /e/{id} */
function menuItems(): Item[] {
  const events = DATA().events.filter((e) => e.status === 'built' && e.menu !== undefined).sort((a, b) => a.menu! - b.menu!);
  const list: Item[] = events.map((e) => (e.id === 'E-move'
    ? { key: e.id, title: <Bi k="home.move" />, icon: 'box', to: '/move' }
    : { key: e.id, title: <Bi t={e.title} />, icon: e.illustration, to: '/e/' + e.id }));
  // 固定の項目は、同じ group の出来事が入口のメニューにあるときは出さない（出来事のほうを使う）
  const fixed = [FIXED.gomi, FIXED.clinic, FIXED.letter, FIXED.search].filter((f) => !events.some((e) => e.group === f.key));
  return [...list, ...fixed];
}
const LINKS = [
  { k: 'home.locate', to: '/here' },
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
          {menuItems().map((m) => (
            <li key={m.key}>
              <Link to={m.to} className="k-answer">
                <img src={art(m.icon)} alt="" />
                {m.title}
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
