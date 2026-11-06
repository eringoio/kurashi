/* 病院の案内（SPEC 6A.13。作者の指示 2026-11-05）。/clinic → /clinic/departments → /clinic/before。
   1 どこが困っている？（言葉・からだの絵）→ 2 まず、ここへ（診療科の順番）→ 3 行く前に（探すページ・持ち物・受付の言葉）。
   診断しない・緊急かどうかを判断しない。119・#7119 の帯はいつも同じに出す（こどものときだけ #8000 も）。
   選んだ場所はメモリの中だけ（このモジュールの値）。IndexedDB にも URL にも入れない（9.9・13.4）。 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CLINIC, departmentsFor, emergencyFor, searchParts, type ClinicDepartment, type ClinicPart } from '../core/clinic';
import { PhoneIcon } from '../ui/icons';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { BodyMap, PartButton } from '../ui/BodyMap';
import { fill } from '../ui/guide';
import { Link, navigate, useFocusTitle } from '../ui/router';
import { Speak } from '../ui/Speak';

/** 診療科の案内を出すか（03_MEDICAL 6章：大会ルールの確認が来るまで、止められるようにする）。VITE_CLINIC_DEPARTMENTS=off で止める。
    止めたときは、緊急の連絡先・公式の探すページ・持ち物・受付の言葉だけの1画面になる */
export const CLINIC_DEPARTMENTS_ON = import.meta.env.VITE_CLINIC_DEPARTMENTS !== 'off';

/* ───── 選んだ場所（メモリの中だけ） ───── */
let picked: string | null = null;
const subs = new Set<() => void>();
const setPicked = (id: string | null) => { picked = id; subs.forEach((f) => f()); };
const usePicked = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => picked);

function Band({ part }: { part: ClinicPart | null }) {
  const guide = CLINIC().links.find((l) => l.id === 'fdma-guide');
  const { level } = usePrefs();
  const list = emergencyFor(CLINIC(), part);
  return (
    // 白い背景・細い枠・番号＋短い名前の小さな帯（A-5a。作者 11/7 K-1：くわしくは要らない。枠の中だけで収める）
    <aside className="clinic__band" aria-label={line(ui('clinic.bandLabel'), level)}>
      <ul className="clinic__tels" role="list">
        {/* 押すと電話をかける（A-7）。# は tel: の中で %23 にする */}
        {list.map((e) => (
          <li key={e.id}>
            <a className="clinic__tel" href={'tel:' + encodeURIComponent(e.number)}>
              <PhoneIcon />
              <span className="sr-only"><One k="clinic.call" /></span>
              <strong className="clinic__num" lang="en">{e.number}</strong>
              <span className="clinic__short"><One t={e.short} /></span>
            </a>
          </li>
        ))}
      </ul>
      <div className="clinic__morerow">
        {/* 救急車の呼び方（消防庁の多言語のガイド）。どの場所を選んでも見られる（03_MEDICAL 2章B） */}
        {guide && (
          <a className="link" href={guide.url} target="_blank" rel="noopener noreferrer">
            <One t={guide.title} /><span className="sr-only"><One k="clinic.newTab" /></span>
          </a>
        )}
      </div>
    </aside>
  );
}

/** 公式のページへのリンク（新しいタブ）。{DEPT} は、まず行く診療科の名前 */
function LinkList({ ids, dept }: { ids: string[]; dept: ClinicDepartment | null }) {
  const links = ids.map((id) => CLINIC().links.find((l) => l.id === id)!).filter(Boolean);
  return (
    // 公式のページは、カードではなく外部リンクの一覧（作者 11/7 K-4：診療科のカードと同じ見た目にしない）
    <ul className="clinic__links" role="list">
      {links.map((l) => (
        <li key={l.id}>
          <a className="link clinic__ext" href={l.url} target="_blank" rel="noopener noreferrer">
            <Bi t={fill(l.title, 'DEPT', (_lv, id) => (dept ? dept.name[id] ?? dept.name.ja : ui('clinic.anyDept')[id] ?? ui('clinic.anyDept').ja) as string)} />
            <span aria-hidden="true" className="clinic__extmark">↗</span>
            <span className="sr-only"><One k="clinic.newTab" /></span>
          </a>
          {l.desc && <span className="sub"><One t={l.desc} /></span>}
        </li>
      ))}
    </ul>
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
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="clinic.h1" /></h1><p className="sub"><Bi phrase k="clinic.lead" /></p></div>
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
      <button type="button" className="k-answer k-answer--primary" disabled={!part} onClick={() => navigate('/clinic/departments')}><Bi phrase k="nav.next" /></button>
    </>
  );
}

function Departments({ part }: { part: ClinicPart }) {
  const d = CLINIC();
  const depts = departmentsFor(d, part);
  const first = depts[0];
  useFocusTitle('clinic:2');
  return (
    <>
      <Step n={2} />
      <Band part={part} />
      <p className="sub"><One k="clinic.picked" />：<Bi t={part.name} />　<Link to="/clinic" className="link"><Bi k="clinic.change" /></Link></p>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="clinic.h2" /></h1></div>
      <p className="sub"><Bi k="clinic.notDx" /></p>
      {/* 順位を付けない（「まず」「1・2」は判断に読める。03_MEDICAL 2章A） */}
      <ul className="clinic__depts" role="list">
        {depts.map((x) => <li key={x.id}><span className="clinic__dept"><Bi t={x.name} /></span><span className="sub"><Bi t={x.covers} /></span></li>)}
      </ul>
      {part.id !== 'child' && d.advice.child && <p className="sub"><Bi t={d.advice.child} /></p>}
      {/* 病院を探す公式のページ（リンク。作者 11/7 K-3・K-4：料金の案内はしない） */}
      <section aria-labelledby="clinic-official">
        <h2 id="clinic-official" className="label"><One phrase k="clinic.officialH" /></h2>
        <LinkList ids={d.advice.links} dept={first} />
      </section>
      <button type="button" className="k-answer k-answer--primary" onClick={() => navigate('/clinic/before')}><Bi phrase k="nav.next" /></button>
    </>
  );
}

function Before({ part }: { part: ClinicPart | null }) {
  const { level } = usePrefs();
  const d = CLINIC();
  const dept = part ? departmentsFor(d, part)[0] : null;
  useFocusTitle('clinic:3');
  return (
    <>
      {part && <Step n={3} />}
      <Band part={part} />
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k={part ? 'clinic.h3' : 'clinic.only.h1'} /></h1></div>
      <section aria-labelledby="clinic-find">
        <h2 id="clinic-find" className="label"><One phrase k="clinic.findH" /></h2>
        <LinkList ids={d.links.filter((l) => l.id !== 'fdma-guide').map((l) => l.id)} dept={dept} />
        <p className="sub"><Bi t={d.callNote.text} /></p>
      </section>
      <section aria-labelledby="clinic-bring">
        <h2 id="clinic-bring" className="label"><One phrase k="clinic.bringH" /></h2>
        <p className="sub"><Bi k="clinic.bringNote" /></p>
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
        <h2 id="clinic-say" className="label"><One phrase k="clinic.sayH" /></h2>
        {[...(part ? [{ id: part.id, say: part.say }] : []), ...d.phrases].map((p) => {
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
  useEffect(() => { if (CLINIC_DEPARTMENTS_ON && step && !part) { history.replaceState(null, '', '/clinic'); dispatchEvent(new PopStateEvent('popstate')); } }, [step, part]);
  let body: React.ReactNode;
  if (!CLINIC_DEPARTMENTS_ON) body = <Before part={null} />;
  else if (!step) body = <Where />;
  else if (!part) body = null;
  else body = step === 'departments' ? <Departments part={part} /> : <Before part={part} />;
  return (
    <>
      {body}
      <div className="links"><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}
