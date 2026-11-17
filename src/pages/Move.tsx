/* 道のり（SPEC 6A.2）と、持ち物・確かめ（6A.3）、最初の質問（8.1）。1画面に1つの判断。
   途中の手順は resume に入れ、開き直したときに続けられるようにする（6A.1 の出し分けの3・4）。 */
import { useEffect, useState } from 'react';
import { DATA } from '../core/data';
import type { Value } from '../core/schema';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Answers, WhyAsked } from '../ui/guide';
import { Link, navigate, takeHandoff, useFocusTitle } from '../ui/router';
import { eventForOrigin, hasEntryExtras, noChangeEvents } from './moveEntry';
import { ABOUT_SKIPPED, aboutNext } from '../core/about';
import { AboutStep } from '../ui/About';
import { isShortStay, SHORT_STAY_PATH } from '../core/shortStay';

const q = (id: string) => DATA().questions.find((x) => x.id === id)!;

function Head({ eyebrow, children }: { eyebrow?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="head">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 id="screen-title" tabIndex={-1}>{children}</h1>
    </div>
  );
}

/** 最初の質問が終わったら：「いま」へ（手続きの質問 → 1回だけ全体 → いまの1つ。6A.4 v0.5.31） */
async function finish(g: ReturnType<typeof useGuide>) {
  await g.setResume(null);
  // v0.5.31：手続きの質問を先にまとめて聞く。質問が無ければ「いま」が1回だけ全体を開く（Plan.tsx の Now）
  // 履歴に積まない：もどるでこの画面に来ても、すぐ /now に積み直して閉じこめない（Fable C-1）
  navigate('/now', undefined, { replace: true });
}

export function Move({ step }: { step: string }) {
  const g = useGuide();
  const { vault: v } = usePrefs();
  const skipped = v.get('settings', ABOUT_SKIPPED) === true;
  useFocusTitle('move:' + step + (step === 'from' ? ':' + (aboutNext(DATA().questions, g.answers)?.id ?? '') : ''));
  useEffect(() => { void g.setResume(step === 'nochange' || step === 'unsure' ? null : '/move' + (step ? '/' + step : '')); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const answerAndGo = async (qid: string, v: Value, to: string) => { await g.answer(qid, v); navigate(to); };
  // 出発地を選んだとき。出発地に対応するイベントがあれば（名古屋市の中・名古屋市から出ていく）、共通の /e/{id} へ。イベントの名前では分岐しない
  const pickOrigin = (v: Value) => {
    const ev = eventForOrigin(String(v));
    if (ev) { void g.setResume(null); navigate('/e/' + ev.id); return; }
    const built = DATA().flow.built_origins;
    const to = v === 'out_of_area' ? '/info/out-of-scope' : built.includes(String(v)) ? '/move/objects' : '/info/coming-soon';
    if (to !== '/move/objects') void g.setResume(null);
    void answerAndGo('Q-origin', v, to);
  };
  // 住まいの「住所の届出」から来たとき（kaizen sumai 5）：あなたについての質問のあと、選んだ出発地で進む。
  // 前に別の出発地を答えていれば書き換えず、いつもの質問を出す。もどるで、この質問にもどって選び直せる
  const aboutId = step === 'from' && !skipped ? aboutNext(DATA().questions, g.answers)?.id : undefined;
  useEffect(() => {
    if (step !== 'from' || aboutId) return;
    const v = takeHandoff('/move/from')?.['Q-origin'];
    if (v === undefined || !q('Q-origin').options.some((o) => o.value === v)) return;
    const cur = g.answers['Q-origin'];
    if (cur === undefined || cur === v) pickOrigin(v);
  }, [step, aboutId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 在留資格か住民登録の形が短期滞在なら、国籍・立場・年齢・出発地を聞かずに専用の画面へ（R-10）
  const shortStay = step === 'from' && isShortStay(g.answers);
  useEffect(() => { if (shortStay) { void g.setResume(null); navigate(SHORT_STAY_PATH, undefined, { replace: true }); } }, [shortStay]); // eslint-disable-line react-hooks/exhaustive-deps
  if (shortStay) return null;

  if (step === '') {
    return (
      <>
        <div className="art" aria-hidden="true"><img src={art('homemove')} alt="" /><img src={art('homecheck')} alt="" /></div>
        <Head eyebrow={<One k="move.step" />}><Bi phrase k="move.changed" /></Head>
        <div className="list">
          <button type="button" className="k-answer" onClick={() => navigate('/move/from')}><img src={art('homemove')} alt="" /><Bi phrase k="move.yes" /></button>
          <button type="button" className="k-answer" onClick={() => { void g.setResume(null); navigate(noChangeEvents().length ? '/move/nochange' : '/info/coming-soon'); }}><img src={art('homecheck')} alt="" /><Bi phrase k="move.no" /></button>
          <button type="button" className="k-answer" onClick={() => { void g.setResume(null); navigate(hasEntryExtras() ? '/move/unsure' : '/info/coming-soon'); }}><img src={art('ask')} alt="" /><Bi phrase k="move.unknown" /></button>
        </div>
      </>
    );
  }

  if (step === 'from') {
    // あなたについて（国籍など）を先にまとめて聞く（2026-11-07）。答えずに進んだら聞かない
    const about = !skipped ? aboutNext(DATA().questions, g.answers) : undefined;
    if (about) return <AboutStep key={about.id} q={about} onAnswer={(val) => g.answer(about.id, val)} />;
    const qo = q('Q-origin');
    return (
      <>
        <Head eyebrow={<One k="move.step" />}><Bi phrase t={qo.text} /></Head>
        <QuestionBlockNoTitle>
          {qo.options.map((o) => (
            <button key={String(o.value)} type="button" className={'k-answer' + (o.small ? ' k-answer--small' : '')}
              onClick={() => pickOrigin(o.value)}>
              {o.icon && <img src={art(o.icon)} alt="" />}
              <Bi phrase t={o.label} />
            </button>
          ))}
        </QuestionBlockNoTitle>
      </>
    );
  }

  if (step === 'objects') return <Objects />;
  if (step === 'nochange') return <NoChange />;
  if (step === 'unsure') return <Unsure />;

  if (step === 'basis') {
    const qb = q('Q-residence-basis');
    return (
      <>
        <Head eyebrow={<One k="q.eyebrow" />}><Bi phrase t={qb.text} /></Head>
        <QuestionBlockNoTitle>
          {/* 日本以外の国籍と答えた人には「日本国籍」を出さない（日本国籍なら、この質問は出ない。implied） */}
          {qb.options.filter((o) => !(o.value === 'japanese' && g.answers['Q-nationality'] === 'foreign')).map((o) => (
            <button key={String(o.value)} type="button" className="k-answer" onClick={() => void answerAndGo('Q-residence-basis', o.value, o.value === 'short_stay' ? SHORT_STAY_PATH : '/move/q')}>
              <Bi phrase t={o.label} />
            </button>
          ))}
        </QuestionBlockNoTitle>
        <WhyAsked t={qb.why_asked} />
      </>
    );
  }

  if (step === 'check') {
    const qc = q('Q-zairyu-back-address');
    return (
      <>
        <div className="art" aria-hidden="true"><img src={art('cardback')} alt="" className="art--big" /></div>
        <Head eyebrow={<One k="check.eyebrow" />}><Bi phrase t={qc.text} /></Head>
        <p className="sub"><Bi t={qc.why_asked} /></p>
        <QuestionBlockNoTitle>
          {qc.options.map((o) => (
            <button key={String(o.value)} type="button" className="k-answer" onClick={() => void answerAndGo('Q-zairyu-back-address', o.value, '/move/q')}>
              <Bi phrase t={o.label} />
            </button>
          ))}
        </QuestionBlockNoTitle>
      </>
    );
  }

  return <Upfront />;
}

/** 残りの最初の質問を1つずつ（質問バンクの順。範囲外になったら、そこで終える。8.3） */
function Upfront() {
  const g = useGuide();
  const next = g.out.upfront.find((x) => x.id !== 'Q-origin');
  const out = g.out.scope === 'F';
  useEffect(() => {
    if (out) { void g.setResume(null); navigate(isShortStay(g.answers) ? SHORT_STAY_PATH : '/info/out-of-scope'); }
    else if (!next) void finish(g);
  }, [out, next]); // eslint-disable-line react-hooks/exhaustive-deps
  if (out || !next) return null;
  return (
    <>
      <Head eyebrow={<One k="q.eyebrow" />}><Bi phrase t={next.text} /></Head>
      <Answers q={next} onPick={(v) => void g.answer(next.id, v)} />
      <WhyAsked t={next.why_asked} />
    </>
  );
}

function QuestionBlockNoTitle({ children }: { children: React.ReactNode }) {
  return <div className="list">{children}</div>;
}

function Objects() {
  const g = useGuide();
  const origin = String(g.answers['Q-origin'] ?? 'abroad');
  const nat = typeof g.answers['Q-nationality'] === 'string' ? (g.answers['Q-nationality'] as string) : undefined;
  const list = DATA().objects.filter((o) => o.show_for.includes(origin) && !(nat && o.not_for_nationality?.includes(nat)));
  // 答えていない物は、assume_held_unless_nationality があれば「持っている」から始める（日本国籍でない人のパスポート。作者 11/8）
  const [held, setHeld] = useState<Record<string, boolean>>(() => Object.fromEntries(list.map((o) => [o.id, o.id in g.objects ? !!g.objects[o.id] : !!o.assume_held_unless_nationality && !(nat && o.assume_held_unless_nationality.includes(nat))])));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { level } = usePrefs();
  const L = (k: UiKey) => line(ui(k), level);
  const next = async () => {
    await g.setObjects(held);
    const card = list.find((o) => o.check_question);
    // 在留カードがない人には、住民登録の根拠を1問だけ聞く（6A.2）。ある人には裏の住所を確かめる（6A.3）
    // 住民登録の形は、在留資格などで決まっていれば聞かない（同じことを2回聞かない。R-10）。短期滞在なら専用の画面
    if (isShortStay(g.answers)) navigate(SHORT_STAY_PATH, undefined, { replace: true });
    else if (origin === 'abroad' && !held['zairyu-card'] && g.answers['Q-nationality'] !== 'japanese' && g.out.facts.get('residence_basis') === undefined) navigate('/move/basis');
    else if (card && held[card.id]) navigate('/move/check');
    else navigate('/move/q');
  };
  return (
    <>
      <div className="head">
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="objects.title" /></h1>
      </div>
      <p className="sub"><Bi k="objects.note" /></p>
      <ul className="k-tiles" role="list">
        {list.map((o) => (
          <li key={o.id} className="k-tile-wrap">
            <button type="button" className="k-tile" aria-pressed={held[o.id]} onClick={() => setHeld({ ...held, [o.id]: !held[o.id] })}>
              <img src={art(o.illustration + (held[o.id] ? '' : '-dim'))} alt="" width={52} height={52} />
              <span className="k-tile__label"><Bi t={o.title} /></span>
              <span className="k-tile__mark" aria-hidden="true">{held[o.id] ? <>✓ <One k="objects.held" /></> : ' '}</span>
            </button>
            {/* 使い道は、？を押したときだけ出す（文字を減らす。タイルの中にボタンを入れないので、隣に置く） */}
            <button type="button" className="k-tile__what" aria-expanded={!!open[o.id]} aria-controls={'what-' + o.id}
              aria-label={L('objects.what') + '：' + line(o.title, level)} onClick={() => setOpen({ ...open, [o.id]: !open[o.id] })}>
              <span aria-hidden="true">？</span>
            </button>
            <p id={'what-' + o.id} className="k-tile__purpose" hidden={!open[o.id]}><Bi t={o.purpose} /></p>
          </li>
        ))}
      </ul>
      <button type="button" className="k-answer k-answer--primary" onClick={() => void next()}><Bi phrase k="objects.next" /></button>
    </>
  );
}

/** 「住所は変わっていない」：住所が変わらなくても使える案内（入口のメニューのイベント）を並べる */
function NoChange() {
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('homecheck')} alt="" /></div>
      <Head eyebrow={<One k="move.step" />}><Bi phrase k="move.nochange.title" /></Head>
      <ul className="list" role="list">
        {noChangeEvents().map((e) => (
          <li key={e.id}>
            <Link to={'/e/' + e.id} className="k-answer"><img src={art(e.illustration)} alt="" /><Bi phrase t={e.title} /></Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 「わからない」：住民票の住所と、いま住んでいる所が違うかを確かめる説明。区役所での確認（要確認）へつなぐ */
function Unsure() {
  const extra = noChangeEvents().length > 0;
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('ask')} alt="" /></div>
      <Head eyebrow={<One k="move.step" />}><Bi phrase k="move.unsure.title" /></Head>
      <div className="prose">
        <p><Bi k="move.unsure.p1" /></p>
        <p><Bi k="move.unsure.p2" /></p>
        <p><Bi k="move.unsure.p3" /></p>
      </div>
      <div className="list">
        <button type="button" className="k-answer" onClick={() => navigate('/move/from')}><img src={art('homemove')} alt="" /><Bi phrase k="move.unsure.differ" /></button>
        <button type="button" className="k-answer" onClick={() => navigate(extra ? '/move/nochange' : '/info/coming-soon')}><img src={art('homecheck')} alt="" /><Bi phrase k="move.unsure.same" /></button>
      </div>
      <p><a className="link" href="https://www.city.nagoya.jp/kurashi/todokede/1007833/1007834/1007835.html" target="_blank" rel="noopener noreferrer"><Bi k="move.unsure.link" /></a></p>
    </>
  );
}
