/* 住まい探しの見て分かる形（作者の指示 2026-11-06 E、11/7 B-8a・B-8c）。物件サイトのように、間取り図と費用の図。
   間取り図：SVG の絵5枚（design/assets/illustrations/plan-*.svg）。部屋の番号と言葉の対応は plans.json（絵と同じ所）。
   1K を最初に出し、横並びのボタンで切り替える。寸法の文字は入れない。言葉は下の一覧（色だけにしない）。
   費用の図：家賃1か月を基準にした「か月分」の横の棒（1色）。数は例で、目安（要確認）。
   用語は「絵｜言葉｜一文」の表（段落にしない）。 */
import { useState } from 'react';
import plansJson from '../../design/assets/illustrations/plans.json';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';

type RoomId = 'genkan' | 'k' | 'dk' | 'ldk' | 'ub' | 'toilet' | 'yoshitsu' | 'washitsu' | 'cl' | 'ps' | 'balcony';
const ROOM_KEY: Record<RoomId, UiKey> = {
  genkan: 'house.room.genkan', k: 'house.room.k', dk: 'house.room.dk', ldk: 'house.room.ldk', ub: 'house.room.ub', toilet: 'house.room.toilet',
  yoshitsu: 'house.room.yoshitsu', washitsu: 'house.room.washitsu', cl: 'house.room.cl', ps: 'house.room.ps', balcony: 'house.room.balcony',
};
/** 間取りの名前（1R・1K など）は不動産の記号なので、どの表示レベルでもこのまま */
const PLANS = [
  { id: 'plan-1r', name: '1R' },
  { id: 'plan-1k', name: '1K' },
  { id: 'plan-1dk', name: '1DK' },
  { id: 'plan-1ldk', name: '1LDK' },
  { id: 'plan-2dk', name: '2DK' },
] as const;
type PlanId = (typeof PLANS)[number]['id'];
const ROOMS = plansJson as Record<PlanId, { n: number; room: RoomId }[]>;

/** 絵｜言葉｜一文 の表 */
function Terms({ rows }: { rows: { icon: string; word: UiKey; desc: UiKey }[] }) {
  return (
    <ul className="house-terms" role="list">
      {rows.map((r) => (
        <li key={r.word}>
          <img src={art(r.icon)} alt="" />
          <span className="house-terms__word"><Bi k={r.word} /></span>
          <span className="house-terms__desc"><Bi k={r.desc} /></span>
        </li>
      ))}
    </ul>
  );
}

export function FloorPlan() {
  const { level } = usePrefs();
  const [sel, setSel] = useState<PlanId>('plan-1k');
  const plan = PLANS.find((p) => p.id === sel)!;
  const rooms = [...ROOMS[sel]].sort((a, b) => a.n - b.n);
  return (
    <section className="group house-visual" aria-labelledby="house-plan">
      <h2 id="house-plan"><Bi phrase k="house.plan.title" /></h2>
      <div className="house-plans" role="group" aria-label={line(ui('house.plan.pick'), level)}>
        {PLANS.map((p) => (
          <button key={p.id} type="button" className="k-answer house-plans__btn" aria-pressed={p.id === sel} onClick={() => setSel(p.id)} lang="en">{p.name}</button>
        ))}
      </div>
      <p className="sub"><Bi k="house.read.types" /></p>
      <div className="house-plan">
        <img className="house-plan__img" src={art(sel)} alt={plan.name + '：' + line(ui('house.plan.alt'), level)} />
        <ol className="house-legend">
          {rooms.map((r) => <li key={r.n}><span className={'house-num' + (r.room === 'balcony' ? ' house-num--out' : '')} aria-hidden="true">{r.n}</span><Bi k={ROOM_KEY[r.room]} /></li>)}
        </ol>
      </div>
      <Terms rows={[
        { icon: 'plan-1r', word: 'house.term.jo', desc: 'house.term.jo.d' },
        { icon: 'plan-1k', word: 'house.term.area', desc: 'house.term.area.d' },
        { icon: 'calendar', word: 'house.term.age', desc: 'house.term.age.d' },
      ]} />
    </section>
  );
}

/** 費用：家賃1か月を基準にした例（か月分）。目安・要確認 */
const COSTS: { k: UiKey; months: number; note?: UiKey }[] = [
  { k: 'house.cost.rent', months: 1 },
  { k: 'house.cost.shikikin', months: 2 },
  { k: 'house.cost.reikin', months: 1 },
  { k: 'house.cost.chukai', months: 1 },
  { k: 'house.cost.hosho', months: 0.5, note: 'house.cost.varies' },
  { k: 'house.cost.hoken', months: 0.3, note: 'house.cost.varies' },
];

export function CostChart() {
  const max = Math.max(...COSTS.map((c) => c.months));
  return (
    <section className="group house-visual" aria-labelledby="house-cost">
      <h2 id="house-cost"><Bi phrase k="house.cost.title" /></h2>
      <p className="sub"><Bi k="house.cost.sub" /></p>
      <ul className="house-costs" role="list">
        {COSTS.map((c) => (
          <li key={c.k}>
            <span className="house-costs__name"><Bi k={c.k} />{c.note && <span className="sub"><One k={c.note} /></span>}</span>
            <span className="house-costs__bar" aria-hidden="true"><span style={{ width: (c.months / max) * 100 + '%' }} /></span>
            <span className="house-costs__n">{c.months}<One k="house.cost.unit" /></span>
          </li>
        ))}
      </ul>
      {/* 保証人（B-8c）：連帯保証人か保証会社のどちらか */}
      <p className="sub"><Bi k="house.cost.guarantor" /></p>
      <p className="sub"><Bi k="house.cost.note" /></p>
      <h3 className="label"><One k="house.terms.title" /></h3>
      <Terms rows={[
        { icon: 'coins', word: 'house.cost.shikikin', desc: 'house.term.shikikin' },
        { icon: 'key', word: 'house.cost.reikin', desc: 'house.term.reikin' },
        { icon: 'doc', word: 'house.cost.chukai', desc: 'house.term.chukai' },
        { icon: 'hall', word: 'house.term.hoshogaisha', desc: 'house.term.hoshogaisha.d' },
        { icon: 'you', word: 'house.term.rentai', desc: 'house.term.rentai.d' },
      ]} />
    </section>
  );
}
