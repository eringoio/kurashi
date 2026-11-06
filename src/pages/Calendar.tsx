/* カレンダー（作者の指示 2026-11-05）：行く日を決めた手続きを、日と行く所ごとに並べる。カレンダーに追加は、日を決めた直後の画面だけ（11/6 A-1）。
   答え・日付は URL に入れない（13.4）。 */
import type { CardView } from '../core/engine';
import { DATA } from '../core/data';
import type { PlanRecord } from '../core/entry';
import { openEventPlans, type Occurrence } from '../core/occurrence';
import { HOLIDAYS } from '../core/calendarData';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CalendarGrid } from '../ui/CalendarGrid';
import { CardRow, fmtDay } from '../ui/guide';
import type { Text } from '../core/schema';
import { Link, useFocusTitle } from '../ui/router';
import { placeTitle } from './Visit';

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

/** 生活イベント（/e/...）で決めた行く日。日と出来事ごと（今日から後、済んでいないもの）。引っ越しの一覧と同じ手続き・同じ日は除く */
export function plannedEventVisits(plans: { event_id: string; plan: PlanRecord }[], today: string, skip: Set<string>): { day: string; event_id: string; card_ids: string[] }[] {
  const by = new Map<string, { day: string; event_id: string; card_ids: string[] }>();
  for (const { event_id, plan: p } of plans) {
    const d = p.planned_on;
    if (!d || d < today || p.status === 'done' || p.status === 'dismissed' || skip.has(p.card_id + '|' + d)) continue;
    const k = d + '|' + event_id;
    const g = by.get(k) ?? { day: d, event_id, card_ids: [] };
    if (!g.card_ids.includes(p.card_id)) g.card_ids.push(p.card_id);
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function CalendarPage() {
  const g = useGuide();
  const { level, vault } = usePrefs();
  useFocusTitle('calendar');
  const list = plannedVisits(g.out.cards, g.today);
  // 生活イベント（/e/...）で決めた日も出す（引っ越しの一覧と重なる手続き・日は除く）
  const inList = new Set(list.flatMap((v) => v.cards.map((c) => c.card.id + '|' + v.day)));
  const evList = plannedEventVisits(openEventPlans(vault.entries('occurrences').map(([, o]) => o as Occurrence)), g.today, inList);
  // 下の一覧と同じもの（全部の出来事の手続き）から、日ごとの件数を作る
  const marks: Record<string, number> = {};
  for (const v of list) marks[v.day] = (marks[v.day] ?? 0) + v.cards.length;
  for (const v of evList) marks[v.day] = (marks[v.day] ?? 0) + v.card_ids.length;
  const empty = list.length === 0 && evList.length === 0;
  const evTitle = (id: string): Text => DATA().events.find((e) => e.id === id)?.title ?? { ja: id };
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('calendar')} alt="" className="art--big" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="cal.page" /></h1></div>
      {empty ? (
        <>
          <p className="sub"><Bi k="cal.empty" /></p>
          <Link to="/now" className="k-answer k-answer--primary"><Bi phrase k="now.back" /></Link>
        </>
      ) : <p className="sub"><Bi k="cal.pageSub" /></p>}
      <CalendarGrid today={g.today} holidays={HOLIDAYS()} marks={marks} readOnly />
      {list.map((v) => (
        <section key={v.day + (v.place ?? '')} className="group visitgroup" aria-labelledby={'cal-' + v.day + (v.place ?? '')}>
          <h2 id={'cal-' + v.day + (v.place ?? '')}>
            {fmtDay(v.day, level)}{v.place && <>　<One t={placeTitle(v.place) ?? { ja: v.place }} /></>}
          </h2>
          <ul className="list" role="list">{v.cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
        </section>
      ))}
      {evList.map((v) => (
        <section key={v.day + v.event_id} className="group visitgroup" aria-labelledby={'cal-' + v.day + v.event_id}>
          <h2 id={'cal-' + v.day + v.event_id}>{fmtDay(v.day, level)}　<One t={evTitle(v.event_id)} /></h2>
          <ul className="list" role="list">{v.card_ids.map((cid) => { const c = DATA().cards.find((x) => x.id === cid); return c ? <li key={cid}><Link className="k-answer" to={'/e/' + v.event_id + '/c/' + cid}><Bi phrase t={c.title} /></Link></li> : null; })}</ul>
        </section>
      ))}
      {!empty && <div className="links"><Link to="/now" className="link"><Bi k="now.back" /></Link></div>}
    </>
  );
}
