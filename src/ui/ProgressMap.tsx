/* 全体の絵（SPEC 6A.4 v0.5.31）：道（RoadMap）。前の形の輪（WorldMap）は残す。
   - 本番のビルド：道。VITE_ROAD=off のときだけ輪
   - 開発（npm run dev）：画面の上の「輪／道」で切り替えて比べられる（sessionStorage の kurashi:road。開発のときだけ読む）
   after(road)：絵の下に出すもの。道のときは持ち物と閉じた一覧、輪のときは前と同じ一覧 */
import { useState, type ReactNode } from 'react';
import type { CardView, EngineOutput } from '../core/engine';
import { Bi, One } from '../i18n/Ruby';
import { WorldMap } from './guide';
import { RoadFor } from './RoadMap';

const ROAD_DEFAULT = import.meta.env.VITE_ROAD !== 'off';
const DEV = import.meta.env.DEV;
const KEY = 'kurashi:road';

function initial(): boolean {
  if (DEV) {
    try { const v = sessionStorage.getItem(KEY); if (v) return v === 'on'; } catch { /* 読めないときは既定 */ }
  }
  return ROAD_DEFAULT;
}

export function ProgressMap({ cards, out, today, base = '/c/', listId, after }: {
  cards: CardView[]; out: EngineOutput; today: string; base?: string; listId?: string; after?: (road: boolean) => ReactNode;
}) {
  const [road, setRoad] = useState(initial);
  const pick = (on: boolean) => {
    setRoad(on);
    try { sessionStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 保存できなくても切り替える */ }
  };
  return (
    <>
      {DEV && (
        <div className="links dev-view" role="group" aria-labelledby="dev-view-label">
          <span className="sub" id="dev-view-label"><One k="dev.view.label" /></span>
          <button type="button" className="seg" aria-pressed={!road} onClick={() => pick(false)}><Bi k="dev.view.ring" /></button>
          <button type="button" className="seg" aria-pressed={road} onClick={() => pick(true)}><Bi k="dev.view.road" /></button>
        </div>
      )}
      {road
        ? <RoadFor cards={cards} out={out} today={today} base={base} listId={listId} />
        : <WorldMap cards={cards} base={base} listId={listId} />}
      {after?.(road)}
    </>
  );
}
