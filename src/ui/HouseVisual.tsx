/* 住まい探しの見て分かる形（作者の指示 2026-11-06 E）。物件サイトのように、間取り図と費用の図。
   間取り図：1K の例。部屋に番号を付け、下の一覧で番号と言葉（玄関・K・UB・洋室・CL・バルコニー）を対応させる（色だけにしない）。
   費用の図：家賃1か月を基準にした「か月分」の横の棒（1色）。数は例で、目安（要確認）。 */
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';

const ROOMS: { n: number; k: UiKey; x: number; y: number; w: number; h: number; fill: string }[] = [
  { n: 6, k: 'house.room.balcony', x: 10, y: 6, w: 180, h: 22, fill: '#ffffff' },
  { n: 4, k: 'house.room.yoshitsu', x: 10, y: 28, w: 180, h: 120, fill: '#FAD9B0' },
  { n: 5, k: 'house.room.cl', x: 140, y: 148, w: 50, h: 42, fill: '#E3C08F' },
  { n: 2, k: 'house.room.k', x: 10, y: 148, w: 130, h: 64, fill: '#BFE0C9' },
  { n: 3, k: 'house.room.ub', x: 110, y: 212, w: 80, h: 62, fill: '#CFE1F7' },
  { n: 1, k: 'house.room.genkan', x: 10, y: 212, w: 100, h: 62, fill: '#ffffff' },
];

export function FloorPlan() {
  const { level } = usePrefs();
  const sorted = [...ROOMS].sort((a, b) => a.n - b.n);
  return (
    <section className="group house-visual" aria-labelledby="house-plan">
      <h2 id="house-plan"><Bi k="house.plan.title" /></h2>
      <div className="house-plan">
        <svg viewBox="0 0 200 284" role="img" aria-label={line(ui('house.plan.alt'), level)}>
          {ROOMS.map((r) => (
            <g key={r.n}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} stroke="#2A2A2E" strokeWidth="2.4" strokeDasharray={r.n === 6 ? '5 4' : undefined} />
              <circle cx={r.x + 18} cy={r.y + 16} r="11" fill="#ffffff" stroke="#2A2A2E" strokeWidth="2" />
              <text x={r.x + 18} y={r.y + 21} textAnchor="middle" fontSize="13" fontWeight="700" fill="#22201c" aria-hidden="true">{r.n}</text>
            </g>
          ))}
          {/* 玄関の扉 */}
          <path d="M40 274 A24 24 0 0 1 64 250" fill="none" stroke="#2A2A2E" strokeWidth="2" />
        </svg>
        <ol className="house-legend">
          {sorted.map((r) => <li key={r.n}><span className="house-num" aria-hidden="true">{r.n}</span><Bi k={r.k} /></li>)}
        </ol>
      </div>
      <h3 className="label"><One k="house.read.title" /></h3>
      <ul className="plainlist house-read">
        {(['house.read.types', 'house.read.jo', 'house.read.area', 'house.read.age'] as UiKey[]).map((k) => <li key={k}><Bi k={k} /></li>)}
      </ul>
    </section>
  );
}

/** 費用：家賃1か月を基準にした例（か月分）。目安・要確認 */
const COSTS: { k: UiKey; months: number; note?: UiKey }[] = [
  { k: 'house.cost.rent', months: 1 },
  { k: 'house.cost.shikikin', months: 2, note: 'house.cost.back' },
  { k: 'house.cost.reikin', months: 1, note: 'house.cost.noBack' },
  { k: 'house.cost.chukai', months: 1, note: 'house.cost.max' },
  { k: 'house.cost.hosho', months: 0.5, note: 'house.cost.varies' },
  { k: 'house.cost.hoken', months: 0.3, note: 'house.cost.varies' },
];

export function CostChart() {
  const total = COSTS.reduce((a, c) => a + c.months, 0);
  const max = Math.max(...COSTS.map((c) => c.months));
  return (
    <section className="group house-visual" aria-labelledby="house-cost">
      <h2 id="house-cost"><Bi k="house.cost.title" /></h2>
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
      <p className="house-costs__total"><One k="house.cost.total" />：{Math.round(total * 10) / 10}<One k="house.cost.unit" /></p>
      <p className="sub"><Bi k="house.cost.note" /></p>
    </section>
  );
}
