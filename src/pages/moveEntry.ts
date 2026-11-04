/* 引っ越しの入口から、生活イベント（data/events.json）への行き先を決める小さな関数。
   イベントの名前では分岐しない：出発地は facts の origin、「住所が変わっていない」は menu と group で決める。
   本番（下書きなし）では、origin を持つイベントも、引っ越し以外のメニューも無いので、今までの入口と同じ動きになる。 */
import { DATA } from '../core/data';
import type { EventDef } from '../core/schema';

/** 出発地の答え（Q-origin の値）に対応する入口のイベント。無ければ今までの経路 */
export function eventForOrigin(origin: string): EventDef | undefined {
  return DATA().events.find((e) => e.status === 'built' && e.facts.some((f) => f.fact === 'origin' && f.value === origin));
}

/** 住所が変わっていなくても使える案内（入口のメニューにあって、引っ越しの出来事ではないもの） */
export function noChangeEvents(): EventDef[] {
  return DATA().events.filter((e) => e.status === 'built' && e.menu !== undefined && e.group !== 'move').sort((a, b) => a.menu! - b.menu!);
}

/** 「わからない」の説明の画面を出すか：行き先になる案内が1つでもあるとき */
export function hasEntryExtras(): boolean {
  return noChangeEvents().length > 0 || DATA().events.some((e) => e.status === 'built' && e.facts.some((f) => f.fact === 'origin'));
}
