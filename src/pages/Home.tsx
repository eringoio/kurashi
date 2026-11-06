/* 入口（SPEC 6A.1）。開いたときの出し分けは App（src/core/entry.ts）で行う。
   ここに来るのは、初めての人・入口にもどった人・すべて済んだ人。進捗があれば、続きへの入口を上に出す。 */
import type { ReactNode } from 'react';
import { DATA } from '../core/data';
import { Bi } from '../i18n/Ruby';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';
import { LocationAsk, NearBand } from '../ui/Location';

type Item = { key: string; title: ReactNode; icon: string; to: string; menu: number };
/** 固定の項目（ごみ・書類・病院・探す）。menu は、できごとの menu（data/events.json）と同じ並びの番号（作者 11/6 A-10：よくある順。探すは最後） */
const FIXED: Record<string, Item> = {
  gomi: { key: 'gomi', title: <Bi k="home.gomi" />, icon: 'bin', to: '/gomi', menu: 2 },
  letter: { key: 'letter', title: <Bi k="home.letter" />, icon: 'letter', to: '/letter', menu: 3 },
  clinic: { key: 'clinic', title: <Bi k="clinic.home" />, icon: 'clinic', to: '/clinic', menu: 4 },
  search: { key: 'search', title: <Bi k="home.search" />, icon: 'search', to: '/search', menu: 999 },
};
/** 引っ越し（E-move）は今までどおり /move。ほかの built のイベントは共通の /e/{id} */
function menuItems(): Item[] {
  const events = DATA().events.filter((e) => e.status === 'built' && e.menu !== undefined).sort((a, b) => a.menu! - b.menu!);
  const list: Item[] = events.map((e) => (e.id === 'E-move'
    ? { key: e.id, title: <Bi k="home.move" />, icon: 'box', to: '/move', menu: e.menu! }
    : { key: e.id, title: <Bi t={e.title} />, icon: e.illustration, to: '/e/' + e.id, menu: e.menu! }));
  // 固定の項目は、同じ group の出来事が入口のメニューにあるときは出さない（出来事のほうを使う）
  const fixed = [FIXED.gomi, FIXED.clinic, FIXED.letter, FIXED.search].filter((f) => !events.some((e) => e.group === f.key));
  return [...list, ...fixed].sort((a, b) => a.menu - b.menu);
}
const LINKS = [
  // 語学学習（10b）：出会った言葉の一覧
  { k: 'words.link', to: '/words' },
  { k: 'home.about', to: '/info/about' },
  { k: 'home.disclaimer', to: '/info/disclaimer' },
] as const;

export function Home({ hasProgress }: { hasProgress: boolean }) {
  useFocusTitle('home');
  return (
    <>
      <div className="art" aria-hidden="true">
        <img src="/icons/kurashi-logo.svg" alt="" className="art__logo" />
      </div>
      <div className="art" aria-hidden="true">
        <img src={art('house')} alt="" />
        <img src={art('you')} alt="" />
        <img src={art('bin')} alt="" />
        <img src={art('letter')} alt="" />
      </div>
      <div className="head">
        <h1 id="screen-title" tabIndex={-1}><Bi k="home.title" /></h1>
      </div>
      {/* 位置（A-6）：使うかを一度だけ聞く。使うなら近くの区役所の帯 */}
      <LocationAsk />
      <NearBand />
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
