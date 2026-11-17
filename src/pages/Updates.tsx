/* 更新情報（/updates。2026-11-14）。日付・種類・短い文・その手続きへのリンク。報告した人のこと・内部のメモは出さない */
import { UPDATES, visibleUpdates } from '../core/updates';
import { Bi, One } from '../i18n/Ruby';
import type { UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { fmtDate } from '../ui/guide';
import { Link, useFocusTitle } from '../ui/router';

export function UpdatesPage() {
  useFocusTitle('updates');
  const { level } = usePrefs();
  const list = visibleUpdates(UPDATES(), import.meta.env.DEV);
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('bulb')} alt="" /></div>
      <div className="head">
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="updates.title" /></h1>
        <p className="sub"><Bi k="updates.lead" /></p>
      </div>
      {list.length === 0 ? <p><Bi k="updates.none" /></p> : (
        <ul className="list updates" role="list">
          {list.map((u) => {
            const to = u.card_id ? '/c/' + u.card_id : u.event_id ? '/e/' + u.event_id : null;
            return (
              <li key={u.id} className="updates__item">
                <p className="sub">
                  <time dateTime={u.date}>{fmtDate(u.date, level)}</time>　<span className="k-state k-state--now"><One k={('updates.type.' + u.type) as UiKey} /></span>
                  {u.status === 'pending' && <>　<span className="k-state k-state--check"><One k="updates.draft" /></span></>}
                </p>
                <p><Bi t={u.title} /></p>
                {to && <p><Link to={to} className="link"><Bi k="updates.open" /></Link></p>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
