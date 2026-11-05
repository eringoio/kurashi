/* カレンダー（作者の指示 2026-11-05）：行く日を決めた手続きを、日と行く所ごとに並べる。端末のカレンダーに入れられる（.ics）。
   答え・日付は URL に入れない（13.4）。 */
import type { CardView } from '../core/engine';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { AddToCalendar } from '../ui/AddToCalendar';
import { CardRow, fmtDay } from '../ui/guide';
import { Link, useFocusTitle } from '../ui/router';

/** 日と行く所ごとのまとまり（今日から後、済んでいないもの）。日の順 */
export function plannedVisits(cards: CardView[], today: string): { day: string; place?: string; cards: CardView[] }[] {
  const by = new Map<string, { day: string; place?: string; cards: CardView[] }>();
  for (const c of cards) {
    const d = c.plan?.planned_on;
    if (!d || d < today || c.plan?.status === 'done' || c.plan?.status === 'dismissed') continue;
    const k = d + '|' + (c.card.place ?? c.card.id);
    const g = by.get(k) ?? { day: d, place: c.card.place, cards: [] };
    g.cards.push(c);
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function CalendarPage() {
  const g = useGuide();
  const { level } = usePrefs();
  useFocusTitle('calendar');
  const list = plannedVisits(g.out.cards, g.today);
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('calendar')} alt="" className="art--big" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="cal.page" /></h1></div>
      {list.length === 0 ? <p className="sub"><Bi k="cal.empty" /></p> : <p className="sub"><Bi k="cal.pageSub" /></p>}
      {list.map((v) => (
        <section key={v.day + (v.place ?? '')} className="group visitgroup" aria-labelledby={'cal-' + v.day + (v.place ?? '')}>
          <h2 id={'cal-' + v.day + (v.place ?? '')}>
            {fmtDay(v.day, level)}{v.place && <>　<One t={ui(('place.' + v.place) as UiKey) ?? { ja: v.place }} /></>}
          </h2>
          <ul className="list" role="list">{v.cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
          <AddToCalendar day={v.day} place={v.place} cardIds={v.cards.map((c) => c.card.id)} />
        </section>
      ))}
      <div className="links"><Link to="/now" className="link"><Bi k="now.back" /></Link></div>
    </>
  );
}
