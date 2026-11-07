/* 入口と「手続きを探す」を1つにした形（作者 11/7 の試し。App.tsx の COMBINED_HOME で切りかえる。もどすときは false にする）。
   上に検索の欄と、ことばの候補。何か書くと、合う手続きを上に出し、できごとの箱はその下へ下がる。
   言葉1つでも、文でも探せる（src/core/search.ts）。探した言葉は URL にも保存にも入れない（SPEC 13.4）。 */
import { useId, useMemo, useState } from 'react';
import { rank } from '../core/search';
import { useCatalogue } from '../guide/catalogue';
import { Bi } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CardRow } from '../ui/guide';
import { LocationAsk, NearBand } from '../ui/Location';
import { Link, useFocusTitle } from '../ui/router';
import { LINKS, menuItems } from './Home';

export function HomeSearch({ hasProgress, continueTo = '/now' }: { hasProgress: boolean; continueTo?: string }) {
  useFocusTitle('home');
  const groups = useCatalogue();
  const { level } = usePrefs();
  const [q, setQ] = useState('');
  const id = useId();
  const all = useMemo(() => groups.flatMap((gr) => gr.views.map((c) => ({ card: c.card, c, base: gr.base }))), [groups]);
  const found = useMemo(() => (q.trim() ? rank(all, q) : []), [all, q]);
  // 手がかりにした言葉（ほかの言葉の中に入っている言葉は出さない：「引っ越」と「引っ越し」なら「引っ越し」）
  const hitSet = [...new Set(found.flatMap((x) => x.hits))];
  const heard = hitSet.filter((w) => !hitSet.some((o) => o !== w && o.includes(w))).slice(0, 8);
  const chips = line(ui('home.chips'), level).split(/、|,\s*/).filter(Boolean);
  // 「ほかの手続きを探す」の箱は、ここに検索があるので出さない
  const items = menuItems().filter((m) => m.key !== 'search');
  const asking = !!q.trim();
  return (
    <>
      <div className="head">
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="home.title" /></h1>
      </div>
      <div role="search" className="search" aria-labelledby={id + 'l'}>
        <label id={id + 'l'} htmlFor={id} className="label"><Bi k="home.ask" /></label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
        <div className="chips">
          {chips.map((w) => <button key={w} type="button" className="chip" onClick={() => setQ(w)}>{w}</button>)}
        </div>
      </div>
      {/* 結果の数は読み上げにも知らせる（数だけ。15.2） */}
      <p className="sr-only" role="status">{asking ? (found.length ? <><Bi k="search.found" />（{found.length}）</> : <Bi k="search.none" />) : null}</p>
      {asking && (
        <section className="group" aria-labelledby={id + 'f'}>
          {found.length ? (
            <>
              <h2 id={id + 'f'}><Bi phrase k="search.found" />（{found.length}）</h2>
              {heard.length > 0 && (
                <p className="sub home-heard"><Bi k="home.heard" />{heard.map((w) => <span key={w} className="chip--static">{w}</span>)}</p>
              )}
              <ul className="list" role="list">{found.map((x) => <CardRow key={x.item.card.id} c={x.item.c} base={x.item.base} />)}</ul>
              <p className="sub"><Bi k="search.notYours" /></p>
            </>
          ) : (
            <p id={id + 'f'} className="k-notice" role="note"><Bi k="search.none" /></p>
          )}
        </section>
      )}
      {/* 位置（A-6）：使うかを一度だけ聞く。使うなら近くの区役所の帯 */}
      <LocationAsk />
      <NearBand />
      {hasProgress && <Link to={continueTo} className="k-answer k-answer--primary"><img src={art('calendar')} alt="" /><span className="k-answer__text"><Bi phrase k="home.continue" /></span></Link>}
      <nav aria-labelledby={id + 'b'}>
        <h2 id={id + 'b'} className="label"><Bi phrase k="home.browse" /></h2>
        <ul className="tiles" role="list">
          {items.map((m) => (
            <li key={m.key}>
              <Link to={m.to} className="tile">
                <img src={art(m.icon)} alt="" />
                <span className="tile__text">{m.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="links">
        {LINKS.map((l) => (
          <Link key={l.k} to={l.to} className="link"><Bi k={l.k} /></Link>
        ))}
        {import.meta.env.DEV && <Link to="/review" className="link"><Bi k="review.link" /></Link>}
      </div>
    </>
  );
}
