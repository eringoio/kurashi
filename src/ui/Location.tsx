/* 位置（作者の指示 2026-11-06 A-6。SPEC 6A.11）。
   入口で一度だけ「位置を使いますか」と聞く（保存の同意のあと）。答えだけを設定に残す（usePrefs().location）。断ったら自動では聞かない。設定で変えられる。
   使うときは、入口に「近くの区役所」の帯を出す。位置は端末の中で比べるだけで、送らない・残さない・URL に入れない（13章）。 */
import { useEffect, useState } from 'react';
import { nearby, PLACES, type Place } from '../core/places';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';
import { fill } from './guide';
import { navigate } from './router';

export type Pos = { lat: number; lng: number; accuracy: number };

/** 位置を1回だけ調べる（端末の中だけ）。断られた・調べられないときは理由 */
export function getPosition(): Promise<Pos | 'denied' | 'unavailable'> {
  return new Promise((res) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { res('unavailable'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => res(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/* /here に渡す場所（メモリの中だけ。URL に入れない） */
let handOff: Place | null = null;
/** 見るだけ（React の StrictMode は初期値の関数を2回呼ぶので、ここでは消さない）。消すのは clearHerePlace */
export const peekHerePlace = (): Place | null => handOff;
export const clearHerePlace = () => { handOff = null; };
const openHere = (p: Place) => { handOff = p; navigate('/here'); };

/** 入口の最初に一度だけ聞く。保存の同意（残す・残さない）のあと。見るだけのモードでは聞かない */
export function LocationAsk() {
  const p = usePrefs();
  const mode = p.vault.mode;
  if (p.location !== null || (mode !== 'kept' && mode !== 'not_kept')) return null;
  return (
    <section className="k-notice locask" aria-labelledby="locask-title">
      <h2 id="locask-title" className="label"><Bi phrase k="loc.ask" /></h2>
      <p className="sub"><Bi k="here.privacy" /></p>
      <div className="chips">
        <button type="button" className="seg" onClick={() => p.setLocation('on')}><img src={art('pin')} alt="" className="seg__art" /><One k="loc.yes" /></button>
        <button type="button" className="seg" onClick={() => p.setLocation('off')}><One k="loc.no" /></button>
      </div>
    </section>
  );
}

/** 位置を使うとき：近くの区役所の帯。近くに無い・誤差が大きい・断られたときは何も出さない */
export function NearBand() {
  const { location, level } = usePrefs();
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    if (location !== 'on') { setPlace(null); return; }
    let live = true;
    void getPosition().then((r) => {
      if (!live || typeof r === 'string') return;
      const n = nearby(PLACES(), r);
      setPlace(n.kind === 'near' ? n.place : null);
    });
    return () => { live = false; };
  }, [location]);
  if (!place) return null;
  return (
    <aside className="k-notice nearband" aria-label={line(ui('loc.band'), level)}>
      <button type="button" className="k-answer" onClick={() => openHere(place)}>
        <img src={art('hall')} alt="" />
        <Bi t={fill(ui('here.near'), 'place', (_lv, id) => place.name[id] ?? place.name.ja_easy ?? place.name.ja)} />
      </button>
    </aside>
  );
}
