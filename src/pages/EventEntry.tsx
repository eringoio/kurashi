/* 生活イベントの入口（/e/{id}）の前に置く薄い包み。イベントの名前では分岐しない。
   1. 範囲のルールが「範囲外」のとき（例：他の市町村の中だけの引っ越し）は、範囲外の案内を出す。やり直しもできる。
   2. 聞く質問がなく、いまやることも無い（日を聞かない案内だけ）のときは、最初から一覧（全体）を出す。 */
import { nowStep } from '../core/now';
import { useEvent } from '../guide/useEvent';
import { Bi } from '../i18n/Ruby';
import { navigate } from '../ui/router';
import { EventPage } from './EventPage';
import { Info } from './Info';

export function EventEntry({ eventId, view, onLive }: { eventId: string; view: 'now' | 'all'; onLive: (s: string) => void }) {
  const g = useEvent(eventId);
  if (g && g.out.scope === 'F') {
    return (
      <>
        <Info id="out-of-scope" />
        <div className="links">
          <button type="button" className="link" onClick={async () => { await g.startNew(); navigate('/e/' + g.event.id); }}><Bi k="ev.startNew" /></button>
        </div>
      </>
    );
  }
  const onlyGuides = !!g && view === 'now' && nowStep(g.out, g.today).kind === 'idle' && g.out.cards.some((c) => c.state === 'shown' || c.state === 'check_at_office');
  return <EventPage eventId={eventId} view={onlyGuides ? 'all' : view} onLive={onLive} />;
}
