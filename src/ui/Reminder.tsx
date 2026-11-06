/* カードのリマインダー（作者の指示 2026-11-06 C。例：銀行の「居住者への変更」は来日6か月後）。
   住み始めた日を入れると、months か月後の日を出し、カレンダーに追加できる。日は端末の中だけ（保存は同意のあと。dates の arrived_on）。URL に入れない */
import type { Card } from '../core/schema';
import { addMonths } from '../core/date';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { AddToCalendar } from './AddToCalendar';
import { fill, fillDate } from './guide';
import { useState } from 'react';

export function Reminder({ card }: { card: Card }) {
  const g = useGuide();
  const { vault } = usePrefs();
  const r = card.reminder;
  const [from, setFrom] = useState<string>(() => vault.get<string>('dates', 'arrived_on') ?? '');
  if (!r) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(from) ? addMonths(from, r.months) : null;
  return (
    <section className="k-notice reminder" aria-labelledby={'rem-' + card.id}>
      <h2 id={'rem-' + card.id} className="label"><One phrase k="rem.title" /></h2>
      <label className="qrfield">
        <span className="label"><One k="rem.from.arrival" /></span>
        <input className="field" type="date" value={from} max={g.today} onChange={(e) => { setFrom(e.target.value); if (e.target.value) void vault.put('dates', 'arrived_on', e.target.value); }} />
      </label>
      {day && (day > g.today
        ? <><p><Bi t={fill(fillDate(ui('rem.day'), day), 'months', () => String(r.months))} /></p><AddToCalendar day={day} place={card.place} cardIds={[card.id]} /></>
        : <p><Bi t={fill(ui('rem.past'), 'months', () => String(r.months))} /></p>)}
    </section>
  );
}
