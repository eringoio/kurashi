/* ごみの画面の住所と収集日（作者の決定 2026-11-06 F）。住所は区＋町名（丁目まで）。番地で曜日が分かれる町だけ番地を聞く（番地は保存しない）。
   収集日は VITE_GOMI_SCHEDULE=on で、data/private/gomi-schedule.json があるときだけ出す（許諾の返事まで既定は off）。 */
import { useState } from 'react';
import { nextCollection, type AreaStatus, type GomiCategory, type Schedule } from '../core/gomi';
import { privateSchedule, rowsOf, SCHEDULE_ON, toSchedules, townsOf } from '../core/gomiSchedule';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';
import { fmtDay } from './guide';

/** ごみの区分の絵（design/assets/illustrations/gomi-*.svg）。無い区分は bin */
const ICON: Record<string, string> = {
  kanen: 'gomi-kanen', funen: 'gomi-funen', plastic: 'gomi-plastic', kamipack: 'gomi-kamipack', kami: 'gomi-kami', petbottle: 'gomi-petbottle',
  bin: 'gomi-bin', kan: 'gomi-kan', sodai: 'gomi-bulky', hakka: 'gomi-hakka', denchi: 'gomi-hakka', kaden4: 'gomi-kaden', pc: 'gomi-not',
};
export const gomiIcon = (category: string) => art(ICON[category] ?? 'bin');

export interface Place { ward_id: string; town?: string; set_on: string }

/** 町名・番地から、収集日の表の地域（メモリの中だけ）。番地で分かれていて選んでいなければ null */
export function useArea(saved: Place | null) {
  const p = SCHEDULE_ON ? privateSchedule() : null;
  const [banchi, setBanchi] = useState<string>('');
  const rows = p && saved?.town ? rowsOf(p, saved.ward_id, saved.town) : [];
  const row = rows.length === 1 ? rows[0] : rows.find((r) => r.id === banchi) ?? null;
  const schedules: Schedule[] = p ? toSchedules(p) : [];
  const status: AreaStatus = !saved ? { kind: 'unset' } : !p ? { kind: 'ward_only' } : row ? { kind: 'ready', area_id: row.id } : { kind: 'ward_only' };
  return { p, rows, row, banchi, setBanchi, schedules, status };
}

export function GomiAreaFields({ wards, saved, onSet, area }: {
  wards: { id: string; label: Parameters<typeof line>[0] }[]; saved: Place | null; onSet: (x: Place | null) => void; area: ReturnType<typeof useArea>;
}) {
  const { level } = usePrefs();
  const towns = area.p && saved ? townsOf(area.p, saved.ward_id) : [];
  return (
    <div className="gomi-area">
      <label className="qrfield">
        <span className="label"><One k="gomi.area.ward" /></span>
        <select className="field" value={saved?.ward_id ?? ''} onChange={(e) => onSet(e.target.value ? { ward_id: e.target.value, set_on: new Date().toISOString().slice(0, 10) } : null)}>
          <option value="">{line(ui('gomi.area.choose'), level)}</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{line(w.label, level)}</option>)}
        </select>
      </label>
      {area.p && saved && (
        <label className="qrfield">
          <span className="label"><One k="gomi.area.town" /></span>
          <input className="field" list="gomi-towns" value={saved.town ?? ''} onChange={(e) => onSet({ ...saved, town: e.target.value || undefined })} autoComplete="off" />
          <datalist id="gomi-towns">{towns.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
      )}
      {area.rows.length > 1 && (
        <label className="qrfield">
          <span className="label"><One k="gomi.area.banchi" /></span>
          <select className="field" value={area.banchi} onChange={(e) => area.setBanchi(e.target.value)}>
            <option value="">{line(ui('gomi.area.choose'), level)}</option>
            {area.rows.map((r) => <option key={r.id} value={r.id}>{r.banchi ?? ''}</option>)}
          </select>
          <span className="sub"><One k="gomi.area.banchiNote" /></span>
        </label>
      )}
    </div>
  );
}

/** 収集日のカレンダー（今日から14日。その日に出せる区分の絵と名前）。要確認を付ける */
export function GomiWeek({ area, categories, today }: { area: ReturnType<typeof useArea>; categories: GomiCategory[]; today: string }) {
  const { level } = usePrefs();
  if (area.status.kind !== 'ready') return null;
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(today + 'T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10));
  const regular = categories.filter((c) => c.route === 'regular');
  const on = (cat: string, day: string) => { const n = nextCollection(area.schedules, area.status, cat, day, { allowUnapproved: true, horizonDays: 0 }); return n.kind === 'date' && n.date === day; };
  return (
    <section className="group" aria-labelledby="gomi-week">
      <h2 id="gomi-week"><Bi phrase k="gomi.week.title" /></h2>
      <ul className="gomi-week" role="list">
        {days.map((d) => {
          const cats = regular.filter((c) => on(c.id, d));
          return (
            <li key={d} className={cats.length ? '' : 'gomi-week__none'}>
              <span className="gomi-week__day">{fmtDay(d, level)}</span>
              <span className="gomi-week__cats">{cats.map((c) => <span key={c.id} className="gomi-week__cat"><img src={gomiIcon(c.id)} alt="" /><One t={c.label} /></span>)}</span>
            </li>
          );
        })}
      </ul>
      <p className="sub"><Bi k="gomi.week.note" /></p>
    </section>
  );
}
