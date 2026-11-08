/* ごみの画面の住所と収集日（作者の決定 2026-11-06 F）。住所は区＋町名（丁目まで）。番地で曜日が分かれる町だけ番地を聞く（番地の文字は保存しない。保存するのは表の行の area_id だけ）。
   収集日は data/gomi/schedule.json（名古屋市の掲載の許可 2026-11-08）。既定で出す。VITE_GOMI_SCHEDULE=off のときだけ出さない（SPEC v0.5.24）。 */
import { useEffect, useId, useRef, useState } from 'react';
import { nextCollection, type AreaStatus, type GomiCategory, type Schedule } from '../core/gomi';
import { areaRow, banchiOf, loadSchedule, romajiOf, rowsOf, scheduleNow, searchTowns, toSchedules, townsOf, type PrivateSchedule } from '../core/gomiSchedule';
import { nearest, PLACES } from '../core/places';
import { getPosition } from './Location';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';
import { PinIcon } from './icons';
import { fmtDay } from './guide';
import '../styles/gomi-town-picker.css';

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
    現在地は区の「提案」にだけ使い、本人が押して確かめるまで決めない。町名は検索欄＋一覧（TownPicker）、番地は本人が選ぶ */
export function GomiAreaFields({ wards, saved, onSet, area, autoSuggest = false }: {
  wards: { id: string; label: Parameters<typeof line>[0] }[]; saved: Place | null; onSet: (x: Place | null) => void; area: ReturnType<typeof useArea>; autoSuggest?: boolean;
}) {
  const { level } = usePrefs();
  const id = useId();
  const towns = area.p && saved ? townsOf(area.p, saved.ward_id) : [];
  // 現在地から区を入れる（作者 11/8：提案ではなく、前のように入れる）。入れたら「現在地から入れました。家にいないときは選び直して」の1行
  const [fromHere, setFromHere] = useState(false);
  const fillHere = async () => { const w = await wardHere(wards); if (w) { area.setBanchi(null); setFromHere(true); onSet({ ward_id: w, set_on: new Date().toISOString().slice(0, 10) }); } };
  const asked = useRef(false);
  useEffect(() => {
    if (!autoSuggest || saved || asked.current) return;
    asked.current = true;
    void fillHere();
  }, [autoSuggest, saved]);
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
        <select className="field" value={saved?.ward_id ?? ''} aria-invalid={wardMissing || undefined} aria-describedby={wardMissing ? id + 'w' : undefined} onChange={(e) => { area.setBanchi(null); setFromHere(false); onSet(e.target.value ? { ward_id: e.target.value, set_on: new Date().toISOString().slice(0, 10) } : null); }}>
          <option value="">—</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{line(w.label, level)}</option>)}
        </select>
        {wardMissing && <Need k="gomi.area.need" at={id + 'w'} />}
      </label>
      {/* 現在地から区を入れる（押したときだけ位置を使う。位置は残さない。SPEC 6A.11） */}
      <button type="button" className="link link--icon" onClick={() => void fillHere()}><PinIcon /><One k="cal.icsHere" /></button>
      {fromHere && saved && <p className="sub" role="status"><Bi k="gomi.area.fromHere" /></p>}
      {area.p && saved && (
        <TownPicker key={saved.ward_id} p={area.p} ward={saved.ward_id} town={saved.town} missing={townMissing} unknown={townUnknown} needId={id + 't'} onPick={(t) => { area.setBanchi(null); onSet({ ...saved, town: t, area_id: null }); }} />
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

/** 町名ピッカー：検索欄＋スクロールできる一覧（datalist は使わない）。入力中の文字はこの部品の中だけ（保存しない）。選んだ時点で正式な日本語の町名を onPick に渡す。
    検索は日本語の町名と、写しに付いたローマ字（searchTowns）。外国語のときは「ローマ字（日本語）」を画面に描く */
function TownPicker({ p, ward, town, missing, unknown, needId, onPick }: { p: PrivateSchedule; ward: string; town: string | undefined; missing: boolean; unknown: boolean; needId: string; onPick: (t: string) => void }) {
  const { level } = usePrefs();
  const id = useId();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const changeBtn = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => { if (wasEditing.current && !editing) changeBtn.current?.focus(); wasEditing.current = editing; }, [editing]);
  const rom = (t: string) => (level.kind === 'foreign' ? romajiOf(p, ward, t) : undefined);
  const found = searchTowns(p, ward, q);
  const confirmed = !!town && !unknown && !editing;
  const pick = (t: string) => { setQ(''); setEditing(false); onPick(t); };
  const name = (t: string) => { const r = rom(t); return r ? <><span lang="en">{r}</span>（{t}）</> : <>{t}</>; };
  if (confirmed) {
    return (
      <div className="qrfield">
        <span className="label"><One k="gomi.area.town" /></span>
        <div className="town-picker__done">
          <strong>{name(town!)}</strong>
          <button ref={changeBtn} type="button" className="link" onClick={() => setEditing(true)}><One k="gomi.town.change" /></button>
        </div>
      </div>
    );
  }
  const listId = id + 'l';
  return (
    <div className={'qrfield town-picker' + ((missing || unknown) && !editing ? ' is-missing' : '')}>
      <label htmlFor={id} className="label"><One k="gomi.area.town" /></label>
      <input id={id} className="field" type="search" value={q} placeholder={line(ui('gomi.town.placeholder'), level)} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" aria-controls={listId}
        aria-invalid={((missing || unknown) && !editing) || undefined} aria-describedby={id + 'h' + (((missing || unknown) && !editing) ? ' ' + needId : '')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (found.length === 1) pick(found[0]); }
          if (e.key === 'ArrowDown') { e.preventDefault(); (document.getElementById(listId)?.querySelector('button') as HTMLElement | null)?.focus(); }
        }} />
      <p id={id + 'h'} className="sr-only"><One k="gomi.town.hint" /></p>
      <p className="sr-only" role="status">{found.length ? <>{found.length}<One k="gomi.town.countUnit" /></> : <One k="gomi.town.none" />}</p>
      {found.length > 0 && (
        <ul id={listId} className="town-picker__list" role="list" aria-label={line(ui('gomi.area.town'), level)}>
          {found.map((t) => <li key={t}><button type="button" className="town-picker__opt" onClick={() => pick(t)}>{name(t)}</button></li>)}
        </ul>
      )}
      {editing && <button type="button" className="link" onClick={() => { setQ(''); setEditing(false); }}><One k="gomi.town.cancel" /></button>}
      {missing && !editing && <span id={needId} className="gomi-need"><One k="gomi.area.need" /></span>}
      {unknown && !editing && <span id={needId} className="gomi-need"><One k="gomi.area.pickTown" /></span>}
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
