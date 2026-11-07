/* カレンダーに追加（.ics。作者の指示 2026-11-05・11-06 A-1・A-2。SPEC 6.6）。
   1つのボタン（カレンダーの絵＋「カレンダーに追加」）。押すとシートが開き、区役所の選択と1行の説明、ファイルを作るボタンがある。
   日を決めた直後の1行（small：小さなリンクの形。SPEC 6A.5 v0.5.14）と、付き添いの結果の画面に出す。行く日が今日なら出さない（A-1）。
   日・行く所・手続き・持ち物を入れた予定のファイルを、この端末の中で作る（送らない）。区役所の住所は、選んだときだけ入れる（選んだ区は残さない）。 */
import { useState } from 'react';
import { bringList } from '../core/accompany';
import { buildIcs } from '../core/calendar';
import { HOURS } from '../core/calendarData';
import { DATA } from '../core/data';
import { nearest, PLACES } from '../core/places';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, plain, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { CalendarIcon } from './icons';
import { hoursLine } from './guide';
import { Sheet } from './Sheet';
import { getPosition } from './Location';

export function AddToCalendar({ day, place, cardIds, small }: { day: string; place?: string; cardIds: string[]; small?: boolean }) {
  const g = useGuide();
  const { level, location } = usePrefs();
  const [open, setOpen] = useState(false);
  const [office, setOffice] = useState('');
  if (day <= g.today) return null;
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
      h?.open ? L(hoursLine(h)) : '',
      'Kurashi',
    ].filter(Boolean).join('\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return buildIcs([{
      uid: `${day}-${place ?? 'visit'}@kurashi.eringo.io`, day,
      summary: (placeName ? placeName + '：' : '') + cards.map((c) => L(c.title)).join('、'),
      location: o ? plain(o.name.ja) + ' ' + o.address : placeName || undefined,
      description: desc,
    }], stamp);
  };

  return (
    <>
      {small
        ? <button type="button" className="link ics__open ics__open--small" onClick={() => setOpen(true)}><CalendarIcon /><Bi k="cal.ics" /></button>
        : <button type="button" className="k-answer ics__open" onClick={() => setOpen(true)}><CalendarIcon /><Bi phrase k="cal.ics" /></button>}
      {open && (
        <Sheet title={<One k="cal.ics" />} onClose={() => setOpen(false)}>
          <div className="ics">
            <p className="sub"><Bi k="cal.icsNote" /></p>
            {place === 'ward_office' && (
              <label className="qrfield">
                <span className="label"><One k="cal.icsWhere" /></span>
                <select className="field" value={office} onChange={(e) => setOffice(e.target.value)}>
                  <option value="">{L(ui('cal.icsNone'))}</option>
                  {PLACES().filter((p) => p.kind === 'ward_office').map((p) => <option key={p.id} value={p.id}>{L(p.name)}</option>)}
                </select>
              </label>
            )}
            {/* 位置を使う人だけ（A-6）：いちばん近い区役所を選ぶ。位置は残さない */}
            {place === 'ward_office' && location === 'on' && (
              <button type="button" className="link" onClick={async () => { const r = await getPosition(); if (typeof r !== 'string') setOffice(nearest(PLACES().filter((p) => p.kind === 'ward_office'), r)?.id ?? ''); }}><One k="cal.icsHere" /></button>
            )}
            <a className="k-answer k-answer--primary" href={'data:text/calendar;charset=utf-8,' + encodeURIComponent(make())} download={`kurashi-${day}.ics`} onClick={(e) => openOnIos(e, make())}><CalendarIcon /><Bi phrase k="cal.icsMake" /></a>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** iPhone・iPad：download の形だと「ファイル」に保存されるだけ。text/calendar のファイルをそのまま開くと「カレンダーに追加」が出る */
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function openOnIos(e: { preventDefault: () => void }, ics: string) {
  if (!isIos()) return;
  e.preventDefault();
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
