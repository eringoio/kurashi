/* ごみの出し方（/gomi。SPEC v0.4.6 の5・docs/COMING_SOON_PLAN.md の4・ごみのハンドオフ）。
   1. 「これ、何ごみ？」：品目の名前で探す → 区分・出し方・次の行動。結果を変える条件（材質・大きさ）だけを聞く。
   2. ごみを出す地域：区を手で選ぶ（端末だけ。同意の前は保存しない）。収集日の表が無い地域は、日付を作らず公式の検索へ。
   3. 自己搬入：持ち込む予定の日で受付方法を選ぶ（今日では選ばない）。
   写真・現在地からは探さない（作っていない機能をボタンにしない）。探した言葉・日付は URL にも保存にも入れない（13.4）。 */
import { useId, useMemo, useState } from 'react';
import { DATA } from '../core/data';
import { areaStatus, deliveryRegime, judgeItem, nextCollection, searchItems, type AreaChoice, type GomiItem } from '../core/gomi';
import { gomiData } from '../core/gomiData';
import { todayJst } from '../core/date';
import type { Occurrence } from '../core/occurrence';
import type { Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';
import { fmtDay } from '../ui/guide';
import { Info } from './Info';

const AREA_KEY = 'gomi_area';

function Ext({ label, url }: { label: Text; url: string }) {
  return (
    <a className="link" href={url} target="_blank" rel="noopener noreferrer">
      <Bi t={label} /> <span className="sub"><One k="gomi.external" /></span>
    </a>
  );
}

export function Gomi() {
  const d = gomiData();
  useFocusTitle('gomi');
  if (!d) return <Info id="coming-soon" />;
  return <GomiTool />;
}

function GomiTool() {
  const d = gomiData()!;
  const { level, vault: v } = usePrefs();
  const today = todayJst();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<GomiItem | null>(null);
  const [choice, setChoice] = useState<string | undefined>();
  const [useDay, setUseDay] = useState('');
  const id = useId();

  const found = useMemo(() => searchItems(d.items, q), [d, q]);
  const res = sel ? judgeItem(d.items, sel, choice) : null;

  // 地域：区だけ。引っ越しの出来事を地域より後に始めていたら、選び直してもらう
  const saved = v.get<AreaChoice>('settings', AREA_KEY) ?? null;
  const moveGroups = new Set(DATA().events.filter((e) => e.group === 'move').map((e) => e.id));
  const movedOn = v.entries('occurrences').map(([, o]) => o as Occurrence).filter((o) => moveGroups.has(o.event_id)).map((o) => o.started_on);
  const area = areaStatus(saved, { movedOn, areasWithData: d.schedules.map((s) => s.area_id) });
  const setWard = (ward: string) => (ward ? v.put('settings', AREA_KEY, { ward_id: ward, area_id: null, set_on: today } satisfies AreaChoice) : v.del('settings', AREA_KEY));
  const wardLabel = saved && area.kind !== 'needs_recheck' ? d.areas.wards.find((w) => w.id === saved.ward_id)?.label : undefined;
  const next = res?.kind === 'result' && res.category.route === 'regular' ? nextCollection(d.schedules, area, res.category.id, today) : null;

  const regime = /^\d{4}-\d{2}-\d{2}$/.test(useDay) ? deliveryRegime(d.delivery.regimes, useDay) : null;
  const pick = (it: GomiItem) => { setSel(it); setChoice(undefined); };

  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('bin')} alt="" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="gomi.title" /></h1></div>
      <p className="draftmark"><Bi k="gomi.draft" /></p>

      {/* 1. これ、何ごみ？ */}
      <section className="group" aria-labelledby={id + '-s'}>
        <div className="search">
          <label id={id + '-s'} htmlFor={id} className="label"><Bi k="gomi.search.label" /></label>
          <input id={id} type="search" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} autoComplete="off" enterKeyHint="search" aria-describedby={id + '-hint'} />
          <p id={id + '-hint'} className="sub"><One k="gomi.search.hint" /></p>
        </div>
        <div aria-live="polite">
          {q.trim() && !sel && (found.length ? (
            <ul className="list" role="list">
              {found.slice(0, 8).map((it) => (
                <li key={it.id}><button type="button" className="k-answer" onClick={() => pick(it)}><Bi t={it.label} /></button></li>
              ))}
            </ul>
          ) : (
            <div className="k-notice" role="note">
              <p><Bi k="gomi.search.none" /></p>
              {d.items.categories[0] && d.areas.links[0] && <p><Ext label={d.areas.links[0].label} url={d.areas.links[0].url} /></p>}
            </div>
          ))}
        </div>
      </section>

      {sel && res && (
        <section className="group" aria-labelledby={id + '-r'}>
          <h2 id={id + '-r'}><Bi t={sel.label} /></h2>
          {res.kind === 'ask' && sel.ask && (
            <fieldset className="pt-fieldset">
              <legend><Bi t={sel.ask.text} /></legend>
              <div className="answers">
                {sel.ask.choices.map((c) => <button key={c.value} type="button" className="k-answer" onClick={() => setChoice(c.value)}><Bi t={c.label} /></button>)}
              </div>
            </fieldset>
          )}
          {res.kind === 'unknown' && (
            <div className="k-notice" role="note">
              <p><Bi k="gomi.result.unknown" /></p>
              {d.areas.links[0] && <p><Ext label={d.areas.links[0].label} url={d.areas.links[0].url} /></p>}
            </div>
          )}
          {res.kind === 'result' && (
            <>
              {/* 結論：区分。公開前のデータなので「下書き・要確認」を文字で付ける（色だけにしない） */}
              <p className="focus__name"><Bi t={res.category.label} /> <span className="k-state k-state--check"><One k="gomi.result.unapproved" /></span></p>
              <p><Bi t={res.category.how} /></p>
              {sel.note && <p className="sub"><Bi t={sel.note} /></p>}
              {next && (
                <p className="k-notice" role="note">
                  {next.kind === 'date' ? <><Bi k="gomi.next.date" /> {fmtDay(next.date, level)}</> : <Bi k={next.kind === 'area' && area.kind === 'unset' ? 'gomi.next.noArea' : 'gomi.next.noData'} />}
                </p>
              )}
              {res.category.links.length > 0 && (
                <div className="links">{res.category.links.map((l) => <p key={l.url}><Ext label={l.label} url={l.url} /></p>)}</div>
              )}
              {choice !== undefined && <button type="button" className="link" onClick={() => setChoice(undefined)}><Bi k="gomi.result.changeAnswer" /></button>}
            </>
          )}
          <details>
            <summary><Bi k="gomi.result.why" /></summary>
            <p className="sub"><Bi k="gomi.result.checked" /> {sel.evidence.checked_at}</p>
            <ul>
              {sel.evidence.source_ids.map((s) => { const src = d.items.sources.find((x) => x.source_id === s); return <li key={s}>{src ? <Ext label={{ ja: src.title }} url={src.url} /> : s}</li>; })}
            </ul>
            {sel.evidence.note && <p className="sub">{sel.evidence.note}</p>}
          </details>
          <button type="button" className="link" onClick={() => { setSel(null); setQ(''); }}><Bi k="gomi.result.again" /></button>
        </section>
      )}

      {/* 2. ごみを出す地域 */}
      <section className="group" aria-labelledby={id + '-a'}>
        <h2 id={id + '-a'}><Bi k="gomi.area.title" /></h2>
        <label htmlFor={id + '-w'} className="label"><Bi k="gomi.area.ward" /></label>
        <select className="field" id={id + '-w'} value={area.kind === 'needs_recheck' ? '' : saved?.ward_id ?? ''} onChange={(e) => setWard(e.target.value)}>
          <option value="">{line(ui('gomi.area.choose'), level)}</option>
          {d.areas.wards.map((w) => <option key={w.id} value={w.id}>{line(w.label, level)}</option>)}
        </select>
        {area.kind === 'needs_recheck' && <p className="k-notice" role="note"><Bi k="gomi.area.recheck" /></p>}
        {wardLabel && <p className="sub"><Bi k="gomi.area.wardOnly" /></p>}
        <p className="sub"><Bi t={d.areas.coverage} /></p>
        <div className="links">{d.areas.links.map((l) => <p key={l.url}><Ext label={l.label} url={l.url} /></p>)}</div>
      </section>

      {/* 3. 必要なときだけ：粗大ごみ・自己搬入（利用予定日で選ぶ） */}
      <section className="group" aria-labelledby={id + '-m'}>
        <h2 id={id + '-m'}><Bi k="gomi.more.title" /></h2>
        <ul className="list" role="list">
          <li><Link className="link" to="/e/E-gomi/c/gomi-sodai"><Bi k="gomi.more.sodai" /></Link></li>
          <li><Link className="link" to="/e/E-gomi/c/gomi-mochikomi"><Bi k="gomi.more.mochikomi" /></Link></li>
        </ul>
        <label htmlFor={id + '-d'} className="label"><Bi k="gomi.delivery.day" /></label>
        <input className="field" id={id + '-d'} type="date" value={useDay} onChange={(e) => setUseDay(e.target.value)} />
        {regime && (
          <div className="k-notice" role="note" aria-live="polite">
            {regime.kind === 'regime' ? regime.regimes.map((r) => <p key={r.id}><Bi t={r.label} /></p>) : <p><Bi t={d.delivery.not_stated} /></p>}
            {d.delivery.links.map((l) => <p key={l.url}><Ext label={l.label} url={l.url} /></p>)}
          </div>
        )}
      </section>

      <div className="links"><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}
