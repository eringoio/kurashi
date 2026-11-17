/* 短期滞在の人の専用の画面（R-10 / O-4。src/core/shortStay.ts）。
   1. 対象ではない手続き（短い一覧）　2. 使える入口　3. もっと長くいたいとき（くわしくは開いたときだけ。出入国在留管理庁の案内）。
   生活イベントの入口（範囲外のとき）と /short-stay の両方から使う。 */
import { DATA } from '../core/data';
import { SHORT_STAY, SHORT_STAY_ENTRANCES } from '../core/shortStay';
import { useHiddenEvents } from '../guide/catalogue';
import { Bi, One } from '../i18n/Ruby';
import type { UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';
import { menuItems } from './Home';

const NOT_APPLY: UiKey[] = ['shortStay.not.juminhyo', 'shortStay.not.kokuho', 'shortStay.not.nenkin', 'shortStay.not.mynumber', 'shortStay.not.zairyu'];

export function ShortStayBody() {
  const hidden = useHiddenEvents();
  const { vault } = usePrefs();
  // どの答えでこの画面になったか（在留資格か、住民登録の形か。両方のこともある）。それぞれの答えを変える道を出す（HB-3）
  const byStatus = vault.get('profile', 'Q-zairyu-status') === SHORT_STAY;
  const byBasis = vault.get('profile', 'Q-residence-basis') === SHORT_STAY;
  const url = DATA().sources.find((s) => s.source_id === 'isa-short-stay')?.url ?? undefined;
  const entrances = menuItems(hidden).filter((m) => (SHORT_STAY_ENTRANCES as readonly string[]).includes(m.to));
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('bulb')} alt="" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="shortStay.title" /></h1></div>
      <p className="sub"><Bi k="shortStay.lead" /></p>
      <section aria-labelledby="ss-not">
        <h2 id="ss-not" className="qblock__title"><Bi phrase k="shortStay.not.title" /></h2>
        <ul className="prose">{NOT_APPLY.map((k) => <li key={k}><Bi k={k} /></li>)}</ul>
      </section>
      <section aria-labelledby="ss-use">
        <h2 id="ss-use" className="qblock__title"><Bi phrase k="shortStay.use.title" /></h2>
        <ul className="tiles" role="list">
          {entrances.map((m) => (
            <li key={m.key}>
              <Link to={m.to} className="tile"><img src={art(m.icon)} alt="" /><span className="tile__text">{m.title}</span></Link>
            </li>
          ))}
        </ul>
      </section>
      <details className="group__more">
        <summary><Bi k="shortStay.more" /></summary>
        <div className="prose">
          <p><Bi k="shortStay.more.p1" /></p>
          <p><Bi k="shortStay.more.p2" /></p>
          {url && <p><a className="link" href={url} target="_blank" rel="noopener noreferrer"><Bi k="shortStay.more.link" /><span aria-hidden="true"> ↗</span><span className="sr-only"><One k="here.newTab" /></span></a></p>}
        </div>
      </details>
      {(byStatus || byBasis) && (
        <div className="k-notice" role="note">
          {byStatus && <p><Bi k="shortStay.cause.status" /></p>}
          {byBasis && <p><Bi k="shortStay.cause.basis" /></p>}
        </div>
      )}
      <div className="links">
        {byBasis && <Link to="/move/basis" className="link"><Bi k="shortStay.changeBasis" /></Link>}
        {(byStatus || !byBasis) && <Link to="/about" className="link"><Bi k="shortStay.change" /></Link>}
      </div>
    </>
  );
}

/** /short-stay */
export function ShortStayPage() {
  useFocusTitle('short-stay');
  return <ShortStayBody />;
}
