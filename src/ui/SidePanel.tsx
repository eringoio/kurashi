/* 広い画面の右側：本文に出ていない項目（6A.4・K-36）。本文（いまの1つ・開いた項目）は左のまま、1画面に1つの判断を保つ。
   本文に出ている項目は右に出さない（同じ項目を2回見せない）。「このあと」と「済んだ」に分ける。
   生活イベント（/e/{id}）では、そのイベントの項目を出す。狭い画面では出さない（同じ内容を読み上げで2回聞かせないため）。 */
import { useEffect, useState } from 'react';
import type { CardView, EngineOutput } from '../core/engine';
import { nowStep } from '../core/now';
import { useEvent } from '../guide/useEvent';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { fmtDay, SECTION_ORDER, StateLabel, stateKey, type StateKey } from './guide';
import { Link } from './router';

const WIDE = '(min-width: 1024px)';

export function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE);
    const f = () => setWide(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return wide;
}

/** 右に出す画面か：いま（/now）・開いた項目（/c/*）・生活イベントのいまと項目（/e/{id}・/e/{id}/c/*）。全体（/all）には出さない */
function sideTarget(path: string): { eventId: string | null; cardId: string | null } | null {
  if (path === '/now') return { eventId: null, cardId: null };
  const c = /^\/c\/([a-z0-9-]+)$/.exec(path);
  if (c) return { eventId: null, cardId: c[1] };
  const e = /^\/e\/(E-[a-z0-9-]+)(?:\/c\/([a-z0-9-]+))?$/.exec(path);
  if (e) return { eventId: e[1], cardId: e[2] ?? null };
  return null;
}

/** 右の列を出すか（広い画面で、最初の道のりが済んでいるときだけ）。本文の側で「全体」へのタブを隠すのにも使う（.k-views--wide-hide） */
export function useSide(path: string): boolean {
  const wide = useWide();
  const g = useGuide();
  const t = sideTarget(path);
  const eg = useEvent(t?.eventId ?? '');
  if (!wide || !t) return false;
  if (!t.eventId) return g.objectsDone;
  // 生活イベント：開いた項目では、いつも（そのできごとの全体がわかる）。いまの画面では、入口の質問が済んでから
  return !!eg && (!!t.cardId || eg.out.upfront.length === 0);
}

const CLS: Record<StateKey, string> = { today: 'now', check: 'check', ask: 'ask', wait: 'wait', later: 'later', done: 'done', excluded: 'out', out: 'out' };

/** 本文に出ている項目：開いた項目、または「いま」の項目 */
function inBody(out: EngineOutput, today: string, cardId: string | null): Set<string> {
  if (cardId) return new Set([cardId]);
  const s = nowStep(out, today);
  if ('view' in s) return new Set([s.view.card.id]);
  if ('views' in s) return new Set(s.views.map((c) => c.card.id));
  return new Set();
}

function SideRow({ c, base }: { c: CardView; base: string }) {
  const { level } = usePrefs();
  const k = stateKey(c);
  return (
    <li>
      {/* 英語のときも1行（英語だけ）。くわしくは開いた項目で */}
      <Link to={base + c.card.id} className={'row row--compact row--' + CLS[k]}>
        <span className="row__name"><One phrase t={c.card.title} /></span>
        <span className="row__side">
          <StateLabel k={k} ob={c.card.obligation} />
          {c.plan?.planned_on && <span className="row__extra">{fmtDay(c.plan.planned_on, level)}</span>}
        </span>
      </Link>
    </li>
  );
}

export function SidePanel({ current }: { current: string }) {
  const g = useGuide();
  const t = sideTarget(current);
  const eg = useEvent(t?.eventId ?? '');
  if (!t) return null;
  const src = t.eventId ? eg : g;
  if (!src) return null;
  const base = t.eventId ? '/e/' + t.eventId + '/c/' : '/c/';
  const hide = inBody(src.out, src.today, t.cardId);
  // 全体の画面と同じ順（いま → 確かめる → 待つ → あとで）。関係なかったものは出さない（全体の画面で、理由と一緒に見られる）
  const rank = (c: CardView) => (c.state === 'ask' ? 1.5 : SECTION_ORDER.indexOf(c.section ?? 'later'));
  const cards = src.out.cards.filter((c) => c.state !== 'out_of_scope' && c.state !== 'excluded' && !hide.has(c.card.id));
  const rest = cards.filter((c) => c.section !== 'done').sort((a, b) => rank(a) - rank(b));
  const done = cards.filter((c) => c.section === 'done');
  return (
    <aside className="side" aria-labelledby="side-title">
      <h2 id="side-title"><Bi phrase k="side.rest" /></h2>
      <ul className="list" role="list">{rest.map((c) => <SideRow key={c.card.id} c={c} base={base} />)}</ul>
      {done.length > 0 && (
        <>
          <h2><Bi phrase k="sec.done" /></h2>
          <ul className="list" role="list">{done.map((c) => <SideRow key={c.card.id} c={c} base={base} />)}</ul>
        </>
      )}
    </aside>
  );
}
