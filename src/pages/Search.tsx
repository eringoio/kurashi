/* 手続きを探す（試作 D の S16）。名前・よみ・ローマ字・英語（カードの keywords）で探す。
   公開しているできごと（built）すべての手続きから探す（K-38・U03）。引っ越しのカードは /c/{id}、ほかは /e/{event}/c/{id} で開く。
   探した言葉は URL にも保存にも入れない（SPEC 13.4）。結果は全体と同じ行で、開くと理由が出る。 */
import { useId, useState } from 'react';
import type { CardView } from '../core/engine';
import { useCatalogue } from '../guide/catalogue';
import { Bi } from '../i18n/Ruby';
import { line, plain, reading, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { CardRow } from '../ui/guide';
import { useFocusTitle } from '../ui/router';
import { DocResults, useDocSearch } from '../ui/DocSearch';

/** 比べる形：全角・半角をそろえ、小文字にし、カタカナをひらがなにする。空白は外す */
export const norm = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/\s+/g, '');

function words(c: Pick<CardView, 'card'>): string[] {
  const t = Object.values(c.card.title).filter((x): x is string => typeof x === 'string');
  return [...t.map(plain), ...t.map(reading), c.card.official_name.ja, c.card.official_name.reading, ...c.card.keywords].map(norm);
}
export function match(c: Pick<CardView, 'card'>, q: string): boolean {
  const n = norm(q);
  return !!n && words(c).some((w) => w.includes(n));
}

export function Search() {
  const groups = useCatalogue();
  const { level } = usePrefs();
  const [q, setQ] = useState('');
  const id = useId();
  useFocusTitle('search');
  const all = groups.flatMap((gr) => gr.views.map((c) => ({ c, base: gr.base })));
  const found = q.trim() ? all.filter((x) => match(x.c, q)) : [];
  // 書類も探す（v0.5.31）。書類が合えば「見つかりません」にしない
  const docs = useDocSearch(q);
  const chips = line(ui('search.chips'), level).split(/、|,\s*/).filter(Boolean);
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="search.title" /></h1></div>
      <div className="search">
        <label htmlFor={id} className="label"><Bi k="search.label" /></label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
        <div className="chips">
          {chips.map((w) => <button key={w} type="button" className="chip" onClick={() => setQ(w)}>{w}</button>)}
        </div>
      </div>
      {/* 結果の数は読み上げにも知らせる（数だけ。一覧そのものは読み上げで繰り返さない。15.2） */}
      <p className="sr-only" role="status">{q.trim() ? (found.length + docs.length ? <><Bi k="search.found" />（{found.length + docs.length}）</> : <Bi k="search.none" />) : null}</p>
      <section className="group">
        {q.trim() ? (
          found.length ? (
            <>
              <h2><Bi phrase k="search.found" />（{found.length}）</h2>
              <ul className="list" role="list">{found.map((x) => <CardRow key={x.c.card.id} c={x.c} base={x.base} />)}</ul>
              <p className="sub"><Bi k="search.notYours" /></p>
            </>
          ) : docs.length ? null : (
            <p className="k-notice" role="note"><Bi k="search.none" /></p>
          )
        ) : (
          <>
            <h2><Bi phrase k="search.all" />（{all.length}）</h2>
            {groups.map((gr) => (
              <section key={gr.event.id} aria-labelledby={id + gr.event.id}>
                <h3 id={id + gr.event.id} className="label"><Bi phrase t={gr.event.title} /></h3>
                <ul className="list" role="list">{gr.views.map((c) => <CardRow key={c.card.id} c={c} base={gr.base} />)}</ul>
              </section>
            ))}
          </>
        )}
      </section>
      {q.trim() && <DocResults q={q} />}
    </>
  );
}
