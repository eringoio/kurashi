/* 付き添い（SPEC 6A.6）：約束の日に、行く所ごとに「行く前 → 窓口で → 終わったら」。
   判定は src/core/accompany.ts。ここは出すだけ。窓口で言うことは、カードの正式名と strings.json の決まった文から作る（AI で作らない）。
   段階は resume に残す（同意のあと。開き直すと同じ段階から）。URL には行く所の種類と段階だけ（13.4）。 */
import { useEffect, useState } from 'react';
import { afterOutcome, bringByCard, outcomePatch, resultPatch, type CardResult, visitPath, visitsToday, type Visit, type VisitOutcome, type VisitStage } from '../core/accompany';
import { DATA } from '../core/data';
import type { CardView } from '../core/engine';
import type { Card, Text } from '../core/schema';
import { visitGroup } from '../core/visit';
import { useGuide } from '../guide/useGuide';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { line, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CardRow, DayChoice, dayTitle, fill, fillDate, ResultView } from '../ui/guide';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { cardHome } from '../guide/catalogue';
import { Speak } from '../ui/Speak';
import { AddToCalendar } from '../ui/AddToCalendar';
import { HeardWords, useSeen } from '../ui/Words';
import { track } from '../ui/telemetry';
/** 窓口で見せた手続きの正式名を「ことば」に残す（10b） */
function SeenNames({ ids }: { ids: string[] }) { useSeen(ids); return null; }

/** 見出し・段階の名前に使う、行く所の名前（大文字で始まる英語。placeTitle.<id>、無ければ place.<id>。K-51） */
export function placeTitle(place: string): LocalizedText | undefined {
  return (ui(('placeTitle.' + place) as UiKey) ?? ui(('place.' + place) as UiKey)) as LocalizedText | undefined;
}
const pickPlace = (t: LocalizedText | undefined, id: string, place: string): string => (t ? String(t[id] ?? t.ja_easy ?? t.ja) : place);

/** 行く所の名前（strings.json の place.<id>）を文の {place} に入れる */
export function withPlace(t: LocalizedText, place: string): Text {
  const p = ui(('place.' + place) as UiKey) as LocalizedText | undefined;
  return fill(t, 'place', (_lv, id) => (p ? p[id] ?? p.ja_easy ?? p.ja : place));
}

/** 窓口で言うこと：日本語は正式名（よみ付き）で、意味は表示レベルの名前で */
export function counterPhrase(card: Card): Text {
  const o = card.official_name;
  return fill(ui('visit.counter.phrase'), 'name', (_lv, id) => (id === 'ja' ? `{${o.ja}|${o.reading}}` : card.title[id] ?? card.title.ja_easy ?? card.title.ja));
}

type Result = { kind: 'done' | 'check' | 'replan'; ids: string[]; told?: VisitOutcome } | { kind: 'planned'; day: string; ids: string[] }
  | { kind: 'mixed'; done: string[]; notDone: string[]; open: string[] };

function Before({ v, onLive }: { v: Visit; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const held = v.bring.filter((b) => b.held);
  const missing = v.bring.filter((b) => !b.held);
  const byCard = bringByCard({ cards: v.cards, bring: held });
  // 手続きごとに、名前（開ける）とその持ち物。手続きの一覧を別に出さない（K-45）。どの手続きも見出しは出す
  const groups = [
    ...byCard.groups.map((g) => ({ key: g.card.card.id, title: <Link to={cardHome(g.card.card.id) ?? '/c/' + g.card.card.id} className="link"><One t={g.card.card.title} /></Link>, items: g.items, always: true })),
    { key: 'rest', title: <One k="visit.bring.common" />, items: byCard.rest, always: false },
  ];
  return (
    <>
      <div className="art" aria-hidden="true">{v.cards.slice(0, 3).map((c) => <img key={c.card.id} src={art(c.card.illustration)} alt="" />)}<img src={art('box')} alt="" /></div>
      <div className="head">
        <p className="eyebrow"><One t={fill(ui('visit.stage.beforeAt'), 'place', (_lv, id) => pickPlace(placeTitle(v.place), id, v.place))} /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="visit.before.title" /></h1>
      </div>
      <section aria-labelledby="visit-bring">
        <h2 id="visit-bring" className="label"><One phrase k="visit.bring.label" /></h2>
        <p className="sub"><Bi k={v.ordered ? 'visit.ordered' : 'visit.unordered'} /></p>
        {held.length === 0 && <p className="sub"><Bi k="visit.bring.none" /></p>}
        {/* 手続きごとに分けて出す。同じ物は最初の手続きだけ（作者 11/6 B-6） */}
        {groups.map((g) => (g.always || g.items.length > 0) && (
          <div key={g.key} className="bringgroup">
            <h3 className="label">{g.title}</h3>
            {g.items.length > 0 && <div className="list">
          {g.items.map((b) => {
            const on = packed.has(b.object.id);
            return (
              <button key={b.object.id} type="button" className="k-check" aria-pressed={on}
                onClick={() => {
                  setPacked((s) => { const n = new Set(s); if (on) n.delete(b.object.id); else n.add(b.object.id); return n; });
                  onLive(line(b.object.title, level) + '：' + line(ui(on ? 'visit.bring.unpacked' : 'visit.bring.packed'), level));
                }}>
                <span className="k-check__box" aria-hidden="true">{on ? '✓' : ''}</span>
                <img src={art(b.object.illustration)} alt="" />
                <Bi t={b.object.title} />
              </button>
            );
          })}
            </div>}
          </div>
        ))}
        {missing.length > 0 && (
          <div className="k-notice" role="note">
            <p className="label"><One k="visit.bring.missing" /></p>
            <ul className="plainlist">{missing.map((b) => <li key={b.object.id}><Bi t={b.object.title} /></li>)}</ul>
            {v.alternatives.length === 0 && <Bi k="visit.bring.missingNote" />}
          </div>
        )}
        {v.alternatives.length > 0 && (
          <div className="k-notice" role="note">
            <p className="label"><One k="visit.bring.alt" /></p>
            {v.alternatives.map((a) => a.items.map((x, i) => <p key={a.card.id + i}><Bi t={x.text} /></p>))}
          </div>
        )}
        <p className="sub"><Bi k="visit.bring.other" /></p>
      </section>
      <button type="button" className="k-answer k-answer--primary" onClick={() => navigate(visitPath(v.place, 'counter'))}>
        <img src={art('hall')} alt="" />
        <Bi t={withPlace(ui('visit.arrived'), v.place)} />
      </button>
    </>
  );
}

function Counter({ v }: { v: Visit }) {
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k="visit.stage.counter" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="visit.counter.title" /></h1>
      </div>
      {v.cards.map((c, i) => {
        const ph = counterPhrase(c.card);
        // 作者 11/7：どの表示レベルでも、ふりがな付きの日本語と英語（ことばと同じ）
        const mean = (ph as LocalizedText).en;
        return (
          <section key={c.card.id} className="k-counter" aria-labelledby={'say-' + i}>
            <h2 id={'say-' + i} className="label"><One phrase k="visit.counter.say" /></h2>
            <p className="k-counter__ja" lang="ja"><Ruby s={ph.ja} furigana /></p>
            <p className="k-counter__name" lang="ja"><span className="sr-only"><One k="visit.counter.official" />：</span><Ruby s={`{${c.card.official_name.ja}|${c.card.official_name.reading}}`} /></p>
            {mean && <p className="k-counter__mean" lang="en">{mean}</p>}
            <Speak ja={ph.ja} />
          </section>
        );
      })}
      {/* 聞こえてくるかもしれない言葉（★を先に。語学学習 10b） */}
      <HeardWords place={v.place} />
      <SeenNames ids={v.cards.map((c) => 'card:' + c.card.id)} />
      <button type="button" className="k-answer k-answer--primary" onClick={() => navigate(visitPath(v.place, 'after'))}><Bi phrase k="visit.counter.finished" /></button>
    </>
  );
}

/** 終わったら（作者 11/6 B-7）：一番上に「全部できた」。手続きごとに できた／できなかった。できなかったの理由は任意。
    選んでいない手続きは未確認（日はそのまま。次に開くと「今日の予定」に残る）。行けなかったは日を決め直す */
function After({ v, onAllDone, onSave, onNotWent }: { v: Visit; onAllDone: () => void; onSave: (r: Record<string, CardResult>) => void; onNotWent: () => void }) {
  const { level } = usePrefs();
  const [r, setR] = useState<Record<string, CardResult>>({});
  useFocusTitle('after');
  const pick = (id: string, x: CardResult | null) => setR((m) => { const n = { ...m }; if (x) n[id] = x; else delete n[id]; return n; });
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k="visit.stage.after" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="visit.after.title" /></h1>
      </div>
      <button type="button" className="k-answer k-answer--primary" onClick={onAllDone}><Bi phrase k="visit.out.all_done" /></button>
      <div className="list">
        {v.cards.map((c) => {
          const cur = r[c.card.id];
          const reason = cur && !cur.ok ? cur.reason : undefined;
          return (
            <fieldset key={c.card.id} className="pt-fieldset visitrow">
              <legend className="visitrow__name"><img src={art(c.card.illustration)} alt="" /><Bi t={c.card.title} /></legend>
              <div className="chips">
                <button type="button" className="seg" aria-pressed={cur?.ok === true} onClick={() => pick(c.card.id, cur?.ok === true ? null : { ok: true })}><span aria-hidden="true">✓ </span><One k="visit.row.done" /></button>
                <button type="button" className="seg" aria-pressed={cur?.ok === false} onClick={() => pick(c.card.id, cur?.ok === false ? null : { ok: false })}><span aria-hidden="true">× </span><One k="visit.row.notDone" /></button>
              </div>
              {cur && !cur.ok && (
                <div className="chips" role="group" aria-label={line(ui('visit.row.reason'), level)}>
                  <span className="sub"><One k="visit.row.reason" /></span>
                  {(['need_document', 'wrong_place'] as const).map((x) => (
                    <button key={x} type="button" className="seg" aria-pressed={reason === x} onClick={() => pick(c.card.id, { ok: false, reason: reason === x ? undefined : x })}><One k={('visit.out.' + x) as UiKey} /></button>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <button type="button" className="k-answer" disabled={Object.keys(r).length === 0} onClick={() => onSave(r)}><Bi phrase k="visit.after.save" /></button>
      <button type="button" className="link" onClick={onNotWent}><Bi k="visit.out.not_went" /></button>
    </>
  );
}

export function VisitPage({ place, stage, onLive }: { place: string; stage: VisitStage; onLive: (s: string) => void }) {
  const g = useGuide();
  const { level } = usePrefs();
  const [res, setRes] = useState<Result | null>(null);
  const origin = typeof g.answers['Q-origin'] === 'string' ? (g.answers['Q-origin'] as string) : undefined;
  const v = visitsToday(g.out, DATA().objects, g.objects, origin, g.today).find((x) => x.place === place);
  useFocusTitle('visit:' + place + stage + (res ? res.kind : ''));
  // 途中の段階を残す（開き直すと同じ段階から。6A.1 の出し分けの3）。結果を出したら消す
  useEffect(() => { if (v && !res) void g.setResume(visitPath(place, stage)); }, [place, stage, !!v, !!res]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (o: VisitOutcome, ids: string[]) => {
    await g.setPlans(ids, outcomePatch(o, place, g.today));
    // 行ってきた結果の数（13.4。行く所と結果の種類だけ）
    track('outcome', { x: place, y: o });
    await g.setResume(null);
    setRes({ kind: afterOutcome(o), ids, told: o });
    onLive(line(ui('visit.res.eyebrow'), level));
  };
  // 手続きごとの結果（B-7）。選んでいない手続きは変えない（未確認）
  const save = async (r: Record<string, CardResult>) => {
    for (const [id, x] of Object.entries(r)) await g.setPlans([id], resultPatch(x, place, g.today));
    for (const [id, x] of Object.entries(r)) if (!x.ok) track('outcome', { x: id, y: 'not_done' });
    const all = (v?.cards ?? []).map((c) => c.card.id);
    await g.setResume(null);
    setRes({ kind: 'mixed', done: all.filter((id) => r[id]?.ok === true), notDone: all.filter((id) => r[id]?.ok === false), open: all.filter((id) => !r[id]) });
    onLive(line(ui('visit.res.eyebrow'), level));
  };

  if (res && res.kind === 'mixed') {
    const list = (ids: string[], k: UiKey) => ids.length > 0 && (
      <section className="visitgroup"><h2 className="label"><One phrase k={k} /></h2><ul className="list" role="list">{g.out.cards.filter((c) => ids.includes(c.card.id)).map((c) => <CardRow key={c.card.id} c={c} />)}</ul></section>
    );
    return (
      <ResultView eyebrow="visit.res.eyebrow" title={<Bi k="visit.res.mixed" />} sub={<>{list(res.done, 'visit.res.sumDone')}{list(res.notDone, 'visit.res.sumNotDone')}{list(res.open, 'visit.res.sumOpen')}</>} onNext={() => navigate('/now')} rate={place} />
    );
  }
  if (res) {
    const views = g.out.cards.filter((c) => res.ids.includes(c.card.id));
    if (res.kind === 'done') {
      return <ResultView eyebrow="visit.res.eyebrow" title={<Bi t={withPlace(ui('visit.res.done'), place)} />} sub={<Bi k="visit.res.doneSub" />} onNext={() => navigate('/now')} rate={place} />;
    }
    if (res.kind === 'check') {
      return (
        <ResultView eyebrow="visit.res.eyebrow" title={<Bi k="visit.res.check" />}
          sub={<><ul className="list" role="list">{views.map((c) => <CardRow key={c.card.id} c={c} />)}</ul><Bi k={res.told === 'need_document' ? 'why.visitNeedDocument' : 'why.visitWrongPlace'} /></>}
          onNext={() => navigate('/now')} />
      );
    }
    if (res.kind === 'planned') {
      return <ResultView eyebrow="res.planned.eyebrow" title={<Bi t={fillDate(ui('res.planned.title'), res.day)} />} sub={<Bi k="res.planned.sub" />} onNext={() => navigate('/now')}><AddToCalendar day={res.day} place={place} cardIds={res.ids} /></ResultView>;
    }
    // 行けなかった：日を決め直す（6A.5）
    const first = views[0];
    if (!first) return <Link to="/now" className="link"><Bi k="now.back" /></Link>;
    return <Replan first={first} cards={g.out.cards} today={g.today}
      onPick={async (d, ids) => { await g.setPlans(ids, { planned_on: d }); setRes({ kind: 'planned', day: d, ids }); }} />;
  }

  if (!v) {
    return (
      <>
        <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="visit.none" /></h1></div>
        <div className="links"><Link to="/now" className="link"><Bi k="now.back" /></Link></div>
      </>
    );
  }
  return (
    <>
      {stage === 'before' && <Before v={v} onLive={onLive} />}
      {stage === 'counter' && <Counter v={v} />}
      {stage === 'after' && <After v={v} onAllDone={() => void finish('all_done', v.cards.map((c) => c.card.id))} onSave={(r) => void save(r)} onNotWent={() => void finish('not_went', v.cards.map((c) => c.card.id))} />}
      <div className="links"><Link to="/today" className="link"><Bi k="visit.back" /></Link></div>
    </>
  );
}

function Replan({ first, cards, today, onPick }: { first: CardView; cards: CardView[]; today: string; onPick: (d: string, ids: string[]) => void }) {
  const group = visitGroup(cards, first);
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k="visit.replan.eyebrow" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase t={dayTitle(first)} /></h1>
      </div>
      <DayChoice group={group} today={today} onPick={onPick} onLater={() => navigate('/all')} />
    </>
  );
}
