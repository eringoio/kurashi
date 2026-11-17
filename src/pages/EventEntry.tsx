/* 生活イベントの入口（/e/{id}）の前に置く薄い包み。イベントの名前では分岐しない。
   1. 範囲のルールが「範囲外」のとき（例：他の市町村の中だけの引っ越し）は、範囲外の案内を出す。やり直しもできる。
   2. 入口の質問がなく、いまやることも無く、道具の画面（tool）があるときは、道具の画面へ置きかえる（K-18：/e/E-gomi → /gomi）。
   3. 聞く質問がなく、いまやることも無い（日を聞かない案内だけ）のときは、最初から一覧（全体）を出す。タブと「始める」は出さない（U04）。
   4. 目的の手続きが1つだけ（ほかは関連する情報だけ）のときは、その手続きの画面へ置きかえる（v0.5.30：ファミリーシップ、運転免許の目的を選んだあと）。
   5. 前の画面から答えを引き継いだとき（住まいの「住所の届出」から。kaizen sumai 5）は、まだ答えていない入口の質問に入れ、上に1行（答えを変える付き）。 */
import { useEffect, useState } from 'react';
import { DATA } from '../core/data';
import { handoffPlan, type HandoffItem } from '../core/handoff';
import { nowStep } from '../core/now';
import type { Question } from '../core/schema';
import { useEvent, type EventGuide } from '../guide/useEvent';
import { Bi, One } from '../i18n/Ruby';
import { Answers, WhyAsked } from '../ui/guide';
import { navigate, takeHandoff, useFocusTitle } from '../ui/router';
import { overviewReady, singleGoal } from '../core/overview';
import { EventOverview } from './EventOverview';
import { EventPage } from './EventPage';
import { Info } from './Info';
import { ShortStayBody } from './ShortStay';
import { isShortStay } from '../core/shortStay';
import { StayPermanentGuide } from '../ui/StayRenew';

/** 範囲外の案内（入口と、項目の直接の URL の両方）。理由・答えを変える道・入口にもどる道を出す。保存した進捗は消さない */
export function EventOutOfScope({ g }: { g: EventGuide }) {
  // 短期滞在の人（在留資格か住民登録の形で答えた）には、行き止まりの案内ではなく専用の画面（R-10）。答えを変える道はその画面にある
  if (isShortStay(g.answers)) return <ShortStayBody />;
  return (
    <>
      <Info id="out-of-scope" reason={g.event.scope_rule ? DATA().rules.get(g.event.scope_rule)?.reason_when_false : undefined} />
      <div className="links">
        {g.answers['Q-nationality'] === 'japanese' && g.event.questions.includes('Q-nationality')
          ? <button type="button" className="link" onClick={() => void g.answer('Q-nationality', 'foreign')}><Bi k="ev.changeNationality" /></button>
          : <button type="button" className="link" onClick={async () => { await g.startNew(); navigate('/e/' + g.event.id); }}><Bi k="ev.startNew" /></button>}
      </div>
    </>
  );
}

export function EventEntry({ eventId, view, onLive }: { eventId: string; view: 'now' | 'all' | 'step'; onLive: (s: string) => void }) {
  const g = useEvent(eventId);
  const phased = !!g?.event.phases?.length;
  const step = g ? nowStep(g.out, g.today, { urgentFirst: !phased }) : null;
  const idle = step?.kind === 'idle';
  const single = g && step && view === 'now' && !phased && g.out.scope !== 'F' ? singleGoal(g.out, step) : null;
  const tool = g && g.out.scope !== 'F' && idle && g.event.questions.length === 0 ? g.event.tool?.path : single ? '/e/' + g!.event.id + '/c/' + single.card.id : undefined;
  // 履歴を増やさずに置きかえる（もどるで /e/... に来て、また飛ばされることがないように）
  useEffect(() => { if (tool) { history.replaceState(null, '', tool); dispatchEvent(new PopStateEvent('popstate')); } }, [tool]);
  const ho = useHandoff(g);
  if (tool) return null;
  if (g && ho.redo) return <HandoffRedo g={g} q={ho.redo} onDone={ho.done} />;
  const line = g && ho.items.length > 0 ? <HandoffLine items={ho.items} onChange={ho.setRedo} /> : null;
  if (g && g.out.scope === 'F') return <>{line}<EventOutOfScope g={g} /></>;
  // 在留期間の更新の流れのあるできごと：永住者・特別永住者と答えたら、「いまはすることはありません」ではなく、在留カード・特別永住者証明書の更新の案内（HB-1）
  if (g && idle && g.answers['Q-zairyu-status'] === 'permanent' && g.out.cards.some((c) => c.card.flow === 'stay_renew')) return <>{line}<StayPermanentGuide title={g.event.title} /></>;
  // 段のあるできごと（v0.5.28）：1つずつ進める画面は任意。最初の質問に答えたら、いま／全体のどちらも全体の画面
  if (g && phased && view === 'step') return <>{line}<EventPage eventId={eventId} view="now" step onLive={onLive} /></>;
  if (g && overviewReady(g.event, g.answers)) return <>{line}<EventOverview g={g} onLive={onLive} /></>;
  // 案内だけのできごと（いまやることが無く、見せる項目がある）：いま／全体が同じになるので、一覧だけ
  const onlyGuides = !!g && idle && g.out.cards.some((c) => c.state === 'shown' || c.state === 'check_at_office');
  // すぐにやることの一覧（K-15）：最初の質問が済んだら、全体（チェックの一覧）を出す
  const checklist = !!g && view === 'now' && !!g.event.checklist && g.out.upfront.length === 0;
  return <>{line}<EventPage eventId={eventId} view={onlyGuides || checklist || view === 'all' ? 'all' : 'now'} onlyGuides={onlyGuides} onLive={onLive} /></>;
}

/** 前の画面で選んだ答え（住まいの入居・退去の「住所の届出」など）を受け取る（kaizen sumai 5）。
    まだ答えていない入口の質問だけに入れる。保存済みの答えは書き換えない。答えを変える画面も持つ */
function useHandoff(g: EventGuide | null) {
  const [items, setItems] = useState<HandoffItem[]>([]);
  const [redo, setRedo] = useState<Question | null>(null);
  const id = g?.event.id;
  useEffect(() => {
    if (!g) return;
    const given = takeHandoff('/e/' + g.event.id);
    if (!given) return;
    const plan = handoffPlan(g.event.questions, DATA().questions, g.answers, given);
    setItems(plan);
    void (async () => { for (const p of plan) if (p.kind === 'apply') await g.answer(p.q.id, p.value); })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 答えを変えたら、引き継いだことの1行は消す（本人が選んだ答えになる）
  const done = (changed: boolean) => { setRedo(null); if (changed) setItems([]); };
  return { items, redo, setRedo, done };
}

/** 引き継いだ答えの1行（6A.5 の1行と同じ形）。「答えを変える」で選び直せる */
function HandoffLine({ items, onChange }: { items: HandoffItem[]; onChange: (q: Question) => void }) {
  return (
    <>
      {items.map((it) => {
        const o = it.q.options.find((x) => x.value === it.value);
        return (
          <div key={it.q.id} className="k-change k-change--on">
            <p role="status" className="k-change__line"><span aria-hidden="true">✓ </span><Bi k={it.kind === 'kept' ? 'handoff.kept' : 'handoff.set'} /> {o && <Bi phrase t={o.label} />}</p>
            <div className="links k-change__acts"><button type="button" className="link" onClick={() => onChange(it.q)}><Bi k="res.changed.undo" /></button></div>
          </div>
        );
      })}
    </>
  );
}

/** 引き継いだ答えを選び直す画面（見出しは h1） */
function HandoffRedo({ g, q, onDone }: { g: EventGuide; q: Question; onDone: (changed: boolean) => void }) {
  useFocusTitle('handoff:' + g.event.id + ':' + q.id);
  return (
    <>
      <div className="head"><p className="eyebrow"><One t={g.event.title} /></p><h1 id="screen-title" tabIndex={-1}><Bi t={q.text} /></h1></div>
      <Answers q={q} onPick={async (v) => { await g.answer(q.id, v); onDone(true); }} />
      <WhyAsked t={q.why_asked} />
      <button type="button" className="link" onClick={() => onDone(false)}><Bi k="nav.backPrev" /></button>
    </>
  );
}
