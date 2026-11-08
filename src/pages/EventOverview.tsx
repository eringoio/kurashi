/* 全体の画面（SPEC 6A.17 v0.5.28）。段（phases）のあるできごとで、最初の質問に答えたあとに出す。イベントの名前で分岐しない。
   - 手続きを段ごとに全部見せる。どれからでも開ける。前に要ることがまだでも、開いて準備できる
   - すぐ行う行動（urgent）は段の中で目立たせ、電話・リンクをその場に出す。ほかの手続きを止めない
   - 状態は4つ（未対応・対応中・完了・該当しない）。物ごとに記録する手続き（parts）は物ごとに選ぶ
   - 当てはまるかわからない手続き・物は「要確認」。対象・対象外を決めない
   - 残りの入口の質問は、この画面の中で答えられる（答えなくても全体は見られる）
   - 1つずつ進める画面（/e/{id}/step）は任意 */
import { Fragment, useState } from 'react';
import { DATA } from '../core/data';
import type { CardView } from '../core/engine';
import { needsCheck, partViews, phaseViews, prereqFrom, rollup, STATUS_OF, trackOf, tracked, TRACKS, urgentOpen, type Track } from '../core/overview';
import type { Text, Value } from '../core/schema';
import type { EventGuide } from '../guide/useEvent';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art, artDim } from '../ui/art';
import { afterText, Answers, WhyAsked } from '../ui/guide';
import { Contacts, MultiPick } from '../ui/patterns';
import { toContact, toPickOptions } from '../ui/patterns/map';
import { Link, useFocusTitle } from '../ui/router';

const TRACK_KEY: Record<Track, UiKey> = { todo: 'ov.track.todo', doing: 'ov.track.doing', done: 'ov.track.done', na: 'ov.track.na' };

/** 状態を選ぶ。見える名前（label）を読み上げの名前の頭に入れる（WCAG 2.5.3） */
export function TrackSelect({ label, name, value, onChange }: { label: Text | UiKey; name: string; value: Track; onChange: (t: Track) => void }) {
  const { level } = usePrefs();
  const text = typeof label === 'string' ? line(ui(label), level) : line(label, level);
  return (
    <label className="ov-track">
      <span className="ov-track__label">{typeof label === 'string' ? <One k={label} /> : <One t={label} />}</span>
      <select className={'ov-track__select ov-track__select--' + value} value={value} aria-label={text + '：' + name} onChange={(e) => onChange(e.target.value as Track)}>
        {TRACKS.map((t) => <option key={t} value={t}>{line(ui(TRACK_KEY[t]), level)}</option>)}
      </select>
    </label>
  );
}

export function UrgentStrip({ g, base }: { g: EventGuide; base: string }) {
  const open = urgentOpen(g.out);
  if (!open.length) return null;
  return (
    <div className="ov-strip" role="note">
      <p className="pt-badge pt-badge--urgent"><span aria-hidden="true">!</span> <One k="pat.urgent.badge" /></p>
      <ul className="ov-strip__list" role="list">
        {open.map((c) => <li key={c.card.id}><Link to={base + '/c/' + c.card.id} className="link"><Bi phrase t={c.card.title} /></Link></li>)}
      </ul>
    </div>
  );
}

/** いつも出すリンク（pin の段。例：財布が見つかったとき） */
export function PinnedLinks({ g, base }: { g: EventGuide; base: string }) {
  const ids = (g.event.phases ?? []).filter((p) => p.pin).flatMap((p) => p.card_ids);
  const cards = ids.map((id) => g.out.cards.find((c) => c.card.id === id)).filter((c): c is CardView => !!c && c.state !== 'out_of_scope');
  if (!cards.length) return null;
  return (
    <div className="links ov-pin">
      {cards.map((c) => <Link key={c.card.id} to={base + '/c/' + c.card.id} className="link"><img src={art(c.card.illustration)} alt="" /><Bi phrase t={c.card.title} /></Link>)}
    </div>
  );
}

function Item({ g, c, base, onLive }: { g: EventGuide; c: CardView; base: string; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const name = line(c.card.title, level);
  const parts = partViews(c, g.out.facts);
  const track = trackOf(c);
  const urgent = !!c.card.urgent && track !== 'done' && track !== 'na';
  const pre = prereqFrom(c).map((id) => g.out.cards.find((x) => x.card.id === id)).filter((x): x is CardView => !!x && x.state !== 'excluded');
  const said = () => onLive(line(ui('ov.saved'), level));
  const setCard = (t: Track) => { void g.setPlan(c.card.id, { status: STATUS_OF[t] }); said(); };
  const setPart = (id: string, t: Track) => {
    const next = { ...(c.plan?.parts ?? {}), [id]: STATUS_OF[t] };
    const status = STATUS_OF[rollup(parts.map((p) => ({ track: p.id === id ? t : p.track })))];
    void g.setPlan(c.card.id, { parts: next, status });
    said();
  };
  return (
    <li className={'ov-item ov-item--' + track + (urgent ? ' ov-item--urgent' : '')}>
      <Link to={base + '/c/' + c.card.id} className="ov-item__link">
        <img src={artDim(c.card.illustration, track === 'done' || track === 'na')} alt="" />
        <span className="ov-item__name"><Bi phrase t={c.card.title} /></span>
        {needsCheck(c) && <span className="k-state k-state--check"><span aria-hidden="true">？</span><One k="ov.check" /></span>}
      </Link>
      {urgent && c.card.urgent && <Contacts list={c.card.urgent.contacts.map(toContact)} />}
      {/* 段の after：〇〇のあとで（v0.5.30） */}
      {c.sectionWhy === 'after_card' && afterText(c) && <p className="ov-item__pre"><One t={afterText(c)!} /></p>}
      {pre.length > 0 && track !== 'done' && (
        <p className="ov-item__pre"><One k="ov.prereq" />{pre.map((p, i) => <span key={p.card.id}>{i > 0 && '・'}<One t={p.card.title} /></span>)}</p>
      )}
      {!tracked(c) ? null : parts.length > 0 ? (
        <div className="ov-parts">
          {parts.map((p) => (
            <div key={p.id} className="ov-part">
              <TrackSelect label={p.label} name={name} value={p.track} onChange={(t) => setPart(p.id, t)} />
              {p.applies === 'U' && <span className="k-state k-state--check"><span aria-hidden="true">？</span><One k="ov.check" /></span>}
            </div>
          ))}
        </div>
      ) : (
        <TrackSelect label="ov.status" name={name} value={track} onChange={setCard} />
      )}
    </li>
  );
}

/** 最初の質問（複数選択）を選び直す。いまの答えから始める */
function Redo({ g, onDone }: { g: EventGuide; onDone: () => void }) {
  const first = DATA().questions.find((x) => x.id === g.event.questions[0]);
  const cur = g.answers[g.event.questions[0]];
  const [sel, setSel] = useState<string[]>(Array.isArray(cur) ? cur.map(String) : []);
  if (!first) return null;
  return (
    <section className="ov-redo" aria-labelledby="ov-redo-h">
      <h2 id="ov-redo-h"><Bi t={first.text} /></h2>
      {first.multi
        ? <><MultiPick legend={ui('ev.pick.legend')} options={toPickOptions(first)} selected={sel} onChange={setSel} />
          <button type="button" className="k-answer k-answer--primary" disabled={sel.length === 0} onClick={async () => { await g.answer(first.id, sel as Value); onDone(); }}><Bi phrase k="nav.next" /></button></>
        : <Answers q={first} onPick={async (v) => { await g.answer(first.id, v); onDone(); }} />}
      <button type="button" className="link" onClick={onDone}><Bi k="nav.backPrev" /></button>
    </section>
  );
}

export function EventOverview({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const base = '/e/' + g.event.id;
  const [redo, setRedo] = useState(false);
  useFocusTitle('ev-ov:' + g.event.id + (redo ? ':redo' : ''));
  const phases = phaseViews(g.event, g.out);
  const asks = g.out.upfront.map((q) => (
    <section key={q.id} className="ov-ask" aria-labelledby={'ov-q-' + q.id}>
      <p className="eyebrow"><One k="ov.ask" /></p>
      <h2 id={'ov-q-' + q.id}><Bi t={q.text} /></h2>
      <Answers q={q} onPick={(v) => void g.answer(q.id, v)} />
      <WhyAsked t={q.why_asked} />
    </section>
  ));
  if (redo) return <><div className="head"><p className="eyebrow"><One phrase t={g.event.title} /></p><h1 id="screen-title" tabIndex={-1}><Bi phrase k="ov.redo" /></h1></div><Redo g={g} onDone={() => setRedo(false)} /></>;
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One phrase t={g.event.title} /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="ov.title" /></h1>
        <p className="sub"><Bi k="ov.sub" /></p>
      </div>
      <PinnedLinks g={g} base={base} />
      {phases.length === 0 && asks}
      {phases.map((ph, i) => {
        const hot = ph.cards.some((c) => urgentOpen(g.out).includes(c));
        // 残りの質問は、最初の段（いますぐ）のすぐ後。すぐ行う行動より上に出さない
        return (
          <Fragment key={ph.id}>
          {i === 1 && asks}
          <section className={'ov-phase' + (hot ? ' ov-phase--urgent' : '')} aria-labelledby={'ov-ph-' + ph.id}>
            <h2 id={'ov-ph-' + ph.id}>{hot && <span className="pt-badge pt-badge--urgent ov-phase__badge"><span aria-hidden="true">!</span></span>}{ph.title ? <Bi phrase t={ph.title} /> : <Bi phrase k="ov.other" />}</h2>
            {ph.note && <p className="sub"><Bi t={ph.note} /></p>}
            <ul className="ov-list" role="list">
              {ph.cards.map((c) => <Item key={c.card.id} g={g} c={c} base={base} onLive={onLive} />)}
            </ul>
          </section>
          {i === 0 && phases.length === 1 && asks}
          </Fragment>
        );
      })}
      <div className="links">
        <Link to={base + '/step'} className="k-answer"><Bi phrase k="ov.step" /></Link>
        {g.event.questions.length > 0 && <button type="button" className="link" onClick={() => setRedo(true)}><Bi k="ov.redo" /></button>}
      </div>
    </>
  );
}
