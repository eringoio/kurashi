/* 付き添い（SPEC 6A.6）：約束の日に、行く所ごとに「行く前 → 窓口で → 終わったら」。
   判定は src/core/accompany.ts。ここは出すだけ。窓口で言うことは、カードの正式名と strings.json の決まった文から作る（AI で作らない）。
   段階は resume に残す（同意のあと。開き直すと同じ段階から）。URL には行く所の種類と段階だけ（13.4）。 */
import { useEffect, useState } from 'react';
import { afterOutcome, outcomePatch, visitPath, visitsToday, VISIT_OUTCOMES, type Visit, type VisitOutcome, type VisitStage } from '../core/accompany';
import { DATA } from '../core/data';
import type { CardView } from '../core/engine';
import type { Card, Text } from '../core/schema';
import { visitGroup } from '../core/visit';
import { useGuide } from '../guide/useGuide';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { line, show, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CardRow, DayChoice, dayTitle, fill, fillDate, ResultView } from '../ui/guide';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { Speak } from '../ui/Speak';

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

type Result = { kind: 'done' | 'check' | 'replan'; ids: string[]; told?: VisitOutcome } | { kind: 'planned'; day: string; ids: string[] };

function Before({ v, onLive }: { v: Visit; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const held = v.bring.filter((b) => b.held);
  const missing = v.bring.filter((b) => !b.held);
  return (
    <>
      <div className="art" aria-hidden="true">{v.cards.slice(0, 3).map((c) => <img key={c.card.id} src={art(c.card.illustration)} alt="" />)}<img src={art('box')} alt="" /></div>
      <div className="head">
        <p className="eyebrow"><One k="visit.stage.before" />　<One t={ui(('place.' + v.place) as UiKey) ?? { ja: v.place }} /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi k="visit.before.title" /></h1>
      </div>
      <section aria-labelledby="visit-items">
        <h2 id="visit-items" className="label"><One k="visit.items" /></h2>
        {v.ordered
          ? <ol className="list" role="list">{v.cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ol>
          : <ul className="list" role="list">{v.cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>}
        <p className="sub"><Bi k={v.ordered ? 'visit.ordered' : 'visit.unordered'} /></p>
      </section>
      <section aria-labelledby="visit-bring">
        <h2 id="visit-bring" className="label"><One k="visit.bring.label" /></h2>
        {held.length === 0 && <p className="sub"><Bi k="visit.bring.none" /></p>}
        <div className="list">
          {held.map((b) => {
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
        </div>
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
  const { level } = usePrefs();
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k="visit.stage.counter" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi k="visit.counter.title" /></h1>
      </div>
      {v.cards.map((c, i) => {
        const ph = counterPhrase(c.card);
        const mean = level.kind === 'ja' ? null : show(ph as LocalizedText, level);
        return (
          <section key={c.card.id} className="k-counter" aria-labelledby={'say-' + i}>
            <h2 id={'say-' + i} className="label"><One k="visit.counter.say" /></h2>
            <p className="k-counter__ja" lang="ja"><Ruby s={ph.ja} /></p>
            <p className="k-counter__name" lang="ja"><span className="sr-only"><One k="visit.counter.official" />：</span><Ruby s={`{${c.card.official_name.ja}|${c.card.official_name.reading}}`} /></p>
            {mean && !mean.fallback && <p className="k-counter__mean" lang={mean.mainLang}><Ruby s={mean.main} /></p>}
            <Speak ja={ph.ja} />
          </section>
        );
      })}
      <button type="button" className="k-answer k-answer--primary" onClick={() => navigate(visitPath(v.place, 'after'))}><Bi k="visit.counter.finished" /></button>
    </>
  );
}

function After({ v, onDone }: { v: Visit; onDone: (o: VisitOutcome, ids: string[]) => void }) {
  const [which, setWhich] = useState<VisitOutcome | null>(null);
  const [sel, setSel] = useState<Set<string>>(() => new Set(v.cards.map((c) => c.card.id)));
  useFocusTitle('after:' + (which ?? ''));
  if (which) {
    return (
      <>
        <div className="head">
          <p className="eyebrow"><One k={('visit.out.' + which) as UiKey} /></p>
          <h1 id="screen-title" tabIndex={-1}><Bi k="visit.which.title" /></h1>
        </div>
        <div className="list">
          {v.cards.map((c) => {
            const on = sel.has(c.card.id);
            return (
              <button key={c.card.id} type="button" className="k-check" aria-pressed={on}
                onClick={() => setSel((s) => { const n = new Set(s); if (on) n.delete(c.card.id); else n.add(c.card.id); return n; })}>
                <span className="k-check__box" aria-hidden="true">{on ? '✓' : ''}</span>
                <img src={art(c.card.illustration)} alt="" />
                <Bi t={c.card.title} />
              </button>
            );
          })}
        </div>
        <p className="sub"><Bi k="visit.which.note" /></p>
        <button type="button" className="k-answer k-answer--primary" disabled={sel.size === 0} onClick={() => onDone(which, [...sel])}><Bi k="visit.which.save" /></button>
      </>
    );
  }
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k="visit.stage.after" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi k="visit.after.title" /></h1>
      </div>
      <div className="list">
        {VISIT_OUTCOMES.map((o) => (
          <button key={o} type="button" className={'k-answer' + (o === 'all_done' ? ' k-answer--primary' : '')}
            onClick={() => {
              const all = v.cards.map((c) => c.card.id);
              // 別の書類・ここではない：項目が2つ以上なら、どれで言われたかを聞く
              if ((o === 'need_document' || o === 'wrong_place') && all.length > 1) setWhich(o);
              else onDone(o, all);
            }}>
            <Bi k={('visit.out.' + o) as UiKey} />
          </button>
        ))}
      </div>
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
    const rest = (v?.cards ?? []).map((c) => c.card.id).filter((id) => !ids.includes(id));
    await g.setPlans(ids, outcomePatch(o, place, g.today));
    // どれで言われたかを選んだとき、選ばなかった項目は済んだ
    if (rest.length) await g.setPlans(rest, outcomePatch('all_done', place, g.today));
    await g.setResume(null);
    setRes({ kind: afterOutcome(o), ids, told: o });
    onLive(line(ui('visit.res.eyebrow'), level));
  };

  if (res) {
    const views = g.out.cards.filter((c) => res.ids.includes(c.card.id));
    if (res.kind === 'done') {
      return <ResultView eyebrow="visit.res.eyebrow" title={<Bi t={withPlace(ui('visit.res.done'), place)} />} sub={<Bi k="visit.res.doneSub" />} onNext={() => navigate('/now')} />;
    }
    if (res.kind === 'check') {
      return (
        <ResultView eyebrow="visit.res.eyebrow" title={<Bi k="visit.res.check" />}
          sub={<><ul className="list" role="list">{views.map((c) => <CardRow key={c.card.id} c={c} />)}</ul><Bi k={res.told === 'need_document' ? 'why.visitNeedDocument' : 'why.visitWrongPlace'} /></>}
          onNext={() => navigate('/now')} />
      );
    }
    if (res.kind === 'planned') {
      return <ResultView eyebrow="res.planned.eyebrow" title={<Bi t={fillDate(ui('res.planned.title'), res.day)} />} sub={<Bi k="res.planned.sub" />} onNext={() => navigate('/now')} />;
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
        <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="visit.none" /></h1></div>
        <div className="links"><Link to="/now" className="link"><Bi k="now.back" /></Link></div>
      </>
    );
  }
  return (
    <>
      {stage === 'before' && <Before v={v} onLive={onLive} />}
      {stage === 'counter' && <Counter v={v} />}
      {stage === 'after' && <After v={v} onDone={finish} />}
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
        <h1 id="screen-title" tabIndex={-1}><Bi t={dayTitle(first)} /></h1>
      </div>
      <DayChoice group={group} today={today} onPick={onPick} onLater={() => navigate('/all')} />
    </>
  );
}
