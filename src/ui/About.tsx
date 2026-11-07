/* 「あなたについて」の1問（入口の最初）・答えたあとの1行・見直す画面（/about）。core/about.ts */
import { useEffect } from 'react';
import { ABOUT_SKIPPED, aboutAskable } from '../core/about';
import { DATA } from '../core/data';
import type { Question, Value } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { Answers, WhyAsked } from './guide';
import { Link, useFocusTitle, usePath } from './router';

/** 最後の1問に答えた道（その画面にいるあいだだけ、上に1行を出す） */
let doneAt: string | null = null;

const profile = (v: ReturnType<typeof usePrefs>['vault']) => Object.fromEntries(v.entries('profile')) as Record<string, Value>;

/** 入口の最初：あなたについての1問。onAnswer は入口の書き方（どちらも profile に入る） */
export function AboutStep({ q, onAnswer }: { q: Question; onAnswer: (v: Value) => void | Promise<void> }) {
  const { vault: v } = usePrefs();
  const path = usePath();
  const pick = async (val: Value) => {
    const after = { ...profile(v), [q.id]: val };
    const left = aboutAskable(DATA().questions, after).some((x) => after[x.id] === undefined);
    if (!left) doneAt = path;
    await onAnswer(val);
  };
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k="about.eyebrow" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase t={q.text} /></h1>
      </div>
      {/* 保存の帯が出ているときは、帯に同じリンクがあるので出さない */}
      <p className="sub"><Bi k="about.note" />{!v.shouldAskConsent() && <> <Link to="/info/privacy" className="link"><Bi k="privacy.link" /></Link></>}</p>
      <Answers q={q} onPick={(val) => void pick(val)} />
      <WhyAsked t={q.why_asked} />
      <div className="links">
        <button type="button" className="link" onClick={() => void v.put('settings', ABOUT_SKIPPED, true)}><Bi k="about.skip" /></button>
      </div>
    </>
  );
}

/** 答えの短い文（選んだ選択肢の名前を「・」でつなぐ） */
export function AboutSummary() {
  const { vault: v } = usePrefs();
  const a = profile(v);
  const parts = aboutAskable(DATA().questions, a).filter((q) => a[q.id] !== undefined && a[q.id] !== 'unknown')
    .map((q) => q.options.find((o) => o.value === a[q.id])?.label).filter(Boolean);
  if (!parts.length) return <One k="about.none" />;
  return <>{parts.map((t, i) => <span key={i}>{i > 0 && '・'}<One t={t!} /></span>)}</>;
}

/** 答え終わった次の画面の上の1行（6A.5 の形。App が本文の上に置く）。道が変わったら消える */
export function AboutDoneLine() {
  const path = usePath();
  useEffect(() => () => { doneAt = null; }, [path]);
  if (doneAt !== path) return null;
  return (
    <div className="k-change k-change--on">
      <p role="status" className="k-change__line"><span aria-hidden="true">✓ </span><One k="about.eyebrow" />：<AboutSummary /></p>
      <div className="links k-change__acts"><Link to="/about" className="link"><Bi k="about.change" /></Link></div>
    </div>
  );
}

/** /about：あなたについての答えを見て、変える */
export function AboutPage() {
  const { vault: v } = usePrefs();
  useFocusTitle('about');
  const a = profile(v);
  const qs = aboutAskable(DATA().questions, a);
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="about.eyebrow" /></h1></div>
      <p className="sub"><Bi k="about.note" /> <Link to="/info/privacy" className="link"><Bi k="privacy.link" /></Link></p>
      {qs.map((q) => (
        <section key={q.id} className="qblock" aria-labelledby={'q-' + q.id}>
          <h2 id={'q-' + q.id} className="qblock__title"><Bi phrase t={q.text} /></h2>
          <div className="list">
            {q.options.map((o) => (
              <button key={String(o.value)} type="button" className={'k-answer' + (o.small ? ' k-answer--small' : '')} aria-pressed={a[q.id] === o.value}
                onClick={() => void v.put('profile', q.id, o.value)}>
                <Bi phrase t={o.label} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
