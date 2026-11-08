/* ごみの画面の住所と収集日（作者の決定 2026-11-06 F）。住所は区＋町名（丁目まで）。番地で曜日が分かれる町だけ番地を聞く（番地の文字は保存しない。保存するのは表の行の area_id だけ）。
   収集日は data/gomi/schedule.json（名古屋市の掲載の許可 2026-11-08）。既定で出す。VITE_GOMI_SCHEDULE=off のときだけ出さない（SPEC v0.5.24）。 */
import { useEffect, useId, useState } from 'react';
import { nextCollection, type AreaStatus, type GomiCategory, type Schedule } from '../core/gomi';
import { areaRow, banchiOf, loadSchedule, romajiOf, rowsOf, scheduleNow, toSchedules, townsOf, type PrivateSchedule } from '../core/gomiSchedule';
import { nearest, PLACES } from '../core/places';
import { getPosition } from './Location';
import { Bi, One } from '../i18n/Ruby';
import { line } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';
import { PinIcon } from './icons';
import { fmtDay } from './guide';

/** ごみの区分の絵（design/assets/illustrations/gomi-*.svg）。無い区分は bin */
const ICON: Record<string, string> = {
  kanen: 'gomi-kanen', funen: 'gomi-funen', plastic: 'gomi-plastic', kamipack: 'gomi-kamipack', kami: 'gomi-kami', petbottle: 'gomi-petbottle',
  bin: 'gomi-bin', kan: 'gomi-kan', sodai: 'gomi-bulky', hakka: 'gomi-hakka', denchi: 'gomi-hakka', kaden4: 'gomi-kaden', pc: 'gomi-not',
};
export const gomiIcon = (category: string) => art(ICON[category] ?? 'bin');
/** 袋の絵（bag-*.svg） */
export const bagIcon = (bag: string) => art('bag-' + bag);

/** 現在地からいちばん近い区役所の区（端末の中だけ。送らない・残さない）。分からなければ null */
export async function wardHere(wards: { id: string }[]): Promise<string | null> {
  const r = await getPosition();
  if (typeof r === 'string') return null;
  const w = nearest(PLACES().filter((x) => x.kind === 'ward_office'), r)?.ward;
  return w && wards.some((x) => x.id === w) ? w : null;
}

export interface Place { ward_id: string; town?: string; area_id?: string | null; set_on: string }

/** 町名・番地から、収集日の表の地域。番地で分かれていて選んでいなければ null。画面でまだ選んでいなければ、保存した area_id から戻す（K-21） */
export function useArea(saved: Place | null) {
  const [p, setP] = useState<PrivateSchedule | null>(() => scheduleNow() ?? null);
  useEffect(() => { let live = true; void loadSchedule().then((x) => { if (live) setP(x); }); return () => { live = false; }; }, []);
  const [picked, setBanchi] = useState<string | null>(null);
  const banchi = banchiOf(picked, saved?.area_id);
  const rows = p && saved?.town ? rowsOf(p, saved.ward_id, saved.town) : [];
  const row = areaRow(p, saved?.ward_id, saved?.town, banchi);
  const schedules: Schedule[] = p ? toSchedules(p) : [];
  const status: AreaStatus = !saved ? { kind: 'unset' } : !p ? { kind: 'ward_only' } : row ? { kind: 'ready', area_id: row.id } : { kind: 'ward_only' };
  return { p, rows, row, banchi, setBanchi, schedules, status };
}

/** 自宅の住所（区・町名・番地）。ごみの日を決めるために要る欄は、空のあいだ赤い枠と「入れてください」を出す（色だけにしない）。
    区は現在地から入れられるが、町名・番地は本人が入れる（fromHere のとき、その旨を1行） */
export function GomiAreaFields({ wards, saved, onSet, area, fromHere = false }: {
  wards: { id: string; label: Parameters<typeof line>[0] }[]; saved: Place | null; onSet: (x: Place | null) => void; area: ReturnType<typeof useArea>; fromHere?: boolean;
}) {
  const { level } = usePrefs();
  const id = useId();
  const towns = area.p && saved ? townsOf(area.p, saved.ward_id) : [];
  // K-19：外国語のときだけ、ローマ字（日本語）を添える
  const rom = (t: string) => (level.kind === 'foreign' && area.p && saved ? romajiOf(area.p, saved.ward_id, t) : undefined);
  const savedRom = saved?.town ? rom(saved.town) : undefined;
  // 番地：外国語のときは訳（data/gomi/banchi-names.json）。無ければ日本語のまま
  const banchiLabel = (b: string | null) => (b ? (level.kind === 'foreign' ? area.p?.banchi_en?.[b] ?? b : b) : '');
  const wardMissing = !saved;
  const townMissing = !!area.p && !!saved && !saved.town;
  const townUnknown = !!area.p && !!saved?.town && towns.length > 0 && !towns.includes(saved.town);
  const banchiMissing = area.rows.length > 1 && !area.banchi;
  const Need = ({ k, at }: { k: 'gomi.area.need' | 'gomi.area.pickTown'; at: string }) => <span id={at} className="gomi-need"><One k={k} /></span>;
  return (
    <div className="gomi-area">
      <label className={'qrfield' + (wardMissing ? ' is-missing' : '')}>
        <span className="label"><One k="gomi.area.ward" /></span>
        <select className="field" value={saved?.ward_id ?? ''} aria-invalid={wardMissing || undefined} aria-describedby={wardMissing ? id + 'w' : undefined} onChange={(e) => onSet(e.target.value ? { ward_id: e.target.value, set_on: new Date().toISOString().slice(0, 10) } : null)}>
          <option value="">—</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{line(w.label, level)}</option>)}
        </select>
        {wardMissing && <Need k="gomi.area.need" at={id + 'w'} />}
      </label>
      {/* 現在地から区を選ぶ（押したときだけ位置を使う。残さない。SPEC 6A.11）。いちばん近い区役所の区 */}
      <button type="button" className="link link--icon" onClick={async () => {
        const w = await wardHere(wards);
        if (w) onSet({ ward_id: w, set_on: new Date().toISOString().slice(0, 10) });
      }}><PinIcon /><One k="cal.icsHere" /></button>
      {fromHere && saved && (townMissing || banchiMissing) && <p className="sub" role="note"><Bi k="gomi.area.fromHere" /></p>}
      {area.p && saved && (
        <label className={'qrfield' + (townMissing || townUnknown ? ' is-missing' : '')}>
          <span className="label"><One k="gomi.area.town" /></span>
          <input className="field" list="gomi-towns" value={saved.town ?? ''} aria-invalid={townMissing || townUnknown || undefined} aria-describedby={townMissing || townUnknown ? id + 't' : undefined} onChange={(e) => onSet({ ...saved, town: e.target.value || undefined, area_id: null })} autoComplete="off" />
          <datalist id="gomi-towns">{towns.map((t) => { const r = rom(t); return <option key={t} value={t} label={r ? `${r}（${t}）` : undefined} />; })}</datalist>
          {savedRom && <span className="sub" lang="en">{savedRom}（{saved!.town}）</span>}
          {townMissing && <Need k="gomi.area.need" at={id + 't'} />}
          {townUnknown && <Need k="gomi.area.pickTown" at={id + 't'} />}
        </label>
      )}
      {area.rows.length > 1 && (
        <label className={'qrfield' + (banchiMissing ? ' is-missing' : '')}>
          <span className="label"><One k="gomi.area.banchi" /></span>
          <select className="field" value={area.banchi} aria-invalid={banchiMissing || undefined} aria-describedby={id + 'b'} onChange={(e) => { area.setBanchi(e.target.value); onSet({ ...saved!, area_id: e.target.value || null }); }}>
            <option value="">—</option>
            {area.rows.map((r) => <option key={r.id} value={r.id}>{banchiLabel(r.banchi)}</option>)}
          </select>
          <span id={id + 'b'} className="sub">{banchiMissing && <><Need k="gomi.area.need" at={id + 'bn'} /> </>}<One k="gomi.area.banchiNote" /></span>
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
