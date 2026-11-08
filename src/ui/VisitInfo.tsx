/* 「いま」の補助欄：行く所・持ち物・行く日（小さく。次の1つの説明は消さない。Agent F）。
   行く所の解決は visitPlace（アダプタ。resolveOffice に差し替える）。区が分からない区役所は決めつけず、区を選んでもらう
   （選んだ区はこの画面の中だけ。保存しない・URL に入れない）。現在地から最寄りを選ばない。
   持ち物：bringPlan（まだの項目で使う物だけ）。持っているか（入口で答えた物）は、聞いたときだけ札で出す。 */
import { useState } from 'react';
import { bringPlan } from '../core/accompany';
import { DATA } from '../core/data';
import type { CardView } from '../core/engine';
import { PLACES } from '../core/places';
import { homeWardFrom } from '../core/office';
import { visitPlace, type OfficeResolution } from '../core/visitPlace';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, plain, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { fmtDay } from './guide';

/** 解決の結果の見た目だけ（名前・住所・地図、または「区を選ぶ」「要確認」） */
export function PlaceResolution({ r }: { r: OfficeResolution }) {
  if (r.status === 'resolved') {
    return (
      <div className="visitinfo__place">
        <p><strong><One t={r.place.name} /></strong></p>
        <p lang="ja" className="placeinfo__addr">{r.place.address}</p>
        <div className="links">
          <a className="link" href={r.maps.google} target="_blank" rel="noopener noreferrer"><Bi k="here.mapGoogle" /><span aria-hidden="true"> ↗</span><span className="sr-only"><One k="here.newTab" /></span></a>
          <a className="link" href={r.maps.apple} target="_blank" rel="noopener noreferrer"><Bi k="here.mapApple" /><span aria-hidden="true"> ↗</span><span className="sr-only"><One k="here.newTab" /></span></a>
        </div>
      </div>
    );
  }
  if (r.status === 'need_residential_ward') return null;
  return <p className="sub"><Bi k={r.status === 'needs_check' ? (r.reason.startsWith('unknown_ward') ? 'now.visit.check' : 'office.check') : 'now.visit.noAddr'} /></p>;
}

/** place：カードの place。cards：その所で使う項目（日が決まっていれば行く日も出す） */
export function VisitInfo({ place, cards }: { place: string; cards: CardView[] }) {
  const g = useGuide();
  // 初期値は本人が保存した自宅の区（ごみの画面で本人が選んだときだけ保存される。GPS からは入らない）。引っ越しでは古い区のこともあるので、いつでも選び直せる（ここでは保存しない）
  const { level, vault } = usePrefs();
  const [ward, setWard] = useState<string | null>(() => homeWardFrom(vault));
  const origin = typeof g.answers['Q-origin'] === 'string' ? (g.answers['Q-origin'] as string) : undefined;
  const known = origin !== undefined;
  const ids = new Set(cards.map((c) => c.card.id));
  const bring = bringPlan(g.out, DATA().objects, g.objects, origin).find((p) => p.place === place)?.bring
    .filter((b) => !b.object.bring_for || b.object.bring_for.some((id) => ids.has(id))) ?? [];
  const days = [...new Set(cards.map((c) => c.plan?.planned_on).filter((d): d is string => !!d))].sort();
  const name = (ui(('placeTitle.' + place) as UiKey) ?? ui(('place.' + place) as UiKey)) as Parameters<typeof One>[0]['t'];
  return (
    <section className="visitinfo sub" aria-labelledby={'vi-' + place}>
      <h2 id={'vi-' + place} className="label"><One k="now.visit.title" />{name ? <> ・ <One t={name} /></> : null}</h2>
      {days.length > 0 && <p><span className="label"><One k="cal.tag.planned" /></span>：{days.map((d) => fmtDay(d, level)).join('、')}</p>}
      {place === 'ward_office' && (
        <label className="qrfield">
          <span className="sub"><Bi k="now.visit.ward" /></span>
          <span className="label"><One k="now.visit.wardPick" /></span>
          <select className="field" value={ward ?? ''} onChange={(e) => setWard(e.target.value || null)}>
            <option value="">{line(ui('now.visit.wardNone'), level)}</option>
            {PLACES().filter((p) => p.kind === 'ward_office').map((p) => <option key={p.ward} value={p.ward}>{plain(p.name.ja)}</option>)}
          </select>
        </label>
      )}
      <PlaceResolution r={visitPlace({ place, homeWard: ward })} />
      {bring.length > 0 && (
        <p className="visitinfo__bring"><span className="label"><One k="cal.icsBring" /></span>：{bring.map((b, i) => (
          <span key={b.object.id}>{i > 0 && '、'}<One t={b.object.title} />{known && <span className="road__tag"> <span aria-hidden="true">{b.held ? '✓' : '−'}</span> <One k={b.held ? 'road.bring.held' : 'road.bring.missing'} /></span>}</span>
        ))}</p>
      )}
    </section>
  );
}
