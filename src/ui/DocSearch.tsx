/* 書類を探す（v0.5.31。作者 11/8）。名前だけでなく、書類の説明の大事な言葉からも探す（src/core/documents.ts の docSearchItems）。
   端末の中だけで比べる。探した言葉は URL にも保存にも入れない（SPEC 13.4）。
   - DocSearchList：/letter の一覧の上の検索の欄。何も書かなければ全部の書類
   - DocResults：入口の検索の結果の「書類」のまとまり（/doc/{id} へ） */
import { useId, useMemo, useState } from 'react';
import { DOCUMENTS, docSearchItems, type KnownDocument } from '../core/documents';
import { rank } from '../core/search';
import { Bi } from '../i18n/Ruby';
import { art } from './art';
import { Link } from './router';

const useDocs = () => useMemo(() => docSearchItems(DOCUMENTS()), []);

/** 合った書類（合う順）と、手がかりにした言葉 */
export function useDocSearch(q: string) {
  const items = useDocs();
  return useMemo(() => (q.trim() ? rank(items, q).map((x) => ({ doc: x.item.doc, hits: x.hits })) : []), [items, q]);
}

/** 入口の検索の結果の「書類」。合う書類が無ければ何も出さない */
export function DocResults({ q }: { q: string }) {
  const id = useId();
  const found = useDocSearch(q);
  if (!found.length) return null;
  return (
    <section className="group" aria-labelledby={id}>
      <h2 id={id}><Bi phrase k="search.docs" />（{found.length}）</h2>
      <ul className="list" role="list">
        {found.map((x) => (
          <li key={x.doc.id}><Link to={'/doc/' + x.doc.id} className="k-answer"><img src={art('doc')} alt="" /><Bi phrase t={x.doc.title} /></Link></li>
        ))}
      </ul>
    </section>
  );
}

/** /letter の書類の一覧と、その上の検索の欄。onPick：書類を選んだとき（今までどおり一覧の中で説明を開く） */
export function DocSearchList({ onPick, extra }: { onPick: (d: KnownDocument) => void; extra?: React.ReactNode }) {
  const id = useId();
  const [q, setQ] = useState('');
  const found = useDocSearch(q);
  const asking = !!q.trim();
  const list = asking ? found.map((x) => x.doc) : DOCUMENTS();
  const hitSet = [...new Set(found.flatMap((x) => x.hits))];
  const heard = hitSet.filter((w) => !hitSet.some((o) => o !== w && o.includes(w))).slice(0, 8);
  return (
    <>
      <div role="search" className="search" aria-labelledby={id + 'l'}>
        <label id={id + 'l'} htmlFor={id} className="label"><Bi k="letter.search" /></label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
      </div>
      {/* 結果の数は読み上げにも知らせる（15.2） */}
      <p className="sr-only" role="status">{asking ? (found.length ? <><Bi k="search.found" />（{found.length}）</> : <Bi k="letter.searchNone" />) : null}</p>
      {asking && heard.length > 0 && <p className="sub home-heard"><Bi k="home.heard" />{heard.map((w) => <span key={w} className="chip--static">{w}</span>)}</p>}
      {asking && !found.length && <p className="k-notice" role="note"><Bi k="letter.searchNone" /></p>}
      <ul className="list" role="list">
        {list.map((d) => <li key={d.id}><button type="button" className="k-answer" onClick={() => onPick(d)}><img src={art('doc')} alt="" /><Bi phrase t={d.title} /></button></li>)}
        {extra}
      </ul>
    </>
  );
}
