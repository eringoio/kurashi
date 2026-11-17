/* 全体の画面（SPEC 6A.17 v0.5.28）。段（phases）のあるできごとで、最初の質問に答えたあとに出す。イベントの名前で分岐しない。
   - 手続きを段ごとに全部見せる。どれからでも開ける。前に要ることがまだでも、開いて準備できる
   - すぐ行う行動（urgent）は段の中で目立たせ、電話・リンクをその場に出す。ほかの手続きを止めない
   - 記録はチェックボックス（済んだ・まだ。v0.5.36）。物ごとに記録する手続き（parts）は物ごとにチェック
   - 当てはまるかわからない手続き・物は「要確認」。対象・対象外を決めない
   - 残りの入口の質問は、この画面の中で答えられる（答えなくても全体は見られる）
   - 1つずつ進める画面（/e/{id}/step）は任意 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { DATA } from '../core/data';
import { evalCond } from '../core/logic';
import type { CardView } from '../core/engine';
import { checkPart, foundAfter, foundEased, foundItems, needsCheck, partViews, phaseViews, phaseVisits, prereqFrom, STATUS_OF, trackOf, tracked, urgentOpen, type Track } from '../core/overview';
import { CheckBox, Checklist } from '../ui/Checklist';
import type { Value } from '../core/schema';
import type { EventGuide } from '../guide/useEvent';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art, artDim } from '../ui/art';
import { afterText, Answers, fill, fillDate, pickText, todayWord, unverifiedOb, WhyAsked } from '../ui/guide';
import { todayJst } from '../core/date';
import { statusKey } from '../core/trust';
import type { Question } from '../core/schema';
import { Contacts, MultiPick } from '../ui/patterns';
import { toContact, toPickOptions } from '../ui/patterns/map';
import { Link, useFocusTitle } from '../ui/router';

/** 印を分ける（2026-11-08）：答えが無くて決まらない（ask）は「まだわからない」、窓口で確かめる・資料が未確認は「要確認」 */
const CheckMark = ({ ask }: { ask?: boolean }) => <span className="k-state k-state--check"><span aria-hidden="true">？</span><One k={ask ? 'st.ask' : 'ov.check'} /></span>;

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

/** 目的を足す（O-8）：「辞める」に「個人事業も始める」。答えは配列になり、どちらの手続きも外れない。全体の画面（2つの形）に出す */
export function AddAnswers({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const list = (g.event.add_answers ?? []).filter((a) => g.answers[a.q] === a.from);
  if (!list.length) return null;
  return (
    <div className="links">
      {list.map((a) => (
        <button key={a.q + a.add} type="button" className="k-answer k-answer--small" onClick={async () => {
          await g.answer(a.q, [a.from, a.add]);
          onLive(line(ui('ov.added'), level) + line(a.label, level));
          document.getElementById('screen-title')?.focus();
        }}><span aria-hidden="true">＋ </span><Bi phrase t={a.label} /></button>
      ))}
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

/** seen：同じ段で前の項目がもう出した連絡先（同じリンクを2回並べない。C-1） */
function Item({ g, c, base, onLive, seen, altAt, eased }: { g: EventGuide; c: CardView; base: string; onLive: (s: string) => void; seen?: Set<string>; /** 見つかったと答えた物の再発行：要らないかもしれない、と添える（記録は変えない） */ eased?: boolean; /** 窓口に行くなら同じ所でできる場合がある（FE-16） */ altAt?: string | null }) {
  const { level } = usePrefs();
  const name = line(c.card.title, level);
  const parts = partViews(c, g.out.facts);
  const track = trackOf(c);
  const urgent = !!c.card.urgent && track !== 'done' && track !== 'na';
  const pre = prereqFrom(c).map((id) => g.out.cards.find((x) => x.card.id === id)).filter((x): x is CardView => !!x && x.state !== 'excluded');
  const said = () => onLive(line(ui('ov.saved'), level));
  const setCard = (t: Track) => { void g.setPlan(c.card.id, { status: STATUS_OF[t] }); said(); };
  return (
    <li className={'ov-item ov-item--' + track + (urgent ? ' ov-item--urgent' : '')}>
      <Link to={base + '/c/' + c.card.id} className="ov-item__link">
        <img src={artDim(c.card.illustration, track === 'done' || track === 'na')} alt="" />
        <span className="ov-item__name"><Bi phrase t={c.card.title} /></span>
        {needsCheck(c) && <CheckMark ask={c.state === 'ask'} />}
      </Link>
      {/* 義務の強さ（C-13・O-3）：必要／したほうがよい／案内。済んだ・該当しない項目には出さない */}
      {track !== 'done' && track !== 'na' && !eased && <p className="ov-item__ob"><One k={todayWord(c.card.obligation, unverifiedOb(c))} />
        {/* 行かない方法（出典つきの方法だけ。FE-17）・選んだ方法 */}
        {c.way && c.ways.length > 1 ? <>　<One k={('way.' + c.way) as UiKey} /></> : c.remote ? <>　<One k={(c.remoteWays.includes('online') && c.remoteWays.includes('mail') ? 'road.remote.both' : c.remoteWays.includes('online') ? 'road.remote.online' : 'road.remote.mail') as UiKey} /></> : null}
      </p>}
      {eased && track !== 'done' && track !== 'na' && <p className="ov-item__pre"><One k="ov.found.eased" /></p>}
      {altAt && track !== 'done' && track !== 'na' && (() => { const n = (ui(('placeTitle.' + altAt) as UiKey) ?? ui(('place.' + altAt) as UiKey)) as LocalizedText | undefined; return n ? <p className="ov-item__pre"><One t={fill(ui('road.visit.maybe'), 'n', (_lv, id) => String((n as Record<string, unknown>)[id] ?? n.ja))} /></p> : null; })()}
      {/* 決めた行く日（O-1 の残り）。済んだ・関係なかった項目には出さない */}
      {c.plan?.planned_on && track !== 'done' && track !== 'na' && (
        <p className="ov-item__day">{c.plan.planned_on === todayJst() ? <strong><One k={c.way === 'mail' || c.way === 'online' ? 'ov.dayTodaySend' : 'ov.dayToday'} /></strong> : <One t={fillDate(ui(c.way === 'mail' || c.way === 'online' ? 'ov.daySend' : 'ov.day'), c.plan.planned_on)} />}</p>
      )}
      {urgent && c.card.urgent && <Contacts list={c.card.urgent.contacts.filter((x) => !seen?.has(x.value)).map(toContact)} />}
      {/* 段の after：〇〇のあとで（v0.5.30） */}
      {c.sectionWhy === 'after_card' && afterText(c) && <p className="ov-item__pre"><One t={afterText(c)!} /></p>}
      {pre.length > 0 && track !== 'done' && (
        <p className="ov-item__pre"><One k="ov.prereq" />{pre.map((p, i) => <span key={p.card.id}>{i > 0 && '・'}<One t={p.card.title} /></span>)}</p>
      )}
      {!tracked(c) ? null : parts.length > 0 ? (
        // 記録はチェックボックス（v0.5.35・v0.5.36）。物ごとの記録（カードの停止など）はチェックリスト
        <Checklist context={name} items={parts.map((p) => {
          const card = c.card.parts!.find((x) => x.id === p.id)!.card;
          return { id: p.id, label: p.label, track: p.track, to: card && g.out.cards.some((x) => x.card.id === card) ? base + '/c/' + card : null, extra: p.applies === 'U' ? <CheckMark ask /> : undefined };
        })} onToggle={(id, v, pending) => { void g.setPlan(c.card.id, checkPart(c, parts, id, v, pending)); said(); }} />
      ) : (
        <div className="ck-row">
          {/* 答えから済んだとわかったもの（記録ではない）は外せない */}
          <CheckBox name={line(ui('ov.track.done'), level) + '：' + name} checked={track === 'done'} disabled={c.section === 'done' && c.plan?.status !== 'done'} onChange={(v) => setCard(v ? 'done' : 'todo')}>
            <One k="ov.track.done" />
          </CheckBox>
          {/* 該当しない（C-13・O-3）：完了にしないで外せる。答えから済んだとわかったものは選べない */}
          <CheckBox name={line(ui('ov.track.na'), level) + '：' + name} checked={track === 'na'} disabled={c.section === 'done' && c.plan?.status !== 'done'} onChange={(v) => setCard(v ? 'na' : 'todo')}>
            <One k="ov.track.na" />
          </CheckBox>
        </div>
      )}
    </li>
  );
}

/** 答えを選び直す。最初の質問（複数選択）は、いまの答えから始める。
    ほかの入口の質問は、答えてあって今も聞くもの（ask_when が T）だけ。押すとすぐ記録する（例：なくした場所・警察に届けたか） */
function Redo({ g, onDone }: { g: EventGuide; onDone: () => void }) {
  const first = DATA().questions.find((x) => x.id === g.event.questions[0]);
  const cur = g.answers[g.event.questions[0]];
  const valid = new Set((first?.options ?? []).map((o) => String(o.value)));
  // 今の選択肢に無い値（前の版の答え）は、選び直すときに残さない
  const [sel, setSel] = useState<string[]>(Array.isArray(cur) ? cur.map(String).filter((v) => valid.has(v)) : []);
  if (!first) return null;
  const rest = g.event.questions.slice(1).map((id) => DATA().questions.find((q) => q.id === id)!)
    .filter((q) => q && g.answers[q.id] !== undefined && evalCond(q.ask_when, g.out.facts).v === 'T');
  return (
    <>
      <section className="ov-redo" aria-labelledby="ov-redo-h">
        <h2 id="ov-redo-h"><Bi t={first.text} /></h2>
        {first.multi
          ? <><MultiPick legend={ui('ev.pick.legend')} options={toPickOptions(first)} selected={sel} onChange={setSel} />
            <button type="button" className="k-answer k-answer--primary" disabled={sel.length === 0} onClick={async () => { await g.answer(first.id, sel as Value); onDone(); }}><Bi phrase k="nav.next" /></button></>
          : <Answers q={first} current={cur} onPick={async (v) => { await g.answer(first.id, v); onDone(); }} />}
      </section>
      {rest.map((q) => (
        <section key={q.id} className="ov-redo" aria-labelledby={'ov-redo-' + q.id}>
          <h2 id={'ov-redo-' + q.id}><Bi t={q.text} /></h2>
          <Answers q={q} current={g.answers[q.id]} onPick={(v) => void g.answer(q.id, v)} />
        </section>
      ))}
      <button type="button" className="link" onClick={onDone}><Bi k="nav.backPrev" /></button>
    </>
  );
}

/** 手続きごとの段（答えの前と後で比べる。C-6） */
const sectionsOf = (cards: CardView[]) => new Map(cards.map((c) => [c.card.id, String(c.section)]));
function changedCount(before: Map<string, string>, after: Map<string, string>): number {
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids].filter((id) => before.get(id) !== after.get(id)).length;
}
/** 答えのラベル（選択肢の文。複数なら「、」でつなぐ） */
function answerText(q: Question, v: Value) {
  const vals = (Array.isArray(v) ? v : [v]).map(String);
  const labels = vals.map((x) => q.options?.find((o) => String(o.value) === x)?.label).filter((t): t is NonNullable<typeof t> => !!t);
  return (id: string) => labels.map((t) => pickText(t, id)).join(id.startsWith('ja') ? '、' : ', ');
}

/** 見つかった物を答えにする（G-11・O-3）。選ぶと答え（Q-lost-found）として保存する。手続きの記録（完了など）は変えない。
    選んだ物ごとに、見つかったあとのこと（出典つき・要確認）を出す */
function FoundBlock({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const f = g.event.found;
  const got = f ? foundItems(g.event, g.answers) : [];
  const key = got.join(',');
  const [sel, setSel] = useState<string[]>(got);
  useEffect(() => setSel(got), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const q = DATA().questions.find((x) => x.id === f.q);
  const lost = g.answers[f.from];
  const items = f.items.filter((i) => Array.isArray(lost) && lost.includes(i.value));
  if (!q || !items.length) return null;
  const label = (v: string) => q.options.find((o) => o.value === v)!.label;
  const toggle = async (v: string, on: boolean) => {
    const next = items.map((i) => i.value).filter((x) => (x === v ? on : sel.includes(x)));
    setSel(next);
    await g.answer(f.q, next);
    const names = next.length ? next.map((x) => line(label(x), level)).join(level.kind === 'foreign' ? ', ' : '、') : line(ui('ov.found.nothing'), level);
    onLive(line(ui('ov.found.said'), level).replace('{answer}', names));
  };
  const after = foundAfter(g.event, g.answers, g.out.facts, (id) => DATA().rules.get(id)?.condition);
  const ev = (a: { evidence: Parameters<typeof statusKey>[0] }) => <span className="sub"> <One k={statusKey(a.evidence) as UiKey} /></span>;
  return (
    <section className="ov-found" aria-labelledby="ov-found-h">
      <h2 id="ov-found-h"><Bi phrase k="ov.found.h" /></h2>
      <p className="sub"><Bi k="ov.found.sub" /></p>
      <ul className="ov-list" role="list">
        {items.map((i) => (
          <li key={i.value} className="ov-item">
            <CheckBox name={line(label(i.value), level) + '：' + line(ui('ov.found.check'), level)} checked={sel.includes(i.value)} onChange={(v) => void toggle(i.value, v)}>
              <Bi phrase t={label(i.value)} />
            </CheckBox>
          </li>
        ))}
      </ul>
      {after.length > 0 && (
        <div aria-labelledby="ov-found-after">
          <h3 id="ov-found-after"><Bi phrase k="ov.found.after" /></h3>
          {after.map((x) => (
            <div key={x.value}>
              <h4><Bi phrase t={label(x.value)} /></h4>
              <ul role="list">{x.list.map((a, n) => <li key={n}><Bi t={a.text} />{ev(a)}</li>)}</ul>
            </div>
          ))}
          {(f.common ?? []).length > 0 && (
            <div>
              <h4><Bi phrase k="ov.found.common" /></h4>
              <ul role="list">{f.common.map((a, n) => <li key={n}><Bi t={a.text} />{ev(a)}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function EventOverview({ g, onLive }: { g: EventGuide; onLive: (s: string) => void }) {
  const base = '/e/' + g.event.id;
  const [redo, setRedo] = useState(false);
  useFocusTitle('ev-ov:' + g.event.id + (redo ? ':redo' : ''));
  const phases = phaseViews(g.event, g.out);
  const eased = foundEased(g.event, g.answers);
  // 全体の画面で答えたあと：何が変わったかを1行で言い、フォーカスをその行へ（C-6。フォーカスを BODY に落とさない）
  const [last, setLast] = useState<{ q: Question; v: Value; n: number } | null>(null);
  const pending = useRef<{ q: Question; v: Value; before: Map<string, string> } | null>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setLast({ q: p.q, v: p.v, n: changedCount(p.before, sectionsOf(g.out.cards)) });
  }, [g.out]);
  useEffect(() => { if (last) lineRef.current?.focus({ preventScroll: false }); }, [last]);
  const pick = (q: Question, v: Value) => { pending.current = { q, v, before: sectionsOf(g.out.cards) }; void g.answer(q.id, v); };
  const said = last && fill(fill(ui(last.n ? 'ov.answered' : 'ov.answeredSame'), 'answer', (_lv, id) => answerText(last.q, last.v)(id)), 'n', () => String(last.n));
  const asks = g.out.upfront.map((q) => (
    <section key={q.id} className="ov-ask" aria-labelledby={'ov-q-' + q.id}>
      <p className="eyebrow"><One k="ov.ask" /></p>
      <h2 id={'ov-q-' + q.id}><Bi t={q.text} /></h2>
      <Answers q={q} onPick={(v) => pick(q, v)} />
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
      <p role="status" className={'k-change__line' + (said ? ' k-change--on' : '')} ref={lineRef} tabIndex={-1}>{said && <><span aria-hidden="true">✓ </span><Bi t={said} /></>}</p>
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
            {/* 同じ所へ行く手続きは、所の名前の見出しでまとめる（v0.5.44）。記録は手続きごとのまま */}
            {phaseVisits(ph.cards).map((vg, vi) => {
              const list = (
                <ul className="ov-list" role="list">
                  {[...vg.cards, ...vg.alt].map((c) => { const j = ph.cards.indexOf(c); return <Item key={c.card.id} g={g} c={c} base={base} onLive={onLive} eased={eased.has(c.card.id)} altAt={vg.alt.includes(c) ? vg.place : null} seen={new Set(ph.cards.slice(0, j).filter((x) => x.card.urgent && trackOf(x) !== 'done' && trackOf(x) !== 'na').flatMap((x) => x.card.urgent!.contacts.map((k) => k.value)))} />; })}
                </ul>
              );
              if (!vg.place) return <Fragment key={'v' + vi}>{list}</Fragment>;
              const name = (ui(('placeTitle.' + vg.place) as UiKey) ?? ui(('place.' + vg.place) as UiKey)) as LocalizedText | undefined;
              return (
                <div key={'v' + vi} className="ov-visit">
                  {name && <h3 className="ov-visit__name"><Bi phrase t={fill(ui('road.visit.at'), 'n', (_lv, id) => String((name as Record<string, unknown>)[id] ?? name.ja))} /></h3>}
                  <p className="sub"><One k="road.visit.same" /></p>
                  {list}
                </div>
              );
            })}
          </section>
          {i === 0 && phases.length === 1 && asks}
          </Fragment>
        );
      })}
      <FoundBlock g={g} onLive={onLive} />
      <AddAnswers g={g} onLive={onLive} />
      <div className="links">
        <Link to={base + '/step'} className="k-answer"><Bi phrase k="ov.step" /></Link>
        {g.event.questions.length > 0 && <button type="button" className="link" onClick={() => setRedo(true)}><Bi k="ov.redo" /></button>}
      </div>
    </>
  );
}
