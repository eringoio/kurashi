/* 端末のカレンダーに入れる（.ics。作者の指示 2026-11-05。SPEC 6.6）。
   日・行く所・手続き・持ち物を入れた予定のファイルを、この端末の中で作る（送らない）。区役所の住所は、選んだときだけ入れる（選んだ区は残さない）。 */
import { useState } from 'react';
import { bringList } from '../core/accompany';
import { buildIcs } from '../core/calendar';
import { HOURS } from '../core/calendarData';
import { DATA } from '../core/data';
import { PLACES } from '../core/places';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, plain, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';

export function AddToCalendar({ day, place, cardIds }: { day: string; place?: string; cardIds: string[] }) {
  const g = useGuide();
  const { level } = usePrefs();
  const [office, setOffice] = useState('');
  const L = (t: Parameters<typeof line>[0]) => line(t, level);
  const cards = DATA().cards.filter((c) => cardIds.includes(c.id));
  const placeName = place ? L((ui(('place.' + place) as UiKey) ?? { ja: place })) : '';
  const origin = typeof g.answers['Q-origin'] === 'string' ? (g.answers['Q-origin'] as string) : undefined;
  const bring = place ? bringList(DATA().objects, place, g.objects, origin).filter((b) => b.held) : [];
  const o = PLACES().find((p) => p.id === office);
  const h = place ? HOURS()[place] : undefined;

  const make = () => {
    const desc = [
      ...cards.map((c) => '・' + L(c.title) + '（' + c.official_name.ja + '）'),
      bring.length ? L(ui('cal.icsBring')) + '：' + bring.map((b) => L(b.object.title)).join('、') : '',
      L(ui('cal.icsOther')),
      h?.open ? L(ui('cal.hours')).replace('{open}', h.open).replace('{close}', h.close ?? '') : '',
      'kurashi',
    ].filter(Boolean).join('\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return buildIcs([{
      uid: `${day}-${place ?? 'visit'}@kurashi.eringo.io`, day,
      summary: (placeName ? placeName + '：' : '') + cards.map((c) => L(c.title)).join('、'),
      location: o ? plain(o.name.ja) + ' ' + o.address : placeName || undefined,
      description: desc,
    }], stamp);
  };
  const href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(make());

  return (
    <section className="ics" aria-labelledby={'ics-' + day}>
      <h2 id={'ics-' + day} className="label"><One k="cal.ics" /></h2>
      {place === 'ward_office' && (
        <label className="qrfield">
          <span className="label"><One k="cal.icsWhere" /></span>
          <select className="field" value={office} onChange={(e) => setOffice(e.target.value)}>
            <option value="">{L(ui('cal.icsNone'))}</option>
            {PLACES().filter((p) => p.kind === 'ward_office').map((p) => <option key={p.id} value={p.id}>{L(p.name)}</option>)}
          </select>
        </label>
      )}
      <a className="k-answer" href={href} download={`kurashi-${day}.ics`}><Bi k="cal.ics" /></a>
      <p className="sub"><Bi k="cal.icsNote" /></p>
    </section>
  );
}
