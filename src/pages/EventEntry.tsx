/* 生活イベントの入口（/e/{id}）の前に置く薄い包み。イベントの名前では分岐しない。
   1. 範囲のルールが「範囲外」のとき（例：他の市町村の中だけの引っ越し）は、範囲外の案内を出す。やり直しもできる。
   2. 入口の質問がなく、いまやることも無く、道具の画面（tool）があるときは、道具の画面へ置きかえる（K-18：/e/E-gomi → /gomi）。
   3. 聞く質問がなく、いまやることも無い（日を聞かない案内だけ）のときは、最初から一覧（全体）を出す。タブと「始める」は出さない（U04）。
   4. 目的の手続きが1つだけ（ほかは関連する情報だけ）のときは、その手続きの画面へ置きかえる（v0.5.30：ファミリーシップ、運転免許の目的を選んだあと）。 */
import { useEffect } from 'react';
import { DATA } from '../core/data';
import { nowStep } from '../core/now';
import { useEvent } from '../guide/useEvent';
import { Bi } from '../i18n/Ruby';
import { navigate } from '../ui/router';
import { overviewReady, singleGoal } from '../core/overview';
import { EventOverview } from './EventOverview';
import { EventPage } from './EventPage';
import { Info } from './Info';

export function EventEntry({ eventId, view, onLive }: { eventId: string; view: 'now' | 'all' | 'step'; onLive: (s: string) => void }) {
  const g = useEvent(eventId);
  const phased = !!g?.event.phases?.length;
  const step = g ? nowStep(g.out, g.today, { urgentFirst: !phased }) : null;
  const idle = step?.kind === 'idle';
  const single = g && step && view === 'now' && !phased && g.out.scope !== 'F' ? singleGoal(g.out, step) : null;
  const tool = g && g.out.scope !== 'F' && idle && g.event.questions.length === 0 ? g.event.tool?.path : single ? '/e/' + g!.event.id + '/c/' + single.card.id : undefined;
  // 履歴を増やさずに置きかえる（もどるで /e/... に来て、また飛ばされることがないように）
  useEffect(() => { if (tool) { history.replaceState(null, '', tool); dispatchEvent(new PopStateEvent('popstate')); } }, [tool]);
  if (tool) return null;
  if (g && g.out.scope === 'F') {
    return (
      <>
        <Info id="out-of-scope" reason={g.event.scope_rule ? DATA().rules.get(g.event.scope_rule)?.reason_when_false : undefined} />
        <div className="links">
          <button type="button" className="link" onClick={async () => { await g.startNew(); navigate('/e/' + g.event.id); }}><Bi k="ev.startNew" /></button>
        </div>
      </>
    );
  }
  // 段のあるできごと（v0.5.28）：1つずつ進める画面は任意。最初の質問に答えたら、いま／全体のどちらも全体の画面
  if (g && phased && view === 'step') return <EventPage eventId={eventId} view="now" step onLive={onLive} />;
  if (g && overviewReady(g.event, g.answers)) return <EventOverview g={g} onLive={onLive} />;
  // 案内だけのできごと（いまやることが無く、見せる項目がある）：いま／全体が同じになるので、一覧だけ
  const onlyGuides = !!g && idle && g.out.cards.some((c) => c.state === 'shown' || c.state === 'check_at_office');
  // すぐにやることの一覧（K-15）：最初の質問が済んだら、全体（チェックの一覧）を出す
  const checklist = !!g && view === 'now' && !!g.event.checklist && g.out.upfront.length === 0;
  return <EventPage eventId={eventId} view={onlyGuides || checklist || view === 'all' ? 'all' : 'now'} onlyGuides={onlyGuides} onLive={onLive} />;
}
