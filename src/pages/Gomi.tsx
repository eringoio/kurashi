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
import { activeNotices } from '../core/notice';
import type { Occurrence } from '../core/occurrence';
import type { Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';
import { fmtDay } from '../ui/guide';
import { Info } from './Info';
import { GomiAreaFields, GomiWeek, gomiIcon, useArea, type Place } from '../ui/GomiArea';
import { SCHEDULE_ON } from '../core/gomiSchedule';

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
  const saved = v.get<AreaChoice & { town?: string }>('settings', AREA_KEY) ?? null;
  const place: Place | null = saved ? { ward_id: saved.ward_id, town: saved.town, set_on: saved.set_on } : null;
  const pa = useArea(place);
  const setPlace = (x: Place | null) => (x ? v.put('settings', AREA_KEY, { ward_id: x.ward_id, area_id: null, town: x.town, set_on: x.set_on }) : v.del('settings', AREA_KEY));
  const moveGroups = new Set(DATA().events.filter((e) => e.group === 'move').map((e) => e.id));
  const movedOn = v.entries('occurrences').map(([, o]) => o as Occurrence).filter((o) => moveGroups.has(o.event_id)).map((o) => o.started_on);
  const area = areaStatus(saved, { movedOn, areasWithData: d.schedules.map((s) => s.area_id) });
  // 収集日：私的な写し（on のとき）があればそれで、無ければ今までどおり（日付を出さない）
  const next = res?.kind === 'result' && res.category.route === 'regular'
    ? (pa.p ? nextCollection(pa.schedules, area.kind === 'needs_recheck' ? area : pa.status, res.category.id, today, { allowUnapproved: true }) : nextCollection(d.schedules, area, res.category.id, today))
    : null;

  const regime = /^\d{4}-\d{2}-\d{2}$/.test(useDay) ? deliveryRegime(d.delivery.regimes, useDay) : null;
  const pick = (it: GomiItem) => { setSel(it); setChoice(undefined); };

  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('bin')} alt="" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="gomi.title" /></h1></div>
      <p className="draftmark"><Bi k="gomi.draft" /></p>

      {/* 1. 住所（区＋町名）。作者の決定 11/6 F：住所と捨てたい物が分かれば、いつ・どのごみ・どう出すが1つの画面で分かる */}
      <section className="group" aria-labelledby={id + '-a'}>
        <h2 id={id + '-a'}><Bi phrase k="gomi.area.title" /></h2>
        <GomiAreaFields wards={d.areas.wards} saved={area.kind === 'needs_recheck' ? null : place} onSet={(x) => void setPlace(x)} area={pa} />
        {area.kind === 'needs_recheck' && <p className="k-notice" role="note"><Bi k="gomi.area.recheck" /></p>}
        {!SCHEDULE_ON && saved && <p className="sub"><Bi k="gomi.area.wardOnly" /></p>}
      </section>

      {/* 2. これ、何ごみ？ */}
      <section className="group" aria-labelledby={id + '-s'}>
        <div className="search">
          <label id={id + '-s'} htmlFor={id} className="label"><Bi k="gomi.search.label" /></label>
          <input id={id} type="search" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} autoComplete="off" enterKeyHint="search" aria-describedby={id + '-hint'} />
          <p id={id + '-hint'} className="sub"><One k="gomi.search.hint" /></p>
        </div>
        {d.areas.business && <p className="sub"><Bi t={d.areas.business.text} /> <Ext label={d.areas.business.link.label} url={d.areas.business.link.url} /></p>}
        <div aria-live="polite">
          {q.trim() && !sel && (found.length ? (
            <ul className="list" role="list">
              {found.slice(0, 8).map((it) => (
                <li key={it.id}><button type="button" className="k-answer" onClick={() => pick(it)}><Bi phrase t={it.label} /></button></li>
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
          <h2 id={id + '-r'}><Bi phrase t={sel.label} /></h2>
          {res.kind === 'ask' && sel.ask && (
            <fieldset className="pt-fieldset">
              <legend><Bi t={sel.ask.text} /></legend>
              <div className="answers">
                {sel.ask.choices.map((c) => <button key={c.value} type="button" className="k-answer" onClick={() => setChoice(c.value)}><Bi phrase t={c.label} /></button>)}
              </div>
            </fieldset>
          )}
          {res.kind === 'review' && sel.review && (
            <div className="k-notice" role="note">
              <p><span className="k-state k-state--check"><One k="gomi.result.unapproved" /></span> <Bi t={sel.review.reason} /></p>
              {d.areas.links[1] && <p><Ext label={d.areas.links[1].label} url={d.areas.links[1].url} /></p>}
            </div>
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
              <p className="focus__name gomi-result"><img src={gomiIcon(res.category.id)} alt="" className="gomi-result__art" /><Bi t={res.category.label} /> <span className="k-state k-state--check"><One k="gomi.result.unapproved" /></span></p>
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

      {/* 3. 収集日のカレンダー（on のときだけ） */}
      <GomiWeek area={pa} categories={d.items.categories} today={today} />

      {/* 4. 必要なときだけ：粗大ごみ・自己搬入（利用予定日で選ぶ） */}
      <section className="group" aria-labelledby={id + '-m'}>
        <h2 id={id + '-m'}><Bi phrase k="gomi.more.title" /></h2>
        {/* お知らせ（期間の中だけ。B-7c：10月の粗大ごみの変更は 2027-03-31 まで） */}
        {activeNotices(d.delivery.notices, today).map((n, i) => <p key={i} className="k-notice" role="note"><Bi t={n.text} /></p>)}
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

      {/* 5. ごみの種類（「分け方を知る」をこの画面に。作者 11/6 F） */}
      <details className="group gomi-kinds">
        <summary><Bi k="gomi.kinds.title" /></summary>
        <ul className="list" role="list">
          {d.items.categories.map((c) => (
            <li key={c.id} className="gomi-kind"><img src={gomiIcon(c.id)} alt="" /><span><strong><Bi t={c.label} /></strong><span className="sub"><Bi t={c.how} /></span></span></li>
          ))}
        </ul>
      </details>
      {!pa.p && <p className="sub"><Bi t={d.areas.coverage} /></p>}
      <div className="links">{d.areas.links.map((l) => <p key={l.url}><Ext label={l.label} url={l.url} /></p>)}</div>

      {/* ライセンスの表示（CC BY など。出典に license があるものだけ） */}
      {d.items.sources.filter((s) => s.license).map((s) => (
        <p key={s.source_id} className="sub"><a className="link" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>（{s.license}）</p>
      ))}
      <div className="links"><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}
