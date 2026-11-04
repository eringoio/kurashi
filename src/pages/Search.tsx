/* 手続きを探す（試作 D の S16）。名前・よみ・ローマ字・英語（カードの keywords）で探す。
   探した言葉は URL にも保存にも入れない（SPEC 13.4）。結果は全体と同じ行で、開くと理由が出る。 */
import { useId, useState } from 'react';
import type { CardView } from '../core/engine';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, plain, reading, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { CardRow } from '../ui/guide';
import { useFocusTitle } from '../ui/router';

/** 比べる形：全角・半角をそろえ、小文字にし、カタカナをひらがなにする。空白は外す */
export const norm = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/\s+/g, '');

function words(c: CardView): string[] {
  const t = Object.values(c.card.title).filter((x): x is string => typeof x === 'string');
  return [...t.map(plain), ...t.map(reading), c.card.official_name.ja, c.card.official_name.reading, ...c.card.keywords].map(norm);
}
export function match(c: CardView, q: string): boolean {
  const n = norm(q);
  return !!n && words(c).some((w) => w.includes(n));
}

export function Search() {
  const g = useGuide();
  const { level } = usePrefs();
  const [q, setQ] = useState('');
  const id = useId();
  useFocusTitle('search');
  const cards = g.out.cards;
  const found = q.trim() ? cards.filter((c) => match(c, q)) : [];
  const chips = line(ui('search.chips'), level).split(/、|,\s*/).filter(Boolean);
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="search.title" /></h1></div>
      <div className="search">
        <label htmlFor={id} className="label"><Bi k="search.label" /></label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" aria-describedby={id + '-hint'} />
        <p id={id + '-hint'} className="sub"><One k="search.hint" /></p>
        <div className="chips">
          {chips.map((w) => <button key={w} type="button" className="chip" onClick={() => setQ(w)}>{w}</button>)}
        </div>
      </div>
      {/* 結果の数は読み上げにも知らせる（入力のたびに画面を変えない。15.2） */}
      <section className="group" aria-live="polite">
        {q.trim() ? (
          found.length ? (
            <>
              <h2><Bi k="search.found" />（{found.length}）</h2>
              <ul className="list" role="list">{found.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
              <p className="sub"><Bi k="search.notYours" /></p>
            </>
          ) : (
            <p className="k-notice" role="note"><Bi k="search.none" /></p>
          )
        ) : (
          <details>
            <summary><Bi k="search.all" />（{cards.length}）</summary>
            <ul className="list" role="list">{cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
          </details>
        )}
      </section>
    </>
  );
}
