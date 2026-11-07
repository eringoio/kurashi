/* 開き直したときの画面：途中からの続き（6A.1 の出し分けの4）と、約束した日（5・6） */
import type { Resume as ResumeT } from '../core/entry';
import { useGuide } from '../guide/useGuide';
import { Bi } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CardRow } from '../ui/guide';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { visitPath, visitsToday } from '../core/accompany';
import { DATA } from '../core/data';
import { ui, type UiKey } from '../i18n/text';
import { agendaToday } from '../core/now';
import { withPlace } from './Visit';
import { useEvent } from '../guide/useEvent';
import { eventStore } from '../guide/eventStore';
import { todayJst } from '../core/date';
import { openEventPlans, type Occurrence } from '../core/occurrence';

export function ResumePage() {
  const { vault } = usePrefs();
  const g = useGuide();
  useFocusTitle('resume');
  const r = vault.get<ResumeT>('resume', 'value');
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('box')} alt="" className="art--big" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="resume.title" /></h1></div>
      <p className="sub"><Bi k="resume.sub" /></p>
      <div className="list">
        <button type="button" className="k-answer k-answer--primary" onClick={() => navigate(r?.step ?? '/move')}><Bi phrase k="resume.continue" /></button>
        <button type="button" className="k-answer" onClick={() => { void g.setResume(null); navigate('/'); }}><Bi phrase k="resume.menu" /></button>
      </div>
    </>
  );
}

/** 約束した日が今日、または過ぎた（済んだと記録していない） */
export function PromisePage({ past, cardIds }: { past: boolean; cardIds: string[] }) {
  const g = useGuide();
  const { vault } = usePrefs();
  useFocusTitle('promise');
  // 今日の予定は「いま」の today と同じ項目（agendaToday。K-35）。過ぎた日は入口の出し分けの card_ids
  const views = past ? g.out.cards.filter((c) => cardIds.includes(c.card.id)) : agendaToday(g.out, g.today);
  // 生活イベント（/e/...）で決めた日の項目は、イベントごとにまとめる（引っ越しの項目と重ねない）
  const mainIds = new Set(views.map((c) => c.card.id));
  const byEvent = new Map<string, string[]>();
  for (const x of openEventPlans(vault.entries('occurrences').map(([, o]) => o as Occurrence))) {
    if (!cardIds.includes(x.plan.card_id) || mainIds.has(x.plan.card_id)) continue;
    byEvent.set(x.event_id, [...(byEvent.get(x.event_id) ?? []), x.plan.card_id]);
  }
  const events = [...byEvent.entries()];
  const markDone = (ids: string[]) => { const id = events.find(([, xs]) => xs === ids)![0]; return eventStore(vault, id, { questions: DATA().questions, cards: DATA().cards, today: todayJst }).setPlans(ids, { status: 'done' }); };
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('calendar')} alt="" className="art--big" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k={past ? 'promise.past' : 'promise.today'} /></h1></div>
      {past ? <ul className="list" role="list">{views.map((c) => <CardRow key={c.card.id} c={c} />)}</ul> : views.length > 0 && <TodayVisits views={views} />}
      {events.map(([id, ids]) => <EventPromise key={id} eventId={id} ids={ids} />)}
      {past && (
        <div className="list">
          <button type="button" className="k-answer k-answer--primary" onClick={async () => { for (const c of views) await g.setPlan(c.card.id, { status: 'done' }); for (const [, ids] of events) await markDone(ids); navigate(events.length && !views.length ? '/e/' + events[0][0] : '/now'); }}><Bi phrase k="promise.went" /></button>
          {/* 開く先があるときだけ（無いと /e/undefined/... になる。U12） */}
          {(views.length > 0 || events.length > 0) && <Link to={views.length ? '/c/' + views[0].card.id : '/e/' + events[0][0] + '/c/' + events[0][1][0]} className="k-answer"><Bi phrase k="promise.notYet" /></Link>}
        </div>
      )}
    </>
  );
}


/** 生活イベント（/e/...）で決めた日の項目。そのイベントの画面で開く（付き添いはイベントの「いま」から） */
function EventPromise({ eventId, ids }: { eventId: string; ids: string[] }) {
  const eg = useEvent(eventId);
  if (!eg) return null;
  const views = eg.out.cards.filter((c) => ids.includes(c.card.id));
  if (!views.length) return null;
  return (
    <section className="visitgroup" aria-labelledby={'today-' + eventId}>
      <h2 id={'today-' + eventId} className="label"><Bi phrase t={eg.event.title} /></h2>
      <ul className="list" role="list">{views.map((c) => <CardRow key={c.card.id} c={c} base={'/e/' + eventId + '/c/'} />)}</ul>
      <Link to={'/e/' + eventId} className="k-answer k-answer--primary"><Bi phrase k="nav.next" /></Link>
    </section>
  );
}

/** 今日の行く所ごとに、付き添いを始める（6A.6）。行く所の無い項目は、そのまま並べる */
function TodayVisits({ views }: { views: ReturnType<typeof useGuide>['out']['cards'] }) {
  const g = useGuide();
  const origin = typeof g.answers['Q-origin'] === 'string' ? (g.answers['Q-origin'] as string) : undefined;
  const visits = visitsToday(g.out, DATA().objects, g.objects, origin, g.today);
  const inVisit = new Set(visits.flatMap((v) => v.cards.map((c) => c.card.id)));
  const rest = views.filter((c) => !inVisit.has(c.card.id));
  return (
    <>
      {visits.map((v) => (
        <section key={v.place} className="visitgroup" aria-labelledby={'today-' + v.place}>
          <h2 id={'today-' + v.place} className="label"><Bi phrase t={ui(('placeTitle.' + v.place) as UiKey) ?? ui(('place.' + v.place) as UiKey) ?? { ja: v.place }} /></h2>
          <ul className="list" role="list">{v.cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
          <Link to={visitPath(v.place, 'before')} className="k-answer k-answer--primary"><Bi phrase t={withPlace(ui('visit.start'), v.place)} /></Link>
        </section>
      ))}
      {rest.length > 0 && <ul className="list" role="list">{rest.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>}
    </>
  );
}
