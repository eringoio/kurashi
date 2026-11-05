/* 病院の案内（SPEC 6A.13。作者の指示 2026-11-05）。/clinic → /clinic/departments → /clinic/before。
   1 どこが困っている？（言葉・からだの絵）→ 2 まず、ここへ（診療科の順番）→ 3 行く前に（探すページ・持ち物・受付の言葉）。
   診断しない・緊急かどうかを判断しない。119・#7119 の帯はいつも同じに出す（こどものときだけ #8000 も）。
   選んだ場所はメモリの中だけ（このモジュールの値）。IndexedDB にも URL にも入れない（9.9・13.4）。 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CLINIC, departmentsFor, emergencyFor, searchParts, type ClinicPart } from '../core/clinic';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { BodyMap, PartButton } from '../ui/BodyMap';
import { fill } from '../ui/guide';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { Speak } from '../ui/Speak';

/* ───── 選んだ場所（メモリの中だけ） ───── */
let picked: string | null = null;
const subs = new Set<() => void>();
const setPicked = (id: string | null) => { picked = id; subs.forEach((f) => f()); };
const usePicked = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => picked);

function Band({ part }: { part: ClinicPart | null }) {
  const { level } = usePrefs();
  return (
    <aside className="k-notice clinic__band" aria-label={line(ui('clinic.bandLabel'), level)}>
      <ul className="plainlist">
        {emergencyFor(CLINIC(), part).map((e) => <li key={e.id} className="clinic__em"><strong className="clinic__num" lang="en">{e.number}</strong><Bi t={e.label} /></li>)}
      </ul>
    </aside>
  );
}

function Step({ n }: { n: number }) {
  return <p className="eyebrow"><One t={fill(ui('clinic.step'), 'step', () => String(n))} /></p>;
}

function Where() {
  const { level } = usePrefs();
  const sel = usePicked();
  const [q, setQ] = useState('');
  const d = CLINIC();
  const part = d.parts.find((p) => p.id === sel) ?? null;
  const hits = searchParts(d, q);
  useFocusTitle('clinic:1');
  return (
    <>
      <Step n={1} />
      <Band part={part} />
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="clinic.h1" /></h1></div>
      <label className="qrfield">
        <span className="label"><One k="clinic.qlbl" /></span>
        <input className="field" type="search" value={q} autoComplete="off" placeholder={line(ui('clinic.qph'), level)} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="chips" aria-live="polite">
        {q.trim() && (hits.length ? hits.map((p) => <PartButton key={p.id} p={p} sel={sel} onPick={setPicked} />) : <p className="sub"><Bi k="clinic.none" /></p>)}
      </div>
      <p className="label"><One k="clinic.body" /></p>
      <BodyMap parts={d.parts} sel={sel} onPick={setPicked} />
      <p className="label"><One k="clinic.notbody" /></p>
      <div className="chips">{d.parts.filter((p) => p.group === 'extra').map((p) => <PartButton key={p.id} p={p} sel={sel} onPick={setPicked} small />)}</div>
      {part && <p className="sub" role="status"><One k="clinic.picked" />：<Bi t={part.name} /></p>}
      <button type="button" className="k-answer k-answer--primary" disabled={!part} onClick={() => navigate('/clinic/departments')}><Bi k="nav.next" /></button>
    </>
  );
}

function Departments({ part }: { part: ClinicPart }) {
  const d = CLINIC();
  const [first, ...rest] = departmentsFor(d, part);
  useFocusTitle('clinic:2');
  return (
    <>
      <Step n={2} />
      <Band part={part} />
      <p className="sub"><One k="clinic.picked" />：<Bi t={part.name} />　<Link to="/clinic" className="link"><Bi k="clinic.change" /></Link></p>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="clinic.h2" /></h1></div>
      <section className="clinic__first" aria-labelledby="clinic-first">
        <p className="label"><span className="clinic__tag">1 <One k="clinic.first" /></span></p>
        <h2 id="clinic-first" className="clinic__dept"><Bi t={first.name} /></h2>
        <p className="sub"><Bi t={first.covers} /></p>
      </section>
      {rest.length > 0 && (
        <section aria-labelledby="clinic-others">
          <h2 id="clinic-others" className="label"><One k="clinic.others" /></h2>
          <ol className="clinic__others" start={2}>
            {rest.map((x, i) => <li key={x.id}><span className="clinic__n" aria-hidden="true">{i + 2}</span><span><span className="clinic__dept"><Bi t={x.name} /></span><span className="sub"><Bi t={x.covers} /></span></span></li>)}
          </ol>
        </section>
      )}
      <p className="sub"><Bi t={d.advice.youdecide} /></p>
      <section className="k-notice clinic__advice" aria-labelledby="clinic-adv">
        <h2 id="clinic-adv" className="label"><Bi t={d.advice.head} /></h2>
        <dl className="clinic__kinds">
          <div><dt><Bi t={d.advice.small.title} /></dt><dd><Bi t={d.advice.small.desc} /></dd></div>
          <div><dt><Bi t={d.advice.big.title} /></dt><dd><Bi t={d.advice.big.desc} /></dd></div>
        </dl>
        <ul className="plainlist">{d.advice.text.map((t, i) => <li key={i}><Bi t={t} /></li>)}</ul>
      </section>
      <button type="button" className="k-answer k-answer--primary" onClick={() => navigate('/clinic/before')}><Bi k="nav.next" /></button>
    </>
  );
}

function Before({ part }: { part: ClinicPart }) {
  const { level } = usePrefs();
  const d = CLINIC();
  const dept = departmentsFor(d, part)[0];
  useFocusTitle('clinic:3');
  return (
    <>
      <Step n={3} />
      <Band part={part} />
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="clinic.h3" /></h1></div>
      <section aria-labelledby="clinic-find">
        <h2 id="clinic-find" className="label"><One k="clinic.findH" /></h2>
        <ul className="list" role="list">
          {d.links.map((l) => (
            <li key={l.id}>
              <a className="k-answer clinic__link" href={l.url} target="_blank" rel="noopener noreferrer">
                <Bi t={fill(l.title, 'DEPT', (_lv, id) => dept.name[id] ?? dept.name.ja)} />
                {l.desc && <span className="sub"><One t={l.desc} /></span>}
                <span className="sr-only"><One k="clinic.newTab" /></span>
              </a>
            </li>
          ))}
        </ul>
        <p className="sub"><Bi t={d.callNote.text} /></p>
      </section>
      <section aria-labelledby="clinic-bring">
        <h2 id="clinic-bring" className="label"><One k="clinic.bringH" /></h2>
        <ul className="clinic__bring" role="list">
          {d.bring.map((b) => (
            <li key={b.id} className="k-check k-check--fixed">
              <img src={art(b.illustration)} alt="" />
              <span><Bi t={b.title} />{b.desc && <span className="sub"><One t={b.desc} /></span>}</span>
            </li>
          ))}
        </ul>
        <Link to="/c/nagoya-kokuho-kanyu" className="link"><Bi k="clinic.noins" /></Link>
      </section>
      <section aria-labelledby="clinic-say">
        <h2 id="clinic-say" className="label"><One k="clinic.sayH" /></h2>
        {[{ id: part.id, say: part.say }, ...d.phrases].map((p) => {
          const mean = level.kind === 'ja' ? null : line(p.say, level);
          return (
            <div key={p.id} className="k-counter">
              <p className="k-counter__ja" lang="ja"><Ruby s={p.say.ja} /></p>
              {mean && <p className="k-counter__mean" lang={level.kind === 'ja_easy' ? 'ja' : level.lang}>{mean}</p>}
              <Speak ja={p.say.ja} />
            </div>
          );
        })}
      </section>
      <p className="sub"><Bi k="clinic.check" /></p>
    </>
  );
}

export function ClinicPage({ step }: { step: '' | 'departments' | 'before' }) {
  const sel = usePicked();
  const part = CLINIC().parts.find((p) => p.id === sel) ?? null;
  // 選んでいないまま 2・3 を開いたら、1 にもどす
  useEffect(() => { if (step && !part) { history.replaceState(null, '', '/clinic'); dispatchEvent(new PopStateEvent('popstate')); } }, [step, part]);
  let body: React.ReactNode;
  if (!step) body = <Where />;
  else if (!part) body = null;
  else body = step === 'departments' ? <Departments part={part} /> : <Before part={part} />;
  return (
    <>
      {body}
      <div className="links"><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}
