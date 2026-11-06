/* いまいる場所から（SPEC 6A.11）。押したときだけ位置の許可を求める。
   位置は端末の中で比べ、送らない・保存しない・URL に入れない（13章）。この画面の中の状態だけに置き、離れたら消える。
   300m 以内で誤差も 300m 以下なら「〇〇の近くにいますか？」。それ以外（遠い・誤差が大きい・断られた）は、区の一覧から選ぶ。 */
import { useEffect, useState } from 'react';
import { mapLinks, nearby, PLACES, type Place } from '../core/places';
import { Bi, One } from '../i18n/Ruby';
import { fill } from '../ui/guide';
import { ui, type UiKey } from '../i18n/text';
import { art } from '../ui/art';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { CardList } from './Scene';
import { clearHerePlace, peekHerePlace } from '../ui/Location';

type St =
  | { k: 'start' }
  | { k: 'asking' }
  | { k: 'near'; place: Place }
  | { k: 'list'; why: 'denied' | 'inaccurate' | 'far' | 'unavailable' | 'choose' }
  | { k: 'place'; place: Place };

const withName = (key: UiKey, p: Place) => fill(ui(key), 'place', (_lv, id) => p.name[id] ?? p.name.ja_easy ?? p.name.ja);

export function Here() {
  // 入口の「近くの区役所」の帯から来たときは、その場所から始める（メモリの中で受け取る。A-6）
  const [st, setSt] = useState<St>(() => { const p = peekHerePlace(); return p ? { k: 'near', place: p } : { k: 'start' }; });
  useEffect(() => clearHerePlace(), []);
  useFocusTitle('here:' + st.k + ('place' in st ? st.place.id : '') + ('why' in st ? st.why : ''));
  const Title = ({ children }: { children: React.ReactNode }) => <h1 id="screen-title" tabIndex={-1}>{children}</h1>;

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setSt({ k: 'list', why: 'unavailable' }); return; }
    setSt({ k: 'asking' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 位置はここで比べるだけ。値は残さない
        const r = nearby(PLACES(), { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setSt(r.kind === 'near' ? { k: 'near', place: r.place } : { k: 'list', why: r.kind });
      },
      (err) => setSt({ k: 'list', why: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  let body: React.ReactNode;
  if (st.k === 'start' || st.k === 'asking') {
    body = (
      <>
        <div className="art" aria-hidden="true"><img src={art('pin')} alt="" className="art--big" /></div>
        <div className="head"><Title><Bi k="here.title" /></Title></div>
        <p className="sub"><Bi k="here.privacy" /></p>
        <button type="button" className="k-answer k-answer--primary" onClick={locate} disabled={st.k === 'asking'} aria-busy={st.k === 'asking'}>
          <img src={art('pin')} alt="" /><Bi k={st.k === 'asking' ? 'here.asking' : 'here.use'} />
        </button>
        <button type="button" className="k-answer" onClick={() => setSt({ k: 'list', why: 'choose' })}><img src={art('hall')} alt="" /><Bi k="here.choose" /></button>
      </>
    );
  } else if (st.k === 'near') {
    const p = st.place;
    body = (
      <>
        <div className="art" aria-hidden="true"><img src={art('hall')} alt="" className="art--big" /></div>
        <div className="head"><Title><Bi t={withName('here.near', p)} /></Title></div>
        <div className="list">
          <button type="button" className="k-answer k-answer--primary" onClick={() => setSt({ k: 'place', place: p })}><Bi k="here.yes" /></button>
          <button type="button" className="k-answer" onClick={() => navigate('/')}><Bi k="here.passing" /></button>
        </div>
      </>
    );
  } else if (st.k === 'list') {
    body = (
      <>
        <div className="head"><Title><Bi k="here.listTitle" /></Title></div>
        {st.why !== 'choose' && <p className="sub" role="status"><Bi k={('here.why.' + st.why) as UiKey} /></p>}
        <ul className="list" role="list">
          {PLACES().map((p) => (
            <li key={p.id}><button type="button" className="k-answer" onClick={() => setSt({ k: 'place', place: p })}><Bi t={p.name} /></button></li>
          ))}
        </ul>
      </>
    );
  } else {
    const p = st.place;
    body = (
      <>
        <div className="head">
          <p className="eyebrow"><One t={p.name} /></p>
          <Title><Bi k="here.canDo" /></Title>
        </div>
        <PlaceInfo p={p} />
        <CardList place={p.kind === 'branch' ? 'ward_office' : p.kind} stage="before" />
        <button type="button" className="link" onClick={() => setSt({ k: 'list', why: 'choose' })}><Bi k="here.other" /></button>
      </>
    );
  }
  return (
    <>
      {body}
      <p className="sub"><Bi k="here.credit" /></p>
      <div className="links"><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}

/** 住所と、地図のアプリで開くリンク（外のサイト。新しいタブ） */
function PlaceInfo({ p }: { p: Place }) {
  const m = mapLinks(p);
  return (
    <section className="placeinfo" aria-labelledby="place-address">
      <h2 id="place-address" className="label"><One k="here.address" /></h2>
      <p lang="ja" className="placeinfo__addr">{p.address}</p>
      <div className="links">
        <a className="link" href={m.apple} target="_blank" rel="noopener noreferrer"><Bi k="here.mapApple" /><span className="sr-only"><One k="here.newTab" /></span></a>
        <a className="link" href={m.google} target="_blank" rel="noopener noreferrer"><Bi k="here.mapGoogle" /><span className="sr-only"><One k="here.newTab" /></span></a>
      </div>
    </section>
  );
}
