/* 広い画面の右側：「全体」の一覧（6A.4）。本文（いまの1つ・開いた項目）は左のまま、1画面に1つの判断を保つ。
   狭い画面では出さない（同じ内容を読み上げで2回聞かせないため）。 */
import { useEffect, useState } from 'react';
import { useGuide } from '../guide/useGuide';
import { Bi } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { CardRow, fmtDay, SECTION_ORDER } from './guide';

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

export function SidePanel({ current }: { current: string }) {
  const g = useGuide();
  const { level } = usePrefs();
  // 全体の画面と同じ順（いま → 確かめる → 待つ → あとで → 済んだ）。関係なかったものは出さない（全体の画面で、理由と一緒に見られる）
  const rank = (c: (typeof g.out.cards)[number]) => (c.state === 'ask' ? 1.5 : SECTION_ORDER.indexOf(c.section ?? 'later'));
  const cards = g.out.cards.filter((c) => c.state !== 'out_of_scope' && c.state !== 'excluded').sort((a, b) => rank(a) - rank(b));
  return (
    <aside className="side" aria-labelledby="side-title">
      <h2 id="side-title"><Bi phrase k="side.title" /></h2>
      <ul className="list" role="list">
        {cards.map((c) => (
          <CardRow key={c.card.id} c={c} current={current === '/c/' + c.card.id} extra={c.plan?.planned_on ? fmtDay(c.plan.planned_on, level) : undefined} />
        ))}
      </ul>
    </aside>
  );
}
