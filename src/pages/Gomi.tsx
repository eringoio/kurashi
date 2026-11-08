/* ごみの出し方（/gomi。SPEC v0.4.6 の5・docs/COMING_SOON_PLAN.md の4・ごみのハンドオフ）。
   1. 「これ、何ごみ？」：品目の名前で探す → 区分・出し方・次の行動。結果を変える条件（材質・大きさ）だけを聞く。
   2. ごみを出す地域：区を手で選ぶ（端末だけ。同意の前は保存しない）。収集日の表が無い地域は、日付を作らず公式の検索へ。
   3. 収集日（2週間）：町名まで選ぶと出る（市の掲載の許可 2026-11-08。既定で出す）。位置を使う設定なら、区を現在地から先に入れる。
   4. ごみの種類と袋：種類ごとに、袋と品目の表。自己搬入の受付の方法は、自己搬入のカード（gomi-mochikomi）だけに書く。
   写真からは探さない（作っていない機能をボタンにしない）。探した言葉・日付は URL にも保存にも入れない（13.4）。 */
import { memo, useEffect, useId, useMemo, useState } from 'react';
import { DATA } from '../core/data';
import { areaStatus, judgeItem, nextCollection, searchItems, type AreaChoice, type GomiItem, type GomiItems } from '../core/gomi';
import { gomiData } from '../core/gomiData';
import { todayJst } from '../core/date';
import { activeNotices } from '../core/notice';
import type { Occurrence } from '../core/occurrence';
import type { Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { line, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';
import { fmtDay } from '../ui/guide';
import { Info } from './Info';
import { bagIcon, GomiAreaFields, GomiWeek, gomiIcon, useArea, type Place } from '../ui/GomiArea';
import { areaIdToSave, SCHEDULE_ON } from '../core/gomiSchedule';

/** 自宅の住所（区・町名・番地の行の id）。前の名前 gomi_area から移す */
const AREA_KEY = 'home_address';
const OLD_KEY = 'gomi_area';

function Ext({ label, url }: { label: Text; url: string }) {
  return (
    <a className="link" href={url} target="_blank" rel="noopener noreferrer">
      <Bi t={label} /> <span aria-hidden="true">↗</span><span className="sr-only"><One k="here.newTab" /></span>
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
  const { level, vault: v, location } = usePrefs();
  const today = todayJst();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<GomiItem | null>(null);
  const [choice, setChoice] = useState<string | undefined>();
  const id = useId();

  const found = useMemo(() => searchItems(d.items, q), [d, q]);
  const res = sel ? judgeItem(d.items, sel, choice) : null;

  // 地域：区だけ。引っ越しの出来事を地域より後に始めていたら、選び直してもらう
  const saved = v.get<AreaChoice & { town?: string }>('settings', AREA_KEY) ?? v.get<AreaChoice & { town?: string }>('settings', OLD_KEY) ?? null;
  const place: Place | null = saved ? { ward_id: saved.ward_id, town: saved.town, area_id: saved.area_id ?? null, set_on: saved.set_on } : null;
  const pa = useArea(place);
  const setPlace = async (x: Place | null) => {
    if (v.get('settings', OLD_KEY)) await v.del('settings', OLD_KEY);
    return x ? v.put('settings', AREA_KEY, { ward_id: x.ward_id, area_id: x.area_id ?? null, town: x.town, set_on: x.set_on }) : v.del('settings', AREA_KEY);
  };
  const moveGroups = new Set(DATA().events.filter((e) => e.group === 'move').map((e) => e.id));
  const movedOn = v.entries('occurrences').map(([, o]) => o as Occurrence).filter((o) => moveGroups.has(o.event_id)).map((o) => o.started_on);
  const area = areaStatus(saved, { movedOn, areasWithData: d.schedules.map((s) => s.area_id) });
  // 収集日：私的な写し（on のとき）があればそれで、無ければ今までどおり（日付を出さない）
  const next = res?.kind === 'result' && res.category.route === 'regular'
    ? (pa.p ? nextCollection(pa.schedules, area.kind === 'needs_recheck' ? area : pa.status, res.category.id, today, { allowUnapproved: true }) : nextCollection(d.schedules, area, res.category.id, today))
    : null;

  // K-21: when the town (and block) pick one row of the table, save its area_id (the block text itself is not saved).
  // While the screen has not restored the row yet (rowId null), keep the saved area_id. Changing the ward/town/block clears it in setPlace.
  const rowId = pa.row?.id ?? null;
  useEffect(() => {
    const next = saved ? areaIdToSave(saved.area_id, rowId) : undefined;
    if (saved && next !== undefined) void v.put('settings', AREA_KEY, { ...saved, area_id: next });
  }, [rowId, saved, v]);
  // 位置を使う設定のとき、区は「提案」だけ出す（現在地と住んでいる所は違うかもしれないので、自動では決めない。本人が確かめて決める）
  const pick = (it: GomiItem) => { setSel(it); setChoice(undefined); };

  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('bin')} alt="" /></div>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="gomi.title" /></h1></div>

      {/* 1. 住所（区＋町名）。作者の決定 11/6 F：住所と捨てたい物が分かれば、いつ・どのごみ・どう出すが1つの画面で分かる */}
      <section className="group" aria-labelledby={id + '-a'}>
        <h2 id={id + '-a'}><Bi phrase k="gomi.area.title" /></h2>
        {/* 収集日が出るまで（区・町名・番地がそろうまで）、何を入れるかを1行で聞く */}
        {SCHEDULE_ON && pa.status.kind !== 'ready' && area.kind !== 'needs_recheck' && <p className="k-notice" role="note"><Bi k="gomi.area.ask" /></p>}
        <GomiAreaFields wards={d.areas.wards} saved={area.kind === 'needs_recheck' ? null : place} onSet={(x) => { void setPlace(x); }} area={pa} autoSuggest={location === 'on'} />
        {area.kind === 'needs_recheck' && <p className="k-notice" role="note"><Bi k="gomi.area.recheck" /></p>}
        {!SCHEDULE_ON && saved && <p className="sub"><Bi k="gomi.area.wardOnly" /></p>}
      </section>

      {/* 収集日のカレンダー（2週間）。町名まで選ぶと出る */}
      <GomiWeek area={pa} categories={d.items.categories} today={today} />

      {/* 2. これ、何ごみ？ */}
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
              <p className="focus__name gomi-result"><img src={gomiIcon(res.category.id)} alt="" className="gomi-result__art" /><Bi t={res.category.label} />{res.category.evidence.status !== 'verified' && <> <span className="k-state k-state--check"><One k="gomi.result.unapproved" /></span></>}</p>
              <p className="gomi-bag"><img src={bagIcon(res.category.bag)} alt="" /><Bi k={`gomi.bag.${res.category.bag}` as UiKey} /></p>
              <p><Bi t={res.category.how} /></p>
              {sel.note && <p className="sub"><Bi t={sel.note} /></p>}
              {/* 収集日（作者 11/7 K-10）：日が分かるときだけ出す。地域を選んでいないときは、上の欄を指す1行だけ。地域を選んだのに日が無いときは出さない（地域の欄の下にもう書いてある） */}
              {next?.kind === 'date' && <p className="k-notice" role="note"><Bi k="gomi.next.date" /> {fmtDay(next.date, level)}</p>}
              {next?.kind === 'area' && area.kind === 'unset' && <p className="sub"><Bi k="gomi.next.noArea" /></p>}
              {res.category.id === 'sodai' && <p><Link className="k-answer" to="/e/E-gomi/c/gomi-sodai"><Bi k="gomi.sodaiHint" /></Link></p>}
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

      {/* 4. 必要なときだけ：自己搬入。粗大ごみの案内は、探した物が粗大ごみのときだけ結果の下に出す（K-22） */}
      <section className="group" aria-labelledby={id + '-m'}>
        <h2 id={id + '-m'}><Bi phrase k="gomi.more.title" /></h2>
        {/* お知らせ（期間の中だけ。B-7c：10月の粗大ごみの変更は 2027-03-31 まで） */}
        {activeNotices(d.delivery.notices, today).map((n, i) => <p key={i} className="k-notice" role="note"><Bi t={n.text} /></p>)}
        <ul className="list" role="list">
          <li><Link className="k-answer" to="/e/E-gomi/c/gomi-mochikomi"><Bi k="gomi.more.mochikomi" /></Link></li>
        </ul>
      </section>

      {/* 5. ごみの種類と袋。種類ごとに、袋と品目の表（作者 11/8） */}
      <section className="group" aria-labelledby={id + '-k'}>
        <h2 id={id + '-k'}><Bi phrase k="gomi.kinds.title" /></h2>
        <Kinds items={d.items} />
      </section>
      {!pa.p && <p className="sub"><Bi t={d.areas.coverage} /></p>}

      {/* ライセンスの表示（CC BY：名前と出典を小さく、下に）。その下に、市のページ（収集日・分け方の検索・事業系ごみ）を出典として */}
      <p className="sub"><Bi k="gomi.license" /> {d.items.sources.filter((x) => x.license).map((x, i) => <span key={x.source_id}>{i > 0 && ' / '}<a className="link" href={x.url} target="_blank" rel="noopener noreferrer">{x.title}<span aria-hidden="true"> ↗</span><span className="sr-only"><One k="here.newTab" /></span></a></span>)}</p>
      <div className="gomi-sources">
        <p className="sub"><Bi k="gomi.sources" /></p>
        <p className="sub"><Bi k="gomi.draft" /></p>
        <ul role="list">
          {d.areas.links.map((l) => <li key={l.url}><Ext label={l.label} url={l.url} /></li>)}
          {d.areas.business && <li><Ext label={d.areas.business.link.label} url={d.areas.business.link.url} /></li>}
        </ul>
      </div>
    </>
  );
}

type KindItem = { key: string; label: Text; choice?: Text };
/** 種類ごとの品目の名前（「〜を選ぶ」の品目は、選んだ答えの種類の中に「品目（答え）」で出す）。確かめ中（review）の品目は出さない。並びは表示の言葉で */
function itemsByKind(data: GomiItems, sortKey: (t: Text) => string): Map<string, KindItem[]> {
  const m = new Map<string, KindItem[]>();
  const push = (cat: string, x: KindItem) => { const a = m.get(cat) ?? []; a.push(x); m.set(cat, a); };
  for (const it of data.items) {
    if (it.review) continue;
    if (it.category) push(it.category, { key: it.id, label: it.label });
    else it.ask?.choices.forEach((c) => { if (c.category) push(c.category, { key: it.id + ':' + c.value, label: it.label, choice: c.label }); });
  }
  for (const a of m.values()) a.sort((x, y) => sortKey(x.label).localeCompare(sortKey(y.label), 'ja'));
  return m;
}

/** ごみの種類と袋。種類ごとに開くと、出し方と品目の表。品目の表は開いたときだけ作る（1,000行をこえるため） */
const Kinds = memo(function Kinds({ items }: { items: GomiItems }) {
  const { level } = usePrefs();
  const by = useMemo(() => itemsByKind(items, (t) => line(t, level)), [items, level]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <ul className="gomi-kinds" role="list">
      {items.categories.map((c) => {
        const list = by.get(c.id) ?? [];
        return (
          <li key={c.id}>
            <details onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen((x) => ({ ...x, [c.id]: o })); }}>
              <summary className="gomi-kind">
                <img src={gomiIcon(c.id)} alt="" />
                <span><strong><Bi t={c.label} /></strong><span className="gomi-bag"><img src={bagIcon(c.bag)} alt="" /><Bi k={`gomi.bag.${c.bag}` as UiKey} /></span></span>
              </summary>
              <p><Bi t={c.how} /></p>
              {c.id === 'kan' && <p className="sub"><Bi k="gomi.bag.kanNote" /></p>}
              {open[c.id] && list.length > 0 && (
                <>
                  <p className="gomi-names__title"><Bi k="gomi.kinds.items" /> ({list.length})</p>
                  <ul className="gomi-names" role="list">
                    {list.map((x) => <li key={x.key}><One t={x.label} />{x.choice && <> (<One t={x.choice} />)</>}</li>)}
                  </ul>
                </>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
});
